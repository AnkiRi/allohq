"use client";

import * as React from "react";
import { cn } from "@allohq/ui";

/** What the next Ask-Joon request may touch. The server enforces this; the UI names it. */
export type AskScope = "block" | "envelope" | "document";

export const SCOPE_LABEL: Record<AskScope, string> = {
  block: "This block",
  envelope: "Subject & preview",
  document: "Whole email",
};

const SCOPE_PROMISE: Record<AskScope, string> = {
  block: "Joon can only change the selected block. Other blocks and the subject stay as they are.",
  envelope: "Joon can only change the subject and inbox preview. The email body stays as it is.",
  document: "Joon can change any part of this email.",
};

/**
 * The scope switch.
 *
 * Joon's default is the block the merchant selected, and widening to the whole
 * email is a deliberate choice — so the switch is visible rather than inferred
 * from how an instruction happens to be phrased. The promise under it is the
 * same boundary the server enforces, stated in the merchant's words.
 */
export function ScopeChooser({
  scope,
  setScope,
  selectedTitle,
}: {
  scope: AskScope;
  setScope: (value: AskScope) => void;
  /** Title of the selected block, or null when nothing is selected. */
  selectedTitle: string | null;
}) {
  const options: AskScope[] = ["block", "envelope", "document"];
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[12px] font-medium text-muted-foreground" id="ask-scope-label">
        This request changes
      </p>
      <div role="radiogroup" aria-labelledby="ask-scope-label" className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const disabled = option === "block" && !selectedTitle;
          const active = scope === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setScope(option)}
              title={disabled ? "Select a block in the email first" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                active
                  ? "border-[var(--evidence,#2D4F9E)] bg-[var(--evidence-soft,#E9EFFF)] font-medium"
                  : "border-border hover:border-[var(--evidence,#2D4F9E)]",
              )}
            >
              {option === "block" && selectedTitle ? `This block · ${selectedTitle}` : SCOPE_LABEL[option]}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{SCOPE_PROMISE[scope]}</p>
    </div>
  );
}
