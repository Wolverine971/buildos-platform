<!-- docs/specs/buildos-mcp-server-spec-2026-05-21.md -->

# BuildOS MCP Server Spec

**Status:** Draft architecture/spec  
**Date:** 2026-05-21  
**Owner:** BuildOS  
**Related:** `docs/specs/buildos-agent-oauth-remote-mcp-spec-2026-05-13.md`, `docs/brainstorms/2026-05-13-cross-agent-context-layer.md`, `docs/technical/project-access-and-agent-auth-model.md`, `buildos_api_audit.md`

## 1. Decision Summary

BuildOS should ship a first-class **BuildOS MCP server** as the standard agent-facing connection surface.

This should not replace the current agent-call gateway. It should wrap it.

The current gateway:

```text
POST /api/agent-call/buildos
```

is the right private API for local agents, scripts, OpenClaw, tests, and bearer-token based flows.

The MCP server should expose the same underlying capabilities through standard MCP transports:

```text
https://build-os.com/mcp/buildos
```

for remote/cloud clients, plus an optional local stdio bridge package for agents that only support local MCP process launch.

The core rule:

```text
MCP changes the protocol and install UX.
It must not create a second permission model or duplicate ontology/business logic.
```

## 2. Why This Exists

BuildOS already has an external agent connection flow:

- scoped agent keys
- bearer-token auth
- project allow-lists
- read-only/read-write modes
- write-op whitelists
- write audit
- the `call.dial -> tools/list -> tools/call -> call.hangup` JSON-RPC flow

That is good for agents we can configure directly.

But several agent surfaces expect MCP as their connector shape. A BuildOS-specific MCP server gives them:

- standard discovery via `initialize` and `tools/list`
- standard tool invocation via `tools/call`
- remote OAuth install for browser/cloud clients
- stdio install for local-only MCP clients
- a product surface called "BuildOS Connector" rather than "external agent-call gateway"

## 3. External Research Notes

Current protocol and platform findings as of 2026-05-21:

1. MCP uses JSON-RPC and defines two standard transports: stdio and Streamable HTTP. Streamable HTTP is the preferred remote transport; HTTP+SSE is legacy/backward compatibility.
2. A Streamable HTTP server exposes a single MCP endpoint that supports POST and, if server-to-client streaming is offered, GET. If GET streaming is not offered, a server should return `405 Method Not Allowed` rather than pretending a GET stream exists.
3. Streamable HTTP implementations must handle security explicitly: validate `Origin`, bind local servers to localhost, and authenticate protected connections.
4. HTTP MCP auth is OAuth-style transport auth. Protected MCP servers should publish OAuth Protected Resource Metadata, issue `WWW-Authenticate` challenges, validate bearer tokens on every request, bind tokens to the MCP resource/audience, and never accept access tokens in query params.
5. Tool results should include `structuredContent` for machine-readable output and a JSON text block in `content` for compatibility.
6. Tools should be narrow and annotated. Read and write tools should be separated; generic mixed `api_request` tools are a bad fit for connector review and for model behavior.
7. Claude remote connectors run from Anthropic cloud infrastructure, even when the user is in Claude Desktop. The BuildOS remote MCP URL must be reachable over public HTTPS for Claude web/Desktop remote connector flows.
8. Claude supports OAuth DCR and Client ID Metadata Document flows for remote MCP. It does not support user-pasted bearer tokens for remote connectors, and it rejects tokens in connector URLs.
9. OpenAI supports remote MCP servers as public internet endpoints in API/agent flows, and also expects tool listing and tool calling through the MCP server. For ChatGPT data-only/deep-research style use cases, a `search`/`fetch` compatibility surface is useful.

## 4. Current Repo State

This is not greenfield.

### 4.1 Existing Bearer Gateway

`apps/web/src/routes/api/agent-call/buildos/+server.ts`

Current methods:

- `call.dial`
- `tools/list`
- `tools/call`
- `call.hangup`

Current implementation path:

- auth: `apps/web/src/lib/server/agent-call/caller-auth.ts`
- provisioning: `caller-provisioning.service.ts`
- policy: `agent-call-policy.ts`
- tool execution: `external-tool-gateway.ts`
- public exposure: `public-tool-registry.ts`
- audit: `agent-call-write-audit.service.ts`

Keep this stable.

### 4.2 Existing Remote MCP Facade

`apps/web/src/routes/mcp/buildos/+server.ts`

Current helper:

`apps/web/src/lib/server/agent-call/mcp-connector.service.ts`

Current capabilities:

- `initialize`
- `tools/list`
- `tools/call`
- `notifications/initialized`
- OAuth challenge when unauthenticated
- tool mapping through `getPublicBuildosAgentTools` and `executeBuildosAgentGatewayTool`
- MCP tool annotations derived from read/write policy

Current limitations:

- custom protocol implementation, not official MCP SDK based
- no `@modelcontextprotocol/sdk` dependency in `apps/web`
- no authenticated GET/SSE support
- GET currently always returns a 401 challenge instead of returning 405 when streaming is unsupported
- no `MCP-Protocol-Version` request validation
- no `Accept` header enforcement
- no session header support, though v1 can remain stateless
- no explicit Host/Origin allow-list in the MCP route
- CORS currently uses `Access-Control-Allow-Origin: *`
- tests only cover OAuth challenge paths, not successful initialize/list/call with a real token and scoped caller
- no MCP resources or prompts yet

### 4.3 Existing OAuth Connector Work

Implemented routes:

- `GET /oauth/authorize`
- `POST /oauth/token`
- `POST /oauth/revoke`
- `POST /oauth/register`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-protected-resource/mcp/buildos`

Current constants:

- path: `/mcp/buildos`
- public name: `BuildOS Connector`
- server name: `BuildOS MCP`
- support email: `dj@build-os.com`
- default OAuth scopes: `buildos.read offline_access`
- optional write scope: `buildos.write`

This is the right base for remote browser/cloud connectors.

## 5. Product Shape

Ship two BuildOS MCP entrypoints with the same tool contract and permission model.

### 5.1 Remote Hosted MCP

Canonical endpoint:

```text
https://build-os.com/mcp/buildos
```

Use for:

- Claude web/custom connectors
- Claude Desktop remote connectors
- Claude Code remote connector flow
- ChatGPT Apps/developer-mode connector flows
- OpenAI Responses/Agents remote MCP usage
- any agent that supports Streamable HTTP MCP

Auth:

- OAuth for public/browser/cloud clients
- opaque access tokens stored as hashes
- default read-only grant
- explicit write consent

### 5.2 Local Stdio MCP Bridge

Proposed package:

```text
@buildos/mcp-server
```

Example local config shape:

```json
{
	"mcpServers": {
		"buildos": {
			"command": "npx",
			"args": ["-y", "@buildos/mcp-server"],
			"env": {
				"BUILDOS_BASE_URL": "https://build-os.com",
				"BUILDOS_AGENT_TOKEN": "<agent key from BuildOS>"
			}
		}
	}
}
```

Use for:

- local MCP clients that only launch stdio servers
- older clients that cannot connect to remote Streamable HTTP
- development/test flows
- users who prefer BuildOS Agent Keys over OAuth

The local bridge should:

- speak MCP stdio to the local client
- call either `/mcp/buildos` or `/api/agent-call/buildos` over HTTPS
- use `BUILDOS_AGENT_TOKEN` from env
- never ask the model/user to paste secrets into chat
- write logs to stderr only
- expose the same scoped BuildOS tools as the remote server

Recommendation: build the stdio package with the official TypeScript MCP SDK first. It is the least risky place to adopt the SDK because it does not need to fit SvelteKit/Vercel request lifecycles.

## 6. Server Contract

### 6.1 Transport

Remote v1 should be Streamable HTTP with JSON responses.

Endpoint:

```text
POST /mcp/buildos
GET  /mcp/buildos
OPTIONS /mcp/buildos
```

POST behavior:

- require valid JSON-RPC 2.0 request or notification
- support `initialize`, `tools/list`, `tools/call`, and `notifications/initialized`
- return `application/json` for normal request responses
- return `202 Accepted` for accepted notifications without an `id`
- reject batch requests for v1
- reject unsupported methods with JSON-RPC `-32601`
- reject invalid requests with JSON-RPC `-32600`
- reject parse errors with JSON-RPC `-32700`

GET behavior:

- if SSE/server-to-client messages are not implemented, return `405 Method Not Allowed` after auth
- if unauthenticated, return `401` with OAuth challenge
- do not return a fake informational JSON body for authenticated GET

OPTIONS behavior:

- allow the required request headers
- expose auth/session/protocol headers needed by browser clients
- do not use wildcard origins for authenticated browser-origin requests

### 6.2 Headers

Request handling:

- require `Content-Type: application/json` for JSON-RPC POST bodies
- require `Accept` to include `application/json`; tolerate `text/event-stream` as clients are required to send both for Streamable HTTP
- accept `MCP-Protocol-Version` only when supported
- if absent, assume MCP `2025-03-26` only where the spec's backwards-compatibility rule applies
- reject unsupported protocol versions with HTTP 400

Response headers:

```text
Content-Type: application/json
Cache-Control: no-store
Access-Control-Allow-Origin: <validated origin>
Access-Control-Allow-Headers: Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id
Access-Control-Expose-Headers: WWW-Authenticate, MCP-Protocol-Version, Mcp-Session-Id
```

Session:

- v1 should remain stateless and not emit `Mcp-Session-Id`
- if we later add stateful sessions, bind session IDs to the authenticated user/caller and never treat session ID as auth

### 6.3 Authentication

Unauthenticated protected requests return:

```text
401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://build-os.com/.well-known/oauth-protected-resource/mcp/buildos", scope="buildos.read offline_access"
```

Rules:

- bearer tokens only in `Authorization: Bearer <token>`
- no query-param tokens
- token must be valid, unexpired, not revoked, and issued for the BuildOS MCP resource
- token grant must map to an active `external_agent_callers` row
- grant/caller status must be active/trusted
- every HTTP request is authenticated independently

Metadata:

`/.well-known/oauth-protected-resource/mcp/buildos` must return:

```json
{
	"resource": "https://build-os.com/mcp/buildos",
	"resource_name": "BuildOS MCP",
	"authorization_servers": ["https://build-os.com"],
	"scopes_supported": ["buildos.read", "buildos.write", "offline_access"],
	"bearer_methods_supported": ["header"]
}
```

The `resource` value must exactly match the URL the user enters into the client, including path.

### 6.4 Authorization

Effective access is:

```text
authorizing actor has owner/member access to project
AND external caller grant includes project
AND external caller grant includes operation
AND requested operation passes internal service validation
```

Never let public-project visibility expand connector access.

Service-role code must explicitly authorize the intended actor/caller before reading or mutating project data.

## 7. MCP Tool Surface

### 7.1 Tool Design Rules

MCP tools should be purpose-built and narrow.

Do:

- expose read tools and write tools separately
- keep tool names stable and under platform limits
- include `title`, useful descriptions, and JSON schemas
- return `structuredContent` plus JSON text in `content`
- include `isError: true` for tool-level execution failures
- annotate read-only tools with `readOnlyHint: true`
- annotate destructive operations with `destructiveHint: true`
- include dry-run and idempotency on writes where supported
- make project-scope behavior explicit in descriptions

Do not:

- expose a generic `api_request` tool
- leak raw database internals such as `search_vector`
- expose public project inventory as connector inventory
- require the model to know internal BuildOS route names
- make write tools visible under read-only grants unless a client compatibility issue forces deny-at-call behavior

### 7.2 Initial General Tool Profile

The general BuildOS MCP profile should expose:

Discovery:

- `tool_search`
- `tool_schema`
- `skill_load`

Core reads:

- `onto.project.list`
- `onto.project.search`
- `onto.project.get`
- `onto.project.graph.get`
- `onto.task.list`
- `onto.task.search`
- `onto.task.get`
- `onto.task.docs.list`
- `onto.document.list`
- `onto.document.search`
- `onto.document.get`
- `onto.document.tree.get`
- `onto.document.path.get`
- `onto.search`

Secondary reads already supported by the gateway:

- goals
- plans
- milestones
- risks
- assets metadata/OCR context
- entity relationships/links
- calendar events/project calendar

Default write bundle:

- `onto.task.create`
- `onto.task.update`
- `onto.document.create`
- `onto.document.update`

Expanded write bundle:

- project create/update
- goal/plan/milestone/risk create/update
- edge link/unlink
- document tree move
- calendar create/update/delete/set

### 7.3 Curated Compatibility Profiles

The full external gateway has many operations. Not every client should see all of them by default.

Add profile-aware tool surfaces:

```text
general_agent
research_agent
writer_agent
engineering_agent
chatgpt_data_app
claude_connector
local_admin
```

The first implementation can derive these from existing allowed ops and client metadata. Later, add explicit profile selection to OAuth consent and Agent Keys.

### 7.4 Search/Fetch Compatibility Surface

For ChatGPT data-only, company knowledge, and deep-research style integrations, add a dedicated read-only profile exposing:

```text
search
fetch
```

`search`:

- input: `{ "query": string }`
- output: `{ "results": [{ "id": string, "title": string, "url": string, "text"?: string }] }`
- search across granted project names, tasks, docs, project graph/context summaries, and daily-brief/project-brief artifacts
- return only entities inside the caller's effective scope

`fetch`:

- input: `{ "id": string }`
- output: full scoped content for the selected result, with citations/provenance
- reject IDs outside scope

This profile should be read-only even if the user also has write-capable BuildOS MCP grants elsewhere.

## 8. MCP Resources and Prompts

Tools first is the right v1 because the current code already supports tools and most major clients focus there.

Add resources in v2 when client compatibility is proven.

Proposed resources:

```text
buildos://projects
buildos://project/{project_id}
buildos://project/{project_id}/brief
buildos://project/{project_id}/graph
buildos://task/{task_id}
buildos://document/{document_id}
buildos://document/{document_id}/path
buildos://voice/{surface}
buildos://memory/search/{query}
```

Proposed prompts:

```text
brief_me_on_project
write_in_buildos_voice
librarian_query
summarize_external_agent_session
```

Do not block v1 on these.

## 9. Implementation Plan

### Phase 0: Contract Freeze and Compliance Tests

Goal: document current behavior and fail loudly when MCP contract changes.

Tasks:

- add integration tests for authenticated `initialize`, `tools/list`, and `tools/call`
- add tests for read-only grant hiding or denying write tools
- add tests for write grant exposing default write bundle
- add tests for malformed JSON-RPC, unknown methods, notifications, and batch rejection
- add tests for OAuth metadata exact `resource`
- validate route with MCP Inspector or equivalent protocol probes

Acceptance:

- local tests prove a scoped caller can list tools and call a read tool through `/mcp/buildos`
- unauthenticated requests still get correct OAuth challenge
- protocol errors are JSON-RPC shaped

### Phase 1: Remote MCP Hardening

Goal: make `/mcp/buildos` conform to Streamable HTTP expectations.

Tasks:

- validate `MCP-Protocol-Version`
- enforce/validate `Accept` and `Content-Type`
- change authenticated GET with no SSE support to `405`
- add Host/Origin allow-list behavior
- tighten CORS for authenticated browser-origin requests
- expose required auth/protocol headers
- add structured security events for protocol/auth failures
- document why v1 is stateless and does not return `Mcp-Session-Id`

Acceptance:

- Claude custom connector can reach OAuth discovery and token flow
- OpenAI remote MCP/API probes can list tools
- no tokens are accepted in query params
- local browser-origin attack patterns are rejected by origin/host validation

### Phase 2: Productized Tool Surface

Goal: make the tool list good for agents, not just complete.

Tasks:

- add profile-aware tool filtering
- add `search`/`fetch` read-only compatibility profile
- add better titles/descriptions for MCP-facing tools
- audit annotations for destructive and read-only hints
- standardize list/search pagination output in the gateway
- strip internal fields from all serialized results
- keep `dry_run` and `idempotency_key` on writes

Acceptance:

- read-only users see a tight read surface
- write users see write tools only after explicit grant
- ChatGPT data-style profile can answer from `search`/`fetch`
- tool outputs are compact enough for repeated remote use

### Phase 3: Local Stdio Bridge

Goal: support agents that expect local MCP servers.

Tasks:

- add `packages/buildos-mcp-server`
- use official TypeScript MCP SDK for stdio
- read config from env:
    - `BUILDOS_BASE_URL`
    - `BUILDOS_AGENT_TOKEN`
    - optional `BUILDOS_MCP_PROFILE`
- proxy tool listing/calls to BuildOS
- write logs to stderr only
- publish local setup examples for Claude Desktop, Cursor, Codex, and generic MCP clients

Acceptance:

- `npx @buildos/mcp-server` works as a local MCP stdio server
- a scoped BuildOS Agent Key can list projects through stdio
- write calls preserve BuildOS idempotency/audit behavior

### Phase 4: OAuth and Connector Review Polish

Goal: make the remote connector public-ready.

Tasks:

- verify DCR and CIMD flows against Claude
- decide whether public Claude directory uses CIMD or Anthropic-held credentials
- ensure `/oauth/token` accepts `application/x-www-form-urlencoded`
- use RFC-compatible OAuth errors, especially `invalid_grant` on stale refresh tokens
- add user-facing OAuth grant revocation UX if not already sufficient in Agent Keys
- publish connector docs at `/docs/connect-agents`
- create isolated reviewer account with sample projects
- verify privacy policy/support metadata

Acceptance:

- Claude custom connector installs without manual token paste
- default grant is read-only
- write grant requires explicit user approval
- revoke blocks future access immediately
- reviewer account can run read and write test prompts safely

### Phase 5: Resources, Prompts, and Librarian Layer

Goal: move beyond raw BuildOS CRUD tools into agent-grade context retrieval.

Tasks:

- add `get_project_briefing`
- add `get_voice_guide`
- add citation-rich project/document fetches
- back briefings with existing project context snapshots where possible
- add MCP resource templates for project/document/task context
- add prompts for common agent workflows

Acceptance:

- an external agent can ask for a compact project briefing without stitching raw lists manually
- briefings cite source entities
- v1 direct tools remain available for precise write-back

## 10. Observability and Abuse Controls

Log:

- OAuth metadata discovery failures
- auth challenge issued
- token exchange success/failure
- refresh success/failure
- token reuse detection
- grant revocation
- MCP initialize/list/call
- denied tool call
- write success/failure/replay

Metrics:

- per client/profile tool list latency
- per tool call latency
- tool success/error/denied counts
- token refresh rate
- unauthorized request rate
- write replay/idempotency rate
- external agent usage by caller/provider

Controls:

- per-caller rate limits
- per-user rate limits
- per-IP unauthenticated limits
- max JSON-RPC body size
- max tool result size, with truncation warnings
- max document write size, already 200 KB in gateway
- audit export for user-visible connector activity

## 11. Open Decisions

1. Should the remote web route stay hand-rolled or migrate to official MCP SDK primitives where compatible with SvelteKit/Vercel?
2. What package name should the local stdio bridge use: `@buildos/mcp-server`, `buildos-mcp`, or another public npm name?
3. Should the default remote tool profile expose discovery tools, or should cloud connectors get only a curated direct read surface?
4. Should `search`/`fetch` be always present or only enabled for ChatGPT/data-app profiles?
5. Should calendar tools be in the default read scope, or require a separate `buildos.calendar` scope later?
6. Should write grants default to "Author docs + tasks" only, or allow users to choose full write during first OAuth consent?
7. Do we want MCP resources in v2, or should the "Librarian" layer remain tool-only until clients make resources more useful?

## 12. P0 Recommendations

1. Treat `/mcp/buildos` as the canonical remote MCP server and keep `/api/agent-call/buildos` as the lower-level agent API.
2. Do a protocol hardening pass before adding more tools.
3. Add authenticated MCP integration tests. Current tests only cover challenge behavior.
4. Add a local stdio bridge. This is the missing piece for agents that "connect to MCP" by launching a local server process.
5. Add `search`/`fetch` as a read-only compatibility profile for ChatGPT/deep-research style clients.
6. Keep BuildOS permissions centralized in `external_agent_callers` policy and `agent-call-policy.ts`.
7. Do not expose a generic `api_request` MCP tool.

## 13. References

- MCP transports: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP authorization: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- MCP security best practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- MCP tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- MCP resources: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP SDKs: https://modelcontextprotocol.io/docs/sdk
- TypeScript SDK server guide: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- Claude connector authentication: https://claude.com/docs/connectors/building/authentication
- Claude remote MCP custom connectors: https://claude.com/docs/connectors/custom/remote-mcp
- Claude custom connector help: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- OpenAI MCP/connectors guide: https://developers.openai.com/api/docs/guides/tools-connectors-mcp
- OpenAI MCP server guide: https://developers.openai.com/api/docs/mcp
- OpenAI Agents SDK MCP guide: https://openai.github.io/openai-agents-js/guides/mcp/
