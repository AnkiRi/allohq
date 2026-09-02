-- Persist a workspace-scoped, provider-neutral AI model routing harness.
-- JSON keeps the policy evolvable; application code validates and normalizes it
-- before any model or provider is selected.
ALTER TABLE "workspaces" ADD COLUMN "modelHarness" JSONB;
