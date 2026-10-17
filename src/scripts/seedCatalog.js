const fs = require("fs/promises");
const path = require("path");
const { connectDatabase } = require("../config/database");
const env = require("../config/env");
const { Competition, FileAsset, TicketSlot } = require("../models");
const { opaqueId, sha256 } = require("../utils/crypto");

const frontendImages = path.resolve(__dirname, "../../../winjolt-frontend/src/Assets/Pictures");
const uploadDirectory = env.uploadDir;
const apiBaseUrl = (process.env.API_PUBLIC_URL || `http://localhost:${env.port}/api/v1`).replace(/\/$/, "");

const daysFromNow = (days, hour = 12) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
};

const catalogue = [
  { slug: "performance-car-cash", title: "Performance Car + Cash", category: "Cars", image: "car-card.jpg", description: "A performance car package with a cash contribution toward insurance, delivery and running costs.", priceMinor: 99, prizeKind: "VEHICLE", prizeValueMinor: 4500000 },
  { slug: "10000-cash-prize", title: "£10,000 Cash Prize", category: "Cash", image: "cash-card.jpg", description: "A £10,000 cash prize paid to the verified winner under the published fulfilment terms.", priceMinor: 99, prizeKind: "CASH", prizeValueMinor: 1000000 },
  { slug: "gaming-tech-bundle", title: "Gaming & Tech Bundle", category: "Technology", image: "gaming-card.jpg", description: "A current-generation console, display, gaming accessories and smartphone technology bundle.", priceMinor: 99, prizeKind: "ELECTRONICS", prizeValueMinor: 350000 },
  { slug: "ultimate-tools-collection", title: "Ultimate Tools Collection", category: "Tools", image: "tools-card.jpg", description: "A professional cordless power-tool and workshop equipment collection.", priceMinor: 99, prizeKind: "TOOLS", prizeValueMinor: 250000 },
  { slug: "smartphone-instant-win", title: "Smartphone Instant Win", category: "Instant Wins", image: "instant-phone.jpg", description: "Enter the main draw and receive an immediate result for a premium smartphone prize.", priceMinor: 50, prizeKind: "ELECTRONICS", prizeValueMinor: 99900, instant: { code: "PHONE", title: "Premium smartphone", kind: "ELECTRONICS", valueMinor: 99900, plannedCount: 5 } },
  { slug: "wireless-earbuds-instant-win", title: "Wireless Earbuds Instant Win", category: "Instant Wins", image: "instant-earbuds.jpg", description: "Enter the main draw and receive an immediate result for wireless earbuds.", priceMinor: 50, prizeKind: "ELECTRONICS", prizeValueMinor: 17900, instant: { code: "EARBUDS", title: "Wireless earbuds", kind: "ELECTRONICS", valueMinor: 17900, plannedCount: 20 } },
  { slug: "100-cash-instant-win", title: "£100 Cash Instant Win", category: "Instant Wins", image: "instant-cash.jpg", description: "Enter the main draw and receive an immediate result for one of the advertised £100 cash prizes.", priceMinor: 50, prizeKind: "CASH", prizeValueMinor: 10000, instant: { code: "CASH100", title: "£100 cash", kind: "CASH", valueMinor: 10000, plannedCount: 10 } },
  { slug: "gift-card-instant-win", title: "Gift Card Instant Win", category: "Instant Wins", image: "instant-giftcard.jpg", description: "Enter the main draw and receive an immediate result for an advertised retailer gift card.", priceMinor: 50, prizeKind: "VOUCHER", prizeValueMinor: 2500, instant: { code: "GIFTCARD25", title: "£25 gift card", kind: "VOUCHER", valueMinor: 2500, plannedCount: 40 } },
];

async function ensurePublicImage(fileName) {
  const source = path.join(frontendImages, fileName);
  const bytes = await fs.readFile(source);
  const digest = sha256(bytes);
  let asset = await FileAsset.findOne({ sha256: digest, purpose: "CAMPAIGN_MEDIA", access: "PUBLIC" });
  if (!asset) {
    const extension = path.extname(fileName).toLowerCase();
    const storedName = `${opaqueId("catalogue")}${extension}`;
    await fs.mkdir(uploadDirectory, { recursive: true });
    await fs.copyFile(source, path.join(uploadDirectory, storedName));
    asset = await FileAsset.create({ publicId: opaqueId("ast"), originalName: fileName, storedName, mimeType: extension === ".png" ? "image/png" : "image/jpeg", size: bytes.length, sha256: digest, purpose: "CAMPAIGN_MEDIA", access: "PUBLIC" });
  }
  return `${apiBaseUrl}/assets/${asset.publicId}`;
}

async function seedCatalog() {
  await connectDatabase();
  for (const definition of catalogue) {
    const imageUrl = await ensurePublicImage(definition.image);
    const existing = await Competition.findOne({ slug: definition.slug });
    const publicId = existing?.publicId || opaqueId("cmp");
    const instant = definition.instant ? { enabled: true, status: "ACTIVE", wheelMode: "PRESENTATION_ON", allocationCursor: 0, tiers: [{ ...definition.instant, allocatedCount: 0, fulfilmentTerms: "Awarded after eligibility and identity checks; fulfilment within 30 days." }] } : { enabled: false, status: "DISABLED", wheelMode: "PRESENTATION_OFF", tiers: [] };
    const values = {
      publicId, title: definition.title, slug: definition.slug, category: definition.category, description: definition.description, images: [imageUrl], status: "SCHEDULED",
      mainPrize: { kind: definition.prizeKind, title: definition.title, valueMinor: definition.prizeValueMinor, currency: "GBP", secured: true, evidenceRefs: ["CATALOGUE-IMPORT-2026"], fulfilmentTerms: "Winner verification is required. Fulfilment will follow the published competition rules." },
      priceMinor: definition.priceMinor, currency: "GBP", ticketRange: { start: 1, end: 5000, padWidth: 4 }, maxEntriesPerUser: 100, maxEntriesPerOrder: 20,
      startsAt: daysFromNow(1, definition.instant ? 10 : 9), closesAt: daysFromNow(31, 20), drawAt: daysFromNow(32, 19), timezone: "Europe/London",
      rulesVersion: "catalogue-v1", rulesText: "Open to eligible UK residents aged 18 or over. Each valid paid or qualifying free entry receives an equal chance in the independently verified draw. Full eligibility, closing, claim and fulfilment conditions apply.",
      freeEntryInstructions: "Postal entry is available without purchase. Include your full name, address, date of birth, contact details and competition title; it must arrive before the published cutoff.",
      freeEntryApproved: true, paymentProviderApproved: true, legalApproved: true, randomnessAuditApproved: true, agePolicyApproved: true, instant,
    };
    const competition = await Competition.findOneAndUpdate({ slug: definition.slug }, { $set: values, $setOnInsert: { approvals: [] } }, { upsert: true, new: true, runValidators: true });
    const slotCount = await TicketSlot.countDocuments({ competition: competition._id });
    if (!slotCount) {
      const operations = Array.from({ length: 5000 }, (_, index) => ({ competition: competition._id, number: index + 1 }));
      await TicketSlot.insertMany(operations, { ordered: false });
    }
    console.log(`${existing ? "Updated" : "Created"}: ${competition.title} (${competition.publicId})`);
  }
  console.log(`Catalogue ready: ${catalogue.length} database-backed competitions.`);
  process.exit(0);
}

seedCatalog().catch((error) => { console.error(error); process.exit(1); });
