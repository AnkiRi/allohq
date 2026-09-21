import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CampaignPreparationPanel } from "./CampaignPreparationPanel";
import {
  canApproveDelivery,
  preparationPollInterval,
  PREPARATION_POLL_MS,
  type PreparationProgress,
} from "../../lib/campaign-preparation";

/**
 * Rendered-component coverage for the campaign preparation panel.
 *
 * This renders the real component through React and asserts on the markup it
 * produces, rather than testing the view model alone. There is no browser in
 * this repository's test setup, so interaction is covered where it lives: the
 * polling policy is a pure function the page hands to `refetchInterval`, and is
 * asserted directly.
 *
 * Point (d), reload, is meaningful precisely because there is no client state:
 * a reloaded page has only the status payload, so the same payload must render
 * identically.
 */

function progress(overrides: Partial<PreparationProgress> = {}): PreparationProgress {
  return {
    runId: "run_abc",
    state: "preparing",
    evaluated: 0,
    candidates: 0,
    deliberatelyLeftAlone: 0,
    notReceiving: 0,
    control: 0,
    treatment: 0,
    startedAt: "2026-09-21T05:00:00.000Z",
    completedAt: null,
    attempts: 1,
    recoverable: true,
    detail: null,
    ...overrides,
  };
}

const render = (props: Parameters<typeof CampaignPreparationPanel>[0]) =>
  renderToStaticMarkup(createElement(CampaignPreparationPanel, props));

test("(a) polling begins while preparation is active", () => {
  assert.equal(preparationPollInterval(progress({ evaluated: 10 })), PREPARATION_POLL_MS);
  assert.equal(preparationPollInterval(progress({ attempts: 2 })), PREPARATION_POLL_MS);
});

test("(b) progress counts render in the markup", () => {
  const html = render({
    progress: progress({
      evaluated: 42_000,
      notReceiving: 3_800,
      deliberatelyLeftAlone: 1_200,
      candidates: 37_000,
      control: 5_550,
      treatment: 31_450,
    }),
  });

  assert.match(html, /Joon is preparing who should receive this/);
  // Indian grouping, as the product uses everywhere else.
  for (const value of ["42,000", "3,800", "1,200", "37,000", "5,550", "31,450"]) {
    assert.ok(html.includes(value), `expected ${value} in the rendered panel`);
  }
  for (const label of [
    "Looked at",
    "Not receiving",
    "Deliberately left alone",
    "Campaign candidates",
    "Control group",
    "Treatment group",
  ]) {
    assert.ok(html.includes(label), `expected the "${label}" label`);
  }
  assert.ok(html.includes('aria-live="polite"'), "an updating region must announce itself");
});

test("(c) send and schedule are disabled while preparing", () => {
  const preparing = progress({ evaluated: 500 });
  assert.equal(canApproveDelivery({ campaignStatus: "draft", progress: preparing }), false);
  // And the panel is what tells the merchant why.
  const html = render({ progress: preparing });
  assert.match(html, /leave this page or reload/i);
});

test("(d) a reload renders identically from the same status payload", () => {
  const payload = progress({ evaluated: 61_000, candidates: 55_000, attempts: 2 });
  const first = render({ progress: payload });
  const afterReload = render({ progress: { ...payload } });
  assert.equal(first, afterReload, "a reloaded page must render the same panel");
  // A resumed run must say work was kept, so an interruption is not mistaken
  // for a restart.
  assert.match(first, /picking this up again/i);
  assert.match(first, /kept/i);
});

test("(e) polling stops once the audience is ready", () => {
  const ready = progress({ state: "ready", completedAt: "2026-09-21T05:04:00.000Z" });
  assert.equal(preparationPollInterval(ready), false);
  assert.equal(preparationPollInterval(null), false);
  // A finished run renders nothing, so the page returns to its normal state.
  assert.equal(render({ progress: ready }), "");
});

test("(f) needs attention renders the reason, the reassurance and a recovery action", () => {
  const html = render({
    progress: progress({
      state: "needs_attention",
      detail:
        "Joon stopped partway through working out this audience and will try again on its own. Nothing has been sent.",
    }),
    onRetry: () => undefined,
  });

  assert.match(html, /needs another go/i);
  assert.ok(html.includes("Nothing has been sent."), "the reassurance must be rendered");
  assert.match(html, /Try again now/);
  assert.ok(html.includes('data-testid="preparation-retry"'), "a recovery action must exist");
  assert.equal(preparationPollInterval(progress({ state: "needs_attention" })), false);
});

test("(g) a ready audience still respects the global delivery pause and domain gates", () => {
  const ready = progress({ state: "ready" });
  assert.equal(canApproveDelivery({ campaignStatus: "draft", progress: ready }), true);
  assert.equal(
    canApproveDelivery({ campaignStatus: "draft", progress: ready, deliveryBlocked: true }),
    false,
    "a paused store or unverified domain must still block a ready audience"
  );
  assert.equal(
    canApproveDelivery({ campaignStatus: "sending", progress: ready }),
    false,
    "only a draft may be approved"
  );
});

test("the rendered panel contains no infrastructure language", () => {
  const html = render({ progress: progress({ evaluated: 900, candidates: 800, attempts: 2 }) });
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  for (const leak of ["queue", "worker", "lease", "Postgres", "database", "chunk", "resolving", "assigning"]) {
    assert.ok(
      !text.toLowerCase().includes(leak.toLowerCase()),
      `rendered panel leaked "${leak}": ${text}`
    );
  }
});
