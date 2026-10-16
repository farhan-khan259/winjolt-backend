const asyncHandler = require("../utils/asyncHandler");
const crypto = require("crypto");
const { User, Ticket, InstantResult, Order, Claim, WalletEntry, SupportCase, Competition, Subscriber, Outbox } = require("../models");
const { assert } = require("../utils/errors");
const { opaqueId, sha256 } = require("../utils/crypto");
const { audit } = require("../services/auditService");

exports.eligibility = asyncHandler(async (req, res) => res.json({ dob_gate_status: req.user.dobGateStatus, assurance_status: req.user.assuranceStatus, account_status: req.user.status, can_attempt_entry: req.user.status === "ACTIVE" && req.user.dobGateStatus === "DOB_18PLUS_PASSED" && !["REQUIRED", "PENDING", "FAILED", "MANUAL_REVIEW"].includes(req.user.assuranceStatus) }));

exports.updateProfile = asyncHandler(async (req, res) => {
  const before = { firstName: req.user.firstName, lastName: req.user.lastName, phone: req.user.phone, address: req.user.address, marketingConsent: req.user.marketingConsent };
  for (const key of ["firstName", "lastName", "phone", "address", "marketingConsent"]) if (req.body[key] !== undefined) req.user[key] = req.body[key];
  await req.user.save(); await audit({ req, aggregateType: "User", aggregateId: req.user.publicId, eventType: "PROFILE_UPDATED", before, after: req.body });
  res.json({ updated: true });
});

exports.dashboard = asyncHandler(async (req, res) => {
  const [entries, orders, prizes, wallet] = await Promise.all([Ticket.countDocuments({ user: req.user._id }), Order.countDocuments({ user: req.user._id }), Claim.countDocuments({ user: req.user._id }), WalletEntry.aggregate([{ $match: { user: req.user._id } }, { $group: { _id: null, balance: { $sum: "$deltaMinor" } } }])]);
  res.json({ entries, orders, prizes, wallet_balance_minor: wallet[0]?.balance || 0 });
});

exports.tickets = asyncHandler(async (req, res) => {
  const tickets = await Ticket.find({ user: req.user._id }).populate("competition", "publicId title slug drawAt").sort({ createdAt: -1 }).lean();
  const results = await InstantResult.find({ ticket: { $in: tickets.map((ticket) => ticket._id) } }).lean();
  const byTicket = new Map(results.map((result) => [String(result.ticket), result]));
  res.json({ items: tickets.map((ticket) => ({ ...ticket, instantResult: byTicket.get(String(ticket._id)) })) });
});
exports.orders = asyncHandler(async (req, res) => res.json({ items: await Order.find({ user: req.user._id }).populate("competition", "title slug").populate("tickets", "publicId number").sort({ createdAt: -1 }).lean() }));
exports.claims = asyncHandler(async (req, res) => res.json({ items: await Claim.find({ user: req.user._id }).populate("ticket", "publicId number").sort({ createdAt: -1 }).lean() }));
exports.submitClaim = asyncHandler(async (req, res) => { const claim = await Claim.findOne({ publicId: req.params.id, user: req.user._id }); assert(claim && ["AWARDED", "CUSTOMER_NOTIFIED"].includes(claim.status), 422, "CLAIM_UNAVAILABLE", "This prize cannot currently be claimed."); claim.status = "CLAIM_SUBMITTED"; claim.deliveryPreference = req.body.delivery_preference; claim.submittedAt = new Date(); await claim.save(); await audit({ req, aggregateType: "Claim", aggregateId: claim.publicId, eventType: "CLAIM_SUBMITTED", after: { status: claim.status } }); res.json({ claim }); });
exports.instantResult = asyncHandler(async (req, res) => { const ticket = await Ticket.findOne({ publicId: req.params.id, user: req.user._id }); assert(ticket, 404, "TICKET_NOT_FOUND", "Ticket not found."); const result = await InstantResult.findOne({ ticket: ticket._id }).lean(); assert(result, 404, "RESULT_NOT_AVAILABLE", "No instant result is available for this ticket."); const competition = await Competition.findById(ticket.competition).select("instant.wheelMode").lean(); res.json({ ...result, wheel_display_mode: competition.instant.wheelMode }); });
exports.support = asyncHandler(async (req, res) => { assert(req.body.email && req.body.message, 422, "VALIDATION_ERROR", "Email and message are required."); const item = await SupportCase.create({ publicId: opaqueId(req.body.type === "COMPLAINT" ? "cmp" : "sup"), user: req.user?._id, name: req.body.name, email: req.body.email, type: req.body.type || "ENQUIRY", category: req.body.category, message: req.body.message, reference: req.body.reference }); res.status(201).json({ item }); });
exports.selfExclude = asyncHandler(async (req, res) => { assert(req.body.confirm === true, 422, "CONFIRMATION_REQUIRED", "Confirm the participation restriction."); req.user.status = "SELF_EXCLUDED"; req.user.restrictions = [...new Set([...(req.user.restrictions || []), "ENTRY_BLOCKED"])]; req.user.tokenVersion += 1; await req.user.save(); await audit({ req, aggregateType: "User", aggregateId: req.user.publicId, eventType: "CUSTOMER_SELF_EXCLUDED", after: { status: req.user.status }, reason: req.body.reason }); res.status(204).end(); });
exports.subscribe = asyncHandler(async (req, res) => { assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email || "") && req.body.consent === true, 422, "CONSENT_REQUIRED", "A valid email and explicit marketing consent are required."); const token = crypto.randomBytes(32).toString("hex"); const item = await Subscriber.findOneAndUpdate({ email: req.body.email.toLowerCase() }, { $set: { status: "PENDING", consentAt: new Date(), source: req.body.source || "HOMEPAGE", confirmationTokenHash: sha256(token) }, $unset: { unsubscribedAt: 1 } }, { upsert: true, new: true }); await Outbox.findOneAndUpdate({ eventId: `subscriber:${item.id}:confirm`, handler: "email" }, { $set: { topic: "MARKETING_DOUBLE_OPT_IN", payload: { subscriberId: item.id, token }, state: "PENDING", retryCount: 0, nextAttemptAt: new Date() } }, { upsert: true }); res.status(202).json({ message: "Check your email to confirm the subscription." }); });
exports.confirmSubscription = asyncHandler(async (req, res) => { const item = await Subscriber.findOne({ confirmationTokenHash: sha256(req.body.token || "") }).select("+confirmationTokenHash"); assert(item, 422, "INVALID_CONFIRMATION_TOKEN", "The confirmation link is invalid."); item.status = "SUBSCRIBED"; item.confirmedAt = new Date(); item.confirmationTokenHash = undefined; await item.save(); res.json({ message: "Subscription confirmed." }); });
