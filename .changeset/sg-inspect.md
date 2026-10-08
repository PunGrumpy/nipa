---
"nipa-cli": patch
---

Add `nipa sg inspect`, which takes a security group's name or ID and shows its description, the servers that use it with their addresses, and its inbound and outbound rules. Each rule shows its protocol, ports, and the CIDR or security group it allows by name. A note says when an inbound rule opens SSH, RDP or a database port to the internet. `--json` prints the group in the shape `nipa sg ls --json` uses, and adds each rule's `remoteGroupName` and the group's `servers`.
