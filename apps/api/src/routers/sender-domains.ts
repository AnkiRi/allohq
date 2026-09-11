import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, ownerStoreProcedure } from "../trpc";
import { createSenderDomain, getSenderDomain, requestSenderDomainVerification, selectedEmailProvider, type SenderDomainProvider } from "@allohq/messaging";
import { canReuseSenderDomain, conflictsWithConfiguredDomain } from "../lib/sender-domain-provider";

const domainSchema = z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
function providerData(data: any) {
  return {
    externalId: String(data.id), status: String(data.status ?? "pending"),
    dnsRecords: Array.isArray(data.records) ? data.records : [], lastCheckedAt: new Date(),
    verifiedAt: data.status === "verified" ? new Date() : null, error: null,
  };
}

export const senderDomainsRouter = router({
  get: ownerStoreProcedure.query(async ({ ctx, input }) => {
    const [domain, warmup] = await Promise.all([
      ctx.prisma.senderDomain.findUnique({ where: { storeId: input.storeId } }),
      ctx.prisma.sesWarmupState.findUnique({ where: { storeId: input.storeId } }),
    ]);
    return domain ? { ...domain, warmup } : null;
  }),
  configure: ownerStoreProcedure.input(z.object({ domain: domainSchema })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.senderDomain.findUnique({ where: { storeId: input.storeId } });
    const providerName = selectedEmailProvider();
    if (canReuseSenderDomain(existing, input.domain, providerName)) return existing;
    if (conflictsWithConfiguredDomain(existing, input.domain)) throw new TRPCError({ code: "CONFLICT", message: "A different provider domain is already configured" });
    const provider = await createSenderDomain(input.domain, input.storeId);
    return ctx.prisma.senderDomain.upsert({
      where: { storeId: input.storeId },
      create: { storeId: input.storeId, domain: input.domain, provider: providerName, ...providerData(provider) },
      update: { domain: input.domain, provider: providerName, ...providerData(provider) },
    });
  }),
  refresh: ownerStoreProcedure.mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.senderDomain.findUnique({ where: { storeId: input.storeId } });
    if (!existing?.externalId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a sender domain first" });
    const provider = await getSenderDomain(existing.externalId, existing.provider as SenderDomainProvider);
    return ctx.prisma.senderDomain.update({ where: { storeId: input.storeId }, data: providerData(provider) });
  }),
  verify: ownerStoreProcedure.mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.senderDomain.findUnique({ where: { storeId: input.storeId } });
    if (!existing?.externalId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a sender domain first" });
    await requestSenderDomainVerification(existing.externalId, existing.provider as SenderDomainProvider);
    return ctx.prisma.senderDomain.update({ where: { storeId: input.storeId }, data: { status: "pending", error: null, lastCheckedAt: new Date() } });
  }),
  overrideWarmup: ownerStoreProcedure.input(z.object({ reason: z.string().trim().min(12).max(500) })).mutation(async ({ ctx, input }) => {
    const now = new Date();
    return ctx.prisma.sesWarmupState.upsert({ where: { storeId: input.storeId }, create: { storeId: input.storeId, startedAt: now, overrideReason: input.reason, overrideRecordedAt: now }, update: { pausedAt: null, heldUntil: null, overrideReason: input.reason, overrideRecordedAt: now } });
  }),
});
