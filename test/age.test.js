const test = require("node:test");
const assert = require("node:assert/strict");
const { isAtLeast18 } = require("../src/utils/age");

test("accepts a customer on their 18th birthday in London", () => {
  assert.equal(isAtLeast18("2008-10-16", new Date("2026-10-16T12:00:00Z")), true);
});
test("rejects a customer one day before their 18th birthday", () => {
  assert.equal(isAtLeast18("2008-10-17", new Date("2026-10-16T12:00:00Z")), false);
});
test("rejects impossible calendar dates", () => {
  assert.throws(() => isAtLeast18("2007-02-29", new Date("2026-10-16T12:00:00Z")), /valid date of birth/);
});
test("uses 1 March for a leap-day 18th birthday in a non-leap year", () => {
  assert.equal(isAtLeast18("2008-02-29", new Date("2026-02-28T12:00:00Z")), false);
  assert.equal(isAtLeast18("2008-02-29", new Date("2026-03-01T12:00:00Z")), true);
});
