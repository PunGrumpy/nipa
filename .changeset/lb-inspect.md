---
"nipa-cli": patch
---

Add `nipa lb inspect`, which takes a load balancer's name or ID and shows why it doesn't serve. It prints the load balancer's status, health, virtual IP, external IP and flavor, then each listener, backend group and member with its status and health, and marks in red each part that isn't `ACTIVE` and `ONLINE`. The last line names what stops it, such as `2 of 3 members are down`, or says that every part is healthy. `--json` prints the whole load balancer with its listeners, backend groups and members. Tab completes load balancer names after `nipa lb inspect`.
