import { defineCommand } from "../../util/command";

export const loginCommand = defineCommand({
  args: [],
  description:
    "Asks for your email and password, then for an OTP code when your account uses MFA. nipa saves a token for the current profile, scoped to a project, and reuses it until it expires.",
  examples: [
    { command: "nipa login", description: "Log in to the current profile" },
    {
      command: "nipa -P staging login",
      description: "Log in to the staging profile",
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
      description: "Use this project instead of the last one",
      long: "project",
      short: "p",
      value: { kind: "project" },
    },
  ],
  name: "login",
  summary: "Log in with your password and an OTP code",
});
