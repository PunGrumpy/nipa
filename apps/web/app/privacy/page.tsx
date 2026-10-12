import type { Metadata } from "next";

import { Legal, LegalSection } from "@/components/legal";
import { PageShell } from "@/components/page-shell";
import { Code, TextLink } from "@/components/typography";
import { art } from "@/lib/art";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  description:
    "What the nipa command-line tool and this site do with your data.",
  title: "Privacy",
};

const Privacy = () => (
  <PageShell
    artwork={art.lakeGeorge}
    eyebrow="Privacy"
    lede="nipa runs on your computer and has no telemetry. This page says what it sends, to whom, and what it keeps on your disk."
    position="object-[50%_40%]"
    title="What nipa does with your data"
  >
    <Legal updated="2026-10-12">
      <LegalSection title="In short">
        <ul>
          <li>
            The nipa command-line tool sends your login to the Keystone you log
            in to, and to nobody else. Its author never receives it.
          </li>
          <li>nipa has no telemetry, analytics or crash reports.</li>
          <li>This site sets no cookies and loads no analytics or trackers.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What the tool sends">
        <p>
          When you run <Code>nipa login</Code>, nipa sends your email, password
          and OTP code to the Keystone of your profile. For Nipa Cloud, that is{" "}
          <Code>identity-api.nipa.cloud</Code>. Keystone answers with a token.
        </p>
        <p>
          Commands such as <Code>nipa server ls</Code> send that token to the
          Space API of the same profile to read or change your resources. With{" "}
          <Code>nipa os</Code>, <Code>nipa tf</Code> and <Code>nipa exec</Code>,
          nipa passes the token to the tool you run, and that tool decides where
          it goes.
        </p>
        <p>
          In a terminal, nipa asks GitHub for the newest release at most once a
          day, so it can tell you about an update. The request carries no data
          about you or your account, but GitHub sees your IP address, as any
          server does. Set <Code>NIPA_NO_UPDATE_CHECK</Code> to turn it off.
        </p>
      </LegalSection>

      <LegalSection title="What the tool keeps on your computer">
        <ul>
          <li>
            Your token, your email and the project you last used, in{" "}
            <Code>~/.config/nipa</Code>. The files have mode <Code>0600</Code>,
            so only your user can read them.
          </li>
          <li>
            Your password, only when you run <Code>nipa login --remember</Code>.
            It goes to the macOS Keychain, or to the secret service on Linux.
          </li>
          <li>
            A folder&apos;s linked project in <Code>.nipa/project.json</Code>,
            when you run <Code>nipa link</Code>.
          </li>
        </ul>
        <p>
          nipa never saves your OTP code or its secret. <Code>nipa logout</Code>{" "}
          revokes the token and deletes the session and the saved password. To
          remove everything, delete <Code>~/.config/nipa</Code>.{" "}
          <TextLink href={site.links.howLoginWorks}>How nipa logs in</TextLink>{" "}
          has the details.
        </p>
      </LegalSection>

      <LegalSection title="This site">
        <p>
          This site is a set of static pages. It has no accounts and no forms,
          and it sets no cookies. The terminal on the home page is a demo that
          runs in your browser with made-up data, and what you type into it
          stays on the page.
        </p>
        <p>
          The server that hosts the site sees your IP address and browser when
          it sends you a page, as any web server does. Links to GitHub, npm and
          The Met lead to sites with their own privacy policies.
        </p>
      </LegalSection>

      <LegalSection title="Your Nipa Cloud account">
        <p>
          What Nipa Cloud does with your account and your resources is under
          Nipa Cloud&apos;s own privacy policy. This page covers only the nipa
          tool and this site.
        </p>
      </LegalSection>

      <LegalSection title="Questions and changes">
        <p>
          nipa is open source, so you can read what it sends in{" "}
          <TextLink href={site.links.repo}>the code</TextLink>. Ask a question
          by <TextLink href={site.links.issues}>opening an issue</TextLink>.
          When this page changes, the date at the top changes with it.
        </p>
      </LegalSection>
    </Legal>
  </PageShell>
);

export default Privacy;
