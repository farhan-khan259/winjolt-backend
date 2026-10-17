const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const env = require("../config/env");
const { AppError } = require("../utils/errors");

const uploadDir = env.uploadDir;
fs.mkdirSync(uploadDir, { recursive: true });
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const storage = multer.diskStorage({ destination: uploadDir, filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) });
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => allowed.has(file.mimetype) ? callback(null, true) : callback(new AppError(422, "UNSUPPORTED_FILE", "Only JPEG, PNG, WebP and PDF files are accepted.")) });
module.exports = upload;
