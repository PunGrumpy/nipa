---
"nipa-cli": patch
---

Add `nipa link [project]`, like the Vercel CLI's `vercel link`, which saves the profile and a project in `.nipa/project.json`. Commands in that folder and the folders below it use them, so a Terraform folder for staging needs no `-P staging`, and `nipa switch` in other folders doesn't change it. nipa exchanges the token for the linked project before each command and doesn't save it. `nipa unlink` removes the link, and `nipa whoami --json` gives `link`.
