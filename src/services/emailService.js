const nodemailer = require("nodemailer");
const env = require("../config/env");
const { User, Subscriber, Order } = require("../models");
const { AppError } = require("../utils/errors");

const transport = env.smtp.host ? nodemailer.createTransport({ host: env.smtp.host, port: env.smtp.port, secure: env.smtp.secure, auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined }) : null;
const link = (path, token) => `${env.publicWebUrl}${path}?token=${encodeURIComponent(token)}`;

async function messageFor(outbox) {
  if (outbox.topic === "VERIFY_EMAIL") { const user = await User.findOne({ publicId: outbox.payload.userId }); return { to: user?.email, subject: "Verify your WinJolt email", text: `Verify your email: ${link("/registration-confirmation", outbox.payload.verificationToken)}` }; }
  if (outbox.topic === "PASSWORD_RESET") { const user = await User.findOne({ publicId: outbox.payload.userId }); return { to: user?.email, subject: "Reset your WinJolt password", text: `Reset your password: ${link("/reset-password", outbox.payload.resetToken)}` }; }
  if (outbox.topic === "MARKETING_DOUBLE_OPT_IN") { const subscriber = await Subscriber.findById(outbox.payload.subscriberId); return { to: subscriber?.email, subject: "Confirm WinJolt updates", text: `Confirm your subscription: ${env.publicWebUrl}/?newsletter_token=${encodeURIComponent(outbox.payload.token)}` }; }
  if (outbox.topic === "ORDER_CONFIRMED") { const order = await Order.findOne({ publicId: outbox.payload.orderId }).populate("user", "email firstName").populate("tickets", "number"); return { to: order?.user?.email, subject: `WinJolt order ${order?.publicId} confirmed`, text: `Hello ${order?.user?.firstName || ""}. Your verified ticket numbers are: ${(order?.tickets || []).map((ticket) => ticket.number).join(", ")}.` }; }
  throw new AppError(422, "UNKNOWN_OUTBOX_TOPIC", `Unsupported outbox topic ${outbox.topic}.`);
}

async function sendOutboxEmail(outbox) {
  if (!transport) throw new AppError(503, "SMTP_NOT_CONFIGURED", "SMTP is not configured.");
  const message = await messageFor(outbox);
  if (!message.to) throw new AppError(422, "EMAIL_RECIPIENT_MISSING", "Email recipient is unavailable.");
  await transport.sendMail({ from: env.smtp.from, ...message });
}

module.exports = { sendOutboxEmail };
