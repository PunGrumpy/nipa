import { handle } from "../../util/command";
import type { Client } from "../../util/command";
import type { CompleteKind } from "../../util/completion";
import { listProjects } from "../../util/keystone";
import { openstackCompletions } from "../../util/openstack";
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
      return await openstackCompletions(words);
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
