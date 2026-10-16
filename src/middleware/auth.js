const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { User } = require("../models");
const { AppError } = require("../utils/errors");

async function authenticate(req, _res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) throw new AppError(401, "AUTH_REQUIRED", "Sign in to continue.");
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user || user.status === "REVOKED" || user.tokenVersion !== payload.ver) throw new AppError(401, "SESSION_INVALID", "Your session is no longer valid.");
    req.user = user;
    req.auth = payload;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError(401, "SESSION_INVALID", "Your session is invalid or expired."));
  }
}

function requireStaff(req, _res, next) {
  if (req.user?.accountType !== "STAFF") return next(new AppError(403, "STAFF_REQUIRED", "Staff access is required."));
  next();
}

const permit = (...permissions) => (req, _res, next) => {
  const grants = new Set(req.user?.permissions || []);
  if (!permissions.some((permission) => grants.has(permission) || grants.has("*"))) return next(new AppError(403, "FORBIDDEN", "You do not have permission to perform this action."));
  next();
};

module.exports = { authenticate, requireStaff, permit };
