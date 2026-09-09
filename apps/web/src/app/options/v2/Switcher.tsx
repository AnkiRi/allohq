"use client";

import { useEffect, useState } from "react";
import { Sunrise, Sun, Moon, Palette } from "lucide-react";

/* ------------------------------------------------------------------ */
/* V3 has two public worlds: paper-on-cobalt Drenched and crisp Light. */
/* Persists to the landing-only localStorage('allo-theme') key.        */
/* Authenticated app preferences use 'allo-app-theme' independently.  */
/* A no-FOUC inline script in page.tsx sets it before paint.           */
/* ------------------------------------------------------------------ */

const V3_PALS = [
  { id: "drenched", label: "Drenched", Icon: Sunrise },
  { id: "light", label: "Light", Icon: Palette },
] as const;
const V2_PALS = [
  { id: "drenched", label: "Dawn", Icon: Sunrise },
  { id: "light", label: "Day", Icon: Sun },
  { id: "dark", label: "Night", Icon: Moon },
] as const;

type V3PalId = (typeof V3_PALS)[number]["id"];
type V2PalId = (typeof V2_PALS)[number]["id"];
type PalId = V3PalId | V2PalId;

// Landing-only preference. The authenticated app intentionally uses another key.
const STORE_KEY = "allo-theme";

function isAllowedPal(v: string | null, enhanced: boolean): v is PalId {
  return enhanced
    ? v === "drenched" || v === "light"
    : v === "drenched" || v === "light" || v === "dark";
}

// Resolve the active palette the same way the no-FOUC script does:
// ?pal= query → stored localStorage → the attribute already on the root →
// default. React hydration can reset the SSR data-pal back to "drenched", so
// the client must re-resolve here and re-apply, or a linked ?pal= would be lost.
function resolvePal(enhanced: boolean): PalId {
  if (typeof window === "undefined") return "drenched";
  try {
    const q = new URLSearchParams(window.location.search).get("pal");
    if (q !== null) return isAllowedPal(q, enhanced) ? q : "drenched";
  } catch {
    /* ignore */
  }
  try {
    const v = localStorage.getItem(STORE_KEY);
    if (isAllowedPal(v, enhanced)) return v;
  } catch {
    /* ignore */
  }
  const attr = document.querySelector<HTMLElement>(".opt-v2")?.dataset.pal;
  if (isAllowedPal(attr ?? null, enhanced)) return attr as PalId;
  return "drenched";
}

export function PaletteSwitcher({ enhanced = false }: { enhanced?: boolean }) {
  // Mirror whatever the no-FOUC script already put on the root so the active
  // chip matches the rendered palette on first paint.
  const [pal, setPal] = useState<PalId>("drenched");

  useEffect(() => {
    const resolved = resolvePal(enhanced);
    setPal(resolved);
    const root = document.querySelector<HTMLElement>(".opt-v2");
    // hydration may have reset the attribute to the SSR default, re-apply.
    if (root && root.dataset.pal !== resolved) root.dataset.pal = resolved;
  }, [enhanced]);

  const choose = (id: V3PalId | V2PalId) => {
    setPal(id);
    const root = document.querySelector<HTMLElement>(".opt-v2");
    if (root) root.dataset.pal = id;
    try {
      localStorage.setItem(STORE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  // A discreet two-world switch: the immersive cobalt default and the crisp
  // evidence-led alternative.
  return (
    <div className="v2-pal" role="group" aria-label="Set joon to your hours">
      {(enhanced ? V3_PALS : V2_PALS).map((p) => (
        <button
          key={p.id}
          type="button"
          className={`v2-pal__chip${pal === p.id ? " is-on" : ""}`}
          aria-pressed={pal === p.id}
          aria-label={`${p.label}: match joon to your light`}
          title={p.label}
          onClick={() => choose(p.id)}
        >
          <p.Icon className="v2-pal__ico" strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
