import { ImageResponse } from "next/og";

// A single branded OG card, inherited by every route for link previews on social and chat.
export const alt = "Δt: a database for time";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0c",
          color: "#fafafa",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            borderRadius: 700,
            background: "rgba(16,185,129,0.16)",
            filter: "blur(120px)",
          }}
        />
        <div style={{ fontSize: 230, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>Δt</div>
        <div style={{ fontSize: 54, marginTop: 24, color: "#e4e4e7" }}>a database for time</div>
        <div style={{ fontSize: 30, marginTop: 40, color: "#6ee7b7" }}>
          tap · the Time Allocation Protocol
        </div>
        <div style={{ position: "absolute", bottom: 48, fontSize: 26, color: "#71717a" }}>delt.at</div>
      </div>
    ),
    { ...size }
  );
}
