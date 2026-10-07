// Every command, once. Main help prints the sections in this order, and
// completion lists the commands in it. test/unit/commands/index.test.ts fails
// when a folder under src/commands isn't in this table.

import type { Program } from "../util/command";
import { complete } from "./complete";
import { completion } from "./completion";
import { db } from "./db";
import { env } from "./env";
import { exec } from "./exec";
import { flavor } from "./flavor";
import { ip } from "./ip";
import { k8s } from "./k8s";
import { lb } from "./lb";
import { link } from "./link";
import { login } from "./login";
import { logout } from "./logout";
import { network } from "./network";
import { os } from "./os";
import { profile } from "./profile";
import { server } from "./server";
import { sg } from "./sg";
import { switchProject } from "./switch";
import { tf } from "./tf";
import { unlink } from "./unlink";
import { volume } from "./volume";
import { whoami } from "./whoami";

export const program: Program = {
  examples: [
    { command: "nipa login", description: "Log in and pick a project" },
    {
      command: "nipa server ls",
      description: "List the servers in your project",
    },
    {
      command: "nipa os volume list",
      description: "Run any openstack command with the session",
    },
    {
      command: "nipa -P staging tf plan",
      description: "Run terraform against the staging profile",
    },
  ],
  hidden: [complete],
  sections: [
    {
      commands: [login, logout, whoami, switchProject, link, unlink],
      title: "Session",
    },
    {
      commands: [server, flavor, volume, network, sg, ip, lb, k8s, db],
      title: "Resources",
    },
    { commands: [os, tf, exec, env], title: "Run tools" },
    { commands: [profile, completion], title: "Setup" },
  ],
  summary:
    "Log in to Nipa Cloud once, then list your servers, volumes, networks, security groups, external IPs, load balancers, Kubernetes clusters and databases, or run openstack and terraform with the session.",
};
