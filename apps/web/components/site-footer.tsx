import Link from "next/link";

import { ARTWORKS } from "@/lib/art";
import { site } from "@/lib/site";

import { Logo } from "./icons";
import { TextLink } from "./typography";

const PAGES = [
  { href: "/changelog", label: "Changelog" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
] as const;

const DOCS = [
  { href: site.links.quickstart, label: "Quickstart" },
  { href: site.links.reference, label: "CLI reference" },
  { href: site.links.troubleshooting, label: "Troubleshooting" },
  { href: site.links.npm, label: "npm" },
  { href: site.links.repo, label: "GitHub" },
] as const;

const LINK = "hover:text-gray-1000 transition-colors duration-150";

export const SiteFooter = () => (
  <footer className="mx-auto max-w-[75rem] px-6 py-10 text-sm text-gray-900 xl:px-0">
    <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-4">
        <Logo className="text-gray-1000 text-[2.5rem] leading-none" />
        <p>
          Made by <TextLink href={site.author.url}>{site.author.name}</TextLink>
          . Open source under the MIT license.
        </p>
      </div>
      <nav aria-label="Footer" className="flex flex-col gap-2 sm:items-end">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {DOCS.map((link) => (
            <li key={link.label}>
              <a className={LINK} href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {PAGES.map((link) => (
            <li key={link.label}>
              <Link className={LINK} href={link.href}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
    <p className="mt-8 text-[13px] leading-relaxed">
      Paintings from The Met&apos;s Open Access collection, in the public
      domain:{" "}
      {ARTWORKS.map((artwork, index) => (
        <span key={artwork.href}>
          {index > 0 && ", "}
          <TextLink href={artwork.href}>{artwork.title}</TextLink> by{" "}
          {artwork.artist}
        </span>
      ))}
      .
    </p>
  </footer>
);
