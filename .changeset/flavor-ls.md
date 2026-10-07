---
"nipa-cli": patch
---

Add `nipa flavor ls`, which lists the flavors a server can have, smallest first, with their vCPUs, RAM and type. The Space portal calls them machine types, so `nipa machine-types` does the same, and so does `nipa flavors`. The ones only database clusters use don't show. In a pipe, it prints one flavor name per line.
