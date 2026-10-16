const mongoose = require("mongoose");
const crypto = require("crypto");
const env = require("../config/env");
const { Competition, TicketSlot, Reservation, Ticket } = require("../models");
const { assert, AppError } = require("../utils/errors");
const { opaqueId, secureSample } = require("../utils/crypto");
const { canEnter } = require("./eligibilityService");
const { audit } = require("./auditService");

const normalize = (values) => [...new Set((values || []).map((value) => Number(value)))];

async function expireReservations(competitionId) {
  const expired = await Reservation.find({ competition: competitionId, state: "ACTIVE", expiresAt: { $lte: new Date() } }).select("_id");
  if (!expired.length) return;
  const ids = expired.map((item) => item._id);
  await TicketSlot.updateMany({ competition: competitionId, reservation: { $in: ids }, state: "HELD" }, { $set: { state: "AVAILABLE" }, $unset: { heldBy: 1, reservation: 1, holdExpiresAt: 1 } });
  await Reservation.updateMany({ _id: { $in: ids } }, { $set: { state: "EXPIRED" } });
}

async function listAvailability(competition, { cursor = 0, limit = 50, search }) {
  await expireReservations(competition._id);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const query = { competition: competition._id, number: { $gte: competition.ticketRange.start, $lte: competition.ticketRange.end } };
  if (search) query.number = Number(search);
  else if (cursor) query.number.$gt = Number(cursor);
  const slots = await TicketSlot.find(query).sort({ number: 1 }).limit(parsedLimit + 1).lean();
  const page = slots.slice(0, parsedLimit);
  return { numbers: page.map((slot) => ({ number: String(slot.number).padStart(competition.ticketRange.padWidth, "0"), state: slot.state === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE" })), next_cursor: slots.length > parsedLimit ? page.at(-1).number : null, authoritative: false };
}

async function reserve({ req, competitionId, manualNumbers, luckyDipCount, expectedTotal, idempotencyKey }) {
  assert(idempotencyKey, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
  const prior = await Reservation.findOne({ user: req.user._id, idempotencyKey });
  if (prior) return prior;
  const competition = await Competition.findOne({ $or: [{ publicId: competitionId }, { slug: competitionId }] });
  assert(competition, 404, "COMPETITION_NOT_FOUND", "Competition not found.");
  const eligibility = canEnter(req.user, competition, "PAID");
  assert(eligibility.allowed, 422, "NOT_ELIGIBLE", "You cannot enter this competition.", eligibility.reasons);
  const manual = normalize(manualNumbers);
  assert(manual.length === (manualNumbers || []).length, 422, "DUPLICATE_NUMBER", "Ticket numbers must be distinct.");
  const lucky = Math.max(0, Number(luckyDipCount) || 0);
  assert(manual.length + lucky === Number(expectedTotal), 422, "COUNT_MISMATCH", "Selected and Lucky Dip numbers must equal the requested quantity.");
  assert(expectedTotal > 0 && expectedTotal <= competition.maxEntriesPerOrder, 422, "ORDER_LIMIT", `Select between 1 and ${competition.maxEntriesPerOrder} tickets.`);
  const [issuedCount, activeReservations] = await Promise.all([Ticket.countDocuments({ user: req.user._id, competition: competition._id, status: { $ne: "VOID" } }), Reservation.aggregate([{ $match: { user: req.user._id, competition: competition._id, state: "ACTIVE", expiresAt: { $gt: new Date() } } }, { $project: { count: { $size: "$numbers" } } }, { $group: { _id: null, total: { $sum: "$count" } } }])]);
  assert(issuedCount + (activeReservations[0]?.total || 0) + Number(expectedTotal) <= competition.maxEntriesPerUser, 422, "CUSTOMER_ENTRY_CAP", "This reservation would exceed the published per-customer entry cap.");
  assert(manual.every((number) => Number.isInteger(number) && number >= competition.ticketRange.start && number <= competition.ticketRange.end), 422, "INVALID_TICKET_NUMBER", "One or more ticket numbers are outside the published range.");
  await expireReservations(competition._id);

  const session = await mongoose.startSession();
  let reservation;
  try {
    await session.withTransaction(async () => {
      const [created] = await Reservation.create([{ publicId: opaqueId("res"), user: req.user._id, competition: competition._id, manualNumbers: manual, luckyDipCount: lucky, numbers: [], idempotencyKey, expiresAt: new Date(Date.now() + env.reservationTtlMinutes * 60000) }], { session });
      const manualClaim = await TicketSlot.updateMany({ competition: competition._id, number: { $in: manual }, state: "AVAILABLE" }, { $set: { state: "HELD", heldBy: req.user._id, reservation: created._id, holdExpiresAt: created.expiresAt } }, { session });
      if (manualClaim.modifiedCount !== manual.length) throw new AppError(409, "TICKET_CONFLICT", "A selected ticket number is no longer available.");
      const random = [];
      const excluded = new Set(manual);
      const capacity = competition.ticketRange.end - competition.ticketRange.start + 1;
      const attemptLimit = Math.min(capacity * 2, Math.max(200, lucky * 50));
      for (let attempt = 0; random.length < lucky && attempt < attemptLimit; attempt += 1) {
        const number = crypto.randomInt(competition.ticketRange.start, competition.ticketRange.end + 1);
        if (excluded.has(number)) continue;
        excluded.add(number);
        if (await TicketSlot.exists({ competition: competition._id, number, state: "AVAILABLE" }).session(session)) random.push(number);
      }
      if (random.length < lucky) {
        // Rejection sampling reaches this path only when the pool is sparse. Load the
        // remaining available set and still apply a CSPRNG sample without replacement.
        const candidates = await TicketSlot.find({ competition: competition._id, state: "AVAILABLE", number: { $nin: [...excluded] } }).select("number").session(session).lean();
        const additional = secureSample(candidates.map((item) => item.number), lucky - random.length);
        random.push(...additional);
      }
      assert(random.length === lucky, 409, "INSUFFICIENT_TICKETS", "There are not enough tickets available.");
      const randomClaim = await TicketSlot.updateMany({ competition: competition._id, number: { $in: random }, state: "AVAILABLE" }, { $set: { state: "HELD", heldBy: req.user._id, reservation: created._id, holdExpiresAt: created.expiresAt } }, { session });
      if (randomClaim.modifiedCount !== random.length) throw new AppError(409, "TICKET_CONFLICT", "Ticket availability changed; please retry.");
      created.numbers = [...manual, ...random];
      await created.save({ session });
      await audit({ req, aggregateType: "Reservation", aggregateId: created.publicId, eventType: "RESERVATION_CREATED", after: { numbers: created.numbers, expiresAt: created.expiresAt }, session });
      reservation = created;
    });
  } finally { await session.endSession(); }
  return reservation;
}

async function issueTickets({ order, req, session, route = "PAID", freeEntry }) {
  const reservation = await Reservation.findById(order?.reservation || freeEntry?.reservation).session(session);
  assert(reservation?.state === "ACTIVE" && reservation.expiresAt > new Date(), 409, "RESERVATION_EXPIRED", "The ticket reservation expired before settlement.");
  const competition = await Competition.findById(reservation.competition).session(session);
  const slots = await TicketSlot.find({ reservation: reservation._id, state: "HELD", heldBy: reservation.user }).session(session);
  assert(slots.length === reservation.numbers.length, 409, "RESERVATION_CONFLICT", "The reserved ticket set is incomplete.");
  const tickets = [];
  for (const slot of slots) {
    const [ticket] = await Ticket.create([{ publicId: opaqueId("tkt"), slot: slot._id, number: slot.number, user: reservation.user, competition: competition._id, sourceRoute: route, order: order?._id, freeEntry: freeEntry?._id, rulesVersion: competition.rulesVersion, issuedAt: new Date() }], { session });
    slot.state = "ISSUED"; slot.issuedTicket = ticket._id; slot.holdExpiresAt = undefined; await slot.save({ session });
    tickets.push(ticket);
  }
  reservation.state = "CONSUMED"; await reservation.save({ session });
  await audit({ req, aggregateType: "Order", aggregateId: order?.publicId || freeEntry?.publicId, eventType: "TICKETS_ISSUED", after: { tickets: tickets.map((ticket) => ticket.publicId), route }, session });
  return { tickets, competition };
}

module.exports = { expireReservations, listAvailability, reserve, issueTickets };
