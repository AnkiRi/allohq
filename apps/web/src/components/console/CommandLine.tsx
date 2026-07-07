"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@allohq/ui";

// ---------------------------------------------------------------------------
// CommandLine — the `joon ›` prompt + text input. Mono, blinking caret,
// rotating placeholder. Enter submits.
// ---------------------------------------------------------------------------

export interface CommandLineProps {
  /** A single placeholder, or a list to rotate through. */
  placeholder?: string | string[];
  /** Called with the trimmed value on Enter. Input clears after submit. */
  onSubmit: (value: string) => void;
  /** Rotation interval in ms for a placeholder list. Defaults 3800. */
  rotateMs?: number;
  className?: string;
  autoFocus?: boolean;
}

export function CommandLine({
  placeholder = "Tell joon what you want, e.g. win back my lapsed buyers before Diwali",
  onSubmit,
  rotateMs = 3800,
  className,
  autoFocus = false,
}: CommandLineProps) {
  const [value, setValue] = useState("");
  const [phIndex, setPhIndex] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = Array.isArray(placeholder) ? placeholder : [placeholder];

  // Rotate placeholder only while the field is empty and a list is provided.
  useEffect(() => {
    if (list.length < 2 || value) return;
    const id = setInterval(
      () => setPhIndex((i) => (i + 1) % list.length),
      rotateMs,
    );
    return () => clearInterval(id);
  }, [list.length, value, rotateMs]);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    setValue("");
  };

  const showCaret = focused && value.length === 0;

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3.5 transition-colors",
        focused
          ? "border-[hsl(var(--accent))]"
          : "border-border hover:border-muted-foreground/40",
        className,
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <span className="font-mono text-sm font-semibold text-[hsl(var(--accent))] select-none">
        joon ›
      </span>
      <div className="relative flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          // Native placeholder kept empty; we render our own rotating one so it
          // can animate. aria-label keeps it accessible. Input is human
          // (sans) — you talk to joon in plain language; joon THINKS in mono.
          aria-label="Tell joon what you want, in your own words"
          className="w-full bg-transparent font-sans text-sm text-foreground outline-none placeholder:text-muted-foreground caret-[hsl(var(--accent))]"
        />
        {value.length === 0 && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center font-sans text-sm text-muted-foreground"
          >
            {list[phIndex]}
            {showCaret && (
              <span className="console-caret ml-0.5 inline-block w-[2px] h-[1.05em] bg-[hsl(var(--accent))]" />
            )}
          </span>
        )}
      </div>
      <kbd className="hidden sm:inline-flex items-center font-mono text-[10px] text-muted-foreground/70 border border-border rounded px-1.5 py-0.5 select-none">
        ↵
      </kbd>

      {/* Local caret keyframes — scoped, does not touch globals.css */}
      <style jsx>{`
        .console-caret {
          animation: console-caret 1s step-end infinite;
        }
        @keyframes console-caret {
          0%,
          50% {
            opacity: 1;
          }
          50.01%,
          100% {
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .console-caret {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
