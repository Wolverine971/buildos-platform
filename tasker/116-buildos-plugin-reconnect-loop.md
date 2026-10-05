<!-- tasker/116-buildos-plugin-reconnect-loop.md -->

# 116 — Fix the BuildOS plugin reconnect loop in ChatGPT / Codex

> **2026-10-05: RECOVERED; awaiting the final click check.** The ChatGPT app connection works again:
> reconnect completed at 19:50 UTC, then ChatGPT refreshed tokens and read successfully at 23:51 and
> 23:56 UTC. A second Codex path, the plugin's direct `.mcp.json` server, could never sign in from
> cloud threads; it is removed locally (UNCOMMITTED) and the Codex plugin is reinstalled. **Left:** restart Codex,
> then run one BuildOS `search` in a cloud thread (see Resolution below). **Priority:** P1.

**Status:** SQL REPAIR LIVE — applied and recorded in production on 2026-10-04;
web error-handling deployment and live client acceptance remain pending.

**Opened:** 2026-10-04 · **Owner:** DJ

**Impact:** Connector reads remain blocked after a reported reconnect; repeated prompts frustrate the user.

**Source:** User report and tool results relayed from parent thread `01a0f002-863d-7448-b664-3d709d21b0c6`.

## Confirmed diagnosis and repair — 2026-10-04

Read-only production investigation identified the reconnect blocker in BuildOS's
`exchange_agent_oauth_credential` function. The incident uses the OAuth client registered as
**ChatGPT**, with a `https://chatgpt.com/connector/oauth/…` callback. This confirms the
ChatGPT-backed connector path; the initiating desktop host/version may still be ChatGPT or Codex.

Evidence, all UTC:

- Six consent attempts created authorization codes at **00:54:01.989**, **04:25:20.532**,
  **04:25:45.541**, **04:26:44.328**, **18:51:23.652**, and **18:52:33.727**. All remained unused.
  Matching `agent.oauth.authorized` events show that consent succeeded.
- The grant is active, caller trusted, owner active, `buildos.read offline_access` approved,
  and the code's saved policy matches the current grant. This is not a missing project grant.
- PostgreSQL logs at **00:54:04.815**, **18:51:26.899**, and **18:52:35.015** record **SQLSTATE
  `42725`**, `operator is not unique: unknown - unknown`, at the same snapshot comparison.
  The two afternoon RPC responses were HTTP 400 (request IDs
  `01a10841-b721-7618-b751-ba87c95d7c94` and `01a10842-c13a-7a50-b352-6e03ac327e71`).
- Last token issuance for this connection was **2026-09-30 17:55:24 UTC**. The unused refresh
  token from that issuance still exists and is unrevoked. This investigation establishes the
  reconnect blocker; it does not prove why the host first stopped refreshing. The earlier
  deployment/schema gap is recorded in the
  [permission implementation receipt](../docs/technical/reviews/BUILDOS_MCP_PERMISSION_IMPLEMENTATION_2026-09-30.md).

The expression `(source->'policy_snapshot'-'epoch')` lets subtraction bind before JSON
extraction, so PostgreSQL attempts to subtract two untyped string literals. Every newly consented
code has a policy snapshot and reaches that crash. Correcting it to
`((source->'policy_snapshot') - 'epoch'::text)` preserves the policy comparison.

The service compounded the failure: a database programming error became OAuth `invalid_grant`
with “authorize again” advice, even with HTTP 500. The token route skipped diagnostics for that
typed error. Repeating consent could not fix the database expression.

Repair and local follow-up:

- [Forward repair migration](../supabase/migrations/20261004192534_agent_oauth_consent_snapshot_precedence.sql):
  applied to production; fixes only the snapshot expression in the existing function; preserves scope ceilings, PKCE,
  revocation/reuse handling, transactions, and service-only execution. No historical migration edit.
- [OAuth service](../apps/web/src/lib/server/agent-call/oauth-connector.service.ts): explicit
  credential/policy rejections retain `invalid_grant`/`invalid_scope`; unexpected database errors
  return `500 server_error` without advice to reconnect.
- [Token route](../apps/web/src/routes/oauth/token/+server.ts): logs the failure stage and database
  code for server errors, without request bodies, SQL details, or credential material.
- [SQL regression checks](../supabase/tests/agent_oauth_scope_ceiling.check.sql): successful current
  snapshots and retained-access epochs, legacy snapshot-free codes, expired-access refresh,
  persisted rotation, replay rejection, and exact reasons for policy/epoch denial. The previous
  happy path omitted snapshots, while broad exception catches let this crash masquerade as a
  successful rejection test. The local fixture now seeds the feature singleton missing from a
  schema-only snapshot; all fixture changes roll back.

Validation:

| Check                                                                          | Result                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New snapshot regression against unchanged cached production schema             | Failed with the exact production `42725` error, proving the reproduction.                                                                                                    |
| OAuth service, credential adapter, MCP connector, and token route Vitest files | **93 tests passed** across 4 files. Free local mocks; no live model/API calls.                                                                                               |
| Migration rehearsal plus OAuth SQL checks                                      | **Passed** against the production schema captured `2026-10-04T05:20:20Z` (production PG15.8; disposable local PG16.13).                                                      |
| Standing archived-scope and project-fold coverage checks                       | **Passed**.                                                                                                                                                                  |
| Role probe / security diff                                                     | Only one function body changed. No new SECURITY findings or grant changes. Authenticated reads: 0 failures before/after; anon: the same 1 pre-existing failure before/after. |
| Production migration / deployed web handler / host recovery                    | **Migration applied and recorded**, with exact function and unchanged permissions verified. Web handler remains local; host recovery unverified.                             |

The first repaired SQL rehearsal exposed a missing singleton in the test fixture; after seeding
that local-only row, the full rehearsal passed. Production data was never changed by these tests.

## Production application receipt — 2026-10-04

DJ explicitly authorized application: “Okay apply the migration if you need to.” Only
`20261004192534_agent_oauth_consent_snapshot_precedence.sql` was applied to the linked **build_os**
production project (`iwifjtlebphefldmwbkh`). Other pending migrations were excluded.

Both commands completed successfully:

```sh
supabase db query --linked -f supabase/migrations/20261004192534_agent_oauth_consent_snapshot_precedence.sql
supabase migration repair --status applied 20261004192534 --linked
```

Before application, the migration was absent from the production ledger and the old function
was captured for rollback reference. After application, read-only verification confirmed:

- The migration version is recorded as applied, and the live function body exactly matches the
  repaired migration. Body MD5 changed from `fe1f15919788c3ca3a5907e612af86c8` to
  `7e20c4dcb38290fd4fef82017b6ba61b`.
- The function ACL is unchanged: `{postgres=X/postgres,service_role=X/postgres}`.
  `service_role` can execute it; `anon` and `authenticated` cannot.
- The corrected snapshot comparison succeeds for all six incident authorization-code rows.
  This read-only check consumed no code or token and completed at **19:51:35 UTC**
  (**3:51 PM EDT**). It verifies the failing SQL expression, not client recovery.

Local operation receipts are `/tmp/tasker116-preflight.json`, `/tmp/tasker116-after.json`, and
`/tmp/tasker116-rollback.sql`, each restricted to mode `0600`. The rollback reference restores the
old, broken function; it was saved for recovery and was not executed. These temporary files are
not durable repository artifacts. No credential records or project grants were changed.

Next steps for DJ:

1. Deploy the two web source changes through the normal release process, preserving other work
   in this shared checkout. The SQL repair independently removes the confirmed consent crash.
2. Perform one deliberate reconnect and verify authorized
   `search`/`fetch` in the original and a fresh session; then validate expiry/refresh. Do not claim
   host recovery from the local tests or invoke a paid test without separate approval.

## Problem and evidence

The BuildOS app connection returns `UNAUTHORIZED`, presents a reconnect action, and returns the
same error immediately after the user reports reconnecting. Establish which client and auth stage
failed, then fix recovery so a completed reconnect restores authorized reads.

All timestamps below are **2026-10-04, UTC**. These are supplied incident observations, not a new
reproduction performed while writing this task.

| Time              | Observation                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 00:49:29          | Parent BuildOS MCP `fetch` for `project:2dcdb7d3-e1c5-4619-8d2a-6e733dae71cf` returned `UNAUTHORIZED` with the exact message below. A reconnect option appeared automatically. |
| 00:54:15          | User reported reconnecting. This does not establish that the OAuth callback, token exchange, or client credential replacement completed.                                       |
| 00:54:20          | Retrying the same fetch returned the identical error and another reconnect prompt.                                                                                             |
| 18:52:20          | User said they still could not reconnect, believed this involved the ChatGPT or Codex BuildOS plugin, and expressed frustration with repeated prompts.                         |
| Time not supplied | An independently signed-in BuildOS session in Mac Chrome worked for reads and writes. Browser app access does not prove connector authentication is healthy.                   |

Exact tool-facing error:

> This app connection requires reauthentication. Reconnect the app and try again.

At intake, the client, reconnect stage, and error origin were unknown. The diagnosis above now
confirms consent and token-exchange failure in BuildOS; desktop host/version, installed plugin/app
version, active tool profile, and post-repair host recovery still need confirmation.
The observed `UNAUTHORIZED` label alone is not a captured HTTP status or server error body.

## Reproduction and expected behavior

1. In the affected client, invoke BuildOS `fetch` with the project reference above, using DJ's
   existing connection. Record the exact surface and connection identity first.
2. Observe the authorization failure and automatic reconnect affordance. Follow that affordance
   once; record which login, consent, callback, and completion screens actually occur.
3. Retry the same fetch in the original conversation immediately after reconnect completes.
4. Compare with a new conversation/session in that client. If needed, separately identify and test
   the other suspected client; do not report both affected from one reproduction.

**Expected:** one successfully completed reconnect restores `search` and `fetch` for authorized
projects. A failure identifies the failed stage and an actionable recovery step. Repeating an
unchanged reconnect prompt is not successful recovery. If the project lacks a grant, the result
should explain the permission boundary rather than suggest that signing in again fixes it.

## Scope and related work

The initial request authorized only the task document and index. DJ subsequently requested
investigation and a fix on 2026-10-04, then explicitly approved the production migration. The
production changes were limited to the repaired function and its migration ledger entry;
credential records and project grants were unchanged. Validation used read-only diagnostics and
free local tests. No installs, commits, pushes, or web deployment were performed. Re-consent must
be deliberate; do not keep prompting DJ to reconnect without new evidence.

No matching reconnect-loop tracker was found in the open Tasker queue. Related work is separate:

- [94 — Frozen connector project list](94-connector-scope-frozen-project-list.md) concerns an
  authenticated caller's project grants and `FORBIDDEN`, not this observed reauthentication loop.
- [115 — Skills and connector pack](115-skills-jev-playbooks-and-connector-pack.md) includes local
  plugin packaging work; compare installed/published versions with it, without assuming a regression.
- The supplied Oct 2 source audit distinguished `chatgpt_data_app` read-only `search`/`fetch` from
  the action-capable general profile. Current source still makes that distinction. Missing write
  tools or write permission is not proof of broken authentication; granting writes cannot add
  action tools to the data-app profile.

## Verified source entrypoints

Checked against the **current working tree on 2026-10-04**, HEAD `3c8771bef`, including existing
uncommitted plugin changes. These references describe local source, not confirmed deployed behavior.
Paths are relative to this task; function names are preferred over line numbers that may move.

| Boundary                         | Entrypoints and what to inspect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host/plugin identity             | [Codex manifest](../plugins/buildos/.codex-plugin/plugin.json) references [`.app.json`](../plugins/buildos/.app.json), which points to the published BuildOS app; [`.mcp.json`](../plugins/buildos/.mcp.json) separately specifies the direct remote MCP URL/resource. [Plugin README](../plugins/buildos/README.md) describes the client split. Verify the actual installed route instead of treating these as interchangeable.                                                                                                                                                                                                      |
| Discovery and audience           | [Authorization server metadata](../apps/web/src/routes/.well-known/oauth-authorization-server/+server.ts), [resource-specific metadata](../apps/web/src/routes/.well-known/oauth-protected-resource/mcp/buildos/+server.ts), and [root resource metadata](../apps/web/src/routes/.well-known/oauth-protected-resource/+server.ts). In [OAuth service](../apps/web/src/lib/server/agent-call/oauth-connector.service.ts), inspect `normalizeOAuthResource`, `mcpResourceUrl`, and `BUILDOS_MCP_RESOURCE_SCOPES`: the supported data-app resource normalizes to the canonical MCP audience; advertised scopes include `offline_access`. |
| Client metadata and registration | [Register route](../apps/web/src/routes/oauth/register/+server.ts); OAuth service `resolveOAuthClient`, `fetchClientIdMetadataDocument`, `registerDynamicOAuthClient`, `validateTokenEndpointClient`, and `createOrUpdateOAuthCaller`/`createOrUpdateOAuthGrant`; [client profile definitions](../apps/web/src/lib/agent-call/agent-client-profiles.ts). The shared `BUILDOS_MCP_CLIENT_PROFILE_ID` currently says `claude-browser`; that stored value alone cannot identify the actual host.                                                                                                                                         |
| Consent, PKCE, callback          | [Authorize server](../apps/web/src/routes/oauth/authorize/+page.server.ts) and [consent UI](../apps/web/src/routes/oauth/authorize/+page.svelte); OAuth service `loadOAuthAuthorizationRequest`, `approveOAuthAuthorization`, `loadRetainedOAuthAccess`, `approveRetainedOAuthAccess`, `buildOAuthRedirect`. Inspect login return, requested versus approved scopes/projects, S256 validation, registered redirect matching, state round-trip, and issuer. The OAuth callback is the client's registered `redirect_uri`; BuildOS generates that redirect, and client-side completion must also be traced.                             |
| Token exchange and refresh       | [Token route](../apps/web/src/routes/oauth/token/+server.ts); OAuth service `exchangeOAuthAuthorizationCode`, `exchangeOAuthRefreshToken`, `issueOAuthTokens`; [atomic credential exchange SQL](../supabase/migrations/20260930185120_agent_oauth_atomic_scope_ceiling.sql), `exchange_agent_oauth_credential`. Source specifies 1-hour access tokens and refresh issuance only with `offline_access`; inspect rotation, immutable scope ceilings, consent snapshots, reuse detection, and transaction errors. Verify deployed function/schema parity before attributing a failure to this code.                                      |
| Revocation and re-consent        | [Revoke route](../apps/web/src/routes/oauth/revoke/+server.ts), OAuth service `revokeOAuthToken`, grant/caller reuse during approval, and the atomic exchange function above. Inspect whether an old session's revoke or refresh reuse can invalidate the current caller/grant after reconnect. This is an investigation question, not an established cause.                                                                                                                                                                                                                                                                          |
| Authentication and errors        | [MCP route](../apps/web/src/routes/mcp/buildos/+server.ts), [MCP service](../apps/web/src/lib/server/agent-call/mcp-connector.service.ts) `authenticateBuildosMcpRequest`, `mcpAuthChallengeHeaders`, `mcpInsufficientScopeChallengeHeaders`, modern/legacy handlers; OAuth service `authenticateOAuthMcpRequest`. Trace HTTP status, JSON-RPC error, `WWW-Authenticate`, tool `_meta['mcp/www_authenticate']`, CORS, and host mapping into `UNAUTHORIZED`.                                                                                                                                                                           |
| Tool profile and project scope   | MCP service `parseMcpProfile`, `dispatchAuthenticatedMcpMethod`, `runMcpSearch`, `runMcpFetch`; [project access service](../apps/web/src/lib/server/agent-call/project-access.service.ts) `resolveEffectiveAgentProjectScope`. Keep profile visibility, OAuth scopes, and per-project grants distinct from credential validity.                                                                                                                                                                                                                                                                                                       |

## Investigation checklist

- [ ] **Identify the connection.** Record host/client version, plugin/app ID and version, account
      aliases, endpoint/profile, and credential kind (OAuth versus static bridge key). Compare installed
      configuration and deployed revision with local manifests. Do not infer the host from a caller label.
- [ ] **Trace one bounded reconnect end to end.** Correlate discovery → authorization request →
      consent → client callback → token exchange → first MCP read. Find the first failed boundary.
      Establish whether the newly issued credential is saved and used by the original conversation.
- [ ] **Check client and grant binding.** Compare registered client identity/auth method, redirect,
      PKCE result, issuer/resource, requested/approved/issued scopes, caller/grant status, and project
      permissions. Include retained-access consent if that path was used. Do not widen permissions to
      mask an authentication failure.
- [ ] **Check expiry, rotation, and revocation.** Establish whether a refresh token was issued and
      attempted, whether the replacement is retained, and whether stale/concurrent sessions reuse old
      refresh tokens or revoke a shared caller/grant. Compare ordering around the known incident times.
- [ ] **Locate the error's origin.** Compare host error/prompt with sanitized server responses and
      request logs. Keep 401 credential failure, 403 scope/project denial, OAuth `invalid_grant`, and
      server/network errors separate. Confirm both modern and legacy transport handling where relevant.
- [ ] **Produce a supported diagnosis.** Record the failing boundary, supporting trace, smallest
      repair, and regression cases. If the host owns the failure, prepare a sanitized reproducible
      escalation for DJ; do not label a host bug without evidence or send an escalation automatically.

## Evidence to capture, without secrets

Use a single attempt ID and UTC timestamps. Capture client/build and deployed revision, sanitized
endpoint/profile and callback origin/path, public client/app IDs, request/correlation IDs, HTTP and
OAuth/JSON-RPC error codes, sanitized challenge headers, and the sequence of UI outcomes. Record
state/PKCE match booleans and token-issued/token-replaced booleans, not their raw values.

For authorized diagnostic reads, select only relevant row IDs (or consistent aliases), scope,
status, expiry/used/revoked timestamps, and grant/rotation-family relationships from
`agent_oauth_clients`, `agent_oauth_grants`, `agent_oauth_authorization_codes`,
`agent_oauth_access_tokens`, `agent_oauth_refresh_tokens`, `external_agent_callers`, and
`external_agent_project_permissions`. Correlate existing `agent.oauth.authorized`,
`agent.oauth.token.exchanged`, and `agent.oauth.refresh.reuse_detected` events where available.
Do not assume every stage currently emits an event; record missing evidence explicitly.

Never paste tokens, token hashes, authorization codes, PKCE verifiers/challenges, state values,
client secrets, authorization/cookie headers, full callback query strings, raw HARs, or environment
files into this tracker. Redact account details and unrelated project content from screenshots/logs.

## Acceptance and validation

Live acceptance remains **pending**. Local verification and read-only incident evidence are
recorded above; no paid test or live reconnect was run during the implementation pass.

- [ ] **Reconnect restores reads:** on the confirmed affected client, one completed reconnect is
      followed by successful authorized `search` and `fetch`, including the incident project if still
      granted. No immediate repeat prompt. Record client, deployment, time, and sanitized receipt.
- [ ] **Expiry/refresh:** with `offline_access` approved, expire access in a controlled fixture;
      refresh rotates credentials and the next read succeeds without re-consent. Verify the client
      retains the replacement. Missing/expired/revoked refresh credentials fail meaningfully.
- [ ] **Repeated reconnect and fresh session:** deliberately reconnect twice, then read in both the
      original and fresh conversation/session. Legitimate reconnects recover; stale credentials remain
      rejected. Cover overlapping refresh/revocation ordering without disabling replay protection.
- [ ] **Useful failures:** cancelled/failed consent, callback or exchange failure, revoked credentials,
      missing project grants, insufficient scope, and server errors produce distinguishable, actionable
      outcomes. Recovery does not cycle through identical prompts with no new diagnostic information.
- [ ] **Permission boundaries:** `chatgpt_data_app` remains read-only search/fetch; general-profile
      tools follow approved scopes and project grants. Authentication repair grants no additional access.

Start future implementation validation with focused free tests in
[`oauth-connector.service.test.ts`](../apps/web/src/lib/server/agent-call/oauth-connector.service.test.ts),
[`oauth-credential-exchange.test.ts`](../apps/web/src/lib/server/agent-call/oauth-credential-exchange.test.ts),
[`mcp-connector.service.test.ts`](../apps/web/src/lib/server/agent-call/mcp-connector.service.test.ts), and
[`resource metadata tests`](../apps/web/src/routes/.well-known/oauth-protected-resource/mcp/buildos/server.test.ts).
Add regression cases at the diagnosed boundary; existing tests alone do not prove host recovery.
Run only relevant files through `pnpm --filter @buildos/web exec vitest run <files>`, respecting
the repo's worker caps and test-gate. Any paid run requires separate explicit approval per `AGENTS.md`.

**Exit condition:** a supported diagnosis and repair (or verified host-side resolution), plus recorded
acceptance evidence for the affected surface. Move the durable resolution receipt into feature or
operations docs, then remove this tracker and its index row under the Tasker maintenance rule.

## Resolution 2026-10-05 ~00:15 UTC — app path recovered; second failing path removed

Codex reaches BuildOS three ways. Sources: Codex desktop logs
(`~/Library/Logs/com.openai.codex/2026/10/`), Codex thread history, and read-only production queries.

| Path                                                                                 | Used by                          | State                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT app `asdk_app_6a59…` (`codex_apps` → `buildos.search`/`fetch`, OpenAI-held OAuth) | Local and cloud ("durable") threads | **Recovered.** Codex logged `App connect OAuth callback request completed` at 19:50:17 and 19:50:49. Earlier attempts at 00:54, 04:25 (×2), 04:26, 18:51, and 18:52 failed with OpenAI's “authorization is invalid or has expired” (the 42725 crash). ChatGPT later rotated refresh tokens unaided at **23:02:43** and **23:54:28**, with reads at **23:51:40** and **23:56:29**. |
| Local stdio bridge (`[mcp_servers.buildos]` in `~/.codex/config.toml`, static key)   | Local threads                    | Healthy throughout. Local `search_onto_*`/`get_onto_*` calls succeeded during the incident.                                                                                                                                                                                                                                                                                  |
| Plugin root `.mcp.json` → direct HTTP `https://build-os.com/mcp/buildos`             | Cloud threads, via the exec-server | **Never worked.** Codex auto-loads a plugin's root `.mcp.json`; locally the same-named stdio bridge hid it. Cloud threads tried it without credentials: `MCP server failed to start`. These match every `codex-mcp-client/0.0.0` “Missing authorization header” event from DJ's IP to the second (e.g., 19:19:39 ×2, 19:33:42, and 19:48:28).                             |

The original incident thread `01a0f002-863d-…` is a cloud thread. Its `codex_apps` server reports
`ready` after the fix.

**Fix (local, UNCOMMITTED):** Claude Code's MCP server now lives inline in
`plugins/buildos/.claude-plugin/plugin.json` (`claude plugin validate` passes), and the root
`plugins/buildos/.mcp.json` is deleted. The README explains the rule. The Codex plugin was
reinstalled from the repo (`codex plugin add buildos@personal`).

Codex app-server `plugin/read` proves the mechanism:

- A root `.mcp.json` under a probe name resolves as `mcpServers: ["buildos-probe"]`.
- After the fix, it resolves as `mcpServers: []` with the app intact.
- Codex ignores the Claude manifest's inline server.

**Left:**

- Quit and reopen Codex so cloud threads rediscover plugins.
- In the original cloud thread, run one BuildOS `search`. Then confirm that a new cloud thread
  shows no BuildOS startup failure. Production should log no new `codex-mcp-client` “Missing
  authorization header” events.
- Hygiene, not blocking: two older refresh tokens stay unrevoked: the 09-30 17:55 token and the
  10-04 19:50:16 token from the duplicate reconnect.
