-- Existing profiles predate due-queue scheduling. Queue them once so the new
-- worker can calculate their next evidence-based reconsideration boundary.
UPDATE "customer_states"
SET "nextEvaluationAt" = NOW()
WHERE "nextEvaluationAt" IS NULL;
