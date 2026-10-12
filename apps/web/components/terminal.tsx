import type { CSSProperties, ReactNode } from "react";

import type { Cell, Tone } from "@/lib/terminal";

const COLUMN_GAP = " ".repeat(5);

const DOT_TONES: Record<Tone, string> = {
  amber: "text-amber-800",
  gray: "text-gray-700",
  green: "text-green-800",
  red: "text-red-800",
};

interface Timed {
  at?: number;
}

const timing = (
  at: number | undefined,
  chars?: number
): CSSProperties | undefined => {
  if (at === undefined) {
    return;
  }
  // SAFETY: CSSProperties doesn't list custom properties.
  return { "--at": `${at}ms`, "--chars": chars } as CSSProperties;
};

export const Dim = ({ children }: { children: ReactNode }) => (
  <span className="text-gray-900">{children}</span>
);

export const Bold = ({ children }: { children: ReactNode }) => (
  <span className="font-semibold">{children}</span>
);

export const Cyan = ({ children }: { children: ReactNode }) => (
  <span className="text-teal-900">{children}</span>
);

export const Line = ({ at, children }: Timed & { children?: ReactNode }) => (
  <span
    className={
      at === undefined ? "block min-h-[1lh]" : "terminal-line block min-h-[1lh]"
    }
    style={timing(at)}
  >
    {children}
  </span>
);

export const Log = ({ at, children }: Timed & { children: ReactNode }) => (
  <Line at={at}>
    <Dim>&gt;</Dim> {children}
  </Line>
);

export const Command = ({ at, children }: Timed & { children: string }) => (
  <Line at={at}>
    <Dim>$</Dim>{" "}
    <span
      className={at === undefined ? undefined : "terminal-typed"}
      style={timing(at === undefined ? undefined : at + 300, children.length)}
    >
      {children}
    </span>
  </Line>
);

export const Answer = ({
  at,
  label,
  children,
}: Timed & { label: string; children: ReactNode }) => (
  <Line at={at}>
    <span className="inline-block w-[1ch] text-green-800">✔</span>{" "}
    <Bold>{label}</Bold> <Cyan>{children}</Cyan>
  </Line>
);

const CellText = ({ value, width }: { value: Cell; width?: number }) => {
  const padded = width === undefined ? value.text : value.text.padEnd(width);
  if (value.dot) {
    return (
      <span className={value.className}>
        <span className={`inline-block w-[1ch] ${DOT_TONES[value.dot]}`}>
          {padded.slice(0, 1)}
        </span>
        {padded.slice(1)}
      </span>
    );
  }
  return <span className={value.className}>{padded}</span>;
};

export const Table = ({
  at,
  headings,
  rows,
}: Timed & {
  headings: readonly string[];
  rows: readonly (readonly Cell[])[];
}) => {
  const cells = rows;
  const widths = headings.map((heading, column) =>
    Math.max(
      heading.length,
      ...cells.map((row) => row[column]?.text.length ?? 0)
    )
  );
  const last = headings.length - 1;
  return (
    <>
      <Line at={at} />
      <Line at={at}>
        {"  "}
        <span className="font-semibold text-teal-900">
          {headings
            .map((heading, column) =>
              column === last ? heading : heading.padEnd(widths[column] ?? 0)
            )
            .join(COLUMN_GAP)}
        </span>
      </Line>
      {cells.map((row) => (
        <Line at={at} key={row[0]?.text}>
          {"  "}
          {row.map((value, column) => (
            <span key={headings[column]}>
              {column > 0 && COLUMN_GAP}
              <CellText
                value={value}
                width={column === last ? undefined : widths[column]}
              />
            </span>
          ))}
        </Line>
      ))}
      <Line at={at} />
    </>
  );
};

export const Fields = ({
  fields,
}: {
  fields: readonly (readonly [label: string, value: Cell])[];
}) => {
  const width = Math.max(...fields.map(([label]) => label.length));
  return (
    <>
      <Line />
      {fields.map(([label, value]) => (
        <Line key={label}>
          {"  "}
          <span className="font-semibold text-teal-900">
            {label.padEnd(width)}
          </span>
          {COLUMN_GAP}
          <CellText value={value} />
        </Line>
      ))}
      <Line />
    </>
  );
};

export const Terminal = ({
  children,
  className = "",
  dense = false,
  footer,
  glass = false,
  label,
  scroll = false,
  title,
}: {
  children: ReactNode;
  className?: string;

  dense?: boolean;

  footer?: ReactNode;

  glass?: boolean;
  label: string;

  scroll?: boolean;
  title: string;
}) => (
  <figure
    aria-label={label}
    className={`border-gray-alpha-400 overflow-hidden rounded-2xl border text-left ${glass ? "bg-background-100/70 backdrop-blur-2xl backdrop-saturate-150" : "bg-background-100"} ${className}`}
  >
    <div
      className={`border-gray-alpha-400 relative flex h-10 items-center gap-2 border-b px-4 ${glass ? "bg-background-200/30" : "bg-background-200"}`}
    >
      <span className="size-3 rounded-full bg-red-600" />
      <span className="size-3 rounded-full bg-amber-600" />
      <span className="size-3 rounded-full bg-green-600" />
      <figcaption className="pointer-events-none absolute inset-x-0 text-center font-mono text-xs text-gray-900">
        {title}
      </figcaption>
    </div>
    <pre
      className={`text-gray-1000 overflow-x-auto p-5 font-mono leading-[1.7] ${dense ? "text-xs" : "text-[13px]"} ${scroll ? "h-[27rem] overflow-y-auto" : ""}`}
    >
      {children}
    </pre>
    {footer}
  </figure>
);
