import { Resend } from "resend";

function client(): Resend {
  const key = process.env["RESEND_API_KEY"];
  if (!key) throw new Error("RESEND_API_KEY environment variable is not set");
  return new Resend(key);
}

export async function createSenderDomain(domain: string) {
  const { data, error } = await client().domains.create({ name: domain });
  if (error || !data) throw new Error(error?.message ?? "Resend created no domain");
  return data;
}

export async function getSenderDomain(externalId: string) {
  const { data, error } = await client().domains.get(externalId);
  if (error || !data) throw new Error(error?.message ?? "Resend returned no domain");
  return data;
}

export async function requestSenderDomainVerification(externalId: string) {
  const { data, error } = await client().domains.verify(externalId);
  if (error || !data) throw new Error(error?.message ?? "Resend did not start verification");
  return data;
}
