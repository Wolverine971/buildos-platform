<!-- docs/specs/buildos-agent-oauth-remote-mcp-spec-2026-05-13.md -->

# BuildOS Agent OAuth + Remote MCP Spec

**Status:** Draft implementation spec; local Claude OAuth/MCP slice implemented, pending migration/deploy/Claude validation
**Author:** Codex  
**Date:** 2026-05-13  
**Scope:** OAuth-backed remote connector flow for Claude browser first, then other cloud-hosted agent clients

## 1. Summary

BuildOS already has the right v1 auth model for local or private clients:

- user creates a scoped BuildOS Agent Key
- token is shown once and stored as a hash
- external caller uses `Authorization: Bearer ...`
- gateway authenticates to `external_agent_callers`
- policy controls project scope, read/write mode, and write-op whitelist

That is still the correct path for OpenClaw config, Claude Code local config, Codex CLI/IDE config, ChatGPT private Actions, and custom HTTP clients.

OAuth is for browser/cloud clients where pasted bearer tokens are the wrong UX:

- Claude browser / claude.ai remote connectors
- ChatGPT Developer Mode remote MCP connectors
- future Codex web/cloud connector installs
- shared or workspace-wide ChatGPT Actions

The goal is to let a user click "Connect BuildOS", sign in to BuildOS, approve a scoped tool grant, and let the remote client call BuildOS without ever seeing or storing a raw BuildOS Agent Key in chat.

## 1.1 Current Decisions From DJ

Captured on 2026-05-13:

1. **First target:** Claude browser / claude.ai custom connector.
2. **Connector identity:** BuildOS MCP. Treat this as a dedicated MCP connector, not as a generic REST API.
3. **Public connector URL:** use `https://build-os.com/mcp/buildos` as the canonical public connector URL.
4. **Current URL status:** checked on 2026-05-13. Production `https://build-os.com/mcp/buildos` and `https://build-os.com/api/agent-call/mcp` returned `404` before deployment. The local app now implements `/mcp/buildos`; production will continue returning `404` until this work is migrated and deployed.
5. **Default grant:** default to `read_only`.
6. **Write support:** include write permissions in the consent UI and public connector capability set, but do not enable writes by default.
7. **Public posture:** build this as a public connector, with branding, support docs, privacy posture, OAuth, revocation, and Claude directory-readiness in mind.
8. **Support email:** list `dj@build-os.com` for connector support and review contact.
9. **Privacy policy URL:** use `https://build-os.com/privacy`; production currently returns `200`, and the page has been updated in the app to mention third-party agent connectors, scoped access, OAuth grants, token hashes, and revocation.
10. **Logo/icon:** use the brain bolt icon. Existing public candidates:
    - `https://build-os.com/brain-bolt-80.png` square 80x80 PNG, currently returns `200`
    - `https://build-os.com/brain-bolt.png` larger transparent PNG, currently returns `200`
11. **Reviewer account:** create an isolated BuildOS review/test account with sample projects, docs, and tasks before public Claude directory submission.

## 1.2 Claude Research Notes

Research refreshed on 2026-05-13 against Claude and MCP docs:

1. Claude remote connectors are configured by URL and run from Anthropic cloud infrastructure, even for Claude Desktop when using remote connectors. The BuildOS MCP endpoint must be reachable over public HTTPS.
2. Claude supports OAuth with Dynamic Client Registration (`oauth_dcr`) and OAuth with Client ID Metadata Documents (`oauth_cimd`) out of the box.
3. Claude does **not** support pasted bearer tokens for remote connectors, and tokens must not be passed in connector URLs or query params.
4. Hosted Claude surfaces use this OAuth redirect URI:
    - `https://claude.ai/api/mcp/auth_callback`
5. Claude Code is different from Claude browser: it uses local loopback redirects through its own client metadata document. Do not use Claude Code behavior as the first implementation target.
6. Claude sends PKCE `S256` on OAuth authorization requests. BuildOS must advertise and enforce `code_challenge_methods_supported: ["S256"]`.
7. Claude discovers auth through a `401` response with a `WWW-Authenticate` header pointing to protected resource metadata. The metadata `resource` must match the connector URL exactly, including the path.
8. Scope selection matters: if BuildOS omits the `scope` value in the `WWW-Authenticate` challenge, Claude may request the scopes advertised by protected resource metadata. To make read-only the default while preserving long-lived connector sessions, challenge with `scope="buildos.read offline_access"` and reserve write scopes for explicit upgrade/consent.
9. For high-traffic public directory connectors, Claude recommends Client ID Metadata Documents or Anthropic-held credentials over DCR, because DCR can create a new registered client per fresh connection.
10. Public directory review requires OAuth for authenticated services, clear docs, privacy/support links, reviewer test credentials, and tool annotations.
11. Tools must split read and write behavior. A mixed catch-all `api_request` style tool is rejected; BuildOS should expose narrow purpose-built read tools and separate write tools.

## 1.3 Connector Naming Convention

Claude's public directory mostly presents connectors by product or service name, not by protocol name. Examples in the directory include `Asana`, `Airtable`, `Atlassian Rovo`, `Attio`, `AWS Marketplace`, and `Adobe Experience Manager`; the MCP detail is shown in docs and infrastructure rather than the visible product name.

Decision:

- public directory/listing name: `BuildOS`
- setup/help docs phrase: `BuildOS Connector`
- technical endpoint/server name: `BuildOS MCP`
- OAuth client display name: `BuildOS Connector`
- internal metadata/profile id: `buildos_mcp`

Use `BuildOS Connector` when speaking to normal users. Use `BuildOS MCP` in developer docs, route names, OAuth resource metadata, and implementation code.

### Naming Pros/Cons

`BuildOS Connector`

- Pros:
    - aligns with Claude's product language
    - more understandable for non-technical users
    - avoids exposing MCP as implementation detail
    - works if future transport or platform details change
- Cons:
    - less explicit for developers manually adding the MCP URL
    - may need a short subtitle like "Remote MCP connector" in docs

`BuildOS MCP`

- Pros:
    - technically precise
    - clear in developer docs and OAuth resource naming
    - matches the dedicated endpoint `/mcp/buildos`
- Cons:
    - less polished as a public directory name
    - most users do not know MCP
    - current directory naming patterns do not generally append `MCP` to product names

Final convention: public-facing name is `BuildOS Connector`; technical identity remains `BuildOS MCP`.

## 2. Important Answer: Do We Need Google Cloud Console?

Usually, **no**.

This OAuth work is not "Sign in with Google" OAuth. BuildOS is the OAuth provider here. Claude or ChatGPT is the OAuth client. The user authenticates with BuildOS, approves a grant, and BuildOS issues connector tokens.

You only need to touch Google Cloud Console if one of these is true:

1. **BuildOS login domain/callback changes.** If the consent screen depends on Supabase Google login and you add/change production callback domains, then the existing Google OAuth client for BuildOS login may need allowed redirect URI updates.
2. **We add Google Calendar as a connector-exposed OAuth scope.** If the remote agent should directly trigger new Google Calendar permissions beyond what BuildOS already has, then Google Cloud OAuth scopes/verification may be involved.
3. **Supabase Google provider is not already configured for the production domain.** Then BuildOS login itself needs the normal Google OAuth setup.

For the BuildOS agent OAuth server itself, the setup is inside BuildOS:

- new OAuth tables
- new OAuth endpoints
- BuildOS consent UI
- token hashing/rotation
- remote MCP facade
- platform connector registration with Claude/OpenAI

## 3. User Action Items For DJ

### Required Before Build

1. First target client is decided:
    - **Claude browser / claude.ai custom connector**
    - use Claude Desktop remote connector behavior as part of the same path, because Claude remote connectors are configured through the Claude account and brokered from Anthropic infrastructure

2. Confirm the production connector base URL:
    - canonical public URL: `https://build-os.com/mcp/buildos`
    - implementation route: `apps/web/src/routes/mcp/buildos/+server.ts`
    - must be public HTTPS
    - must not require browser cookies for tool calls
    - implemented locally; production needs migration/deploy before it will respond

3. Decide the default grant:
    - decided: `read_only`
    - consent UI must still offer write bundles
    - write tools should only be exposed or enabled after the user explicitly approves write access

4. Provide app branding for OAuth consent:
    - connector name: `BuildOS`
    - public connector name: `BuildOS Connector`
    - technical/server name: `BuildOS MCP`
    - short description: `Let Claude read and update scoped BuildOS project context.`
    - safer consent copy: `Claude can read your selected BuildOS projects by default. Write access is optional and must be approved.`
    - icon URL: `https://build-os.com/brain-bolt-80.png`
    - fallback/larger icon URL: `https://build-os.com/brain-bolt.png`
    - support/contact email: `dj@build-os.com`
    - privacy policy URL: `https://build-os.com/privacy`

5. Decide whether the first version is:
    - decided: **public connector**
    - implementation should still start with a private/dev connector until the end-to-end flow is stable
    - then harden for public/directory submission

6. Keep the privacy policy ready for public directory submission:
    - current route exists: `https://build-os.com/privacy`
    - includes an explicit "Third-party AI connectors and agents" section
    - discloses that users can connect Claude, ChatGPT, OpenClaw, Codex, or custom clients
    - discloses that connected agents can read selected BuildOS projects/tasks/docs according to the approved scope
    - discloses that write access is optional and explicit
    - discloses that OAuth grants, access logs, token hashes, and audit records are stored for security/revocation
    - explains revocation behavior
    - keep `dj@build-os.com` as the contact address

### Probably Not Required

- No Google Cloud Console changes for the agent OAuth flow itself.
- No new Google OAuth client unless BuildOS login/callback URLs are changing.
- No Google verification unless the connector introduces new Google data scopes directly.

### Platform Setup You May Need To Do

For Claude:

- add a custom connector in Claude settings pointing to `https://build-os.com/mcp/buildos`
- for development, use Dynamic Client Registration or a temporary static OAuth client
- for public directory readiness, prefer Client ID Metadata Documents or Anthropic-held credentials over DCR if feasible
- after connection, enable the connector in the conversation from the connector menu

For ChatGPT Developer Mode:

- enable Developer Mode
- create/import the BuildOS remote MCP connector
- choose OAuth auth when registering the connector
- use static client credentials or Dynamic Client Registration depending on what BuildOS ships first

For ChatGPT Actions:

- private Actions can keep using bearer API key auth
- shared/workspace Actions should move to OAuth once the BuildOS OAuth flow exists

## 4. Product Flow

### 4.1 Remote MCP OAuth Install

1. User opens Claude connector settings.
2. User adds `https://build-os.com/mcp/buildos`.
3. Client discovers OAuth metadata from BuildOS.
4. Client redirects user to BuildOS `/oauth/authorize`.
5. BuildOS requires a logged-in BuildOS session.
6. BuildOS shows consent:
    - client name
    - requested profile
    - project scope
    - read/write mode
    - write-op whitelist
    - reminder that public projects are not automatically available to the connector
7. User approves.
8. BuildOS creates or updates an OAuth-backed external caller.
9. BuildOS redirects back to client with an auth code.
10. Client exchanges code for access/refresh tokens.
11. Client calls BuildOS MCP endpoint with access token.
12. BuildOS maps token to the existing caller policy and exposes scoped tools.

### 4.2 Revocation

1. User opens BuildOS Agent Keys / Connected Agents.
2. OAuth-backed connector appears alongside bearer-token callers.
3. User clicks Revoke.
4. BuildOS revokes:
    - grant
    - refresh tokens
    - active access token lineage
    - associated external caller status if appropriate
5. Future MCP calls fail with `401`.

## 5. Architecture

### 5.1 Keep Existing Auth Core

Do not create a second permission model.

OAuth grants should create or reference the same conceptual object already used for bearer keys:

- `external_agent_callers.provider`
- `external_agent_callers.caller_key`
- `external_agent_callers.policy`
- `external_agent_callers.metadata.client_profile_id`
- status / revoke / audit path

OAuth changes how the connector obtains credentials. It should not change what the connector is allowed to do.

### 5.1.1 Project Access Boundary

The connector grant is not the only gate. Effective connector access is:

```text
owner/member project access for the authorizing actor
AND
external caller grant scope
AND
allowed operation set
```

Public project visibility must not count as connector access. A project that is
public on a public page is still invisible to Claude, ChatGPT, OpenClaw, or any
other connected agent unless the authorizing actor is an owner/member and the
grant permits that project.

Implementation guidance:

- Browser/session routes should use `current_actor_has_project_member_access`
  for internal project APIs.
- Service-role gateway code should use an explicit actor check such as
  `actor_has_project_member_access` rather than relying on service-role bypass.
- Public-page endpoints should remain separate from connector/internal endpoints
  and should return shaped public payloads only.
- Tool lists and tool descriptions should tell agents that scoped projects are
  granted collaborator projects, not public-project inventory.

See `docs/technical/project-access-and-agent-auth-model.md` for the shared
engineering model.

### 5.2 Add Remote MCP Facade

Add a remote MCP facade over the existing agent-call tool layer.

Canonical public endpoint:

```text
/mcp/buildos
```

Internal helper services may still live under `apps/web/src/lib/server/agent-call`, but the public connector URL should not look like a generic REST API. Claude users will paste this URL directly into the connector setup UI, so `BuildOS MCP` at `/mcp/buildos` is the cleaner product surface.

The MCP facade should:

- authenticate access tokens
- resolve the OAuth grant and external caller
- list scoped BuildOS tools
- call the same public tool registry / external tool gateway used by `POST /api/agent-call/buildos`
- preserve audit behavior
- mark read-only tools with MCP read-only annotations where supported
- mark write/destructive tools with the appropriate MCP safety annotations
- return `401` with `WWW-Authenticate: Bearer resource_metadata="https://build-os.com/.well-known/oauth-protected-resource/mcp/buildos", scope="buildos.read offline_access"` when unauthenticated
- keep the protected resource metadata `resource` value exactly equal to `https://build-os.com/mcp/buildos`
- prefer Streamable HTTP transport; add SSE only if Claude testing proves it is needed

Do not duplicate ontology write logic inside the MCP route.

### 5.3 Keep JSON-RPC Gateway

Keep:

```text
POST /api/agent-call/buildos
```

That remains the stable path for:

- local agents
- OpenClaw connector/fallback
- custom HTTP clients
- private ChatGPT Actions
- testing the MCP facade internals

## 6. OAuth Endpoints

Minimum endpoints:

```text
GET  /oauth/authorize
POST /oauth/token
POST /oauth/revoke
GET  /.well-known/oauth-authorization-server
GET  /.well-known/oauth-protected-resource
GET  /.well-known/oauth-protected-resource/mcp/buildos
```

Likely later endpoint:

```text
POST /oauth/register
```

Use `/oauth/register` if we support Dynamic Client Registration. For Claude public directory scale, also support Client ID Metadata Documents if feasible.

### 6.0 Metadata Requirements

Protected resource metadata for `/mcp/buildos`:

```json
{
	"resource": "https://build-os.com/mcp/buildos",
	"authorization_servers": ["https://build-os.com"],
	"scopes_supported": ["buildos.read", "buildos.write", "offline_access"]
}
```

Authorization server metadata:

```json
{
	"issuer": "https://build-os.com",
	"authorization_endpoint": "https://build-os.com/oauth/authorize",
	"token_endpoint": "https://build-os.com/oauth/token",
	"revocation_endpoint": "https://build-os.com/oauth/revoke",
	"registration_endpoint": "https://build-os.com/oauth/register",
	"response_types_supported": ["code"],
	"grant_types_supported": ["authorization_code", "refresh_token"],
	"code_challenge_methods_supported": ["S256"],
	"scopes_supported": ["buildos.read", "buildos.write", "offline_access"],
	"token_endpoint_auth_methods_supported": ["none", "client_secret_basic", "client_secret_post"],
	"client_id_metadata_document_supported": true
}
```

If Client ID Metadata Documents are not implemented in v1, omit `client_id_metadata_document_supported`.

### 6.1 `GET /oauth/authorize`

Inputs:

- `client_id`
- `redirect_uri`
- `response_type=code`
- `scope`
- `state`
- `code_challenge`
- `code_challenge_method=S256`
- optional `resource`

Behavior:

- validate registered client
- validate redirect URI
- require logged-in BuildOS user
- render consent UI
- persist pending auth request server-side
- on approval, create short-lived authorization code
- redirect back with `code` and `state`

### 6.2 `POST /oauth/token`

Grant types:

- `authorization_code`
- `refresh_token`

Requirements:

- PKCE verification for auth code exchange
- client auth for confidential/static clients when applicable
- rotate refresh tokens on use
- issue short-lived access token
- never store raw refresh tokens

Suggested lifetimes:

- authorization code: 5 minutes
- access token: 10-60 minutes
- refresh token: 30-90 days, rotated on every use

### 6.3 `POST /oauth/revoke`

Behavior:

- accept access or refresh token
- hash lookup
- revoke grant or token lineage
- log security event
- make future MCP calls fail

## 7. Data Model

Proposed tables:

### `agent_oauth_clients`

Stores registered MCP/OAuth clients.

Fields:

- `id`
- `client_id`
- `client_secret_hash` nullable for public/DCR clients
- `client_name`
- `client_uri`
- `logo_uri`
- `redirect_uris`
- `allowed_scopes`
- `client_type`: `public` or `confidential`
- `registration_source`: `static`, `dynamic`, `cimd`, `anthropic_held`, `admin`
- `status`: `active`, `revoked`
- timestamps

### `agent_oauth_authorization_codes`

Short-lived code exchange records.

Fields:

- `id`
- `code_hash`
- `client_id`
- `user_id`
- `external_agent_caller_id`
- `redirect_uri`
- `scope`
- `code_challenge`
- `code_challenge_method`
- `expires_at`
- `used_at`
- timestamps

### `agent_oauth_grants`

Long-lived user consent records.

Fields:

- `id`
- `user_id`
- `client_id`
- `external_agent_caller_id`
- `client_profile_id`
- `scope_mode`
- `allowed_ops`
- `allowed_project_ids`
- `status`: `active`, `revoked`
- `last_used_at`
- timestamps

### `agent_oauth_refresh_tokens`

Refresh token state.

Fields:

- `id`
- `grant_id`
- `token_hash`
- `token_prefix`
- `family_id`
- `rotated_from_id`
- `expires_at`
- `used_at`
- `revoked_at`
- timestamps

### `agent_oauth_access_tokens` Optional

If access tokens are opaque, store hash and expiry. If access tokens are signed JWTs, store only revocation lineage or token IDs if needed.

Recommendation for v1: use opaque access tokens with hash storage. It is simpler to revoke and matches the existing bearer-token pattern.

## 8. Consent UI

Route:

```text
/oauth/authorize
```

UI requirements:

- show connector name and target platform
- show user account
- show requested access
- let user choose:
    - all projects or selected projects
    - read only or read/write
    - write-op bundle
- define "all projects" as all projects where the user is owner/member, not all
  public projects
- default to least privilege
- default selected grant is `read_only`
- include a visible write-access section:
    - Author docs + tasks
    - Full read/write
    - Custom write-op whitelist
- require explicit approval for write access
- if the user chooses write access, show the exact write categories Claude will be able to invoke
- explain revocation path

Reuse Agent Keys permission bundle language:

- Read only
- Author docs + tasks
- Full read/write
- Custom

## 9. Security Requirements

1. No raw refresh token storage.
2. No raw client secret storage.
3. No bearer-token paste flow for browser/cloud profiles.
4. PKCE required for public clients.
5. Redirect URI exact match.
6. Access tokens short-lived.
7. Refresh tokens rotate on every use.
8. Reuse existing external caller policy enforcement.
9. Every tool call keeps existing audit logs.
10. Never accept access tokens in query params.
11. Validate token audience/resource against `https://build-os.com/mcp/buildos`.
12. Do not pass Claude's MCP access token through to downstream services.
13. Return useful OAuth/MCP errors instead of generic `500` or unstructured failures.
14. If firewall rules are added later, allow Anthropic outbound MCP traffic from `160.79.104.0/21`.
15. Log security events:
    - auth code issued
    - token exchanged
    - refresh succeeded/failed
    - grant revoked
    - token reuse detected
    - invalid redirect/client attempts
16. Public project visibility never expands connector access.
17. Service-role code must authorize the intended actor/caller explicitly before
    reading project content.

## 10. MCP Tool Mapping

The MCP facade should expose BuildOS tools from the same underlying surface:

- `onto.project.list`
- `onto.project.search`
- `onto.task.list`
- `onto.task.get`
- `onto.document.create`
- etc.

For each MCP tool:

- use a short tool name under 64 characters
- include a human-readable `title`
- description should state exactly what the tool does and when to invoke it
- input schema should match the existing direct tool schema
- read-only tools must be annotated with `readOnlyHint: true`
- write/destructive tools must have the applicable safety/destructive annotations
- write tools should keep existing policy checks and audit behavior
- descriptions should state that only caller-approved owner/member projects are visible
- read-only grants should either omit write tools from `tools/list` or return a clear permission-denied response if a write is attempted; omitting them is the better Claude UX
- do not expose a generic mixed read/write `api_request` tool

Initial public Claude tool set:

- project list/search/get
- task list/search/get
- document list/search/get
- project graph/context read
- optional write tools behind explicit consent:
    - `onto.task.create`
    - `onto.task.update`
    - `onto.document.create`
    - `onto.document.update`

## 11. Implementation Plan

### Phase 1: Claude-Facing MCP Facade

Goal: make `https://build-os.com/mcp/buildos` speak remote MCP and expose the BuildOS tool surface.

Tasks:

- add `/mcp/buildos`
- support Streamable HTTP transport first
- optionally add `/mcp/buildos/sse` only if testing shows Claude needs SSE for this connector
- expose MCP `initialize`, `tools/list`, and `tools/call`
- map tool calls into existing public tool registry/gateway
- add tests for read tool, denied write, and safety annotations
- use bearer auth only as a local/internal test shim; public Claude flow should be OAuth

Local implementation status on 2026-05-13:

- `/mcp/buildos` exists and supports MCP JSON-RPC `initialize`, `tools/list`, `tools/call`, and `notifications/initialized`.
- unauthenticated MCP requests return a `WWW-Authenticate` challenge pointing to BuildOS protected resource metadata.
- tool calls map through the existing BuildOS public tool registry and external tool gateway.
- read/write surface is derived from the OAuth-backed caller policy.
- focused tests cover the OAuth challenge path; fuller read/write gateway integration tests are still recommended before public submission.

### Phase 2: Claude OAuth Flow

Goal: Claude browser can connect through OAuth.

Tasks:

- add OAuth tables
- support Dynamic Client Registration for development/custom connector ease
- support Client ID Metadata Documents if feasible, because this is cleaner for public Claude directory traffic
- keep static client ID/secret support as fallback because Claude custom connector settings allow advanced OAuth credentials
- add metadata endpoints
- add a `401` auth challenge from `/mcp/buildos` with resource metadata and default `scope="buildos.read offline_access"`
- add `authorize`, `token`, and `revoke`
- add consent UI
- create OAuth-backed `external_agent_callers`
- wire MCP auth to OAuth access tokens
- use Claude callback URL during validation: `https://claude.ai/api/mcp/auth_callback`

Local implementation status on 2026-05-13:

- OAuth tables are defined in `supabase/migrations/20260513000001_agent_oauth_remote_mcp.sql`.
- metadata endpoints, dynamic client registration, authorization, token exchange, refresh, and revocation are implemented.
- Client ID Metadata Document support is included for restricted Claude/Anthropic metadata hosts.
- consent UI defaults to read-only, offers explicit read/write, supports all or selected project access, and uses the brain bolt icon.
- access and refresh tokens are opaque and stored only as hashes.

### Phase 3: Token Rotation + Security Hardening

Tasks:

- refresh token rotation
- token reuse detection
- revocation UX
- security event logging
- admin observability
- rate limits

Local implementation status on 2026-05-13:

- refresh token rotation and token/grant revocation are implemented.
- grant authorization and authorization-code exchange security events are implemented.
- remaining hardening: refresh/revoke/failure-path security events, token reuse detection, rate limits, admin visibility, and user-facing revocation UX for OAuth grants.

### Phase 4: Dynamic Client Registration

Goal: reduce manual setup for platforms that support DCR and prepare the more scalable Claude public path.

Tasks:

- add `/oauth/register`
- validate software metadata
- issue client IDs
- enforce redirect URI policy
- support public clients with PKCE
- add Client ID Metadata Document support if Phase 2 did not include it
- decide whether public directory launch uses CIMD or Anthropic-held credentials

Local implementation status on 2026-05-13:

- `/oauth/register` is implemented for public PKCE clients.
- restricted Client ID Metadata Document bootstrap is implemented for Claude/Anthropic-hosted metadata documents.
- public directory launch still needs the final Anthropic review posture decision: CIMD versus Anthropic-held credentials.

### Phase 5: Product Polish

Tasks:

- update client profiles so `claude-browser` and `chatgpt-developer-mode` point to OAuth connector install instead of bearer bootstrap
- add docs for Claude setup first
- add integration page CTA
- add screenshots or short demo
- publish privacy/support connector docs
- create a test BuildOS account with sample data for external review
- keep `https://build-os.com/privacy` in sync with connector/OAuth behavior before submission

Local implementation status on 2026-05-13:

- OAuth-backed callers appear in Agent Keys as connector grants instead of pasteable bearer keys.
- Agent Keys revocation now also revokes OAuth grant and token rows when present.
- A separate Connected Apps tab remains optional product polish, not a blocker for the first Claude validation pass.

### Phase 5.1: Reviewer Test Account

Goal: give Anthropic a fully populated but non-sensitive account for connector review.

Recommended account:

- email: `claude-review@build-os.com` or `review+claude@build-os.com`
- owner: BuildOS internal
- data: synthetic only, no real customer/project data
- default project access: all sample projects visible
- write testing: include one clearly labeled sandbox project where reviewers can create/update tasks and docs
- reset path: internal admin/script can restore sample data after review testing

Recommended sample projects:

1. `Creator Launch System`
    - docs: launch brief, audience notes, content calendar, decision log
    - tasks: draft launch essay, outline demo video, review landing page copy, schedule newsletter
    - useful read tests: summarize current launch state, find overdue work, list next tasks

2. `Novel Revision: The Last Ember`
    - docs: story bible, chapter outline, character notes, revision plan
    - tasks: revise chapter 2, tighten antagonist motivation, collect beta feedback, update timeline
    - useful read tests: summarize open plot issues, find tasks tied to chapter 2

3. `BuildOS Connector Review Sandbox`
    - docs: connector test notes, review checklist
    - tasks: create a sample task, update a sample task, create a sample document
    - useful write tests: create/update operations with clear review-safe data

Required reviewer instructions:

- how to sign in
- which project is safe for writes
- example prompts for read-only behavior
- example prompts for write behavior
- how to disconnect/revoke the connector
- where to report issues: `dj@build-os.com`

### Phase 6: Claude Directory Submission

Goal: make BuildOS MCP discoverable as a public Claude connector.

Tasks:

- make server production-ready, not beta-labeled
- publish public setup docs
- publish privacy policy link for connector data use
- publish support channel
- prepare at least three working usage examples
- ensure all tools have `title`, `readOnlyHint`, and/or destructive annotations
- prove read and write tools are separate
- test in Claude browser and Claude Desktop
- validate with MCP Inspector
- prepare a test account with sample BuildOS projects
- submit to Anthropic's connector review flow when ready

## 12. Acceptance Criteria

1. Claude browser can add `https://build-os.com/mcp/buildos` as a custom connector.
2. Claude starts OAuth and reaches BuildOS consent without manual token paste.
3. User sees a BuildOS consent screen before access is granted.
4. Default approved grant is read-only.
5. Approved read-only connector can list/search/read selected BuildOS projects through MCP.
6. Write access can be approved explicitly and is reflected in the tool surface.
7. Write tools are hidden or denied unless the grant allows them.
8. Revoking the grant immediately blocks future token use.
9. Existing bearer-token Agent Keys keep working.
10. Agent Keys UI can distinguish bearer callers from OAuth connector grants.
11. Security events are emitted for grant, refresh, revoke, and failed token attempts.
12. Connector has public-ready branding, docs, privacy/support links, and sample workflows.
13. Public connector listing uses `BuildOS Connector` or `BuildOS` rather than exposing `MCP` as the primary user-facing name.
14. Privacy policy explicitly covers third-party AI connectors/OAuth grants before submission.

## 13. Rollout Strategy

Recommended first rollout:

1. Claude browser custom connector
2. `https://build-os.com/mcp/buildos`
3. Dynamic Client Registration if feasible; static client fallback if not
4. read-only default
5. your personal BuildOS account first
6. manual Claude custom connector setup
7. add explicit write bundle consent
8. harden docs/privacy/support/test account
9. submit for public Claude connector directory review

Do not launch ChatGPT Developer Mode in the same first slice. The first implementation should prove Claude remote MCP OAuth end to end.

## 14. External References

- OpenAI ChatGPT Developer Mode: `https://platform.openai.com/docs/guides/developer-mode`
- OpenAI MCP guide: `https://platform.openai.com/docs/mcp/`
- ChatGPT Actions auth: `https://help.openai.com/en/articles/9442513-configuring-actions-in-gpts`
- Codex config reference: `https://developers.openai.com/codex/config-reference`
- Claude Code MCP docs: `https://code.claude.com/docs/en/mcp`
- Claude connectors directory: `https://claude.com/connectors`
- Claude third-party connector docs: `https://claude.com/docs/connectors/custom/remote-mcp`
- Claude connector authentication: `https://claude.com/docs/connectors/building/authentication`
- Claude connector testing: `https://claude.com/docs/connectors/building/testing`
- Claude connector review criteria: `https://claude.com/docs/connectors/building/review-criteria`
- Claude directory submission: `https://claude.com/docs/connectors/building/submission`
- MCP authorization spec: `https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization`
- OpenClaw env docs: `https://docs.openclaw.ai/help/environment`

## 15. Open Decisions

1. What password/auth flow should the Claude reviewer test account use?
2. Should the reviewer account email be `claude-review@build-os.com`, `review+claude@build-os.com`, or something else?
3. Should the public Claude directory connector use Client ID Metadata Documents or Anthropic-held client credentials?
4. Do we need a larger square logo asset for Claude review, or is `brain-bolt-80.png` sufficient?

## 16. Recommendation

Start with:

- Claude browser custom connector
- `https://build-os.com/mcp/buildos`
- public listing name `BuildOS Connector`
- technical server/resource name `BuildOS MCP`
- support email `dj@build-os.com`
- icon `https://build-os.com/brain-bolt-80.png`
- privacy URL `https://build-os.com/privacy`, updated for third-party connectors
- Dynamic Client Registration for development
- Client ID Metadata Documents for public Claude directory readiness if implementation cost is reasonable
- opaque access tokens
- refresh token rotation
- read-only default
- MCP facade over existing BuildOS tool gateway
- explicit write bundle consent
- public connector review requirements from day one

This gives us the cleanest proof of the architecture without overbuilding dynamic registration or public marketplace polish before the connector works.
