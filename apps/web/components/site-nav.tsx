import Link from "next/link";

import { site } from "@/lib/site";

import { GitHubIcon, Logo } from "./icons";
import { NavLink } from "./nav-link";

const LINKS = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#commands", label: "Commands" },
  { href: "/changelog", label: "Changelog" },
] as const;

export const SiteNav = () => (
  <header className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
    <nav
      aria-label="Main"
      className="border-gray-alpha-400 bg-background-100/75 pointer-events-auto flex h-12 items-center gap-1 rounded-2xl border p-1.5 shadow-[0_1px_2px_var(--ds-shadow-100),0_12px_32px_-12px_var(--ds-shadow-200)] backdrop-blur-xl backdrop-saturate-150"
    >
      <Link
        aria-label={`${site.name}, home`}
        className="flex h-9 items-center rounded-xl pr-3 pl-2.5"
        href="/"
      >
        <Logo className="text-[22px] leading-none" />
      </Link>
      <ul className="hidden items-center md:flex">
        {LINKS.map((link) => (
          <li key={link.href}>
            <NavLink href={link.href}>{link.label}</NavLink>
          </li>
        ))}
      </ul>
      <a
        className="bg-gray-1000 text-background-100 ml-1 flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-medium transition-opacity duration-150 hover:opacity-85"
        href={site.links.repo}
      >
        <GitHubIcon />
        GitHub
      </a>
    </nav>
  </header>
);
