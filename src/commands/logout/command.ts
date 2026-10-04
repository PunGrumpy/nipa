import { defineCommand } from "../../util/command";

export const logoutCommand = defineCommand({
  args: [],
  description:
    "Revokes the current profile's token and deletes its session. nipa keeps your email and last project for the next login.",
  flags: [],
  name: "logout",
  summary: "Revoke the token and forget the session",
});
