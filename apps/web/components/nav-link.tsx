"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export const NavLink = ({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) => {
  const current = usePathname() === href;
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className="hover:bg-gray-alpha-100 hover:text-gray-1000 aria-[current=page]:text-gray-1000 flex h-9 items-center rounded-xl px-3 text-[15px] text-gray-900 transition-colors duration-150"
      href={href}
    >
      {children}
    </Link>
  );
};
