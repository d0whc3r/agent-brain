---
id: new-rpc-in-cluster-service-go
text: "Add a new RPC to qdrant-cloud-cluster-service, in Go, and leave qdrant-cloud-cluster-api on its Python path."
strength: always
scope: qdrant
repos:
  - qdrant-cloud-cluster-service
  - qdrant-cloud-cluster-api
status: candidate
source: memory/decisions/2026-10-23-harvest.md
seen:
  - 2026-10-23 agent-brain correction
---

Why: New backend work moves to the Go service. The Python API keeps its existing RPCs until they move.
