"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// useDemo — reads the demo flag (localStorage["allo_demo"] === "1"), SSR-safe.
//
// The flag is set when the storeless visitor enters the demo. When set, the
// tRPC client sends `x-allo-demo: 1` and the API routes the user read-mostly to
// the seeded "Vana Naturals" workspace (mutations sandboxed). The flag persists
// for the session. This hook hydrates after mount so SSR markup matches the
// server (flag reads false until the effect runs in the browser).
// ---------------------------------------------------------------------------

export const DEMO_FLAG_KEY = "allo_demo";

/** True iff the demo flag is set. Safe to read during SSR (returns false). */
export function isDemoActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Turn the demo on for this browser/session. */
export function enterDemo(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function useDemo(): boolean {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    setDemo(isDemoActive());
    // React to the flag being set in another tab / by another component.
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEMO_FLAG_KEY) setDemo(isDemoActive());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return demo;
}
