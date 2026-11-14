import { jsonFlag } from "../../util/arg-common";
import { defineCommand } from "../../util/command";
import { INVESTIGATED_KINDS } from "../../util/findings";

export const investigateCommand = defineCommand({
  aliases: ["why"],
  args: [{ arity: "one", name: "resource", value: { kind: "text" } }],
  description:
    "Finds the server, load balancer, database, volume or Kubernetes cluster with this name or ID, reads what the Space API shows about it, and says what's wrong: problems first, then warnings, then what passed. Each finding shows the field and value it read and the commands that show more. A server gets its status, task, lock, last action, console log, volumes, address and quotas checked. nipa reads only what your project can see, says when every check passes, and names what it can't see, such as the hypervisor's logs. When a name fits more than one kind, nipa lists them, and `--kind` picks one. It exits with code 0 whatever it finds, so a script reads the findings from `--json`.",
  examples: [
    {
      command: "nipa investigate web-1",
      description: "Find out why web-1 is broken",
    },
    {
      command: "nipa why orders --kind db",
      description: "Look only at the database named orders",
    },
    {
      command:
        "nipa investigate web-1 --json | jq -r '.investigation.findings[] | select(.severity == \"problem\") | .summary'",
      description: "Print each problem",
    },
  ],
  flags: [
    {
      description: "Look only at this kind of resource",
      long: "kind",
      value: { choices: INVESTIGATED_KINDS, kind: "choice" },
    },
    jsonFlag,
  ],
  name: "investigate",
  summary:
    "Find out why a server, load balancer, database, volume or cluster is broken",
});
