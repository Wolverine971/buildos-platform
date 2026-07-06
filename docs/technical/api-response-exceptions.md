<!-- docs/technical/api-response-exceptions.md -->

# API Response Envelope Exceptions

BuildOS app JSON APIs should return the canonical `ApiResponse` envelope:
`{ success, data?, error?, message?, code?, details?, timestamp, requestId? }`.

The routes below intentionally do not use `ApiResponse` because their callers expect
a protocol-defined or file-like wire format:

- `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource/**`: OAuth metadata documents.
- `/oauth/register`, `/oauth/token`, `/oauth/revoke`: OAuth Dynamic Client
  Registration, token, and revocation responses.
- `/mcp/buildos`, `/api/agent-call/buildos`, and `POST /api/agent/google-calendar`:
  MCP/JSON-RPC compatible request and error bodies.
- `/webhooks/**`: third-party webhook acknowledgements and health checks.
- `/agent-skills/index.json`: static JSON index content.
- `/api/agent-call/bootstrap/[setupToken]`: agent bootstrap instructions that default
  to `text/plain` and optionally expose a raw JSON document for agent clients.

For ordinary SvelteKit app APIs, use `ApiResponse` for success/error bodies and
`routeErrorResponse` or `logRouteError` from `$lib/server/route-error` for
unexpected server-side failures. Expected validation and authorization failures
should return an `ApiResponse` error without being persisted as operational errors.
