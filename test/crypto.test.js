const test = require("node:test");
const assert = require("node:assert/strict");
const { secureSample } = require("../src/utils/crypto");
test("secureSample returns the requested number without replacement", () => {
  const result = secureSample(Array.from({ length: 100 }, (_, index) => index + 1), 20);
  assert.equal(result.length, 20);
  assert.equal(new Set(result).size, 20);
});
