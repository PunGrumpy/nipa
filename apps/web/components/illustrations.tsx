import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const BRUSH_FILTER = "nipa-brush";

export const BrushFilter = () => (
  <svg aria-hidden className="absolute size-0" focusable={false}>
    <filter height="140%" id={BRUSH_FILTER} width="140%" x="-20%" y="-20%">
      <feTurbulence
        baseFrequency={0.55}
        numOctaves={2}
        result="grain"
        seed={7}
        type="fractalNoise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="grain"
        scale={1.7}
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </svg>
);

const brush = {
  "aria-hidden": true,
  fill: "none",
  filter: `url(#${BRUSH_FILTER})`,
  height: 24,
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2.1,
  viewBox: "0 0 24 24",
  width: 24,
} as const;

export const ProfilesIcon = (props: IconProps) => (
  <svg {...brush} {...props}>
    <rect height={11.5} rx={1.75} width={11.5} x={4} y={8.5} />
    <path d="M8.5 4.5H18a2 2 0 0 1 2 2V16" />
  </svg>
);

export const FolderIcon = (props: IconProps) => (
  <svg {...brush} {...props}>
    <path d="M3.5 7.25c0-.97.78-1.75 1.75-1.75h3.9l2.1 2.6h7.5c.97 0 1.75.78 1.75 1.75v7.4c0 .97-.78 1.75-1.75 1.75H5.25c-.97 0-1.75-.78-1.75-1.75Z" />
  </svg>
);

export const PulseIcon = (props: IconProps) => (
  <svg {...brush} {...props}>
    <path d="M2.75 12.75h4.1l2.2-6 4 11.5 2.5-5.5h5.7" />
  </svg>
);

export const GaugeIcon = (props: IconProps) => (
  <svg {...brush} {...props}>
    <path d="M4.25 17a7.75 7.75 0 1 1 15.5 0M12 17l3.6-5.4" />
  </svg>
);

export const BracesIcon = (props: IconProps) => (
  <svg {...brush} {...props}>
    <path d="M9 4.5c-1.9 0-2.6.9-2.6 2.5v2.4c0 1.6-.9 2.6-2.4 2.6 1.5 0 2.4 1 2.4 2.6V17c0 1.6.7 2.5 2.6 2.5M15 4.5c1.9 0 2.6.9 2.6 2.5v2.4c0 1.6.9 2.6 2.4 2.6-1.5 0-2.4 1-2.4 2.6V17c0 1.6-.7 2.5-2.6 2.5" />
  </svg>
);

export const TabKeyIcon = (props: IconProps) => (
  <svg {...brush} {...props}>
    <path d="M3.5 12h12.25M11.75 7.5l4.5 4.5-4.5 4.5M20.5 6.5v11" />
  </svg>
);

const DOT_COLUMNS = 10;
const DOT_ROWS = 5;
const DOT_STEP = 20;
const DOT_SIZE = 4;

const FRAME_COLUMN = 8;
const FRAME_ROWS = 2;

const DOTS = Array.from({ length: DOT_COLUMNS * DOT_ROWS }, (_, index) => ({
  column: index % DOT_COLUMNS,
  row: Math.floor(index / DOT_COLUMNS),
})).filter((dot) => dot.column < FRAME_COLUMN || dot.row >= FRAME_ROWS);

export const SessionGlyph = (props: IconProps) => (
  <svg
    aria-hidden
    fill="none"
    height={150}
    stroke="currentColor"
    strokeWidth={2}
    viewBox="0 0 260 150"
    width={260}
    {...props}
  >
    <path d="M182 38H1v111h221V78" />
    <path d="M200 1h-18v18M240 1h18v18M182 60v18h18M258 60v18h-18" />
    <path
      d="m208 30 10 10-10 10M224 50h12"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <g fill="currentColor" stroke="none">
      {DOTS.map((dot) => (
        <rect
          height={DOT_SIZE}
          key={`${dot.column}-${dot.row}`}
          width={DOT_SIZE}
          x={16 + dot.column * DOT_STEP}
          y={54 + dot.row * DOT_STEP}
        />
      ))}
    </g>
  </svg>
);
