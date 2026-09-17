import { z } from "zod";
import { router, workspaceProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { Queue } from "bullmq";
import { buildHumanDecision } from "../lib/human-decision";
import {
  campaignApprovalClaimWhere,
  campaignDispatchFailureUpdate,
} from "../lib/campaign-approval";
import {
  DEMO_STORE_DOMAIN,
  emailMessagingCostForCurrency,
  type PrismaClient,
} from "@allohq/database";
import {
  AUDIENCE_EXCLUSION_REASONS,
  campaignApprovalChecksum,
  findBannedTerms,
  resolveCampaignAudience,
  withCampaignAudienceSnapshot,
} from "@allohq/campaign-engine";
import {
  assignStratifiedCohortArms,
  campaignMeasurementPolicy,
  getOrCreateExperiment,
  holdoutRateFor,
} from "@allohq/customer-state";
import { DELIVERY_WINDOWS, getTimingProfiles, localHour } from "@allohq/customer-intelligence";
import {
  checkQuietHours,
  loadStoreGovernorConfig,
  nextLocalHour,
} from "@allohq/communication-governor";

const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  password: process.env["REDIS_PASSWORD"],
};

const emailSendQueue = new Queue("email-send", { connection: redisConnection });

async function queuedCampaignJobs(campaignId: string) {
  const jobs = await emailSendQueue.getJobs(["delayed", "waiting", "paused"], 0, 10_000);
  return jobs.filter(
    (job) => (job.data as { campaignId?: unknown } | null)?.campaignId === campaignId
  );
}

function campaignFamily(proposal: unknown): string {
  const value = (proposal ?? {}) as {
    intent?: unknown;
    discountPercent?: unknown;
    discountCode?: unknown;
  };
  const intent =
    typeof value.intent === "string" && value.intent.trim() ? value.intent.trim() : "broadcast";
  const discounted =
    (typeof value.discountPercent === "number" && value.discountPercent > 0) ||
    (typeof value.discountCode === "string" && value.discountCode.trim().length > 0);
  return `${intent}:${discounted ? "discount" : "full_price"}`;
}

function replaceDiscountPercent(value: unknown, fromPercent: number, toPercent: number): unknown {
  if (typeof value === "string") {
    return value
      .replace(new RegExp(`\\b${fromPercent}\\s*%`, "g"), `${toPercent}%`)
      .replace(new RegExp(`\\b${fromPercent}\\s+percent\\b`, "gi"), `${toPercent}%`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceDiscountPercent(item, fromPercent, toPercent));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceDiscountPercent(item, fromPercent, toPercent),
      ])
    );
  }
  return value;
}

function planCampaignHoldout(
  storeId: string,
  assignmentSeed: string,
  proposal: unknown,
  eligible: Array<{ id: string; rfmStratum: string | null }>,
  evidence: Parameters<typeof holdoutRateFor>[3] = null
) {
  const family = campaignFamily(proposal);
  const decision = holdoutRateFor(storeId, family, "all", evidence);
  const assignment = assignStratifiedCohortArms({
    assignmentSeed,
    customers: eligible.map((customer) => ({
      customerId: customer.id,
      stratum: customer.rfmStratum,
    })),
    rateForStratum: (stratum) => holdoutRateFor(storeId, family, stratum, evidence).rate,
  });
  return { family, decision, assignment };
}

async function campaignEvidence(prisma: PrismaClient, storeId: string, family: string) {
  const ledgers = await prisma.causedRevenueLedger.findMany({
    where: { storeId, family, tier: "measurement_ready", overlapsAnotherUnit: false },
    orderBy: [{ unitId: "asc" }, { version: "desc" }],
  });
  const latest = [
    ...ledgers
      .reduce((map, row) => {
        if (!map.has(row.unitId)) map.set(row.unitId, row);
        return map;
      }, new Map<string, (typeof ledgers)[number]>())
      .values(),
  ];
  const measurable = latest.filter((row) => row.intervalLow !== null && row.intervalHigh !== null);
  const caused = measurable.reduce((sum, row) => sum + Number(row.causedRevenue), 0);
  const pooledVariance = measurable.reduce((sum, row) => {
    const standardError = (Number(row.intervalHigh) - Number(row.intervalLow)) / (2 * 1.96);
    return sum + standardError ** 2;
  }, 0);
  const margin = 1.96 * Math.sqrt(pooledVariance);
  return {
    measurementReadyNonOverlappingUnits: measurable.length,
    pooledCiLow: measurable.length ? caused - margin : null,
    pooledCiHigh: measurable.length ? caused + margin : null,
  };
}

export const campaignsRouter = router({
  overrideDiscount: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        discountPercent: z.number().int().min(1).max(90),
        reason: z.string().trim().min(5).max(240),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["draft", "scheduled"] },
        },
        include: { template: true },
      });
      if (!campaign?.template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found, already sent, or missing its email creative.",
        });
      }
      const proposal = (campaign.agentProposal ?? {}) as Record<string, unknown>;
      const currentPercent = Number(proposal.discountPercent ?? 0);
      if (!Number.isFinite(currentPercent) || currentPercent <= 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This campaign does not currently contain a percentage discount.",
        });
      }
      if (currentPercent === input.discountPercent) {
        return { changed: false, discountPercent: currentPercent };
      }

      const subject = replaceDiscountPercent(
        campaign.template.subject,
        currentPercent,
        input.discountPercent
      ) as string;
      const previewText = campaign.template.previewText
        ? (replaceDiscountPercent(
            campaign.template.previewText,
            currentPercent,
            input.discountPercent
          ) as string)
        : null;
      const blocks = replaceDiscountPercent(
        campaign.template.blocks,
        currentPercent,
        input.discountPercent
      );
      const name = replaceDiscountPercent(
        campaign.name,
        currentPercent,
        input.discountPercent
      ) as string;
      const changedAt = new Date().toISOString();

      await ctx.prisma.$transaction([
        ctx.prisma.emailTemplate.update({
          where: { id: campaign.template.id },
          data: { subject, previewText, blocks: blocks as any, html: null },
        }),
        ctx.prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            name,
            status: "draft",
            approvedAt: null,
            approvalChecksum: null,
            agentProposal: {
              ...proposal,
              discountPercent: input.discountPercent,
              discountAdjustedByGuardrail: false,
              merchantOfferOverride: {
                fromPercent: currentPercent,
                toPercent: input.discountPercent,
                reason: input.reason,
                actorId: ctx.userId,
                changedAt,
              },
            } as any,
          },
        }),
      ]);

      return { changed: true, discountPercent: input.discountPercent };
    }),

  timingPreview: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        select: { id: true, storeId: true },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const audience = await resolveCampaignAudience(campaign.id);
      const customerIds = audience.eligible.map((customer) => customer.id);
      const profiles = await getTimingProfiles(campaign.storeId, customerIds);
      const governor = await loadStoreGovernorConfig(campaign.storeId);
      const now = new Date();
      const cohorts = new Map<
        string,
        {
          window: "morning" | "afternoon" | "evening";
          timezone: string;
          source: "customer" | "store" | "default";
          confidence: number;
          count: number;
          earliestAt: Date;
          latestAt: Date;
        }
      >();
      let quietHoursDeferred = 0;
      const bestDayEvidence: Record<string, number> = {};
      for (const profile of profiles.values()) {
        const definition = DELIVERY_WINDOWS[profile.window];
        const hour = localHour(now, profile.timezone);
        const start =
          hour >= definition.startHour && hour < definition.endHour
            ? now
            : nextLocalHour(now, definition.startHour, profile.timezone);
        // Quiet hours constrain the planned window, not the instant the merchant
        // happens to open this preview. Checking `now` made a future morning
        // window look as if it were waiting for quiet hours to end.
        const quiet = checkQuietHours(profile.timezone, governor.quietHours, start);
        const plannedStart = quiet.allowed ? start : quiet.delayUntil!;
        const plannedEnd = new Date(
          plannedStart.getTime() + (definition.endHour - definition.startHour) * 60 * 60 * 1000
        );
        if (!quiet.allowed) quietHoursDeferred++;
        if (profile.bestDayOfWeek != null) {
          const day = String(profile.bestDayOfWeek);
          bestDayEvidence[day] = (bestDayEvidence[day] ?? 0) + 1;
        }
        const key = `${profile.timezone}:${profile.window}:${profile.source}`;
        const current = cohorts.get(key);
        if (current) {
          current.count++;
          current.confidence += profile.confidence;
          if (plannedStart < current.earliestAt) current.earliestAt = plannedStart;
          if (plannedEnd > current.latestAt) current.latestAt = plannedEnd;
        } else {
          cohorts.set(key, {
            window: profile.window,
            timezone: profile.timezone,
            source: profile.source,
            confidence: profile.confidence,
            count: 1,
            earliestAt: plannedStart,
            latestAt: plannedEnd,
          });
        }
      }
      const rows = [...cohorts.values()]
        .map((cohort) => ({ ...cohort, confidence: cohort.confidence / cohort.count }))
        .sort((left, right) => right.count - left.count);
      return {
        available: customerIds.length > 0 && rows.length > 0,
        recipients: customerIds.length,
        cohortCount: rows.length,
        timezoneCount: new Set(rows.map((row) => row.timezone)).size,
        quietHoursDeferred,
        dayPolicy:
          "The merchant controls the campaign day; Joon uses engagement evidence to choose the delivery window on that day.",
        bestDayEvidence,
        earliestAt: rows.length
          ? new Date(Math.min(...rows.map((row) => row.earliestAt.getTime())))
          : null,
        latestAt: rows.length
          ? new Date(Math.max(...rows.map((row) => row.latestAt.getTime())))
          : null,
        evidence: {
          customer: rows
            .filter((row) => row.source === "customer")
            .reduce((sum, row) => sum + row.count, 0),
          store: rows
            .filter((row) => row.source === "store")
            .reduce((sum, row) => sum + row.count, 0),
          default: rows
            .filter((row) => row.source === "default")
            .reduce((sum, row) => sum + row.count, 0),
        },
        cohorts: rows.slice(0, 100),
      };
    }),

  setAudienceReasonOverride: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        reasonCode: z.enum([
          "deliberately_left_alone",
          "recent_purchase",
          "fatigue",
          "collision",
          "cooldown",
        ]),
        enabled: z.boolean(),
        reason: z.string().trim().min(5).max(240),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["draft", "scheduled"] },
        },
        select: { id: true, storeId: true },
      });
      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found or its audience is already frozen",
        });
      }

      let affected = 0;
      if (input.enabled) {
        const audience = await resolveCampaignAudience(campaign.id, new Date(), {
          enforceDeliveryPauses: false,
        });
        affected =
          input.reasonCode === "deliberately_left_alone"
            ? audience.deliberatelyLeftAlone.length
            : input.reasonCode === "recent_purchase"
              ? audience.recentPurchaseExcluded.length
              : input.reasonCode === "fatigue"
                ? audience.fatigueExcluded.length
                : input.reasonCode === "collision"
                  ? audience.collisionExcluded.length
                  : audience.cooldownExcluded.length;
        if (affected === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No customers are currently held back for this reason.",
          });
        }
      }

      await ctx.prisma.$transaction([
        ctx.prisma.campaignAudienceOverridePolicy.upsert({
          where: {
            campaignId_reasonCode: {
              campaignId: campaign.id,
              reasonCode: input.reasonCode,
            },
          },
          create: {
            campaignId: campaign.id,
            storeId: campaign.storeId,
            reasonCode: input.reasonCode,
            justification: input.reason,
            actorId: ctx.userId,
            active: input.enabled,
            evidence: {
              affectedAtDecision: affected,
              capturedAt: new Date().toISOString(),
            },
          },
          update: {
            justification: input.reason,
            actorId: ctx.userId,
            active: input.enabled,
            evidence: {
              affectedAtDecision: affected,
              capturedAt: new Date().toISOString(),
            },
          },
        }),
        ctx.prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "draft", approvedAt: null, approvalChecksum: null },
        }),
      ]);
      return { success: true, enabled: input.enabled, affected };
    }),

  audienceReview: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.enum([...AUDIENCE_EXCLUSION_REASONS, "deliberately_left_alone"]),
        query: z.string().trim().max(120).default(""),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(10).max(50).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        select: {
          id: true,
          storeId: true,
          audienceOverridePolicies: {
            where: { active: true, mode: "all_current" },
            select: { reasonCode: true, justification: true, actorId: true, updatedAt: true },
          },
        },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });

      const audience = await resolveCampaignAudience(campaign.id, new Date(), {
        enforceDeliveryPauses: false,
      });
      const base =
        input.reason === "deliberately_left_alone"
          ? audience.deliberatelyLeftAlone
          : (audience.excludedCustomers[input.reason] ?? []);
      const needle = input.query.toLocaleLowerCase();
      const filtered = needle
        ? base.filter((customer) =>
            [customer.firstName, customer.lastName, customer.email]
              .filter(Boolean)
              .join(" ")
              .toLocaleLowerCase()
              .includes(needle)
          )
        : base;
      const total = filtered.length;
      const pageCount = Math.max(1, Math.ceil(total / input.pageSize));
      const page = Math.min(input.page, pageCount);
      const pageRows = filtered.slice((page - 1) * input.pageSize, page * input.pageSize);
      const details = pageRows.length
        ? await ctx.prisma.customer.findMany({
            where: { storeId: campaign.storeId, id: { in: pageRows.map((row) => row.id) } },
            select: {
              id: true,
              rfmScore: { select: { segment: true } },
              customerState: {
                select: {
                  lifecycleStage: true,
                  purchaseCyclePosition: true,
                  discountBehavior: true,
                  medianOrderIntervalDays: true,
                  nextExpectedOrderAt: true,
                  nextEvaluationAt: true,
                  stateEvidence: true,
                },
              },
            },
          })
        : [];
      const detailById = new Map(details.map((row) => [row.id, row]));
      const decisionById = new Map(
        audience.deliberatelyLeftAlone.map((row) => [row.id, row.decision])
      );
      const overridePolicy = {
        recent_purchase: "allowed",
        fatigue: "warning",
        collision: "warning",
        cooldown: "strong_warning",
        deliberately_left_alone: "allowed",
      } as const;
      const activeGroupOverride =
        campaign.audienceOverridePolicies.find((policy) => policy.reasonCode === input.reason) ??
        null;
      const reconsideration = {
        recent_purchase: "After the recent-purchase protection window ends",
        fatigue: "When the weekly or monthly email limit resets",
        collision: "After the campaign-spacing window ends",
        cooldown: "After the redeemed-discount cooldown ends",
        support_state: "After the active support issue is resolved",
        no_consent: "When the customer explicitly subscribes to marketing email",
        unsubscribed: "Only after the customer explicitly subscribes again",
        complaint: "Not automatically; complaint suppression remains mandatory",
        hard_bounce: "Not automatically; a valid deliverable address is required",
        invalid_email: "After a valid email address is synchronized",
        manual_suppression: "After an authorized user removes the suppression",
        already_processed: "Never for this frozen campaign version",
        deliberately_left_alone: "When the customer state or campaign context changes",
      } as const;

      return {
        reason: input.reason,
        total,
        page,
        pageSize: input.pageSize,
        pageCount,
        overridePolicy: overridePolicy[input.reason as keyof typeof overridePolicy] ?? "blocked",
        activeGroupOverride,
        reconsideration:
          reconsideration[input.reason as keyof typeof reconsideration] ??
          "When the underlying delivery condition changes",
        customers: pageRows.map((row) => {
          const detail = detailById.get(row.id);
          const state = detail?.customerState;
          const decision = decisionById.get(row.id);
          return {
            id: row.id,
            email: row.email,
            firstName: row.firstName,
            lastName: row.lastName,
            lifecycle: state?.lifecycleStage ?? detail?.rfmScore?.segment ?? null,
            purchaseCyclePosition: state?.purchaseCyclePosition ?? null,
            discountBehavior: state?.discountBehavior ?? null,
            medianOrderIntervalDays: state?.medianOrderIntervalDays ?? null,
            nextExpectedOrderAt: state?.nextExpectedOrderAt ?? null,
            nextEvaluationAt: state?.nextEvaluationAt ?? null,
            evidence: decision?.reasonText ?? null,
          };
        }),
      };
    }),

  overrideGovernorDecision: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        reasonCode: z.enum(["collision", "cooldown"]),
        customerIds: z.array(z.string()).min(1).max(500),
        reason: z.string().trim().min(5).max(240),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["draft", "scheduled"] },
        },
        select: { id: true, storeId: true, agentProposal: true },
      });
      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found or its audience is already frozen",
        });
      }

      const currentAudience = await resolveCampaignAudience(campaign.id, new Date(), {
        enforceDeliveryPauses: false,
      });
      const candidates =
        input.reasonCode === "collision"
          ? currentAudience.collisionExcluded
          : currentAudience.cooldownExcluded;
      const overrideable = new Set(candidates.map((customer) => customer.id));
      const uniqueIds = [...new Set(input.customerIds)];
      if (uniqueIds.some((customerId) => !overrideable.has(customerId))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Only customers currently held back by ${input.reasonCode === "collision" ? "a recent campaign" : "the redeemed-discount cooldown"} can be overridden here.`,
        });
      }

      const proposal = (campaign.agentProposal ?? {}) as Record<string, unknown>;
      const field =
        input.reasonCode === "collision"
          ? "overrideCollisionCustomerIds"
          : "overrideCooldownCustomerIds";
      const existing = Array.isArray(proposal[field])
        ? (proposal[field] as unknown[]).filter(
            (value): value is string => typeof value === "string"
          )
        : [];
      await ctx.prisma.$transaction([
        ctx.prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: "draft",
            approvedAt: null,
            approvalChecksum: null,
            agentProposal: {
              ...proposal,
              [field]: [...new Set([...existing, ...uniqueIds])],
            } as any,
          },
        }),
        ctx.prisma.customerAudienceDecision.createMany({
          data: uniqueIds.map((customerId) => ({
            storeId: campaign.storeId,
            customerId,
            campaignId: campaign.id,
            contextKey: campaign.id,
            decision: "campaign_candidate",
            reasonCode: `merchant_${input.reasonCode}_override`,
            reasonText:
              input.reasonCode === "collision"
                ? "Merchant chose to send despite a recent campaign."
                : "Merchant chose to send despite a redeemed-discount cooldown.",
            evidence: { originalDecision: input.reasonCode },
            merchantOverride: true,
            overrideActorId: ctx.userId,
            overrideReason: input.reason,
          })),
        }),
      ]);
      return { success: true, included: uniqueIds.length, reasonCode: input.reasonCode };
    }),

  overrideFatigue: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        customerIds: z.array(z.string()).min(1).max(500),
        reason: z.string().trim().min(5).max(240),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["draft", "scheduled"] },
        },
        select: { id: true, storeId: true, agentProposal: true },
      });
      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found or its audience is already frozen",
        });
      }

      const uniqueIds = [...new Set(input.customerIds)];
      const currentAudience = await resolveCampaignAudience(campaign.id, new Date(), {
        enforceDeliveryPauses: false,
      });
      const overrideable = new Set(currentAudience.fatigueExcluded.map((customer) => customer.id));
      if (uniqueIds.some((customerId) => !overrideable.has(customerId))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Only customers currently held back by the fatigue limit can be overridden here.",
        });
      }

      const proposal = (campaign.agentProposal ?? {}) as Record<string, unknown>;
      const existing = Array.isArray(proposal.overrideFatigueCustomerIds)
        ? proposal.overrideFatigueCustomerIds.filter(
            (customerId): customerId is string => typeof customerId === "string"
          )
        : [];
      await ctx.prisma.$transaction([
        ctx.prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: "draft",
            approvedAt: null,
            approvalChecksum: null,
            agentProposal: {
              ...proposal,
              overrideFatigueCustomerIds: [...new Set([...existing, ...uniqueIds])],
            },
          },
        }),
        ctx.prisma.customerAudienceDecision.createMany({
          data: uniqueIds.map((customerId) => ({
            storeId: campaign.storeId,
            customerId,
            campaignId: campaign.id,
            contextKey: campaign.id,
            decision: "campaign_candidate",
            reasonCode: "merchant_fatigue_override",
            reasonText: "Merchant chose to send this campaign despite the fatigue limit.",
            evidence: { originalDecision: "fatigue" },
            merchantOverride: true,
            overrideActorId: ctx.userId,
            overrideReason: input.reason,
          })),
        }),
      ]);
      return { success: true, included: uniqueIds.length };
    }),

  overrideRecentPurchase: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        customerIds: z.array(z.string()).min(1).max(500),
        reason: z.string().trim().min(5).max(240),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["draft", "scheduled"] },
        },
        select: { id: true, storeId: true, agentProposal: true },
      });
      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found or its audience is already frozen",
        });
      }
      const uniqueIds = [...new Set(input.customerIds)];
      const customers = await ctx.prisma.customer.findMany({
        where: { id: { in: uniqueIds }, storeId: campaign.storeId },
        select: { id: true },
      });
      if (customers.length !== uniqueIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid customer selection" });
      }
      const currentAudience = await resolveCampaignAudience(campaign.id, new Date(), {
        enforceDeliveryPauses: false,
      });
      const overrideable = new Set(
        currentAudience.recentPurchaseExcluded.map((customer) => customer.id)
      );
      if (uniqueIds.some((customerId) => !overrideable.has(customerId))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Only customers currently protected by the recent-purchase rule can be overridden here.",
        });
      }
      const proposal = (campaign.agentProposal ?? {}) as Record<string, unknown>;
      const existingRecent = Array.isArray(proposal.overrideRecentPurchaseCustomerIds)
        ? proposal.overrideRecentPurchaseCustomerIds.filter(
            (customerId): customerId is string => typeof customerId === "string"
          )
        : [];
      const existingIncluded = Array.isArray(proposal.includeLeftAloneCustomerIds)
        ? proposal.includeLeftAloneCustomerIds.filter(
            (customerId): customerId is string => typeof customerId === "string"
          )
        : [];
      await ctx.prisma.$transaction([
        ctx.prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: "draft",
            approvedAt: null,
            approvalChecksum: null,
            agentProposal: {
              ...proposal,
              overrideRecentPurchaseCustomerIds: [...new Set([...existingRecent, ...uniqueIds])],
              includeLeftAloneCustomerIds: [...new Set([...existingIncluded, ...uniqueIds])],
            },
          },
        }),
        ctx.prisma.customerAudienceDecision.createMany({
          data: uniqueIds.map((customerId) => ({
            storeId: campaign.storeId,
            customerId,
            campaignId: campaign.id,
            contextKey: campaign.id,
            decision: "campaign_candidate",
            reasonCode: "merchant_recent_purchase_override",
            reasonText: "Merchant chose to include this recent buyer in this campaign.",
            evidence: { originalDecision: "recent_purchase" },
            merchantOverride: true,
            overrideActorId: ctx.userId,
            overrideReason: input.reason,
          })),
        }),
      ]);
      return { success: true, included: uniqueIds.length };
    }),

  includeLeftAloneCustomers: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        customerIds: z.array(z.string()).min(1).max(500),
        reason: z.string().trim().min(5).max(240).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["draft", "scheduled"] },
        },
        select: { id: true, storeId: true, agentProposal: true },
      });
      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found or its audience is already frozen",
        });
      }
      const customers = await ctx.prisma.customer.findMany({
        where: { id: { in: input.customerIds }, storeId: campaign.storeId },
        select: { id: true },
      });
      if (customers.length !== input.customerIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid customer selection" });
      }
      const proposal = (campaign.agentProposal ?? {}) as Record<string, unknown>;
      const existing = Array.isArray(proposal.includeLeftAloneCustomerIds)
        ? proposal.includeLeftAloneCustomerIds.filter(
            (customerId): customerId is string => typeof customerId === "string"
          )
        : [];
      const includeLeftAloneCustomerIds = [...new Set([...existing, ...input.customerIds])];
      const currentAudience = await resolveCampaignAudience(campaign.id, new Date(), {
        enforceDeliveryPauses: false,
      });
      const overrideable = new Set(currentAudience.deliberatelyLeftAlone.map((row) => row.id));
      if (input.customerIds.some((customerId) => !overrideable.has(customerId))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Only customers Joon is currently leaving alone by decision can be reconsidered here.",
        });
      }
      const auditRows = input.reason
        ? input.customerIds.map((customerId) => ({
            storeId: campaign.storeId,
            customerId,
            campaignId: campaign.id,
            contextKey: campaign.id,
            decision: "campaign_candidate",
            reasonCode: "merchant_state_policy_override",
            reasonText:
              "Merchant chose to include this customer despite Joon's state-based decision.",
            evidence: { originalDecision: "deliberately_left_alone" },
            merchantOverride: true,
            overrideActorId: ctx.userId,
            overrideReason: input.reason,
          }))
        : [];
      await ctx.prisma.$transaction([
        ctx.prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: "draft",
            approvedAt: null,
            approvalChecksum: null,
            agentProposal: { ...proposal, includeLeftAloneCustomerIds },
          },
        }),
        ...(auditRows.length
          ? [ctx.prisma.customerAudienceDecision.createMany({ data: auditRows })]
          : []),
      ]);
      return { success: true, included: input.customerIds.length };
    }),

  dryRun: workspaceProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const campaign = await ctx.prisma.campaign.findFirst({
      where: { id: input.id, workspaceId: ctx.workspaceId },
      include: {
        template: { select: { subject: true, previewText: true } },
        audienceOverridePolicies: {
          where: { active: true, mode: "all_current" },
          select: { reasonCode: true, justification: true, updatedAt: true, evidence: true },
        },
        store: {
          select: {
            storeEmail: true,
            emailSendingPausedAt: true,
            currency: true,
            senderDomain: { select: { domain: true, status: true } },
            brandProfiles: { take: 1, select: { fromName: true, fromEmail: true } },
          },
        },
      },
    });
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
    if (!campaign.template)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Campaign has no email template",
      });
    // A delivery pause is an operational safety gate, not an audience fact.
    // Preview the real candidate/control split while surfacing the pause
    // separately; approval and the send worker continue to enforce it.
    const audience = await resolveCampaignAudience(campaign.id, new Date(), {
      enforceDeliveryPauses: false,
    });
    const proposal = (campaign.agentProposal ?? {}) as {
      discountPercent?: number;
      discountCode?: string;
      offerId?: string;
      requestedDiscountPercent?: number;
      discountAdjustedByGuardrail?: boolean;
      requestedAudienceCount?: number;
      overrideRecentPurchaseCustomerIds?: unknown;
      overrideFatigueCustomerIds?: unknown;
      overrideCollisionCustomerIds?: unknown;
      overrideCooldownCustomerIds?: unknown;
    };
    const linkedAlternative = await ctx.prisma.campaign.findFirst({
      where: {
        storeId: campaign.storeId,
        agentProposal: { path: ["sourceCampaignId"], equals: campaign.id },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true },
    });
    const discountPercent = Math.max(0, Math.min(100, Number(proposal.discountPercent ?? 0)));
    const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
    const recentOrders =
      audience.eligible.length > 0
        ? await ctx.prisma.order.findMany({
            where: {
              customerId: { in: audience.eligible.map((customer) => customer.id) },
              createdAt: { gte: recentSince },
              status: { not: "cancelled" },
            },
            select: { customerId: true, subtotal: true },
          })
        : [];
    const recentBuyerIds = new Set(recentOrders.map((order) => order.customerId));
    const recentOrderSubtotal = recentOrders.reduce((sum, order) => sum + order.subtotal, 0);
    const previewSeed = `campaign-preview:${campaign.id}`;
    const family = campaignFamily(campaign.agentProposal);
    const evidence = await campaignEvidence(ctx.prisma, campaign.storeId, family);
    const holdout = planCampaignHoldout(
      campaign.storeId,
      previewSeed,
      campaign.agentProposal,
      audience.eligible,
      evidence
    );
    const control = Object.values(holdout.assignment.strata).reduce(
      (sum, stratum) => sum + stratum.controlCount,
      0
    );
    const effectiveRate =
      audience.eligible.length > 0 ? control / audience.eligible.length : holdout.decision.rate;
    const measurement = {
      ...campaignMeasurementPolicy(audience.eligible.length, effectiveRate),
      control,
      treatment: audience.eligible.length - control,
      holdoutRate: effectiveRate,
      policyRate: holdout.decision.rate,
      policyReason: holdout.decision.reason,
      family: holdout.family,
      strata: holdout.assignment.strata,
    };
    const previewAssignments = audience.eligible.map((customer) => ({
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      arm: holdout.assignment.assignments[customer.id]?.arm ?? "TREATMENT",
    }));
    const currency = campaign.store.currency === "INR" ? ("INR" as const) : ("USD" as const);
    const estimatedProviderCost =
      (audience.eligible.length - control) * emailMessagingCostForCurrency(currency);
    const noEmailConsent = audience.exclusions.no_consent + audience.exclusions.unsubscribed;
    // One accounting equation must reconcile everywhere in the UI:
    // found = not receiving + campaign candidates. Consent failures are still
    // found in the store; they are mandatory exclusions, not vanished people.
    const otherLeftAlone = Math.max(0, audience.requested - audience.eligible.length);
    return {
      providerCalled: false,
      deliveryGate: {
        blocked:
          process.env["GLOBAL_EMAIL_KILL_SWITCH"] === "true" ||
          Boolean(campaign.store.emailSendingPausedAt),
        reason:
          process.env["GLOBAL_EMAIL_KILL_SWITCH"] === "true"
            ? "Global email delivery is disabled"
            : campaign.store.emailSendingPausedAt
              ? "Email delivery is paused for this store"
              : null,
      },
      requested: audience.requested,
      eligibleBeforeHoldout: audience.eligible.length,
      deliberatelyLeftAlone: audience.deliberatelyLeftAlone.length,
      leftAloneSamples: audience.deliberatelyLeftAlone.slice(0, 10),
      estimatedTreatment: audience.eligible.length - control,
      estimatedControl: control,
      previewAssignments,
      requestedAudienceCount: proposal.requestedAudienceCount ?? null,
      audienceShortfall: Math.max(
        0,
        (proposal.requestedAudienceCount ?? audience.requested) - audience.requested
      ),
      noEmailConsent,
      otherLeftAlone,
      measurement,
      estimatedProviderCost,
      estimatedProviderCostCurrency: currency,
      audienceFreezesOnApproval: true,
      exclusions: audience.exclusions,
      exclusionSamples: audience.samples,
      recentPurchaseCustomers: audience.recentPurchaseExcluded,
      recentPurchaseOverrideCount: Array.isArray(proposal.overrideRecentPurchaseCustomerIds)
        ? proposal.overrideRecentPurchaseCustomerIds.filter((value) => typeof value === "string")
            .length
        : 0,
      fatigueCustomers: audience.fatigueExcluded,
      fatigueOverrideCount: Array.isArray(proposal.overrideFatigueCustomerIds)
        ? proposal.overrideFatigueCustomerIds.filter((value) => typeof value === "string").length
        : 0,
      collisionCustomers: audience.collisionExcluded,
      collisionOverrideCount: Array.isArray(proposal.overrideCollisionCustomerIds)
        ? proposal.overrideCollisionCustomerIds.filter((value) => typeof value === "string").length
        : 0,
      cooldownCustomers: audience.cooldownExcluded,
      cooldownOverrideCount: Array.isArray(proposal.overrideCooldownCustomerIds)
        ? proposal.overrideCooldownCustomerIds.filter((value) => typeof value === "string").length
        : 0,
      audienceReasonOverrides: campaign.audienceOverridePolicies,
      linkedAlternative,
      subject: campaign.template.subject,
      previewText: campaign.template.previewText,
      sender: campaign.store.brandProfiles[0]?.fromEmail ?? campaign.store.storeEmail,
      senderDomain: campaign.store.senderDomain,
      storePaused: Boolean(campaign.store.emailSendingPausedAt),
      currency,
      offer: {
        requestedDiscountPercent: proposal.requestedDiscountPercent ?? discountPercent,
        appliedDiscountPercent: discountPercent,
        adjustedByGuardrail: Boolean(proposal.discountAdjustedByGuardrail),
        discountCode: proposal.discountCode ?? null,
        shopifyStatus: proposal.offerId ? ("created" as const) : ("created_on_send" as const),
      },
      marginRisk: {
        evidenceWindowDays: 7,
        recentBuyers: recentBuyerIds.size,
        recentOrders: recentOrders.length,
        observedRecentSubtotal: recentOrderSubtotal,
        discountPercent,
        illustrativeDiscountExposure: (recentOrderSubtotal * discountPercent) / 100,
        basis: "observed_recent_orders" as const,
      },
    };
  }),
  list: workspaceProcedure
    .input(
      z
        .object({
          status: z
            .enum([
              "draft",
              "scheduled",
              "sending",
              "partially_sent",
              "failed",
              "sent",
              "cancelled",
            ])
            .optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const campaigns = await ctx.prisma.campaign.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          ...(input?.status === "scheduled"
            ? { status: { in: ["scheduled", "sending"] as const } }
            : input?.status
              ? { status: input.status }
              : {}),
        },
        include: {
          template: { select: { id: true, name: true, subject: true, thumbnailUrl: true } },
          segment: { select: { id: true, name: true, customerCount: true } },
        },
        orderBy: { updatedAt: "desc" },
      });

      // Batch-fetch delivery truth for every visible campaign. A campaign with
      // planned recipients but zero provider submissions is merchant-facing
      // "scheduled", including legacy rows persisted as `sending`.
      const sentIds = campaigns.filter((c) => c.status === "sent").map((c) => c.id);
      const campaignIds = campaigns.map((c) => c.id);
      const revenueMap: Record<string, { revenue: number; orders: number }> = {};
      const deliveryMap: Record<string, { sent: number; opened: number; clicked: number }> = {};
      if (campaignIds.length > 0) {
        const [attributions, sentRows, openedRows, clickedRows] = await Promise.all([
          ctx.prisma.orderAttribution.groupBy({
            by: ["campaignId"],
            where: { campaignId: { in: sentIds } },
            _sum: { revenue: true },
            _count: true,
          }),
          ctx.prisma.messageLog.groupBy({
            by: ["campaignId"],
            where: { campaignId: { in: campaignIds }, sentAt: { not: null } },
            _count: true,
          }),
          ctx.prisma.messageLog.groupBy({
            by: ["campaignId"],
            where: { campaignId: { in: campaignIds }, openedAt: { not: null } },
            _count: true,
          }),
          ctx.prisma.messageLog.groupBy({
            by: ["campaignId"],
            where: { campaignId: { in: campaignIds }, clickedAt: { not: null } },
            _count: true,
          }),
        ]);
        for (const a of attributions) {
          if (a.campaignId) {
            revenueMap[a.campaignId] = {
              revenue: Math.round((a._sum.revenue ?? 0) * 100) / 100,
              orders: a._count,
            };
          }
        }
        for (const id of campaignIds) deliveryMap[id] = { sent: 0, opened: 0, clicked: 0 };
        for (const row of sentRows)
          if (row.campaignId) deliveryMap[row.campaignId]!.sent = row._count;
        for (const row of openedRows)
          if (row.campaignId) deliveryMap[row.campaignId]!.opened = row._count;
        for (const row of clickedRows)
          if (row.campaignId) deliveryMap[row.campaignId]!.clicked = row._count;
      }

      const rows = campaigns.map((c) => {
        const proposal = (c.agentProposal ?? {}) as Record<string, any>;
        const dispatch = (proposal["dispatch"] ?? {}) as Record<string, any>;
        const delivery = (dispatch["delivery"] ?? {}) as Record<string, any>;
        const sentCount = deliveryMap[c.id]?.sent ?? 0;
        const deliveryStatus =
          c.status === "sending" &&
          sentCount === 0 &&
          Number(dispatch["scheduled"] ?? c.recipientCount) > 0 &&
          !delivery["merchantOverride"]
            ? "scheduled"
            : c.status;
        return {
          ...c,
          deliveryStatus,
          recipientCount: sentCount || (c.status === "sent" ? c.recipientCount : 0),
          openCount: deliveryMap[c.id]?.opened ?? c.openCount,
          clickCount: deliveryMap[c.id]?.clicked ?? c.clickCount,
          openRate:
            (deliveryMap[c.id]?.sent ?? c.recipientCount) > 0
              ? (deliveryMap[c.id]?.opened ?? c.openCount) /
                (deliveryMap[c.id]?.sent ?? c.recipientCount)
              : 0,
          clickRate:
            (deliveryMap[c.id]?.sent ?? c.recipientCount) > 0
              ? (deliveryMap[c.id]?.clicked ?? c.clickCount) /
                (deliveryMap[c.id]?.sent ?? c.recipientCount)
              : 0,
          attributedRevenue: revenueMap[c.id]?.revenue ?? 0,
          attributedOrders: revenueMap[c.id]?.orders ?? 0,
        };
      });
      return input?.status ? rows.filter((row) => row.deliveryStatus === input.status) : rows;
    }),

  getById: workspaceProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const campaign = await ctx.prisma.campaign.findFirst({
      where: { id: input.id, workspaceId: ctx.workspaceId },
      include: {
        template: true,
        segment: true,
        store: { select: { id: true, shopDomain: true } },
      },
    });
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
    const proposal = (campaign.agentProposal ?? {}) as Record<string, any>;
    const dispatch = (proposal["dispatch"] ?? {}) as Record<string, any>;
    let deliveryPlan = dispatch["delivery"] as Record<string, unknown> | undefined;

    // Campaigns planned before delivery metadata shipped still have the exact
    // delayed BullMQ jobs. Recover only timing evidence (never recipient data)
    // so the merchant sees why Joon is waiting instead of a generic message.
    if (!deliveryPlan?.["earliestAt"] && ["scheduled", "sending"].includes(campaign.status)) {
      const jobs = (await queuedCampaignJobs(campaign.id)).filter(
        (job) => job.name === "deliver-one" || job.name === "deliver-chunk"
      );
      if (jobs.length > 0) {
        const dueTimes = jobs.map((job) => job.timestamp + Math.max(0, job.delay ?? 0));
        const firstData = jobs[0]!.data as {
          deliveries?: Array<{ plan?: Record<string, unknown> }>;
          plan?: Record<string, unknown>;
        };
        const sample = (firstData.deliveries?.[0] ?? firstData) as {
          plan?: {
            sendHour?: number;
            timingSource?: "customer" | "store" | "default";
            timingConfidence?: number;
            timezone?: string;
          };
        };
        const timingSource = sample.plan?.timingSource ?? "default";
        const sendHour = sample.plan?.sendHour ?? 10;
        const timezone = sample.plan?.timezone ?? "UTC";
        const reason =
          timingSource === "customer"
            ? `This customer's previous opens and clicks point to around ${String(sendHour).padStart(2, "0")}:00 in ${timezone}.`
            : timingSource === "store"
              ? `Customers from this store usually engage around ${String(sendHour).padStart(2, "0")}:00 in ${timezone}.`
              : `There is not enough engagement history for this customer yet, so Joon used its cautious ${String(sendHour).padStart(2, "0")}:00 default in ${timezone}.`;
        const consequence =
          timingSource === "customer"
            ? "Sending earlier may reduce opens because it ignores this customer's observed engagement window."
            : timingSource === "store"
              ? "Sending earlier may reduce opens because it ignores the store's observed engagement window."
              : "Sending now may reduce opens; this is a cautious default until Joon has enough engagement history to personalize the time.";
        deliveryPlan = {
          earliestAt: new Date(Math.min(...dueTimes)).toISOString(),
          latestAt: new Date(Math.max(...dueTimes)).toISOString(),
          reason,
          consequence,
          timingSource,
          timingConfidence: sample.plan?.timingConfidence ?? 0,
          timezone,
          merchantOverride: false,
        };
      }
    }
    return { ...campaign, deliveryPlan: deliveryPlan ?? null };
  }),

  /**
   * How joon decided — a legible, in-product decision trace for a campaign. Reuses what's
   * already captured (agentProposal / humanDecision, the holdout Experiment + its stats, and
   * per-customer message_logs with the frozen state snapshot) — no new data. Plain language,
   * not an ML dashboard: the founder reads "look how joon thought about this so I don't have to".
   */
  decisionTrace: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        select: {
          id: true,
          name: true,
          agentProposal: true,
          humanDecision: true,
          segment: { select: { name: true } },
          store: { select: { shopDomain: true, currency: true } },
        },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const [armCounts, expRow] = await Promise.all([
        ctx.prisma.messageLog.groupBy({
          by: ["treatmentArm"],
          where: { campaignId: campaign.id, treatmentArm: { not: null } },
          _count: { id: true },
        }),
        ctx.prisma.messageLog.findFirst({
          where: { campaignId: campaign.id, experimentId: { not: null } },
          select: { experimentId: true },
        }),
      ]);
      const controlCount = Number(
        armCounts.find((a) => a.treatmentArm === "CONTROL")?._count.id ?? 0
      );
      const treatmentCount = Number(
        armCounts.find((a) => a.treatmentArm === "TREATMENT")?._count.id ?? 0
      );
      const experiment = expRow?.experimentId
        ? await ctx.prisma.experiment.findUnique({
            where: { id: expRow.experimentId },
            select: { splitRatio: true, stats: true },
          })
        : null;

      // Sample per-customer traces: a treatment buyer, a treatment non-buyer, a control buyer.
      const pick = (arm: "CONTROL" | "TREATMENT", outcome: string) =>
        ctx.prisma.messageLog.findFirst({
          where: { campaignId: campaign.id, treatmentArm: arm, outcome },
          select: {
            customerId: true,
            treatmentArm: true,
            outcome: true,
            outcomeRevenue: true,
            customerStateSnap: true,
          },
        });
      const raw = (
        await Promise.all([
          pick("TREATMENT", "purchased"),
          pick("TREATMENT", "ignored"),
          pick("CONTROL", "purchased"),
        ])
      ).filter(Boolean) as Array<{
        customerId: string | null;
        treatmentArm: string | null;
        outcome: string | null;
        outcomeRevenue: unknown;
        customerStateSnap: unknown;
      }>;
      const custIds = raw.map((r) => r.customerId).filter(Boolean) as string[];
      const custs = custIds.length
        ? await ctx.prisma.customer.findMany({
            where: { id: { in: custIds } },
            select: { id: true, firstName: true },
          })
        : [];
      const samples = raw.map((r) => {
        const st = (r.customerStateSnap ?? {}) as {
          segment?: string;
          orderCount?: number;
          totalSpent?: number;
        };
        return {
          name: custs.find((c) => c.id === r.customerId)?.firstName ?? "A customer",
          segment: st.segment ?? null,
          orders: st.orderCount ?? null,
          spent: st.totalSpent ?? null,
          arm: r.treatmentArm,
          outcome: r.outcome,
          revenue: Number(r.outcomeRevenue ?? 0),
        };
      });

      const ap = (campaign.agentProposal ?? {}) as {
        intent?: string;
        segmentName?: string;
        discountPercent?: number;
        channel?: string;
      };
      const hd = campaign.humanDecision as {
        acceptedAsProposed?: boolean;
        overrides?: Record<string, unknown>;
      } | null;
      return {
        campaignName: campaign.name,
        currency: campaign.store.currency,
        isSynthetic: campaign.store?.shopDomain === DEMO_STORE_DOMAIN,
        decision: {
          intent: ap.intent ?? null,
          segment: ap.segmentName ?? campaign.segment?.name ?? null,
          discountPercent: ap.discountPercent ?? null,
          channel: ap.channel ?? "email",
        },
        human: hd
          ? { acceptedAsProposed: hd.acceptedAsProposed ?? null, overrides: hd.overrides ?? {} }
          : null,
        experiment: { splitRatio: experiment?.splitRatio ?? null, controlCount, treatmentCount },
        stats: (experiment?.stats ?? null) as null | {
          lift: number;
          ciLow: number;
          ciHigh: number;
          significant: boolean;
          underpowered: boolean;
          confidence: number;
        },
        samples,
      };
    }),

  create: workspaceProcedure
    .input(
      z.object({
        name: z.string().min(1),
        storeId: z.string(),
        templateId: z.string(),
        segmentId: z.string().optional(),
        scheduledAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify store and template belong to workspace
      const [store, template] = await Promise.all([
        ctx.prisma.store.findFirst({ where: { id: input.storeId, workspaceId: ctx.workspaceId } }),
        ctx.prisma.emailTemplate.findFirst({
          where: { id: input.templateId, workspaceId: ctx.workspaceId },
        }),
      ]);
      if (!store) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });

      return ctx.prisma.campaign.create({
        data: {
          workspaceId: ctx.workspaceId,
          storeId: input.storeId,
          name: input.name,
          templateId: input.templateId,
          segmentId: input.segmentId,
          status: input.scheduledAt ? "scheduled" : "draft",
          origin: "merchant",
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        },
      });
    }),

  update: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        templateId: z.string().optional(),
        segmentId: z.string().nullable().optional(),
        scheduledAt: z.string().datetime().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "draft" },
      });
      if (!campaign)
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found or not editable" });

      const { id, ...data } = input;
      return ctx.prisma.campaign.update({
        where: { id },
        data: {
          ...data,
          scheduledAt: data.scheduledAt
            ? new Date(data.scheduledAt)
            : data.scheduledAt === null
              ? null
              : undefined,
        },
      });
    }),

  delete: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "draft" },
      });
      if (!campaign)
        throw new TRPCError({ code: "NOT_FOUND", message: "Only draft campaigns can be deleted" });

      await ctx.prisma.campaign.delete({ where: { id: input.id } });
      return { success: true };
    }),

  schedule: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        scheduledAt: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "draft" },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.campaign.update({
        where: { id: input.id },
        data: { scheduledAt: new Date(input.scheduledAt), status: "scheduled" },
      });
    }),

  sendNow: workspaceProcedure
    .input(z.object({ id: z.string(), timing: z.enum(["joon", "now"]).default("joon") }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["draft", "scheduled"] },
        },
        include: { template: true, segment: true },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (!campaign.template) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Campaign has no email template",
        });
      }
      const frozenAssignmentCount = await ctx.prisma.measurementAssignment.count({
        where: { unitType: "campaign", unitId: campaign.id },
      });
      if (frozenAssignmentCount > 0 && campaign.approvedAt && campaign.approvalChecksum) {
        await ctx.prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "sending" },
        });
        try {
          await emailSendQueue.add(
            "campaign-send",
            { campaignId: campaign.id, forceImmediate: input.timing === "now" },
            { jobId: `campaign-send-${campaign.id}` }
          );
        } catch (error) {
          await ctx.prisma.campaign.update({
            where: { id: campaign.id },
            data: campaignDispatchFailureUpdate(),
          });
          throw error;
        }
        return { status: "sending" as const };
      }
      const brand = await ctx.prisma.brandProfile.findFirst({
        where: { storeId: campaign.storeId },
        select: { vocabulary: true },
      });
      const bannedTerms = ((brand?.vocabulary as Record<string, unknown> | null)?.bannedWords ??
        []) as string[];
      const violations = findBannedTerms(campaign.template, bannedTerms);
      if (violations.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Email contains words your brand forbids: ${violations.join(", ")}. Edit the copy before approval.`,
        });
      }

      const audience = await resolveCampaignAudience(campaign.id);
      const family = campaignFamily(campaign.agentProposal);
      const evidence = await campaignEvidence(ctx.prisma, campaign.storeId, family);
      const policy = holdoutRateFor(campaign.storeId, family, "all", evidence);
      const experiment = await getOrCreateExperiment(
        campaign.storeId,
        {
          label: `campaign:${campaign.id}:stratified:v1`,
          source: "campaign",
          family,
          campaignId: campaign.id,
          segmentId: campaign.segmentId ?? null,
          segmentName: campaign.segment?.name ?? null,
        },
        policy.rate
      );
      const holdout = planCampaignHoldout(
        campaign.storeId,
        experiment.assignmentSeed,
        campaign.agentProposal,
        audience.eligible,
        evidence
      );
      const approvedProposal = withCampaignAudienceSnapshot(
        campaign.agentProposal,
        audience,
        new Date(),
        {
          experimentId: experiment.id,
          splitRatio: policy.rate,
          assignments: Object.fromEntries(holdout.assignment.arms),
          policyReason: policy.reason,
          strata: holdout.assignment.strata,
          assignmentDetails: holdout.assignment.assignments,
        }
      );
      const approvalChecksum = campaignApprovalChecksum({
        campaignId: campaign.id,
        storeId: campaign.storeId,
        name: campaign.name,
        scheduledAt: campaign.scheduledAt,
        template: {
          id: campaign.template.id,
          subject: campaign.template.subject,
          previewText: campaign.template.previewText,
          blocks: campaign.template.blocks,
          html: campaign.template.html,
        },
        segment: campaign.segment
          ? {
              id: campaign.segment.id,
              kind: campaign.segment.kind,
              customerIds: campaign.segment.customerIds,
              conditions: campaign.segment.conditions,
              name: campaign.segment.name,
            }
          : null,
        agentProposal: approvedProposal,
      });

      const existingAssignment = await ctx.prisma.measurementAssignment.findFirst({
        where: { unitType: "campaign", unitId: campaign.id },
        orderBy: { assignedAt: "asc" },
      });
      const approvedAt = existingAssignment?.assignedAt ?? new Date();
      const windowStartsAt =
        existingAssignment?.windowStartsAt ??
        (campaign.scheduledAt && campaign.scheduledAt > approvedAt
          ? campaign.scheduledAt
          : approvedAt);
      const windowEndsAt =
        existingAssignment?.windowEndsAt ?? new Date(windowStartsAt.getTime() + 7 * 86_400_000);
      const controlCount = Object.values(holdout.assignment.strata).reduce(
        (sum, stratum) => sum + stratum.controlCount,
        0
      );
      const effectiveRate = audience.eligible.length
        ? controlCount / audience.eligible.length
        : policy.rate;
      const measurement = campaignMeasurementPolicy(audience.eligible.length, effectiveRate);
      await ctx.prisma.$transaction(
        async (tx) => {
          const claimed = await tx.campaign.updateMany({
            where: campaignApprovalClaimWhere(input.id),
            // Capture agent_proposed → human_final at approval (can't-backfill CAM signal).
            data: {
              status: "sending",
              humanDecision: buildHumanDecision(campaign) as object,
              agentProposal: approvedProposal as object,
              approvalChecksum,
              approvedAt,
            },
          });
          if (claimed.count !== 1) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Campaign was approved concurrently; retry to dispatch its frozen cohort",
            });
          }
          await tx.measurementAssignment.createMany({
            data: Object.entries(holdout.assignment.assignments).map(([customerId, detail]) => ({
              storeId: campaign.storeId,
              experimentId: experiment.id,
              campaignId: campaign.id,
              unitType: "campaign",
              unitId: campaign.id,
              customerId,
              arm: detail.arm,
              stratum: detail.assignmentStratum,
              holdoutRate: detail.holdoutRate,
              assignedAt: approvedAt,
              windowStartsAt,
              windowEndsAt,
              assignmentData: {
                tier: measurement.tier,
                family,
                policyReason: policy.reason,
                originalStratum: detail.stratum,
              },
            })),
            skipDuplicates: true,
          });
          await tx.customerAudienceDecision.createMany({
            data: [
              ...audience.deliberatelyLeftAlone.map((customer) => ({
                storeId: campaign.storeId,
                customerId: customer.id,
                campaignId: campaign.id,
                contextKey: family,
                decision: "deliberately_left_alone",
                reasonCode: customer.decision.reasonCode ?? null,
                reasonText: customer.decision.reasonText ?? null,
                evidence: customer.decision.evidence as any,
                reconsiderAt: customer.decision.reconsiderAt ?? null,
                reconsiderOn: customer.decision.reconsiderOn ?? null,
              })),
              ...Object.entries(holdout.assignment.assignments).map(([customerId, detail]) => ({
                storeId: campaign.storeId,
                customerId,
                campaignId: campaign.id,
                contextKey: family,
                decision: detail.arm === "CONTROL" ? "control" : "treatment",
                reasonCode: "experiment_assignment",
                reasonText:
                  detail.arm === "CONTROL"
                    ? "Randomly placed in this campaign's control group."
                    : "Assigned to receive this campaign.",
                evidence: {
                  stratum: detail.stratum,
                  assignmentStratum: detail.assignmentStratum,
                  controlRate: detail.holdoutRate,
                },
              })),
            ],
          });
          if (audience.deliberatelyLeftAlone.length > 0) {
            const reasonCounts = audience.deliberatelyLeftAlone.reduce<Record<string, number>>(
              (counts, customer) => {
                const reason = customer.decision.reasonCode ?? "state_policy";
                counts[reason] = (counts[reason] ?? 0) + 1;
                return counts;
              },
              {}
            );
            await tx.agentActivityLog.create({
              data: {
                storeId: campaign.storeId,
                activityType: "customers_left_alone",
                summary: `Joon left ${audience.deliberatelyLeftAlone.length.toLocaleString("en-IN")} customers out of ${campaign.name} because their current state suggested a different action.`,
                category: "campaign",
                actionTaken: "deliberately_left_alone",
                entityId: campaign.id,
                entityType: "campaign",
                metadata: {
                  reasonCounts,
                  customerIds: audience.deliberatelyLeftAlone
                    .map((customer) => customer.id)
                    .slice(0, 100),
                },
              },
            });
          }
        },
        { isolationLevel: "Serializable" }
      );

      try {
        await emailSendQueue.add(
          "campaign-send",
          { campaignId: input.id, forceImmediate: input.timing === "now" },
          { jobId: `campaign-send-${input.id}` }
        );
      } catch (error) {
        // Approval truth and frozen assignments are immutable. A queue outage
        // moves the campaign to scheduled so the same approved snapshot can be
        // retried without allowing edits or drawing a new control.
        await ctx.prisma.campaign.update({
          where: { id: input.id },
          data: campaignDispatchFailureUpdate(),
        });
        throw error;
      }

      return { status: "sending" as const };
    }),

  /** Merchant timing override: preserve the frozen audience/content and promote
   * only this campaign's already-planned treatment deliveries. All non-timing
   * permission, suppression, sender-domain and allowlist gates still run. */
  deliverNow: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["scheduled", "sending"] },
        },
      });
      if (!campaign?.approvedAt || !campaign.approvalChecksum) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This campaign needs approval before it can be delivered.",
        });
      }

      const jobs = await queuedCampaignJobs(campaign.id);
      const deliveryJobs = jobs.filter(
        (job) => job.name === "deliver-one" || job.name === "deliver-chunk"
      );
      if (deliveryJobs.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No scheduled recipient deliveries are waiting to be sent.",
        });
      }

      const overriddenAt = new Date();
      let promotedRecipients = 0;
      for (const job of deliveryJobs) {
        const data = job.data as Record<string, unknown> & {
          deliveries?: Array<Record<string, unknown>>;
        };
        promotedRecipients += data.deliveries?.length ?? 1;
        await job.updateData(
          data.deliveries
            ? {
                ...data,
                deliveries: data.deliveries.map((delivery) => ({
                  ...delivery,
                  forceImmediate: true,
                })),
              }
            : { ...data, forceImmediate: true }
        );
        const state = await job.getState();
        if (state === "delayed") await job.promote();
      }

      const finalizeJob = jobs.find((job) => job.name === "campaign-finalize");
      if (finalizeJob) await finalizeJob.remove();
      await emailSendQueue.add(
        "campaign-finalize",
        { finalize: true, campaignId: campaign.id },
        { delay: 60_000, jobId: `finalize-${campaign.id}-override-${overriddenAt.getTime()}` }
      );

      const proposal = (campaign.agentProposal ?? {}) as Record<string, any>;
      const dispatch = (proposal["dispatch"] ?? {}) as Record<string, any>;
      await ctx.prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: "sending",
          agentProposal: {
            ...proposal,
            dispatch: {
              ...dispatch,
              delivery: {
                ...((dispatch["delivery"] ?? {}) as Record<string, unknown>),
                merchantOverride: true,
                overriddenAt: overriddenAt.toISOString(),
                reason:
                  "The merchant chose to deliver now instead of waiting for Joon's recommended time.",
              },
            },
          },
        },
      });

      return { status: "sending" as const, promoted: promotedRecipients };
    }),

  /** Cancel an undelivered approved campaign and open a fresh editable revision.
   * The original frozen approval and assignment rows remain immutable for audit. */
  reviseScheduled: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: {
          id: input.id,
          workspaceId: ctx.workspaceId,
          status: { in: ["scheduled", "sending"] },
        },
        include: { template: true },
      });
      if (!campaign?.template) throw new TRPCError({ code: "NOT_FOUND" });
      const delivered = await ctx.prisma.messageLog.count({
        where: { campaignId: campaign.id, sentAt: { not: null } },
      });
      if (delivered > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Delivery has already started, so this approved version can no longer be edited.",
        });
      }

      const jobs = await queuedCampaignJobs(campaign.id);
      for (const job of jobs) await job.remove();

      const proposal = (campaign.agentProposal ?? {}) as Record<string, any>;
      const cleanProposal = Object.fromEntries(
        Object.entries(proposal).filter(
          ([key]) => !["dispatch", "dispatchError", "offerId"].includes(key)
        )
      );
      const revised = await ctx.prisma.$transaction(async (tx) => {
        const template = await tx.emailTemplate.create({
          data: {
            workspaceId: campaign.workspaceId,
            name: `${campaign.template!.name} · revision`,
            subject: campaign.template!.subject,
            previewText: campaign.template!.previewText,
            blocks: campaign.template!.blocks as any,
            html: campaign.template!.html,
            category: campaign.template!.category,
          },
        });
        const next = await tx.campaign.create({
          data: {
            workspaceId: campaign.workspaceId,
            storeId: campaign.storeId,
            name: campaign.name,
            templateId: template.id,
            segmentId: campaign.segmentId,
            status: "draft",
            origin: campaign.origin,
            agentProposal: cleanProposal as any,
          },
        });
        await tx.campaign.update({
          where: { id: campaign.id },
          data: {
            status: "cancelled",
            agentProposal: {
              ...proposal,
              dispatch: {
                ...((proposal["dispatch"] ?? {}) as Record<string, unknown>),
                cancelledForRevisionAt: new Date().toISOString(),
                revisionCampaignId: next.id,
              },
            },
          },
        });
        return next;
      });

      return { id: revised.id, templateId: revised.templateId };
    }),

  cancel: workspaceProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId, status: "scheduled" },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.campaign.update({
        where: { id: input.id },
        data: { status: "cancelled" },
      });
    }),

  /** Campaign analytics with time-bucketed event data */
  analytics: workspaceProcedure
    .input(
      z.object({
        id: z.string(),
        granularity: z.enum(["hour", "day"]).default("day"),
      })
    )
    .query(async ({ ctx, input }) => {
      const campaign = await ctx.prisma.campaign.findFirst({
        where: { id: input.id, workspaceId: ctx.workspaceId },
        select: { id: true },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const truncFn = input.granularity === "hour" ? "hour" : "day";

      const timeline = await ctx.prisma.$queryRaw<
        Array<{ date: string; sent: number; opened: number; clicked: number; bounced: number }>
      >`
        SELECT
          DATE_TRUNC(${truncFn}, "createdAt")::text AS date,
          COUNT(*) FILTER (WHERE "status" IN ('sent','delivered','opened','clicked'))::int AS sent,
          COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::int AS opened,
          COUNT(*) FILTER (WHERE "clickedAt" IS NOT NULL)::int AS clicked,
          COUNT(*) FILTER (WHERE "status" = 'bounced')::int AS bounced
        FROM message_logs
        WHERE "campaignId" = ${input.id}
        GROUP BY DATE_TRUNC(${truncFn}, "createdAt")
        ORDER BY date ASC
      `;

      const totals = await ctx.prisma.messageLog.groupBy({
        by: ["status"],
        where: { campaignId: input.id },
        _count: true,
      });

      const statusCounts = Object.fromEntries(totals.map((t) => [t.status, t._count]));
      const totalSent =
        (statusCounts["sent"] ?? 0) +
        (statusCounts["delivered"] ?? 0) +
        (statusCounts["opened"] ?? 0) +
        (statusCounts["clicked"] ?? 0);
      const totalOpened = (statusCounts["opened"] ?? 0) + (statusCounts["clicked"] ?? 0);
      const totalClicked = statusCounts["clicked"] ?? 0;
      const totalBounced = statusCounts["bounced"] ?? 0;

      return {
        timeline,
        totals: {
          sent: totalSent,
          opened: totalOpened,
          clicked: totalClicked,
          bounced: totalBounced,
        },
        rates: {
          openRate: totalSent > 0 ? totalOpened / totalSent : 0,
          clickRate: totalSent > 0 ? totalClicked / totalSent : 0,
          bounceRate: totalSent > 0 ? totalBounced / totalSent : 0,
        },
      };
    }),

  stats: workspaceProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const [campaign, attribution, arms, deliveredCount, openedCount, clickedCount, bouncedCount] =
      await Promise.all([
        ctx.prisma.campaign.findFirst({
          where: { id: input.id, workspaceId: ctx.workspaceId },
          select: {
            recipientCount: true,
            openCount: true,
            clickCount: true,
            status: true,
            sentAt: true,
            store: { select: { currency: true } },
          },
        }),
        ctx.prisma.orderAttribution.aggregate({
          where: { campaignId: input.id },
          _sum: { revenue: true },
          _count: true,
        }),
        ctx.prisma.messageLog.groupBy({
          by: ["treatmentArm", "experimentId"],
          where: {
            campaignId: input.id,
            treatmentArm: { not: null },
            experimentId: { not: null },
          },
          _count: true,
        }),
        ctx.prisma.messageLog.count({
          where: { campaignId: input.id, sentAt: { not: null } },
        }),
        ctx.prisma.messageLog.count({
          where: { campaignId: input.id, openedAt: { not: null } },
        }),
        ctx.prisma.messageLog.count({
          where: { campaignId: input.id, clickedAt: { not: null } },
        }),
        ctx.prisma.messageLog.count({
          where: { campaignId: input.id, status: "bounced" },
        }),
      ]);
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

    const attributedRevenue = attribution._sum.revenue ?? 0;
    const attributedOrders = attribution._count;
    const experimentId = arms.find((row) => row.experimentId)?.experimentId ?? null;
    const experiment = experimentId
      ? await ctx.prisma.experiment.findUnique({
          where: { id: experimentId },
          select: { stats: true, splitRatio: true, startAt: true, endAt: true },
        })
      : null;
    const controlAssigned = arms
      .filter((row) => row.treatmentArm === "CONTROL")
      .reduce((sum, row) => sum + row._count, 0);
    const treatmentAssigned = arms
      .filter((row) => row.treatmentArm === "TREATMENT")
      .reduce((sum, row) => sum + row._count, 0);

    return {
      ...campaign,
      recipientCount: deliveredCount,
      openCount: openedCount,
      clickCount: clickedCount,
      openRate: deliveredCount > 0 ? openedCount / deliveredCount : 0,
      clickRate: deliveredCount > 0 ? clickedCount / deliveredCount : 0,
      bounceCount: bouncedCount,
      attributedRevenue: Math.round(attributedRevenue * 100) / 100,
      attributedOrders,
      currency: campaign.store.currency ?? "USD",
      conversionRate: deliveredCount > 0 ? attributedOrders / deliveredCount : 0,
      holdout: {
        experimentId,
        controlAssigned,
        treatmentAssigned,
        splitRatio: experiment?.splitRatio ?? null,
        startAt: experiment?.startAt ?? null,
        endAt: experiment?.endAt ?? null,
        stats: experiment?.stats ?? null,
      },
    };
  }),
});
