import { prisma } from "./index";

export type SenderProvider = "resend" | "ses";

export async function getStoreSenderIdentity(storeId: string, provider: SenderProvider) {
  const current = await prisma.senderProviderIdentity.findUnique({
    where: { storeId_provider: { storeId, provider } },
  });
  if (current) return current;
  // Existing installations remain valid during the additive backfill.
  const legacy = await prisma.senderDomain.findUnique({ where: { storeId } });
  return legacy?.provider === provider ? legacy : null;
}

export function emailDomain(address: string): string | null {
  const match = address.trim().match(/(?:<)?[^<>\s@]+@([^<>\s@]+)>?$/);
  return match?.[1]?.toLowerCase() ?? null;
}

export function verifiedSenderMatchesProvider(
  sender: { domain: string; status: string; provider: string } | null,
  fromDomain: string,
  provider: SenderProvider,
): boolean {
  return sender?.status === "verified" &&
    sender.domain === fromDomain &&
    sender.provider === provider;
}

export async function requireVerifiedSenderDomain(storeId: string, fromAddress: string): Promise<void> {
  const provider = process.env["EMAIL_PROVIDER"] === "ses" ? "ses" : "resend";
  const mode = process.env["MESSAGING_SEND_MODE"];
  // Keep the existing Resend allowlist/demo path unchanged. An SES allowlist
  // rehearsal must still prove its own identity before a real provider call.
  if (mode !== "live" && !(mode === "allowlist" && provider === "ses")) return;
  const domain = emailDomain(fromAddress);
  if (!domain) throw new Error("Email blocked: invalid From address");
  const sender = await getStoreSenderIdentity(storeId, provider);
  if (!verifiedSenderMatchesProvider(sender, domain, provider)) {
    throw new Error(`Email blocked: sender domain ${domain} is not verified for ${provider} on this store`);
  }
}
