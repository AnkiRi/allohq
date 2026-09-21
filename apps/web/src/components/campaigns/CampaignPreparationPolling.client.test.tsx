import "global-jsdom/register";
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  CampaignPreparationSection,
  type PreparationStatus,
} from "./CampaignPreparationSection";
import { type PreparationProgress } from "../../lib/campaign-preparation";

/**
 * Polling must stop once the audience is ready.
 *
 * Its own file, holding one test, and unmounting in its own `finally` rather
 * than an `afterEach`.
 *
 * jsdom's document is process-global, and this is the one test that asserts the
 * *absence* of activity across a real interval. Run alongside siblings it
 * failed with no error at all: node:test interleaved the top-level tests, so a
 * sibling's `afterEach` cleanup landed inside this one's observation window.
 * One test in one file has nothing to interleave with.
 *
 * Unmounting still matters, and doing it in the body rather than a hook is the
 * point. Left mounted, the component outlived the test and the file
 * intermittently failed to finish — 19 s locally, 43 s on a hosted runner, with
 * no assertion error and no result reported for the test itself.
 *
 * The server-rendered tests prove what the markup says for a given state. They
 * cannot prove that mounting starts a poll, that the poll repeats, that counts
 * change on screen between ticks, or that polling stops when the audience is
 * ready — all of which are effects. These mount the real component in jsdom
 * with a controlled fetcher and drive real timers.
 *
 * A short poll interval is injected rather than faking timers, because the
 * component awaits a promise between ticks and fake timers interleave poorly
 * with microtasks.
 */

const POLL_MS = 20;

function progress(overrides: Partial<PreparationProgress> = {}): PreparationProgress {
  return {
    runId: "run_client",
    state: "preparing",
    evaluated: 0,
    candidates: 0,
    deliberatelyLeftAlone: 0,
    notReceiving: 0,
    control: 0,
    treatment: 0,
    startedAt: "2026-09-21T08:00:00.000Z",
    completedAt: null,
    attempts: 1,
    recoverable: true,
    detail: null,
    ...overrides,
  };
}

/** A fetcher that hands back a scripted sequence, then repeats the last entry. */
function scriptedFetcher(sequence: PreparationStatus[]) {
  let calls = 0;
  const fetcher = async () => {
    const value = sequence[Math.min(calls, sequence.length - 1)]!;
    calls += 1;
    return value;
  };
  return {
    fetcher,
    get calls() {
      return calls;
    },
  };
}

const preparing = (over: Partial<PreparationProgress> = {}): PreparationStatus => ({
  preparation: progress(over),
  sendable: false,
});
const ready = (): PreparationStatus => ({
  preparation: progress({
    state: "ready",
    completedAt: "2026-09-21T08:02:00.000Z",
    evaluated: 1_000,
    candidates: 900,
    control: 135,
    treatment: 765,
  }),
  sendable: true,
});

test("6. reaching ready stops polling and restores the normal action", async () => {
try {
const script = scriptedFetcher([preparing({ evaluated: 5_000 }), ready()]);
render(
  React.createElement(CampaignPreparationSection, {
    fetchStatus: script.fetcher,
    campaignStatus: "draft",
    pollMsOverride: POLL_MS,
  })
);

// Wait for the panel to appear first: it is also absent before the first
// fetch resolves, so asserting absence immediately would pass for the wrong
// reason.
await screen.findByTestId("preparation-preparing");
await waitFor(() => assert.equal(screen.queryByTestId("preparation-preparing"), null), {
  timeout: 3_000,
});
const settled = script.calls;
// Give the timer several intervals to fire again. It must not. A plain wait,
// not act(): the point is that no React work happens, and act() would sit
// waiting on pending work across every component mounted in this file.
await new Promise((resolve) => setTimeout(resolve, POLL_MS * 12));
assert.equal(script.calls, settled, `polling continued after ready: ${settled} -> ${script.calls}`);

const button = screen.getByTestId("approve-delivery") as HTMLButtonElement;
assert.equal(button.disabled, false, "a ready audience must restore the normal action");
assert.match(button.textContent ?? "", /Approve delivery/);
} finally {
  // Unmount before the test returns, which runs the effect cleanup and clears
  // any timer still scheduled. Left mounted, the component outlives the test
  // and the file intermittently failed to finish — 19 s locally, 43 s on a
  // hosted runner, with no assertion error and no test result reported.
  //
  // In the body rather than an `afterEach`: the hook is what made this file
  // interleave with its siblings in the first place, and this file holds one
  // test, so a hook buys nothing.
  cleanup();
}
});
