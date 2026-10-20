import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "OmniHack — ideathon and hackathon management platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  // Official light-on-dark logo (public/brand), inlined so the image renders without a network fetch.
  const logo = await readFile(path.join(process.cwd(), "public", "brand", "omnihack-logo-light.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(135deg,#0B1020 0%,#1e1b4b 60%,#0e7490 100%)",
        color: "white",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} alt="OmniHack" width={384} height={70} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05 }}>Where ideas become winning projects.</div>
        <div style={{ fontSize: 30, color: "#b6bbd2", marginTop: 24 }}>Ideathons · Hackathons · Judging · Verifiable certificates · Careers</div>
      </div>
    </div>,
    size,
  );
}
