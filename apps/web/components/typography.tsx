import type { ReactNode } from "react";

export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="font-mono text-xs tracking-[0.12em] text-gray-900 uppercase">
    {children}
  </p>
);

export const Code = ({ children }: { children: ReactNode }) => (
  <code className="bg-gray-alpha-100 rounded-md px-1.5 py-0.5 font-mono text-[0.85em]">
    {children}
  </code>
);

export const TextLink = ({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) => (
  <a
    className="text-gray-1000 hover:decoration-gray-1000 underline decoration-gray-500 underline-offset-4 transition-colors duration-150"
    href={href}
  >
    {children}
  </a>
);
