const crypto = require("crypto");

const opaqueId = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

function secureSample(items, count) {
  const pool = [...items];
  for (let i = pool.length - 1; i > pool.length - 1 - count; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(pool.length - count);
}

module.exports = { opaqueId, sha256, secureSample };
