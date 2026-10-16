const asyncHandler = require("../utils/asyncHandler");
const ticketService = require("../services/ticketService");
const orderService = require("../services/orderService");
const { Order } = require("../models");
const { assert } = require("../utils/errors");

exports.reserve = asyncHandler(async (req, res) => {
  const item = await ticketService.reserve({ req, competitionId: req.body.competition_id, manualNumbers: req.body.manual_numbers, luckyDipCount: req.body.lucky_dip_count, expectedTotal: req.body.expected_total_count, idempotencyKey: req.get("idempotency-key") });
  res.status(201).json({ reservation_id: item.publicId, state: item.state, numbers: item.numbers, selected_count: item.numbers.length, expires_at: item.expiresAt, authoritative: true });
});
exports.order = asyncHandler(async (req, res) => { const item = await orderService.createOrder({ req, reservationId: req.body.reservation_id, idempotencyKey: req.get("idempotency-key") }); res.status(201).json({ order_id: item.publicId, status: item.status, amount_minor: item.amountMinor, currency: item.currency, checkout_url: item.providerCheckoutUrl }); });
exports.orderStatus = asyncHandler(async (req, res) => { const item = await Order.findOne({ publicId: req.params.id, user: req.user._id }).populate("tickets", "publicId number").lean(); assert(item, 404, "ORDER_NOT_FOUND", "Order not found."); res.json({ item }); });
exports.stripeWebhook = asyncHandler(async (req, res) => res.json(await orderService.handleStripeWebhook(req.body, req.get("stripe-signature"))));
