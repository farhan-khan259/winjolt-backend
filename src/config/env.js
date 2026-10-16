const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const bool = (value, fallback = false) => value == null ? fallback : value === "true";

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/winjolt?replicaSet=rs0",
  jwtSecret: process.env.JWT_SECRET || "development-only-secret-change-me-32-chars",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "2h",
  adminJwtExpiresIn: process.env.ADMIN_JWT_EXPIRES_IN || "30m",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  publicWebUrl: process.env.PUBLIC_WEB_URL || "http://localhost:3000",
  reservationTtlMinutes: Number(process.env.RESERVATION_TTL_MINUTES || 10),
  paymentProvider: process.env.PAYMENT_PROVIDER || "disabled",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripeSuccessUrl: process.env.STRIPE_SUCCESS_URL || "http://localhost:3000/order-confirmation?session_id={CHECKOUT_SESSION_ID}",
  stripeCancelUrl: process.env.STRIPE_CANCEL_URL || "http://localhost:3000/payment-status?cancelled=1",
  termsVersion: process.env.TERMS_VERSION || "prelaunch-v1",
  privacyVersion: process.env.PRIVACY_VERSION || "prelaunch-v1",
  globalEntryPaused: bool(process.env.GLOBAL_ENTRY_PAUSED, true),
  walletRedemptionEnabled: bool(process.env.WALLET_REDEMPTION_ENABLED, false),
  freeEntryEnabled: bool(process.env.FREE_ENTRY_ENABLED, false),
  smtp: { host: process.env.SMTP_HOST || "", port: Number(process.env.SMTP_PORT || 587), secure: bool(process.env.SMTP_SECURE), user: process.env.SMTP_USER || "", password: process.env.SMTP_PASSWORD || "", from: process.env.EMAIL_FROM || "WinJolt <no-reply@example.com>" },
};

if (env.nodeEnv === "production" && env.jwtSecret.includes("development-only")) {
  throw new Error("JWT_SECRET must be configured in production");
}

module.exports = env;
