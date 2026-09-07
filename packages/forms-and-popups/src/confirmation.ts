import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@allohq/database";

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export async function canSendConsentConfirmation(customerId: string): Promise<boolean> {
  const blocked = await prisma.contactSuppression.findFirst({
    where: { customerId, channel: "email", reason: "hard_bounce" },
    select: { id: true },
  });
  return !blocked;
}

export async function createConsentConfirmation(customerId: string, storeId: string, channel: "email" | "sms", submissionId?: string) {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.consentConfirmation.deleteMany({ where: { customerId, channel, usedAt: null } }),
    prisma.consentConfirmation.create({ data: { customerId, storeId, channel, submissionId, tokenHash: digest(token), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } }),
    prisma.contactConsent.update({ where: { customerId_channel: { customerId, channel } }, data: { status: "pending_confirmation", collectedAt: null } }),
    ...(channel === "email" ? [prisma.customer.update({ where: { id: customerId }, data: { acceptsMarketing: false } })] : []),
  ]);
  return token;
}

export async function redeemConsentConfirmation(token: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const confirmation = await tx.consentConfirmation.findUnique({ where: { tokenHash: digest(token) } });
    if (!confirmation || confirmation.usedAt || confirmation.expiresAt <= now) return null;
    const claimed = await tx.consentConfirmation.updateMany({ where: { id: confirmation.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claimed.count !== 1) return null;
    await tx.contactConsent.update({ where: { customerId_channel: { customerId: confirmation.customerId, channel: confirmation.channel } }, data: { status: "opted_in", collectedAt: now, revokedAt: null } });
    if (confirmation.channel === "email") await tx.customer.update({ where: { id: confirmation.customerId }, data: { acceptsMarketing: true } });
    return confirmation;
  });
}
