const { AuditEvent } = require("../models");
const { opaqueId, sha256 } = require("../utils/crypto");

async function audit({ req, aggregateType, aggregateId, eventType, reason, before, after, metadata, session }) {
  const last = await AuditEvent.findOne().sort({ occurredAt: -1 }).session(session || null).lean();
  const event = {
    publicId: opaqueId("aud"), correlationId: req?.correlationId, aggregateType, aggregateId: String(aggregateId), eventType,
    actorType: req?.user ? (req.user.accountType === "STAFF" ? "STAFF" : "CUSTOMER") : "SYSTEM",
    actorId: req?.user?.publicId || "system", actorRole: req?.user?.roles?.join(",") || "SYSTEM", reason,
    previousStateHash: before == null ? undefined : sha256(before), newStateHash: after == null ? undefined : sha256(after),
    previousEventHash: last?.eventHash || "GENESIS", metadata, occurredAt: new Date()
  };
  event.eventHash = sha256(event);
  const [created] = await AuditEvent.create([event], session ? { session } : undefined);
  return created;
}

module.exports = { audit };
