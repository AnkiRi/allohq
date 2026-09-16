ALTER TABLE "customer_states"
  ADD COLUMN "evaluationClaimId" TEXT,
  ADD COLUMN "evaluationClaimedAt" TIMESTAMP(3),
  ADD COLUMN "evaluationFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "customer_states_storeId_evaluationClaimedAt_idx"
  ON "customer_states"("storeId", "evaluationClaimedAt");

CREATE TABLE "customer_state_transitions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "fromVersion" INTEGER NOT NULL,
    "toVersion" INTEGER NOT NULL,
    "cause" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "nextEvaluationAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_state_transitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_state_transitions_customerId_dimension_toVersion_key"
  ON "customer_state_transitions"("customerId", "dimension", "toVersion");

CREATE INDEX "customer_state_transitions_storeId_occurredAt_idx"
  ON "customer_state_transitions"("storeId", "occurredAt");

CREATE INDEX "customer_state_transitions_storeId_dimension_toValue_occurredAt_idx"
  ON "customer_state_transitions"("storeId", "dimension", "toValue", "occurredAt");

CREATE INDEX "customer_state_transitions_customerId_occurredAt_idx"
  ON "customer_state_transitions"("customerId", "occurredAt");

ALTER TABLE "customer_state_transitions"
  ADD CONSTRAINT "customer_state_transitions_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_state_transitions"
  ADD CONSTRAINT "customer_state_transitions_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
