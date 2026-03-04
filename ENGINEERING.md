# YAOS Architecture & Engineering

YAOS is a local-first, offline-capable sync engine for Obsidian that favors explicit correctness boundaries over heuristic file-sync behavior.

This repository keeps deep architecture notes under [`engineering/`](./engineering), with diagrams and operational limits documented alongside implementation details.

## Core concepts

- **[Monolithic vault CRDT](./engineering/monolith.md):** Why YAOS keeps one vault-level `Y.Doc`, what we gain (cross-file transactional behavior), and what we consciously trade off.
- **[Filesystem bridge](./engineering/filesystem-bridge.md):** How noisy Obsidian file events are converted into safe CRDT updates with dirty-set draining and content-acknowledged suppression.
- **[Attachment sync and R2 proxy model](./engineering/attachment-sync.md):** Native Worker proxy uploads, capability negotiation, and bounded fan-out under Cloudflare connection limits.
- **[Checkpoint + journal persistence](./engineering/checkpoint-journal.md):** The storage-engine rewrite that removed full-state rewrites and introduced state-vector-anchored delta journaling.

## Operational constraints

- **[Zero-config auth and claim flow](./engineering/zero-config-auth.md):** Browser claim UX, `obsidian://yaos` deep-link pairing, and env-token override behavior.
- **[Warts and limits](./engineering/warts-and-limits.md):** Canonical limits, safety invariants, and the pragmatic compromises currently in production.
- **[Queue pool behavior](./engineering/queue-pool.md):** Why attachment transfer queues currently favor deterministic behavior over maximal throughput.
