import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { PageShell } from "@/components/page-shell";
import { art } from "@/lib/art";

export const metadata: Metadata = {
  title: "Page not found · nipa",
};

const PAGES = [
  { href: "/", label: "Home" },
  { href: "/changelog", label: "Changelog" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
] as const;

const NotFound = () => (
  <PageShell
    artwork={art.theOxbow}
    eyebrow="404"
    lede="The address may be mistyped, or the page may have moved."
    position="object-[50%_30%]"
    title="This page doesn't exist"
  >
    <ul className="divide-gray-alpha-400 divide-y">
      {PAGES.map((page) => (
        <li key={page.href}>
          <Link
            className="group flex items-center justify-between py-4 text-lg font-medium"
            href={page.href}
          >
            {page.label}
            <ArrowRightIcon className="text-gray-900 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  </PageShell>
);

export default NotFound;
