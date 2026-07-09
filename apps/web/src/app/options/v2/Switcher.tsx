"use client";

import { useEffect, useState } from "react";
import { Sunrise, Sun, Moon } from "lucide-react";

/* ------------------------------------------------------------------ */
/* "joon keeps your hours", not a palette picker, a sun-cycle that    */
/* sets the LIGHT joon is working in: Dawn (the blue hour, drafts      */
/* before sunrise), Day (approvals over coffee), Night (the late       */
/* shift). It reads as comfort/context, not a design choice.           */
/* Persists to localStorage('allo-theme'), the SAME key the app's     */
/* ThemeProvider reads, and mirrors data-theme + .dark on <html>, so  */
/* the choice carries landing <-> app live. SSR default is Dawn        */
/* (drenched); a no-FOUC inline script in page.tsx sets it pre-paint.  */
/* ------------------------------------------------------------------ */

const PALS = [
  { id: "drenched", label: "Dawn", Icon: Sunrise },
  { id: "light", label: "Day", Icon: Sun },
  { id: "dark", label: "Night", Icon: Moon },
] as const;

type PalId = (typeof PALS)[number]["id"];

// Shared with the app's ThemeProvider so the theme choice carries across.
const STORE_KEY = "allo-theme";

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
    // hydration may have reset the attribute to the SSR default, re-apply.
    if (root && root.dataset.pal !== resolved) root.dataset.pal = resolved;
  }, []);

  const choose = (id: PalId) => {
    setPal(id);
    const root = document.querySelector<HTMLElement>(".opt-v2");
    if (root) root.dataset.pal = id;
    // Mirror the app's source of truth so the choice carries into the app
    // (and survives a client-side navigation), matching ThemeProvider.
    const html = document.documentElement;
    html.setAttribute("data-theme", id);
    html.classList.toggle("dark", id === "drenched" || id === "dark");
    try {
      localStorage.setItem(STORE_KEY, id);
    } catch {
      /* ignore */
    }
  };

  // A discreet sun-cycle, match joon to the light you're working in. Reads as
  // comfort/context (dawn/day/night), not a "pick your design" widget.
  return (
    <div className="v2-pal" role="group" aria-label="Set joon to your hours">
      {PALS.map((p) => (
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
