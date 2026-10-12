import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";

import { site } from "@/lib/site";

export const alt = `${site.name}: ${site.tagline}`;
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

// Each path is written out, so the build traces these three files only.
const root = process.cwd();
const FONTS = "node_modules/geist/dist/fonts";
const SANS = "Geist";
const MONO = "Geist Mono";
const WHITE = "#fff";
const WORDMARK_PX = 168;
// The mark is as tall as the letters, as in the Logo component.
const MARK_PX = Math.round(WORDMARK_PX * 0.62);

/** The card for shared links: the logo on the hero's painting. */
const image = async () => {
  const [painting, sans, mono] = await Promise.all([
    readFile(path.join(root, "src/assets/art/lake-george.jpg")),
    readFile(path.join(root, FONTS, "geist-sans/Geist-SemiBold.ttf")),
    readFile(path.join(root, FONTS, "geist-mono/GeistMono-Regular.ttf")),
  ]);
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        color: WHITE,
        display: "flex",
        height: "100%",
        justifyContent: "center",
        position: "relative",
        width: "100%",
      }}
    >
      {/* oxlint-disable-next-line nextjs/no-img-element -- next/og draws plain img elements */}
      <img
        alt=""
        height={size.height}
        src={`data:image/jpeg;base64,${painting.toString("base64")}`}
        style={{
          objectFit: "cover",
          objectPosition: "50% 30%",
          position: "absolute",
        }}
        width={size.width}
      />
      <div
        style={{
          background:
            "linear-gradient(to bottom, rgb(10 10 10 / 0.45), rgb(10 10 10 / 0.2) 50%, rgb(10 10 10 / 0.5))",
          display: "flex",
          inset: 0,
          position: "absolute",
        }}
      />
      <div style={{ alignItems: "flex-end", display: "flex" }}>
        <svg
          aria-hidden
          fill="none"
          height={MARK_PX}
          stroke={WHITE}
          strokeLinecap="round"
          strokeWidth={3.7}
          style={{ marginBottom: WORDMARK_PX * 0.2, marginRight: 58 }}
          viewBox="0 0 20 20"
          width={MARK_PX}
        >
          <path d="M1.85 1.85H4.1c3.7 0 5.9 2.9 5.9 7.2v9.1M18.15 1.85H15.9c-3.7 0-5.9 2.9-5.9 7.2" />
        </svg>
        <div
          style={{
            fontFamily: SANS,
            fontSize: WORDMARK_PX,
            fontWeight: 600,
            letterSpacing: "-0.045em",
            lineHeight: 1,
          }}
        >
          {site.name}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 17,
            letterSpacing: "0.06em",
            lineHeight: 1.3,
            marginBottom: WORDMARK_PX * 0.24,
            marginLeft: 36,
            textTransform: "uppercase",
          }}
        >
          <div style={{ fontFamily: SANS, fontWeight: 600 }}>
            Nipa Cloud from
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 600 }}>your terminal</div>
          <div style={{ fontFamily: MONO, marginTop: 18 }}>{site.install}</div>
          <div style={{ fontFamily: MONO }}>{`MIT, v${site.version}`}</div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { data: sans, name: SANS, style: "normal", weight: 600 },
        { data: mono, name: MONO, style: "normal", weight: 400 },
      ],
    }
  );
};

export default image;
