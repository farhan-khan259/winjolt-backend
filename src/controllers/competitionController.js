const asyncHandler = require("../utils/asyncHandler");
const { Competition, Draw, Ticket } = require("../models");
const { AppError } = require("../utils/errors");
const ticketService = require("../services/ticketService");

const publicFields = "publicId title slug category description images status mainPrize priceMinor currency ticketRange maxEntriesPerUser maxEntriesPerOrder startsAt closesAt drawAt timezone rulesVersion rulesText freeEntryInstructions instant";

exports.list = asyncHandler(async (req, res) => {
  const query = { status: { $in: ["LIVE", "SCHEDULED"] } };
  if (req.query.category) query.category = req.query.category;
  if (req.query.q) query.title = { $regex: req.query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const [items, total] = await Promise.all([Competition.find(query).select(publicFields).sort({ startsAt: 1 }).skip((page - 1) * limit).limit(limit).lean(), Competition.countDocuments(query)]);
  res.json({ items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

exports.get = asyncHandler(async (req, res) => {
  const item = await Competition.findOne({ $or: [{ publicId: req.params.id }, { slug: req.params.id }], status: { $in: ["LIVE", "SCHEDULED", "ENTRY_CLOSED", "DRAW_READY", "DRAW_LOCKED", "RESULT_VERIFIED", "CLAIMS_OPEN", "COMPLETED"] } }).select(publicFields).lean();
  if (!item) throw new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
  res.json({ item });
});

exports.tickets = asyncHandler(async (req, res) => {
  const competition = await Competition.findOne({ $or: [{ publicId: req.params.id }, { slug: req.params.id }] });
  if (!competition) throw new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
  res.json(await ticketService.listAvailability(competition, req.query));
});

exports.results = asyncHandler(async (_req, res) => {
  const draws = await Draw.find({ status: "PUBLISHED" }).populate("competition", "publicId title slug").populate("winnerTicket", "publicId number").sort({ publishedAt: -1 }).lean();
  res.json({ items: draws.map((draw) => ({ draw_id: draw.publicId, competition: draw.competition, winning_ticket: draw.winnerTicket, executed_at: draw.executedAt, published_at: draw.publishedAt, verification: "INDEPENDENTLY_VERIFIED" })) });
});

exports.checkTicket = asyncHandler(async (req, res) => {
  const competition = await Competition.findOne({ $or: [{ publicId: req.body.competition_id }, { slug: req.body.competition_id }] });
  if (!competition) throw new AppError(404, "COMPETITION_NOT_FOUND", "Competition not found.");
  const draw = await Draw.findOne({ competition: competition._id, status: "PUBLISHED" }).populate("winnerTicket", "number").lean();
  if (!draw) throw new AppError(422, "RESULT_NOT_PUBLISHED", "The verified result is not published yet.");
  const number = Number(req.body.ticket_number);
  const exists = await Ticket.exists({ competition: competition._id, number });
  if (!exists) throw new AppError(404, "TICKET_NOT_FOUND", "That issued ticket was not found in this competition.");
  res.json({ competition: competition.title, ticket_number: String(number).padStart(competition.ticketRange.padWidth, "0"), result: draw.winnerTicket.number === number ? "MAIN_PRIZE_WINNER" : "NOT_SELECTED", draw_id: draw.publicId, published_at: draw.publishedAt });
});
