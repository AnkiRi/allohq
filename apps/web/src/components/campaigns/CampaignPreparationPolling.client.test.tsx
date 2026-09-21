import "global-jsdom/register";
import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import {
  CampaignPreparationSection,
  type PreparationStatus,
} from "./CampaignPreparationSection";
import { type PreparationProgress } from "../../lib/campaign-preparation";

/**
 * Polling must stop once the audience is ready.
 *
 * Its own file, and deliberately without an `afterEach` hook. jsdom's document
 * is process-global, and this is the one test that asserts the *absence* of
 * activity across a real interval. Run alongside siblings it failed with no
 * error at all; the cause was node:test interleaving top-level tests so one
 * test's cleanup landed inside this one's observation window. A single test
 * with no hook has nothing to interleave with.
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

// Unmount between tests. Left mounted, a previous test's polling component
// keeps its timer and its nodes in the document, and `screen` queries match
// the stale render.
/**
 * One describe, so these run one after another. node:test interleaved the
 * top-level tests, and they share a single jsdom document: one test's cleanup
 * wiped another's DOM mid-assertion, which surfaced as the whole file failing
 * with no error at all.
 */
/**
 * Its own file on purpose. jsdom's document is process-global, and this test
 * asserts the absence of activity over a real interval — a sibling test's
 * cleanup landing in that window makes it fail for the wrong reason.
 */
test("6. reaching ready stops polling and restores the normal action", async () => {
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
});
