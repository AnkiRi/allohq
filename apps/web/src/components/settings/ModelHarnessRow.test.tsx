import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  WorkloadRow,
  type CatalogueModel,
  type CatalogueWorkload,
  type Route,
} from "./ModelHarnessRow";

/**
 * One row is where the promise lives: a merchant must not be able to point a
 * job at a model that cannot do it. The server decides eligibility and the
 * browser renders exactly that list — these assert the browser does not widen
 * it, and that an unreachable model is visible but unselectable rather than
 * quietly missing.
 */
const models: CatalogueModel[] = [
  {
    id: "claude-sonnet-5", label: "Claude Sonnet 5", provider: "anthropic",
    apiModelId: "claude-sonnet-5", capabilities: ["text"], costClass: "premium",
    tier: "recommended", configured: true, note: null,
  },
  {
    id: "gpt-image-flare", label: "GPT Image 2.5 Flare", provider: "openai",
    apiModelId: "gpt-image-2.5-flare", capabilities: ["image_generation", "image_reference_input"],
    costClass: "standard", tier: "recommended", configured: true, note: null,
  },
  {
    id: "nano-banana-pro", label: "Nano Banana Pro", provider: "google",
    apiModelId: "gemini-3-pro-image", capabilities: ["image_generation", "image_reference_input"],
    costClass: "premium", tier: "premium", configured: false, note: null,
  },
];

const campaignArt: CatalogueWorkload = {
  id: "campaign_art", kind: "visual", label: "Campaign imagery",
  purpose: "Hero banners and backgrounds that are not of a specific product.",
  capability: "image_generation",
  eligibleModelIds: ["gpt-image-flare", "nano-banana-pro"],
};

const render = (workload: CatalogueWorkload, route?: Route) =>
  renderToStaticMarkup(
    createElement(WorkloadRow, {
      workload, route, models, inheritLabel: "Joon decides", onChange: () => {},
    } as never),
  );

test("a model that cannot do the job is not offered at all", () => {
  const markup = render(campaignArt);
  assert.doesNotMatch(markup, /Claude Sonnet 5/, "a writing model must never appear under image work");
  assert.match(markup, /GPT Image 2\.5 Flare/);
});

test("an unconfigured model is shown, and shown as unusable", () => {
  const markup = render(campaignArt);
  assert.match(markup, /Nano Banana Pro/, "hiding it would look like the model vanished");
  assert.match(markup, /not configured/);
  assert.match(markup, /disabled=""/);
});

test("the job is described in plain words, not by its internal name", () => {
  const markup = render(campaignArt);
  assert.match(markup, /Campaign imagery/);
  assert.match(markup, /Hero banners and backgrounds/);
  assert.doesNotMatch(markup, /campaign_art/);
});

test("leaving a job alone means Joon decides, not an empty setting", () => {
  assert.match(render(campaignArt), /Joon decides/);
});

test("a chosen model cannot also be its own fallback", () => {
  const markup = render(campaignArt, { primary: "gpt-image-flare", fallbacks: [] });
  const fallbackSelect = markup.slice(markup.lastIndexOf("<select"));
  assert.doesNotMatch(fallbackSelect, /GPT Image 2\.5 Flare/);
  assert.match(fallbackSelect, /Nano Banana Pro/);
});

test("a job with nothing configured behind it says so", () => {
  const markup = render({ ...campaignArt, eligibleModelIds: ["nano-banana-pro"] });
  assert.match(markup, /No model for this job is configured yet/);
});

test("a job whose models are configured does not warn", () => {
  assert.doesNotMatch(render(campaignArt), /No model for this job is configured/);
});

test("product-in-a-scene offers only reference-capable models", () => {
  // The registry decides this; the row must not second-guess it or add to it.
  const productScene: CatalogueWorkload = {
    id: "product_reference_edit", kind: "visual", label: "Your product in a scene",
    purpose: "Sends your real product photo to the model so the product stays itself.",
    capability: "image_reference_input",
    eligibleModelIds: ["gpt-image-flare", "nano-banana-pro"],
  };
  const markup = render(productScene);
  assert.doesNotMatch(markup, /Claude Sonnet 5/);
  assert.match(markup, /your real product photo/);
});

test("a job no model implements is distinguished from one that is unconfigured", () => {
  // Telling a merchant to configure something would send them to add a key
  // that changes nothing. The two states have different remedies and must
  // read differently.
  const unimplemented = render({ ...campaignArt, eligibleModelIds: [] });
  assert.match(unimplemented, /Joon cannot do this yet/);
  assert.doesNotMatch(unimplemented, /not configured yet/);

  const unconfigured = render({ ...campaignArt, eligibleModelIds: ["nano-banana-pro"] });
  assert.match(unconfigured, /No model for this job is configured yet/);
  assert.doesNotMatch(unconfigured, /Joon cannot do this yet/);
});
