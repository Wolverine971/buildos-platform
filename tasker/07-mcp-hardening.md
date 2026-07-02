<!-- tasker/07-mcp-hardening.md -->

# 07 — MCP `/mcp/buildos` hardening (Simon-grade)

**Priority:** P1 — gates Simon Willison / Hamel outreach
**Type:** Engineering (security)
**Sources:** `docs/specs/buildos-mcp-hardening-plan-2026-06-12.md`, `docs/specs/buildos-mcp-server-spec-2026-05-21.md`, `apps/web/src/routes/mcp/buildos/+server.ts`, memory `[[project_mcp_hardening_2026-06-12]]`

## State

`/mcp/buildos` is usable: supports `initialize`, `tools/list`, `tools/call`, `notifications/initialized`; OAuth connector routes + metadata exist; static `boca_` agent keys authenticate through the facade (with a test). Public docs already say MCP is ready. A hand-rolled hardening web route + tracker doc exist with a plan through Phase 3.

## ⚠️ Refresh 2026-07-01 — this file was stale; the work is MOSTLY DONE

Reassessed against `docs/specs/buildos-mcp-hardening-plan-2026-06-12.md` (Phases 0–3 marked DONE 2026-06-12/13) and recent commits. Original items 1–4, 6, 7 below are **already resolved**:

- Wildcard CORS gone (`mcpCorsHeaders()`/`isAllowedMcpOrigin()`, disallowed browser Origin → 403); GET → 405/401 per spec; protocol-version/`Accept`/`Content-Type` checks in; Phase 0 compliance tests written. Hardening lives in `mcp-connector.service.ts`; the route is a thin 28-line handler.
- One-command repro **committed** 2026-06-28: `apps/web/scripts/mcp-connector-repro.mjs`, wired as `pnpm mcp:repro` (`MCP_REPRO_BASE_URL`/`BUILDOS_AGENT_TOKEN`).
- stdio bridge exists: `packages/buildos-mcp-server` (Phase 3 done).

**Actually remaining:**

1. ~~Lethal-trifecta self-audit — review, commit.~~ ✅ Reviewed, updated, and committed 2026-07-01 together with `buildos-mcp-audit-fixes-2026-06-28.md`.
2. Simon/Hamel outreach — **unblocked.** The ask is "break this MCP server," not "look at BuildOS."

## ⚠️ Second audit round 2026-07-01 — fixed same day

Full re-audit (connector, auth chain, gateway scope enforcement, bridge, repro). Core properties
confirmed; fixes shipped: fail-closed `allowed_ops`, grant-bound OAuth token scope (re-consent no
longer widens outstanding tokens), all notifications → 202, `-32002` for resource misses,
`general`-profile discovery tools blocked at call time, bridge timeout + https enforcement +
honest README (package is unpublished — npx setup replaced with local build), repro coverage
extended, secret prefix scrubbed from auth-failure logs. Details:
`docs/specs/buildos-mcp-audit-fixes-2026-06-28.md` §Second audit round.

Deferred (catalogued, not blocking outreach): npm publish of the bridge, durable rate limiter,
HMAC-pepper token hashes, calendar-invitee exfil guard, per-grant profile binding, existence-oracle
normalization, paused-project visibility semantics.

<details><summary>Original loose ends (pre-refresh, kept for history)</summary>

1. Route uses `Access-Control-Allow-Origin: *` (wildcard CORS).
2. Authenticated GET returns a challenge-shaped 401 instead of the spec's authenticated 405.
3. Protocol version / `Accept` / `Content-Type` / `Host` / `Origin` validation pass not done.
4. **Phase 0 hardening tests** are the stated next step and not yet written.
5. Lethal-trifecta self-audit (untrusted brain dumps + private project data + outbound tools) not done.
6. No one-command repro for external testers.
7. No local stdio bridge package; resources/prompts not v1.

</details>

## Done when

A public/access-granted hardened MCP artifact + self-audit + repro exist; outreach to Simon is unblocked.
