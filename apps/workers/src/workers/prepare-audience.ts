import { prisma } from "@allohq/database";
import {
  AudienceRunBusyError,
  CampaignApprovalConflictError,
  finalizeCampaignApproval,
  runCampaignAudienceResolution,
  recordAudienceNeedsAttentionActivity,
  type CampaignPreparationRequest,
} from "@allohq/campaign-engine";
import { holdoutRateFor } from "@allohq/customer-state";

/**
 * Durable campaign audience preparation.
 *
 * Approval used to resolve the audience inside the tRPC request — 34.6 s for
 * 100k customers, with no checkpoint and no resume. A restart mid-request
 * stranded the run until the merchant clicked approve again. The request now
 * validates and enqueues; this job prepares, finalises the approval and
 * dispatches the send, so an interruption resumes on its own.
 *
 * Idempotent throughout: the run key is deterministic per campaign state, so a
 * retry joins the same durable run, and finalisation is a no-op once the
 * campaign is approved.
 */
export async function prepareCampaignAudience(
  request: CampaignPreparationRequest,
  enqueueSend: (campaignId: string, forceImmediate: boolean) => Promise<void>
): Promise<{ status: "approved" | "already_approved" | "busy"; runId?: string }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: request.campaignId },
    select: { id: true, approvedAt: true, approvalChecksum: true, status: true },
  });
  if (!campaign) throw new Error(`Campaign ${request.campaignId} no longer exists`);

  const run = await runCampaignAudienceResolution({
    campaignId: request.campaignId,
    storeId: request.storeId,
    runKey: request.runKey,
    assignmentSeed: request.assignmentSeed,
    policyVersion: "campaign-stratified-v1",
    policy: {
      family: request.family,
      policyRate: request.policyRate,
      policyReason: request.policyReason,
      // Recorded on the run so a crashed worker's preparation can be
      // re-enqueued from the run alone, with no request context to recover.
      preparationRequest: request,
    },
    rateForStratum: (stratum: string) =>
      holdoutRateFor(request.storeId, request.family, stratum, request.evidence ?? null).rate,
  }).catch(async (error) => {
    // Another worker holds the lease. That worker will finish and dispatch, so
    // this attempt stops rather than competing for the same rows.
    if (error instanceof AudienceRunBusyError) return null;
    // Preparation genuinely failed. Leave the merchant something durable that
    // says so safely; the recovery sweep will try again on its own.
    const failed = await prisma.campaign.findUnique({
      where: { id: request.campaignId },
      select: { name: true },
    });
    if (failed) {
      await recordAudienceNeedsAttentionActivity({
        campaignId: request.campaignId,
        storeId: request.storeId,
        campaignName: failed.name,
      }).catch(() => undefined);
    }
    throw error;
  });
  if (!run) return { status: "busy" };

  try {
    await finalizeCampaignApproval({
      campaignId: request.campaignId,
      run,
      experimentId: request.experimentId,
      family: request.family,
      policy: { rate: request.policyRate, reason: request.policyReason } as never,
      deliveryProvider: request.deliveryProvider,
      emailPreflightReceipt: request.emailPreflightReceipt,
      ...(request.approvedBy ? { approvedBy: request.approvedBy } : {}),
    });
  } catch (error) {
    // The campaign was already claimed — by a duplicate job, or by a retry
    // whose predecessor finished after it started. The frozen audience and
    // arms are the same either way, so this is success, not failure.
    if (error instanceof CampaignApprovalConflictError) {
      return { status: "already_approved", runId: run.runId };
    }
    throw error;
  }

  await enqueueSend(request.campaignId, request.forceImmediate);
  return { status: "approved", runId: run.runId };
}

/**
 * Recover preparation runs abandoned by a crashed or restarted worker.
 *
 * A run whose lease has expired is not being advanced by anyone. Re-enqueuing
 * it is safe because preparation resumes from durable rows rather than
 * restarting, and it is what makes recovery automatic: a merchant never has to
 * click approve a second time because a worker died.
 *
 * A complete run is never touched.
 */
export async function recoverStalePreparationRuns(
  enqueuePreparation: (request: CampaignPreparationRequest) => Promise<void>,
  now = new Date()
): Promise<{ recovered: number; skipped: number }> {
  const stale = await prisma.campaignAudienceRun.findMany({
    where: {
      status: { in: ["resolving", "assigning", "failed"] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    orderBy: { startedAt: "asc" },
    take: 25,
  });
  let recovered = 0;
  let skipped = 0;
  for (const run of stale) {
    const request = preparationRequestFrom(run);
    if (!request) {
      // Written before the job carried its own request, or by a path that did
      // not record one. Left alone rather than guessed at.
      skipped += 1;
      continue;
    }
    await enqueuePreparation(request);
    recovered += 1;
  }
  return { recovered, skipped };
}

/** The request a run recorded when it was created, if it carries one. */
function preparationRequestFrom(run: {
  policy: unknown;
  campaignId: string;
  storeId: string;
  runKey: string;
  assignmentSeed: string;
}): CampaignPreparationRequest | null {
  const policy = (run.policy ?? {}) as Record<string, unknown>;
  const request = policy["preparationRequest"];
  if (!request || typeof request !== "object") return null;
  return request as CampaignPreparationRequest;
}
