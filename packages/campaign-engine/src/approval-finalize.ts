import { createHash } from "node:crypto";
import { prisma } from "@allohq/database";
import { loadBrandKit } from "@allohq/customer-intelligence";
import { collectEmailAssetManifest } from "./email-asset-manifest";
import { resolveBlockData } from "./block-data";
import {
  campaignMeasurementPolicy,
  type HoldoutRateDecision,
} from "@allohq/customer-state";
import { campaignApprovalChecksum } from "./approval-checksum";
import { campaignApprovalClaimWhere } from "./approval-claim";
import { buildHumanDecision } from "./human-decision";
import { ensureEmailVersion } from "./email-versions";
import {
  APPROVAL_RETRY_POLICY,
  withSerializableRetry,
  type SerializableRetryHooks,
} from "./serializable-retry";
import { withCampaignAudienceSnapshotCounts } from "./audience-snapshot";
import {
  completedAudienceRun,
  leftAloneActivitySummary,
  materialiseAudienceDecisions,
  materialiseAudienceEvaluation,
  materialiseMeasurementAssignments,
  recordAudienceReadyActivity,
  type AudienceRunResult,
} from "./audience-run";

/**
 * Finalise a campaign approval against a completed audience run.
 *
 * This used to live inside the `sendNow` tRPC mutation, where it followed a
 * resolution that took 34.6 s at 100k. It is extracted so the preparation
 * worker can finish an approval without the merchant clicking again: the
 * request validates and enqueues, the worker prepares and finalises.
 *
 * Everything here is O(1) or one statement over the frozen membership. The
 * expensive part is the run, which must already be complete before this is
 * called — the campaign cannot become sendable until its exact frozen audience
 * and arms exist.
 */
export interface FinalizeApprovalInput {
  campaignId: string;
  run: AudienceRunResult;
  experimentId: string;
  family: string;
  policy: HoldoutRateDecision;
  deliveryProvider: "resend" | "ses";
  emailPreflightReceipt: Record<string, unknown>;
  approvedBy?: string;
}

export class AudienceRunNotCompleteError extends Error {
  readonly code = "AUDIENCE_RUN_NOT_COMPLETE" as const;
  constructor(campaignId: string) {
    super(`Campaign ${campaignId} has no completed audience run to approve`);
    this.name = "AudienceRunNotCompleteError";
  }
}

export class CampaignApprovalConflictError extends Error {
  readonly code = "CAMPAIGN_APPROVAL_CONFLICT" as const;
  constructor(campaignId: string) {
    super(`Campaign ${campaignId} was approved concurrently`);
    this.name = "CampaignApprovalConflictError";
  }
}

export async function finalizeCampaignApproval(
  input: FinalizeApprovalInput,
  /** Test seam only: deterministic backoff and captured observability. */
  retryHooks: SerializableRetryHooks = {},
): Promise<{
  approvedAt: Date;
  approvalChecksum: string;
  controlCount: number;
  treatmentCount: number;
}> {
  // The frozen membership must exist and be complete. A resolving, assigning
  // or failed run can never reach this point.
  const complete = await completedAudienceRun(input.campaignId);
  if (!complete || complete.id !== input.run.runId) {
    throw new AudienceRunNotCompleteError(input.campaignId);
  }

  const campaign = await prisma.campaign.findUniqueOrThrow({
    where: { id: input.campaignId },
    include: { template: true, segment: true, store: true },
  });
  if (!campaign.template) {
    throw new Error(`Campaign ${input.campaignId} has no email template`);
  }

  const approvedProposal = withCampaignAudienceSnapshotCounts(
    campaign.agentProposal,
    {
      requested: input.run.requested,
      eligible: input.run.candidateCount,
      deliberatelyLeftAlone: input.run.leftAloneCount,
      exclusions: input.run.exclusions,
    },
    new Date(),
    {
      experimentId: input.experimentId,
      splitRatio: input.policy.rate,
      policyReason: input.policy.reason,
      strata: input.run.strata,
    },
    input.deliveryProvider
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
      html: null,
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

  const existingAssignment = await prisma.measurementAssignment.findFirst({
    where: { unitType: "campaign", unitId: campaign.id },
    orderBy: { assignedAt: "asc" },
  });
  const approvedAt = existingAssignment?.assignedAt ?? new Date();
  const windowStartsAt =
    existingAssignment?.windowStartsAt ??
    (campaign.scheduledAt && campaign.scheduledAt > approvedAt ? campaign.scheduledAt : approvedAt);
  const windowEndsAt =
    existingAssignment?.windowEndsAt ?? new Date(windowStartsAt.getTime() + 7 * 86_400_000);
  const effectiveRate = input.run.candidateCount
    ? input.run.controlCount / input.run.candidateCount
    : input.policy.rate;
  const measurement = campaignMeasurementPolicy(input.run.candidateCount, effectiveRate);

  await materialiseAudienceEvaluation({
    runId: input.run.runId,
    campaignId: campaign.id,
    storeId: campaign.storeId,
    campaignUpdatedAt: campaign.updatedAt,
    requested: input.run.requested,
    candidateCount: input.run.candidateCount,
    controlCount: input.run.controlCount,
    treatmentCount: input.run.treatmentCount,
    leftAloneCount: input.run.leftAloneCount,
    excludedCount: input.run.excludedCount,
    exclusions: input.run.exclusions,
  });

  // Frozen measurement rows land before the claim. Both this and the
  // evaluation above are idempotent per run — the evaluation only since it
  // began reusing an existing one, which is what lets a retried job reach the
  // claim at all — and
  // both attribution and the causal ledger ignore assignments whose campaign
  // has no approvedAt, so a claim that fails leaves inert rows rather than
  // phantom arms.
  await materialiseMeasurementAssignments({
    runId: input.run.runId,
    campaignId: campaign.id,
    storeId: campaign.storeId,
    experimentId: input.experimentId,
    assignedAt: approvedAt,
    windowStartsAt,
    windowEndsAt,
    assignmentData: {
      tier: measurement.tier,
      family: input.family,
      policyReason: input.policy.reason,
    },
  });

  const approvedBrandKit = await loadBrandKit(campaign.storeId);
  const emailAssetManifest = collectEmailAssetManifest(campaign.template.blocks);

  // Snapshot the store facts this email resolved to at the moment of approval.
  //
  // A collection binding is deliberately LIVE — the grid shows whatever the
  // collection holds when the email is sent — so the approved document alone
  // cannot say what a merchant was looking at when they approved it. Recording
  // the resolution here keeps the approval reproducible for audit without
  // freezing the binding and quietly turning it into a snapshot.
  const approvedStoreFacts = await resolveBlockData(
    prisma as never,
    (campaign.template.blocks ?? []) as never,
    campaign.storeId,
  );

  // Retried as a whole: under SERIALIZABLE any statement below can be the one
  // Postgres aborts with 40001, and a rolled-back attempt has undone all of
  // them. Nothing inside reaches outside the database — the send is queued by
  // the caller only after this commits — so replaying it cannot send twice.
  // Each attempt keeps its own 15 s timeout; a timeout is never retried.
  await withSerializableRetry(
    "approval_finalize",
    { campaignId: campaign.id },
    () => prisma.$transaction(
    async (tx) => {
      const approvedEmailVersion = await ensureEmailVersion(tx, {
        workspaceId: campaign.workspaceId,
        templateId: campaign.template!.id,
        storeId: campaign.storeId,
        template: campaign.template!,
        source: "approval",
        note: `Frozen for campaign approval · ${campaign.name}`,
        createdBy: input.approvedBy,
      });
      const releaseRenderHash = createRenderHash(
        approvedEmailVersion.contentHash,
        approvedBrandKit
      );
      const claimed = await tx.campaign.updateMany({
        where: campaignApprovalClaimWhere(campaign.id),
        data: {
          status: "sending",
          humanDecision: buildHumanDecision(campaign) as object,
          agentProposal: approvedProposal as object,
          approvalChecksum,
          approvedAt,
          approvedEmailVersionId: approvedEmailVersion.id,
        },
      });
      if (claimed.count !== 1) throw new CampaignApprovalConflictError(campaign.id);
      await tx.emailApproval.upsert({
        where: { campaignId: campaign.id },
        create: {
          campaignId: campaign.id,
          emailVersionId: approvedEmailVersion.id,
          renderHash: releaseRenderHash,
          assetManifest: emailAssetManifest as never,
          renderContext: {
            brandKit: approvedBrandKit,
            resolvedAt: approvedAt,
            products: approvedStoreFacts.products,
            // Live bindings: what each bound collection held at approval. The
            // send resolves them again, so these are an audit record of what
            // was shown, not the source delivery reads.
            collectionsAtApproval: approvedStoreFacts.collections,
          } as never,
          preflight: input.emailPreflightReceipt as never,
          approvedBy: input.approvedBy,
          approvedAt,
        },
        update: {
          emailVersionId: approvedEmailVersion.id,
          renderHash: releaseRenderHash,
          assetManifest: emailAssetManifest as never,
          renderContext: {
            brandKit: approvedBrandKit,
            resolvedAt: approvedAt,
            products: approvedStoreFacts.products,
            // Live bindings: what each bound collection held at approval. The
            // send resolves them again, so these are an audit record of what
            // was shown, not the source delivery reads.
            collectionsAtApproval: approvedStoreFacts.collections,
          } as never,
          preflight: input.emailPreflightReceipt as never,
          approvedBy: input.approvedBy,
          approvedAt,
        },
      });
    },
    { isolationLevel: "Serializable", timeout: 15_000 }
    ),
    APPROVAL_RETRY_POLICY,
    retryHooks,
  );

  // The audience-decision ledger follows the claim. It is the merchant's
  // decision history, read by nobody in delivery or measurement.
  await materialiseAudienceDecisions({
    runId: input.run.runId,
    campaignId: campaign.id,
    storeId: campaign.storeId,
    contextKey: input.family,
    approvedAt,
  });
  if (input.run.leftAloneCount > 0) {
    const leftAlone = await leftAloneActivitySummary(input.run.runId);
    await prisma.agentActivityLog.create({
      data: {
        storeId: campaign.storeId,
        activityType: "customers_left_alone",
        summary: `Joon left ${leftAlone.total.toLocaleString("en-IN")} customers out of ${campaign.name} because their current state suggested a different action.`,
        category: "campaign",
        actionTaken: "deliberately_left_alone",
        entityId: campaign.id,
        entityType: "campaign",
        metadata: { reasonCounts: leftAlone.reasonCounts, customerIds: leftAlone.customerIds },
      },
    });
  }

  // The merchant may be anywhere when this finishes; leave something durable
  // for them to come back to. In-app only — no external email in v1.
  await recordAudienceReadyActivity({
    campaignId: campaign.id,
    storeId: campaign.storeId,
    campaignName: campaign.name,
    control: input.run.controlCount,
    treatment: input.run.treatmentCount,
    deliberatelyLeftAlone: input.run.leftAloneCount,
  });

  return {
    approvedAt,
    approvalChecksum,
    controlCount: input.run.controlCount,
    treatmentCount: input.run.treatmentCount,
  };
}

/**
 * Same shape the router computed, kept identical so an approval receipt
 * recorded before this extraction still matches one recorded after it.
 */
function createRenderHash(contentHash: string, brandKit: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ documentHash: contentHash, brandKit }))
    .digest("hex");
}
