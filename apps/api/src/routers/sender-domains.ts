import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, ownerStoreProcedure } from "../trpc";
import { createSenderDomain, getSenderDomain, requestSenderDomainVerification } from "@allohq/messaging";

const domainSchema = z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
function providerData(data: any) {
  return {
    externalId: String(data.id), status: String(data.status ?? "pending"),
    dnsRecords: Array.isArray(data.records) ? data.records : [], lastCheckedAt: new Date(),
    verifiedAt: data.status === "verified" ? new Date() : null, error: null,
  };
}

export const senderDomainsRouter = router({
  get: ownerStoreProcedure.query(({ ctx, input }) => ctx.prisma.senderDomain.findUnique({ where: { storeId: input.storeId } })),
  configure: ownerStoreProcedure.input(z.object({ domain: domainSchema })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.senderDomain.findUnique({ where: { storeId: input.storeId } });
    if (existing?.domain === input.domain && existing.externalId) return existing;
    if (existing?.externalId && existing.domain !== input.domain) throw new TRPCError({ code: "CONFLICT", message: "A different provider domain is already configured" });
    const provider = await createSenderDomain(input.domain);
    return ctx.prisma.senderDomain.upsert({
      where: { storeId: input.storeId },
      create: { storeId: input.storeId, domain: input.domain, ...providerData(provider) },
      update: { domain: input.domain, ...providerData(provider) },
    });
  }),
  refresh: ownerStoreProcedure.mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.senderDomain.findUnique({ where: { storeId: input.storeId } });
    if (!existing?.externalId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a sender domain first" });
    const provider = await getSenderDomain(existing.externalId);
    return ctx.prisma.senderDomain.update({ where: { storeId: input.storeId }, data: providerData(provider) });
  }),
  verify: ownerStoreProcedure.mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.senderDomain.findUnique({ where: { storeId: input.storeId } });
    if (!existing?.externalId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Configure a sender domain first" });
    await requestSenderDomainVerification(existing.externalId);
    return ctx.prisma.senderDomain.update({ where: { storeId: input.storeId }, data: { status: "pending", error: null, lastCheckedAt: new Date() } });
  }),
});
