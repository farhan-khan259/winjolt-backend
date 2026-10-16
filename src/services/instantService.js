const crypto = require("crypto");
const { Competition, InstantResult, Claim, WalletEntry } = require("../models");
const { opaqueId, sha256 } = require("../utils/crypto");
const { audit } = require("./auditService");

async function allocateForTicket(ticket, req, session) {
  const existing = await InstantResult.findOne({ ticket: ticket._id }).session(session);
  if (existing) return existing;
  const competition = await Competition.findById(ticket.competition).session(session);
  if (!competition.instant.enabled) return null;
  if (competition.instant.status !== "ACTIVE") throw new Error("Instant-win entitlement is not available for allocation; entry issuance must be reconciled.");
  const position = competition.instant.allocationCursor;
  // Route-blind sequential allocation. Exact inventory is conserved as the finite
  // entry capacity is consumed; production activation remains audit-gated.
  let chosen = null;
  let drawEvidence;
  {
    const remainingPositions = Math.max(1, competition.ticketRange.end - competition.ticketRange.start + 1 - position);
    const tiersWithStock = competition.instant.tiers.filter((tier) => tier.allocatedCount < tier.plannedCount);
    const remainingWins = tiersWithStock.reduce((total, tier) => total + tier.plannedCount - tier.allocatedCount, 0);
    const winRoll = crypto.randomInt(remainingPositions);
    drawEvidence = `remaining:${remainingPositions}:wins:${remainingWins}:roll:${winRoll}`;
    if (winRoll < remainingWins) {
      let tierRoll = crypto.randomInt(remainingWins);
      chosen = tiersWithStock.find((tier) => { tierRoll -= tier.plannedCount - tier.allocatedCount; return tierRoll < 0; });
      drawEvidence += `:tier:${chosen?.code}`;
    }
  }
  const status = chosen ? "COMMITTED_WIN" : "COMMITTED_NO_WIN";
  const proof = sha256(`${competition.instant.manifestHash}:${position}:${ticket.publicId}:${drawEvidence}`);
  const [result] = await InstantResult.create([{ publicId: opaqueId("iwr"), ticket: ticket._id, competition: competition._id, status, outcomeKind: chosen?.kind || "NO_WIN", prizeCode: chosen?.code, prizeTitle: chosen?.title, valueMinor: chosen?.valueMinor, allocationPosition: position, commitProof: proof, committedAt: new Date() }], { session });
  competition.instant.allocationCursor += 1;
  if (chosen) {
    chosen.allocatedCount += 1;
    const [claim] = await Claim.create([{ publicId: opaqueId("clm"), user: ticket.user, ticket: ticket._id, instantResult: result._id, prizeKind: chosen.kind, prizeTitle: chosen.title }], { session });
    if (chosen.kind === "WEBSITE_CREDIT") await WalletEntry.create([{ publicId: opaqueId("wal"), user: ticket.user, deltaMinor: chosen.valueMinor, type: "AWARD", relatedResult: result._id, idempotencyKey: `instant:${result.publicId}`, transactionGroup: claim.publicId }], { session });
  }
  await competition.save({ session });
  await audit({ req, aggregateType: "InstantResult", aggregateId: result.publicId, eventType: "INSTANT_RESULT_COMMITTED", after: { status, position, proof }, session });
  return result;
}

module.exports = { allocateForTicket };
