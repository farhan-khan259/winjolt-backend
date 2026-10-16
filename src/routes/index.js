const express = require("express");
const auth = require("../controllers/authController");
const competitions = require("../controllers/competitionController");
const customer = require("../controllers/customerController");
const commerce = require("../controllers/commerceController");
const freeEntry = require("../controllers/freeEntryController");
const admin = require("../controllers/adminController");
const { authenticate, requireStaff, permit } = require("../middleware/auth");
const upload = require("../middleware/uploads");

const router = express.Router();
router.post("/accounts/register", auth.register); router.post("/accounts/login", auth.login); router.post("/accounts/verify-email", auth.verifyEmail); router.post("/accounts/password-reset/request", auth.requestPasswordReset); router.post("/accounts/password-reset/confirm", auth.resetPassword); router.post("/admin/auth/login", auth.adminLogin);
router.get("/accounts/me", authenticate, auth.me); router.post("/accounts/logout", authenticate, auth.logout); router.get("/accounts/eligibility", authenticate, customer.eligibility); router.patch("/accounts/me", authenticate, customer.updateProfile);
router.get("/accounts/dashboard", authenticate, customer.dashboard); router.get("/accounts/tickets", authenticate, customer.tickets); router.get("/accounts/orders", authenticate, customer.orders); router.get("/accounts/claims", authenticate, customer.claims);
router.post("/accounts/self-exclude", authenticate, customer.selfExclude);
router.get("/results", competitions.results); router.post("/ticket-checker", competitions.checkTicket); router.get("/competitions", competitions.list); router.get("/competitions/:id", competitions.get); router.get("/competitions/:id/tickets", competitions.tickets);
router.post("/newsletter/subscribe", customer.subscribe); router.post("/newsletter/confirm", customer.confirmSubscription);
router.get("/assets/:id", admin.publicAsset);
router.post("/ticket-reservations", authenticate, commerce.reserve); router.post("/orders", authenticate, commerce.order); router.get("/orders/:id", authenticate, commerce.orderStatus); router.post("/free-entries", authenticate, freeEntry.create); router.get("/tickets/:id/instant-result", authenticate, customer.instantResult); router.post("/claims/:id", authenticate, customer.submitClaim); router.post("/support-cases", customer.support);

const staff = [authenticate, requireStaff];
router.get("/admin/dashboard", ...staff, permit("dashboard:read"), admin.dashboard);
router.get("/admin/settings", ...staff, permit("dashboard:read"), admin.settings);
router.get("/admin/competitions", ...staff, permit("competition:read"), admin.competitions); router.get("/admin/competitions/:id", ...staff, permit("competition:read"), admin.competition); router.post("/admin/competitions", ...staff, permit("competition:create"), admin.createCompetition); router.patch("/admin/competitions/:id", ...staff, permit("competition:edit"), admin.updateCompetition);
router.post("/admin/competitions/:id/submit-review", ...staff, permit("competition:submit"), admin.submitReview); router.post("/admin/competitions/:id/approve", ...staff, permit("competition:approve"), admin.approve); router.post("/admin/competitions/:id/transition/:action", ...staff, permit("competition:transition"), admin.transition);
router.get("/admin/tickets", ...staff, permit("tickets:read"), admin.listTickets); router.get("/admin/orders", ...staff, permit("orders:read"), admin.listOrders); router.post("/admin/orders/:id/refund", ...staff, permit("orders:refund"), admin.refundOrder); router.get("/admin/free-entries", ...staff, permit("free_entries:read"), admin.listFreeEntries); router.post("/admin/free-entries/:id/review", ...staff, permit("free_entries:review"), admin.reviewFreeEntry);
router.get("/admin/claims", ...staff, permit("claims:read"), admin.listClaims); router.patch("/admin/claims/:id", ...staff, permit("claims:manage"), admin.updateClaim); router.get("/admin/support-cases", ...staff, permit("support:read"), admin.supportCases); router.patch("/admin/support-cases/:id", ...staff, permit("support:manage"), admin.updateSupportCase); router.get("/admin/customers", ...staff, permit("customers:read"), admin.users); router.patch("/admin/customers/:id", ...staff, permit("customers:manage"), admin.updateCustomer);
router.get("/admin/draws", ...staff, permit("draw:read"), admin.listDraws); router.get("/admin/instant-results", ...staff, permit("instant:read"), admin.listInstantResults);
router.get("/admin/prizes", ...staff, permit("prizes:read"), admin.listPrizes); router.post("/admin/prizes", ...staff, permit("prizes:create"), admin.createPrize); router.post("/admin/prizes/:id/verify", ...staff, permit("prizes:verify"), admin.verifyPrize); router.post("/admin/prizes/:id/reserve", ...staff, permit("prizes:reserve"), admin.reservePrize);
router.get("/admin/staff", ...staff, permit("staff:read"), admin.staff); router.post("/admin/staff", ...staff, permit("staff:create"), admin.createStaff); router.patch("/admin/staff/:id", ...staff, permit("staff:manage"), admin.updateStaff); router.get("/admin/audit-events", ...staff, permit("audit:read"), admin.audit); router.get("/admin/analytics", ...staff, permit("analytics:read"), admin.analytics);
router.post("/admin/competitions/:id/draw/lock", ...staff, permit("draw:lock"), admin.lockDraw); router.post("/admin/draws/:id/execute", ...staff, permit("draw:execute"), admin.executeDraw); router.post("/admin/draws/:id/verify", ...staff, permit("draw:verify"), admin.verifyDraw); router.post("/admin/draws/:id/publish", ...staff, permit("draw:publish"), admin.publishDraw);
router.get("/admin/content", ...staff, permit("content:read"), admin.content); router.post("/admin/content", ...staff, permit("content:create"), admin.content); router.patch("/admin/content/:id", ...staff, permit("content:publish"), admin.updateContent);
router.post("/admin/assets", ...staff, permit("assets:create"), upload.single("file"), admin.uploadAsset); router.get("/admin/assets/:id", ...staff, permit("assets:read"), admin.downloadAsset);

module.exports = router;
