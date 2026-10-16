const bcrypt = require("bcryptjs");
const env = require("../config/env");
const { connectDatabase } = require("../config/database");
const { User } = require("../models");
const { opaqueId } = require("../utils/crypto");

async function seed() {
  await connectDatabase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password === "change-this-before-running-seed") throw new Error("Set a strong ADMIN_PASSWORD before seeding.");
  const email = (process.env.ADMIN_EMAIL || "admin@winjolt.co.uk").toLowerCase();
  await User.findOneAndUpdate(
    { email },
    {
      $set: {
        accountType: "STAFF",
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName: "WinJolt",
        lastName: "Administrator",
        dobGateStatus: "DOB_18PLUS_PASSED",
        status: "ACTIVE",
        mfaEnabled: true,
        roles: ["SUPER_ADMIN"],
        permissions: ["*"],
      },
      $setOnInsert: { publicId: opaqueId("stf") },
    },
    { upsert: true, new: true, runValidators: true }
  );

  console.log("Seeded the configured staff account. No demonstration campaigns were created.");
  process.exit(0);
}
seed().catch((error) => { console.error(error); process.exit(1); });
