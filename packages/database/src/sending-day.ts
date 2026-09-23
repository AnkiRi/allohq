import type { PrismaClient } from "@prisma/client";

/**
 * What one store sent through one provider during one sending day, counted by
 * the day the message was SENT, whenever its events arrived.
 *
 * That distinction is the point. A complaint that lands two days later is
 * written onto the original message row, so counting by send date picks it up
 * once the day has settled — where a rolling "last 24 hours" window counts the
 * send before its complaint exists.
 *
 * Definitions match the review screen's existing ones, so the numbers a
 * merchant sees do not change meaning.
 */
export async function sendingDayEvidence(
  prisma: PrismaClient,
  input: { storeId: string; provider: "resend" | "ses"; startsAt: Date; endsAt: Date },
) {
  const where = { storeId: input.storeId, provider: input.provider, sentAt: { gte: input.startsAt, lt: input.endsAt } };
  const [attempted, delivered, bounced, complained] = await Promise.all([
    prisma.messageLog.count({ where }),
    prisma.messageLog.count({ where: { ...where, status: { in: ["delivered", "opened", "clicked"] } } }),
    prisma.messageLog.count({ where: { ...where, status: "bounced" } }),
    prisma.messageLog.count({ where: { ...where, error: "spam_complaint" } }),
  ]);
  return { attempted, delivered, bounced, complained };
}

/** Stores that sent anything through each provider during a sending day. */
export async function storesThatSent(
  prisma: PrismaClient,
  input: { startsAt: Date; endsAt: Date },
): Promise<Array<{ storeId: string; provider: "resend" | "ses" }>> {
  const rows = await prisma.messageLog.groupBy({
    by: ["storeId", "provider"],
    where: { provider: { in: ["resend", "ses"] }, sentAt: { gte: input.startsAt, lt: input.endsAt } },
  });
  return rows.map((row) => ({ storeId: row.storeId, provider: row.provider as "resend" | "ses" }));
}
