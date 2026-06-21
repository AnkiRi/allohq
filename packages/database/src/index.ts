import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";

// Causal-data moat: DecisionRecord substrate (backed by the decision_records view)
export { getDecisionRecords } from "./decision-records";
export type {
  DecisionRecord,
  GetDecisionRecordsOptions,
} from "./decision-records";
