---
"nipa-cli": patch
---

Add `nipa k8s ls`, which lists the Kubernetes clusters in your project with their Kubernetes version, nodes, active node count and age. `nipa os coe` can't find Magnum on Nipa Cloud production, so nipa finds each cluster through the servers Magnum made for it. `nipa kubernetes` and `nipa coe` do the same. `nipa server ls --json` gives each Kubernetes node its `version` too.
