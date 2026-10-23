---
name: qdrant-personal-review
description: "Personal Qdrant Cloud review rules. Use before reviewing a diff in qdrant-cloud-ui, qdrant-cloud-cluster-service, qdrant-cloud-cluster-api, or qdrant-cloud-public-api."
---

Apply these rules before a review in a Qdrant Cloud repo.

Protobuf in qdrant-cloud-public-api is the source for an API change.

A new RPC lands in qdrant-cloud-cluster-service. Keep that RPC in Go. Leave qdrant-cloud-cluster-api on the Python path.

The engine repo qdrant/ is read-only.

Copy directories named in the workspace AGENTS.md are out of scope. That set includes qdrant-cloud-ui-copy.

A change stays inside the request. Mention unrelated dead code. Leave it in place.

Run the project check before you call the work done.

Ask before a commit, a push, a schema change, or a production deploy in a Qdrant repo.

Read /Users/josep/projects/qdrant/AGENTS.md for the repo map. Do not copy that map into this skill.
