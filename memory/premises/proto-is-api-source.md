---
id: proto-is-api-source
text: "Start an API change in the proto of qdrant-cloud-public-api. The services and the UI follow it."
strength: always
scope: qdrant
repos:
  - qdrant-cloud-public-api
  - qdrant-cloud-cluster-api
  - qdrant-cloud-cluster-service
  - qdrant-cloud-ui
status: active
source: memory/decisions/2026-10-23-harvest.md
seen:
  - 2026-10-23 qdrant-review-brain correction
---

Why: The proto defines the public contract. A service or UI change that comes first drifts from it.
