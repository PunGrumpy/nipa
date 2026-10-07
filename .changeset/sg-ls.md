---
"nipa-cli": patch
---

Add `nipa sg ls`, which lists the security groups in your project with their inbound and outbound rule counts, age and description. `--json` prints each rule's direction, protocol, ports and remote. `nipa security-group` and `nipa security-groups` do the same.
