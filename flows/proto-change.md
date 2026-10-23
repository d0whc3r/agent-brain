---
name: proto-change
description: Check a proto change and the repos that consume it.
kinds: [proto]
skills: [api-and-interface-design, golang-grpc]
model: opus
---

1. Run `buf lint` and `buf breaking` against `origin/main`.
2. Check each new `buf.validate` and CEL rule. A required field needs no second rule.
3. When a `requires_*_permissions` option changes, decode the descriptors with a script. The text diff hides a swap that widens a guard.
4. Rebase on `origin/main` and check that each edit is still there. Edits to this repo were lost in a rebase before.
5. List the consumers: `qdrant-cloud-cluster-api`, `qdrant-cloud-cluster-service`, and `qdrant-cloud-ui`. Name the `public-api` version each one must pin.

Done when `buf breaking` is clean and each consumer has a pin to update.
