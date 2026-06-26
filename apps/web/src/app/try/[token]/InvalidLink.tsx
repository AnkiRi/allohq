// A clean, calm page for a mistyped / revoked / expired demo link. NOT an error,
// NOT the real app — just a friendly dead-end (the user pastes these into emails).
export function InvalidLink() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#0b1020",
        color: "#dfe7f5",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        padding: "24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <p style={{ fontSize: 12, letterSpacing: "0.24em", textTransform: "uppercase", opacity: 0.55, margin: 0 }}>
          allo
        </p>
        <h1 style={{ marginTop: 14, fontSize: 22, fontWeight: 600, lineHeight: 1.25 }}>
          This link isn&apos;t valid or has expired
        </h1>
        <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6, opacity: 0.7 }}>
          Demo links are private and time-limited. Ask whoever shared it for a
          fresh one.
        </p>
      </div>
    </main>
  );
}
