"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/* The colour switcher — the headline deliverable.                    */
/* Sets data-pal on the .opt-v2 root (drives every CSS custom-property */
/* palette) and persists the choice to localStorage('allo-v2-pal').   */
/* SSR default is drenched; a no-FOUC inline script in page.tsx sets   */
/* the attribute before paint (honouring ?pal= then localStorage) so a */
/* returning / linked visitor never flashes.                          */
/* ------------------------------------------------------------------ */

const PALS = [
  { id: "drenched", label: "Drenched" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

type PalId = (typeof PALS)[number]["id"];

const STORE_KEY = "allo-v2-pal";

function isPal(v: string | null): v is PalId {
  return v === "drenched" || v === "light" || v === "dark";
}

// Resolve the active palette the same way the no-FOUC script does:
// ?pal= query → stored localStorage → the attribute already on the root →
// default. React hydration can reset the SSR data-pal back to "drenched", so
// the client must re-resolve here and re-apply, or a linked ?pal= would be lost.
function resolvePal(): PalId {
  if (typeof window === "undefined") return "drenched";
  try {
    const q = new URLSearchParams(window.location.search).get("pal");
    if (isPal(q)) return q;
  } catch {
    /* ignore */
  }
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (isPal(v)) return v;
  } catch {
    /* ignore */
  }
  const attr = document.querySelector<HTMLElement>(".opt-v2")?.dataset.pal;
  if (isPal(attr ?? null)) return attr as PalId;
  return "drenched";
}

export function PaletteSwitcher() {
  // Mirror whatever the no-FOUC script already put on the root so the active
  // chip matches the rendered palette on first paint.
  const [pal, setPal] = useState<PalId>("drenched");

  useEffect(() => {
    const resolved = resolvePal();
    setPal(resolved);
    const root = document.querySelector<HTMLElement>(".opt-v2");
    // hydration may have reset the attribute to the SSR default — re-apply.
    if (root && root.dataset.pal !== resolved) root.dataset.pal = resolved;
  }, []);

  const choose = (id: PalId) => {
    setPal(id);
    const root = document.querySelector<HTMLElement>(".opt-v2");
    if (root) root.dataset.pal = id;
    try {
      localStorage.setItem(STORE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="v2-pal" role="group" aria-label="Colour palette">
      <span className="v2-pal__lead mono" aria-hidden="true">
        palette
      </span>
      {PALS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`v2-pal__chip${pal === p.id ? " is-on" : ""}`}
          data-chip={p.id}
          aria-pressed={pal === p.id}
          onClick={() => choose(p.id)}
        >
          <span className="v2-pal__dot" aria-hidden="true" />
          <span className="v2-pal__name">{p.label}</span>
        </button>
      ))}
    </div>
  );
}
