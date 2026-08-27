<!-- apps/web/src/lib/services/agentic-chat/legacy-execution/README.md -->

# Legacy Agentic Chat execution

This namespace owns synchronous web-hosted Agentic Chat execution for capabilities that have not moved to the queued worker, including external-account integrations, browser OAuth handoff, and the worker-disabled image path. It is reached only through explicit capability renegotiation; infrastructure or admission uncertainty must not route a worker-compatible turn here.

It may depend on authenticated web services and request-scoped capability discovery. Canonical tool definitions, deterministic policy, and new queued execution behavior belong in `@buildos/agentic-chat-runtime` or the worker composition root instead.

Do not add a second implementation here when extending the worker. Delete a capability branch only after its replacement has parity coverage or an explicit product retirement decision.

The compatibility HTTP/SSE composition root lives in [`http-stream/`](./http-stream/README.md).
The public SvelteKit endpoint delegates to that boundary and should remain a thin adapter.
