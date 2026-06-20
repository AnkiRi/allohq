"use client";

import { useEffect, useState } from "react";
import { cn } from "@allohq/ui";

// ---------------------------------------------------------------------------
// ConsoleFrame — a token-styled pane with a top status bar (3 lamps, a mono
// title, a live clock) and a card body. Wraps console surfaces.
// ---------------------------------------------------------------------------

function LiveClock() {
  // Render a stable placeholder on the server, then tick on the client only.
  const [time, setTime] = useState<string>("--:--:--");
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      {time}
    </span>
  );
}

export interface ConsoleFrameProps {
  /** Mono title shown in the status bar, e.g. "allo — operator". */
  title?: string;
  /** Whether the third lamp pulses (live). Defaults true. */
  live?: boolean;
  /** Show the live clock in the bar. Defaults true. */
  clock?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function ConsoleFrame({
  title = "allo — operator",
  live = true,
  clock = true,
  className,
  children,
}: ConsoleFrameProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card overflow-hidden",
        className,
      )}
      aria-label={title}
    >
      {/* Status bar */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-border bg-background/40">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              live
                ? "bg-[hsl(var(--accent))] animate-pulse motion-reduce:animate-none"
                : "bg-muted-foreground/40",
            )}
          />
        </span>
        <span className="font-mono text-[11px] text-muted-foreground tracking-tight ml-1">
          {title}
        </span>
        {clock && <span className="ml-auto"><LiveClock /></span>}
      </div>

      {/* Body */}
      <div className="p-5">{children}</div>
    </section>
  );
}
