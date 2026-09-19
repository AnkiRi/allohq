"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { useAlloAI } from "@/components/ai/AlloAIPanel";

interface CommandBarProps {
  storeId: string;
  pageContext: "automations" | "campaigns" | "templates" | "segments" | "dashboard";
}

const EXAMPLES: Record<CommandBarProps["pageContext"], string[]> = {
  automations: [
    "Create a win-back flow for inactive high-value customers",
    "Build a three-email welcome series",
    "Set up an abandoned cart automation with 20% discount",
  ],
  campaigns: [
    "Create a festival campaign for my top 10 customers",
    "Draft a full-price new-product email for loyal customers",
    "Create a 15% offer for customers who are becoming at risk",
  ],
  templates: [
    "Design a thank-you email for post-purchase follow-up",
    "Create a warm win-back email for dormant customers",
    "Build a product-led promotional email",
  ],
  segments: [
    "Find high-value customers who haven't ordered in 30 days",
    "Show me my ten highest-value customers",
    "Create a segment of new customers from the last 7 days",
  ],
  dashboard: [
    "Create an automation for winning back inactive customers",
    "Analyze my highest-value customer segments",
    "Draft a promotion for customers who are becoming at risk",
  ],
};

/** A compact entrance into the same merchant-agent pipeline as the full chat. */
export function CommandBar({ pageContext }: CommandBarProps) {
  const { submit } = useAlloAI();
  const inputRef = useRef<HTMLInputElement>(null);
  const [instruction, setInstruction] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const examples = EXAMPLES[pageContext];

  const handleSubmit = useCallback(() => {
    const nextInstruction = instruction.trim();
    if (!nextInstruction) return;
    submit(nextInstruction);
    setInstruction("");
    setIsFocused(false);
  }, [instruction, submit]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        inputRef.current?.blur();
        setIsFocused(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="mb-6">
      <div className={`relative rounded-xl border bg-card transition-colors ${isFocused ? "border-foreground" : "border-border hover:border-foreground/40"}`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 150)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSubmit();
            }}
            placeholder="Tell Joon what you'd like to do…"
            aria-label="Ask Joon"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!instruction.trim()}
            aria-label="Send to Joon"
            className="grid h-7 w-7 place-items-center rounded-lg bg-foreground text-background transition-opacity disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>

        {isFocused && !instruction && (
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setInstruction(example);
                  inputRef.current?.focus();
                }}
                className="rounded-full bg-muted px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 px-1 text-[10px] text-muted-foreground">
        Opens the same reviewable Joon conversation used everywhere else. Nothing sends without your approval.
      </p>
    </div>
  );
}
