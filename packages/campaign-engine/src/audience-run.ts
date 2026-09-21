import { randomUUID } from "node:crypto";
import { prisma, Prisma } from "@allohq/database";
import {
  assignmentValue,
  normalizeStratum,
  planStratifiedControlQuotas,
  type StratifiedAssignmentResult,
} from "@allohq/customer-state";
import { streamCampaignAudience, type AudienceExclusionReason } from "./audience-resolver";

/**
 * Durable approval resolution.
 *
 * Approval used to resolve the audience into Node and draw the control group
 * from in-process structures, so a 100k campaign held the whole audience in the
 * API process. Here the audience is evaluated exactly once, written to
 * `campaign_audience_members` in bounded chunks, and Postgres performs the
 * control selection over those durable rows.
 *
 * What is retained in Node, for any audience size:
 *   - the stratum census: one integer per RFM stratum (tens of entries)
 *   - one write buffer of at most `writeChunk` rows
 *   - counts and at most three samples per exclusion reason
 *
 * No array, Map, Set, JSON snapshot or control heap grows with the audience.
 * The persisted rows are intentional product and audit data: they are the
 * frozen approved membership, the merchant's review surface, and the table the
 * control selection ranks over.
 */

/** Rows per write statement. Bounds both the buffer and each statement's size. */
const DEFAULT_WRITE_CHUNK = 2_000;

/**
 * How long a worker may hold a run before another may take it over. Long enough
 * that a healthy worker never loses its lease mid-flush — the lease is renewed
 * on every chunk — and short enough that a crashed worker does not strand a
 * merchant's campaign.
 */
const LEASE_MS = 2 * 60 * 1_000;

/** Thrown when another worker is actively preparing the same run. */
export class AudienceRunBusyError extends Error {
  readonly code = "AUDIENCE_RUN_BUSY" as const;
  constructor(readonly runId: string) {
    super(`Audience run ${runId} is already being prepared`);
    this.name = "AudienceRunBusyError";
  }
}

/**
 * What preparation is doing, in the merchant's terms.
 *
 * `state` is deliberately not the run's internal status. A merchant has no use
 * for "resolving" versus "assigning" — both mean Joon is still working — and
 * "failed" reads as lost work when the run is in fact queued for another
 * attempt. The internal status stays available as `status` for operators and
 * logs; the UI shows `state` and `detail`.
 */
export type AudienceRunState = "preparing" | "ready" | "needs_attention";

export interface AudienceRunProgress {
  /** Stable across retries, resumes and takeovers. */
  runId: string;
  state: AudienceRunState;
  /** Internal run status. Operator-facing; not for merchant UI. */
  status: AudienceRunStatus;
  evaluated: number;
  candidates: number;
  deliberatelyLeftAlone: number;
  notReceiving: number;
  control: number;
  treatment: number;
  startedAt: Date;
  completedAt: Date | null;
  attempts: number;
  /**
   * Whether another attempt will happen on its own. A stalled or failed run is
   * picked up by the recovery sweep, so it is recoverable without the merchant
   * approving again — which is what stops it reading as abandoned.
   */
  recoverable: boolean;
  /** One sentence in merchant language, or null while simply working. */
  detail: string | null;
}

/** Members whose decision makes them eligible for an arm. */
export const CANDIDATE_DECISION = "campaign_candidate";

export type AudienceRunStatus = "resolving" | "assigning" | "complete" | "failed";

export interface AudienceRunInput {
  campaignId: string;
  storeId: string;
  /**
   * Deterministic per-attempt key. Approving the same campaign state twice
   * reuses the same run rather than freezing a second membership.
   */
  runKey: string;
  assignmentSeed: string;
  policyVersion: string;
  policy?: Record<string, unknown>;
  /** Campaign control rate for an assignment stratum. Policy stays in TypeScript. */
  rateForStratum: (stratum: string) => number;
  /** Fixed evaluation instant for the whole run. */
  asOf?: Date;
  enforceDeliveryPauses?: boolean;
  writeChunk?: number;
  /** Lease holder id. Defaults to a fresh id per call. */
  owner?: string;
}

export interface AudienceRunResult {
  runId: string;
  reused: boolean;
  asOf: Date;
  requested: number;
  candidateCount: number;
  controlCount: number;
  treatmentCount: number;
  leftAloneCount: number;
  excludedCount: number;
  strata: StratifiedAssignmentResult["strata"];
  exclusions: Record<AudienceExclusionReason, number>;
  samples: Awaited<ReturnType<typeof streamCampaignAudience>>["samples"];
  /** Bounded operational detail. Never contains per-customer data. */
  diagnostics: {
    memberWriteStatements: number;
    pooledFixupRows: number;
    pooledFixupStatements: number;
    assignmentStatements: number;
    strataCounted: number;
  };
}

interface PendingMember {
  runId: string;
  customerId: string;
  decision: string;
  reasonCode: string | null;
  reasonText: string | null;
  evidence: Prisma.InputJsonValue;
  merchantOverride: boolean;
  stratum: string;
  assignmentStratum: string | null;
  assignmentHash: number | null;
  reconsiderAt: Date | null;
  reconsiderOn: string | null;
}

/**
 * Resolve, stage and assign a campaign audience.
 *
 * Throws on failure after marking the run `failed`, so an incomplete run is
 * never mistaken for a frozen membership. Callers must only treat a run as
 * authoritative once this resolves.
 */
export async function runCampaignAudienceResolution(
  input: AudienceRunInput
): Promise<AudienceRunResult> {
  const writeChunk = input.writeChunk ?? DEFAULT_WRITE_CHUNK;
  const owner = input.owner ?? randomUUID();
  const existing = await prisma.campaignAudienceRun.findUnique({
    where: { campaignId_runKey: { campaignId: input.campaignId, runKey: input.runKey } },
  });

  if (existing?.status === "complete") {
    return summariseCompleteRun(existing, { reused: true });
  }

  // Create-or-take-over, never delete-and-restart. Two approvals of the same
  // campaign used to share one mutable run row: the second called restartRun,
  // removed the first's in-flight member rows, and the first then wrote
  // `failed` onto the run the second was still finishing. A lease makes
  // ownership explicit, and durable rows are resumed rather than discarded.
  let run: { id: string; asOf: Date; assignmentSeed: string; resumeCursor: string | null };
  if (existing) {
    run = await takeOverRun(existing, owner, input);
  } else {
    try {
      const created = await prisma.campaignAudienceRun.create({
        data: {
          campaignId: input.campaignId,
          storeId: input.storeId,
          runKey: input.runKey,
          asOf: input.asOf ?? new Date(),
          assignmentSeed: input.assignmentSeed,
          policyVersion: input.policyVersion,
          policy: (input.policy ?? {}) as Prisma.InputJsonValue,
          status: "resolving",
          leaseOwner: owner,
          leaseExpiresAt: new Date(Date.now() + LEASE_MS),
          attempts: 1,
        },
      });
      run = created;
    } catch (error) {
      // Lost a creation race with a simultaneous approval. The winner owns the
      // run; this caller joins it rather than surfacing a unique-violation.
      if (!isUniqueViolation(error)) throw error;
      const winner = await prisma.campaignAudienceRun.findUniqueOrThrow({
        where: { campaignId_runKey: { campaignId: input.campaignId, runKey: input.runKey } },
      });
      if (winner.status === "complete") return summariseCompleteRun(winner, { reused: true });
      run = await takeOverRun(winner, owner, input);
    }
  }

  try {
    return await resolveAndAssign(run, input, writeChunk, owner);
  } catch (error) {
    // Only the lease holder may mark the run failed. Without this check a
    // superseded attempt could fail a run another worker is finishing.
    await prisma.campaignAudienceRun
      .updateMany({
        where: { id: run.id, leaseOwner: owner, status: { not: "complete" } },
        data: {
          status: "failed",
          leaseOwner: null,
          leaseExpiresAt: null,
          failureReason: error instanceof Error ? error.message.slice(0, 500) : String(error),
        },
      })
      .catch(() => undefined);
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "P2002";
}

/**
 * Take ownership of an existing incomplete run, or refuse.
 *
 * A live lease held by someone else is not an error condition to work around —
 * it means another worker is actively preparing this campaign, and a second
 * one must not touch its rows.
 */
async function takeOverRun(
  existing: {
    id: string;
    status: string;
    leaseExpiresAt: Date | null;
    assignmentSeed: string;
    policyVersion: string;
  },
  owner: string,
  input: AudienceRunInput
): Promise<{ id: string; asOf: Date; assignmentSeed: string; resumeCursor: string | null }> {
  const now = new Date();
  // Durable rows are only resumable under the parameters that produced them.
  // The assignment hash is seeded by the run seed, so resuming across a changed
  // seed or policy would mix two rankings inside one control group. When they
  // differ the run starts over from an empty membership; when they match, work
  // already done is kept.
  const resumable =
    existing.assignmentSeed === input.assignmentSeed &&
    existing.policyVersion === input.policyVersion;
  const claimed = await prisma.campaignAudienceRun.updateMany({
    where: {
      id: existing.id,
      status: { not: "complete" },
      OR: [{ leaseOwner: null }, { leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: "resolving",
      leaseOwner: owner,
      leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      attempts: { increment: 1 },
      failureReason: null,
      ...(resumable
        ? {}
        : {
            assignmentSeed: input.assignmentSeed,
            policyVersion: input.policyVersion,
            policy: (input.policy ?? {}) as Prisma.InputJsonValue,
            resumeCursor: null,
            asOf: input.asOf ?? now,
          }),
    },
  });
  if (claimed.count !== 1) throw new AudienceRunBusyError(existing.id);
  // Only once the lease is held, so a discard can never race another worker.
  if (!resumable) {
    await prisma.campaignAudienceMember.deleteMany({ where: { runId: existing.id } });
  }
  return prisma.campaignAudienceRun.findUniqueOrThrow({ where: { id: existing.id } });
}

async function resolveAndAssign(
  run: { id: string; asOf: Date; assignmentSeed: string; resumeCursor: string | null },
  input: AudienceRunInput,
  writeChunk: number,
  owner: string
): Promise<AudienceRunResult> {
  const buffer: PendingMember[] = [];
  let memberWriteStatements = 0;

  const flush = async () => {
    if (buffer.length === 0) return;
    const cursor = buffer[buffer.length - 1]!.customerId;
    await prisma.campaignAudienceMember.createMany({ data: buffer, skipDuplicates: true });
    memberWriteStatements += 1;
    buffer.length = 0;
    // Renew the lease and advance the resume cursor in the same statement the
    // chunk is acknowledged by, so an interrupted run resumes from durable work
    // and a healthy worker never loses its lease mid-flush. Losing the lease
    // here means another worker has taken over; this one must stop rather than
    // keep writing into a run it no longer owns.
    const held = await prisma.campaignAudienceRun.updateMany({
      where: { id: run.id, leaseOwner: owner },
      data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS), resumeCursor: cursor },
    });
    if (held.count !== 1) throw new AudienceRunBusyError(run.id);
  };

  // One policy evaluation. Every customer is judged against the run's fixed
  // `asOf`, so eligibility cannot drift between resolution and assignment.
  // A resumed attempt continues from the last durable chunk; `skipDuplicates`
  // on (runId, customerId) makes any overlap at the boundary a no-op.
  const summary = await streamCampaignAudience(
    input.campaignId,
    async (decision) => {
      if (decision.kind === "eligible") {
        const stratum = normalizeStratum(decision.customer.rfmStratum);
        buffer.push({
          runId: run.id,
          customerId: decision.customer.id,
          decision: CANDIDATE_DECISION,
          reasonCode: null,
          reasonText: null,
          evidence: { rfmStratum: decision.customer.rfmStratum },
          merchantOverride: false,
          stratum,
          // Provisional: correct for every stratum that is not pooled. Pooling
          // is only known once the census closes, and pooled strata hold fewer
          // than ten customers each, so the fixup below is bounded and tiny.
          assignmentStratum: stratum,
          assignmentHash: assignmentValue(`${run.assignmentSeed}:${stratum}`, decision.customer.id),
          reconsiderAt: null,
          reconsiderOn: null,
        });
      } else if (decision.kind === "deliberately_left_alone") {
        buffer.push({
          runId: run.id,
          customerId: decision.customer.id,
          decision: "deliberately_left_alone",
          reasonCode: decision.decision.reasonCode ?? "state_policy",
          reasonText:
            decision.decision.reasonText ??
            "Joon decided this campaign was unnecessary for the customer’s current state.",
          evidence: (decision.decision.evidence ?? {}) as Prisma.InputJsonValue,
          merchantOverride: false,
          stratum: normalizeStratum(null),
          assignmentStratum: null,
          assignmentHash: null,
          reconsiderAt: decision.decision.reconsiderAt ?? null,
          reconsiderOn: decision.decision.reconsiderOn ?? null,
        });
      } else {
        buffer.push({
          runId: run.id,
          customerId: decision.customer.id,
          decision: "excluded",
          reasonCode: decision.reason,
          reasonText: `Excluded by ${decision.reason.replaceAll("_", " ")}.`,
          evidence: {},
          merchantOverride: false,
          stratum: normalizeStratum(null),
          assignmentStratum: null,
          assignmentHash: null,
          reconsiderAt: null,
          reconsiderOn: null,
        });
      }
      if (buffer.length >= writeChunk) await flush();
    },
    run.asOf,
    {
      enforceDeliveryPauses: input.enforceDeliveryPauses ?? true,
      ...(run.resumeCursor ? { afterCustomerId: run.resumeCursor } : {}),
    }
  );
  await flush();

  // Counts come from the durable rows, not from this attempt's accumulators, so
  // a resumed run reports the whole audience rather than the part it evaluated.
  const decisionCounts = await prisma.campaignAudienceMember.groupBy({
    by: ["decision"],
    where: { runId: run.id },
    _count: { _all: true },
  });
  const countOf = (decision: string) =>
    decisionCounts.find((row) => row.decision === decision)?._count._all ?? 0;
  // The census must cover the whole run, not this attempt, or a resumed run
  // would plan quotas against a fraction of its own candidates. It is one row
  // per RFM stratum — tens of entries — so reading it back costs nothing.
  const censusRows = await prisma.campaignAudienceMember.groupBy({
    by: ["stratum"],
    where: { runId: run.id, decision: CANDIDATE_DECISION },
    _count: { _all: true },
  });
  const census = new Map(censusRows.map((row) => [row.stratum, row._count._all]));
  const candidateCount = countOf(CANDIDATE_DECISION);
  const leftAloneCount = countOf("deliberately_left_alone");
  const excludedCount = countOf("excluded");
  const evaluated = candidateCount + leftAloneCount + excludedCount;

  await prisma.campaignAudienceRun.update({
    where: { id: run.id },
    data: {
      status: "assigning",
      requested: evaluated,
      candidateCount,
      leftAloneCount,
      excludedCount,
      diagnostics: {
        exclusions: summary.exclusions,
        samples: summary.samples,
      } as Prisma.InputJsonValue,
    },
  });

  // Quotas come from the census, which cost one integer per stratum.
  const plan = planStratifiedControlQuotas({ census, rateForStratum: input.rateForStratum });

  // Only strata that pooled need their provisional assignment stratum and hash
  // rewritten. Each such stratum holds fewer than ten candidates by definition.
  let pooledFixupRows = 0;
  let pooledFixupStatements = 0;
  for (const [stratum, assignmentStratum] of plan.assignmentStratum) {
    if (assignmentStratum === stratum) continue;
    const rows = await prisma.campaignAudienceMember.findMany({
      where: { runId: run.id, decision: CANDIDATE_DECISION, stratum },
      select: { id: true, customerId: true },
      orderBy: { customerId: "asc" },
    });
    for (const row of rows) {
      await prisma.campaignAudienceMember.update({
        where: { id: row.id },
        data: {
          assignmentStratum,
          assignmentHash: assignmentValue(
            `${run.assignmentSeed}:${assignmentStratum}`,
            row.customerId
          ),
        },
      });
      pooledFixupStatements += 1;
    }
    pooledFixupRows += rows.length;
  }

  const assignmentStatements = await assignArmsInDatabase(run.id, plan.strata);

  const armCounts = await prisma.campaignAudienceMember.groupBy({
    by: ["arm"],
    where: { runId: run.id, decision: CANDIDATE_DECISION },
    _count: { _all: true },
  });
  const controlCount =
    armCounts.find((row) => row.arm === "CONTROL")?._count._all ?? 0;
  const treatmentCount =
    armCounts.find((row) => row.arm === "TREATMENT")?._count._all ?? 0;
  const unassigned = candidateCount - controlCount - treatmentCount;
  if (unassigned !== 0) {
    throw new Error(
      `Audience run ${run.id} left ${unassigned} of ${candidateCount} candidates unassigned`
    );
  }

  const diagnostics = {
    memberWriteStatements,
    pooledFixupRows,
    pooledFixupStatements,
    assignmentStatements,
    strataCounted: census.size,
  };
  const completed = await prisma.campaignAudienceRun.update({
    where: { id: run.id },
    data: {
      status: "complete",
      controlCount,
      treatmentCount,
      assignedAt: new Date(),
      completedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
      diagnostics: {
        exclusions: summary.exclusions,
        samples: summary.samples,
        strata: plan.strata,
        ...diagnostics,
      } as Prisma.InputJsonValue,
    },
  });

  return {
    runId: completed.id,
    reused: false,
    asOf: completed.asOf,
    requested: evaluated,
    candidateCount,
    controlCount,
    treatmentCount,
    leftAloneCount,
    excludedCount,
    strata: plan.strata,
    exclusions: summary.exclusions,
    samples: summary.samples,
    diagnostics,
  };
}

/**
 * Exact per-stratum control selection, performed by Postgres over the durable
 * rows. One statement for the whole audience: each candidate is ranked inside
 * its assignment stratum and the first `controlCount` are marked CONTROL.
 *
 * `customerId` is compared with the C collation so the tiebreak is byte order
 * regardless of database locale, matching the in-memory reference ranking for
 * the cuid-shaped ids this table holds. `audience-run.test.ts` pins that
 * agreement rather than assuming it.
 */
async function assignArmsInDatabase(
  runId: string,
  strata: StratifiedAssignmentResult["strata"]
): Promise<number> {
  const entries = Object.entries(strata);
  if (entries.length === 0) return 0;
  const quotas = Prisma.join(
    entries.map(([stratum, detail]) => Prisma.sql`(${stratum}::text, ${detail.controlCount}::int)`)
  );
  await prisma.$executeRaw`
    WITH quotas(stratum, quota) AS (VALUES ${quotas}),
    ranked AS (
      SELECT
        m."id",
        m."assignmentStratum" AS stratum,
        row_number() OVER (
          PARTITION BY m."assignmentStratum"
          ORDER BY m."assignmentHash" ASC, m."customerId" COLLATE "C" ASC
        ) AS rank
      FROM "campaign_audience_members" m
      WHERE m."runId" = ${runId}
        AND m."decision" = ${CANDIDATE_DECISION}
        AND m."assignmentStratum" IS NOT NULL
    )
    UPDATE "campaign_audience_members" AS target
    SET "arm" = CASE
      WHEN ranked."rank" <= quotas."quota" THEN 'CONTROL'::"TreatmentArm"
      ELSE 'TREATMENT'::"TreatmentArm"
    END
    FROM ranked
    JOIN quotas ON quotas."stratum" = ranked."stratum"
    WHERE target."id" = ranked."id"
  `;
  return 1;
}

function summariseCompleteRun(
  run: {
    id: string;
    asOf: Date;
    requested: number;
    candidateCount: number;
    controlCount: number;
    treatmentCount: number;
    leftAloneCount: number;
    excludedCount: number;
    diagnostics: unknown;
  },
  options: { reused: boolean }
): AudienceRunResult {
  const diagnostics = (run.diagnostics ?? {}) as Record<string, unknown>;
  return {
    runId: run.id,
    reused: options.reused,
    asOf: run.asOf,
    requested: run.requested,
    candidateCount: run.candidateCount,
    controlCount: run.controlCount,
    treatmentCount: run.treatmentCount,
    leftAloneCount: run.leftAloneCount,
    excludedCount: run.excludedCount,
    strata: (diagnostics["strata"] ?? {}) as StratifiedAssignmentResult["strata"],
    exclusions: (diagnostics["exclusions"] ?? {}) as Record<AudienceExclusionReason, number>,
    samples: (diagnostics["samples"] ?? {}) as AudienceRunResult["samples"],
    diagnostics: {
      memberWriteStatements: Number(diagnostics["memberWriteStatements"] ?? 0),
      pooledFixupRows: Number(diagnostics["pooledFixupRows"] ?? 0),
      pooledFixupStatements: Number(diagnostics["pooledFixupStatements"] ?? 0),
      assignmentStatements: Number(diagnostics["assignmentStatements"] ?? 0),
      strataCounted: Number(diagnostics["strataCounted"] ?? 0),
    },
  };
}

/**
 * Preparation progress for a campaign, in the merchant's own terms.
 *
 * Deliberately not database mechanics: no row counts, no statement counts, no
 * run ids beyond the one needed to address it. Counts come from the run record
 * itself, which preparation keeps current, so reading progress costs one row.
 */
export async function campaignPreparationProgress(
  campaignId: string
): Promise<AudienceRunProgress | null> {
  const run = await prisma.campaignAudienceRun.findFirst({
    where: { campaignId },
    orderBy: { startedAt: "desc" },
  });
  if (!run) return null;
  const status = run.status as AudienceRunStatus;
  const evaluated = run.candidateCount + run.leftAloneCount + run.excludedCount;
  const state: AudienceRunState =
    status === "complete" ? "ready" : status === "failed" ? "needs_attention" : "preparing";
  return {
    runId: run.id,
    state,
    status,
    evaluated,
    candidates: run.candidateCount,
    deliberatelyLeftAlone: run.leftAloneCount,
    notReceiving: run.excludedCount,
    control: run.controlCount,
    treatment: run.treatmentCount,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    attempts: run.attempts,
    // A failed run is queued for another attempt by the recovery sweep, so it
    // is never abandoned; the merchant does not have to approve again.
    recoverable: status !== "complete",
    // The reason only. "Nothing has been sent" is reassurance the surface adds
    // alongside it; carrying it here too made the merchant read it twice.
    detail:
      status === "failed"
        ? "Joon stopped partway through working out this audience and will try again on its own."
        : status === "complete"
          ? null
          : run.attempts > 1
            ? "Joon is picking this up again after an interruption. Work already done has been kept."
            : null,
  };
}

/**
 * The frozen membership for a campaign, or null when no run has completed.
 * Attribution, causal evidence, delivery and billing must read through this:
 * a resolving, assigning or failed run is deliberately invisible.
 */
export async function completedAudienceRun(campaignId: string) {
  return prisma.campaignAudienceRun.findFirst({
    where: { campaignId, status: "complete" },
    orderBy: { completedAt: "desc" },
  });
}

/**
 * Page approved assignments out of a completed run in ascending customer id.
 * The caller decides what to do with each page and keeps nothing; the send
 * worker uses this instead of loading a whole cohort into a Map.
 */
export async function pageApprovedAssignments(
  runId: string,
  options: { pageSize?: number; arm?: "CONTROL" | "TREATMENT" } = {}
) {
  const pageSize = options.pageSize ?? 1_000;
  let cursor: string | null = null;
  return {
    async *pages() {
      for (;;) {
        const rows: Array<{ customerId: string; arm: "CONTROL" | "TREATMENT" | null; assignmentStratum: string | null; assignmentHash: number | null }> =
          await prisma.campaignAudienceMember.findMany({
            where: {
              runId,
              decision: CANDIDATE_DECISION,
              ...(options.arm ? { arm: options.arm } : {}),
              ...(cursor ? { customerId: { gt: cursor } } : {}),
            },
            select: {
              customerId: true,
              arm: true,
              assignmentStratum: true,
              assignmentHash: true,
            },
            orderBy: { customerId: "asc" },
            take: pageSize,
          });
        if (rows.length === 0) return;
        yield rows;
        cursor = rows[rows.length - 1]!.customerId;
        if (rows.length < pageSize) return;
      }
    },
  };
}

/**
 * Materialise the frozen measurement assignments from a completed run.
 *
 * One `INSERT ... SELECT` over the durable rows: the approval path never builds
 * an array of assignments, and the whole cohort lands or none of it does, so an
 * interrupted approval cannot leave a half-written delivery authority.
 *
 * Row ids are derived from the member row's id rather than generated randomly,
 * so re-running this for the same run is a true no-op rather than a second set
 * of rows racing the unique key.
 */
export async function materialiseMeasurementAssignments(input: {
  runId: string;
  campaignId: string;
  storeId: string;
  experimentId: string;
  assignedAt: Date;
  windowStartsAt: Date;
  windowEndsAt: Date;
  assignmentData: Record<string, unknown>;
}): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO "measurement_assignments" (
      "id", "storeId", "experimentId", "campaignId", "unitType", "unitId",
      "customerId", "arm", "stratum", "holdoutRate", "assignedAt",
      "windowStartsAt", "windowEndsAt", "assignmentData", "createdAt"
    )
    SELECT
      'ma_' || m."id",
      ${input.storeId},
      ${input.experimentId},
      ${input.campaignId},
      'campaign',
      ${input.campaignId},
      m."customerId",
      m."arm",
      COALESCE(m."assignmentStratum", m."stratum"),
      COALESCE((run."diagnostics" #>> ARRAY['strata', COALESCE(m."assignmentStratum", m."stratum"), 'holdoutRate'])::double precision, 0),
      ${input.assignedAt},
      ${input.windowStartsAt},
      ${input.windowEndsAt},
      ${JSON.stringify(input.assignmentData)}::jsonb || jsonb_build_object('originalStratum', m."stratum"),
      NOW()
    FROM "campaign_audience_members" m
    JOIN "campaign_audience_runs" run ON run."id" = m."runId"
    WHERE m."runId" = ${input.runId}
      AND m."decision" = ${CANDIDATE_DECISION}
      AND m."arm" IS NOT NULL
      AND run."status" = 'complete'
    ON CONFLICT ("unitType", "unitId", "customerId") DO NOTHING
  `;
}

/**
 * Rebuild the merchant-readable audience evaluation from a completed run.
 *
 * The evaluation tables back the campaign review drawer — grouped reasons, the
 * searchable left-alone list, treatment counts and decision history — so they
 * keep their shape and their vocabulary. Only the writer changes: the rows are
 * projected from the durable membership in one statement instead of being
 * assembled in the API process.
 */
export async function materialiseAudienceEvaluation(input: {
  runId: string;
  campaignId: string;
  storeId: string;
  campaignUpdatedAt: Date;
  requested: number;
  candidateCount: number;
  controlCount: number;
  treatmentCount: number;
  leftAloneCount: number;
  excludedCount: number;
  exclusions: Record<string, number>;
  retainEvaluations?: number;
}): Promise<{ evaluationId: string; rows: number }> {
  const evaluation = await prisma.campaignAudienceEvaluation.create({
    data: {
      campaignId: input.campaignId,
      storeId: input.storeId,
      campaignUpdatedAt: input.campaignUpdatedAt,
      requested: input.requested,
      candidateCount: input.candidateCount,
      treatmentCount: input.treatmentCount,
      controlCount: input.controlCount,
      decisionCounts: {
        candidate: 0,
        treatment: input.treatmentCount,
        control: input.controlCount,
        deliberately_left_alone: input.leftAloneCount,
        excluded: input.excludedCount,
        reasons: input.exclusions,
      } as Prisma.InputJsonValue,
    },
  });
  const rows = await prisma.$executeRaw`
    INSERT INTO "campaign_audience_evaluation_rows" (
      "id", "evaluationId", "customerId", "decision", "reasonCode", "reasonText",
      "evidence", "createdAt"
    )
    SELECT
      'ev_' || m."id",
      ${evaluation.id},
      m."customerId",
      CASE
        WHEN m."decision" = ${CANDIDATE_DECISION} AND m."arm" = 'CONTROL' THEN 'control'
        WHEN m."decision" = ${CANDIDATE_DECISION} AND m."arm" = 'TREATMENT' THEN 'treatment'
        WHEN m."decision" = ${CANDIDATE_DECISION} THEN 'candidate'
        ELSE m."decision"
      END,
      CASE
        WHEN m."decision" = ${CANDIDATE_DECISION} AND m."arm" IS NOT NULL THEN 'experiment_assignment'
        ELSE m."reasonCode"
      END,
      CASE
        WHEN m."decision" = ${CANDIDATE_DECISION} AND m."arm" = 'CONTROL'
          THEN 'Randomly held back for campaign measurement.'
        WHEN m."decision" = ${CANDIDATE_DECISION} AND m."arm" = 'TREATMENT'
          THEN 'Assigned to receive this campaign.'
        WHEN m."decision" = ${CANDIDATE_DECISION}
          THEN 'Candidate before the campaign control is drawn.'
        ELSE m."reasonText"
      END,
      m."evidence",
      NOW()
    FROM "campaign_audience_members" m
    WHERE m."runId" = ${input.runId}
    ON CONFLICT ("evaluationId", "customerId") DO NOTHING
  `;

  // Keep the most recent evaluations only; the older ones are superseded review
  // surfaces, not measurement or delivery authority.
  const retain = input.retainEvaluations ?? 3;
  const retained = await prisma.campaignAudienceEvaluation.findMany({
    where: { campaignId: input.campaignId },
    select: { id: true },
    orderBy: { evaluatedAt: "desc" },
    take: retain,
  });
  await prisma.campaignAudienceEvaluation.deleteMany({
    where: { campaignId: input.campaignId, id: { notIn: retained.map((row) => row.id) } },
  });
  return { evaluationId: evaluation.id, rows };
}

/**
 * Append the approval's audience-decision ledger from a completed run.
 *
 * This is the merchant's decision history. It is read by nobody in delivery or
 * measurement, so it follows the approval claim. `writeKey` keeps a retried
 * approval idempotent while still recording a genuinely changed decision, and
 * merchant overrides keep a null key so none of their rows collapse.
 */
export async function materialiseAudienceDecisions(input: {
  runId: string;
  campaignId: string;
  storeId: string;
  contextKey: string;
  approvedAt: Date;
}): Promise<number> {
  const keyPrefix = `approval:${input.campaignId}:${input.approvedAt.toISOString()}`;
  return prisma.$executeRaw`
    INSERT INTO "customer_audience_decisions" (
      "id", "storeId", "customerId", "campaignId", "contextKey", "decision",
      "writeKey", "reasonCode", "reasonText", "evidence", "reconsiderAt",
      "reconsiderOn", "merchantOverride", "createdAt"
    )
    SELECT
      'ad_' || m."id",
      ${input.storeId},
      m."customerId",
      ${input.campaignId},
      ${input.contextKey},
      decided."decision",
      ${keyPrefix} || ':' || m."customerId" || ':' || decided."decision",
      CASE WHEN m."decision" = ${CANDIDATE_DECISION} THEN 'experiment_assignment' ELSE m."reasonCode" END,
      CASE
        WHEN m."arm" = 'CONTROL' THEN 'Randomly placed in this campaign''s control group.'
        WHEN m."arm" = 'TREATMENT' THEN 'Assigned to receive this campaign.'
        ELSE m."reasonText"
      END,
      CASE
        WHEN m."decision" = ${CANDIDATE_DECISION}
          THEN jsonb_build_object(
            'stratum', m."stratum",
            'assignmentStratum', m."assignmentStratum",
            'controlRate', COALESCE(
              (run."diagnostics" #>> ARRAY['strata', COALESCE(m."assignmentStratum", m."stratum"), 'holdoutRate'])::double precision,
              0
            )
          )
        ELSE m."evidence"
      END,
      m."reconsiderAt",
      m."reconsiderOn",
      false,
      NOW()
    FROM "campaign_audience_members" m
    JOIN "campaign_audience_runs" run ON run."id" = m."runId"
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN m."arm" = 'CONTROL' THEN 'control'
        WHEN m."arm" = 'TREATMENT' THEN 'treatment'
        ELSE m."decision"
      END AS "decision"
    ) decided
    WHERE m."runId" = ${input.runId}
      AND run."status" = 'complete'
      AND (m."decision" = 'deliberately_left_alone' OR m."arm" IS NOT NULL)
    ON CONFLICT ("writeKey") DO NOTHING
  `;
}

/**
 * Bounded summary of a run's deliberately-left-alone decisions, for the
 * merchant's activity feed: reason counts, and at most `sampleSize` customer
 * ids. Both come from the database, so the feed no longer depends on approval
 * having held the left-alone list in memory.
 */
export async function leftAloneActivitySummary(
  runId: string,
  options: { sampleSize?: number } = {}
): Promise<{ total: number; reasonCounts: Record<string, number>; customerIds: string[] }> {
  const grouped = await prisma.campaignAudienceMember.groupBy({
    by: ["reasonCode"],
    where: { runId, decision: "deliberately_left_alone" },
    _count: { _all: true },
  });
  const reasonCounts: Record<string, number> = {};
  let total = 0;
  for (const row of grouped) {
    reasonCounts[row.reasonCode ?? "state_policy"] = row._count._all;
    total += row._count._all;
  }
  const sample = await prisma.campaignAudienceMember.findMany({
    where: { runId, decision: "deliberately_left_alone" },
    select: { customerId: true },
    orderBy: { customerId: "asc" },
    take: options.sampleSize ?? 100,
  });
  return { total, reasonCounts, customerIds: sample.map((row) => row.customerId) };
}
