"use client";

import * as React from "react";

type Width = "desktop" | "mobile";
type Theme = "light" | "dark";

const WIDTHS: Record<Width, number> = { desktop: 600, mobile: 375 };

export function EmailViewer({ title, html }: { title: string; html: string }) {
  const [width, setWidth] = React.useState<Width>("desktop");
  const [theme, setTheme] = React.useState<Theme>("light");

  // Inject the chosen color-scheme so the email's own dark-mode CSS engages
  // inside the iframe, and paint a matching frame background.
  const srcDoc = React.useMemo(() => {
    const scheme =
      theme === "dark"
        ? "<style>:root{color-scheme:dark}html,body{background:#14150F}</style>"
        : "<style>:root{color-scheme:light}</style>";
    return html.replace("</head>", `${scheme}</head>`);
  }, [html, theme]);

  return (
    <section
      style={{
        border: "1px solid #1f5e3d33",
        borderRadius: 12,
        overflow: "hidden",
        background: "#0c0f0c",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid #1f5e3d33",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 13,
            letterSpacing: "0.04em",
            color: "#7fe6ac",
            textTransform: "uppercase",
          }}
        >
          {title}
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Toggle
            options={[
              { v: "desktop", label: "Desktop 600" },
              { v: "mobile", label: "Mobile 375" },
            ]}
            value={width}
            onChange={(v) => setWidth(v as Width)}
          />
          <Toggle
            options={[
              { v: "light", label: "Light" },
              { v: "dark", label: "Dark" },
            ]}
            value={theme}
            onChange={(v) => setTheme(v as Theme)}
          />
        </div>
      </header>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: 24,
          background:
            theme === "dark"
              ? "repeating-linear-gradient(45deg,#101410,#101410 14px,#0d110d 14px,#0d110d 28px)"
              : "repeating-linear-gradient(45deg,#171b16,#171b16 14px,#141813 14px,#141813 28px)",
        }}
      >
        <iframe
          title={`${title} — ${width} ${theme}`}
          srcDoc={srcDoc}
          style={{
            width: WIDTHS[width],
            maxWidth: "100%",
            height: 760,
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
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #1f5e3d55",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {options.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 12px",
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 12,
              color: active ? "#0c0f0c" : "#9fb8a8",
              background: active ? "#2E7D5B" : "transparent",
              transition: "background 160ms ease-out, color 160ms ease-out",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
