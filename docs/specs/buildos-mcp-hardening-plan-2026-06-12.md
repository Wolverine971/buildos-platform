<!-- docs/specs/buildos-mcp-hardening-plan-2026-06-12.md -->

# BuildOS MCP Hardening — Status & Execution Plan

**Date:** 2026-06-12 (status refreshed 2026-07-01)
**Owner:** BuildOS (DJ)
**Status:** Phases 0–3 done. Self-audit + one-command repro shipped 2026-06-28 (see
`buildos-mcp-audit-fixes-2026-06-28.md`), plus `ping`/pagination/resources and OAuth lifecycle
fixes. Second audit round 2026-07-01 fixed scope-binding + spec-compliance findings. Simon/Hamel
outreach is unblocked.
**Supersedes the status sections of:** `docs/specs/buildos-mcp-server-spec-2026-05-21.md` (§4.2, §9)
**Closes loose end:** `docs/reports/buildos-loose-ends-inventory-2026-06-11.md` §4, §17 (rec to add an "MCP public-readiness" status doc)

This is the readiness tracker the loose-ends inventory said was missing: it distinguishes
"usable" (true today) from "Simon-grade / security-hardened" (the goal). The architecture
spec stays the source of truth for _what_ to build; this doc tracks _state_ and _sequence_.

## 1. Locked Decisions (2026-06-12)

| Decision (spec §11)            | Call                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1 Hand-rolled vs official SDK | **Hand-rolled** for the remote web route. Keep the custom JSON-RPC facade and add the missing checks by hand. (SDK still allowed for the Phase 3 stdio package — that's where SDK adoption is low-risk.)           |
| Scope of this push             | **Full spec through Phase 3**: Phase 0 tests → Phase 1 hardening → Phase 2 productized tool surface → Phase 3 local stdio bridge. Phases 4–5 (OAuth review polish, resources/prompts) remain out of scope for now. |

## 2. Status Snapshot

"Usable today" — a scoped caller can connect and call tools. "Simon-grade" — protocol-correct,
origin-validated, self-audited, with a one-command repro. We are at the former, not the latter.

| Phase      | Goal                               | State                 | Notes                                                                                                                                                      |
| ---------- | ---------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0    | Contract freeze + compliance tests | **DONE (2026-06-12)** | `tools/call` shaping, scope visibility, protocol errors, OAuth metadata resource all covered. 80 agent-call tests green.                                   |
| Phase 1    | Remote MCP hardening (hand-rolled) | **DONE (2026-06-12)** | Validated-origin CORS, origin allow-list (403), GET→405/401, Content-Type/Accept/protocol-version checks, security events. 25 connector tests green.       |
| Phase 2    | Productized tool surface           | **DONE (2026-06-13)** | Connector profiles (general/chatgpt_data_app/local_admin via `?profile=`), read-only `search`/`fetch`, discovery off by default. 32 connector tests green. |
| Phase 3    | Local stdio bridge package         | **DONE (2026-06-13)** | `packages/buildos-mcp-server` (`@buildos/mcp-server`) ships: SDK-free core + stdio entrypoint. 12 tests, typecheck + build + stdio smoke all green.        |
| Self-audit | Lethal-trifecta threat model       | **DONE (2026-06-28)** | `buildos-mcp-lethal-trifecta-self-audit-2026-06-28.md`.                                                                                                           |
| Repro      | One-command repro                  | **DONE (2026-06-28)** | `apps/web/scripts/mcp-connector-repro.mjs` (`pnpm --filter @buildos/web mcp:repro`).                                                                                                                                     |

### What is actually true in code today

- `apps/web/src/routes/mcp/buildos/+server.ts` — thin route delegating to the connector service.
- `mcp-connector.service.ts` supports `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/templates/list`, `resources/read`, and accepts all id-less `notifications/*` with 202.
- OAuth challenge on unauthenticated requests ✅
- Static BuildOS agent key (`boca_`) fallback auth ✅ — the only net-new code since the 2026-05-21 spec.
- Tool annotations derived from read/write policy ✅
- No `@modelcontextprotocol/sdk` dependency anywhere in the repo.

## 3. Phase 0 — Compliance Tests ✅ DONE (2026-06-12)

Foundational and safe: locks current behavior before we change anything in Phase 1.
Files: `apps/web/src/lib/server/agent-call/mcp-connector.service.test.ts` (4 → 14 tests) +
new `apps/web/src/routes/.well-known/oauth-protected-resource/mcp/buildos/server.test.ts` (3 tests).
Connector test now mocks `executeBuildosAgentGatewayTool` + `createMcpCallSession` (via `importActual`)
to isolate the MCP protocol layer from gateway/DB internals.

- [x] `tools/call` of a read tool through a scoped static caller returns `content` + `structuredContent`, and the gateway is wired with the right `toolName`/`arguments`/`scope`/`callerId`/`callSessionId`.
- [x] `tools/call` failure (`ok:false`/`error`) sets `isError: true`; missing `params.name` → `-32602`.
- [x] Read-only grant: write bundle (`create_onto_task`, `update_onto_task`, `create_onto_document`, `update_onto_document`) absent from `tools/list`; every exposed tool annotated `readOnlyHint: true`.
- [x] Write grant: default write bundle present in `tools/list`.
- [x] Malformed JSON-RPC → `-32700` (parse) / `-32600` (no method). Batch array → `-32600`. Authenticated unknown method → `-32601`.
- [x] `notifications/initialized` with no `id` → HTTP 202, empty body, no gateway call.
- [x] OAuth protected-resource metadata returns exact `resource` = `https://build-os.com/mcp/buildos` (origin-derived), `scopes_supported` includes `buildos.write`, `bearer_methods_supported: ['header']`.

**Acceptance — met:** a scoped caller can list AND call a read tool in tests; protocol errors are JSON-RPC shaped; unauth still challenges. Full `src/lib/server/agent-call/` suite green (80 tests).

## 4. Phase 1 — Remote Hardening ✅ DONE (2026-06-12)

All in `mcp-connector.service.ts` + `+server.ts`. Hand-rolled. This is the Simon unlock.
Transport guards run **before** auth/parse so a rebinding attacker never reaches the DB.

- [x] **CORS**: all 3 wildcard sites gone. `mcpCorsHeaders()` echoes the request `Origin` only when allow-listed, adds `Vary: Origin` + `Access-Control-Expose-Headers: WWW-Authenticate, MCP-Protocol-Version, Mcp-Session-Id`. OPTIONS allows `Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id`.
- [x] **Origin allow-list**: `isAllowedMcpOrigin()` (exported, unit-tested) — `build-os.com` + `*.build-os.com` https only; localhost only when the server origin is loopback; absent Origin (cloud callers) allowed. Disallowed browser Origin → `403`, no ACAO, logged. (Host validation delegated to Vercel; over-validating Host would break preview/staging domains — noted intentionally.)
- [x] **GET behavior**: authenticates first; authenticated GET → `405` (`Allow: POST, OPTIONS`); unauthenticated → `401` challenge with discovery body. `admin`/`request`/`securityEventOptions` now plumbed into GET.
- [x] **`Content-Type`**: non-`application/json` POST → `415`.
- [x] **`Accept`**: must include `application/json`, `text/event-stream`, or `*/*` (missing tolerated) → else `406`.
- [x] **`MCP-Protocol-Version`**: supported set `{2025-06-18, 2025-03-26, 2024-11-05}`; unsupported → `400`; absent → back-compat.
- [x] **Security events**: `logSecurityEventAsync` on origin/protocol rejection (`mcp_origin_rejected`, `mcp_protocol_rejected`).
- [x] v1 stateless / emits no `Mcp-Session-Id` — documented in the GET handler comment.

**Acceptance — met:** no wildcard CORS; tokens never in query params (bearer header only, unchanged); browser-origin attack patterns rejected with 403 before auth; OAuth discovery/challenge path intact; `tools/list` still works for header-auth callers. 25 connector tests + 91 agent-call tests green; typecheck clean.

## 5. Phases 2 & 3 (after critical path)

**Phase 2 — Productized tool surface** ✅ DONE (2026-06-13). Implemented entirely in the connector layer (`mcp-connector.service.ts`) — the bearer agent-call gateway is untouched; `search`/`fetch` are thin read-only wrappers over existing read tools resolved via `getToolRegistry().ops[op].tool_name`.

- [x] Profile-aware tool filtering via `?profile=`: `general` (default — curated tools per grant, **no** discovery tools per D2), `chatgpt_data_app` (only `search`/`fetch`), `local_admin` (full surface incl. discovery).
- [x] `search`/`fetch` read-only compatibility surface (D3/D4): `search({query})` → `{results:[{id:"<type>:<uuid>", title, url, text}]}`; `fetch({id})` → normalized `{id, title, text, url, metadata}`. Both run under a `readOnlyScopeFrom()` projection so the data profile can't write even with a write grant.
- [x] Annotations on `search`/`fetch` (`readOnlyHint: true`); existing `toMcpTool` annotation logic retained for direct tools.
- [x] Internal-field stripping already handled in the gateway (`stripInternalEntityFields` removes `search_vector`); `fetch` only surfaces curated fields.
- [x] `dry_run` + `idempotency_key` remain on direct writes (unchanged gateway path).

Deferred (Phase 4 territory, not blocking): the full 7-profile taxonomy and OAuth-consent-driven profile selection — `?profile=` is the lightweight stand-in.

**Phase 3 — Local stdio bridge** ✅ DONE (2026-06-13). New package `packages/buildos-mcp-server` published name `@buildos/mcp-server` (D6). Structured as an SDK-free, unit-tested core + a thin SDK entrypoint so the testable logic never needs the SDK installed.

- [x] Scaffolded with tsup (esm, node20) + vitest; `@modelcontextprotocol/sdk@^1.12` added (resolved 1.29). `bin: buildos-mcp-server`, shebang preserved in `dist/index.js`.
- [x] Env config in `config.ts`: `BUILDOS_BASE_URL` (default build-os.com), `BUILDOS_AGENT_TOKEN` (required), `BUILDOS_MCP_PROFILE` (validated against the 3 profiles). Secrets from env only.
- [x] `client.ts` proxies `initialize`/`tools/list`/`tools/call` to `/mcp/buildos` over HTTPS with a single bearer header + `?profile=`; `index.ts` wires the SDK `Server` + `StdioServerTransport`; diagnostics to stderr only.
- [x] README with Claude Desktop / Cursor / Codex / generic `npx -y @buildos/mcp-server` setup.
- [x] Verified: typecheck clean, `tsup` build succeeds, 12 unit tests green, missing-token exits 1, live `initialize` over stdin returns a valid JSON-RPC response.

Not done (release-time, Phase 4): actually publishing to npm (`private: true` for now) and the DCR/CIMD connector-review polish.

## 6. Remaining Sub-Decisions (recommended defaults — proceed unless overridden)

These don't block Phase 0/1. Defaults chosen so work can proceed; override anytime.

- **D1 (Phase 1) Origin/Host allow-list contents.** _Default:_ allow `https://build-os.com` and `https://*.build-os.com`; allow requests with **no** browser `Origin` (server-side cloud callers); reject any other explicit browser `Origin`. Localhost only in dev.
- **D2 (§11 #3) Discovery tools in default remote profile?** _Default:_ **No** — cloud connectors get a curated direct read surface; discovery tools (`tool_search`/`tool_schema`/`skill_load`) only in a `local_admin`/dev profile.
- **D3 (§11 #4) `search`/`fetch` always present?** _Default:_ **Only** in the ChatGPT/data-app read-only profile, not the default surface.
- **D4 (§11 #5) Calendar tools in default read scope?** _Default:_ **Yes** for read; gate write-calendar behind explicit write grant. (No separate `buildos.calendar` scope in v1.)
- **D5 (§11 #6) Write-grant default bundle.** _Default:_ docs + tasks only ("Author docs + tasks"); full write requires explicit selection.
- **D6 (§11 #2) Stdio package name.** _Default:_ `@buildos/mcp-server`.
- **D7 (§11 #7) Resources/prompts.** Out of scope (Phase 5). Tool-only through Phase 3.

## 7. Critical Path to "Break this MCP server" (Simon/Hamel)

Phases 2–3 are scoped in but **not** on the outreach critical path. The Simon unlock was:

1. ~~**Phase 0** compliance tests (foundation).~~ ✅ done.
2. ~~**Phase 1** hardening (the real security work).~~ ✅ done.
3. ~~**Lethal-trifecta self-audit** doc.~~ ✅ done 2026-06-28 — `buildos-mcp-lethal-trifecta-self-audit-2026-06-28.md`.
4. ~~**One-command repro**.~~ ✅ done 2026-06-28 — `apps/web/scripts/mcp-connector-repro.mjs` (`pnpm --filter @buildos/web mcp:repro`).

All four exist. The ask to Simon/Hamel is "break this," not "look at BuildOS."

Note on D7: MCP **resources** shipped 2026-06-28 (ahead of the original Phase 5 deferral) —
`resources/list` / `resources/read` over START HERE project docs, scope-enforced via the read-only
fetch path. `prompts` remain out of scope.

## 8. Status 2026-07-01 — second audit round

A full re-audit (auth chain, gateway scope enforcement, bridge, repro) confirmed the core
properties hold and fixed:

- **Fail-closed `allowed_ops`**: a malformed/stale stored allowlist now narrows instead of falling
  back to the full mode-default op surface (`shared-agent-ops/policy.ts`).
- **Grant-bound token scope**: OAuth MCP auth now derives scope from the grant the token was
  minted under, clamped by the token's immutable scope string — re-consent no longer silently
  widens outstanding tokens (`oauth-connector.service.ts`).
- **Transport spec compliance**: all client notifications (not just `notifications/initialized`)
  → 202; `resources/read` miss → `-32002`; `general`-profile discovery tools blocked at call time,
  not just hidden from `tools/list`.
- **Bridge**: 60s request timeout; `https` required for non-loopback base URLs; README setup now
  matches the unpublished (private) package reality.
- **Repro**: probes notifications→202, authenticated GET→405, explicit batch-rejection body; never
  invokes a non-read tool with a live token.
- Auth-failure security events no longer log secret key characters (`credentialPrefix`).

Remaining (deferred, tracked in `buildos-mcp-audit-fixes-2026-06-28.md` §Still deferred): npm
publish of the bridge, durable rate limiter, HMAC-pepper token hashes, calendar-invitee exfil
guard, per-grant profile binding, FORBIDDEN/NOT_FOUND existence-oracle normalization,
paused-project visibility semantics, rate limiting on `/mcp/buildos` itself.
