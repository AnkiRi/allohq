import { Worker } from "bullmq";
import { Prisma, prisma } from "@allohq/database";
import { QUEUE_NAMES, redisConnection } from "../config";
import { privacyRetentionCutoffs } from "../privacy-retention-policy";

export const privacyRetentionWorker = new Worker(
  QUEUE_NAMES.PRIVACY_RETENTION,
  async () => {
    const cutoffs = privacyRetentionCutoffs();
    const [scrubbed, deleted, providerEventsDeleted, handoffsDeleted, exposuresDeleted, grantsDeleted, landingEventsDeleted] = await prisma.$transaction([
      prisma.privacyRequest.updateMany({
        where: {
          createdAt: { lt: cutoffs.scrubBefore },
          OR: [
            { payload: { not: Prisma.DbNull } },
            { result: { not: Prisma.DbNull } },
            { customerExternalId: { not: null } },
            { error: { not: null } },
          ],
        },
        data: {
          payload: Prisma.DbNull,
          result: Prisma.DbNull,
          customerExternalId: null,
          error: null,
        },
      }),
      prisma.privacyRequest.deleteMany({
        where: { createdAt: { lt: cutoffs.deleteBefore } },
      }),
      prisma.providerWebhookEvent.deleteMany({
        where: { createdAt: { lt: cutoffs.providerEventDeleteBefore } },
      }),
      prisma.shopifyWorkspaceHandoff.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      }),
      prisma.formExperimentExposure.deleteMany({ where: { assignedAt: { lt: cutoffs.acquisitionEvidenceDeleteBefore } } }),
      prisma.formIncentiveGrant.deleteMany({ where: { createdAt: { lt: cutoffs.acquisitionEvidenceDeleteBefore } } }),
      // Public landing events contain only enumerated buckets. Raw event rows are
      // still bounded to 90 days and removed by this gated daily schedule.
      prisma.landingAnalyticsEvent.deleteMany({ where: { createdAt: { lt: cutoffs.landingAnalyticsDeleteBefore } } }),
    ]);

    console.log(
      `[privacy-retention] scrubbed=${scrubbed.count} audit_deleted=${deleted.count} provider_events_deleted=${providerEventsDeleted.count} expired_handoffs_deleted=${handoffsDeleted.count} acquisition_exposures_deleted=${exposuresDeleted.count} incentive_grants_deleted=${grantsDeleted.count} landing_events_deleted=${landingEventsDeleted.count}`
    );
  },
  { connection: redisConnection }
);

privacyRetentionWorker.on("failed", (job, error) => {
  console.error(`[privacy-retention] Job ${job?.id} failed:`, error.message);
});
