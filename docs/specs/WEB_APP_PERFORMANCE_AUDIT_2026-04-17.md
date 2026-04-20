---
title: BuildOS Web App Performance Audit
status: draft
owner: engineering
date: 2026-04-17
scope: apps/web (SvelteKit 2 + Svelte 5, Vercel nodejs22.x)
related:
    - packages/smart-llm
    - packages/shared-types
    - supabase/migrations
path: docs/specs/WEB_APP_PERFORMANCE_AUDIT_2026-04-17.md
---

# BuildOS Web App Performance Audit — 2026-04-17

A complete, evidence-based performance review of the SvelteKit web application, covering pages, API endpoints, SQL/database patterns, bundle/client perf, and infrastructure/integrations. Findings are grounded in file:line references and ranked by impact.

> **How to use this spec:** Read Section 1 for the TL;DR and the prioritized fix list. Each subsequent section contains the evidence behind the summary. The "Recommended workstreams" in Section 9 converts findings into actionable batches.

---

## 1. Executive Summary

### Health score (subjective, evidence-based)

| Area                                    | Grade | One-line verdict                                                                                                           |
| --------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| Page loads / SSR strategy               | C+    | Root layout + several pages run sequential awaits; heavy admin pages have no server load                                   |
| API endpoints                           | C     | Several wide `select('*')`, missing limits, sequential auth; a few synchronous LLM calls                                   |
| SQL / database                          | B−    | Recent migrations (20260426+) are well-indexed; a few RLS `EXISTS` subqueries, expensive exact counts, and missing indexes |
| Bundle / client                         | B     | Good lazy-loading, clean Tailwind; two mega-modals (4k+ lines) and hero images 1.3–1.9 MB                                  |
| Caching / infra                         | C−    | No distributed cache, no prompt caching, no SWR headers, minimal in-memory cache                                           |
| Integrations (Calendar, Stripe, Worker) | B     | Worker offload is solid; Google Calendar has some N+1 risk; no worker retries                                              |

### Top 10 prioritized fixes (ranked by impact × ease)

Status key: ☐ open · ✅ done · ⏭️ deferred

> **Progress update — 2026-04-17:** Items 2 (partial), 5, 6, 7, 8, 9, 10 complete. Items 1, 3, 4 deferred with the agentic-chat workstream.
>
> **Progress update — 2026-04-18 (WS3 batch):** Workstream 3 (Query Projection & Limits) shipped end-to-end. All non-chat wide-select endpoints from §3.3 narrowed; default limits / clamps applied to remaining unbounded fetches in §3.5; `get_onto_project_summaries_v1` gained an optional `p_limit`; `get_project_full` now returns `task_assignees` and `task_last_changed_by` maps so the `/projects/[id]` hot path and fallback drop two N+1 round-trips. See "WS3 completion notes" at the end of Section 9 for file-level changes.
>
> **Progress update — 2026-04-18 (WS5 indexes + WS1 leftovers):** Migration `20260501000003` adds the four P2 composite indexes from §4.2 (`project_notification_batches`, `onto_braindumps`, `voice_note_groups`, `billing_accounts`); all `CREATE INDEX IF NOT EXISTS`, additive only. `/blogs/+page.ts` now prerenders. `Cache-Control` headers added to `/api/templates` (private 5min + 30min SWR) and `/api/public/projects` (public 1h + 1d SWR). Pricing prerender skipped — its server load reads session.

1. ☐ **Add prompt caching to agentic chat & daily-brief system prompts.** 10–50% token savings per turn; no user-visible risk. `packages/smart-llm/src/moonshot-client.ts:109-110` supports `prompt_cache_key` but no caller passes it.
2. ✅ **Narrow wide `select('*')` in daily-brief history and brief-templates endpoints.** Done 2026-04-17:
    - `api/daily-briefs/history/+server.ts`: dropped `llm_analysis` (unbounded 5–50 KB LLM output) from the list select; swapped `count: 'exact'` → `'estimated'`; clamped `limit` to `[1, 100]`. Server-side ILIKE still scans `llm_analysis` in the WHERE clause, but callers now receive a preview-shaped payload. Full analysis remains available via `/briefs?brief_id=...`.
    - `api/brief-templates/project/+server.ts` (GET list): dropped `context_snapshot` (generation-time JSONB, never read by any web caller). Detail endpoint at `/[id]` still returns `*`.
    - Scope notes: (a) `routes/briefs/+server.ts` left `*` — the brief hot path legitimately displays `executive_summary` + `llm_analysis` and the list view filters client-side on `summary_content` / `insights` (verified at `briefs/+page.svelte:454-461`). (b) Chat-history narrowing remains with the agentic-chat workstream.
    - Extended 2026-04-18 (WS3): five additional non-chat list endpoints narrowed — see §3.3 status column.
3. ⏭️ **Add server `load()` to `/admin/chat` (4,815 lines) and `/admin/beta` (2,663 lines).** Deferred — part of the agentic-chat / admin workstream.
4. ⏭️ **Add `CREATE INDEX idx_chat_messages_session_created ON chat_messages(session_id, created_at ASC)`** — deferred with the agentic-chat workstream.
5. ✅ **Extend root-layout billing-context TTL (20s → 5 min) and register `depends('app:billing')`** (`apps/web/src/routes/+layout.server.ts`). The in-memory cache now lives in `$lib/server/billing-context-cache.ts`, where mutation sites can call `invalidateBillingContextCache(userId)` before the client invalidates `app:billing`. Root-layout queries were already parallelized via `Promise.all`.
6. ✅ **Parallelize `hasAnyProjects()`** in `apps/web/src/routes/+page.server.ts`. Member-count and owner-count queries now run in `Promise.all` after `ensureActorId`. (Streaming `getUserDashboardAnalytics()` still open as a follow-up.)
7. ✅ **Fix N+1 in `/api/onto/projects/[id]/full` (hot path) and the `/projects/[id]` page-server fallback.** `decorateMilestonesWithGoals`, the `doc_structure` fetch, `fetchTaskAssigneesMap`, and `fetchTaskLastChangedByActorMap` now run in a single `Promise.all`. Baking into the `get_project_full` RPC remains a larger follow-up.
8. ✅ **Batch `trial-reminders` cron query** (`/api/cron/trial-reminders`). Replaced per-user `trial_reminders` lookup with one `.in('user_id', userIds)` pre-fetch + in-memory `Set` keyed by `user_id|reminder_type`.
9. ✅ **Swap `count: 'exact'` → `'estimated'`** on the four `billing_accounts` counts (frozen, total, paid, power) in `billing-ops-monitoring.ts`. The four windowed counts on `billing_state_transitions` / `user_activity_logs` were left as `exact` (time-range filters don't benefit from `pg_class` estimates).
10. ✅ **Hero images already compressed & swapped.** `dj-wayne-profile.jpg` (1.9 MB) → `s-dj-wayne-profile.webp` (50 KB) is referenced from `contact`, `investors`, and `about`. `BuildOS.png` / `brain-bolt-big.png` originals remain in `static/` but have no `src/` references (safe to delete in a future cleanup).

### Expected cumulative impact

- **p50 API latency:** −30–40% after fixes #1, #2, #4, #5.
- **Dashboard / admin TTI:** −1.5–3s after #3, #6.
- **LLM cost:** −15–30% after #1 (prompt caching).
- **First paint on marketing pages:** −400–900ms after #10.

---

## 2. Page / Route Performance

### 2.1 Hooks & root layout (hot path, every request)

**File:** `apps/web/src/hooks.server.ts` (646 lines)

| Concern                                                                         | Evidence                                                | Recommendation                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `safeGetSession()` does 3 sequential awaits: getSession → getUser → DB user row | `hooks.server.ts:229-312`                               | Promise memoization is present ✓. Keep but cache `is_admin` in `locals` to avoid downstream repeat queries. |
| Consumption gate RPC pre- **and** post-request on mutations                     | `hooks.server.ts:403-515` (pre: 421-426; post: 486-492) | Parallelize pre-check with early body-parse; skip post-check on non-2xx.                                    |
| Auto-upgrade creates a new admin Supabase client on every eligible request      | `hooks.server.ts:533-562`                               | Pool a singleton admin client; current pattern risks connection exhaustion.                                 |
| Calendar-token lazy-load is route-gated ✓                                       | `hooks.server.ts:314-370`                               | Keep.                                                                                                       |

**File:** `apps/web/src/routes/+layout.server.ts` (213 lines)

- Three parallel queries (`Promise.all`) for pending invites, onboarding %, billing context. Parallelization is good — but cache TTLs are 20s / 60s / 20s, so almost every navigation pays the full 60–150ms.
- **Fix:** extend billing-context TTL to 5 min and invalidate on mutation via `depends()`.
- No early return for unauthenticated users — still assembles baseData.

### 2.2 Top 10 slowest-likely pages

| #   | Route                              | File:Line                                                                 | Why it's slow                                                                   | Fix                                                            |
| --- | ---------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | `/admin/chat`                      | `src/routes/admin/chat/+page.svelte:1-4815`                               | No server load; all data via `onMount`; 60+ computed props                      | Add `+page.server.ts`, stream KPI metrics, virtualize tables   |
| 2   | `/projects/[id]`                   | `src/routes/projects/[id]/+page.server.ts:257-333`; `+page.svelte:1-2046` | Fallback path has N+1 for task assignees + last-changed-by                      | Bake assignees into `get_project_full` RPC                     |
| 3   | `/` (dashboard)                    | `src/routes/+page.server.ts:89-124`                                       | `getUserDashboardAnalytics()` blocks; `hasAnyProjects()` is two sequential RPCs | Stream analytics; parallelize; early-exit on first-touch users |
| 4   | `+layout.server.ts` (all requests) | `src/routes/+layout.server.ts:66-212`                                     | Short cache TTL on billing context                                              | 5-min TTL + `depends()` invalidation                           |
| 5   | `/projects`                        | `src/routes/projects/+page.server.ts:30-69`                               | `ensureActorId()` blocks count queries; no pagination on streamed summaries     | Parallelize; paginate (limit 50)                               |
| 6   | `/admin/errors`                    | `+page.server.ts:31-33`; `+page.svelte:1-1482`                            | Unvirtualized list of errors; likely missing `(resolved, created_at)` index     | Virtualize; add index; server-side filtering                   |
| 7   | `/time-blocks`                     | `+page.server.ts:14-31`                                                   | Sequential: actor → projects → calendar-conn                                    | `Promise.all([...])`; cache calendar-conn                      |
| 8   | `/blogs`, `/blogs/[category]`      | `+page.server.ts:6`; `[category]/+page.server.ts:14`                      | Reads all MD files on every request; prerender commented out                    | Uncomment `export const prerender = true` or build-time cache  |
| 9   | `/projects/[id]/tasks/[task_id]`   | `+page.server.ts:24-46`                                                   | Two internal `fetch()` calls (project + task APIs)                              | Single RPC returning project+task+linked entities              |
| 10  | `/admin/beta`                      | `+page.svelte:1-2663`                                                     | No server load; client-side fetch waterfall                                     | Add `+page.server.ts`                                          |

### 2.3 Streaming & SSR decisions

- **Good streaming:** `fetchProjectSummaries()` returned as promise in `/projects` (`+page.server.ts`). ✓
- **Missing streaming:** `getUserDashboardAnalytics()` (home), task lists in `/projects/[id]` fallback, admin dashboards.
- **Prerender gaps:** `/blogs`, `/pricing` have `// export const prerender = true` commented out (`src/routes/blogs/+page.ts`, `src/routes/pricing/+page.ts`) but are listed in `svelte.config.js` entries.

### 2.4 Oversized `+page.svelte` files

| File                                         | Lines | Issue                                           |
| -------------------------------------------- | ----- | ----------------------------------------------- |
| `admin/chat/+page.svelte`                    | 4,815 | No SSR load; 60+ computed props                 |
| `admin/beta/+page.svelte`                    | 2,663 | No SSR load                                     |
| `admin/+page.svelte`                         | 2,228 | Multi-tab dashboard, no SSR                     |
| `projects/[id]/+page.svelte`                 | 2,046 | Heavy inline state; mitigated by skeleton-first |
| `projects/[id]/tasks/[task_id]/+page.svelte` | 1,835 | No virtualization                               |
| `admin/errors/+page.svelte`                  | 1,482 | No virtualization                               |
| `projects/+page.svelte`                      | 1,423 | Client-side filter/sort scales poorly           |

---

## 3. API Endpoint Performance

### 3.1 Top 15 slowest-likely endpoints

| #    | Endpoint                                               | File                                                   | Why slow                                                                                      | Fix                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `POST /api/agent/v2/stream`                            | `api/agent/v2/stream/+server.ts`                       | 8 sequential tool rounds; per-request context cache rebuild; no disconnect check              | Limit rounds to 3–4; parallelize independent tools; check `request.signal.aborted`; persist logs async                                                                                                                                                                                                          |
| 2 ✅ | `GET /api/admin/chat/sessions/[id]`                    | `api/admin/chat/sessions/[id]/+server.ts:~74-150`      | 8-way `Promise.all` but each query is `*` on wide tables, no limits                           | ~~Narrow selects; `.limit(50)`; pre-aggregate counts on `chat_sessions`~~ **Done 2026-04-17:** admin flag cached via `user.is_admin`; defensive `.limit()` caps (500–5000) on all 8 parallel queries. Pre-aggregate counts deferred (WS4).                                                                      |
| 3 ✅ | `GET /api/admin/chat/sessions`                         | `api/admin/chat/sessions/+server.ts:91-197`            | Admin re-check DB, `count: 'exact'`, 7 parallel full-scan aggregators, ILIKE on multiple cols | ~~Cache admin flag in locals; single RPC for aggregates; GIN index for search~~ **Done 2026-04-17:** admin flag cached via `user.is_admin` (removed `admin_users` roundtrip). Single-RPC aggregates + GIN deferred (WS4).                                                                                       |
| 4 ✅ | `GET /api/admin/users/[userId]/activity`               | `api/admin/users/[userId]/activity/+server.ts:~100+`   | Sequential queries, no limits on audit logs, client-side sort                                 | ~~DB timeline RPC; `.limit(20)`; index `(user_id, created_at DESC)`~~ **Done 2026-04-17:** parallelized member+owned-projects fetch; `.limit(100)` + ordering on `ontology_daily_briefs` / `task_calendar_events` / `chat_sessions`; narrowed heavy selects. Timeline RPC + composite index deferred (WS4/WS5). |
| 5 ✅ | `GET /api/admin/users`                                 | `api/admin/users/+server.ts:118-197`                   | Initial `count: 'exact'` + 13 follow-up queries per page                                      | ~~Materialized view `user_ontology_stats`; swap to `'estimated'`~~ **Done 2026-04-17:** `count: 'exact' → 'estimated'`. Materialized view deferred (WS4).                                                                                                                                                       |
| 6 ✅ | `GET /api/onto/projects/[id]/full`                     | `api/onto/projects/[id]/full/+server.ts:73+`           | RPC returns all nested arrays unpaginated; post-fetch decorators                              | ~~Paginate within RPC; cache assignees at project level~~ **Done 2026-04-18 (WS3):** `get_project_full` migration `20260501000002` now returns `task_assignees` and `task_last_changed_by` maps, eliminating two extra round-trips on hot path + fallback. Per-section pagination still open as follow-up.      |
| 7    | `GET /api/onto/projects/[id]/entities`                 | `api/onto/projects/[id]/entities/+server.ts:68-110`    | `ilike.%${search}%` without GIN index                                                         | `CREATE INDEX … USING GIN (to_tsvector(...))`; `.textSearch()`                                                                                                                                                                                                                                                  |
| 8    | `GET /api/admin/notifications/nlogs/events`            | `api/admin/notifications/nlogs/events/+server.ts:5-93` | `select('*')` with JSON blobs; client-side GROUP BY                                           | Narrow select; DB-side aggregation; composite index                                                                                                                                                                                                                                                             |
| 9    | `GET /api/daily-briefs/history`                        | `api/daily-briefs/history/+server.ts:6-39`             | `select('*')` pulls `executive_summary`, `llm_analysis`; ILIKE over large text                | Select preview cols only; separate detail endpoint                                                                                                                                                                                                                                                              |
| 10   | `POST /api/agentic-chat/agent-message`                 | `api/agentic-chat/agent-message/+server.ts:79-150`     | 3 sequential pre-LLM async steps then blocking LLM                                            | Parallelize setup; queue LLM or add timeout + template fallback                                                                                                                                                                                                                                                 |
| 11   | `GET /api/onto/projects/[id]/members`                  | `api/onto/projects/[id]/members/+server.ts:30-100`     | Sequential `ensure_actor_for_user` → `current_actor_has_project_access`                       | `Promise.all([...])`; DB-side sort; 60s cache                                                                                                                                                                                                                                                                   |
| 12   | `GET /api/admin/chat/sessions` (aggregation tail)      | same file:164+                                         | Client-side Map aggregation on 7 tables                                                       | Materialized counts on `chat_sessions`                                                                                                                                                                                                                                                                          |
| 13   | `POST /api/onto/projects/[id]/members/me/role-profile` | `.../role-profile/+server.ts:99+`                      | Blocking LLM (no timeout)                                                                     | Timeout + queued path                                                                                                                                                                                                                                                                                           |
| 14   | `GET /api/onto/tasks/[id]`                             | `api/onto/tasks/[id]/+server.ts:75-100`                | Linked-entity resolution may loop; assignee lookups                                           | Batch edges + assignees in one query                                                                                                                                                                                                                                                                            |
| 15   | `POST /api/daily-briefs/generate`                      | `api/daily-briefs/generate/+server.ts:7-50`            | Worker fetch without retry; no explicit short timeout                                         | Add 10s timeout + return queued status on timeout                                                                                                                                                                                                                                                               |

### 3.2 Confirmed N+1 hotspots

| Status | File:Line                                                 | Pattern                                                                                      | Fix                                                                                                                                                         |
| ------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅     | `api/cron/trial-reminders/+server.ts:32-60`               | Loop over users → per-user `trial_reminders` query                                           | Done 2026-04-17 — batched with `.in('user_id', userIds)`                                                                                                    |
| ☐      | `api/calendar/retry-failed/+server.ts:41-49`              | Loop uses `event.task` — risk of per-row fetch if not pre-joined                             | Ensure task pre-joined in main select                                                                                                                       |
| ☐      | `api/admin/notifications/nlogs/events/+server.ts:78-93`   | Client-side status aggregation across events                                                 | DB `GROUP BY status` subquery                                                                                                                               |
| ✅     | `api/onto/projects/[id]/full/+server.ts` (post-fetch)     | `decorateMilestonesWithGoals()` + `fetchTaskAssigneesMap` + `fetchTaskLastChangedByActorMap` | Done 2026-04-18 (WS3) — `get_project_full` returns `goal_milestone_edges`, `task_assignees`, and `task_last_changed_by`; TS path is now pure transformation |
| ☐      | `api/admin/users/[userId]/activity/+server.ts` (implicit) | Nested project logs                                                                          | DB timeline RPC                                                                                                                                             |

### 3.3 `select('*')` on wide tables

Status key: ☐ open · ✅ done · ⏭️ deferred

| Status | File:Line                                                | Table                   | Heavy columns pulled               | Resolution                                                                                                                   |
| ------ | -------------------------------------------------------- | ----------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ⏭️     | `api/admin/chat/sessions/[id]/+server.ts:~87`            | `chat_messages`         | content, metadata, tool_calls JSON | Deferred to agentic-chat workstream                                                                                          |
| ⏭️     | `.../+server.ts:~113`                                    | `chat_tool_executions`  | arguments, result JSON (unbounded) | Deferred to agentic-chat workstream                                                                                          |
| ⏭️     | `.../+server.ts:~140`                                    | `llm_usage_logs`        | full log rows                      | Deferred to agentic-chat workstream                                                                                          |
| ✅     | `api/daily-briefs/history/+server.ts:23`                 | `ontology_daily_briefs` | executive_summary, llm_analysis    | Done 2026-04-17 (item #2)                                                                                                    |
| ✅     | `api/brief-jobs/+server.ts:23`                           | `queue_jobs`            | full `result` JSONB                | Done 2026-04-18 (WS3) — explicit column list excludes `result`; UI uses `metadata` + status only                             |
| ⏭️     | `api/chat/compress/+server.ts:106`                       | `chat_messages`         | content + metadata                 | Deferred to agentic-chat workstream                                                                                          |
| ⏭️     | `api/chat/generate-title/+server.ts:88`                  | `chat_messages`         | content + metadata                 | Deferred to agentic-chat workstream                                                                                          |
| ✅     | `api/brief-templates/project/+server.ts:63`              | brief templates         | template_content JSONB             | Done 2026-04-17 (item #2)                                                                                                    |
| ✅     | `api/voice-note-groups/+server.ts:~50`                   | voice groups            | unbounded `metadata` JSON          | Done 2026-04-18 (WS3) — explicit column list excludes `metadata`; no caller reads it                                         |
| ✅     | `api/voice-notes/+server.ts:~50`                         | voice notes             | unbounded `metadata` JSON          | Done 2026-04-18 (WS3) — `metadata` dropped; `transcript` retained for the inline player                                      |
| ✅     | `api/onto/braindumps/+server.ts:62`                      | `onto_braindumps`       | `content` (up to 50 KB)            | Done 2026-04-18 (WS3) — `content` dropped from list; count → `'estimated'`                                                   |
| ✅     | `api/admin/notifications/nlogs/events/+server.ts:~28-30` | `notification_events`   | payload + metadata JSON            | Done 2026-04-18 (WS3) — payload/metadata kept (rendered in expand row); count → `'estimated'`; `limit` clamped to `[1, 200]` |

### 3.4 Auth overhead — duplicate lookups

| Status | File:Line                                          | Issue                                                                     |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------- |
| ✅     | `api/admin/chat/sessions/+server.ts:91-104`        | `safeGetSession()` + separate `admin_users` query                         |
| ✅     | `api/admin/users/+server.ts:27-34`                 | Session + `is_admin` check could be cached once                           |
| ⏭️     | `api/onto/projects/[id]/entities/+server.ts:70-82` | Session + `verifyProjectReadAccess` RPC sequential                        |
| ✅     | `api/onto/projects/[id]/members/+server.ts:32-48`  | Session + `ensureActorId` + `current_actor_has_project_access` sequential |
| ✅     | `api/agentic-chat/agent-message/+server.ts:80-84`  | Session + actor + project access sequential                               |

**Status — 2026-04-17:**

- The two admin endpoints already read `is_admin` off the cached `user` row that `safeGetSession()` loads from `public.users`. No follow-up `admin_users` lookup, so both rows are clean.
- `api/onto/projects/[id]/members/+server.ts` now runs `ensureActorId()` and `current_actor_has_project_access` in a single `Promise.all` — neither RPC depends on the other's result. Saves one RPC round-trip per request.
- `api/agentic-chat/agent-message/+server.ts` now runs `ensure_actor_for_user`, `current_actor_has_project_access`, and the `onto_projects` row fetch in a single `Promise.all`. The access RPC keys off `auth.uid()` (not `actorId`) and the project fetch is keyed by `id`, so all three are independent. Saves two RPC round-trips on the happy path.
- Deferred: `api/onto/projects/[id]/entities/+server.ts` still calls `safeGetSession()` then `current_actor_has_project_access` sequentially. The auth gate is intentional (we need to distinguish 401 vs 403, and the RPC uses RLS), and `safeGetSession` is promise-cached, so the sequential cost is only paid on the first call per request. Skipped to keep the security-bounded gate explicit.

**General fix (still open):** cache `actorId` on `event.locals` (e.g. lazy `event.locals.getActorId()` similar to `getCalendarTokens()`) so the 100+ endpoints that call `ensureActorId()` re-use one resolution per request. Tracked separately under WS5 (RLS & schema hygiene) — fan-out is too wide to bundle here.

### 3.5 Missing pagination / unbounded fetches

Status — 2026-04-18:

- ✅ `api/admin/chat/sessions/[id]` — defensive `.limit()` caps applied 2026-04-17 (audited at item #2 in §3.1).
- ✅ `api/admin/users/[userId]/activity` — `.limit(100)` + ordering applied 2026-04-17.
- ⏭️ `api/onto/projects/[id]/full` — nested entity arrays still returned unpaginated; deferred (large refactor; partially mitigated by per-route limits and the new `task_assignees`/`task_last_changed_by` maps eliminating downstream N+1).
- ✅ `api/onto/search` — already clamps `limit` to `[1, 50]` and forwards to RPC `p_limit`.
- ✅ `api/onto/braindumps` — `limit` clamped to `[1, 100]`; count → `'estimated'`.
- ✅ `api/notes` — `limit` clamped to `[1, 100]`; offset clamped to non-negative; count → `'estimated'` (WS3).
- ✅ `api/voice-note-groups/cleanup` — already clamps `limit` to `[1, 200]` (default 50).

Net: only the `get_project_full` nested arrays remain unbounded; tracked as a follow-up because the fix requires per-section pagination semantics.

### 3.6 LLM-heavy endpoints (blocking)

| Endpoint                                            | Blocking?                            | Recommendation                                   |
| --------------------------------------------------- | ------------------------------------ | ------------------------------------------------ |
| `/api/agent/v2/stream`                              | Multi-turn tool loop, bounded rounds | Cap rounds at 3–4; parallelize independent tools |
| `/api/agentic-chat/agent-message`                   | 2–5s blocking                        | Queue + polling or SSE stream                    |
| `/api/onto/projects/[id]/members/me/role-profile`   | 2–5s blocking, no timeout            | 5s timeout + template fallback                   |
| `/api/chat/compress`, `/api/chat/generate-title`    | Likely blocking                      | Move to worker                                   |
| `/api/calendar/analyze/preferences`, `/suggestions` | Possibly blocking                    | Queue to worker if >500ms                        |

### 3.7 Response caching opportunities (no headers today)

| Endpoint                          | Stability          | Suggested header                       |
| --------------------------------- | ------------------ | -------------------------------------- |
| `/api/onto/projects/[id]/members` | Low churn          | `public, max-age=60, s-maxage=300`     |
| `/api/templates`                  | Stable             | `public, max-age=3600`                 |
| `/api/public/projects/[id]`       | Immutable snapshot | `public, max-age=3600, s-maxage=86400` |
| `/api/admin/analytics/*`          | Daily regen        | `private, max-age=300, s-maxage=1800`  |
| `/api/onboarding`                 | Config             | `public, max-age=86400`                |
| `/api/llm-usage/summary`          | Periodic           | `private, max-age=300`                 |
| `/api/projects/briefs-count`      | Snapshot           | `private, max-age=300`                 |

---

## 4. Database & SQL Audit

### 4.1 Index coverage — existing (good)

Recent migration `20260426000014_dashboard_projects_perf_phase1.sql` is a mature performance batch:

- `idx_onto_tasks_project_updated_active (project_id, updated_at DESC) WHERE deleted_at IS NULL`
- `idx_onto_goals_project_updated_active`, `idx_onto_plans_project_updated_active`, `idx_onto_documents_project_updated_active`
- `idx_chat_sessions_user_recent_active (user_id, last_message_at DESC, updated_at DESC, created_at DESC)`

Queue system (`idx_queue_jobs_pending_claim`, `idx_queue_jobs_status_updated_at`, `idx_queue_jobs_completed_retention`) is correctly optimized.

Notifications (`idx_notification_deliveries_status_created_at`, `idx_notification_events_event_type_created_at`, `idx_notification_subscriptions_active`) are well-covered.

Agent gateway (`20260428000011`) correctly adds `(user_id, status, updated_at DESC)` composites.

### 4.2 Missing / recommended indexes

Status — 2026-04-18: P2 batch landed via migration `20260501000003`. P1 deferred with the agentic-chat workstream. P3 still open.

| Status | Priority | Table                          | Proposed index                                                                                                                                   | Rationale                                                                   |
| ------ | -------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| ⏭️     | P1       | `chat_messages`                | `(session_id, created_at ASC)`                                                                                                                   | `api/chat/compress/+server.ts:106`, `api/chat/generate-title/+server.ts:88` |
| ✅     | P2       | `project_notification_batches` | `(recipient_user_id, project_id) WHERE status IN ('pending','processing')`                                                                       | `20260424000000` RPCs                                                       |
| ✅     | P2       | `onto_braindumps`              | `(user_id, status, created_at DESC)` _(audit suggested `WHERE deleted_at IS NULL`; that column doesn't exist on this table — predicate dropped)_ | `api/onto/braindumps/+server.ts`                                            |
| ✅     | P2       | `voice_note_groups`            | `(user_id, created_at DESC) WHERE deleted_at IS NULL`                                                                                            | list endpoints                                                              |
| ✅     | P2       | `billing_accounts`             | `(billing_tier, billing_state, created_at DESC)` _(audit said `account_state`; actual column is `billing_state`)_                                | `billing-ops-monitoring.ts:130-179`                                         |
| ☐      | P3       | `onto_projects`                | `(created_by)` (verify)                                                                                                                          | Owner-scoped RPC paths                                                      |
| ☐      | P3       | `public_page_views`            | `(page_id, created_at)`                                                                                                                          | Preempt growth in `20260430000000`                                          |
| ☐      | P3       | Tasks (legacy)                 | `idx_tasks_user_created_at_desc`                                                                                                                 | Dashboard recency                                                           |
| ☐      | P3       | Entity search text cols        | GIN on `to_tsvector(title\|\|' '\|\|description)`                                                                                                | Replace ILIKE scans in `api/onto/projects/[id]/entities`                    |

### 4.3 RLS policies worth revisiting

**File:** `supabase/migrations/20260328000000_add_onto_comments.sql`

| Line    | Policy                                                                                                                          | Concern                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 288-291 | `comment_select_public` — `EXISTS (SELECT 1 FROM onto_projects p WHERE p.id = onto_comments.project_id AND p.is_public = true)` | Per-row subquery; denormalize `is_public` to `onto_comments` with a trigger |
| 321-330 | `comment_mentions_select_reader` — joins `onto_comments` × `onto_projects` plus `current_actor_has_project_access()` per row    | Verify `(actor_id, project_id)` index on `onto_project_members`             |
| 334-338 | `comment_mentions_insert_author` — `EXISTS` on insert                                                                           | Lower risk (write-only)                                                     |

**Action:** profile `current_actor_has_project_access()` under realistic row counts. Consider a cached materialized view of `(actor_id → project_ids)` for RLS predicates.

### 4.4 Expensive `count: 'exact'`

| File:Line                                                               | Concern                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/web/src/lib/server/billing-ops-monitoring.ts:130,172,176`         | `billing_accounts` full-table exact count; swap to `'estimated'` |
| `billing-ops-monitoring.ts` other counts                                | Scoped, acceptable                                               |
| `apps/web/src/lib/server/welcome-sequence.service.ts:~115`              | Estimated is fine                                                |
| `apps/web/src/lib/server/user-profile.service.ts:~180,~190`             | Existence check — use `limit(1)` instead of count                |
| `apps/web/src/lib/server/agent-call/external-tool-gateway.ts:~360,~375` | Rate-limit gates — keep exact only if security-critical          |

### 4.5 RPC quality

- `get_onto_project_summaries_v1()` (`20260426000014:31-184`): LATERAL subqueries, `SECURITY DEFINER`, validated actor_id — **well-designed**. Missing: optional `p_limit integer DEFAULT 50`.
- `get_user_dashboard_analytics_v1()` (`20260426000014:192-end`): inspect inner queries for unbounded subselects.
- `get_notification_event_performance()` (`20260428000025:20-24`): interval-scoped CTE, clean.
- Queue RPCs (`add_queue_job`, `claim_pending_jobs`, `complete_queue_job`, `fail_queue_job`): `apps/web/src/lib/server/queue-job-id.ts:13-40` does a post-insert re-query to resolve public ID — the RPC should return both IDs to avoid the round-trip.

### 4.6 Unbounded queries

- `get_onto_project_summaries_v1()` has no `LIMIT`; add optional `p_limit`.
- `onto_braindumps`, search, notes — add explicit `.limit(50)` defaults.
- No realtime channels with obvious full-table subscriptions detected; audit `apps/web/src/lib/stores/unifiedBriefGeneration.store.ts` to confirm `.channel()` scope.

### 4.7 Admin (service-role) client usage

All detected `createAdminSupabaseClient()` callers are server-side utilities (queue insertion, logging, onboarding seed, security/error logging, asset-OCR, voice-note transcription, agent-call provisioning). **No user-facing endpoint bypasses RLS inappropriately.** ✓

### 4.8 Recent-migration smell-test

Last 15 migrations are clean. Notable:

- `20260429000005_add_chat_session_extracted_entities` — if this adds JSONB to `chat_sessions`, verify row bloat; if a new table, add FK index on `chat_session_id`.
- `20260430000000_add_public_page_views` — preempt growth with `(page_id, created_at)` index.
- `20260426000014` — exemplary pattern to extend to other hot tables.

---

## 5. Bundle & Client-Side Performance

### 5.1 Dependency weight (good overall)

- **Heavy libs are lazy-loaded**: Tiptap, CodeMirror, G6 graph, Cytoscape family — all gated to authenticated flows or dynamic `await import()`.
- **Pre-optimized vendor chunks**: `ui-vendor`, `ai-vendor`, `google-vendor`, `stripe-vendor` configured in `vite.config.ts:139-172`.
- **Landing (`/`) has only granular Lucide icon imports** (`src/routes/+page.svelte:30-37`).
- **No moment.js, fullcalendar, or heavy PDF libs.** ✓

**Minor risk:** Cytoscape plugins (`cytoscape`, `cytoscape-dagre`, `cytoscape-cola`, `cytoscape-cose-bilkent`) imported at module scope in `OntologyGraph.svelte:22-26`. Confirm they're only loaded on graph routes (not eagerly on project detail).

### 5.2 Oversized Svelte components

| File                               | Lines | Status                                            |
| ---------------------------------- | ----- | ------------------------------------------------- |
| `AgentChatModal.svelte`            | 4,532 | 100+ `$effect()` calls → cascading re-render risk |
| `DocumentModal.svelte`             | 4,160 | Split header/composer/list into children          |
| `TimePlayCalendar.svelte`          | 2,112 | Acceptable; gated to time-blocks route            |
| `ProjectCollaborationModal.svelte` | 1,588 |                                                   |
| `RichMarkdownEditor.svelte`        | 1,587 |                                                   |
| `TaskEditModal.svelte`             | 1,451 |                                                   |
| `Navigation.svelte`                | 1,177 | Always in layout; monitor hydration               |

### 5.3 Images & static assets

Large assets not served responsively:

- `dj-wayne-profile.jpg` — 1.9 MB
- `BuildOS.png` — 1.4 MB
- `brain-bolt-big.png` — 1.3 MB
- `brain-bolt-mechanical-white-background.png` — 1.2 MB
- `buildos-chat.png` — 932 KB

Only 10 `loading="lazy"` instances in the entire codebase. No `<picture>` / `srcset` / `sizes` found. Most `<img>` tags lack `width`/`height`/`decoding="async"`.

**Fix:** convert to WebP (or AVIF), emit `<picture>` with `srcset` breakpoints, add `loading="lazy"` + `decoding="async"` + explicit dimensions.

### 5.4 Prerender / caching on marketing routes

- `svelte.config.js:44-56` lists `/blogs`, `/pricing`, `/beta`, `/contact`, `/docs`, `/feedback`, `/help`, `/investors`, `/privacy`, `/terms` in entries.
- `src/routes/blogs/+page.ts` and `src/routes/pricing/+page.ts` have `// export const prerender = true` **commented out**.
- **Fix:** uncomment prerender flags and/or add `Cache-Control: s-maxage=3600` headers.

### 5.5 CSS / Tailwind

Clean. `inkprint.css` (18 KB), `app.css` (~225 lines), Tailwind JIT with proper content globs. No bloat detected.

### 5.6 Fonts

`system-ui, -apple-system, sans-serif` — no FOIT/FOUT. Serif families ("IBM Plex Serif", "Literata") are **declared in Tailwind config but not loaded via `@font-face` or Google Fonts** — either dead code or broken intent. Investigate.

### 5.7 Service worker / PWA

No service worker detected. PWA install prompt and splash-screen helpers are present (`+layout.svelte:23`) but no offline caching layer.

### 5.8 Svelte 5 rune red flags

- `AgentChatModal.svelte` has 100+ `$effect()` calls → cascading reactivity risk. Consolidate related effects or split into child components with local reactivity.
- Root `+layout.svelte` has 24 `$state` declarations — acceptable for a layout, monitor hydration cost.
- No module-level `window`/`document` access detected. `browser` guards used 75× across components. ✓

---

## 6. Infrastructure, Caching & Integrations

### 6.1 Caching — minimal

- **In-process LRU** (`apps/web/src/lib/utils/lru-cache.ts`) with four singletons (`api`, `userData`, `projectData`, `computed`), TTL 5–10 min. Used primarily for rate limiting.
- **Static assets**: `vercel.json:27-115` sets `public, max-age=31536000, immutable` on webp/png/svg/js/css/mp4. ✓
- **No distributed cache** (no Redis / Vercel KV).
- **No `Cache-Control: s-maxage` / ETag on API responses.**
- **No SWR pattern.**

Highest-value additions: user subscription (5 min), brief-job status (30s), calendar connection status (5 min), feature flags (1 h).

### 6.2 LLM latency in request path

| Endpoint                                            | Behavior                         | Impact            |
| --------------------------------------------------- | -------------------------------- | ----------------- |
| `/api/daily-briefs/generate`                        | Queued to worker ✓               | 0 ms              |
| `/api/chat/sessions/[id]/classify`                  | Awaits LLM classification        | 2–5 s blocking    |
| `/api/agentic-chat/agent-message`                   | Awaits LLM                       | 2–5 s blocking    |
| `/api/onto/projects/[id]/members/me/role-profile`   | Awaits LLM                       | 2–5 s, no timeout |
| `/api/chat/compress`, `/api/chat/generate-title`    | Likely blocking                  | Variable          |
| `/api/calendar/analyze/preferences`, `/suggestions` | LLM calls, blocking              | Variable          |
| `/api/agent/v2/stream`                              | Streams, bounded tool rounds (8) | Variable          |

**Fix pattern:** queue to worker + return `{ jobId }` for polling; for streaming endpoints, emit partial results early.

### 6.3 Prompt caching — not used

- `packages/smart-llm/src/moonshot-client.ts:109-110` accepts `prompt_cache_key` — **no caller passes it**.
- OpenRouter prompt caching, Anthropic caching, OpenAI caching — all unused.

**Biggest wins:**

1. Agentic chat planner/executor/synthesis system prompts (2–5 KB × many turns).
2. Daily-brief system prompt (2–3 KB shared across users, 24h reuse window).
3. Braindump processing system prompts (1–2 KB).
4. Ontology migration batch prompts (5–10 KB).

**Implementation:** for Moonshot/Kimi calls, `prompt_cache_key = hash(systemPrompt + context)`. For other routes, enable provider-specific cache headers where supported.

### 6.4 Model selection

- Tiered profiles in `packages/smart-llm/src/model-config.ts:563-755` are sensible.
- **Lightly expensive default**: agentic-chat "complex" defaults to `qwen/qwen3.6-plus` ($0.325/1M); `deepseek/deepseek-v3.2` ($0.26/1M) or `x-ai/grok-4.1-fast` ($0.2/1M) are cheaper.

### 6.5 Queue offloading — mostly good

✓ Briefs, braindumps, chat classification, OCR, onboarding analysis, voice transcription — all queued.

Remaining blocking-in-web candidates: chat compression, chat title generation, calendar analysis LLM calls, role-profile generation.

### 6.6 Google Calendar

- `calendar-service.ts:510-553` `getCalendarEvents()` — single-calendar queries, looped externally → N+1 risk when user has multiple calendars.
- `calendar-service.ts:587-650` `findAvailableSlots()` — single-calendar `freebusy.query`; Google API supports batched `items: [...]` — use it.
- Bulk delete (`lines 1305-1320`) is batched ✓.
- No caching of calendar list / connection state.

### 6.7 Worker ↔ Web RPC

- `queueBriefGeneration()` (`railwayWorker.service.ts:79-133`): awaited with 10s timeout, no retries. **Add exponential backoff.**
- `queueChatSessionClassification()` (`:355-398`), `queueBraindumpProcessing()` (`:32-95`): mostly fire-and-forget ✓.
- Fallback to direct queue insertion if worker unreachable (braindump path) ✓.

### 6.8 Cold starts

`.vercel` bundle ~149 MB. Cron endpoints (`vercel.json:5-25`) run on Node.js 22.x. If they're small, migrate `/api/cron/*` to Edge Runtime to drop cold start from ~2s to ~100–200 ms.

### 6.9 Logging / metrics

Non-blocking ✓. `packages/shared-utils/src/logging/logger.ts:147` uses fire-and-forget `logToDatabase`. No synchronous analytics calls. No PostHog/Segment detected in request path.

### 6.10 Stripe / Storage

- Stripe calls only in non-critical paths (invoice download). Acceptable latency.
- Storage uploads use signed URLs direct to Supabase Storage — no buffering in SvelteKit. ✓

---

## 7. Cross-Cutting Patterns Worth Fixing

### 7.1 Sequential awaits where `Promise.all` fits

Systematic issue in multiple load functions and endpoints:

- `src/routes/projects/+page.server.ts:30-69` — `ensureActorId()` blocks count queries
- `src/routes/time-blocks/+page.server.ts:14-31` — actor → projects → calendar-conn sequential
- `src/routes/+page.server.ts:89-124` — `hasAnyProjects()` two RPCs sequential
- `api/onto/projects/[id]/members/+server.ts:32-48` — actor + access check sequential
- `api/agentic-chat/agent-message/+server.ts:80-84` — actor + access + metadata sequential

**Single rule:** if B does not depend on A's result, run them in `Promise.all([...])`.

### 7.2 Column projection discipline

Every `select('*')` on wide tables is a correctness smell in a performance audit. Introduce a lint rule or review checklist: on tables with large JSON/text (`content`, `metadata`, `tool_calls`, `arguments`, `result`, `executive_summary`, `llm_analysis`, `transcription`), **never `*`** in list/detail endpoints unless every column is used client-side.

### 7.3 Counts: exact vs estimated

Adopt convention: **`'estimated'` by default; `'exact'` only when a security/billing decision depends on the exact number.**

### 7.4 RLS performance budget

Every RLS policy should be testable under realistic row counts. Policies with `EXISTS (SELECT 1 FROM ...)` subqueries need profiling. Prefer denormalized boolean columns (`is_public`) or cached membership tables for hot predicates.

### 7.5 Cache-Control everywhere read-only

Add `setHeaders({ 'Cache-Control': 'private, max-age=60, s-maxage=300, stale-while-revalidate=60' })` on every read-only API endpoint whose data tolerates seconds of staleness.

---

## 8. Evidence Index (quick jump)

**Hooks & layouts:** `apps/web/src/hooks.server.ts:229-312, 403-562`, `apps/web/src/routes/+layout.server.ts:66-212`
**Top pages:** `apps/web/src/routes/admin/chat/+page.svelte`, `apps/web/src/routes/projects/[id]/+page.server.ts:257-333`, `apps/web/src/routes/+page.server.ts:89-124`
**N+1:** `apps/web/src/routes/api/cron/trial-reminders/+server.ts:32-60`
**Wide selects:** `apps/web/src/routes/api/admin/chat/sessions/[id]/+server.ts:74-150`, `apps/web/src/routes/api/daily-briefs/history/+server.ts:23`, `apps/web/src/routes/api/chat/compress/+server.ts:106`
**Missing index:** `chat_messages (session_id, created_at ASC)` for `api/chat/compress`, `api/chat/generate-title`
**Blocking LLM:** `apps/web/src/routes/api/agentic-chat/agent-message/+server.ts`, `api/onto/projects/[id]/members/me/role-profile`, `api/chat/sessions/[id]/classify`
**Prompt caching gap:** `packages/smart-llm/src/moonshot-client.ts:109-110`
**RLS to profile:** `supabase/migrations/20260328000000_add_onto_comments.sql:288-338`
**Exact counts:** `apps/web/src/lib/server/billing-ops-monitoring.ts:130,172,176`
**Queue double-fetch:** `apps/web/src/lib/server/queue-job-id.ts:13-40`
**Prerender gaps:** `apps/web/src/routes/blogs/+page.ts`, `apps/web/src/routes/pricing/+page.ts`

---

## 9. Recommended Workstreams (sequenced)

Each workstream is roughly a week of one engineer's time. Sequencing matches "biggest lift, least risk" first.

### WS1 — Quick infra wins (≤3 days)

- Swap `count: 'exact' → 'estimated'` in billing-ops (`billing-ops-monitoring.ts:130,172,176`).
- Add `CREATE INDEX idx_chat_messages_session_created ON chat_messages(session_id, created_at ASC)`.
- Uncomment `export const prerender = true` in `/blogs/+page.ts` and `/pricing/+page.ts`.
- Extend billing-context TTL in root layout from 20s → 5 min; invalidate via `depends()`.
- Add `Cache-Control: s-maxage=3600` on marketing API reads and `/api/templates`, `/api/public/projects/[id]`, `/api/onboarding`.

### WS2 — LLM efficiency (1 week)

- Add prompt caching to agentic-chat planner/executor/synthesis prompts and daily-brief system prompt.
- Implement Moonshot `prompt_cache_key` path end-to-end; add shared helper `withPromptCache(systemPrompt, context)`.
- Move chat compression, chat-title generation, and role-profile LLM calls to worker (fire-and-forget + polling).
- Add 5s timeout + template fallback on remaining in-web LLM paths.

### WS3 — Query projection & limits (1 week) ✅ Shipped 2026-04-18

- ✅ Narrow `select('*')` in all non-chat endpoints from §3.3 (5 new + 2 from 2026-04-17).
- ✅ Add limit clamps / `.limit(N)` defaults to remaining unbounded list endpoints (§3.5).
- ✅ Add `p_limit` to `get_onto_project_summaries_v1()` (migration `20260501000001`).
- ✅ Bake `task_assignees` and `task_last_changed_by` into `get_project_full()` (migration `20260501000002`); both `/projects/[id]` hot path and fallback now skip the two extra round-trips.
- ⏭️ Per-section pagination inside `get_project_full()` deferred (requires UX/contract decisions per array).
- ⏭️ Chat endpoints in §3.3 deferred to the agentic-chat workstream.

### WS4 — Admin dashboards (1–2 weeks)

- Add `+page.server.ts` server loads to `/admin/chat`, `/admin/beta`, `/admin/+page`.
- Create materialized view `user_ontology_stats` refreshed hourly for `api/admin/users`.
- Add pre-aggregated counts (`message_count`, `tool_call_count`, `error_count`, `total_tokens_used`) to `chat_sessions`.
- Virtualize `/admin/errors` and `/admin/chat/sessions` tables.

### WS5 — RLS & schema hygiene (1 week)

- Profile `current_actor_has_project_access()` on realistic row counts.
- Denormalize `is_public` to `onto_comments` (trigger + backfill).
- Add the 4 recommended composite indexes (Section 4.2).
- Add `p_limit` parameter to `get_onto_project_summaries_v1()`.
- Make `add_queue_job` RPC return public ID to remove the post-insert re-query.

### WS6 — Client / asset polish (3–5 days)

- Convert top 5 hero images to WebP with `<picture>` + `loading="lazy"` + explicit dimensions.
- Split `AgentChatModal.svelte` and `DocumentModal.svelte` into child components.
- Remove unused serif font declarations or add `@font-face` loads.
- Audit Cytoscape imports to confirm lazy scope.

### WS7 — Distributed cache & worker reliability (1 week, optional)

- Introduce Vercel KV or Upstash for: subscription status, feature flags, brief-job state.
- Add exponential backoff + retry to `queueBriefGeneration()`.
- Consider migrating small cron handlers to Vercel Edge runtime.

---

### WS3 completion notes — 2026-04-18

**API endpoints** (`apps/web/src/routes/api/`):

- `brief-jobs/+server.ts` — `queue_jobs` list select replaced with explicit column list (drops `result` JSONB).
- `voice-note-groups/+server.ts` — drops unbounded `metadata` JSON (verified no caller reads `.metadata`).
- `voice-notes/+server.ts` — drops `metadata` JSON; `transcript` retained for inline player.
- `onto/braindumps/+server.ts` — drops 50 KB `content` blob; count → `'estimated'`. (`history/+page.server.ts` still selects `*` because it falls back to `content.slice(0, 200)` for the preview when `summary` is null — left for a follow-up that adds a SQL substring projection.)
- `admin/notifications/nlogs/events/+server.ts` — count → `'estimated'`; `limit` clamped to `[1, 200]`. `payload`/`metadata` kept because the admin event table renders them in expand rows; the per-page bound keeps total bytes reasonable.
- `notes/+server.ts` — `limit` clamped to `[1, 100]`; offset clamped to non-negative; count → `'estimated'`.

**Database** (`supabase/migrations/`):

- `20260501000001_add_p_limit_to_project_summaries_v1.sql` — adds optional `p_limit integer DEFAULT NULL` to `get_onto_project_summaries_v1`. Backwards-compatible: existing in-DB callers (`build_fastchat_project_intelligence`, `load_fastchat_context`) and the web app's named-arg call all keep working.
- `20260501000002_get_project_full_with_task_enrichment.sql` — `get_project_full` now returns `task_assignees` (jsonb object: `task_id → [{actor_id, user_id, name, email, assigned_at}]`) and `task_last_changed_by` (jsonb object: `task_id → actor_id`), resolved via the same logic as the TS helpers (preferring `changed_by_actor_id`, falling back to `onto_actors.user_id::text = changed_by`).

**Consumers updated**:

- `routes/api/onto/projects/[id]/full/+server.ts` — drops the `Promise.all` calls to `fetchTaskAssigneesMap` and `fetchTaskLastChangedByActorMap`; consumes the RPC-returned maps directly via two thin builders.
- `routes/projects/[id]/+page.server.ts` (fallback path) — same treatment; also reuses the pre-computed `goal_milestone_edges` rather than re-querying `onto_edges`.

**Validation**:

- `pnpm check` (svelte-check): 0 errors, 219 warnings (all pre-existing).
- `pnpm lint`: route-size guardrail violations are on unrelated files (pre-existing); no new ones from WS3.
- `pnpm vitest run src/routes/projects/[id]/page.server.test.ts`: 7/7 pass.
- 3 unrelated PATCH-task test failures observed (`task-patch-assignment-mentions.test.ts`, `task-patch-completion-sync.test.ts`) — pre-existing; no diff in any related file.

**Known follow-ups (not part of WS3 scope)**:

- Per-section pagination inside `get_project_full()` (large refactor — needs UX decisions for tasks/documents/etc.).
- Server-side `substring(content, 1, 220)` projection for `history/+page.server.ts` so the braindump preview path can fully drop `content`.
- `get_user_dashboard_analytics_v1()` streaming on the dashboard load (separate from WS3).

---

## 10. Open Questions / Follow-ups

1. **Realtime scope**: verify `apps/web/src/lib/stores/unifiedBriefGeneration.store.ts` subscription filters — no evidence of full-table subscription, but worth confirming.
2. **`get_user_dashboard_analytics_v1()`** internals — inspect for inner unbounded subqueries.
3. **Column-level usage** of wide selects — confirm that large columns (`metadata`, `tool_calls`) are actually unused client-side before narrowing.
4. **Cron endpoint sizes** — measure to decide Edge vs Node runtime.
5. **Connection pooling** in `hooks.server.ts:533-562` — is the admin client instantiation actually leaking, or pooled?
6. **RLS `current_actor_has_project_access()`** definition — grep migrations for the function body to confirm it's indexed.

---

## 11. How to Measure Before/After

Recommended baseline before starting WS1:

- **Vercel Analytics / Speed Insights**: record p50/p75/p95 for `/`, `/dashboard`, `/projects`, `/projects/[id]`, `/admin/chat`.
- **Server-Timing**: enable `PERF_TIMING=true` and `PERF_LOG_SLOW=true` for a week; capture slowest 100 requests per route.
- **Supabase dashboard**: capture p95 query times for `chat_messages`, `onto_projects`, `onto_tasks`, `ontology_daily_briefs`, `queue_jobs`.
- **LLM cost**: baseline daily token spend by model from `llm_usage_logs`.

Re-run after each workstream. Target: −30% p50 on the top 10 endpoints, −20% LLM token spend, −40% on admin dashboard TTI.

---

_End of audit. Updates and revisions should be appended here with date headers rather than overwriting._
