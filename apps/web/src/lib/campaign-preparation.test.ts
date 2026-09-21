import test from "node:test";
import assert from "node:assert/strict";
import {
  canApproveDelivery,
  preparationView,
  type PreparationProgress,
} from "./campaign-preparation";

/**
 * The campaign page's preparation state. Approval is a background job, so the
 * page has to explain an in-flight audience rather than leave the campaign
 * sitting in Draft with no explanation.
 */

function progress(overrides: Partial<PreparationProgress> = {}): PreparationProgress {
  return {
    runId: "run_1",
    state: "preparing",
    evaluated: 0,
    candidates: 0,
    deliberatelyLeftAlone: 0,
    notReceiving: 0,
    control: 0,
    treatment: 0,
    startedAt: new Date().toISOString(),
    completedAt: null,
    attempts: 1,
    recoverable: true,
    detail: null,
    ...overrides,
  };
}

test("a campaign with no preparation run behaves normally", () => {
  const view = preparationView(null);
  assert.equal(view.kind, "none");
  assert.equal(view.poll, false);
  assert.equal(view.sendingBlocked, false);
  assert.equal(canApproveDelivery({ campaignStatus: "draft", progress: null }), true);
});

test("while preparing, the page polls, explains itself and blocks sending", () => {
  const view = preparationView(
    progress({ evaluated: 12_000, notReceiving: 900, candidates: 11_100 })
  );
  assert.equal(view.kind, "preparing");
  assert.equal(view.poll, true, "an in-flight run must keep the page updating");
  assert.equal(view.sendingBlocked, true);
  if (view.kind !== "preparing") return;

  assert.match(view.headline, /preparing who should receive this/i);
  // The merchant must be told a reload is safe, because the job outlives the page.
  assert.match(view.reassurance, /leave this page or reload/i);

  // Merchant language, not infrastructure.
  const wording = `${view.headline} ${view.note} ${view.reassurance} ${view.counts.map((c) => `${c.label} ${c.hint}`).join(" ")}`;
  for (const leak of ["run", "job", "queue", "worker", "lease", "database", "row", "resolv", "assign", "chunk", "Postgres"]) {
    assert.ok(
      !wording.toLowerCase().includes(leak.toLowerCase()),
      `preparation wording leaked "${leak}": ${wording}`
    );
  }
});

test("counts appear in merchant terms and hide not-yet-counted zeroes", () => {
  const view = preparationView(
    progress({ evaluated: 500, notReceiving: 40, candidates: 460, control: 0, treatment: 0 })
  );
  if (view.kind !== "preparing") return assert.fail("expected preparing");
  const labels = view.counts.map((count) => count.label);
  assert.deepEqual(labels, ["Looked at", "Not receiving", "Campaign candidates"]);
  // Zero control three seconds in means "not counted yet", not "none held back".
  assert.ok(!labels.includes("Control group"));

  const settled = preparationView(
    progress({ evaluated: 500, notReceiving: 40, candidates: 460, control: 69, treatment: 391 })
  );
  if (settled.kind !== "preparing") return assert.fail("expected preparing");
  assert.deepEqual(settled.counts.map((count) => count.label), [
    "Looked at",
    "Not receiving",
    "Campaign candidates",
    "Control group",
    "Treatment group",
  ]);
});

test("a resumed run says work was kept, so an interruption does not look like a restart", () => {
  const view = preparationView(progress({ attempts: 2, evaluated: 8_000 }));
  if (view.kind !== "preparing") return assert.fail("expected preparing");
  assert.match(view.note, /picking this up again/i);
  assert.match(view.note, /kept/i);
});

test("when complete, the page returns to its normal state and sending is allowed", () => {
  const view = preparationView(progress({ state: "ready", completedAt: new Date().toISOString() }));
  assert.equal(view.kind, "ready");
  assert.equal(view.poll, false, "a finished run must stop polling");
  assert.equal(view.sendingBlocked, false);
});

test("needs attention shows the reason, says nothing was sent, and offers a retry", () => {
  const view = preparationView(
    progress({
      state: "needs_attention",
      detail:
        "Joon stopped partway through working out this audience and will try again on its own. Nothing has been sent.",
    })
  );
  assert.equal(view.kind, "needs_attention");
  if (view.kind !== "needs_attention") return;
  assert.equal(view.sendingBlocked, true);
  assert.equal(view.poll, false);
  assert.equal(view.reassurance, "Nothing has been sent.");
  assert.match(view.retryLabel, /try again/i);
  assert.ok(view.reason.length > 0);
});

test("sending is blocked until the audience is ready", () => {
  const preparing = progress({ evaluated: 100 });
  const attention = progress({ state: "needs_attention" });
  const ready = progress({ state: "ready" });

  assert.equal(canApproveDelivery({ campaignStatus: "draft", progress: preparing }), false);
  assert.equal(canApproveDelivery({ campaignStatus: "draft", progress: attention }), false);
  assert.equal(canApproveDelivery({ campaignStatus: "draft", progress: ready }), true);

  // Existing gates still win.
  assert.equal(
    canApproveDelivery({ campaignStatus: "draft", progress: ready, deliveryBlocked: true }),
    false,
    "a delivery gate must still block even with a ready audience"
  );
  assert.equal(
    canApproveDelivery({ campaignStatus: "sending", progress: ready }),
    false,
    "only a draft can be approved"
  );
});

test("reloading mid-run reproduces the same view from the same progress", () => {
  // A reloaded page has only what the query returns; there is no client state
  // to lose. The same payload must therefore produce the same view.
  const payload = progress({ evaluated: 40_000, notReceiving: 3_600, candidates: 36_400, attempts: 2 });
  assert.deepEqual(preparationView(payload), preparationView({ ...payload }));
});
