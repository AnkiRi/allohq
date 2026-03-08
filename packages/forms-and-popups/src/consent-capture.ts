import { prisma } from "@allohq/database";
import type { ConsentState } from "./types";

/**
 * Record a form submission and handle consent + customer creation/update.
 * Returns the submission ID and any created/linked customer ID.
 */
export async function captureSubmission(opts: {
  formId: string;
  storeId: string;
  data: Record<string, unknown>;
  source: string;
  consent?: ConsentState;
}): Promise<{ submissionId: string; customerId: string | null }> {
  const email = opts.data["email"] as string | undefined;
  const phone = opts.data["phone"] as string | undefined;
  let customerId: string | null = null;

  // Find or create customer if email provided
  if (email) {
    const existing = await prisma.customer.findFirst({
      where: { storeId: opts.storeId, email },
    });

    if (existing) {
      customerId = existing.id;

      // Update marketing consent if they opted in
      if (opts.consent?.email) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { acceptsMarketing: true },
        });
      }

      // Update phone if provided and missing
      if (phone && !existing.phone) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: { phone },
        });
      }
    } else {
      // Create new customer from form submission
      const firstName = (opts.data["firstName"] as string) ?? (opts.data["name"] as string) ?? undefined;
      const customer = await prisma.customer.create({
        data: {
          storeId: opts.storeId,
          externalId: `form-${Date.now()}`, // placeholder until Shopify sync
          email,
          phone: phone ?? undefined,
          firstName,
          acceptsMarketing: opts.consent?.email ?? false,
        },
      });
      customerId = customer.id;
    }
  }

  // Create submission record
  const submission = await prisma.formSubmission.create({
    data: {
      formId: opts.formId,
      customerId,
      data: JSON.parse(JSON.stringify(opts.data)),
      source: opts.source,
      consentGiven: opts.consent
        ? JSON.parse(JSON.stringify(opts.consent))
        : undefined,
    },
  });

  return { submissionId: submission.id, customerId };
}

/**
 * Get consent state for a customer across all their form submissions.
 */
export async function getCustomerConsent(
  customerId: string
): Promise<ConsentState> {
  const submissions = await prisma.formSubmission.findMany({
    where: { customerId },
    select: { consentGiven: true },
    orderBy: { capturedAt: "desc" },
  });

  // Merge consent — latest submission wins per channel
  const consent: ConsentState = {};
  for (const sub of submissions) {
    const given = sub.consentGiven as unknown as ConsentState | null;
    if (given) {
      if (consent.email === undefined && given.email !== undefined) consent.email = given.email;
      if (consent.sms === undefined && given.sms !== undefined) consent.sms = given.sms;
      if (consent.whatsapp === undefined && given.whatsapp !== undefined) consent.whatsapp = given.whatsapp;
    }
  }

  return consent;
}

/**
 * List submissions for a form with optional pagination.
 */
export async function listSubmissions(
  formId: string,
  opts?: { limit?: number; cursor?: string }
) {
  return prisma.formSubmission.findMany({
    where: { formId },
    include: {
      customer: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
    orderBy: { capturedAt: "desc" },
    take: opts?.limit ?? 50,
    ...(opts?.cursor
      ? { skip: 1, cursor: { id: opts.cursor } }
      : {}),
  });
}
