<!-- docs/plans/AGENTIC_CHAT_WORKER_WRITE_PATH_HANDOFF_2026-08-21.md -->
<!-- doc-status: point-in-time -->

# Agentic Chat worker write path — handoff

**Written:** 2026-08-21 ~19:10 EDT, at DJ's request to stop and hand off.
**Read first:** this file, then
[`AGENTIC_CHAT_WORKER_WRITE_PATH_ROLLOUT_RESULT_2026-08-21.md`](./AGENTIC_CHAT_WORKER_WRITE_PATH_ROLLOUT_RESULT_2026-08-21.md)
(what shipped and every live failure explained), then
[`AGENTIC_CHAT_WORKER_ORGANIZE_MULTIUPDATE_FAILURE_INVESTIGATION_2026-08-21.md`](./AGENTIC_CHAT_WORKER_ORGANIZE_MULTIUPDATE_FAILURE_INVESTIGATION_2026-08-21.md)
(why it was broken). Plan that was executed: `~/.claude/plans/pure-sauteeing-flute.md`.

## 0. Late continuation: terminal recovery fixed locally and real-model organize passed

The two apparent terminal-event failures were most consistent with the local test process being
suspended: a 315-second harness timeout returned after 1,200,905 ms / 1,017,582 ms, and the
450-second Vitest deadline was delayed too. Both workers completed while the local Realtime client
and timers were paused. On resume, the overdue timeout could beat the watchdog reconciliation.

Local, not yet committed or deployed:

- reconciliation requests now have a 15-second bound and retry instead of letting one stuck request
  pin the watchdog indefinitely;
- the worker harness gives durable reconciliation one final 30-second recovery window before
  classifying a missed terminal broadcast as a transport failure;
- deterministic regressions cover a stuck reconcile request and the deadline/wake recovery path.

Validation: 40 surrounding worker transport tests + 10 harness boundary tests pass; full web
`svelte-check` has 0 errors / 0 warnings; the zero-spend production preflight passes. A zero-retry
real-model `project-organize` run then passed in 144 seconds. Durable turn
`23e10f36-a39e-4728-be8d-da43e4e21593` completed with 3 successful folder creates and all 6 moves;
all 15 model calls succeeded (`deepseek/deepseek-v4-flash` acting,
`openai/gpt-5.6-luna` review), total model cost $0.04252292. This run did not enable Phase 0 capture,
so it has database evidence but no JSON evidence artifact.

**Next:** commit the four code/test files plus this note with explicit pathspecs, deploy the web
runtime when worker active turns are zero, then run one post-deploy isolated organize turn. A broad
battery is not warranted until that post-deploy transport check passes.

## 1. State of the world right now

| Surface                       | State                                                                                                                                                                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`                        | `24c1d2f7b` pushed. Seven commits today: `4816f6769` write path, `4d28b2d1f`, `70cf7f357`, `16670602c`, `cdab55003`, `24c1d2f7b` (all worker/runtime fixes found by live turns), plus a local docs commit (see §6).                                                     |
| Railway `agentic-chat-worker` | Serving `24c1d2f7b`, healthy, `AGENTIC_CHAT_MUTATION_PROVIDER_CAPABILITIES` = `…ADAPTER_CAPABILITIES` = **all 20 reviewed capabilities**. `/health.agenticChat.mutationCapabilities` reads back 20/20/20. Cohort unchanged: DJ's canary user + the e2e harness account. |
| Vercel `build-os.com`         | Serving the matching web build (the worker takes `declare_turn_contract`'s schema, now with `label`/`parent_label`, from the web-signed artifact).                                                                                                                      |
| Supabase prod                 | Migration `20260822010000_agentic_chat_execution_observation_rejected_tool.sql` applied (receipt-isolated workdir; remote "up to date").                                                                                                                                |
| Scratch                       | Clean worktree at `scratchpad/battery-wt` (session scratchpad; disposable). No background processes left running.                                                                                                                                                       |

**Product outcome on the deployed worker, zero retries:** `task-multi-update` 4/5 then 3/3;
`project-organize` went from 1 pass in 22 turns to 2/3 judged passes in the last run (the third
turn executed every create and move too — see §3) with judge scores of 5/5.

## 2. What is live (one paragraph per work package)

- **Parent-by-title moves on the worker.** `move_document_in_tree` accepts `new_parent_title`;
  the gateway returns `parent_id`/`parent_created`; the adapter proves placement against the
  receipt; the write ledger records the resolved parent. The organize execution nudge
  (`buildOrganizeCommissionRepairInstruction`) runs after contract approval and in the write
  carve-out.
- **Symbolic contract references.** `create` outcomes carry `label`, `move`/`organize` outcomes
  carry `parent_label`; the parser requires a declared title per labelled create;
  `bindTurnContractLabels` binds by `titleKey` (NFKC, alphanumerics, case-folded) from create
  receipts or title moves; the worker authorizes a move when `new_parent_id` equals the binding or
  `new_parent_title` matches the declared title; the batch reviewer sees "Resolved contract labels".
- **Reviewer context.** Field semantics are projected from the advertised tool schemas
  (`describeContractValueSemantics`), each tool's required arguments are listed for batch review
  (`describeBatchRequiredArguments`), guidance covers delegated organization, postconditions,
  implementation defaults, day-without-time, and no added state transitions; two revisions per lane.
- **Completion continuation.** After the first mutation round, an approved contract with outcomes
  no write has touched gets one write-only pass listing them with bound ids — in both the normal
  continuation and the forced-synthesis branch (read-loop escalation is monotonic).
- **Repairs instead of failures.** Acting-model calls to reviewer-only controls
  (`approve_mutation_batch_review` etc.) are a one-shot repair; a contract declared on a surface
  with no write tool becomes a read-only continuation (no reviewer passes).
- **Candidate gate narrowed** to singular references: it fires only when the contract covers fewer
  than two of the reviewer's listed candidates.
- **Review transition ids** include the logical provider round (an identical re-declaration no
  longer collides); publisher block outcomes name the database guard; typed failure logs carry
  `publisher_block_outcome` and `rejected_provider_tool_name`.
- **Operator/harness.** `/health` reports capability names/counts and advertised write tools; the
  harness preflight fails closed unless the worker advertises a scenario's
  `requiredMutationTools` (needs `PRIVATE_AGENTIC_CHAT_WORKER_URL`); rejected tool names are retained
  in provider observations and the evidence artifact; `pnpm compare:agentic-evidence <a> <b>`.

## 3. Evidence trail (all under `docs/plans/evidence/`, newest last)

| Artifact                                                                  | Result                                     | What it taught                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `…writepath_smoke_organize_transition_conflict_2026-08-21_4d28b2d1f.json` | organize ✗                                 | identical re-declare collided on the review transition id → fixed `70cf7f357`                                                                                                                                                                                                                      |
| `…writepath_smoke_organize_pass_2026-08-21_70cf7f357.json`                | organize ✓ judge 5                         | labels → creates → bound moves, end to end                                                                                                                                                                                                                                                         |
| `…writepath_six_scenario_battery_2026-08-21_70cf7f357.json`               | **23/30** vs 11/18 prior                   | organize stopped after creates (no completion pass); reviewer mimicry; two reviewer nits → `16670602c`                                                                                                                                                                                             |
| `…writepath_confirm_three_scenario_2026-08-21_16670602c.json`             | multi 3/3, task-complete 3/3, organize 1/3 | same stop-after-creates via the forced-synthesis branch → `cdab55003`                                                                                                                                                                                                                              |
| `…writepath_organize_x3_2026-08-21_cdab55003.json`                        | organize 1/3                               | candidate gate converted two approvals into clarifications → `24c1d2f7b`                                                                                                                                                                                                                           |
| `…writepath_organize_restraint_x3_2026-08-21_24c1d2f7b.json`              | organize 2/3, restraint 2/3                | **both failures are harness-side**: turns `33c9a255` (organize: 4 creates + 6 moves executed, completed 22:28:18Z) and `e8f789cf` (restraint, completed 23:00:35Z) finished in the database, but the harness never received the terminal event and reported "did not terminate" after ~1000–1200 s |

To explain any turn, read the database, not the artifact:
`cd apps/web && node scripts/agentic-e2e/dump-turn-decisions.mjs <artifact.json> out.json [scenarioId] && python3 scripts/agentic-e2e/render-turn-decisions.py out.json`
(loads `.env` via `set -a; source .env; set +a`).

## 4. Open items, ranked

1. **Harness terminal-event miss (fixed locally; release pending).** The 1,017–1,201 s observed
   waits also exceeded the 315 s harness timeout and the 450 s Vitest deadline, making local process
   suspension the best fit for the evidence. The worker had already completed both turns. The local
   fix bounds each reconcile request at 15 s with retry and gives an overdue terminal deadline one
   final 30 s durable-reconciliation window. Deterministic stuck-request and missed-terminal tests,
   the live preflight, and one zero-retry real-model organize turn pass. Remaining work is the
   commit/deploy/post-deploy isolated check described in §0.
2. **Organize remaining behavior nits** (each cost a revision, not a failure): the batch reviewer
   still sometimes returns creates for carrying `content`; the first declare usually omits the
   title `changes` (the parser repairs it in one round). Consider putting the labelled-create shape
   in the `declare_turn_contract` description example, and treating `content` on a new container
   explicitly as a default in the batch prompt (one sentence already added in `cdab55003`).
3. **Reschedule over-clarification** ("what time?") and **multi-update in_progress** — guidance
   shipped in `16670602c`; not yet re-measured at 5 reps.
4. **Organize rep failed at seed in 5 s** once in the 5-rep battery (`project-organize 1/4`) —
   harness seed flake; unexplained.
5. **`rejected_tool_name` observation** was absent on the task-complete mimicry turn — the
   `provider_attempt_ended` row was never written (the rejection happens after stream completion
   and the row was replay-locked). The typed failure log has the name; the durable row does not.
6. Railway "Wait for CI" is still off for `agentic-chat-worker`.
7. Docs say the cohort is "exactly one UUID" in several older handoffs; the Railway handoff was
   updated, the others were not.

## 5. How to run things

- Zero-spend preflight (proves lease **and** write surface):
  `AGENTIC_E2E_WORKER_PREFLIGHT_ONLY=true AGENTIC_E2E_BASE_URL=https://build-os.com AGENTIC_E2E_EXECUTION_MODE=worker_realtime PRIVATE_AGENTIC_CHAT_WORKER_URL=https://agentic-chat-worker-production.up.railway.app AGENTIC_SCENARIOS=project-organize,task-multi-update pnpm --filter @buildos/web exec vitest run --config vitest.config.agentic.ts src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts --retry=0`
- Paid battery with evidence capture needs a **clean tree**: `git worktree add <dir> <sha>`,
  `pnpm install --frozen-lockfile --offline`, build `shared-types agentic-chat-runtime shared-agent-ops shared-utils supabase-client smart-llm`,
  copy `apps/web/.env` in (gitignored), then from `<dir>/apps/web` run the invocation in
  `AGENTIC_CHAT_WORKER_PHASE_6_PHASE_4_BATTERY_FAILURE_INVESTIGATION_HANDOFF_2026-08-20.md` §3.1
  with `AGENTIC_PHASE0_CAPTURE=true`, `AGENTIC_PHASE0_REPETITIONS=5`, `AGENTIC_E2E_RETRY_COUNT=0`,
  `PRIVATE_AGENTIC_CHAT_WORKER_URL=…`, and `AGENTIC_PHASE0_OUTPUT_PATH=…`. Launch with `nohup … &`
  — a 30-turn battery takes ~45 min and the tool runner kills foreground/background commands at
  10 min. Poll for the artifact file.
- Compare: `cd apps/web && pnpm compare:agentic-evidence docs/plans/evidence/<baseline>.json <candidate>.json`.
- Deploy: push `main` only while `/health.checks.activeTurns === 0`; the worker picks up the new
  release in ~5 min; Vercel builds concurrently.
- Migrations: never `supabase db push` from the main directory (remote ledger 120 receipts vs 365
  local files). Copy `supabase/.temp` + only remote-receipt migrations + the new file into a
  scratch workdir; `supabase db push --linked --dry-run --workdir <dir>` must name exactly the new
  file; then push with `--yes`; then a second dry run must say "up to date".

## 6. Uncommitted / local-only

- The original docs + evidence commit `43629d776` is now on `origin/main`. The late continuation in
  §0 and the terminal-recovery code/tests remain uncommitted and undeployed.
- Unrelated working-tree changes remain. Always stage and commit this work with explicit pathspecs.
- Memory: `~/.claude/projects/-Users-djwayne-buildos-platform/memory/project_worker_writepath_rollout_2026-08-21.md`.
