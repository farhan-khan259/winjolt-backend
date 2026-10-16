const test = require("node:test");
const assert = require("node:assert/strict");
const { canEnter } = require("../src/services/eligibilityService");

const user = { status: "ACTIVE", emailVerified: true, dobGateStatus: "DOB_18PLUS_PASSED", assuranceStatus: "NOT_REQUIRED_UNDER_APPROVED_POLICY", restrictions: [] };
const competition = { status: "LIVE", startsAt: new Date("2026-01-01T00:00:00Z"), closesAt: new Date("2026-12-01T00:00:00Z"), paymentProviderApproved: true, freeEntryApproved: true, instant: { enabled: false, status: "DISABLED" } };

test("global entry pause is enforced by the common eligibility decision", () => {
  const result = canEnter(user, competition, "PAID", new Date("2026-10-16T00:00:00Z"));
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("GLOBAL_ENTRY_PAUSED"));
});

test("unverified email and pending stronger assurance are reason coded", () => {
  const result = canEnter({ ...user, emailVerified: false, assuranceStatus: "PENDING" }, competition, "FREE", new Date("2026-10-16T00:00:00Z"));
  assert.ok(result.reasons.includes("EMAIL_NOT_VERIFIED"));
  assert.ok(result.reasons.includes("AGE_ASSURANCE_REQUIRED"));
});

test("paused instant entitlement prevents new entry instead of converting it to a loss", () => {
  const result = canEnter(user, { ...competition, instant: { enabled: true, status: "PAUSED" } }, "PAID", new Date("2026-10-16T00:00:00Z"));
  assert.ok(result.reasons.includes("INSTANT_ENTITLEMENT_UNAVAILABLE"));
});
