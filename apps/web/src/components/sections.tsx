import type { ReactNode } from "react";

import { art } from "@/lib/art";
import { COMMAND_COUNT, COMMAND_GROUPS } from "@/lib/commands";
import { site } from "@/lib/site";

import { CopyCommand } from "./copy-command";
import { ArrowUpRightIcon } from "./icons";
import {
  BracesIcon,
  BrushFilter,
  FolderIcon,
  GaugeIcon,
  ProfilesIcon,
  PulseIcon,
  SessionGlyph,
  TabKeyIcon,
} from "./illustrations";
import { ArtLabel, Painting } from "./painting";
import { InspectSession, ToolsSession, WhoamiSession } from "./sessions";
import { Steps } from "./steps";
import type { Step } from "./steps";
import { Code, Eyebrow } from "./typography";

const SectionHeading = ({
  children,
  eyebrow,
}: {
  children: ReactNode;
  eyebrow: string;
}) => (
  <div className="mx-auto max-w-2xl text-center">
    <Eyebrow>{eyebrow}</Eyebrow>
    <h2 className="mt-4 font-serif text-[clamp(2rem,4.4vw,3.25rem)] leading-[1.05] tracking-[-0.03em] text-balance">
      {children}
    </h2>
  </div>
);

/** Why nipa exists, set as one long thought. */
export const Intro = () => (
  <section className="px-6 py-24 sm:py-32">
    <div className="mx-auto max-w-2xl">
      <Eyebrow>Why nipa</Eyebrow>
      <p className="mt-6 font-serif text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.3] tracking-[-0.015em] text-pretty">
        A Nipa Cloud account with multi-factor authentication needs your
        password and a one-time code to log in, and application credentials
        can&apos;t skip that rule.{" "}
        <span className="text-gray-800">
          nipa asks for both once, keeps the token Keystone returns, and hands
          it to every tool you run until it expires, 24 hours later.
        </span>
      </p>
      <p className="mt-8 max-w-xl leading-relaxed text-gray-900">
        The token stays in <Code>~/.config/nipa</Code> with mode{" "}
        <Code>0600</Code>. nipa never saves the OTP code or its secret, because
        a second factor on the same disk as the password stops being a second
        factor.{" "}
        <a
          className="text-gray-1000 hover:decoration-gray-1000 font-medium underline decoration-gray-500 underline-offset-4 transition-colors duration-150"
          href={site.links.howLoginWorks}
        >
          How nipa logs in with MFA
        </a>
      </p>
    </div>
  </section>
);

const STEPS: readonly Step[] = [
  {
    body: "nipa login asks for your password and an OTP code, then saves a token for your project. nipa whoami shows how long it has left, and nipa switch moves to another project without asking again.",
    id: "log-in-once",
    panel: <WhoamiSession />,
    title: "Log in once",
  },
  {
    body: "nipa os runs openstack, nipa tf runs terraform and nipa exec runs anything else. Each starts with the session in its OS_ variables, so you need no openrc file.",
    id: "run-your-tools",
    panel: <ToolsSession />,
    title: "Run your tools with that session",
  },
  {
    body: "nipa lists your servers, volumes, networks, databases and load balancers through the API the Space portal calls. Its inspect commands end with what needs your attention.",
    id: "see-what-is-wrong",
    panel: <InspectSession />,
    title: "See what's wrong, not only what's there",
  },
];

export const HowItWorks = () => (
  <section
    className="border-gray-alpha-400 scroll-mt-24 border-t px-6 py-24 sm:px-10 sm:py-32"
    id="how-it-works"
  >
    <SectionHeading eyebrow="How it works">
      One login. Every tool you already use.
    </SectionHeading>
    <div className="mt-16 sm:mt-24">
      <Steps steps={STEPS} />
    </div>
  </section>
);

/** A painting between sections, with how long a session lasts on a pane of glass. */
export const Interlude = () => (
  <section className="border-gray-alpha-400 border-t p-2 sm:p-3">
    <div className="text-gray-1000 relative isolate flex min-h-[34rem] flex-col justify-end overflow-hidden rounded-3xl p-4 scheme-dark sm:min-h-[40rem] sm:p-8 lg:flex-row lg:items-end lg:justify-between">
      <Painting
        artwork={art.theOxbow}
        className="object-[60%_50%]"
        scrim="bg-background-100/15"
      />
      <div className="border-gray-alpha-400 bg-background-100/55 w-full max-w-md rounded-3xl border p-7 backdrop-blur-2xl backdrop-saturate-150 sm:p-9">
        <SessionGlyph className="h-auto w-40" />
        <p className="mt-9 font-serif text-[clamp(1.75rem,3vw,2.375rem)] leading-[1.08] tracking-[-0.025em] text-balance">
          One OTP code in the morning.{" "}
          <span className="block text-gray-900">No more until tomorrow.</span>
        </p>
        <p className="text-gray-alpha-1000 mt-5 leading-relaxed">
          A session lasts 24 hours.{" "}
          <span className="whitespace-nowrap">
            <Code>nipa whoami</Code>
          </span>{" "}
          shows how long it has left.
        </p>
      </div>
      <ArtLabel
        artwork={art.theOxbow}
        className="max-lg:mt-4 max-lg:px-1 lg:text-right"
      />
    </div>
  </section>
);

const FEATURES = [
  {
    Icon: ProfilesIcon,
    body: "Keep production and a staging Keystone side by side. Add a profile once, then name it on any command.",
    command: "nipa -P staging tf plan",
    label: "Profiles",
  },
  {
    Icon: FolderIcon,
    body: "Link a folder to a profile and a project. Every command there uses them, so your Terraform code plans against the right project.",
    command: "nipa -P staging link my-project",
    label: "Linked folders",
  },
  {
    Icon: PulseIcon,
    body: "When a command fails, doctor checks your profile, session and network in one go and says what to fix. It changes nothing.",
    command: "nipa doctor",
    label: "Doctor",
  },
  {
    Icon: GaugeIcon,
    body: "See how much of each quota your project uses. A quota at 80% shows in yellow, and one at 100% in red, before the next create fails.",
    command: "nipa quota",
    label: "Quotas",
  },
  {
    Icon: BracesIcon,
    body: (
      <>
        Tables for people, IDs for scripts. In a pipe, a list prints one ID per
        line, and <span className="whitespace-nowrap">--json</span> prints all
        of it.
      </>
    ),
    command: "nipa server ls --json",
    label: "Pipes and JSON",
  },
  {
    Icon: TabKeyIcon,
    body: "Press Tab for commands, options and the names of your own servers and security groups, in bash, zsh, fish and PowerShell.",
    command: "nipa completion --install",
    label: "Tab completion",
  },
] satisfies {
  body: ReactNode;
  command: string;
  Icon: typeof ProfilesIcon;
  label: string;
}[];

export const Features = () => (
  <section
    className="border-gray-alpha-400 scroll-mt-24 border-t pt-24 sm:pt-32"
    id="features"
  >
    <BrushFilter />
    <div className="px-6">
      <SectionHeading eyebrow="Features">
        Built for the way you work in a terminal.
      </SectionHeading>
    </div>
    <ul className="border-gray-alpha-400 mt-16 grid border-t sm:mt-24 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((feature) => (
        <li
          className="border-gray-alpha-400 flex flex-col border-b p-8 sm:border-r sm:p-10 sm:max-lg:even:border-r-0 lg:nth-[3n]:border-r-0 lg:nth-last-[-n+3]:border-b-0"
          key={feature.label}
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-gray-100">
            <feature.Icon className="size-6" />
          </span>
          <h3 className="mt-7 font-mono text-xs tracking-[0.12em] text-gray-900 uppercase">
            {feature.label}
          </h3>
          <p className="mt-4 text-[17px] leading-relaxed text-pretty">
            {feature.body}
          </p>
          <p className="mt-auto pt-8 font-mono text-[13px] text-gray-900">
            <span aria-hidden className="text-gray-700 select-none">
              ${" "}
            </span>
            {feature.command}
          </p>
        </li>
      ))}
    </ul>
  </section>
);

export const Commands = () => (
  <section
    className="border-gray-alpha-400 scroll-mt-24 border-t px-6 py-24 sm:px-10 sm:py-32"
    id="commands"
  >
    <SectionHeading eyebrow="Commands">
      {COMMAND_COUNT} commands, one session.
    </SectionHeading>
    <div className="mt-16 grid gap-x-10 gap-y-14 sm:mt-24 sm:grid-cols-2 lg:grid-cols-4">
      {COMMAND_GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className="font-mono text-xs tracking-[0.12em] text-gray-900 uppercase">
            {group.title}
          </h3>
          <dl className="mt-5 space-y-4">
            {group.commands.map(([name, description]) => (
              <div key={name}>
                <dt className="font-mono text-sm">nipa {name}</dt>
                <dd className="mt-1 text-sm leading-snug text-gray-900">
                  {description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
    <p className="mt-16 text-center">
      <a
        className="inline-flex items-center gap-1.5 text-[15px] font-medium underline-offset-4 hover:underline"
        href={site.links.reference}
      >
        Every command and option in the CLI reference
        <ArrowUpRightIcon />
      </a>
    </p>
  </section>
);

/** The last call to install, on a painting that closes the page. */
export const Closing = () => (
  <section className="border-gray-alpha-400 border-t">
    <div className="p-2 sm:p-3">
      <div className="text-gray-1000 relative isolate overflow-hidden rounded-3xl px-6 py-28 scheme-dark sm:rounded-[2rem] sm:py-40">
        <Painting
          artwork={art.kauterskillClove}
          className="object-[50%_38%]"
          scrim="bg-background-100/40"
        />
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 className="font-serif text-[clamp(2.25rem,5vw,3.75rem)] leading-[1.03] tracking-[-0.03em] text-balance">
            Type your OTP code once today.
          </h2>
          <p className="text-gray-alpha-1000 mt-5 max-w-md text-lg leading-relaxed">
            Install nipa from npm with Node.js 22.13 or later, or{" "}
            <a
              className="text-gray-1000 hover:decoration-gray-1000 decoration-gray-alpha-700 underline underline-offset-4 transition-colors duration-150"
              href={site.links.releases}
            >
              download a binary
            </a>{" "}
            for your platform.
          </p>
          <div className="mt-9">
            <CopyCommand command={site.install} />
          </div>
        </div>
        <ArtLabel
          artwork={art.kauterskillClove}
          className="absolute bottom-4 left-5 max-sm:hidden"
        />
      </div>
    </div>
  </section>
);
