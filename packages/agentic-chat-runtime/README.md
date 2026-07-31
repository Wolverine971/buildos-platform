# Agentic chat runtime

This package is the Node-portable boundary for executing one admitted BuildOS agentic-chat turn.

The first extraction slice intentionally contains contracts and ports only. The legacy HTTP route still owns orchestration and SSE transport until those behaviors move behind these boundaries in later Phase 1 slices.

Production code in this package must not import SvelteKit aliases or request, response, SSE, browser, Vercel, Railway, or global service-role client primitives. Transport adapters belong in their host application and provide the ports declared here.
