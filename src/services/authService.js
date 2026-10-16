const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const crypto = require("crypto");
const { User, Outbox } = require("../models");
const { AppError, assert } = require("../utils/errors");
const { opaqueId, sha256 } = require("../utils/crypto");
const { isAtLeast18, parseIsoDate } = require("../utils/age");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const postcodePattern = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

function publicUser(user) {
  return { id: user.publicId, account_type: user.accountType, email: user.email, first_name: user.firstName, last_name: user.lastName, phone: user.phone, address: user.address, status: user.status, email_verified: user.emailVerified, dob_gate_status: user.dobGateStatus, assurance_status: user.assuranceStatus, roles: user.roles, permissions: user.permissions, marketing_consent: user.marketingConsent };
}

function tokenFor(user) {
  return jwt.sign({ sub: user.id, ver: user.tokenVersion, typ: user.accountType, roles: user.roles }, env.jwtSecret, { expiresIn: user.accountType === "STAFF" ? env.adminJwtExpiresIn : env.jwtExpiresIn, issuer: "winjolt-api", audience: "winjolt-web" });
}

async function register(input) {
  assert(typeof input.first_name === "string" && input.first_name.trim().length >= 1 && input.first_name.length <= 80 && typeof input.last_name === "string" && input.last_name.trim().length >= 1 && input.last_name.length <= 80, 422, "INVALID_NAME", "Enter your first and last name.");
  assert(emailPattern.test(input.email || ""), 422, "INVALID_EMAIL", "Enter a valid email address.");
  assert(/^[+()\d\s-]{7,24}$/.test(input.phone || ""), 422, "INVALID_PHONE", "Enter a valid contact number.");
  assert((input.password || "").length >= 10 && /[A-Z]/.test(input.password) && /[a-z]/.test(input.password) && /\d/.test(input.password), 422, "WEAK_PASSWORD", "Use at least 10 characters with upper-case, lower-case and a number.");
  assert(input.accept_terms === true, 422, "TERMS_REQUIRED", "You must accept the current Terms and Privacy Notice.");
  assert(input.terms_version === env.termsVersion && input.privacy_version === env.privacyVersion, 422, "POLICY_VERSION_MISMATCH", "Please review the current Terms and Privacy Notice.");
  assert(postcodePattern.test(input.address?.postcode || ""), 422, "INVALID_POSTCODE", "Enter a valid UK postcode.");
  assert(input.address?.line1?.trim() && input.address?.city?.trim() && input.address?.country?.trim(), 422, "INVALID_ADDRESS", "Enter your residential address.");
  assert(isAtLeast18(input.date_of_birth), 422, "UNDER_18", "Registration is only available to customers aged 18 or over.");
  const dob = parseIsoDate(input.date_of_birth).date;
  const existing = await User.exists({ email: input.email.toLowerCase() });
  assert(!existing, 409, "EMAIL_IN_USE", "An account already exists for this email address.");
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const user = await User.create({ publicId: opaqueId("usr"), email: input.email.trim().toLowerCase(), passwordHash: await bcrypt.hash(input.password, 12), firstName: input.first_name.trim(), lastName: input.last_name.trim(), phone: input.phone.trim(), dateOfBirth: dob, address: { ...input.address, line1: input.address.line1.trim(), city: input.address.city.trim(), postcode: input.address.postcode.trim().toUpperCase(), country: input.address.country.trim() }, dobGateStatus: "DOB_18PLUS_PASSED", marketingConsent: Boolean(input.marketing_consent), termsVersion: input.terms_version, privacyVersion: input.privacy_version, status: "ACTIVE", emailVerificationTokenHash: sha256(verificationToken), emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  await Outbox.create({ eventId: `user:${user.publicId}:verify`, handler: "email", topic: "VERIFY_EMAIL", payload: { userId: user.publicId, verificationToken }, nextAttemptAt: new Date() });
  return { token: tokenFor(user), user: publicUser(user), ...(env.nodeEnv === "development" ? { development_verification_token: verificationToken } : {}) };
}

async function verifyEmail(token) {
  const user = await User.findOne({ emailVerificationTokenHash: sha256(token || ""), emailVerificationExpiresAt: { $gt: new Date() } }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");
  assert(user, 422, "INVALID_VERIFICATION_TOKEN", "The email verification link is invalid or expired.");
  user.emailVerified = true; user.emailVerificationTokenHash = undefined; user.emailVerificationExpiresAt = undefined; await user.save();
  return publicUser(user);
}

async function requestPasswordReset(email) {
  const user = await User.findOne({ email: (email || "").toLowerCase(), accountType: "CUSTOMER" });
  if (user) {
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetTokenHash = sha256(resetToken); user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000); await user.save();
    await Outbox.findOneAndUpdate({ eventId: `user:${user.publicId}:password-reset`, handler: "email" }, { $set: { topic: "PASSWORD_RESET", payload: { userId: user.publicId, resetToken }, state: "PENDING", retryCount: 0, nextAttemptAt: new Date() } }, { upsert: true });
  }
}

async function resetPassword(token, password) {
  assert((password || "").length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password), 422, "WEAK_PASSWORD", "Use at least 10 characters with upper-case, lower-case and a number.");
  const user = await User.findOne({ passwordResetTokenHash: sha256(token || ""), passwordResetExpiresAt: { $gt: new Date() } }).select("+passwordHash +passwordResetTokenHash +passwordResetExpiresAt");
  assert(user, 422, "INVALID_RESET_TOKEN", "The password reset link is invalid or expired.");
  user.passwordHash = await bcrypt.hash(password, 12); user.passwordResetTokenHash = undefined; user.passwordResetExpiresAt = undefined; user.tokenVersion += 1; await user.save();
}

async function login(email, password, staff = false, mfaCode) {
  const user = await User.findOne({ email: (email || "").toLowerCase(), accountType: staff ? "STAFF" : "CUSTOMER" }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) throw new AppError(401, "INVALID_CREDENTIALS", "The email address or password is incorrect.");
  assert(user.status === "ACTIVE", 403, "ACCOUNT_RESTRICTED", "This account cannot sign in.");
  if (staff) {
    assert(user.mfaEnabled, 403, "MFA_NOT_ENROLLED", "Staff MFA enrollment is required.");
    const configuredCode = process.env.ADMIN_MFA_CODE;
    assert(configuredCode && mfaCode === configuredCode, 401, "MFA_INVALID", "Enter the valid staff MFA code.");
  }
  return { token: tokenFor(user), user: publicUser(user) };
}

module.exports = { register, login, verifyEmail, requestPasswordReset, resetPassword, publicUser };
