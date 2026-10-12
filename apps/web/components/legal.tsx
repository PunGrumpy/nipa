import type { ReactNode } from "react";

const DATE = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

export const Legal = ({
  children,
  updated,
}: {
  children: ReactNode;

  updated: string;
}) => (
  <article>
    <p className="font-mono text-xs tracking-[0.12em] text-gray-900 uppercase">
      Last updated{" "}
      <time dateTime={updated}>{DATE.format(new Date(updated))}</time>
    </p>
    <div className="divide-gray-alpha-400 mt-10 divide-y">{children}</div>
  </article>
);

export const LegalSection = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="py-10 leading-relaxed text-gray-900 first:pt-0 last:pb-0 [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5">
    <h2 className="text-gray-1000 font-serif text-[1.75rem] leading-tight tracking-[-0.02em]">
      {title}
    </h2>
    {children}
  </section>
);
