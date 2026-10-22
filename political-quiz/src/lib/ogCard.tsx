// Shared 1200×630 social preview card for next/og ImageResponse.
// Only flexbox + inline styles are supported there.

export const OG_SIZE = { width: 1200, height: 630 };

export function OgCard({
  kicker,
  title,
  body,
  footer,
}: {
  kicker: string;
  title: string;
  body: string;
  footer: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: "linear-gradient(135deg, #f5f2ec 0%, #ede9e0 100%)",
        color: "#0a1b3a",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 700 }}>
        <div style={{ width: 18, height: 18, borderRadius: 999, background: "linear-gradient(135deg, #0b2a5b, #1a5bb8)" }} />
        Pytheas Institute
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 24, letterSpacing: 4, textTransform: "uppercase", color: "#1a5bb8", fontWeight: 700 }}>
          {kicker}
        </div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
        <div style={{ fontSize: 30, lineHeight: 1.4, color: "#3a4a66", maxWidth: 980 }}>{body}</div>
      </div>

      <div
        style={{
          display: "flex",
          alignSelf: "flex-start",
          padding: "16px 28px",
          borderRadius: 999,
          background: "#0b2a5b",
          color: "#f5f2ec",
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        {footer}
      </div>
    </div>
  );
}
