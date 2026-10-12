import type { Metadata } from "next";

import { Legal, LegalSection } from "@/components/legal";
import { PageShell } from "@/components/page-shell";
import { Code, TextLink } from "@/components/typography";
import { art } from "@/lib/art";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  description: "The terms for the nipa command-line tool and this site.",
  title: "Terms · nipa",
};

const Terms = () => (
  <PageShell
    artwork={art.kauterskillClove}
    eyebrow="Terms"
    lede="nipa is free, open source software under the MIT license. These terms cover the tool and this site."
    position="object-[50%_32%]"
    title="Terms of use"
  >
    <Legal updated="2026-10-12">
      <LegalSection title="The software">
        <p>
          {site.author.name} publishes nipa under{" "}
          <TextLink href={site.links.license}>the MIT license</TextLink>. You
          can use, copy, change and share it, also for commercial work, when you
          keep the copyright and license notice with it. Where these terms and
          the license differ about the software, the license applies.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          nipa and this site come as they are, without a warranty of any kind.
          As the license says, the author isn&apos;t liable for a claim or for
          damage that comes from using them. nipa has no support contract and no
          promise of uptime or fixes.
        </p>
      </LegalSection>

      <LegalSection title="Your account and your resources">
        <p>
          nipa acts with your Nipa Cloud account. Commands such as{" "}
          <Code>nipa server stop</Code>, <Code>nipa tf</Code> and{" "}
          <Code>nipa os</Code> change real resources, and those changes can cost
          money or stop a service. You are responsible for the commands you run
          and for keeping your password, your OTP device and the token in{" "}
          <Code>~/.config/nipa</Code> safe.
        </p>
        <p>
          Your use of Nipa Cloud is under your agreement with Nipa Cloud. These
          terms don&apos;t change it.
        </p>
      </LegalSection>

      <LegalSection title="Fair use">
        <p>
          Use nipa only with accounts and projects you are allowed to use, and
          within the law and Nipa Cloud&apos;s rules.
        </p>
      </LegalSection>

      <LegalSection title="This site">
        <p>
          The site describes nipa as well as its author can, and it can still be
          wrong or out of date. The terminal on the home page shows made-up
          data. For what a command does, the{" "}
          <TextLink href={site.links.reference}>CLI reference</TextLink> and{" "}
          <Code>nipa --help</Code> of your version are the source.
        </p>
        <p>
          The paintings are in the public domain, from The Met&apos;s Open
          Access collection. Other names and marks belong to their owners.
        </p>
      </LegalSection>

      <LegalSection title="Changes and questions">
        <p>
          When these terms change, the date at the top changes with them. Ask a
          question by{" "}
          <TextLink href={site.links.issues}>opening an issue</TextLink>. The{" "}
          <TextLink href="/privacy">privacy page</TextLink> says what nipa does
          with your data.
        </p>
      </LegalSection>
    </Legal>
  </PageShell>
);

export default Terms;
