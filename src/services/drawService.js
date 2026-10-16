const crypto = require("crypto");
const { Competition, Ticket, FreeEntry, Order, Draw, Claim } = require("../models");
const { assert } = require("../utils/errors");
const { opaqueId, sha256 } = require("../utils/crypto");
const { audit } = require("./auditService");

async function lockDraw(req, competitionId) {
  const competition = await Competition.findOne({ publicId: competitionId });
  assert(competition, 404, "COMPETITION_NOT_FOUND", "Competition not found.");
  assert(["ENTRY_CLOSED", "DRAW_READY"].includes(competition.status), 422, "INVALID_STATE", "Entries must be closed and reconciled first.");
  const freePending = await FreeEntry.countDocuments({ competition: competition._id, receiptAt: { $lte: competition.closesAt }, status: { $in: ["RECEIVED", "REVIEW_REQUIRED", "APPEALED"] } });
  const paymentPending = await Order.countDocuments({ competition: competition._id, status: { $in: ["PROVIDER_CONFIRMED", "RECONCILIATION_REQUIRED"] } });
  assert(freePending === 0 && paymentPending === 0, 422, "RECONCILIATION_REQUIRED", "Timely free-entry or payment exceptions remain unresolved.");
  const tickets = await Ticket.find({ competition: competition._id, mainDrawEligible: true, status: "ELIGIBLE" }).sort({ publicId: 1 }).select("publicId").lean();
  assert(tickets.length > 0, 422, "EMPTY_DRAW", "No eligible tickets are available.");
  let draw = await Draw.findOne({ competition: competition._id });
  assert(!draw || draw.status === "SCHEDULED", 409, "DRAW_ALREADY_LOCKED", "This draw has already been locked.");
  const ids = tickets.map((ticket) => ticket.publicId);
  draw = draw || new Draw({ publicId: opaqueId("drw"), competition: competition._id });
  draw.ticketIds = ids; draw.frozenSetHash = sha256(ids); draw.algorithmVersion = "CSPRNG_INDEX_V1"; draw.status = "LEDGER_LOCKED"; draw.lockApprovals.push({ actorId: req.user.publicId, at: new Date() }); await draw.save();
  competition.status = "DRAW_LOCKED"; await competition.save();
  await audit({ req, aggregateType: "Draw", aggregateId: draw.publicId, eventType: "DRAW_LEDGER_LOCKED", after: { frozenSetHash: draw.frozenSetHash, count: ids.length } });
  return draw;
}

async function executeDraw(req, drawId) {
  const draw = await Draw.findOne({ publicId: drawId });
  assert(draw?.status === "LEDGER_LOCKED", 422, "INVALID_STATE", "The draw ledger is not locked.");
  assert(draw.lockApprovals[0]?.actorId !== req.user.publicId, 403, "SEPARATION_OF_DUTIES", "The draw operator cannot be the ledger approver.");
  const winnerPublicId = draw.ticketIds[crypto.randomInt(draw.ticketIds.length)];
  const winner = await Ticket.findOne({ publicId: winnerPublicId, competition: draw.competition, mainDrawEligible: true });
  assert(winner, 500, "DRAW_INTEGRITY_ERROR", "The selected ticket is not in the eligible ledger.");
  draw.winnerTicket = winner._id; draw.status = "DRAW_EXECUTED"; draw.executeActorId = req.user.publicId; draw.randomnessReference = sha256(`${draw.frozenSetHash}:${winnerPublicId}:${crypto.randomBytes(32).toString("hex")}`); draw.executedAt = new Date(); await draw.save();
  winner.status = "WINNER"; await winner.save();
  await Claim.create({ publicId: opaqueId("clm"), user: winner.user, ticket: winner._id, draw: draw._id, prizeKind: "MAIN_PRIZE", prizeTitle: "Main competition prize" });
  await audit({ req, aggregateType: "Draw", aggregateId: draw.publicId, eventType: "DRAW_EXECUTED", after: { winnerTicket: winner.publicId, proof: draw.randomnessReference } });
  return draw.populate("winnerTicket");
}

module.exports = { lockDraw, executeDraw };
