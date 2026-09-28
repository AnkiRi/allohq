"use client";

import * as React from "react";
import { cn } from "@allohq/ui";
import { Loader2 } from "lucide-react";
import { previewDocument } from "./preview-document";

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
  mode = "inbox",
}: {
  html: string;
  isLoading?: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (blockId: string) => void;
  mode?: "editor" | "inbox";
}) {
  const [width, setWidth] = React.useState<PreviewWidth>("desktop");
  const [theme, setTheme] = React.useState<PreviewTheme>("light");
  /**
   * Edit is normal scale, for precise work. Fit scales the WHOLE email into
   * the available height so a merchant can judge composition at a glance —
   * which is a different job from editing, and cannot be done by scrolling a
   * tall narrow column a screen at a time.
   */
  const [view, setView] = React.useState<"edit" | "fit">("edit");
  /** Real rendered height, reported by the iframe. */
  const [contentHeight, setContentHeight] = React.useState<number | null>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [stageHeight, setStageHeight] = React.useState(0);

  React.useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.type !== "joon-email-height") return;
      if (typeof event.data.height === "number" && Number.isFinite(event.data.height) && event.data.height > 0) {
        setContentHeight(event.data.height);
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => setStageHeight(node.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Only ever scale DOWN. Blowing a short email up to fill the stage would
  // misrepresent how it actually looks in an inbox.
  const fitScale =
    view === "fit" && contentHeight && stageHeight
      ? Math.min(1, (stageHeight - 32) / contentHeight)
      : 1;

  const srcDoc = React.useMemo(() => previewDocument(html, theme === "dark", selectedBlockId ?? null, Boolean(onSelectBlock)), [html, theme, selectedBlockId, onSelectBlock]);

  React.useEffect(() => {
    if (!onSelectBlock) return;
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.type !== "joon-email-block-select") return;
      if (typeof event.data.blockId === "string") onSelectBlock(event.data.blockId);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [onSelectBlock]);

  return (
    <section className="flex min-h-0 flex-col h-full rounded-xl border border-border overflow-hidden bg-[var(--surface-soft,#ECE9E1)]">
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
          {mode === "inbox" ? <>
            <Toggle
              options={[
                { v: "light", label: "Light" },
                { v: "dark", label: "Dark" },
              ]}
              value={theme}
              onChange={(v) => setTheme(v as PreviewTheme)}
            />
            <Toggle
              options={[
                { v: "edit", label: "Actual size" },
                { v: "fit", label: "Fit email" },
              ]}
              value={view}
              onChange={(v) => setView(v as "edit" | "fit")}
            />
          </> : null}
        </div>
      </header>

      <div
        ref={stageRef}
        className={cn(
          // Padding at the BOTTOM as well as the top: a long email used to run
          // flush into the edge of the pane, so there was no way to tell
          // whether it had ended or was simply cut off.
          "min-h-0 flex-1 flex justify-center px-4 pt-4 pb-10",
          view === "fit" ? "overflow-hidden items-start" : "overflow-auto items-start",
        )}
        style={{ background: theme === "dark" ? "#20211f" : "#ECE9E1" }}
      >
        <iframe
          ref={iframeRef}
          title={`Email preview · ${width} ${theme} ${view === "fit" ? "fitted" : "actual size"}`}
          srcDoc={srcDoc}
          style={{
            width: WIDTHS[width],
            maxWidth: "100%",
            // The email's own height, not an invented one. A 400px email used
            // to sit in a 720px box and look like a mostly-empty page.
            height: contentHeight ?? 600,
            flexShrink: 0,
            border: "none",
            borderRadius: 8,
            background: theme === "dark" ? "#14150F" : "#F7F4EC",
            // A defined edge, so the end of the email is unmistakable.
            boxShadow: "0 2px 6px rgba(23,23,23,0.06), 0 12px 40px rgba(23,23,23,0.10)",
            outline: "1px solid rgba(23,23,23,0.08)",
            transform: fitScale < 1 ? `scale(${fitScale})` : undefined,
            transformOrigin: "top center",
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
