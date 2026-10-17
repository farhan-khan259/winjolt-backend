const asyncHandler = require("../utils/asyncHandler");
const auth = require("../services/authService");
const { audit } = require("../services/auditService");

exports.register = asyncHandler(async (req, res) => {
  const result = await auth.register(req.body);
  req.user = { ...result.user, accountType: "CUSTOMER", publicId: result.user.id };
  await audit({ req, aggregateType: "User", aggregateId: result.user.id, eventType: "ACCOUNT_REGISTERED", after: { dobGateStatus: result.user.dob_gate_status } });
  res.status(201).json(result);
});

exports.login = asyncHandler(async (req, res) => res.json(await auth.login(req.body.email, req.body.password, false)));
exports.adminLogin = asyncHandler(async (req, res) => res.json(await auth.login(req.body.email, req.body.password, true)));
exports.verifyEmail = asyncHandler(async (req, res) => res.json({ user: await auth.verifyEmail(req.body.token) }));
exports.requestPasswordReset = asyncHandler(async (req, res) => { await auth.requestPasswordReset(req.body.email); res.status(202).json({ message: "If an account exists, a reset email has been queued." }); });
exports.resetPassword = asyncHandler(async (req, res) => { await auth.resetPassword(req.body.token, req.body.password); res.json({ message: "Password updated. Sign in again." }); });
exports.logout = asyncHandler(async (req, res) => { req.user.tokenVersion += 1; await req.user.save(); res.status(204).end(); });
exports.me = asyncHandler(async (req, res) => res.json({ user: auth.publicUser(req.user) }));
