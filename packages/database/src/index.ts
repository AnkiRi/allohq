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
export { computeMonthlyInvoice, MissingComparisonCapEvidenceError } from "@allohq/pricing";
export type { Currency as PricingCurrency } from "@allohq/pricing";

// Causal-data moat: DecisionRecord substrate (backed by the decision_records view)
export { getDecisionRecords } from "./decision-records";
export type {
  DecisionRecord,
  GetDecisionRecordsOptions,
} from "./decision-records";

// Cross-brand Identity layer (additive): normalization helpers for keying
// Customers to a shared Identity. Unused in single-brand behavior.
export { normalizeEmail, normalizePhone } from "./identity";

// Shared segment membership resolution (one model: manual | conditions | rfm)
export { buildWhereFromConditions, resolveSegmentWhere } from "./segments";
export type { SegmentCondition, SegmentConditions } from "./segments";
export { MESSAGING_RATES_INR, messagingCostFor } from "./messaging-rates";
export { CAMPAIGN_ORIGINS, parseCampaignOrigin } from "./campaign-origin";
export type { CampaignOriginValue } from "./campaign-origin";
export {
  ATTRIBUTION_WINDOW_DAYS,
  CAUSAL_LEDGER_COMPUTATION_VERSION,
  REFUND_REVISION_DAYS,
  billingPeriodsToRecompute,
  ledgerWinnerMatches,
  providerAcceptanceCountsForPostage,
  computeLedgerSnapshot,
  measurementRecoveryStart,
  shouldCreateLedgerVersion,
} from "./causal-ledger";
export type {
  FrozenAssignmentInput,
  LedgerSnapshot,
  LedgerSnapshotInput,
  NetOrderInput,
} from "./causal-ledger";
export {
  encryptSecret,
  decryptSecret,
  isEncryptedSecret,
  safeSecretEqual,
  assertDataEncryptionConfigured,
} from "./secrets";
export { getMarketingDeliveryPermission, marketingPermissionFromState } from "./contact-policy";
export { emailDomain, requireVerifiedSenderDomain } from "./sender-domain";
export type {
  DeliveryPermission,
  MarketingChannel,
} from "./contact-policy";
// Demo / sandbox mode (logged-out visitor → seeded Vana, read-mostly). Resolved
// by STABLE slug/domain (portable across dev/prod), not hardcoded cuids.
export {
  DEMO_WORKSPACE_SLUG,
  DEMO_STORE_DOMAIN,
  DEMO_OWNER_CLERK_ID,
  DEMO_STORE_NAME,
  DEMO_HEADER,
  getDemoWorkspaceId,
  getDemoStoreId,
} from "./demo";
