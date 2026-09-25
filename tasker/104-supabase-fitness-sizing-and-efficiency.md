<!-- tasker/104-supabase-fitness-sizing-and-efficiency.md -->

# Tasker 104 — Supabase fitness: are we sized, configured, and using Postgres well?

**Status:** All known client-callable admin RPCs contained (76 anon-callable definers found 09-25: step 1 + default-private LIVE, step 2 after web deploy); 5 s polling LIVE (−77% claims); QA + gate tooling retired; CI unblocked. Open: 5 low-severity guard fixes, stream-state HOT updates · **Opened:** 2026-09-24 · **Owner:** Claude (took over from Codex 2026-09-24 evening)
**Source:** the Tasker 102 investigation. A gate turn died because the QA database stalled for
40 s. The QA branch turned out to be memory-starved and swapping, and a quick check shows production
is on the default 1 GB instance with swap in use. It was paging only lightly in the one sample
taken, so whether prod suffers under load is the open question.
**Scope guard (DJ):** research first, read-only. Do not resize, restart, change settings, apply
migrations, or write to any database without DJ's explicit OK. Anything that adds cost is DJ's call.
No paid LLM runs.

**September 24 implementation authorization:** DJ asked to start fixing the findings, approved
the full five-second wake-aware polling recommendation, and asked whether the unused phase-date
RPC can be deleted. Local containment implementation is prepared below. QA is retained. The
paid-run approval requirement remains in effect. DJ subsequently removed the mandatory
per-change-set gate and asked to verify migration status before staging already-applied files.

## Double-check pass — 2026-09-25 (DJ: "double-check everything; maybe delete the old gate scripts")

DJ confirmed there is no real load yet (DJ is the main user), so sizing stays on Micro with no
busy-window sample planned until there are users.

- **Polling receipt (prod edge logs, 15-min buckets):** `claim_pending_jobs` fell from 252–271/min
  (21:00–23:15 UTC) to ~59/min after 00:15 UTC, which is 4 chat replicas × 12 plus the general
  worker × 12. That is 77% fewer queue claims, or ~380K fewer REST calls/day.
- **Security (the big one):** 76 `SECURITY DEFINER` functions were executable by `anon`, and
  therefore by anyone holding the public key in the web bundle. Confirmed live: anon read
  `get_revenue_metrics` and `get_admin_top_users` (user emails, names, costs). A caller audit
  traced every call site to its client; the prod catalog was checked for policies, invoker callers
  and triggers.
    - **Step 1, `20260925013000` (LIVE, verified):** 44 functions server-only, 26 signed-in only.
      Unchanged on purpose: `is_admin()`, `current_actor_id()` and
      `current_actor_has_project_access()` (RLS helpers that the role probe showed are needed on
      anon-visible policies), the logged-out invite preview, `log_client_error`, and the
      unreferenced `app_auth.is_admin()`. `upsert_legacy_entity_mapping` stays signed-in because
      the `onto_projects`/`onto_tasks` triggers call it with invoker rights. After apply: anon
      calls get 401/42501, service calls 200, and public pages (/, sitemap, pricing, blogs) 200.
    - **Step 2, `20260925013100` (after the web deploy):** `evaluate_user_consumption_gate`,
      `queue_sms_message` and `get_user_llm_usage` become service-only, since their callers now
      use the admin client. Subscription and trial status gain an own-id-or-admin guard.
    - **Step 3, `20260925013200` (LIVE):** functions that `postgres` creates are private by
      default, so a migration must grant clients explicitly. This fixes the class of bug.
      AGENTS.md records the rule.
    - **Rehearsed** with the new `--role-probe` and `supabase/tests/contain_client_callable_definer_rpcs.check.sql`:
      zero read regressions for anon or authenticated, and every privilege and guard assertion passes.
      The first draft broke nine tables for expired sessions; the probe caught it.
    - **Remaining low-severity guard fixes:** `is_admin(uuid)` (a signed-in user can test whether any
      id is an admin), `resolve_onto_public_page_slug_prefix` (another user's name or email prefix),
      `increment_question_display_count`, the inviter email in the invite preview, and
      `log_client_error` spam. Tasker 76's broader audit continues from here.
- **CI had been red since 09-14.** Fixed five web test type errors (Tasker 103 tests), a
  portability-guard comment, the refill source-contract string, two Phase 5 anchors renamed by
  the turn-leases commit, and the admin export test. The full local suite (`turbo test:run --continue`)
  showed only those failures.
- **Gate tooling deleted:** the QA-only runner, calendar setup, workflow prototype, write probe,
  latency/trace analysis and the book-loop QA scripts. `book-loop/turn.sh` kept its prod mode.
  They were last present in `525cc6e6b`.

## Current state — September 24, evening (Claude takeover)

DJ reassigned this tasker after the Codex pass. Earlier sections are preserved as history; this
section supersedes their status claims.

**DJ decisions (2026-09-24 evening):** testing moves to production (`pnpm agentic:prod-battery`),
so the QA branch is retired, not resized; apply the security containment straight to production;
commit and push the finished work; replace QA's one remaining job (catching migration errors
before prod) with a free local migration rehearsal.

### Done and verified

- **Security containment is live in production.** `20260924202321_contain_legacy_admin_rpcs`
  applied with `db query --linked -f` and recorded with `migration repair`. Verified with a catalog
  read and through PostgREST: the anon call to `get_subscription_overview` returns 401/42501;
  `batch_update_phase_dates` returns 404/PGRST202 and its 112 phase rows are untouched; the
  service-role call returns 200. Both retained functions are `SECURITY INVOKER` with
  `search_path=""`. Every app caller uses `createAdminSupabaseClient()`. Rollback:
  `supabase/manual/rollback_20260924202321_contain_legacy_admin_rpcs.sql` (never reopens client
  execution).
- **Two of the four "not applied" migrations were applied before this takeover** by the Tasker
  103 session: `20260924193000` task-create lock-first (prod body md5 `cac030…`) and
  `20260909194302` onboarding progress (the live signup blocker). Both are in the prod ledger.
- **Still unapplied, on purpose:** `20260910170101` Libri quota settlement (needs the
  issuance-broker rollout first).
- **Wake-aware polling is live** (`8e05790b2`, pushed 23:2x UTC). Chat-worker `/health` reports
  `queue.polling`: interval 5000 ms, jitter ≤250 ms, `wakeChannelHealthy: true`. About 7 minutes
  after deploy, one replica showed startup 1, timer 82, wake 1 (the initial-subscription
  catch-up), and 84 empty claims. That is ~12 idle claims/min per replica, versus 60 at 1 s.
  Fleet-wide that's ~48/min versus ~240. Restore the old cadence with `CHAT_IDLE_POLL_INTERVAL_MS=1000`.
- **Read-only preflight after rollout:** `preflight.py --scope all --require-cron` passed
  29/29 on production, including the security scope.
- **QA retired.** The persistent branch `agentic-chat-gate` (`daudvqczjqxhpzstlfih`) was deleted
  (made non-persistent, then deleted via the Management API), saving ~$9.81/mo. The
  `agentic-chat-gate.yml` CI workflow was removed. The gate runner (`gate.ts`,
  `calendar-setup.ts`, `concurrent-write-probe.mts`) stays dormant: it refuses to run without an
  isolated env file, and works unchanged if an isolated DB is ever provisioned. `AGENTS.md` now
  points live validation at `pnpm agentic:prod-battery` and migrations at `pnpm db:rehearse`.
- **Migration rehearsal built:** `scripts/migration-rehearsal/` (`pnpm db:rehearse <file>`).
  It takes a schema-only pg_dump of production over the CLI's temporary login, with every session
  forced read-only and cached 24 h (~2 min to refresh). A disposable local PG16 with pgvector
  0.8.0 loads the schema in ~1.2 s (11,293 objects). It then applies the files, diffs every
  table, column, index, constraint, function (definer, search_path, grants), policy, and trigger,
  and flags SECURITY/DATA risks using production row counts. 12 offline tests pass.
  First results:
  `20260910170101` Libri quota settlement applies cleanly to production's current schema
  (6 changes; `libri.image_upload_intents` has 0 rows). The containment re-applies as a no-op,
  and its rollback applies cleanly.
  **Key finding it surfaced:** Supabase's default privileges grant EXECUTE on every new function
  to `anon` and `authenticated`. A new `SECURITY DEFINER` function is therefore client-callable
  unless the migration revokes it. That is the root of the Tasker 76 exposures, and the
  rehearsal now flags it.
- Free validation: 21 health-kit and security tests (9 against a disposable PostgreSQL), 92
  worker tests, 12 rehearsal tests, the worker typecheck, and 6 prod-battery policy tests.

### Found during takeover

- **QA was paying Micro prices for Nano RAM.** The persistent branch `daudvqczjqxhpzstlfih`
  billed at the Micro rate ($0.01344/h, ~$9.81/mo) with 455 MB of RAM, which is why gate runs swapped.
  Its branch status has read `MIGRATIONS_FAILED` since 09-11.
- **The QA gate CI workflow failed on every push** (8/8 recent runs) because `AGENTIC_GATE_ENV`
  was never configured. Had it been configured, it would have started a paid gate on every
  push to `main`, against the paid-run approval rule.

### Remaining

1. **24 h polling receipt (free):** compare `claim_pending_jobs` REST volume for a full day after
   `8e05790b2` with the 408,669/day baseline, using the health kit's `latency`/`logs` over a
   ≥24 h window. Watch for wake-latency regressions in the first real turns.
2. **Open measurements (no action until evidence):** a busy-window paging sample (the kit's
   `sample` command while real users are active), stream-state zero-HOT updates (the
   `updated_at` index on `chat_turn_stream_state`), and retention with Tasker 103. Production
   stays on Micro.
3. **Libri quota settlement:** rehearsed clean. Apply only after its issuance-broker rollout
   prerequisite holds.
4. **Tasker 63:** historical ledger reconciliation and the `wrong_project` email-review
   constraint drift. Never bulk-replay the 241 unverified historical files. QA's ledger gap is
   moot now that the branch is deleted.

## Why this matters

Every BuildOS action goes through Supabase: chat turns, capture, briefs, calendar. If the database
pauses, users see slow or failed answers, and nothing in the product says why. The question is
whether we're paying a latency and reliability tax that a small, cheap change would remove (sizing,
a setting, a hot-row fix, less polling). If so, which change comes first, and what does it cost?

## What we already know (evidence gathered 2026-09-24, read-only)

| Fact                                                                       | Production `build_os` (`iwifjtlebphefldmwbkh`)                                                   | QA gate branch `agentic-chat-gate` (`daudvqczjqxhpzstlfih`)             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Plan / compute add-on                                                      | Org "BuildOS" on **Pro**; **no compute add-on selected** (only custom domain, $10/mo)            | persistent branch of prod; no compute add-on                            |
| RAM (`node_memory_MemTotal`)                                               | **966 MB** (Micro)                                                                               | **455 MB** (Nano)                                                       |
| Swap in use                                                                | **~412 MB** of 1 GB                                                                              | ~480 MB of 1 GB at the incident                                         |
| MemAvailable                                                               | 288 MB                                                                                           | 202 MB                                                                  |
| DB size                                                                    | 610 MB (smaller than 966 MB physical RAM; active working set still matters)                      | 391 MB                                                                  |
| Root-volume reads (swap lives there) vs data volume                        | 1.32 TB vs 58 GB                                                                                 | 1.23 TB vs 40 GB (since 09-11)                                          |
| Cumulative swap-ins (`pswpin`) / major faults                              | 38.9M pages (~155 GB) / 41.3M                                                                    | — / 83.2M                                                               |
| **Paging rate, one 60 s sample** (16:50 UTC, a weekday midday, light load) | ~3.5 major faults/s, ~0.4 MB/min swapped in, ~6.5 MB/min root-volume reads: light, not thrashing | not sampled                                                             |
| Region                                                                     | us-west-1, Postgres 15.8                                                                         | us-west-1, Postgres 15.14                                               |
| Branch status                                                              | —                                                                                                | **`MIGRATIONS_FAILED`** (created 09-11; migrations are applied by hand) |

Also from the QA incident (Tasker 102 work log):

- **Lock convoy on one row:** per-turn RPCs take `FOR UPDATE` on `chat_turn_runs`. FK inserts that
  reference it (`llm_usage_logs`, `chat_turn_events`) need KEY SHARE, which `FOR UPDATE` blocks. The
  prompt-snapshot RPC holds that lock across three writes of a ~66 KB row. Tasker 102 made the fence
  check and the cancellation poll lock-free; the rest is open.
- **Hot rows:** on QA, `chat_turn_runs` had 45k updates on 1.6k rows (autovacuumed 188×), and
  `chat_turn_stream_state` had 39k updates with **zero HOT updates** (autovacuumed 210×).
- **Pool and timeouts:** PostgREST pool = 10 connections. The API role has
  `statement_timeout`/`lock_timeout` = 8 s. A blocked statement holds a pool slot for up to 8 s,
  which is how one slow row starved unrelated requests (`select users` 10.6 s).
- **Round trips:** gate (laptop in MD → us-west-1) pays ~105 ms/call, prod Railway us-west2 ~28 ms.
  Tasker 101 counted ~15 serial DB round trips per write. The dashboard-calendar memory notes the
  Vercel functions ran in iad1 against a us-west-1 DB (sfo1 fix staged, check whether it shipped).
- **Idle polling baseline:** each worker polls `claim_pending_jobs` (1–5 s), the cancellation poll
  (2 s), lease renewals (15 s), and the dead-turn sweep (15 s). The web cron
  `agentic-chat-stale-turns` runs every minute, and ~15 other Vercel crons run hourly or daily.
  Prod runs 4 chat-worker replicas plus the main worker.
- **Costs** (management API, per hour): Micro $0.01344 (~$10/mo, covered by the Pro compute
  credit), Small $0.0206 (~$15/mo), Medium $0.0822 (~$60/mo), Large $0.1517 (~$110/mo).

## Questions to answer, each with evidence

1. **Is production undersized?** Swap in use is not proof of thrashing. Linux swaps out idle pages
   too, and the one prod sample so far was light. The large cumulative totals say bursts happened
   at some point; find when. Measure the _rate_: sample `node_vmstat_pswpin`/`pgmajfault`/iowait twice, minutes apart,
   at a busy time and a quiet time. The metrics endpoint looked cached at a ~1 min scrape; use a
   ≥5 min gap. Correlate with prod p95/p99 statement times (`pg_stat_statements` max/mean) and with
   any user-facing latency we log. Recommend Micro / Small / Medium with the evidence and the monthly
   cost. Same question for the QA branch: should it match prod so the gate measures real latency?
2. **Where does database time go?** `pg_stat_statements` in prod: top 20 by total time, by calls,
   and by max. Include `shared_blks_read` and `temp_blks_written`. Split the results into user-path
   (chat, capture, brief), background (queue, crons, polling), and waste.
3. **What does idle cost?** Count the polling calls per minute with zero users active. Which could
   become event-driven? Candidates: queue wake via LISTEN/NOTIFY or Realtime (a worker wake already
   exists, see Tasker 101), a longer idle poll with backoff, fewer replicas when idle. Which Vercel
   crons touch only the DB and could be `pg_cron` jobs? pg_cron is not installed on QA; check prod.
4. **Hot rows and write amplification:** per-turn updates to `chat_turn_runs` and
   `chat_turn_stream_state`. Why are there no HOT updates? Likely an index on an updated column or
   no fillfactor headroom. Check per-table autovacuum settings, bloat, and dead tuples. Estimate
   what `FOR UPDATE` → `FOR NO KEY UPDATE` in the per-turn RPCs would buy. Recommend it; the change
   itself belongs to Tasker 102's follow-ups.
5. **Storage and retention:** the largest tables and indexes in prod (`chat_turn_events`,
   `chat_prompt_snapshots`, `llm_usage_logs`, `queue_jobs`, `chat_turn_input_artifacts`, …).
    - Which have retention jobs, and do those jobs run?
    - Which indexes are unused (`idx_scan = 0`) and which large tables are seq-scanned?
    - Would TOAST compression (lz4) help the big jsonb rows?
    - What would it take to get the working set under RAM?
6. **Connection and API layer:**
    - Pool size, Supavisor vs direct connections, and connection counts by application.
    - The 8 s timeouts: should telemetry RPCs get a short `lock_timeout` so they fail fast instead of
      holding a pool slot?
    - Would the Railway worker's hottest RPCs be faster over a pooled direct Postgres connection than
      over PostgREST HTTP? The Libri worker already uses `pg` directly.
7. **Supabase features, under- or over-used:**
    - Run the performance and security advisors (`GET /v1/projects/{ref}/advisors/performance` and
      `/advisors/security`, or the dashboard equivalents) and triage every finding.
    - Branching health: why `MIGRATIONS_FAILED`, and should the gate branch be persistent and sized?
    - Realtime broadcast volume per turn.
    - Log drains / observability: we could not get CPU or IO-budget history with the CLI token. Find
      what access would.
    - Anything else (read replica, disk IO add-on, PITR) worth or not worth it at our scale.
8. **Region fit:** confirm where Vercel functions, the Railway workers, and the DB actually run
   today, and what the round-trip cost per chat turn is in prod.

## Deliverables

1. **A decision brief** DJ can scan in two minutes, published as an artifact. It gives a ranked list
   of changes. For each: the evidence, the user-visible effect, the monthly cost, the risk, and
   whether it's reversible. Mark the 1–3 that need DJ's decision (for example "resize prod to Small,
   +$5/mo" or "size the QA branch to match prod"). Use our real numbers, not generic Postgres
   advice.
2. **A reusable read-only health kit** in `scripts/supabase-health/`, so this is a command next
   time, not an investigation:
    - metrics snapshot plus a paging-rate sampler;
    - `pg_stat_statements` top-N;
    - table, index, and vacuum health;
    - advisors;
    - lock-wait search in Postgres logs.
      Every script takes a project ref, refuses to write (`read_only: true` on `database/query`), never
      prints secrets, and says clearly which project it is talking to.
3. A short findings section appended to this file. Update `tasker/README.md` status.

## Access (read-only)

- Management API token: `~/.supabase/access-token` → `https://api.supabase.com` (`/v1/projects`,
  `/v1/projects/{ref}/billing/addons`, `/v1/projects/{ref}/branches`,
  `POST /v1/projects/{ref}/database/query` with `"read_only": true`, and
  `/v1/projects/{ref}/analytics/endpoints/logs` for Postgres logs; `logs.all` was removed 2026-09-23).
- Metrics: `https://{ref}.supabase.co/customer/v1/privileged/metrics` with basic auth
  `service_role:<service key>`. Prod's key is `PRIVATE_SUPABASE_SERVICE_KEY` in `apps/web/.env`, QA's
  in `.env.agentic-gate.local`. Never print either.
- **Landmines:**
    - `supabase db query --linked` in this repo is **production**. Never run `supabase link`.
    - Branch refs return 404 from `GET /v1/projects/{ref}`; use the parent's `/branches` listing.
    - Don't run `pg_stat_statements_reset()`. Don't run `count(*)` on big prod tables; use
      `pg_stat_user_tables` / `pg_class.reltuples`.
- The Tasker 102 subagent's method (10 s latency buckets from gate logs, a log-explorer query for
  lock waits) is described in `tasker/102-gate-case13-db-stall-permanent-failure.md` § Work log.
  Rebuild it into the health kit rather than hunting for the old scratch scripts.

## Acceptance

- Every recommendation cites a measured number from prod or QA. No recommendation relies only on
  generic best practice.
- The paging question (1) is answered with a rate, not a cumulative counter.
- The health kit runs end to end against QA and prod, read-only, and its output is checked in as a
  dated baseline, secrets redacted.
- No setting, size, or schema changed anywhere without DJ's recorded OK.

## Findings delivered — 2026-09-24

Owner: **Codex**. [Two-minute decision brief](../docs/technical/reviews/SUPABASE_FITNESS_DECISION_2026-09-24.md),
[detailed audit](../docs/technical/reviews/SUPABASE_FITNESS_AUDIT_2026-09-24.md),
[dated evidence and query reports](../docs/technical/reviews/supabase-health/2026-09-24/README.md),
and [reusable health kit](../scripts/supabase-health/README.md) are delivered.

- **Sizing:** two ≥5-minute production samples measured 1.38–3.21 MiB/min swap-in and
  0.18–0.37% CPU iowait. No sustained production thrashing demonstrated. Recommend production
  Micro + QA Micro (expected **+$0** because paid Nano already bills at Micro); production Small
  is an optional **+$5.23/730 h** precaution, both Small **+$10.45**. No resize performed.
- **Spend:** authenticated dashboard projects **$65.28 for the organization**, including three
  projects, the persistent branch and custom domain. No usage overages; two other projects
  consume ~$19.62/730 h combined. Queue optimization reduces capacity demand, not a per-query fee.
- **Latency and waste:** 408,669/465,179 REST calls in 24 h (**87.9%**) are queue claims, whose
  SQL averages **0.16 ms**. Adaptive fallback polling with existing wake notifications is the
  clearest call-reduction opportunity. Full top-20 SQL reports and route p95/p99 are saved.
- **Reliability first:** 1,753 recovery/reaper RPC 404s ended at 15:03 UTC; later cron records
  succeeded. QA gate snapshot p95 **3.51 s**, max **11.85 s**. Continue Tasker 102 lock/snapshot
  work and deployment verification; RAM does not fix schema/locking defects.
- **Write/storage:** stream state has **88,525 updates, zero HOT**, with `updated_at` indexed;
  QA prompt/input artifacts occupy **192 MiB**. Coordinate retention with Tasker 103 and review
  the actual read need before changing indexes. No deletes, vacuum, or index changes performed.
- **Security/branch:** all **4,018** final advisor findings received an initial disposition.
  Three Tasker 76 definer RPCs retain client execution grants. QA's original migrate step died
  September 11; manual schema/ledger drift remains. Prioritize reviewed containment and parity.
- **Geography:** current Vercel runtime is **sfo1** and four chat workers are **us-west2**;
  general/Libri workers remain east. The earlier Vercel mismatch is no longer in that deployment.

Validation: the kit ran end to end against both projects with **zero unavailable sections**;
explicit read-only transactions verified `on` on both; **six offline safety checks passed**.
Baselines are compressed/redacted. No remote configuration/data changes or paid tests ran.

**Still open:** simultaneous busy-period paging/CPU-burst/I/O-budget history, exact original branch
migration error, and fresh worker RTT/per-turn attribution. Quiet sampling and historical gate/API
logs support the options but do not close those measurements. A paid gate requires separate
approval; no live regression is claimed fixed. Keep this tasker open for these decisions/validation.

## Follow-up: work order and queue wake — 2026-09-24, 17:40–17:45 UTC

**DJ decision: keep the persistent QA branch.** No deletion, pause or resize is authorized by that
decision. [Updated work order and polling investigation](../docs/technical/reviews/SUPABASE_WORK_ORDER_AND_QUEUE_WAKE_2026-09-24.md)
contains the proposed sequence and validation criteria.

1. **Contain security first (76):** all three known elevated RPCs still allow anonymous/client
   execution. Live bodies were rechecked: global subscription/revenue read, migration-platform lock
   mutation, and phase-date writes without membership authorization. Map callers, prepare focused
   grants/search-path changes, prove positive/negative access locally, then seek deployment approval.
2. **Maintenance now works:** since 15:04 UTC, 2,575 recovery and 156 reaper requests returned 200;
   157 cron receipts succeeded. Both functions have correct service-only grants. Preserve the fix
   and add deployment preflight/last-success monitoring; do not treat the earlier 404s as ongoing.
3. **Finish reliability and its approved validation (101/102):** remaining snapshot lock/write
   work, relevant QA schema parity, and a new stream-delivery signal: one worker retains 331 recorded
   broadcaster failures. Its queue-wake subscription is healthy; idle state can retain old failures.
4. **Then reduce chat idle polling:** all four production chat workers start with 1 s polling,
   all four received the same latest private wake. Proposed policy: immediate claim on wake/refill/
   connection catch-up, ~5 s jittered safety poll when wake is healthy, 1 s fallback on transport
   outage/disable. Preserve fallback for missed wakes and recovery requeues. Expected chat idle
   polling reduction 240→48/min (80%); implementation and paid gate are not yet authorized/run.
5. **Separate delegated jobs:** `delegate_task` atomically enqueues an `agent_run` for the general
   worker, whose live interval is already 5 s. It emits no chat wake; general enqueue is not an
   automatic notification mechanism. Do not remove its polling based on chat's wake feature.
6. **Retention/query tuning, then sizing:** coordinate with 103; keep production Micro until busy
   measurement or an explicit headroom decision. Keep QA as requested.

This follow-up changed documentation only. Live inspection used catalog/log/health reads; no
security exploit call, model run, runtime change or remote mutation was performed.

## Implementation pass — 2026-09-24

See the [implementation and rollout notes](../docs/technical/reviews/SUPABASE_CONTAINMENT_IMPLEMENTATION_2026-09-24.md).

- Prepared migration `20260924202321_contain_legacy_admin_rpcs`: remove unused phase-date RPC
  with dependency protection; keep phase data; retain the two used admin functions as
  service-only invokers with safe fixed search paths. Included a tested rollback that keeps
  client execution blocked. No hosted schema changes yet.
- Added a read-only preflight for recovery signatures, grants, configuration, migration versions,
  and optional recent cron success. Production passes all maintenance checks. QA's function
  checks pass, but its three expected recovery migration ledger entries are missing; Tasker 63
  now records the exact gap.
- Validation: 21 health/preflight/Postgres checks and five existing admin-route tests pass;
  local migration naming/duplicate guard passes. No paid run started.
- DJ removed the mandatory per-change-set gate from `AGENTS.md`; the gate guide is aligned.
  Paid runs still require explicit approval. Implemented the five-second healthy-wake safety
  poll (0–250 ms jitter), one-second unavailable-wake fallback, initial-subscription catch-up,
  coalescing and deadline reset. General-worker/cancel/lease/recovery cadence remains unchanged.
  101 focused worker tests pass; source and test typechecking pass. Runtime rollout remains pending.
- [Fresh migration verification](../docs/technical/reviews/SUPABASE_MIGRATION_STATUS_2026-09-24.md):
  only one uncommitted migration exists, the new containment patch. It is absent from both
  live schemas and ledgers, so it is not staged. Today's production-recorded recovery/privacy
  files are already committed. Project-lock-first is present on QA but not production;
  email-scan table exists on both, but its version is not recorded. No hosted writes occurred.

## Complete local migration audit — 2026-09-24

DJ requested every local SQL migration be checked against production. The
[complete report](../docs/technical/reviews/SUPABASE_MIGRATION_STATUS_2026-09-24.md),
[484-row checklist](../docs/technical/reviews/supabase-health/2026-09-24/production-migration-checklist.csv),
and [full unrecorded list](../docs/technical/reviews/supabase-health/2026-09-24/production-unrecorded-migrations.md)
cover all 477 active files and seven archived backups.

- 220 exact version/name entries and two alternate-timestamp entries match production history.
  The two alternate entries also match complete normalized SQL.
- 255 active files have no matching history; 234 predate the earliest retained entry. Four recent
  changes are confirmed absent: containment, task-create lock-first, onboarding activation progress,
  and Libri unissued-upload quota settlement. The Libri file has an explicit application rollout
  prerequisite; it is not a standalone deployment recommendation.
- Ten unrecorded files have matching live effects, including complete schema verification for
  email-scan checks. The other 241 historical files remain unverified at the effect level.
- Recorded history also differs in places: the live email-review `wrong_project` constraint omits
  the non-null corrected-project requirement in local SQL. The report identifies all nine recorded
  SQL exceptions, including missing SQL, comments, superseded functions, and corrected live bodies.
- No production writes or new staging occurred. Tasker 63 carries the historical reconciliation;
  the full unrecorded list must not be replayed wholesale.
