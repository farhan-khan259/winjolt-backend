const crypto = require("crypto");
module.exports = (req, res, next) => {
  req.correlationId = req.get("x-correlation-id") || crypto.randomUUID();
  res.set("x-correlation-id", req.correlationId);
  next();
};
