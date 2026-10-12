import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { Code, TextLink } from "@/components/typography";
import { art } from "@/lib/art";
import { loadChangelog } from "@/lib/changelog";
import type { Change } from "@/lib/changelog";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  description: "What changed in each release of nipa.",
  title: "Changelog · nipa",
};

const DATE = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeZone: "UTC",
});

const ChangeItem = ({ change }: { change: Change }) => (
  <li className="leading-relaxed text-gray-900">
    {change.segments.map((segment) =>
      segment.code ? (
        <Code key={segment.at}>{segment.text}</Code>
      ) : (
        <span key={segment.at}>{segment.text}</span>
      )
    )}
    {change.commit ? (
      <>
        {" "}
        <a
          className="hover:text-gray-1000 font-mono text-xs text-gray-700 transition-colors duration-150"
          href={site.links.commit(change.commit)}
        >
          {change.commit}
        </a>
      </>
    ) : null}
  </li>
);

const Changelog = async () => {
  const releases = await loadChangelog();
  return (
    <PageShell
      artwork={art.theOxbow}
      eyebrow="Changelog"
      lede={
        <>
          Every release of nipa, newest first. Update with{" "}
          <code className="font-mono text-[0.9em] whitespace-nowrap">
            {site.install}
          </code>
          .
        </>
      }
      position="object-[50%_30%]"
      title="What changed in nipa"
    >
      <ol className="divide-gray-alpha-400 divide-y">
        {releases.map((release) => (
          <li
            className="grid gap-x-10 gap-y-6 py-12 first:pt-0 last:pb-0 md:grid-cols-[9rem_1fr]"
            key={release.version}
          >
            <div className="md:sticky md:top-24 md:self-start">
              <h2
                className="scroll-mt-28 font-mono text-lg font-medium"
                id={`v${release.version}`}
              >
                <a
                  className="underline-offset-4 hover:underline"
                  href={site.links.release(release.version)}
                >
                  v{release.version}
                </a>
              </h2>
              {release.date ? (
                <time
                  className="mt-1 block text-sm text-gray-900"
                  dateTime={release.date}
                >
                  {DATE.format(new Date(release.date))}
                </time>
              ) : null}
            </div>
            <ul className="flex flex-col gap-5 text-[15px]">
              {release.changes.map((change) => (
                <ChangeItem change={change} key={change.text} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="border-gray-alpha-400 mt-12 border-t pt-8 text-sm text-gray-900">
        The same list is in{" "}
        <TextLink href={site.links.releases}>the releases on GitHub</TextLink>,
        with a binary for each platform.
      </p>
    </PageShell>
  );
};

export default Changelog;
