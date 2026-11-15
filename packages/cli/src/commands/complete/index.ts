import { handle } from "../../util/command";
import type { Client } from "../../util/command";
import type { CompleteKind } from "../../util/completion";
import { setRequestTimeout } from "../../util/http";
import { listProjects } from "../../util/keystone";
import { cachedNames, resourceNames } from "../../util/names";
import { openstackCompletions, valueKind } from "../../util/openstack";
import { connect, requireSession } from "../../util/session";
import type { ResourceKind } from "../../util/spec";
import { isActive, loadConfig, loadSession } from "../../util/store";
import { completeCommand } from "./command";

// The account's projects, kept per profile like the resource names. After a
// logout there is no session and nothing to offer. An expired session is a
// failed load: the last list stands in.
const projectNames = async (client: Client): Promise<string[]> => {
  const active = await client.profile();
  const saved = await loadSession(active.name);
  if (!saved) {
    return [];
  }
  return cachedNames({
    key: `${active.name}:projects`,
    load: async () => {
      if (!isActive(saved)) {
        throw new Error(`the ${active.name} session expired`);
      }
      const projects = await listProjects({
        authUrl: active.profile.authUrl,
        token: saved.token,
      });
      return projects.map((p) => p.name);
    },
  });
};

// The Space API only, without a login: a Tab press never prompts. The names
// come from the run's `-p` when it has one, kept under the project as typed,
// else from the folder's link or the saved project.
const spaceNames = async (
  client: Client,
  kind: ResourceKind
): Promise<string[]> => {
  const active = await client.profile();
  const saved = await loadSession(active.name);
  const { spaceUrl } = active.profile;
  if (!(saved && spaceUrl)) {
    return [];
  }
  const project =
    client.project ?? (active.link?.link.project ?? saved.project).id;
  return resourceNames({
    connect: async () => {
      const signedIn = await requireSession({
        active,
        project: client.project,
        prompts: { ...client.prompts, interactive: false },
      });
      return connect({ signedIn, spaceUrl }).space;
    },
    kind,
    scope: `${active.name}:${project}`,
  });
};

const openstackWords = async (
  client: Client,
  words: readonly string[]
): Promise<string[]> => {
  const kind = valueKind(words);
  if (!kind) {
    return openstackCompletions(words);
  }
  const typed = words.at(-1) ?? "";
  const found = await spaceNames(client, kind);
  return found.filter((name) => name.startsWith(typed));
};

const values = async (input: {
  client: Client;
  kind: CompleteKind;
  words: readonly string[];
}): Promise<readonly string[]> => {
  const { client, kind, words } = input;
  switch (kind) {
    case "projects": {
      return await projectNames(client);
    }
    case "profiles": {
      const config = await loadConfig();
      return Object.keys(config.profiles).toSorted();
    }
    case "openstack": {
      return await openstackWords(client, words);
    }
    default: {
      return await spaceNames(client, kind);
    }
  }
};

/** How long a Tab press waits for one request before it gives up. */
const COMPLETE_TIMEOUT_MS = 2000;

/**
 * Never prompts, and gives up on the network after COMPLETE_TIMEOUT_MS, so a
 * Tab press can't hang. `nipa __complete openstack --
 * server list --l` gives `words` ["server", "list", "--l"]: the parser
 * ends options at `--`.
 */
export const complete = handle(completeCommand, async ({ args, client }) => {
  setRequestTimeout(COMPLETE_TIMEOUT_MS);
  const found = await values({ client, kind: args.kind, words: args.words });
  client.stdout.write(found.map((value) => `${value}\n`).join(""));
  return 0;
});
