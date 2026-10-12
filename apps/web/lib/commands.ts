// The groups and descriptions that `nipa --help` prints. Keep them in step
// with packages/cli/src/commands when a command is added.
export const COMMAND_GROUPS = [
  {
    commands: [
      ["login", "Log in with your password and an OTP code"],
      ["logout", "Revoke the token and forget the session"],
      ["whoami", "Show who you're logged in as"],
      ["switch", "Use another project"],
      ["link", "Use a project in this folder"],
      ["unlink", "Stop using a linked project in this folder"],
    ],
    title: "Session",
  },
  {
    commands: [
      ["server", "List, inspect, start, stop and restart your servers"],
      ["flavor", "List the flavors a server can have"],
      ["volume", "List the volumes in your project"],
      ["network", "List the networks in your project"],
      ["sg", "List and inspect your security groups"],
      ["ip", "List the external IPs in your project"],
      ["lb", "List and inspect your load balancers"],
      ["k8s", "List the Kubernetes clusters in your project"],
      ["db", "List and inspect your databases"],
      ["quota", "Show how much of each quota your project uses"],
      ["open", "Open the Space portal in your browser"],
    ],
    title: "Resources",
  },
  {
    commands: [
      ["os", "Run openstack with the session"],
      ["tf", "Run terraform with the session"],
      ["exec", "Run any command with the session"],
      ["env", "Print the OS_* variables for your shell"],
    ],
    title: "Run tools",
  },
  {
    commands: [
      ["profile", "Manage Keystone profiles, such as staging"],
      ["doctor", "Check your setup and say what to fix"],
      ["completion", "Print or install the tab completion script"],
    ],
    title: "Setup",
  },
] as const;

export const COMMAND_COUNT = COMMAND_GROUPS.reduce(
  (count, group) => count + group.commands.length,
  0
);
