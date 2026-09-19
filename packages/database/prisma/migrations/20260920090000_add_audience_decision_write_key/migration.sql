-- Idempotency for the audience-decision ledger.
--
-- A retried campaign approval re-ran createMany and duplicated rows, because
-- the table has no uniqueness and the write passed no skipDuplicates. A unique
-- index on the meaning-bearing columns was considered and rejected: a customer
-- held back by two different rules is overridden separately, producing two rows
-- that differ only by reasonCode and justification, and such an index would
-- have deleted one of them.
--
-- This keys the write event instead. Approval sets a deterministic value per
-- approval attempt; overrides leave it NULL. Postgres allows many NULLs in a
-- unique index, so existing rows and every merchant action are unaffected and
-- no backfill or cleanup is required.
ALTER TABLE "customer_audience_decisions" ADD COLUMN "writeKey" TEXT;

CREATE UNIQUE INDEX "customer_audience_decisions_writeKey_key"
  ON "customer_audience_decisions"("writeKey");
