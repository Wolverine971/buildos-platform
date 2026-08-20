<!-- docs/specs/question-tree-admin-experiment-runbook.md -->

# Question Tree Admin Experiment — Test Runbook

**Implemented:** 2026-08-01  
**Admin route:** `/admin/experiments/question-tree`

## What this test does

The experiment starts with one question, creates two to five broad research branches, and then
selects the highest-value follow-up questions from a global frontier. Each model-only agent answers
one question and may propose zero to three more questions. The original question is node `0`; the
configured ceiling applies to descendant nodes and can never exceed 100.

There are no tools or web searches in V1. Every OpenRouter call contains messages plus a strict JSON
contract only. The UI labels the result as model-only analysis.

## One-time database setup

Apply these four migrations to the same development Supabase project, in this order:

1. `supabase/migrations/20260801040000_admin_question_tree_queue_type.sql`
2. `supabase/migrations/20260801040100_admin_question_tree_experiment.sql`
3. `supabase/migrations/20260801040200_question_tree_realtime.sql`
4. `supabase/migrations/20260801040300_question_tree_resilience.sql`

The queue enum is intentionally isolated because PostgreSQL enum additions need to be committed
before the new value is used by later functions. This repository currently has other pending local
migrations, so do not run a sweeping `supabase db push` against a shared project. Apply these exact
files through the project's controlled migration workflow or an isolated migration worktree.

The implementation expects the normal BuildOS `queue_jobs`, `admin_users`, `add_queue_job`, and
`set_updated_at` database objects to already exist.

## Required environment

The web and worker must point at the same Supabase project. The worker needs at least:

```env
PUBLIC_SUPABASE_URL=...
PRIVATE_SUPABASE_SERVICE_KEY=...
PRIVATE_OPENROUTER_API_KEY=...
PRIVATE_RAILWAY_WORKER_TOKEN=...
PUBLIC_APP_URL=http://localhost:5173
```

The web app also needs its normal Supabase URL, anon key, and service-role key. Use an account present
in `admin_users`; non-admin users receive `403` from every experiment API.

## Start locally

From the repository root, use two terminals:

```bash
pnpm --filter @buildos/web dev
```

```bash
pnpm --filter @buildos/worker dev
```

Confirm the worker is healthy at `http://localhost:3001/health`, sign in as an admin, then open:

```text
http://localhost:5173/admin/experiments/question-tree
```

## First smoke test

Use the paid lane first and set the node ceiling to `8` or `12`. This tests the whole lifecycle for
well under the default two-cent run ceiling without waiting for a 100-node run.

Suggested question:

> What would have to be true for small teams to make consistently better decisions with AI, and
> what evidence would most strongly disprove that thesis?

Expected behavior:

1. The root node appears immediately after submit while the seed agent is queued or running.
2. The responsive **Live execution** grid reports **Live websocket** and records the root agent
   firing without creating horizontal page overflow.
3. Two to five first-level nodes animate into the graph after the seed call.
4. Every claimed node reports **Node N fired**, changes to `running`, and then displays its answer
   and produced questions without a manual refresh.
5. Up to four paid-lane agents or two free-lane agents are shown during a batch.
6. Selecting a node shows its question, answer, epistemic assessment, and every question it
   proposed—including proposals the scheduler did not select.
7. Search matches node questions, answers, theses, and proposal text.
8. The tree may stop before the configured ceiling when no remaining proposal clears the value
   threshold.
9. The run ends as `completed` or `completed_partial` and displays the final synthesis at the top.
10. Zooming or panning to a node remains stable while new nodes join the graph; the canvas never
    automatically fits the entire growing tree.

If the realtime channel cannot connect, the badge changes to **Recovery polling** and the active run
continues reconciling from the detail API every 12 seconds.

After that passes, repeat with a ceiling of `100`. The paid lane is the reliable default. The strict
free lane pins `inclusionai/ling-3.0-flash:free`, waits at least 35 seconds between batches, and pauses
on free quota exhaustion instead of silently spending money.

## Controls and recovery

- **Pause** prevents new work. In-flight question calls may finish and are persisted, but their new
  frontier is not admitted until the run resumes.
- **Resume** schedules a fresh advance. A still-leased node is reclaimed only after its five-minute
  lease expires.
- **Cancel** marks remaining nodes and proposals cancelled and rejects late results.
- **Retry failures** requeues failed question nodes without creating extra node numbers.
- Selecting one failed question node exposes **Retry this node**, which atomically requeues only
  that node and resumes exploration.
- A strict-free `429` produces `quota_paused`; use **Resume** after the provider quota resets.
- Provider `429`/`503` responses honor `Retry-After` and use bounded exponential backoff. Paid
  requests can fall through to another eligible provider for the same pinned model.
- Truncated model JSON is repaired locally when a complete prefix can be recovered. Missing
  `whyItMatters` and `targetClaim` are tolerated and filled with safe defaults.

## Verification commands

```bash
pnpm --filter @buildos/shared-types build
pnpm --filter @buildos/worker typecheck
pnpm --filter @buildos/web check
pnpm --filter @buildos/worker exec vitest run \
  tests/questionTreeScheduler.test.ts \
  tests/questionTreeModelAdapter.test.ts \
  tests/questionTreeWorker.test.ts
pnpm --filter @buildos/web exec vitest run \
	 src/lib/services/question-tree/realtime.test.ts \
	 src/routes/api/admin/experiments/question-tree/runs/server.test.ts \
	 'src/routes/api/admin/experiments/question-tree/runs/[runId]/nodes/[nodeId]/retry/server.test.ts'
```

The SQL contract test is `supabase/tests/20260801040100_admin_question_tree_experiment.test.sql`.
It is designed for the disposable base in `supabase/tests/fixtures/question_tree_minimal_base.sql`,
not for a linked or shared database.
