import "global-jsdom/register";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CampaignPreparationSection,
  type PreparationStatus,
} from "./CampaignPreparationSection";
import { type PreparationProgress } from "../../lib/campaign-preparation";

/**
 * Client-rendered coverage: effects actually run and timers actually fire.
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
describe("campaign preparation, client-rendered", () => {
  // Unmount between tests; they share one document.
  afterEach(() => {
    cleanup();
  });

  it("1 & 2. polling begins on mount and repeats while preparation is active", async () => {
  const script = scriptedFetcher([preparing({ evaluated: 100 })]);
  render(
    React.createElement(CampaignPreparationSection, {
      fetchStatus: script.fetcher,
      campaignStatus: "draft",
      pollMsOverride: POLL_MS,
    })
  );

  await waitFor(() => assert.ok(script.calls >= 1, "mounting must start a poll"));
  const afterFirst = script.calls;
  await waitFor(
    () => assert.ok(script.calls > afterFirst + 1, `poll did not repeat: ${script.calls}`),
    { timeout: 2_000 }
  );
});

  it("3. progress counts visibly update between polls", async () => {
  const script = scriptedFetcher([
    preparing({ evaluated: 10_000, candidates: 9_000 }),
    preparing({ evaluated: 40_000, candidates: 36_000 }),
    preparing({ evaluated: 90_000, candidates: 81_000 }),
  ]);
  render(
    React.createElement(CampaignPreparationSection, {
      fetchStatus: script.fetcher,
      campaignStatus: "draft",
      pollMsOverride: POLL_MS,
    })
  );

  await screen.findByText("10,000");
  // The same element must later show a larger number, which only happens if a
  // later poll landed and re-rendered.
  await waitFor(() => assert.ok(screen.queryByText("90,000"), "counts did not update on screen"), {
    timeout: 3_000,
  });
  assert.ok(!screen.queryByText("10,000"), "the stale count is still on screen");
});

  it("4. send is disabled while preparation is incomplete", async () => {
  const script = scriptedFetcher([preparing({ evaluated: 500 })]);
  render(
    React.createElement(CampaignPreparationSection, {
      fetchStatus: script.fetcher,
      campaignStatus: "draft",
      pollMsOverride: POLL_MS,
    })
  );

  const button = (await screen.findByTestId("approve-delivery")) as HTMLButtonElement;
  await waitFor(() => assert.equal(button.disabled, true));
  assert.match(button.textContent ?? "", /Preparing audience/);
});

  it("5. a remount restores progress from the API, not from client state", async () => {
  const first = scriptedFetcher([preparing({ evaluated: 61_000, attempts: 2 })]);
  const view = render(
    React.createElement(CampaignPreparationSection, {
      fetchStatus: first.fetcher,
      campaignStatus: "draft",
      pollMsOverride: POLL_MS,
    })
  );
  await screen.findByText("61,000");

  // Unmount entirely — the reload case. Nothing client-side survives.
  view.unmount();
  assert.equal(screen.queryByText("61,000"), null);

  const second = scriptedFetcher([preparing({ evaluated: 61_000, attempts: 2 })]);
  render(
    React.createElement(CampaignPreparationSection, {
      fetchStatus: second.fetcher,
      campaignStatus: "draft",
      pollMsOverride: POLL_MS,
    })
  );
  await screen.findByText("61,000");
  assert.ok(second.calls >= 1, "a remount must ask the API again");
  // A resumed run still explains itself after the reload.
  assert.ok(screen.getByText(/picking this up again/i));
});

  it("7. needs attention is merchant-safe, says nothing was sent, and offers recovery", async () => {
  let retried = 0;
  const script = scriptedFetcher([
    {
      preparation: progress({
        state: "needs_attention",
        detail:
          "Joon stopped partway through working out this audience and will try again on its own.",
      }),
      sendable: false,
    },
  ]);
  render(
    React.createElement(CampaignPreparationSection, {
      fetchStatus: script.fetcher,
      campaignStatus: "draft",
      pollMsOverride: POLL_MS,
      onRetry: () => {
        retried += 1;
      },
    })
  );

  await screen.findByTestId("preparation-needs-attention");
  assert.ok(screen.getByText(/Nothing has been sent\./));

  const rendered = document.body.textContent ?? "";
  for (const leak of ["queue", "worker", "lease", "Postgres", "database", "chunk", "resolving", "assigning"]) {
    assert.ok(
      !rendered.toLowerCase().includes(leak.toLowerCase()),
      `needs-attention leaked "${leak}"`
    );
  }

  const retry = screen.getByTestId("preparation-retry") as HTMLButtonElement;
  assert.equal(retry.disabled, false);
  fireEvent.click(retry);
  assert.equal(retried, 1, "the recovery action must be wired");

  const approve = screen.getByTestId("approve-delivery") as HTMLButtonElement;
  assert.equal(approve.disabled, true, "sending stays blocked while the audience needs attention");
});

  it("8. a ready audience still respects the global delivery pause", async () => {
  const script = scriptedFetcher([ready()]);
  render(
    React.createElement(CampaignPreparationSection, {
      fetchStatus: script.fetcher,
      campaignStatus: "draft",
      deliveryBlocked: true,
      pollMsOverride: POLL_MS,
    })
  );

  const button = (await screen.findByTestId("approve-delivery")) as HTMLButtonElement;
  await waitFor(() => assert.equal(button.disabled, true));
  assert.match(
    button.textContent ?? "",
    /Delivery disabled/,
    "a paused store or unverified domain must still block a ready audience"
  );
});
});
