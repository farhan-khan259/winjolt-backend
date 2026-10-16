const mongoose = require("mongoose");
const Stripe = require("stripe");
const env = require("../config/env");
const { Order, Reservation, Competition, PaymentEvent, Outbox } = require("../models");
const { assert } = require("../utils/errors");
const { opaqueId, sha256 } = require("../utils/crypto");
const { canEnter } = require("./eligibilityService");
const { issueTickets } = require("./ticketService");
const { allocateForTicket } = require("./instantService");
const { audit } = require("./auditService");

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

async function createOrder({ req, reservationId, idempotencyKey }) {
  assert(idempotencyKey, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
  const prior = await Order.findOne({ user: req.user._id, idempotencyKey });
  if (prior) return prior;
  const reservation = await Reservation.findOne({ publicId: reservationId, user: req.user._id, state: "ACTIVE" });
  assert(reservation && reservation.expiresAt > new Date(), 410, "RESERVATION_EXPIRED", "Your ticket reservation has expired.");
  const competition = await Competition.findById(reservation.competition);
  const eligibility = canEnter(req.user, competition, "PAID");
  assert(eligibility.allowed, 422, "NOT_ELIGIBLE", "Checkout is unavailable.", eligibility.reasons);
  const amountMinor = competition.priceMinor * reservation.numbers.length;
  const order = await Order.create({ publicId: opaqueId("ord"), user: req.user._id, competition: competition._id, reservation: reservation._id, lineItems: [{ description: competition.title, quantity: reservation.numbers.length, unitAmountMinor: competition.priceMinor, totalMinor: amountMinor }], amountMinor, currency: competition.currency, status: "CREATED", provider: env.paymentProvider, idempotencyKey, timeline: [{ status: "CREATED", at: new Date() }] });
  if (env.paymentProvider === "stripe") {
    assert(stripe, 503, "PAYMENT_PROVIDER_UNAVAILABLE", "Payment provider configuration is incomplete.");
    const checkout = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price_data: { currency: competition.currency.toLowerCase(), product_data: { name: `${competition.title} entries` }, unit_amount: competition.priceMinor }, quantity: reservation.numbers.length }], success_url: env.stripeSuccessUrl, cancel_url: env.stripeCancelUrl, metadata: { order_id: order.publicId }, payment_intent_data: { metadata: { order_id: order.publicId } } }, { idempotencyKey: order.publicId });
    order.status = "AWAITING_PROVIDER"; order.providerIntentId = checkout.id; order.providerCheckoutUrl = checkout.url; order.timeline.push({ status: order.status, at: new Date() }); await order.save();
  }
  await audit({ req, aggregateType: "Order", aggregateId: order.publicId, eventType: "ORDER_CREATED", after: { amountMinor, status: order.status } });
  return order;
}

async function settleOrder(orderId, providerEvent, req) {
  const session = await mongoose.startSession();
  let output;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findOne({ publicId: orderId }).session(session);
      assert(order, 404, "ORDER_NOT_FOUND", "Order not found.");
      if (order.status === "TICKETS_ISSUED") { output = order; return; }
      order.status = "PROVIDER_CONFIRMED"; order.timeline.push({ status: order.status, at: new Date() }); await order.save({ session });
      const reservation = await Reservation.findById(order.reservation).session(session);
      const settlementCompetition = reservation ? await Competition.findById(reservation.competition).session(session) : null;
      if (!reservation || reservation.state !== "ACTIVE" || reservation.expiresAt <= new Date() || settlementCompetition?.status !== "LIVE" || (settlementCompetition?.instant?.enabled && settlementCompetition.instant.status !== "ACTIVE")) {
        order.status = "RECONCILIATION_REQUIRED"; order.timeline.push({ status: order.status, at: new Date(), reason: "SETTLEMENT_AFTER_RESERVATION_EXPIRY" }); await order.save({ session });
        await audit({ req, aggregateType: "Order", aggregateId: order.publicId, eventType: "PAYMENT_REQUIRES_RECONCILIATION", after: { status: order.status }, metadata: { providerEvent }, session });
        output = order; return;
      }
      const { tickets } = await issueTickets({ order, req, session });
      const instantResults = [];
      for (const ticket of tickets) instantResults.push(await allocateForTicket(ticket, req, session));
      order.status = "TICKETS_ISSUED"; order.tickets = tickets.map((ticket) => ticket._id); order.timeline.push({ status: order.status, at: new Date() }); await order.save({ session });
      await Outbox.create([{ eventId: `order:${order.publicId}:issued`, handler: "email", topic: "ORDER_CONFIRMED", payload: { orderId: order.publicId, userId: String(order.user) } }], { session });
      await audit({ req, aggregateType: "Order", aggregateId: order.publicId, eventType: "ORDER_SETTLED", after: { status: order.status, tickets: tickets.length }, metadata: { providerEvent }, session });
      output = await Order.findById(order._id).populate("tickets").session(session);
    });
  } finally { await session.endSession(); }
  return output;
}

async function handleStripeWebhook(rawBody, signature) {
  assert(stripe && env.stripeWebhookSecret, 503, "PAYMENT_PROVIDER_UNAVAILABLE", "Stripe webhook configuration is incomplete.");
  const event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  const object = event.data.object;
  const orderId = object.metadata?.order_id;
  const existing = await PaymentEvent.findOne({ provider: "stripe", eventId: event.id });
  if (!existing) await PaymentEvent.create({ provider: "stripe", eventId: event.id, type: event.type, signatureVerified: true, digest: sha256(rawBody), payload: { id: object.id, payment_status: object.payment_status }, processedAt: new Date() });
  if (event.type === "checkout.session.completed" && object.payment_status === "paid" && orderId) {
    await Order.updateOne({ publicId: orderId }, { $set: { providerIntentId: object.payment_intent } });
    await settleOrder(orderId, event.id);
  }
  if (["checkout.session.expired", "payment_intent.payment_failed"].includes(event.type) && orderId) await Order.updateOne({ publicId: orderId, status: { $in: ["CREATED", "AWAITING_PROVIDER"] } }, { $set: { status: "FAILED" }, $push: { timeline: { status: "FAILED", at: new Date(), reason: event.type } } });
  return { received: true, duplicate: Boolean(existing) };
}

async function refundOrder({ orderId, amountMinor, reason, req }) {
  assert(stripe, 503, "PAYMENT_PROVIDER_UNAVAILABLE", "Stripe is not configured.");
  const order = await Order.findOne({ publicId: orderId });
  assert(order && order.status === "TICKETS_ISSUED", 422, "REFUND_UNAVAILABLE", "Only a settled order can be refunded.");
  assert(order.providerIntentId, 422, "PAYMENT_REFERENCE_MISSING", "The provider payment reference is missing.");
  const amount = amountMinor == null ? order.amountMinor : Number(amountMinor);
  assert(Number.isInteger(amount) && amount > 0 && amount <= order.amountMinor, 422, "INVALID_REFUND_AMOUNT", "Refund amount is invalid.");
  assert(reason, 422, "REASON_REQUIRED", "A refund reason is required.");
  const refund = await stripe.refunds.create({ payment_intent: order.providerIntentId, amount, metadata: { order_id: order.publicId, operator_reason: reason } }, { idempotencyKey: `refund:${order.publicId}:${amount}` });
  order.status = refund.status === "succeeded" ? "REFUNDED" : "RECONCILIATION_REQUIRED"; order.timeline.push({ status: order.status, at: new Date(), reason }); await order.save();
  await audit({ req, aggregateType: "Order", aggregateId: order.publicId, eventType: "ORDER_REFUND_CREATED", before: "TICKETS_ISSUED", after: order.status, reason, metadata: { refundId: refund.id, amountMinor: amount } });
  return order;
}

module.exports = { createOrder, settleOrder, handleStripeWebhook, refundOrder };
