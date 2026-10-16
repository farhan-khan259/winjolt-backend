const { connectDatabase } = require("../config/database");
const { Outbox } = require("../models");
const { sendOutboxEmail } = require("../services/emailService");

async function claim() {
  const stale = new Date(Date.now() - 10 * 60 * 1000);
  return Outbox.findOneAndUpdate({ handler: "email", nextAttemptAt: { $lte: new Date() }, $or: [{ state: "PENDING" }, { state: "PROCESSING", claimedAt: { $lte: stale } }] }, { $set: { state: "PROCESSING", claimedAt: new Date() } }, { sort: { createdAt: 1 }, new: true });
}

async function tick() {
  const item = await claim();
  if (!item) return;
  try { await sendOutboxEmail(item); item.state = "SENT"; item.sentAt = new Date(); item.lastError = undefined; }
  catch (error) { item.retryCount += 1; item.lastError = error.code || error.message; item.state = item.retryCount >= 10 ? "FAILED" : "PENDING"; item.nextAttemptAt = new Date(Date.now() + Math.min(3600000, 30000 * 2 ** item.retryCount)); }
  await item.save();
}

async function startOutboxWorker({ connect = true } = {}) {
  if (connect) await connectDatabase();
  console.log("WinJolt outbox worker started");
  await tick();
  return setInterval(() => tick().catch((error) => console.error("Outbox tick failed", error)), 2000);
}

if (require.main === module) startOutboxWorker().catch((error) => { console.error("Outbox worker failed", error); process.exit(1); });

module.exports = { tick, startOutboxWorker };
