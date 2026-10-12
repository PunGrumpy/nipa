import type { ReactNode } from "react";

import type { Artwork } from "@/lib/art";

import { ArtLabel, Painting } from "./painting";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

export const PageShell = ({
  artwork,
  children,
  eyebrow,
  lede,
  position = "",
  title,
}: {
  artwork: Artwork;
  children: ReactNode;
  eyebrow: string;
  lede: ReactNode;

  position?: string;
  title: string;
}) => (
  <>
    <SiteNav />
    <main>
      <header className="p-2 sm:p-3">
        <div className="text-gray-1000 relative isolate overflow-hidden rounded-3xl px-6 pt-36 pb-16 scheme-dark sm:rounded-[2rem] sm:pt-48 sm:pb-24">
          <Painting
            artwork={artwork}
            className={position}
            priority
            scrim="bg-background-100/50"
          />
          <div className="mx-auto max-w-3xl">
            <p className="text-gray-alpha-900 font-mono text-xs tracking-[0.12em] uppercase">
              {eyebrow}
            </p>
            <h1 className="mt-4 font-serif text-[clamp(2.5rem,5.4vw,4rem)] leading-[1.02] tracking-[-0.035em] text-balance">
              {title}
            </h1>
            <p className="text-gray-alpha-1000 mt-5 max-w-xl text-lg leading-relaxed text-pretty">
              {lede}
            </p>
          </div>
          <ArtLabel
            artwork={artwork}
            className="absolute right-6 bottom-4 max-lg:hidden"
          />
        </div>
      </header>
      <div className="px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl">{children}</div>
      </div>
    </main>
    <div className="border-gray-alpha-400 border-t">
      <SiteFooter />
    </div>
  </>
);
