---
"nipa-cli": patch
---

`nipa server ls` marks the servers that a Kubernetes cluster made, such as `k8s-control-plane-1 (Kubernetes master)`, from the Magnum tags the portal reads too. `--json` gives each server `kubernetes`, which is `null` for a server you made, or the cluster's `clusterId` and the node's `role`.
