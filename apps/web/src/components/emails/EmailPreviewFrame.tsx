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
  selectedBlockId,
  onSelectBlock,
}: {
  html: string;
  isLoading?: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
}) {
  const [width, setWidth] = React.useState<PreviewWidth>("desktop");
  const [theme, setTheme] = React.useState<PreviewTheme>("light");

  const srcDoc = React.useMemo(() => {
    const scheme =
      theme === "dark"
        ? "<style>:root{color-scheme:dark}html,body{background:#14150F}</style>"
        : "<style>:root{color-scheme:light}</style>";
    const safeSelected = (selectedBlockId ?? "").replace(/["\\]/g, "\\$&");
    const editorBridge = onSelectBlock
      ? `<style>
          [data-email-block-id]{cursor:pointer;outline:1px solid transparent;outline-offset:-2px;transition:outline-color 120ms ease,box-shadow 120ms ease}
          [data-email-block-id]:hover{outline-color:#C99116;box-shadow:inset 3px 0 0 #C99116}
          ${safeSelected ? `[data-email-block-id="${safeSelected}"]{outline:2px solid #2D4F9E;box-shadow:inset 4px 0 0 #2D4F9E}` : ""}
        </style>
        <script>
          document.addEventListener('click',function(event){
            var element=event.target&&event.target.closest?event.target.closest('[data-email-block-id]'):null;
            if(!element)return;
            event.preventDefault();
            parent.postMessage({type:'joon-email-block-select',blockId:element.getAttribute('data-email-block-id')},'*');
          },true);
        </script>`
      : "";
    const additions = `${scheme}${editorBridge}`;
    return html.includes("</head>")
      ? html.replace("</head>", `${additions}</head>`)
      : `${additions}${html}`;
  }, [html, theme, selectedBlockId, onSelectBlock]);

  React.useEffect(() => {
    if (!onSelectBlock) return;
    const listener = (event: MessageEvent) => {
      if (event.data?.type !== "joon-email-block-select") return;
      if (typeof event.data.blockId === "string") onSelectBlock(event.data.blockId);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onSelectBlock]);

  return (
    <section className="flex flex-col h-full rounded-xl border border-border overflow-hidden bg-[var(--surface-soft,#ECE9E1)]">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card/60 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-decision">
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
              ? "#20211f"
              : "#ECE9E1",
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
    <div className="inline-flex rounded-lg overflow-hidden border border-decision/40">
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
