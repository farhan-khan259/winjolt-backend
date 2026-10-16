class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const assert = (condition, status, code, message, details) => {
  if (!condition) throw new AppError(status, code, message, details);
};

module.exports = { AppError, assert };
