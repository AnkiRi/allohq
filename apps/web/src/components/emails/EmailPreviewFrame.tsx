"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

export type PreviewWidth = "desktop" | "mobile";
export type PreviewTheme = "light" | "dark";

const WIDTHS: Record<PreviewWidth, number> = { desktop: 600, mobile: 375 };

/**
 * Live React Email preview — renders bulletproof HTML inside an iframe with
 * light/dark + desktop/mobile framing, mirroring the demo-emails viewer so the
 * editor preview is identical to what joon ships. Output is never hand-mangled;
 * the HTML comes straight from renderGeneratedEmail via the emails router.
 */
export function EmailPreviewFrame({
  html,
  isLoading,
}: {
  html: string;
  isLoading?: boolean;
}) {
  const [width, setWidth] = React.useState<PreviewWidth>("desktop");
  const [theme, setTheme] = React.useState<PreviewTheme>("light");

  const srcDoc = React.useMemo(() => {
    const scheme =
      theme === "dark"
        ? "<style>:root{color-scheme:dark}html,body{background:#14150F}</style>"
        : "<style>:root{color-scheme:light}</style>";
    return html.includes("</head>")
      ? html.replace("</head>", `${scheme}</head>`)
      : `${scheme}${html}`;
  }, [html, theme]);

  return (
    <section className="flex flex-col h-full rounded-xl border border-border overflow-hidden bg-[#0c0f0c] dark:bg-[#0c0f0c]">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card/60 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--color-accent)]">
            Live preview
          </span>
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            options={[
              { v: "desktop", label: "Desktop" },
              { v: "mobile", label: "Mobile" },
            ]}
            value={width}
            onChange={(v) => setWidth(v as PreviewWidth)}
          />
          <Toggle
            options={[
              { v: "light", label: "Light" },
              { v: "dark", label: "Dark" },
            ]}
            value={theme}
            onChange={(v) => setTheme(v as PreviewTheme)}
          />
        </div>
      </header>

      <div
        className="flex-1 flex justify-center overflow-auto p-6"
        style={{
          background:
            theme === "dark"
              ? "repeating-linear-gradient(45deg,#101410,#101410 14px,#0d110d 14px,#0d110d 28px)"
              : "repeating-linear-gradient(45deg,#171b16,#171b16 14px,#141813 14px,#141813 28px)",
        }}
      >
        <iframe
          title={`Email preview · ${width} ${theme}`}
          srcDoc={srcDoc}
          style={{
            width: WIDTHS[width],
            maxWidth: "100%",
            height: "100%",
            minHeight: 720,
            border: "none",
            borderRadius: 8,
            background: theme === "dark" ? "#14150F" : "#F7F4EC",
            boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
            transition: "width 240ms cubic-bezier(0.23,1,0.32,1)",
          }}
        />
      </div>
    </section>
  );
}

function Toggle({
  options,
  value,
  onChange,
}: {
  options: { v: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-[var(--color-accent)]/40">
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className="px-3 py-1.5 text-[11px] font-mono transition-colors"
            style={{
              color: active ? "#0c0f0c" : undefined,
              background: active ? "var(--color-accent)" : "transparent",
            }}
          >
            <span className={active ? "" : "text-muted-foreground"}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
