import Link from "next/link";

import { art } from "@/lib/art";
import { site } from "@/lib/site";

import { CopyCommand } from "./copy-command";
import { HeroSession } from "./hero-session";
import { ArrowRightIcon } from "./icons";
import { ArtLabel, Painting } from "./painting";

/** A painted sky, inset from the page edge, with the product at the bottom. */
export const Hero = () => (
  <section className="p-2 sm:p-3" id="top">
    <div className="text-gray-1000 relative isolate overflow-hidden rounded-3xl px-4 pt-32 scheme-dark sm:rounded-[2rem] sm:px-6 sm:pt-36">
      <Painting
        artwork={art.lakeGeorge}
        className="object-[50%_62%]"
        priority
        scrim="bg-linear-to-b from-background-100/60 via-background-100/30 to-background-100/45"
      />

      <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
        <Link
          className="border-gray-alpha-400 bg-background-100/40 text-gray-1000 hover:bg-background-100/60 flex h-7 items-center gap-1.5 rounded-full border pr-2 pl-3 text-[13px] backdrop-blur-sm transition-colors duration-150"
          href="/changelog"
        >
          <span className="font-mono">v{site.version}</span>
          <span className="text-gray-alpha-700">·</span>
          Open source under MIT
          <ArrowRightIcon className="size-3" />
        </Link>

        <h1 className="mt-6 font-serif text-[clamp(2.5rem,5.4vw,4.25rem)] leading-[1.02] tracking-[-0.035em] text-balance">
          Log in to Nipa Cloud once a day.{" "}
          <span className="lg:block">Run OpenStack tools all day.</span>
        </h1>

        <p className="text-gray-alpha-1000 mt-6 max-w-xl text-lg leading-relaxed text-pretty">
          nipa turns your password and one OTP code into a session, then runs{" "}
          <code className="font-mono text-[0.9em]">openstack</code>,{" "}
          <code className="font-mono text-[0.9em]">terraform</code> or any other
          tool with it.
        </p>

        <div className="mt-9 flex flex-col items-center gap-5">
          <CopyCommand command={site.install} />
          <a
            className="group text-gray-1000 flex items-center gap-1.5 text-[15px] font-medium underline-offset-4 hover:underline"
            href={site.links.quickstart}
          >
            Read the quickstart
            <ArrowRightIcon className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>

      <HeroSession className="mx-auto mt-16 max-w-4xl rounded-b-none border-b-0 shadow-[0_32px_80px_-16px_var(--ds-shadow-200)] sm:mt-20" />
      <ArtLabel
        artwork={art.lakeGeorge}
        className="absolute top-6 left-6 max-xl:hidden"
      />
    </div>
  </section>
);
