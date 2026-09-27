import test from "node:test";
import assert from "node:assert/strict";
import { campaignSectionFromParam, campaignSectionHref } from "./campaign-section";

test("a return from the editor opens the campaign's Message section", () => {
  assert.equal(campaignSectionFromParam("message"), "message");
  assert.equal(campaignSectionHref("campaign-1", "message"), "/campaigns/campaign-1?tab=message");
});

test("unknown sections fall back safely", () => {
  assert.equal(campaignSectionFromParam("settings"), "overview");
  assert.equal(campaignSectionFromParam(null, "message"), "message");
});
