const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const env = require("./config/env");
const requestContext = require("./middleware/requestContext");
const { notFound, errorHandler } = require("./middleware/errors");
const routes = require("./routes");
const commerce = require("./controllers/commerceController");

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.frontendUrl.split(",").map((value) => value.trim()), credentials: false, allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "If-Match", "X-Correlation-Id"] }));
app.use(requestContext);
app.post("/api/v1/provider/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), commerce.stripeWebhook);
app.use(express.json({ limit: "1mb" }));
app.use("/api/v1/accounts", rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api/v1/ticket-reservations", rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(["/api/v1/support-cases", "/api/v1/newsletter", "/api/v1/free-entries"], rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "winjolt-api", time: new Date().toISOString() }));
app.use("/api/v1", routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
