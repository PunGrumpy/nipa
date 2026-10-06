import type { Space } from "../../util/api";
import { listServers, matchServers } from "../../util/compute";
import type { Server } from "../../util/compute";
import { CliError, withSpinner } from "../../util/ui";

export const findServer = async (input: {
  space: Space;
  projectName: string;
  ref: string;
}): Promise<Server> => {
  const { projectName, ref } = input;
  const servers = await withSpinner(
    `Loading the servers in ${projectName}…`,
    () => listServers(input.space)
  );
  const [match, ...others] = matchServers(servers, ref);
  if (!match) {
    throw new CliError(
      `no server named or with ID "${ref}" in ${projectName}`,
      {
        hint: "Run `nipa server ls` to see your servers.",
      }
    );
  }
  if (others.length > 0) {
    const ids = [match, ...others].map((server) => server.id).join(", ");
    throw new CliError(
      `${others.length + 1} servers in ${projectName} are named "${ref}"`,
      { hint: `Name one by its ID instead: ${ids}.` }
    );
  }
  return match;
};
