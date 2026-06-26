import * as React from "react";
import { render } from "@react-email/render";
import { WinbackEmail } from "@/emails/WinbackEmail";
import { ReplenishmentEmail } from "@/emails/ReplenishmentEmail";
import { EmailViewer } from "./EmailViewer";

export const metadata = {
  title: "Vana Naturals · Email Showcase | allo",
};

// Render emails to bulletproof HTML server-side, then hand to the client
// viewer for light/dark + desktop/mobile framing.
export default async function DemoEmailsPage() {
  const [winbackHtml, replenishmentHtml] = await Promise.all([
    render(<WinbackEmail />),
    render(<ReplenishmentEmail />),
  ]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#080a08",
        color: "#dfeee5",
        padding: "48px 24px 96px",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ marginBottom: 40 }}>
          <p
            style={{
              margin: "0 0 10px",
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 12,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#2E7D5B",
            }}
          >
            Allo · generated output
          </p>
          <h1
            style={{
              margin: "0 0 12px",
              fontFamily: "var(--font-space-grotesk), sans-serif",
              fontSize: 40,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "#f4faf6",
            }}
          >
            Vana Naturals — flagship emails
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: "60ch",
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: 15,
              lineHeight: 1.6,
              color: "#9fb8a8",
            }}
          >
            Two best-in-class lifecycle emails produced by allo for a plant-based
            wellness brand. Real React Email, bulletproof table HTML, one shared
            brand kit. Toggle each between desktop and mobile, light and dark.
          </p>
        </header>

        <div style={{ display: "grid", gap: 40 }}>
          <EmailViewer
            title="Email 1 — Win-back (no discount)"
            html={winbackHtml}
          />
          <EmailViewer
            title="Email 2 — Replenishment / post-purchase"
            html={replenishmentHtml}
          />
        </div>
      </div>
    </main>
  );
}
