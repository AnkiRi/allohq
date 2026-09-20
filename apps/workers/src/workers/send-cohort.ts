import { prisma } from "@allohq/database";

/**
 * Reading the frozen cohort for delivery.
 *
 * The send planner never holds the cohort. MeasurementAssignment is the
 * delivery authority and is projected from the campaign's completed audience
 * run at approval, so paging it is paging the durable run.
 */

/**
 * Recipients planned per pass. The delivery-time recheck re-runs the audience
 * resolver over exactly these ids, and that resolver pages at 200, so this is a
 * small multiple of it rather than a large `IN (...)` repeated across every
 * internal page.
 */
export const COHORT_PAGE = 1_000;

export type FrozenArm = { customerId: string; arm: "CONTROL" | "TREATMENT" };

/**
 * The frozen cohort in ascending customer id, one page at a time.
 *
 * Campaigns approved before the frozen rows existed keep their legacy map in
 * agentProposal. That map is already resident in the campaign row, so serving
 * pages from it adds nothing to the planner's footprint.
 */
export async function* pageFrozenCohort(
  campaignId: string,
  legacyAssignments?: Record<string, "CONTROL" | "TREATMENT">,
  pageSize = COHORT_PAGE
): AsyncGenerator<FrozenArm[]> {
  let cursor: string | undefined;
  let served = 0;
  for (;;) {
    const page = await prisma.measurementAssignment.findMany({
      where: {
        unitType: "campaign",
        unitId: campaignId,
        ...(cursor ? { customerId: { gt: cursor } } : {}),
      },
      select: { customerId: true, arm: true },
      orderBy: { customerId: "asc" },
      take: pageSize,
    });
    if (page.length === 0) break;
    served += page.length;
    yield page.map((row) => ({
      customerId: row.customerId,
      arm: row.arm as "CONTROL" | "TREATMENT",
    }));
    cursor = page[page.length - 1]!.customerId;
    if (page.length < pageSize) break;
  }
  if (served > 0 || !legacyAssignments) return;
  const legacy = Object.entries(legacyAssignments)
    .map(([customerId, arm]) => ({ customerId, arm }))
    .sort((left, right) => left.customerId.localeCompare(right.customerId));
  for (let index = 0; index < legacy.length; index += pageSize) {
    yield legacy.slice(index, index + pageSize);
  }
}

/** O(1) completeness gate: the cohort's size without reading the cohort. */
export async function frozenCohortSize(
  campaignId: string,
  legacyAssignments?: Record<string, "CONTROL" | "TREATMENT">
): Promise<number> {
  const count = await prisma.measurementAssignment.count({
    where: { unitType: "campaign", unitId: campaignId },
  });
  if (count > 0) return count;
  return legacyAssignments ? Object.keys(legacyAssignments).length : 0;
}

/**
 * One page of the frozen cohort in engagement order, most recently engaged
 * first. SES warm-up reaches the warmest recipients first; Postgres does the
 * ordering so the planner never has to hold every recipient to sort them.
 *
 * The signal is the one the in-memory sort used — the later of the customer's
 * last click and their last order. Keyset paging on (signal DESC, customerId
 * ASC) cannot be a row-wise comparison because the directions differ, so the
 * boundary is spelled out.
 */
export function sesEngagementPage(
  campaignId: string,
  after: { signal: Date; customerId: string } | null,
  take = COHORT_PAGE
): Promise<Array<FrozenArm & { signal: Date }>> {
  const boundarySignal = after?.signal ?? new Date(0);
  const boundaryId = after?.customerId ?? "";
  return prisma.$queryRaw`
    WITH ranked AS (
      SELECT
        ma."customerId",
        ma."arm",
        GREATEST(
          COALESCE(clicks."clickedAt", to_timestamp(0)),
          COALESCE(r."lastOrderAt", to_timestamp(0))
        ) AS signal
      FROM "measurement_assignments" ma
      LEFT JOIN "rfm_scores" r ON r."customerId" = ma."customerId"
      LEFT JOIN LATERAL (
        SELECT MAX(ml."clickedAt") AS "clickedAt"
        FROM "message_logs" ml
        WHERE ml."customerId" = ma."customerId" AND ml."clickedAt" IS NOT NULL
      ) clicks ON TRUE
      WHERE ma."unitType" = 'campaign' AND ma."unitId" = ${campaignId}
    )
    SELECT "customerId", "arm", signal
    FROM ranked
    WHERE ${after === null}::boolean
       OR signal < ${boundarySignal}
       OR (signal = ${boundarySignal} AND "customerId" > ${boundaryId})
    ORDER BY signal DESC, "customerId" ASC
    LIMIT ${take}
  `;
}

/** The frozen cohort in engagement order, one page at a time. */
export async function* pageCohortByEngagement(
  campaignId: string,
  pageSize = COHORT_PAGE
): AsyncGenerator<FrozenArm[]> {
  let after: { signal: Date; customerId: string } | null = null;
  for (;;) {
    const page = await sesEngagementPage(campaignId, after, pageSize);
    if (page.length === 0) return;
    yield page.map((row) => ({ customerId: row.customerId, arm: row.arm }));
    const last = page[page.length - 1]!;
    after = { signal: last.signal, customerId: last.customerId };
    if (page.length < pageSize) return;
  }
}
