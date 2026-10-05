---
"nipa-cli": patch
---

Give production's Space API only to profiles on production's Keystone. In 0.1.4, a staging profile got production's Space API, which refused its token, so `nipa server ls` said the session had expired. nipa now drops that URL from such profiles. `nipa profile add --space-url` takes the Space portal URL, such as `https://portal-stg-epc.nipa.cloud`, saves its `/api`, and checks that it answers. With another Keystone and a terminal, `profile add` asks for the portal URL. Without one, `server ls`, `db ls`, `lb ls` and `ip ls` say the profile has no Space API URL before they ask for a login. A profile that 0.1.4 saved with a portal URL gets its `/api` when nipa loads it, and a Space API URL that answers with a web page gets an error that says so.
