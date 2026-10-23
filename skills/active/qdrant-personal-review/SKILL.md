---
name: qdrant-personal-review
description: "Personal scope and ownership rules for Qdrant Cloud work. Use before reviewing or changing code in qdrant-cloud-ui, qdrant-cloud-cluster-service, qdrant-cloud-cluster-api, or qdrant-cloud-public-api, and whenever review-brain runs."
---

# Qdrant personal review

Apply these rules before a review or a change in a Qdrant Cloud repo.

## Ownership

- Protobuf in qdrant-cloud-public-api is the source for an API change. Check the proto first, because the services and the UI follow it.
- A new RPC lands in qdrant-cloud-cluster-service. Keep that RPC in Go. Leave qdrant-cloud-cluster-api on the Python path.
- The engine repo qdrant/ is read-only.
- Copy directories named in the workspace AGENTS.md are out of scope. That set includes qdrant-cloud-ui-copy.

## Scope

- A change stays inside the request. Mention unrelated dead code. Leave it in place.
- Run the project check before you call the work done.
- Ask before a commit, a push, a schema change, or a production deploy in a Qdrant repo.

## Repo map

Read /Users/josep/projects/qdrant/AGENTS.md for the repo map. Do not copy that map into this skill, because it changes with the workspace.
