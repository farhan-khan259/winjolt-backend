const asyncHandler = require("../utils/asyncHandler");
const { Competition, FreeEntry } = require("../models");
const { assert } = require("../utils/errors");
const { opaqueId } = require("../utils/crypto");
const { canEnter } = require("../services/eligibilityService");
const { audit } = require("../services/auditService");

exports.create = asyncHandler(async (req, res) => {
  const key = req.get("idempotency-key"); assert(key, 400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required.");
  const competition = await Competition.findOne({ $or: [{ publicId: req.body.competition_id }, { slug: req.body.competition_id }] }); assert(competition, 404, "COMPETITION_NOT_FOUND", "Competition not found.");
  const prior = await FreeEntry.findOne({ user: req.user._id, competition: competition._id, idempotencyKey: key });
  if (prior) return res.json({ item: prior });
  const eligibility = canEnter(req.user, competition, "FREE"); assert(eligibility.allowed, 422, "NOT_ELIGIBLE", "Free entry is unavailable.", eligibility.reasons);
  const item = await FreeEntry.create({ publicId: opaqueId("fre"), user: req.user._id, competition: competition._id, receiptAt: new Date(), routeVersion: competition.rulesVersion, requestedNumber: req.body.requested_number, status: "REVIEW_REQUIRED", idempotencyKey: key });
  await audit({ req, aggregateType: "FreeEntry", aggregateId: item.publicId, eventType: "FREE_ENTRY_RECEIVED", after: { receiptAt: item.receiptAt, routeVersion: item.routeVersion } });
  res.status(201).json({ item });
});
