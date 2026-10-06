import { handle } from "../../util/command";
import type { Client } from "../../util/command";
import type { CompleteKind } from "../../util/completion";
import { listProjects } from "../../util/keystone";
import { resourceNames } from "../../util/names";
import { openstackCompletions, valueKind } from "../../util/openstack";
import type { ResourceKind } from "../../util/openstack";
import { connect, requireSession } from "../../util/session";
import { isActive, loadConfig, loadSession } from "../../util/store";
import { completeCommand } from "./command";

const projectNames = async (client: Client): Promise<string[]> => {
  const active = await client.profile();
  const session = await loadSession(active.name);
  if (!isActive(session)) {
    return [];
  }
  const projects = await listProjects({
    authUrl: active.profile.authUrl,
    token: session.token,
  });
  return projects.map((p) => p.name);
};

// The Space API only, without a login: a Tab press never prompts.
const spaceNames = async (
  client: Client,
  kind: ResourceKind
): Promise<string[]> => {
  const active = await client.profile();
  const saved = await loadSession(active.name);
  const { spaceUrl } = active.profile;
  if (!(isActive(saved) && spaceUrl)) {
    return [];
  }
  const project = active.link?.link.project ?? saved.project;
  return resourceNames({
    connect: async () => {
      const signedIn = await requireSession({
        active,
        prompts: { ...client.prompts, interactive: false },
      });
      return connect({ signedIn, spaceUrl }).space;
    },
    kind,
    scope: `${active.name}:${project.id}`,
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
    case "servers": {
      return await spaceNames(client, "servers");
    }
    case "openstack": {
      return await openstackWords(client, words);
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
};

/**
 * Never prompts, so a Tab press can't hang. `nipa __complete openstack --
 * server list --l` gives `words` ["server", "list", "--l"]: the parser
 * ends options at `--`.
 */
export const complete = handle(completeCommand, async ({ args, client }) => {
  const found = await values({ client, kind: args.kind, words: args.words });
  client.stdout.write(found.map((value) => `${value}\n`).join(""));
  return 0;
});
