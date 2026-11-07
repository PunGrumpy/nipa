import { defineCommand } from "../../util/command";

export const loginCommand = defineCommand({
  args: [],
  description:
    "Asks for your email and password, then for an OTP code when your account uses MFA. nipa saves a token for the current profile, scoped to a project, and reuses it until Keystone expires it after 24 hours. `--project` names the project to scope the token to and save, instead of the last one. It is the one command where the option saves the project, not just uses it for this run. With `--remember`, nipa saves your password in the macOS Keychain or Linux's secret service, and later logins ask only for an OTP code. `nipa logout` deletes it.",
  examples: [
    { command: "nipa login", description: "Log in to the current profile" },
    {
      command: "nipa -P staging login",
      description: "Log in to the staging profile",
    },
    {
      command: "nipa login --remember",
      description: "Log in, and ask only for an OTP code next time",
    },
  ],
  flags: [
    {
      description: "Log in as this user instead of the last one",
      long: "username",
      short: "u",
      value: { kind: "text", name: "email" },
    },
    {
      description: "Save your password in the OS keychain for the next login",
      long: "remember",
      value: { kind: "none" },
    },
  ],
  name: "login",
  summary: "Log in with your password and an OTP code",
  usesProject: "saves",
});
