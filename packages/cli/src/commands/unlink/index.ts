import { handle } from "../../util/command";
import { displayPath, findLink, removeLink } from "../../util/link";
import { bold, note, success } from "../../util/ui";
import { unlinkCommand } from "./command";

export const unlink = handle(unlinkCommand, async () => {
  const found = await findLink();
  if (!found) {
    note("This folder isn't linked to a project");
    return 0;
  }
  await removeLink(found.file);
  success(
    `Unlinked ${displayPath(found.file)} from ${bold(found.link.project.name)}`
  );
  return 0;
});
