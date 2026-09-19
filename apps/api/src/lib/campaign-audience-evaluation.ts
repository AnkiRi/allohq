import type { AudienceResolution } from "@allohq/campaign-engine";

type Assignment = { arm: "CONTROL" | "TREATMENT" };

export async function persistCampaignAudienceEvaluation(
  prisma: any,
  input: {
    campaignId: string;
    storeId: string;
    campaignUpdatedAt: Date;
    audience: AudienceResolution;
    assignments?: Record<string, Assignment>;
  },
) {
  const rows = new Map<string, {
    customerId: string;
    decision: string;
    reasonCode: string | null;
    reasonText: string | null;
    evidence: Record<string, unknown>;
  }>();
  let treatmentCount = 0;
  let controlCount = 0;
  for (const customer of input.audience.eligible) {
    const arm = input.assignments?.[customer.id]?.arm;
    if (arm === "CONTROL") controlCount += 1;
    else if (arm === "TREATMENT") treatmentCount += 1;
    rows.set(customer.id, {
      customerId: customer.id,
      decision: arm === "CONTROL" ? "control" : arm === "TREATMENT" ? "treatment" : "candidate",
      reasonCode: arm ? "experiment_assignment" : null,
      reasonText: arm === "CONTROL" ? "Randomly held back for campaign measurement." : arm === "TREATMENT" ? "Assigned to receive this campaign." : "Candidate before the campaign control is drawn.",
      evidence: { rfmStratum: customer.rfmStratum },
    });
  }
  for (const customer of input.audience.deliberatelyLeftAlone) {
    rows.set(customer.id, {
      customerId: customer.id,
      decision: "deliberately_left_alone",
      reasonCode: customer.decision.reasonCode ?? "state_policy",
      reasonText: customer.decision.reasonText ?? "Joon decided this campaign was unnecessary for the customer’s current state.",
      evidence: customer.decision.evidence ?? {},
    });
  }
  for (const [reasonCode, customers] of Object.entries(input.audience.excludedCustomers)) {
    for (const customer of customers ?? []) {
      rows.set(customer.id, {
        customerId: customer.id,
        decision: "excluded",
        reasonCode,
        reasonText: `Excluded by ${reasonCode.replaceAll("_", " ")}.`,
        evidence: {},
      });
    }
  }

  const decisionCounts = {
    candidate: input.assignments ? 0 : input.audience.eligible.length,
    treatment: treatmentCount,
    control: controlCount,
    deliberately_left_alone: input.audience.deliberatelyLeftAlone.length,
    excluded: Object.values(input.audience.exclusions).reduce((sum, count) => sum + count, 0),
    reasons: input.audience.exclusions,
  };

  // The row inserts below are already chunked, but they all run inside this one
  // transaction, so Prisma's five-second default cancelled the whole snapshot
  // for a large audience and took campaign approval down with it. The snapshot
  // is the merchant-readable review surface rather than the delivery or
  // measurement authority, so it stays atomic and is given a realistic budget.
  return prisma.$transaction(async (tx: any) => {
    const evaluation = await tx.campaignAudienceEvaluation.create({
      data: {
        campaignId: input.campaignId,
        storeId: input.storeId,
        campaignUpdatedAt: input.campaignUpdatedAt,
        requested: input.audience.requested,
        candidateCount: input.audience.eligible.length,
        treatmentCount,
        controlCount,
        decisionCounts,
      },
    });
    const allRows = [...rows.values()];
    for (let offset = 0; offset < allRows.length; offset += 2_000) {
      await tx.campaignAudienceEvaluationRow.createMany({
        data: allRows.slice(offset, offset + 2_000).map((row) => ({
          evaluationId: evaluation.id,
          ...row,
          evidence: row.evidence,
        })),
        skipDuplicates: true,
      });
    }
    const retained = await tx.campaignAudienceEvaluation.findMany({
      where: { campaignId: input.campaignId },
      select: { id: true },
      orderBy: { evaluatedAt: "desc" },
      take: 3,
    });
    await tx.campaignAudienceEvaluation.deleteMany({
      where: {
        campaignId: input.campaignId,
        id: { notIn: retained.map((item: { id: string }) => item.id) },
      },
    });
    return evaluation;
  }, { timeout: 120_000, maxWait: 15_000 });
}
