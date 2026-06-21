/**
 * Backfill the cross-brand Identity layer (additive, idempotent).
 *
 * For every Customer that has an email or phone, this upserts an Identity keyed
 * on the normalized email/phone and sets Customer.identityId. One Identity per
 * unique person across stores: the SAME normalized phone/email seen in two
 * different stores links both Customers to the SAME Identity.
 *
 * Single-brand behavior is unaffected — identityId is nullable and nothing reads
 * it yet. This only populates the column.
 *
 * Run with: tsx packages/database/scripts/backfill-identities.ts
 * (DATABASE_URL must point at the target Postgres.)
 *
 * Idempotent: re-running is safe. It reuses existing Identities (matched by
 * normalized phone, then email) and never duplicates them.
 */
import { prisma, normalizeEmail, normalizePhone } from "../src/index";

async function main() {
  const startedAt = Date.now();

  // Pull only what we need, in stable id order, paginated to stay memory-bound.
  const PAGE = 1000;
  let cursor: string | undefined;
  let scanned = 0;
  let skippedNoKey = 0;
  let alreadyLinked = 0;
  let linked = 0;

  // Local maps so multiple Customers sharing a key within this run reuse the
  // same Identity without extra round-trips. Keyed by `phone:<x>` / `email:<x>`.
  const keyToIdentityId = new Map<string, string>();
  const createdIdentityIds = new Set<string>();

  for (;;) {
    const batch = await prisma.customer.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: "asc" },
      take: PAGE,
      select: {
        id: true,
        email: true,
        phone: true,
        identityId: true,
      },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const customer of batch) {
      scanned++;

      const normEmail = normalizeEmail(customer.email);
      const normPhone = normalizePhone(customer.phone);

      if (!normEmail && !normPhone) {
        skippedNoKey++;
        continue;
      }

      if (customer.identityId) {
        alreadyLinked++;
        continue;
      }

      const identityId = await resolveIdentityId(
        normPhone,
        normEmail,
        keyToIdentityId,
        createdIdentityIds,
      );

      await prisma.customer.update({
        where: { id: customer.id },
        data: { identityId },
      });
      linked++;
    }

    if (batch.length < PAGE) break;
  }

  const elapsedMs = Date.now() - startedAt;

  console.log("Identity backfill complete:");
  console.log(`  customers scanned:        ${scanned}`);
  console.log(`  skipped (no email/phone): ${skippedNoKey}`);
  console.log(`  already linked (skipped): ${alreadyLinked}`);
  console.log(`  customers linked now:     ${linked}`);
  console.log(`  identities created now:   ${createdIdentityIds.size}`);
  console.log(`  elapsed:                  ${elapsedMs}ms`);
}

/**
 * Find-or-create the Identity for a (phone, email) pair.
 *
 * Prefers an existing match on phone, then email, so the same person collapses
 * to one Identity even if only one key matches a prior row. If neither exists,
 * creates a new Identity carrying both keys.
 *
 * Uniqueness on normalizedPhone/normalizedEmail makes this concurrency-safe and
 * idempotent across re-runs.
 */
async function resolveIdentityId(
  normPhone: string | null,
  normEmail: string | null,
  keyToIdentityId: Map<string, string>,
  createdIdentityIds: Set<string>,
): Promise<string> {
  const phoneKey = normPhone ? `phone:${normPhone}` : null;
  const emailKey = normEmail ? `email:${normEmail}` : null;

  // In-run cache.
  if (phoneKey && keyToIdentityId.has(phoneKey)) {
    return keyToIdentityId.get(phoneKey)!;
  }
  if (emailKey && keyToIdentityId.has(emailKey)) {
    return keyToIdentityId.get(emailKey)!;
  }

  // Existing Identity in DB (phone preferred, then email).
  let identity =
    (normPhone
      ? await prisma.identity.findUnique({
          where: { normalizedPhone: normPhone },
        })
      : null) ??
    (normEmail
      ? await prisma.identity.findUnique({
          where: { normalizedEmail: normEmail },
        })
      : null);

  if (!identity) {
    try {
      identity = await prisma.identity.create({
        data: {
          normalizedPhone: normPhone,
          normalizedEmail: normEmail,
        },
      });
      createdIdentityIds.add(identity.id);
    } catch {
      // Lost a race on a unique key — re-read the now-existing Identity.
      identity =
        (normPhone
          ? await prisma.identity.findUnique({
              where: { normalizedPhone: normPhone },
            })
          : null) ??
        (normEmail
          ? await prisma.identity.findUnique({
              where: { normalizedEmail: normEmail },
            })
          : null);
      if (!identity) throw new Error("Failed to resolve Identity after race");
    }
  }

  if (phoneKey) keyToIdentityId.set(phoneKey, identity.id);
  if (emailKey) keyToIdentityId.set(emailKey, identity.id);
  return identity.id;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
