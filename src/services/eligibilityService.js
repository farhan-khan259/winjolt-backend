const env = require("../config/env");

function canEnter(user, competition, route, now = new Date()) {
  const reasons = [];
  if (env.globalEntryPaused) reasons.push("GLOBAL_ENTRY_PAUSED");
  if (competition.status !== "LIVE") reasons.push("CAMPAIGN_NOT_LIVE");
  if (competition.startsAt && now < competition.startsAt) reasons.push("CAMPAIGN_NOT_STARTED");
  if (competition.closesAt && now >= competition.closesAt) reasons.push("CAMPAIGN_CLOSED");
  if (user.status !== "ACTIVE") reasons.push("ACCOUNT_RESTRICTED");
  if (!user.emailVerified) reasons.push("EMAIL_NOT_VERIFIED");
  if (user.dobGateStatus !== "DOB_18PLUS_PASSED") reasons.push("AGE_GATE_FAILED");
  if (["REQUIRED", "PENDING", "FAILED", "MANUAL_REVIEW"].includes(user.assuranceStatus)) reasons.push("AGE_ASSURANCE_REQUIRED");
  if (user.restrictions?.includes("ENTRY_BLOCKED") || user.status === "SELF_EXCLUDED") reasons.push("PARTICIPATION_RESTRICTED");
  if (route === "FREE" && (!env.freeEntryEnabled || !competition.freeEntryApproved)) reasons.push("FREE_ENTRY_NOT_APPROVED");
  if (route === "PAID" && (!competition.paymentProviderApproved || env.paymentProvider === "disabled")) reasons.push("PAYMENTS_NOT_APPROVED");
  if (competition.instant?.enabled && competition.instant.status !== "ACTIVE") reasons.push("INSTANT_ENTITLEMENT_UNAVAILABLE");
  return { allowed: reasons.length === 0, reasons };
}

module.exports = { canEnter };
