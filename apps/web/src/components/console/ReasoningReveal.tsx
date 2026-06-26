"use client";

import { useEffect, useRef } from "react";
import "./ReasoningReveal.css";

/**
 * ReasoningReveal — the ONE shared reasoning-reveal used by BOTH the landing
 * hero and the app's home console, so the two can never drift. The landing is a
 * truthful preview of the real app interaction: the same component performs the
 * same line-by-line landing, the same "held back as control" beat, the same rest.
 *
 * Theme: styled via `--rr-*` CSS vars. The app provides them by default
 * (hsl(var(--accent)) …); the landing overrides `.allo-terminal .rr` → `--t-*`.
 * Progressive enhancement: the FIRST story is server-rendered COMPLETE (no-JS /
 * reduced-motion = a full, readable static story, never blank). JS only ARMS the
 * hidden state and performs the sequence.
 *
 * Multiple stories ROLL: each performs fully, rests, then the next — a sequence
 * of complete performances, not a churning ticker. A single story plays once.
 */
export interface ReasoningLine {
  /** Plain text (no HTML). Mono console line. */
  text: string;
  /** The deliberate beat — e.g. "held back 22 as control" / "left alone". */
  beat?: boolean;
  /** Render as a "→ ready …" closing line instead of a "✓" line. */
  arrow?: boolean;
}
export interface ReasoningStory {
  /** The `allo ›` context/goal that types itself. */
  lead: string;
  lines: ReasoningLine[];
}

export function ReasoningReveal({
  stories,
  className = "",
}: {
  stories: ReasoningStory[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || stories.length === 0) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // static first story already in the DOM — leave it

    const leadEl = root.querySelector<HTMLElement>("[data-rr-lead]");
    const streamEl = root.querySelector<HTMLElement>("[data-rr-stream]");
    if (!leadEl || !streamEl) return;

    let timers: number[] = [];
    const at = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
    const clearAll = () => { timers.forEach((t) => window.clearTimeout(t)); timers = []; };
    let idx = 0;

    const buildRows = (s: ReasoningStory): HTMLElement[] => {
      streamEl.innerHTML = "";
      return s.lines.map((l) => {
        const row = document.createElement("div");
        row.className = "rr-row" + (l.beat ? " beat" : "") + (l.arrow ? " arrow" : "");
        const mark = document.createElement("span");
        mark.className = l.arrow ? "rr-arrow" : "rr-tick";
        mark.textContent = l.arrow ? "→" : "✓";
        const txt = document.createElement("span");
        txt.className = "rr-text";
        txt.textContent = l.text;
        row.append(mark, txt);
        streamEl.appendChild(row);
        return row;
      });
    };

    const play = (s: ReasoningStory, done: () => void) => {
      root.setAttribute("data-rr-ready", "true");
      root.removeAttribute("data-rr-done");
      leadEl.textContent = "";
      const rows = buildRows(s);
      const full = s.lead;
      let i = 0;
      const type = () => {
        i += 1;
        leadEl.textContent = full.slice(0, i);
        if (i < full.length) at(type, 40 + Math.random() * 20); // ~40–60ms, human jitter
        else reveal();
      };
      const reveal = () => {
        let t = 500; // beat after the goal finishes typing
        rows.forEach((row, ri) => {
          if (ri > 0) t += row.classList.contains("beat") ? 600 : 400; // longer beat before the control/restraint line
          at(() => row.classList.add("is-in"), t);
        });
        t += 450;
        at(() => { root.setAttribute("data-rr-done", "true"); done(); }, t);
      };
      at(type, 360);
    };

    const loop = () => {
      const s = stories[idx % stories.length];
      if (!s) return; // length is guarded above; satisfies noUncheckedIndexedAccess
      play(s, () => {
        if (stories.length <= 1) return; // single story: play once, then rest
        at(() => { idx += 1; loop(); }, 2000); // rest, then roll to the next customer
      });
    };
    loop();

    return () => clearAll();
  }, [stories]);

  // SSR / no-JS / reduced-motion: render the FIRST story COMPLETE and static.
  const first = stories[0] ?? { lead: "", lines: [] };
  return (
    <div ref={ref} className={`rr ${className}`}>
      <div className="rr-cmd">
        <span className="rr-prompt">allo ›</span>
        <span className="rr-lead" data-rr-lead>{first.lead}</span>
        <span className="rr-caret" aria-hidden="true" />
      </div>
      <div className="rr-stream" data-rr-stream aria-label="reasoning output">
        {first.lines.map((l, i) => (
          <div
            key={i}
            className={"rr-row" + (l.beat ? " beat" : "") + (l.arrow ? " arrow" : "")}
          >
            <span className={l.arrow ? "rr-arrow" : "rr-tick"}>{l.arrow ? "→" : "✓"}</span>
            <span className="rr-text">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The landing's rolling attention stories — one named customer each, varied
 * action (restraint / win-back+control / replenishment / timing) so breadth
 * shows while every story is about ATTENDING TO ONE PERSON. Shared vocabulary:
 * "noticed", "held back … as control", "left alone", "ready · expected recovery".
 */
export const ATTENTION_STORIES: ReasoningStory[] = [
  {
    lead: "Priya bought a linen tunic in March",
    lines: [
      { text: "allo noticed: linen, not wool" },
      { text: "won't pitch her wool in October" },
      { text: "kept on the list · left alone", beat: true },
    ],
  },
  {
    lead: "win back my lapsed buyers before Diwali",
    lines: [
      { text: "scanned 4,820 customers" },
      { text: "matched 187 lapsed · last spring's buyers" },
      { text: "held back 22 as control", beat: true },
      { text: "drafted 3 win-back variants" },
      { text: "ready · expected recovery ₹1.2L", arrow: true },
    ],
  },
  {
    lead: "Reema's Triphala Daily runs low this week",
    lines: [
      { text: "timed to her cycle, not a blast" },
      { text: "drafted a gentle reorder nudge" },
      { text: "ready · queued for your sign-off", arrow: true },
    ],
  },
  {
    lead: "Karan reads email at midnight, not 9am",
    lines: [
      { text: "allo noticed his open times" },
      { text: "left the 9am blast alone", beat: true },
      { text: "writes him at midnight" },
    ],
  },
];
