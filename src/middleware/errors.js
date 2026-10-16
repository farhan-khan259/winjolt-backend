const { AppError } = require("../utils/errors");

function notFound(req, _res, next) {
  next(new AppError(404, "NOT_FOUND", `No route matches ${req.method} ${req.originalUrl}.`));
}

function errorHandler(error, req, res, _next) {
  const duplicate = error?.code === 11000;
  const validation = error?.name === "ValidationError" || error?.name === "CastError";
  const status = error.status || (duplicate ? 409 : validation ? 422 : 500);
  const code = error.code && typeof error.code === "string" ? error.code : duplicate ? "DUPLICATE_RECORD" : validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR";
  if (status >= 500) console.error(`[${req.correlationId}]`, error);
  const message = status >= 500 ? "An unexpected server error occurred." : duplicate ? "A record with the same unique value already exists." : error.message;
  res.status(status).json({ error: { code, message, details: error.details, correlation_id: req.correlationId } });
}

module.exports = { notFound, errorHandler };
