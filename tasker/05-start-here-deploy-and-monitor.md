<!-- tasker/05-start-here-deploy-and-monitor.md -->

# 05 — Project START HERE doc: deploy, backfill, monitor

**Priority:** P1 — feature is built; this is the ship + watch
**Type:** Engineering (deploy + ops)
**Source:** `apps/web/docs/technical/architecture/PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md`

## State

P0–P6 are **implemented and tested** (12/12 regression tests green in `apps/web/src/lib/services/ontology/start-here.regression.test.ts`). All paths wired: chat context loader, lite-prompt injection (before `focus_purpose`), snapshot worker (`build_project_context_snapshot`, registered `worker.ts:465`), session-end capture proposals, daily-brief excerpts, recency-guard migration `20260624000000_start_here_managed_region_recency_guard.sql`. No blocking TODOs.

## Loose ends (re-verified against prod 2026-07-01)

1. ~~Migration not confirmed deployed~~ — **FIXED & VERIFIED 2026-07-01.** Original guard (20260624) was dead in prod: `search_vector` is a STORED GENERATED column, NULL in `NEW` at BEFORE-trigger time, so the `to_jsonb(new) = to_jsonb(old)` comparisons never matched (the 20260616 outline branch was equally dead since birth). Fix migration `20260701000000_fix_recency_guard_generated_column.sql` deployed by DJ; behavioral re-test in prod passed (managed-only content tweak + restore left `updated_at` untouched). NOTE: any future GENERATED column on `onto_documents` must be subtracted in the trigger or the guard silently dies again.
2. ~~Backfill script not yet run~~ — **DONE.** All 84 planning/active projects have a `document.context.project` doc (0 missing). Creation-date burst of 57 docs on 2026-06-24 = the backfill run.
3. **Session-end capture live but low volume** — 4 "Update project START HERE" agent runs exist (2× 6/24 completed, 2× 6/28 partial, across 2 projects). Snapshot worker healthy (8/8 recent `build_project_context_snapshot` jobs completed). Not enough volume yet to judge the noise bar.
4. **P7 "Librarian" reconciliation deferred** — dedup/cross-link/cleanup background pass. Blocked on real capture volume + project-loop maturity ([[04-project-review-loops]]). Not a now-task.

Note: the 12/12 regression tests use a fake Supabase client and never exercise the SQL trigger — that's why the guard bug shipped green.

Known data blemish: doc `6029b8b2-ad8f-4d7a-8098-2a48966af667` ("START HERE - Context Ventures Meeting Preparation") had its `updated_at` bumped 6/24→7/01 by the verification probe (content fully restored). Optional restore once fix is live, run with trigger-aware SQL:
`update onto_documents set updated_at = '2026-06-24T15:30:03.122233+00:00' where id = '6029b8b2-ad8f-4d7a-8098-2a48966af667';` (works post-fix only if run with the trigger disabled, or just leave it).

## Creation gate (added 2026-07-01)

`ensureProjectStartHereDocument` now refuses to CREATE a Start Here doc when the project is deleted (`deleted_at`), archived (`archived_at`), or in state `cancelled`/`archived` — returns `{ok:true, skipped:true, reason}` instead. Existing docs are still returned/refreshed on inactive projects (read paths unaffected). Propagated through `refreshProjectStartHereManagedRegions`; callers (capture processor, snapshot worker, backfill script) handle the skip. Prod audit found 0 stray docs on the 21 inactive projects, so no cleanup was needed.

## Next action

1. After a few days of live sessions, sample `proposal_ready` capture runs and judge the "durable enough" bar (design open question #2). Tune the capture prompt if noisy.

## Done when

A first batch of capture proposals reviewed for quality.
