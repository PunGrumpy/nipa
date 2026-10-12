import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const stroke = {
  "aria-hidden": true,
  fill: "none",
  height: 16,
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.5,
  viewBox: "0 0 16 16",
  width: 16,
} as const;

/** The nipa mark: two palm fronds on one stem. */
export const LogoMark = (props: IconProps) => (
  <svg
    aria-hidden
    fill="none"
    height={20}
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth={3.7}
    viewBox="0 0 20 20"
    width={20}
    {...props}
  >
    <path d="M1.85 1.85H4.1c3.7 0 5.9 2.9 5.9 7.2v9.1M18.15 1.85H15.9c-3.7 0-5.9 2.9-5.9 7.2" />
  </svg>
);

/** The mark and the name. The mark is as tall as the letters, so set the size with `text-*`. */
export const Logo = ({ className = "" }: { className?: string }) => (
  <span
    className={`inline-flex items-baseline gap-[0.36em] font-semibold tracking-[-0.045em] ${className}`}
  >
    <LogoMark className="h-[0.62em] w-auto" />
    nipa
  </span>
);

export const ArrowRightIcon = (props: IconProps) => (
  <svg {...stroke} {...props}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </svg>
);

export const ArrowUpRightIcon = (props: IconProps) => (
  <svg {...stroke} {...props}>
    <path d="M5 11 11 5M6 5h5v5" />
  </svg>
);

export const CopyIcon = (props: IconProps) => (
  <svg {...stroke} {...props}>
    <rect height={8} rx={1.5} width={8} x={5.5} y={5.5} />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </svg>
);

export const CheckIcon = (props: IconProps) => (
  <svg {...stroke} {...props}>
    <path d="m3.5 8.5 3 3 6-7" />
  </svg>
);

export const GitHubIcon = (props: IconProps) => (
  <svg
    aria-hidden
    fill="currentColor"
    height={16}
    viewBox="0 0 16 16"
    width={16}
    {...props}
  >
    <path d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
  </svg>
);
