<!-- docs/specs/buildos-mcp-audit-fixes-2026-06-28.md -->

# BuildOS MCP Server — Audit Findings & Fix Tracker

**Date:** 2026-06-28
**Owner:** BuildOS (DJ)
**Audit scope:** Remote MCP connector (`/mcp/buildos`), OAuth 2.1 authorization server, tool gateway, data model, stdio bridge.
**Companion docs:**

- `docs/specs/buildos-mcp-hardening-plan-2026-06-12.md` — prior hardening tracker (Phases 0–3 done)
- `docs/specs/buildos-mcp-server-spec-2026-05-21.md` — architecture source of truth
- `docs/specs/buildos-mcp-lethal-trifecta-self-audit-2026-06-28.md` — threat model (Fix #3)

This tracker captures the findings from the 2026-06-28 full audit and tracks the fixes.

## Overall verdict

Strong, security-conscious implementation. The two hardest things are done right: **RFC 8707
resource-indicator audience binding** (confused-deputy defense) and **DNS-rebinding origin
defense**. Remaining gaps are a short list of OAuth lifecycle edge cases, missing rate limiting,
and two process deliverables (self-audit + repro) that were scoped but never shipped.

## Fix list (prioritized)

| #   | Sev   | Item                                                               | Status             |
| --- | ----- | ------------------------------------------------------------------ | ------------------ |
| 1   | 🔴 P1 | Revoke the whole refresh-token **family** on reuse detection       | ✅ DONE 2026-06-28 |
| 2   | 🔴 P1 | Rate-limit `/oauth/token` + `/oauth/register`                      | ✅ DONE 2026-06-28 |
| 3   | 🔴 P0 | Lethal-trifecta self-audit doc                                     | ✅ DONE 2026-06-28 |
| 4   | 🔴 P0 | One-command repro script                                           | ✅ DONE 2026-06-28 |
| 5   | 🟡 P2 | Echo client's requested `protocolVersion` in `initialize`          | ✅ DONE 2026-06-28 |
| 6   | 🟡 P2 | `timingSafeEqual` for client-secret comparison                     | ✅ DONE 2026-06-28 |
| 7   | 🟡 P2 | Cron-reap expired auth codes / access tokens                       | ✅ DONE 2026-06-28 |
| 8   | 🟢 P3 | Add `ping`; declare `outputSchema`; `tools/list` cursor pagination | ✅ DONE 2026-06-28 |
| 9   | 🟢 P3 | Expose START HERE / project docs as MCP **resources**              | ✅ DONE 2026-06-28 |

---

## Findings detail

### 1. 🔴 P1 — Refresh-token reuse did not revoke the family

**Before:** `exchangeOAuthRefreshToken` (`oauth-connector.service.ts`) rejected an already-used or
revoked refresh token, but did **not** revoke the rest of the `family_id` chain or the live
descendant token. The schema already stored `family_id` + `rotated_from_id` but never used them
for breach response. OAuth 2.1 / RFC 9700 §4.14.2: detecting reuse of a rotated refresh token
signals theft and you MUST revoke the entire family (including the currently-active token).

**Fix:** On detecting a presented refresh token that is already `used_at`/`revoked_at` (genuine
reuse, NOT plain expiry), and on losing the atomic rotation race, revoke the full family +
grant + access tokens + caller and emit a high-severity `agent.oauth.refresh.reuse_detected`
security event. Pure expiry still rejects without nuking the family.

### 2. 🔴 P1 — No rate limiting on public OAuth endpoints

**Before:** The global rate-limit middleware is commented out (`hooks.server.ts`). `/oauth/register`
(open Dynamic Client Registration, unauthenticated) and `/oauth/token` had no per-IP limit —
unbounded client-table spam and token-exchange abuse.

**Fix:** Added `oauth-rate-limit.ts` (per-IP, backed by the existing `utils/rate-limiter`
singleton) and wired it into the `token` and `register` POST handlers. Returns `429` with
`Retry-After` + `X-RateLimit-*` headers. Limits are env-overridable.

### 3. 🔴 P0 — Lethal-trifecta self-audit doc (was missing)

**Before:** The hardening plan named this the #1 critical-path item to the "have Simon/Hamel break
it" outreach. It never existed.

**Fix:** `docs/specs/buildos-mcp-lethal-trifecta-self-audit-2026-06-28.md`.

### 4. 🔴 P0 — One-command repro (was missing)

**Before:** Hardening plan's #2 critical-path item. The protocol/transport assertions existed only
as unit tests; nothing packaged them for an outside reviewer.

**Fix:** `apps/web/scripts/mcp-connector-repro.mjs` + `pnpm --filter @buildos/web mcp:repro`. Runs
metadata checks, the unauthenticated OAuth challenge, and the negative protocol probes against any
deployed/local URL; optionally runs authenticated `initialize`/`tools/list`/`tools/call` when a
token is supplied.

---

### 5. 🟡 P2 — `initialize` now negotiates the protocol version

**Before:** `dispatchMcpMethod` hardcoded `protocolVersion: '2025-06-18'`, ignoring the client's
requested version (spec: a server MUST echo the requested version when supported).

**Fix:** `initialize` reads `params.protocolVersion`; if it's in `SUPPORTED_MCP_PROTOCOL_VERSIONS`
it's echoed back, otherwise the server's latest (`2025-06-18`) is returned. Covered by two new
connector tests.

### 6. 🟡 P2 — Constant-time secret comparison

**Fix:** Added `timingSafeStringEqual` (length-guarded `crypto.timingSafeEqual`) and used it for both
the client-secret hash check (`validateTokenEndpointClient`) and the PKCE verifier check
(`exchangeOAuthAuthorizationCode`), replacing `!==`.

### 7. 🟡 P2 — Expired OAuth artifacts are reaped daily

**Fix:** Added `reapExpiredOAuthArtifacts(admin)` (deletes auth codes / access tokens / refresh
tokens past `expires_at`; refresh tokens are deleted only when expired, never merely used/revoked, so
reuse detection keeps working) and wired it into the daily `security-events-retention` cron. Skipped
on dry runs; reap counts surface in the cron response + `cron_logs`.

### 8. 🟢 P3 — `ping`, `outputSchema`, `tools/list` pagination

**Fix:**

- Added the `ping` method (returns `{}`).
- `search`/`fetch` declare precise `outputSchema`; direct tools declare a permissive object schema
  (every tool returns a JSON object as `structuredContent`).
- `tools/list` and `resources/list` support opaque base64url cursor pagination (`MCP_LIST_PAGE_SIZE`
  100); an invalid cursor → `-32602`. New tests cover the cursor rejection.

### 9. 🟢 P3 — MCP resources

**Fix:** Advertised the `resources` capability and added:

- `resources/list` — each in-scope project as a `buildos://project/<id>` START HERE resource
  (scope-filtered via the grant's `allowed_project_ids`).
- `resources/read` — reads any `buildos://project/<id>` or `buildos://document/<id>` URI, reusing the
  read-only `runMcpFetch` path (so scope + read-only projection are enforced identically).
- `resources/templates/list` — returns an empty list so clients don't error.
- The stdio bridge (`@buildos/mcp-server`) proxies `resources/list` + `resources/read` and advertises
  the `resources` capability, so local clients (Claude Desktop, Cursor) see resources too.

---

## Second audit round — 2026-07-01

A full re-audit (connector, auth chain, gateway scope enforcement, stdio bridge, repro script)
confirmed the core properties hold (read-only enforcement is double-layered, `project_ids`
filtering covers every gateway handler examined, RFC 8707 / PKCE / refresh-family-burn all
verified) and produced a second fix round:

| #   | Sev   | Item                                                                                   | Status             |
| --- | ----- | -------------------------------------------------------------------------------------- | ------------------ |
| 10  | 🔴 P1 | `extractAllowedOpsFromPolicy` failed **open**: malformed/stale stored allowlist fell back to the full mode-default op surface. Now narrows per-entry, never widens. | ✅ DONE 2026-07-01 |
| 11  | 🔴 P1 | OAuth token scope derived from the shared caller policy (overwritten on every re-consent) instead of the grant. Now grant-bound + clamped by the token's immutable scope string — a read-only-era token can never become read_write. | ✅ DONE 2026-07-01 |
| 12  | 🟡 P2 | Only `notifications/initialized` got the spec's 202; `notifications/cancelled` etc. got a 400 error. All id-less `notifications/*` → 202. | ✅ DONE 2026-07-01 |
| 13  | 🟡 P2 | `general` profile hid discovery tools from `tools/list` but still executed them via `tools/call`. Now blocked at call time. | ✅ DONE 2026-07-01 |
| 14  | 🟡 P2 | Bridge README instructed `npx -y @buildos/mcp-server`, which cannot resolve while the package is `private`. Local-build setup documented. | ✅ DONE 2026-07-01 |
| 15  | 🟢 P3 | `resources/read` miss returned `-32003`; MCP reserves `-32002` for resource-not-found. | ✅ DONE 2026-07-01 |
| 16  | 🟢 P3 | Bridge: no fetch timeout (hung remote hung the client); plain `http://` accepted for non-loopback hosts (cleartext key). 60s timeout + https enforcement. | ✅ DONE 2026-07-01 |
| 17  | 🟢 P3 | Repro gaps: notifications→202 and authenticated GET→405 unprobed; batch probe asserted only the status; `tools/call` fallback could invoke an arbitrary (write) tool. All fixed; non-read tools are never invoked. | ✅ DONE 2026-07-01 |
| 18  | 🟢 P3 | Auth-failure security events logged 7 chars of secret key body (`credentialPrefix: token.slice(0,12)`). Now logs only the scheme prefix. | ✅ DONE 2026-07-01 |

Newly catalogued, deferred with rationale:

- **Cross-user existence oracle** — FORBIDDEN vs NOT_FOUND distinguishes whether a leaked UUID
  exists in another account (no content leaks). Normalizing to NOT_FOUND for out-of-scope rows is
  a gateway-wide change; deferred.
- **Paused projects** are hidden from list/search enumeration but remain readable/writable by
  direct id. Product-semantics decision; deferred.
- **No rate limiting on `/mcp/buildos` itself** (auth brute force is cryptographically infeasible;
  DB/log amplification only). Fold into the durable-limiter work.

## Still deferred (future work, not in scope)

- **No `prompts` capability** — tool + resource surface only.
- **Distributed/durable rate limiter** — the per-IP limiter is in-memory per serverless instance.
- **HMAC-pepper token hashes** — defense-in-depth so a DB leak alone can't match token hashes.
- **No external calendar invitees from agent-call writes** — close the T3 exfil channel (see
  self-audit doc).
- **Per-grant profile binding** — move `?profile=` out of the query string into the grant.
