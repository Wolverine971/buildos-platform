<!-- packages/agentic-chat-runtime/README.md -->

# Agentic chat runtime

This package is the Node-portable semantic kernel for BuildOS agentic chat. It owns deterministic turn-control behavior, loop classification and repair, supervisor decisions, last-turn context construction, and shared read-tool implementations over host-injected access ports.

Runtime hosts such as `apps/worker` compose these functions with provider transport, authorization, persistence, retries, deadlines, telemetry, billing, and event delivery. Those infrastructure concerns remain host-owned; this package does not provide a second orchestration loop.

Production code in this package must not import SvelteKit aliases or request, response, SSE, browser, Vercel, Railway, or global service-role client primitives. Transport adapters belong in their host application and provide the ports declared here.

## Entry points

- `@buildos/agentic-chat-runtime/loop`: deterministic loop and turn-control semantics.
- `@buildos/agentic-chat-runtime/tools`: shared read implementations, typed tool registry, and access port.
- `@buildos/agentic-chat-runtime/supervisor`: deterministic supervisor behavior.
- `@buildos/agentic-chat-runtime/context`: last-turn context construction.
- `@buildos/agentic-chat-runtime`: compatibility contracts and parity fixtures. Production hosts should prefer focused subpaths.
