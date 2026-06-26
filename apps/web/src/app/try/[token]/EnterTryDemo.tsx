"use client";

import { useEffect } from "react";
import { DEMO_COOKIE } from "@/lib/demoToken";

/**
 * Valid token → enter the Vana demo: set the demo flag (so the tRPC client sends
 * x-allo-demo and resolves the demo-guest / Vana) + a demo-token cookie (so the
 * edge middleware lets this logged-out visitor into the app), then full-navigate
 * to the app. A full navigation (not client push) ensures both are in place
 * before the app + middleware run.
 */
export function EnterTryDemo({ token }: { token: string }) {
  useEffect(() => {
    try {
      localStorage.setItem("allo_demo", "1");
    } catch {
      /* ignore */
    }
    document.cookie = `${DEMO_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=86400; samesite=lax`;
    window.location.replace("/dashboard");
  }, [token]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#0b1020",
        color: "#dfe7f5",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.55, margin: 0 }}>
          allo
        </p>
        <p style={{ marginTop: 10, fontSize: 15, opacity: 0.85 }}>
          Opening the Vana Naturals demo…
        </p>
      </div>
    </main>
  );
}
