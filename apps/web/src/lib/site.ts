import cli from "../../../../packages/cli/package.json" with { type: "json" };

const REPO = "https://github.com/PunGrumpy/nipa";
const DOCS = `${REPO}/blob/main/docs`;

// The address the site is served from. Shared links need it to give an
// absolute URL for their image, so set SITE_URL when you build for a deploy.
const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const site = {
  author: cli.author,
  description:
    "nipa logs in to Nipa Cloud with your password and an OTP code, then runs openstack, terraform or any OpenStack tool with that session.",
  install: "npm install -g nipa-cli",
  links: {
    commit: (hash: string) => `${REPO}/commit/${hash}`,
    howLoginWorks: `${DOCS}/how-login-works.md`,
    issues: `${REPO}/issues`,
    license: `${REPO}/blob/main/LICENSE`,
    npm: "https://www.npmjs.com/package/nipa-cli",
    profiles: `${DOCS}/profiles.md`,
    quickstart: `${DOCS}/quickstart.md`,
    reference: `${DOCS}/cli-reference.md`,
    release: (version: string) => `${REPO}/releases/tag/v${version}`,
    releases: `${REPO}/releases/latest`,
    repo: REPO,
    troubleshooting: `${DOCS}/troubleshooting.md`,
  },
  name: "nipa",
  tagline: "Log in to Nipa Cloud once a day. Run OpenStack tools all day.",
  url: SITE_URL,
  version: cli.version,
} as const;
