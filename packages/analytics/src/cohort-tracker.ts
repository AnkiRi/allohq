import { prisma } from "@allohq/database";
import type { CohortData } from "./types";

/**
 * Build monthly customer cohort analysis.
 * Groups customers by first-order month, tracks retention + revenue per period.
 */
export async function getCohortAnalysis(
  storeId: string,
  maxPeriods: number = 6
): Promise<CohortData[]> {
  // Get all customers with their orders, grouped by month of first order
  const cohortRows = await prisma.$queryRaw<Array<{
    cohort_month: string;
    period_index: number;
    active_customers: number;
    revenue: number;
    cohort_size: number;
  }>>`
    WITH customer_cohorts AS (
      SELECT
        c.id AS customer_id,
        TO_CHAR(DATE_TRUNC('month', MIN(o."createdAt")), 'YYYY-MM') AS cohort_month,
        MIN(o."createdAt") AS first_order_date
      FROM customers c
      JOIN orders o ON o."customerId" = c.id AND o."storeId" = ${storeId}
      WHERE c."storeId" = ${storeId}
      GROUP BY c.id
    ),
    cohort_sizes AS (
      SELECT cohort_month, COUNT(*)::int AS cohort_size
      FROM customer_cohorts
      GROUP BY cohort_month
    ),
    cohort_activity AS (
      SELECT
        cc.cohort_month,
        EXTRACT(YEAR FROM AGE(DATE_TRUNC('month', o."createdAt"), DATE_TRUNC('month', cc.first_order_date)))::int * 12
          + EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', o."createdAt"), DATE_TRUNC('month', cc.first_order_date)))::int
          AS period_index,
        COUNT(DISTINCT cc.customer_id)::int AS active_customers,
        COALESCE(SUM(o."totalPrice"), 0)::float AS revenue
      FROM customer_cohorts cc
      JOIN orders o ON o."customerId" = cc.customer_id AND o."storeId" = ${storeId}
      GROUP BY cc.cohort_month, period_index
    )
    SELECT
      ca.cohort_month,
      ca.period_index,
      ca.active_customers,
      ca.revenue,
      cs.cohort_size
    FROM cohort_activity ca
    JOIN cohort_sizes cs ON cs.cohort_month = ca.cohort_month
    WHERE ca.period_index >= 0 AND ca.period_index <= ${maxPeriods}
    ORDER BY ca.cohort_month ASC, ca.period_index ASC
  `;

  // Group into CohortData structure
  const cohortMap = new Map<string, CohortData>();

  for (const row of cohortRows) {
    const month = row.cohort_month;
    let cohort = cohortMap.get(month);
    if (!cohort) {
      cohort = {
        cohortMonth: month,
        customerCount: row.cohort_size,
        periods: [],
      };
      cohortMap.set(month, cohort);
    }

    cohort.periods.push({
      periodIndex: row.period_index,
      activeCustomers: row.active_customers,
      revenue: Math.round(row.revenue * 100) / 100,
      retentionRate: row.cohort_size > 0
        ? Math.round((row.active_customers / row.cohort_size) * 10000) / 100
        : 0,
    });
  }

  return Array.from(cohortMap.values());
}
