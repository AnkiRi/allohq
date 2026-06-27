// Shared segment membership resolution — used by the API router, the agent's
// create_segment tool, AND the send worker, so preview, creation, detail view,
// and campaign recipients all run the SAME query. One segment model:
//   manual (explicit customerIds) | conditions (rules) | rfm (legacy score range)

export type SegmentCondition = { field: string; op: string; value: unknown };
export type SegmentConditions = { operator: "AND" | "OR"; conditions: SegmentCondition[] };

function buildComparison(op: string, value: any): any {
  switch (op) {
    case "equals": return value;
    case "notEquals": return { not: value };
    case "greaterThan": return { gt: value };
    case "lessThan": return { lt: value };
    case "greaterThanOrEqual": return { gte: value };
    case "lessThanOrEqual": return { lte: value };
    case "contains": return { contains: value, mode: "insensitive" };
    default: return value;
  }
}

/** Build a Prisma customer `where` from segment conditions. */
export function buildWhereFromConditions(conditions: SegmentConditions, storeIds: string[]): any {
  const baseWhere: any = { storeId: { in: storeIds } };
  const clauses: any[] = [];
  for (const cond of conditions.conditions ?? []) {
    switch (cond.field) {
      case "rfmSegment":
        clauses.push({ rfmScore: { segment: buildComparison(cond.op, cond.value) } });
        break;
      case "totalSpent":
        clauses.push({ rfmScore: { totalSpent: buildComparison(cond.op, Number(cond.value)) } });
        break;
      case "orderCount":
        clauses.push({ rfmScore: { orderCount: buildComparison(cond.op, Number(cond.value)) } });
        break;
      case "avgOrderValue":
        clauses.push({ rfmScore: { avgOrderValue: buildComparison(cond.op, Number(cond.value)) } });
        break;
      case "daysSinceLastOrder": {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - Number(cond.value));
        if (cond.op === "greaterThan") clauses.push({ rfmScore: { lastOrderAt: { lt: cutoff } } });
        else if (cond.op === "lessThan") clauses.push({ rfmScore: { lastOrderAt: { gt: cutoff } } });
        break;
      }
      case "acceptsMarketing":
        clauses.push({ acceptsMarketing: cond.value === true || cond.value === "true" });
        break;
      case "purchasedProduct":
        clauses.push({
          orders: { some: { items: { some: { title: { contains: String(cond.value), mode: "insensitive" } } } } },
        });
        break;
    }
  }
  if (clauses.length === 0) return baseWhere;
  return { ...baseWhere, [conditions.operator === "AND" ? "AND" : "OR"]: clauses };
}

/** Resolve ANY segment → a Prisma customer `where`, by however it's defined. */
export function resolveSegmentWhere(
  segment: { customerIds?: string[] | null; conditions?: unknown; rfmMin?: number | null; rfmMax?: number | null },
  storeIds: string[],
): any {
  if (segment.customerIds && segment.customerIds.length > 0) {
    return { storeId: { in: storeIds }, id: { in: segment.customerIds } };
  }
  if (segment.conditions) {
    return buildWhereFromConditions(segment.conditions as SegmentConditions, storeIds);
  }
  return {
    storeId: { in: storeIds },
    rfmScore: { totalScore: { gte: segment.rfmMin ?? 0, lte: segment.rfmMax ?? 15 } },
  };
}
