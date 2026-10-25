---
id: proto-is-api-source
text: "Start an API change in the proto of qdrant-cloud-public-api, and make the services and the UI follow it."
strength: always
scope: qdrant
repos:
  - qdrant-cloud-public-api
  - qdrant-cloud-cluster-api
  - qdrant-cloud-cluster-service
  - qdrant-cloud-ui
status: active
source: memory/decisions/2026-10-24-memory-tiers.md
seen:
  - 2026-10-23 agent-brain correction
---

Why: The proto defines the public contract. A service or UI change that comes first drifts from it.
