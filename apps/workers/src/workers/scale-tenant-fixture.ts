import { randomUUID } from "node:crypto";

/**
 * The synthetic tenant every scale proof seeds.
 *
 * Extracted from the one-million single-tenant proof so the five-tenant proof
 * seeds the SAME shape rather than a second, drifting copy of it. If these
 * diverged, the five-tenant result would not be comparable to the 1M result
 * it is supposed to extend, and a fixture difference would read as a scaling
 * finding.
 *
 * Everything here is synthetic and disposable: no Shopify, no provider, no
 * real recipient. `SPARSE_STRATA` reserves deliberately tiny strata at the
 * start of each cohort so sub-ten pooling is exercised rather than being code
 * that never runs at scale.
 */
export const BATCH = 10_000;
export const SPARSE_STRATA = 8;
export const SPARSE_PER_STRATUM = 5;
export const SPARSE_TOTAL = SPARSE_STRATA * SPARSE_PER_STRATUM;

export type SeededTenant = {
  workspaceId: string;
  storeId: string;
  campaignId: string;
  expected: { invalid: number; noConsent: number; recentPurchase: number };
};

export async function seedTenant(prisma: any, size: number, label: string): Promise<SeededTenant> {
  const suffix = `${label}-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const workspace = await prisma.workspace.create({ data: { name: `M ${suffix}`, slug: `m-${suffix}` } });
  const store = await prisma.store.create({
    data: { workspaceId: workspace.id, platform: "shopify", shopDomain: `m-${suffix}.myshopify.com`,
      accessToken: "isolated-test-token", installedAt: new Date("2020-01-01T00:00:00.000Z"), timezone: "UTC" },
  });
  const template = await prisma.emailTemplate.create({
    data: { workspaceId: workspace.id, name: `M ${suffix}`, subject: "A note", previewText: "p",
      blocks: [{ id: "b1", type: "text", props: { html: "<p>Hello</p>" } }] },
  });
  const campaign = await prisma.campaign.create({
    // A discount campaign: this is what makes the full-price-inside-cycle rule
    // applicable at all, so loyal full-price customers can be left alone.
    data: { workspaceId: workspace.id, storeId: store.id, name: `M ${suffix}`, templateId: template.id,
      status: "draft", agentProposal: { discountPercent: 15, discountCode: `SAVE${suffix.slice(-4)}` } },
  });
  const product = await prisma.product.create({
    data: { storeId: store.id, externalId: `p-${suffix}`, handle: `p-${suffix}`, title: "Staple",
      price: 100, status: "active", variants: { create: [{ externalId: `v-${suffix}`, title: "d", price: 100, inventory: 5 }] } },
  });
  await prisma.productRepurchaseCycle.create({
    data: { productId: product.id, storeId: store.id, medianDays: 10, avgDays: 10, sampleSize: 40, confidence: 0.9 },
  });

  const now = Date.now();
  const expected = { invalid: 0, noConsent: 0, recentPurchase: 0 };
  for (let offset = 0; offset < size; offset += BATCH) {
    const take = Math.min(BATCH, size - offset);
    await prisma.customer.createMany({
      data: Array.from({ length: take }, (_, index) => {
        const n = offset + index;
        const sparse = n < SPARSE_TOTAL;        // reserved for pooled-stratum coverage
        const invalid = !sparse && n % 97 === 0;           // undeliverable address
        const noConsent = !sparse && !invalid && n % 11 === 0; // never opted in
        if (invalid) expected.invalid += 1;
        if (noConsent) expected.noConsent += 1;
        return {
          storeId: store.id,
          externalId: `e-${n}`,
          email: invalid ? `broken-${n}-at-example` : `m-${suffix}-${n}@example.test`,
          acceptsMarketing: !noConsent,
        };
      }),
    });
  }

  let cursor: string | undefined;
  let seen = 0;
  for (;;) {
    const page = await prisma.customer.findMany({
      where: { storeId: store.id, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true }, orderBy: { id: "asc" }, take: BATCH,
    });
    if (page.length === 0) break;

    // Strata: five large ones, plus deliberately tiny ones at the very start so
    // sub-ten pooling is exercised.
    await prisma.rfmScore.createMany({
      data: page.map((c: { id: string }, i: number) => {
        const n = seen + i;
        return { customerId: c.id, storeId: store.id, recency: 3, frequency: 3, monetary: 3, totalScore: 9,
          segment: n < SPARSE_TOTAL
            ? `tiny_${Math.floor(n / SPARSE_PER_STRATUM)}`
            : ["champions","loyal","at_risk","hibernating","new"][n % 5]! };
      }),
    });
    // Loyal full-price buyers Joon leaves alone, plus ordinary states.
    await prisma.customerState.createMany({
      data: page.map((c: { id: string }, i: number) => {
        const n = seen + i;
        // Every thirteenth customer is a loyal full-price buyer inside their
        // buying rhythm: Joon leaves these alone rather than discounting to
        // someone who would have paid full price.
        const leaveAlone = n >= SPARSE_TOTAL && n % 13 === 0;
        return { storeId: store.id, customerId: c.id,
          lifecycleStage: n % 4 === 0 ? "loyal" : n % 4 === 1 ? "at_risk" : "repeat",
          vipLevel: n % 9 === 0 ? "gold" : "none",
          discountBehavior: leaveAlone ? "full_price_likely" : "mixed",
          purchaseCyclePosition: leaveAlone ? "early" : "due",
          medianOrderIntervalDays: 30,
          nextExpectedOrderAt: new Date(now + 20 * 86_400_000),
          stateEvidence: leaveAlone ? { fullPriceOrderCount: 4, orderCount: 5 } : {},
          churnRisk: 0.3 };
      }),
    });
    // Recent purchasers: excluded by the recent-purchase window.
    const recent = page.filter((_: unknown, i: number) => seen + i >= SPARSE_TOTAL && (seen + i) % 23 === 0);
    if (recent.length) {
      expected.recentPurchase += recent.length;
      await prisma.order.createMany({
        data: recent.map((c: { id: string }, i: number) => ({
          storeId: store.id, customerId: c.id, externalId: `o-${seen + i}-${suffix}`,
          orderNumber: `#${seen + i}`, totalPrice: 100, subtotal: 100, tax: 0, shipping: 0,
          status: "paid", createdAt: new Date(now - 1 * 86_400_000) })),
      });
    }
    // Fatigue holds.
    const fatigued = page.filter((_: unknown, i: number) => seen + i >= SPARSE_TOTAL && (seen + i) % 37 === 0);
    if (fatigued.length) {
      await prisma.customerFatigueLog.createMany({
        data: fatigued.flatMap((c: { id: string }) => Array.from({ length: 6 }, (_, k) => ({
          customerId: c.id, storeId: store.id, channel: "email", messageType: "campaign",
          sentAt: new Date(now - (k + 1) * 3_600_000) })) ),
      });
    }
    seen += page.length;
    cursor = page[page.length - 1]!.id;
  }
  await prisma.$executeRawUnsafe("ANALYZE");
  return { workspaceId: workspace.id, storeId: store.id, campaignId: campaign.id, expected };
}
