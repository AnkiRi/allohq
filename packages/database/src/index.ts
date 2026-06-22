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

// Cross-brand Identity layer (additive): normalization helpers for keying
// Customers to a shared Identity. Unused in single-brand behavior.
export { normalizeEmail, normalizePhone } from "./identity";

// Demo / sandbox mode constants (storeless visitor → seeded Vana, read-mostly)
export {
  DEMO_STORE_ID,
  DEMO_WORKSPACE_ID,
  DEMO_STORE_NAME,
  DEMO_HEADER,
} from "./demo";
