import "global-jsdom/register";
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { BlockEditor } from "./BlockEditor";
import type { EmailBlock } from "@allohq/email-builder";

test("countdown label and end date are real editable fields", () => {
  let edited: EmailBlock | null = null;
  const view = render(createElement(BlockEditor, { block: { id: "c", type: "countdown", props: { label: "Sale ends in", endDate: "2026-10-01T10:00:00Z" } }, onUpdate: (next) => { edited = next; }, embedded: true }));
  fireEvent.change(view.getByLabelText("Countdown label"), { target: { value: "Offer ends" } });
  assert.equal((edited as any)?.props.label, "Offer ends");
  fireEvent.change(view.getByLabelText("Offer ends"), { target: { value: "2026-10-05T15:00" } });
  assert.ok(Number.isFinite(new Date((edited as any).props.endDate).getTime()));
  cleanup();
});
test("spacer can be replaced with a real divider, keeping its identity", () => {
  let edited: EmailBlock | null = null;
  const view = render(createElement(BlockEditor, { block: { id: "space", type: "spacer", props: { height: 30 } }, onUpdate: (next) => { edited = next; }, embedded: true }));
  fireEvent.click(view.getByRole("button", { name: "Replace space with a divider" }));
  assert.equal((edited as any)?.type, "divider"); assert.equal((edited as any)?.id, "space");
  cleanup();
});
test("button width and size controls update the same props used by rendering", () => {
  let edited: EmailBlock | null = null;
  const view = render(createElement(BlockEditor, { block: { id: "cta", type: "button", props: { text: "Shop", href: "#" } }, onUpdate: (next) => { edited = next; }, embedded: true }));
  fireEvent.click(view.getByLabelText("Full email width"));
  assert.equal((edited as any)?.props.fullWidth, true);
  fireEvent.change(view.getByLabelText("Text size (px)"), { target: { value: "22" } });
  assert.equal((edited as any)?.props.fontSize, 22);
  cleanup();
});
