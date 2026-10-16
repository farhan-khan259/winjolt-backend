const bcrypt = require("bcryptjs");
const env = require("../config/env");
const { connectDatabase } = require("../config/database");
const { User, Competition, TicketSlot } = require("../models");
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

  const examples = [
    { title: "Performance Car + Cash", slug: "performance-car", category: "Cars", prize: "Performance Car + Cash" },
    { title: "£10,000 Cash Prize", slug: "cash-prize", category: "Cash", prize: "£10,000 Cash" },
    { title: "Gaming & Tech Bundle", slug: "gaming-and-tech", category: "Technology", prize: "Gaming & Tech Bundle" },
    { title: "Ultimate Tools Collection", slug: "ultimate-tools-collection", category: "Tools", prize: "Ultimate Tools Collection" }
  ];
  for (const example of examples) {
    let competition = await Competition.findOne({ slug: example.slug });
    if (!competition) competition = await Competition.create({ publicId: opaqueId("cmp"), title: example.title, slug: example.slug, category: example.category, description: "Prelaunch draft. Not open for entries.", mainPrize: { kind: example.category.toUpperCase(), title: example.prize, valueMinor: 0, secured: false }, priceMinor: 99, ticketRange: { start: 1, end: 10000, padWidth: 5 }, maxEntriesPerUser: 100, maxEntriesPerOrder: 20, rulesVersion: "prelaunch-draft-v1", status: "DRAFT" });
    if (!(await TicketSlot.exists({ competition: competition._id }))) {
      for (let start = 1; start <= 10000; start += 1000) await TicketSlot.insertMany(Array.from({ length: Math.min(1000, 10001 - start) }, (_, index) => ({ competition: competition._id, number: start + index })));
    }
  }
  console.log(`Seeded staff account and ${examples.length} DRAFT campaigns. No campaign was made live.`);
  process.exit(0);
}
seed().catch((error) => { console.error(error); process.exit(1); });
