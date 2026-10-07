import { ApiError } from "../../util/api";
import { handle } from "../../util/command";
import type { Client } from "../../util/command";
import { powerServer, waitForServer } from "../../util/compute";
import type { PowerAction, Server } from "../../util/compute";
import { findServer } from "../../util/find";
import { statusLabel } from "../../util/status";
import {
  bold,
  CliError,
  log,
  note,
  success,
  usageError,
  withSpinner,
} from "../../util/ui";
import { restartSubcommand, startSubcommand, stopSubcommand } from "./command";
import { nameCell } from "./format";

const DEFAULT_TIMEOUT = "5m";
const POLL_MS = 2000;

const parseTimeout = (text: string): number => {
  const groups = /^(?<count>\d+)(?<unit>[hms])$/u.exec(text)?.groups;
  const count = Number(groups?.count);
  switch (groups?.unit) {
    case "h": {
      return count * 3_600_000;
    }
    case "m": {
      return count * 60_000;
    }
    case "s": {
      return count * 1000;
    }
    default: {
      throw usageError(
        `"${text}" isn't a duration`,
        "Write it as a number and a unit, such as `--timeout 90s` or `--timeout 10m`."
      );
    }
  }
};

interface Wording {
  status: string;
  doing: string;
  done: string;
  confirm: boolean;
}

const WORDING: Record<PowerAction, Wording> = {
  restart: {
    confirm: true,
    doing: "Restarting",
    done: "Restarted",
    status: "ACTIVE",
  },
  start: {
    confirm: false,
    doing: "Starting",
    done: "Started",
    status: "ACTIVE",
  },
  stop: {
    confirm: true,
    doing: "Stopping",
    done: "Stopped",
    status: "SHUTOFF",
  },
};

const confirm = async (input: {
  action: PowerAction;
  client: Client;
  server: Server;
  projectName: string;
}): Promise<void> => {
  const { action, client, server } = input;
  if (!client.prompts.interactive) {
    throw usageError(
      `${WORDING[action].doing.toLowerCase()} ${server.name} needs confirmation`,
      `Add \`--yes\` to ${action} it without asking.`
    );
  }
  const verb = `${action.charAt(0).toUpperCase()}${action.slice(1)}`;
  const sure = await client.prompts.confirm({
    default: false,
    message: `${verb} server ${nameCell(server).text} in ${input.projectName}?`,
  });
  if (!sure) {
    throw new CliError("Canceled", { exitCode: 130 });
  }
};

const power = async (input: {
  action: PowerAction;
  client: Client;
  ref: string;
  flags: { yes?: true; "no-wait"?: true; timeout?: string };
}): Promise<number> => {
  const { action, client, flags } = input;
  const wording = WORDING[action];
  if (flags["no-wait"] && flags.timeout !== undefined) {
    throw usageError(
      "--no-wait and --timeout don't go together",
      "Drop `--timeout`, or drop `--no-wait` to wait for the server."
    );
  }
  const timeout = flags.timeout ?? DEFAULT_TIMEOUT;
  const timeoutMs = parseTimeout(timeout);
  const { session, space } = await client.cloud();
  const projectName = session.project.name;
  const server = await findServer({
    projectName,
    ref: input.ref,
    space,
  });
  const name = bold(server.name);
  if (action === "restart" && server.status === "SHUTOFF") {
    throw new CliError(`${server.name} is stopped`, {
      hint: `Run \`nipa server start ${server.name}\` to start it.`,
    });
  }
  if (action !== "restart" && server.status === wording.status) {
    note(`${name} is already ${action === "stop" ? "stopped" : "running"}`);
    return 0;
  }
  if (wording.confirm && !flags.yes) {
    await confirm({ action, client, projectName, server });
  }
  const started = performance.now();
  const inspectLine = `\`nipa server inspect ${server.name}\``;
  if (flags["no-wait"]) {
    await withSpinner(`Asking to ${action} ${server.name}…`, () =>
      powerServer(space, server.id, action)
    );
    success(
      `Asked to ${action} ${name} in ${bold(projectName)}`,
      performance.now() - started
    );
    log(`Run ${inspectLine} to check on it.`);
    return 0;
  }
  const outcome = await withSpinner(
    `${wording.doing} ${server.name}…`,
    async () => {
      await powerServer(space, server.id, action);
      try {
        return await waitForServer({
          id: server.id,
          intervalMs: POLL_MS,
          space,
          status: wording.status,
          timeoutMs,
        });
      } catch (error) {
        // The action went through, so running the command again isn't the fix.
        if (error instanceof CliError || error instanceof ApiError) {
          throw new CliError(error.message, {
            hint: `nipa asked to ${action} ${server.name} before this failed. Run ${inspectLine} to check it.`,
          });
        }
        throw error;
      }
    }
  );
  if (outcome.kind === "error") {
    throw new CliError(`${server.name} went into an error state`, {
      hint: `Run ${inspectLine}, or check the server in the Space portal.`,
    });
  }
  if (outcome.kind === "timeout") {
    const status = statusLabel(outcome.state.status);
    throw new CliError(`${server.name} is still ${status} after ${timeout}`, {
      hint: `Run ${inspectLine} to check it again, or wait longer with \`--timeout\`.`,
    });
  }
  success(
    `${wording.done} ${name} in ${bold(projectName)}`,
    performance.now() - started
  );
  return 0;
};

export const start = handle(startSubcommand, ({ args, client, flags }) =>
  power({ action: "start", client, flags, ref: args.server })
);

export const stop = handle(stopSubcommand, ({ args, client, flags }) =>
  power({ action: "stop", client, flags, ref: args.server })
);

export const restart = handle(restartSubcommand, ({ args, client, flags }) =>
  power({ action: "restart", client, flags, ref: args.server })
);
