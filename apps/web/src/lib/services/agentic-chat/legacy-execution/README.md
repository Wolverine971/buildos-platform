<!-- apps/web/src/lib/services/agentic-chat/legacy-execution/README.md -->

# Legacy Agentic Chat execution

This namespace owns the synchronous web-hosted Agentic Chat execution path retained for rollback and capabilities that have not moved to the queued worker, including external-account integrations and the worker-disabled image path.

It may depend on authenticated web services and request-scoped capability discovery. Canonical tool definitions, deterministic policy, and new queued execution behavior belong in `@buildos/agentic-chat-runtime` or the worker composition root instead.

Do not add a second implementation here when extending the worker. Delete a legacy branch only after its replacement has parity coverage and the deployment and rollback documentation no longer relies on it.
