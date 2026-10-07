---
"nipa-cli": patch
---

Add `nipa open`, which opens the profile's Space portal in your browser, like `vercel open`. `nipa open server`, `volume`, `network`, `sg`, `lb` or `db` opens that list, and a name or ID after it opens that resource's page. In a pipe, or with `--url`, nipa prints only the URL and doesn't open a browser. The portal opens the project you last used in it, because a URL can't pick one.
