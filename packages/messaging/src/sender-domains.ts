import { Resend } from "resend";
import { selectedEmailProvider } from "./channels/email/provider";
import { SesProvisioningService } from "./ses-admin";

export type SenderDomainProvider = "resend" | "ses";

function client(): Resend {
  const key = process.env["RESEND_API_KEY"];
  if (!key) throw new Error("RESEND_API_KEY environment variable is not set");
  return new Resend(key);
}

export async function createSenderDomain(domain: string, storeId?: string) {
  if (selectedEmailProvider() === "ses") {
    if (!storeId) throw new Error("storeId is required to provision an SES tenant");
    const result = await new SesProvisioningService().provisionStore(storeId, domain);
    return { id: domain, status: "pending", records: [...result.dkimTokens.map((token: string) => ({ type: "CNAME", name: `${token}._domainkey.${domain}`, value: `${token}.dkim.amazonses.com` })), { type: "MX", name: result.mailFromDomain, value: `10 feedback-smtp.${process.env["AWS_SES_REGION"] || "ap-south-1"}.amazonses.com` }, { type: "TXT", name: result.mailFromDomain, value: "v=spf1 include:amazonses.com ~all" }] };
  }
  const { data, error } = await client().domains.create({ name: domain });
  if (error || !data) throw new Error(error?.message ?? "Resend created no domain");
  return data;
}

export async function getSenderDomain(externalId: string, provider: SenderDomainProvider = selectedEmailProvider()) {
  if (provider === "ses") {
    const data = await new SesProvisioningService().domainStatus(externalId);
    const region = process.env["AWS_SES_REGION"] || "ap-south-1";
    const mailFromDomain = `mail.${externalId}`;
    const tokens = data.DkimAttributes?.Tokens ?? [];
    return {
      id: externalId,
      status: data.VerificationStatus === "SUCCESS" && data.DkimAttributes?.Status === "SUCCESS" ? "verified" : String(data.VerificationStatus || "pending").toLowerCase(),
      records: [
        ...tokens.map((token: string) => ({ type: "CNAME", name: `${token}._domainkey.${externalId}`, value: `${token}.dkim.amazonses.com` })),
        { type: "MX", name: mailFromDomain, value: `10 feedback-smtp.${region}.amazonses.com` },
        { type: "TXT", name: mailFromDomain, value: "v=spf1 include:amazonses.com ~all" },
      ],
    };
  }
  const { data, error } = await client().domains.get(externalId);
  if (error || !data) throw new Error(error?.message ?? "Resend returned no domain");
  return data;
}

export async function requestSenderDomainVerification(externalId: string, provider: SenderDomainProvider = selectedEmailProvider()) {
  if (provider === "ses") return getSenderDomain(externalId, provider);
  const { data, error } = await client().domains.verify(externalId);
  if (error || !data) throw new Error(error?.message ?? "Resend did not start verification");
  return data;
}
