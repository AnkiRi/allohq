import { prisma } from "./index";

export function emailDomain(address: string): string | null {
  const match = address.trim().match(/(?:<)?[^<>\s@]+@([^<>\s@]+)>?$/);
  return match?.[1]?.toLowerCase() ?? null;
}

export async function requireVerifiedSenderDomain(storeId: string, fromAddress: string): Promise<void> {
  if (process.env["MESSAGING_SEND_MODE"] !== "live") return;
  const domain = emailDomain(fromAddress);
  if (!domain) throw new Error("Live email blocked: invalid From address");
  const sender = await prisma.senderDomain.findUnique({ where: { storeId } });
  if (!sender || sender.status !== "verified" || sender.domain !== domain) {
    throw new Error(`Live email blocked: sender domain ${domain} is not verified for this store`);
  }
}
