// The tools `nipa mcp` offers an AI assistant: one table, and every entry
// reads. Each run() calls the same util function as the command of that name
// and returns the document `--json` prints, so an assistant and a script see
// the same shapes. A tool that changes anything (power actions, security
// group rules) doesn't belong here, and test/unit/util/mcp-tools.test.ts
// fails when one is added without being named there.
//
// Adding a tool is one entry: defineTool({ name, description, input, run }).

import { z } from "zod";

import {
  getServerState,
  listServerActions,
  listServers,
  getConsoleLog,
  lastLines,
} from "./compute";
import type { ServerAction, ServerState } from "./compute";
import { inspectDatabase, listDatabases } from "./database";
import { databaseProblems } from "./database-health";
import {
  DATABASES,
  findResource,
  findServer,
  LOAD_BALANCERS,
  SECURITY_GROUPS,
} from "./find";
import { listFlavors } from "./flavor";
import { listClusters } from "./kubernetes";
import {
  diagnose,
  inspectLoadBalancer,
  listLoadBalancers,
} from "./load-balancer";
import { listNetworks, listPorts } from "./network";
import { listQuotas } from "./quota";
import { sortQuotas } from "./quota-format";
import { listSecurityGroups, membersOf } from "./security-group";
import { isExposed, toRule } from "./security-group-rule";
import {
  isFailed,
  isSearched,
  searchedProject,
  searchProjects,
  sharedFailure,
} from "./server-search";
import type { Outcome } from "./server-search";
import { listedProjects, loginLine, requireSpaceUrl } from "./session";
import type { ActiveProfile, Cloud, SignedIn } from "./session";
import { isActive, loadSession } from "./store";
import { CliError } from "./ui";
import { listVolumes } from "./volume";

/** What a tool reads the run's profile and session through. See createToolContext. */
export interface ToolContext {
  /** The profile this run uses, chosen when the server starts. */
  readonly profile: () => Promise<ActiveProfile>;
  /**
   * The Space API as `project` (a name or ID), else the run's `-p`, else the
   * folder's link, else the saved project. Never saves it. Throws the
   * login error when the session expired, and never prompts.
   */
  readonly cloud: (project?: string) => Promise<Cloud>;
  /** The saved session, whatever the folder links to or `-p` says. */
  readonly savedSession: () => Promise<SignedIn>;
  /** The run's `-p`, which narrows a search to one project. */
  readonly project: string | undefined;
}

export interface Tool<S extends z.ZodObject = z.ZodObject> {
  /** snake_case, as MCP clients show it. */
  readonly name: string;
  /** When to use the tool, in a sentence or two. The assistant reads this to pick it. */
  readonly description: string;
  readonly input: S;
  /** The document to return, the shape `--json` prints. Throw a CliError to fail. */
  readonly run: (ctx: ToolContext, input: z.infer<S>) => Promise<object>;
}

/** The arguments of a call, as the assistant sent them, before the tool's schema checks them. */
export const ToolArgumentsSchema = z.record(z.string(), z.json());
export type ToolArguments = z.infer<typeof ToolArgumentsSchema>;

/** A tool whose input is still unchecked, which is what the server holds. */
export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly input: z.ZodObject;
  /** Parses `input` with the tool's schema first, and throws a ZodError when it's wrong. */
  readonly run: (ctx: ToolContext, input: ToolArguments) => Promise<object>;
}

export const defineTool = <S extends z.ZodObject>(
  tool: Tool<S>
): RegisteredTool => ({
  description: tool.description,
  input: tool.input,
  name: tool.name,
  run: async (ctx, input) => {
    const result = await tool.run(ctx, tool.input.parse(input));
    return result;
  },
});

const projectInput = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Name or ID of another project to read. Leave it out for the current project."
  );

const noInput = z.object({});
const inProject = z.object({ project: projectInput });

const serverInput = z.object({
  project: projectInput,
  server: z.string().min(1).describe("The server's name or ID."),
});

/** The Space API and the profile and project every document names. */
const open = async (ctx: ToolContext, project: string | undefined) => {
  const { active, session, space } = await ctx.cloud(project);
  return {
    scope: { profile: active.name, project: session.project },
    space,
  };
};

/** A read that can fail without failing the tool: its value, or why it didn't load. */
type Loaded<T> = { ok: true; value: T } | { ok: false; reason: string };

const loaded = <T>(result: PromiseSettledResult<T>): Loaded<T> =>
  result.status === "fulfilled"
    ? { ok: true, value: result.value }
    : {
        ok: false,
        reason:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      };

const whoami = defineTool({
  description:
    "Say which profile, project and user nipa is signed in as, and when the session expires. Call it first to check the session works.",
  input: noInput,
  name: "whoami",
  run: async (ctx) => {
    const active = await ctx.profile();
    const session = await loadSession(active.name);
    if (!isActive(session)) {
      throw new CliError(`you aren't logged in to ${active.name}`, {
        next: [loginLine(active.name)],
        reason: session ? "token_expired" : "login_required",
      });
    }
    return {
      authUrl: active.profile.authUrl,
      expiresAt: session.expiresAt,
      link: active.link
        ? { file: active.link.file, project: active.link.link.project }
        : null,
      loggedIn: true,
      profile: active.name,
      project: session.project,
      region: active.profile.region,
      user: session.user,
    };
  },
});

const listServersTool = defineTool({
  description:
    "List the servers in the project with their status, flavor, addresses and volumes. Start here to find a server that is down or in ERROR.",
  input: inProject,
  name: "list_servers",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { ...scope, servers: await listServers(space) };
  },
});

const inspectServer = defineTool({
  description:
    "Show one server's status, task state, lock, addresses, volumes, security groups and last action. Use it once you know which server to look at.",
  input: serverInput,
  name: "inspect_server",
  run: async (ctx, { project, server: ref }) => {
    const { scope, space } = await open(ctx, project);
    const server = await findServer({
      projectName: scope.project.name,
      ref,
      space,
    });
    // The state and the actions add detail, and the Space API answers 503
    // for them while Nova works, so the server still returns without them.
    const [stateResult, actionsResult] = await Promise.allSettled([
      getServerState(space, server.id),
      listServerActions(space, server.id),
    ]);
    const state: Loaded<ServerState> = loaded(stateResult);
    const actions: Loaded<ServerAction[]> = loaded(actionsResult);
    return {
      ...scope,
      server: {
        ...server,
        lastAction: actions.ok ? (actions.value[0] ?? null) : null,
        locked: state.ok ? state.value.locked : null,
        taskState: state.ok ? state.value.taskState : null,
      },
    };
  },
});

const serverConsoleLog = defineTool({
  description:
    "Read the end of a server's console log, to see why it didn't boot or what it printed before it hung. The Space API keeps only the last 100 lines.",
  input: serverInput.extend({
    tail: z
      .int()
      .min(1)
      .max(500)
      .default(100)
      .describe("How many of the last lines to return."),
  }),
  name: "server_console_log",
  run: async (ctx, { project, server: ref, tail }) => {
    const { scope, space } = await open(ctx, project);
    const server = await findServer({
      projectName: scope.project.name,
      ref,
      space,
    });
    const consoleLog = await getConsoleLog(space, server.id);
    if (consoleLog.kind === "none") {
      throw new CliError(`${server.name} has no console log yet`, {
        hint: "A server has one once it boots, so this one most likely never booted. Call server_history to see what failed.",
      });
    }
    return {
      logs: lastLines(consoleLog.text, tail),
      ...scope,
      server: { id: server.id, name: server.name },
    };
  },
});

const serverHistory = defineTool({
  description:
    "List what was done to a server, newest first, such as a create that failed, with who did it and the request ID. Use it to find out why a server is in ERROR or stopped.",
  input: serverInput,
  name: "server_history",
  run: async (ctx, { project, server: ref }) => {
    const { scope, space } = await open(ctx, project);
    const server = await findServer({
      projectName: scope.project.name,
      ref,
      space,
    });
    return {
      actions: await listServerActions(space, server.id),
      ...scope,
      server: { id: server.id, name: server.name },
    };
  },
});

/** What a search covered: the profile's name and what each project gave. */
interface Searched {
  readonly profile: string;
  readonly outcomes: readonly Outcome[];
}

const searchOneProject = async (
  ctx: ToolContext,
  project: string,
  query: string | undefined
): Promise<Searched> => {
  const { active, session, space } = await ctx.cloud(project);
  const servers = await listServers(space);
  return {
    outcomes: [searchedProject(session.project, servers, query)],
    profile: active.name,
  };
};

// Every project, from the saved session: a folder's link names one project
// and must not narrow a search for all of them.
const searchEveryProject = async (
  ctx: ToolContext,
  query: string | undefined
): Promise<Searched> => {
  const active = await ctx.profile();
  const spaceUrl = requireSpaceUrl(active);
  const { session } = await ctx.savedSession();
  const projects = await listedProjects(active, session);
  if (projects.length === 0) {
    throw new CliError("your account has no projects you can use");
  }
  const outcomes = await searchProjects({
    active,
    projects,
    query,
    session,
    spaceUrl,
  });
  return { outcomes, profile: active.name };
};

const searchServers = defineTool({
  description:
    "Find servers by a piece of their name, ID or IP address in every project the account can use. Use it when you don't know which project holds a server. Give a project to search only that one.",
  input: z.object({
    project: projectInput,
    query: z
      .string()
      .optional()
      .describe(
        "Plain text, case-insensitive. Leave it out to list every server."
      ),
  }),
  name: "search_servers",
  run: async (ctx, { project, query }) => {
    const wanted = project ?? ctx.project;
    const { outcomes, profile } = await (wanted === undefined
      ? searchEveryProject(ctx, query)
      : searchOneProject(ctx, wanted, query));
    // Every project failing the same way, such as an expired session, is one error.
    const shared = sharedFailure(outcomes);
    if (shared) {
      throw shared;
    }
    const failed = outcomes.filter(isFailed);
    return {
      failed: failed.map((outcome) => ({
        message: outcome.failure.message,
        project: outcome.project,
        reason: outcome.failure.cause.reason,
        status: outcome.failure.status,
      })),
      profile,
      projects: {
        searched: outcomes.length - failed.length,
        total: outcomes.length,
      },
      query: query === undefined || query === "" ? null : query,
      servers: outcomes.filter(isSearched).flatMap((outcome) =>
        outcome.servers.map((server) => ({
          ...server,
          project: outcome.project,
        }))
      ),
    };
  },
});

const listVolumesTool = defineTool({
  description:
    "List the volumes with their size, status and the server each is attached to. Use it for a full disk, a volume stuck in error, or one that isn't attached.",
  input: inProject,
  name: "list_volumes",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { ...scope, volumes: await listVolumes(space) };
  },
});

const listNetworksTool = defineTool({
  description:
    "List the networks and their subnets and status, to check where a server is attached.",
  input: inProject,
  name: "list_networks",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { ...scope, networks: await listNetworks(space) };
  },
});

const listSecurityGroupsTool = defineTool({
  description:
    "List the security groups with their rules. Use it to check which ports a group opens.",
  input: inProject,
  name: "list_security_groups",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { ...scope, securityGroups: await listSecurityGroups(space) };
  },
});

const inspectSecurityGroup = defineTool({
  description:
    "Show one security group's rules, marking those that open SSH, RDP or a database to the internet, and the servers that use it. Use it when a server can't be reached, or to check exposure.",
  input: z.object({
    group: z.string().min(1).describe("The group's name or ID."),
    project: projectInput,
  }),
  name: "inspect_security_group",
  run: async (ctx, { group: ref, project }) => {
    const { scope, space } = await open(ctx, project);
    // The same list finds the group and names the remote groups in its rules.
    const groups = listSecurityGroups(space);
    const group = await findResource({
      kind: { ...SECURITY_GROUPS, list: () => groups },
      projectName: scope.project.name,
      ref,
      space,
    });
    const [ports, servers] = await Promise.all([
      listPorts(space),
      listServers(space),
    ]);
    const allGroups = await groups;
    const groupNames = new Map(allGroups.map((g) => [g.id, g.name]));
    const rules = group.rules.map((rule) => ({
      ...rule,
      exposed: isExposed(toRule(rule, groupNames)),
      remoteGroupName: rule.remoteGroupId
        ? (groupNames.get(rule.remoteGroupId) ?? null)
        : null,
    }));
    return {
      ...scope,
      securityGroup: {
        ...group,
        rules,
        servers: membersOf(group.id, ports, servers),
      },
    };
  },
});

const listLoadBalancersTool = defineTool({
  description:
    "List the load balancers with their address and status. Use it to find one that is down.",
  input: inProject,
  name: "list_load_balancers",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { ...scope, loadBalancers: await listLoadBalancers(space) };
  },
});

const inspectLoadBalancerTool = defineTool({
  description:
    "Show a load balancer's listeners, backend groups, health checks and members, with a diagnosis of which part is down. Use it when traffic isn't getting through.",
  input: z.object({
    loadBalancer: z.string().min(1).describe("The load balancer's name or ID."),
    project: projectInput,
  }),
  name: "inspect_load_balancer",
  run: async (ctx, { loadBalancer: ref, project }) => {
    const { scope, space } = await open(ctx, project);
    const { id } = await findResource({
      kind: LOAD_BALANCERS,
      projectName: scope.project.name,
      ref,
      space,
    });
    const loadBalancer = await inspectLoadBalancer(space, id);
    return { ...scope, diagnosis: diagnose(loadBalancer), loadBalancer };
  },
});

const listDatabasesTool = defineTool({
  description:
    "List the database clusters with their engine, version and status.",
  input: inProject,
  name: "list_databases",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { ...scope, databases: await listDatabases(space) };
  },
});

const inspectDatabaseTool = defineTool({
  description:
    "Show a database cluster's primary, replicas, logs and backups, and what isn't healthy about it. Use it when an application can't reach its database.",
  input: z.object({
    database: z.string().min(1).describe("The cluster's name or ID."),
    project: projectInput,
  }),
  name: "inspect_database",
  run: async (ctx, { database: ref, project }) => {
    const { scope, space } = await open(ctx, project);
    const found = await findResource({
      kind: DATABASES,
      projectName: scope.project.name,
      ref,
      space,
    });
    const database = await inspectDatabase(space, found);
    return {
      database: { ...database, problems: databaseProblems(database) },
      ...scope,
    };
  },
});

const listKubernetesClusters = defineTool({
  description:
    "List the Kubernetes clusters with their version, node counts and status.",
  input: inProject,
  name: "list_kubernetes_clusters",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { clusters: await listClusters(space), ...scope };
  },
});

const listQuotasTool = defineTool({
  description:
    "List the project's quotas with what is used and the limit. Use it when creating a server, volume or address fails.",
  input: inProject,
  name: "list_quotas",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { ...scope, quotas: sortQuotas(await listQuotas(space)) };
  },
});

const listFlavorsTool = defineTool({
  description: "List the flavors a server can use, with their vCPUs and RAM.",
  input: inProject,
  name: "list_flavors",
  run: async (ctx, { project }) => {
    const { scope, space } = await open(ctx, project);
    return { flavors: await listFlavors(space), ...scope };
  },
});

/** Every tool the server offers, in the order the assistant sees them. */
export const TOOLS: readonly RegisteredTool[] = [
  whoami,
  listServersTool,
  inspectServer,
  serverConsoleLog,
  serverHistory,
  searchServers,
  listVolumesTool,
  listNetworksTool,
  listSecurityGroupsTool,
  inspectSecurityGroup,
  listLoadBalancersTool,
  inspectLoadBalancerTool,
  listDatabasesTool,
  inspectDatabaseTool,
  listKubernetesClusters,
  listQuotasTool,
  listFlavorsTool,
];
