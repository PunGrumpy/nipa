import { ImageResponse } from "next/og";

export const size = { height: 180, width: 180 };
export const contentType = "image/png";

export const dynamic = "force-static";

const icon = () =>
  new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0a0a0a",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <svg
        aria-hidden
        fill="none"
        height={96}
        stroke="#ededed"
        strokeLinecap="round"
        strokeWidth={3.7}
        viewBox="0 0 20 20"
        width={96}
      >
        <path d="M1.85 1.85H4.1c3.7 0 5.9 2.9 5.9 7.2v9.1M18.15 1.85H15.9c-3.7 0-5.9 2.9-5.9 7.2" />
      </svg>
    </div>,
    size
  );

export default icon;
