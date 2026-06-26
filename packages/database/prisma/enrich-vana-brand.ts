/**
 * Enrich the seeded Vana demo BrandProfile so the demo mirrors a fully set-up
 * real user: tone + vocabulary + visual + brand guidelines + send/sender settings.
 * Idempotent (upsert). Run:
 *   pnpm --filter @allohq/database exec tsx prisma/enrich-vana-brand.ts
 */
import "dotenv/config";
import { prisma, DEMO_STORE_DOMAIN, DEMO_WORKSPACE_SLUG } from "../src/index";

const tone = { formality: "casual", energy: "calm", warmth: "warm", humor: "light" };
const vocabulary = {
  preferredWords: ["nourish", "ritual", "plant-powered", "calm", "glow"],
  ctaPatterns: ["Bring it home", "Reorder your ritual"],
  brandTerms: ["Vana", "Naturals"],
  bannedWords: ["cheap", "blast", "hurry", "limited time only"],
};
const visualStyle = {
  aesthetic: "clean_minimal",
  colors: ["#3B5D3A", "#E8E2D5", "#1C1E16"],
  imageStyle: "natural, soft daylight",
};
const sampleCopy = [
  "A quiet ritual for your evenings.",
  "Plant-powered, never preachy.",
];
const brandDocument = `Vana Naturals — brand guidelines

Voice: warm, unhurried, plant-powered. Speak like a knowledgeable friend, never a salesperson.
Do: lead with care and ritual; use ₹ pricing and Indian formatting; keep it calm and specific.
Don't: hype, ALL-CAPS, fake urgency, emoji spam, or discount-led messaging.`;

const settings = {
  sendingFrequency: "balanced",
  fromName: "Vana Naturals",
  fromEmail: "hello@vananaturals.in",
  replyToEmail: "care@vananaturals.in",
};

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { slug: DEMO_WORKSPACE_SLUG } });
  const store = await prisma.store.findFirst({ where: { shopDomain: DEMO_STORE_DOMAIN } });
  if (!workspace || !store) {
    console.log("Vana workspace/store not found — run seed-vana-demo first.");
    return;
  }

  await prisma.brandProfile.upsert({
    where: { workspaceId_storeId: { workspaceId: workspace.id, storeId: store.id } },
    create: {
      workspaceId: workspace.id,
      storeId: store.id,
      brandName: "Vana Naturals",
      brandDescription: "Plant-based wellness for calm, considered self-care.",
      brandDocument,
      toneAttributes: tone,
      vocabulary,
      visualStyle,
      sampleCopy,
      creativeIntensity: "balanced",
      ...settings,
    },
    update: {
      brandName: "Vana Naturals",
      brandDescription: "Plant-based wellness for calm, considered self-care.",
      brandDocument,
      toneAttributes: tone,
      vocabulary,
      visualStyle,
      sampleCopy,
      ...settings,
    },
  });
  console.log("✓ Vana BrandProfile enriched (guidelines + settings + tone/visual).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
