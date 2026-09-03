<!-- tasker/80-agentic-chat-post-audit-follow-through.md -->

# 80 — Agentic chat post-audit follow-through

**Created:** 2026-09-02

**Status:** In progress — WP-0 locally complete; CI receipt pending push

**Priority:** P1 (WP-1 gates the paid-launch proof in Tracker 78; WP-2 removes the last second
chat harness)

**Type:** Production proof, harness consolidation, resumability, cost, skill quality, telemetry

## Kernel

On 2026-09-02 the turn-executor audit
([`AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md`](../docs/technical/reviews/AGENTIC_CHAT_TURN_EXECUTOR_AUDIT_2026-09-02.md))
was written and every finding was fixed the same evening (its §11 lists each finding, its status,
and the files). The fixes, the `TurnPhase` reducer refactor, and the supervisor deletion are
committed in `f28e8f7bc` and deployed. Three things are still true:

1. **Nothing has been proven in production yet.** The fixes touched 129 files on the strength of a
   14-day evidence pull. The same pull has to be run again against the new code.
2. **A second chat harness still exists.** Daily-brief, calendar, and email turns run on the web
   `stream-orchestrator` with its own supervisor because their tools are not worker-executable.
   Everything that survived the refactor only for that lane (runtime `supervisor/` modules, web
   `turn-supervisor/` shims, two parity goldens, one eval scenario) is waiting on this.
3. **The refactor's payoff is unclaimed.** The turn is a state value now, so a worker restart
   mid-write can resume instead of failing, and the reviewer's cost can be measured and cut.

## How to run this tracker

- Work the packages **in order**; each one's exit criteria gate the next. Do not start WP-2 until
  WP-1's report exists, and do not start WP-4 until WP-1 has seven days of data.
- Before each package, re-read the audit §11 row(s) it touches and the lane report it cites. The
  point-in-time appendices live in
  `docs/technical/reviews/agentic-chat-turn-executor-audit-2026-09-02/`.
- Production data is read-only. Reuse the evidence scripts in that directory's `evidence/`
  (`pull.mjs` shows the pattern: read `apps/web/.env`, service key, `select` only, never print
  keys or emails).
- Validate with the narrowest gate first, then the package gates: worker
  `pnpm --filter @buildos/worker exec vitest run` + `typecheck` + `lint`; runtime `test:run` +
  `typecheck` + `build`; web `pnpm --filter @buildos/web check` + `exec vitest run` + `lint`;
  `node scripts/docs/check-doc-health.mjs`. The worker `test:run` script ignores `-- <pattern>`;
  call vitest directly for narrow runs.
- Commit per package with an explicit pathspec (`git commit -- <paths>`); DJ pre-stages unrelated
  work. Migrations go to production before the app deploy that needs them.
- Stop and ask DJ only at the forks listed under **Decisions for DJ**. Everything else is the
  agent's call; record it in the package's receipt section of this file.

## WP-0 — Loose ends from 2026-09-02 (half a day)

- `supabase/tests/20260802031000_agentic_chat_worker_execution_recovery.test.sql` gained a
  69-line backoff-timing block (eight cases) that never ran locally (Docker was down). Run it
  through the postgres test lane (`apps/web/src/lib/services/agentic-chat-v2/*.postgres.test.ts`
  drive `supabase/tests`), fix anything it catches, commit it.
- Confirm migration `20260902150000_agentic_chat_recovery_throttle_backoff_seconds.sql` applied
  in production: the live `recover_agentic_chat_turn` body must contain
  `WHEN v_failure_class IN ('provider_throttle', 'timeout_pre_start')`. Cheapest read-only proof:
  the next `provider_throttle` requeue in `queue_jobs` has `scheduled_for - updated_at` under
  70 seconds.
- Grep for `AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED` in Railway/Vercel env (not the repo; the repo
  is clean) and remove the variable so nobody thinks it does anything.

**Exit:** SQL test green in CI and committed; migration proven live; env variable gone.

### WP-0 receipt — 2026-09-03

- Re-ran the disposable PostgreSQL recovery lane on PostgreSQL 16.13 with
  `pnpm --filter @buildos/web exec vitest run
  src/lib/services/agentic-chat-v2/phase2b-execution-recovery.postgres.test.ts`: **3/3 tests
  passed**, including `recovery_backoff_seconds_ok` for all eight throttle, timeout, and
  infrastructure timing cases. The 69-line timing block is already committed in
  `d9b98ea703c0cac51ba9ca4c6fb59f8b0861945d`; no corrective SQL change was needed.
- Verified production read-only through `pg_get_functiondef`: the live six-argument
  `public.recover_agentic_chat_turn` contains
  `WHEN v_failure_class IN ('provider_throttle', 'timeout_pre_start')`.
- Vercel has no `AGENTIC_CHAT_WORKER_SUPERVISOR_ENABLED` variable in any environment. Railway had
  the variable on the production `agentic-chat-worker`; deleted that exact key and re-read the
  service variables to confirm it is absent. The production worker remained healthy.
- GitHub has no checks for `d9b98ea70` because local `main` is one commit ahead of `origin/main`.
  WP-0's CI clause remains pending until that existing commit is pushed and the `CI / Typecheck,
  lint, test` job succeeds. Per the sequential gate, WP-1 has not started.

## WP-1 — Production proof of the fixes (this week; the gate for WP-2 and WP-4)

**User outcome:** DJ can see, on real turns, that turns stop dying on recoverable events, replies
are no longer mangled, and write turns cost less. Tracker 78's proof packet gets its agentic-chat
rows from this instead of from claims.

Build a committed, re-runnable health report, not a one-off. Put it at
`apps/web/scripts/agentic-health/` (next to the existing `apps/web/scripts/agentic-e2e/`) with a
`pnpm agentic:health --since <iso> [--until <iso>] [--user <id>]` entry that prints a table and
writes JSON. Compare each metric against the audit baseline (audit §2, evidence notes) using the
same tables and the same definitions:

| Metric                                                                       | Source                                                                                                             | Baseline (audit)                        | Target                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Permanent `provider_tool_finish_reason_invalid` kills                        | `chat_turn_runs.failure_code`, `agentic_chat_execution_observations`                                               | 3 of DJ's 31 turns                      | 0                                                                                                                                               |
| Truncation retries (`provider_tool_arguments_truncated`) that then completed | `agentic_chat_execution_observations` `provider_attempt_ended` payload (`error_class`, `tool_call_truncation`)     | n/a (new)                               | ≥90% complete                                                                                                                                   |
| `provider_tool_not_allowlisted` kills                                        | `chat_turn_runs.failure_code`                                                                                      | Theo Von turn + others                  | 0 (repairs instead; count `surface_repair` observations)                                                                                        |
| Reviewer prompt-cache hit rate and p50/p90 latency                           | `llm_usage_logs` where `metadata.routeId = 'openrouter_semantic_reviewer'` (`cached_tokens`, `provider`, duration) | 0% cache; Azure tail 63–73 s            | >50% cache; p90 < 30 s                                                                                                                          |
| Reviewer share of model spend                                                | `llm_usage_logs` cost by route                                                                                     | 24% since 08-28                         | falling                                                                                                                                         |
| Direct-lane vs contract-lane share of write turns                            | `chat_turn_events` timing phases / `chat_tool_executions` (reviewer passes = 0 vs >0)                              | contract for every existing-entity edit | direct lane for focused/user-given/single-hit edits; **restraint canary: the three-plausible-email-tasks case must still show a reviewer pass** |
| Control-round share of tool rounds                                           | `chat_tool_executions.tool_name` in the control set                                                                | 22.3%                                   | reported, not targeted                                                                                                                          |
| `mutation_unfulfilled` terminals and disclosure text present                 | `chat_turn_runs.finished_reason`, assistant message text contains "Done: N of M"                                   | 0 (never disclosed)                     | every partial fulfilment disclosed                                                                                                              |
| Sanitizer edits per reply                                                    | recompute with `evidence/sanitize-check.mjs` against the deployed runtime `dist` on the last 76 DJ replies         | 38/76 altered                           | ≤6/76, each a real leak                                                                                                                         |
| Skill preloads on worker turns                                               | `chat_messages.metadata.skill_preloaded_id` / `skill_preload_source`                                               | never fired on prepared hits            | fires on write turns; zero on the F7 read messages                                                                                              |
| `delegate_task` success                                                      | `chat_tool_executions`                                                                                             | 4/4 since 08-30                         | 100%                                                                                                                                            |
| Throttle requeue delay                                                       | `queue_jobs.scheduled_for - updated_at` for `provider_throttle`                                                    | 60–120 s                                | 5–65 s                                                                                                                                          |
| Median / p90 completed worker turn                                           | `chat_turn_events` type `timing`                                                                                   | 21 s / 70 s                             | ≤21 s / <60 s                                                                                                                                   |

Also report the two telemetry holes the audit flagged so WP-6 has numbers: `llm_pass_count = 0`
on completed worker turns (≈20%) and rows with `failure_code = 'internal_cohort_rejected'`.

**Lean:** the script plus a markdown table pasted into this file after seven days.
**Ambitious (recommended):** the same JSON rendered as an interactive page on DJ's real turns (a
per-turn funnel: admission → passes → tool rounds → reviewer → terminal, with the failure and cost
overlays), refreshed nightly by a cron in this repo, published as an artifact DJ can poke at. This
is the "interactive explainer on real data" habit from DJ's global instructions and doubles as the
Tracker 78 evidence packet for chat.

**Exit:** first report committed with ≥7 days of post-deploy data; every metric has a number; any
metric missing its target becomes a numbered defect in this file with an owner package (WP-2..6)
or a new tracker.

## WP-2 — Retire the legacy web chat lane (the big one)

**User outcome:** daily-brief, calendar, and email turns get the same truncation retry, surface
repair, partial-fulfilment disclosure, and independent review as every other turn; the
`calendar_management` and `plan_management` skill preloads (wired on 09-02, dormant) start firing;
one harness to reason about.

Where things are today:

- The web admission renegotiates a turn to the legacy `stream-orchestrator` (6,968 lines under
  `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/`) when the selected surface
  needs a tool in `AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1`
  (`packages/agentic-chat-runtime/src/worker-tool-policy.ts` ~:43-62: calendar, email,
  relationships, deletes, graph reorganize). See `transport_renegotiate` in
  `worker-turn-preparation.server.ts` ~:359 and `transport-lease.server.ts` ~:194.
- The legacy lane owns its own supervisor: `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/`
  (558 lines) importing `@buildos/agentic-chat-runtime/supervisor` (`deterministic-supervisor`,
  `digest`, `entity-index`, `status-messages`, `types`). Those runtime modules exist only for it.
- The runtime parity registry still carries the `clarification` and `supervisor_checkpoint`
  goldens (`packages/agentic-chat-runtime/src/parity-scenarios.ts` ~:160, ~:188) for the web.
- `safety.supervisor_question_repeated_validation` in
  `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts` can no longer pass on the
  worker lane (no supervisor questions exist there).
- `resumeCheckpoint` on the artifact contract (shared-types) is web-only data, marked deprecated.

Do it in four phases, each shippable:

1. **Calendar tools on the worker.** Move the seven calendar tools from the unavailable list to
   worker-executable: adapters in `apps/worker/src/workers/agentic-chat/tools/` following the
   existing read adapter and `mutationToolCatalog.ts` patterns (calendar writes are
   `resolved_existing`/`create` classes; reuse the web service they wrap so behaviour is identical;
   the user's Google token must be reachable from the worker the same way the web reaches it).
   Then route `project_calendar` context and calendar-bearing surfaces to the worker. Prove with
   the e2e harness (`pnpm test:agentic`) on a calendar turn and with WP-1's report.
2. **Email tools.** Fork for DJ (below). If yes: same treatment for the four email tools, honouring
   the seven-day token expiry and the current flag; if no: keep email turns renegotiating until
   the flag decision changes, and say so in the routing code comment.
3. **Daily brief.** `daily_brief` / `daily_brief_update` turns mount no lane-specific tools; they
   renegotiate only because of the legacy prompt path. Route them to the worker (the worker prompt
   now has the `daily_brief` section from 09-02) and verify the brief-context turn in the harness.
4. **Delete the lane.** Once no context type renegotiates in production for seven days (WP-1 shows
   `transport_renegotiate` = 0): delete `stream-orchestrator/`, `turn-supervisor/`, the runtime
   `supervisor/` directory (the `finalization-guard` shim last), the two parity goldens, the eval
   scenario, the `resumeCheckpoint` field at the next artifact contract version, and the
   `transport_renegotiate` reason code. Update `apps/web/AGENTS.md` and the worker README.

**Exit:** every chat context type executes on the worker; the four deletions are in; WP-1 shows
zero renegotiations and calendar/email turns inside the same failure and latency bounds as project
turns.

## WP-3 — Resumable turns

**User outcome:** a Railway deploy or worker restart during a write turn resumes the turn instead
of ending it with "an error occurred", and an approved contract is never lost.

- The turn phase is now a value (`provider/turn-phase.ts`). Persist, at each phase transition, the
  phase, the approved contract SHA, the revision counters, and the effect-ledger cursor onto the
  run row the recovery RPC already reads (`recoverySnapshot.ts`, `stalledRecovery.ts`, the
  `recover_agentic_chat_turn` function; today post-start failures never retry — audit lane E
  §5.1).
- **Lean:** resume only while no durable write has happened (phases before `mutating`): rebuild
  the request from the frozen artifact plus persisted tool results and continue.
- **Ambitious:** resume across mutation rounds using the effect ledger's idempotency keys (every
  mutation already has a stable `effectId` and downstream key; audit lane E §5.5) so a restart
  mid-organize finishes the remaining moves.
- Test with the executor suite's recovery fixtures plus a new "kill after round 2, resume, same
  final state and same events after the cut" test. Keep the terminal-truth invariants from the
  worker README.

**Exit:** a forced worker restart mid-contract in the e2e harness completes the turn with the same
receipts as an uninterrupted run; no new failure codes.

## WP-4 — Cheaper reviewer with a paired canary (after WP-1 has seven days of data)

**User outcome:** write turns cost less without loosening the one safeguard that stops a guessed
write.

- Read WP-1's reviewer cost and cache numbers first. If the reviewer share is already under ~15%
  with caching, stop here and record why.
- Otherwise canary one cheaper model on the semantic reviewer routes
  (`apps/worker/src/workers/agentic-chat/bootstrap.ts` `buildAgenticChatSemanticReviewerRoutes`)
  behind the existing route ordering, with the restraint canaries from the audit as the gate: the
  three-plausible-email-tasks case must be withheld, the single-hit organize must be approved, the
  reviewer-mimicry case must be rejected. Run the provider suite's reviewer fixtures against the
  candidate through the `agentic-e2e` battery, then a 50/50 production canary for seven days
  measured by WP-1.
- Never let the reviewer equal the acting model (bootstrap throws on this since 09-02).

**Exit:** either "kept GPT-5.6-luna, here is why" or a ratified cheaper route with canary numbers.

## WP-5 — Skill quality pass

**User outcome:** the playbook that now reaches the worker is worth reading; DJ's own marketing
skills fire on the right turns and nothing else.

- Add the worker observation for `skill_preloaded_id` / `skill_preload_source` (today it lives
  only on the user message metadata and `request_payload.skillPreload`) so WP-1 can chart which
  skill fired per turn without joining message metadata.
- Run the exemplar recipe from `apps/web/src/lib/services/agentic-chat/tools/skills/AUTHORING_GUIDE.md`
  on the preloadable skills that lack worked Examples (19 of 53 at audit time, list in lane D §2)
  and add the missing `## Contract` to `linkedin_company_page_growth`.
- Revisit the preload dedupe window (a skill is re-injected once its preloading turn leaves the
  10-message history window). If WP-1 shows the same skill re-injected on consecutive write turns
  of one session, switch to a per-session ledger keyed on the session row; that needs a new
  metadata field the artifact validator accepts (the 09-02 lane could not add one).
- Add the `skillPreload` field to the shared-types domain-metadata snapshot so the preload is
  first-class instead of riding `request_payload`.

**Exit:** every preloadable skill has Examples and a Contract; WP-1 shows skill fires per turn.

## WP-6 — Telemetry hygiene sweep

- `llm_pass_count` is 0 on ≈20% of completed worker turns
  (`supabase/migrations/20260828221405_agentic_chat_provider_pass_telemetry.sql` defines it;
  find the terminal path that finalizes without the count).
- `failure_code = 'internal_cohort_rejected'` exists in production rows and nowhere in code; find
  the writer (a migration-era RPC or the web admission) and either map it in code or stop writing it.
- `chat_tool_executions.execution_time_ms` is null on failed mutation rows: add the RPC parameter
  to the failure-row function used by `toolExecution.ts` and pass the adapter duration.
- Control decisions (`declare_turn_contract`, approvals, clarification) still persist as tool
  rounds and stream as `tool_call`/`tool_result`. Give them their own durable step kind; this is
  the one refactor step skipped on 09-02 because the web reads that event order — change the web
  reader and the shared-types step union together, behind the artifact contract version.
- `docs/architecture/decisions/2026-08-14-semantic-turn-contracts.md` cites five files that no
  longer exist; stamp or rewrite it. Lane reports are point-in-time and stay as they are.

**Exit:** WP-1's report has no "unknown" cells.

## Decisions for DJ

1. **Email tools on the worker (WP-2 phase 2).** Yes moves email turns onto the worker now, with
   the seven-day token expiry handled there; no keeps email on the legacy lane until the flag
   decision and delays deleting the lane. Recommended: yes, calendar first, email second.
2. **Ambitious health page (WP-1).** The nightly interactive page costs about a day more than the
   script. Recommended: yes; it is the Tracker 78 chat evidence.
3. **Resume scope (WP-3).** Pre-write resume only, or across mutation rounds. Recommended: pre-write
   first, ship, then across rounds in the same tracker.

## Exit condition

All six packages closed with receipts in this file; WP-1's report shows every metric inside its
target for a consecutive seven-day window on the consolidated harness; `stream-orchestrator/`,
`turn-supervisor/`, and the runtime `supervisor/` directory no longer exist; a worker restart
mid-write no longer ends a turn.

## Non-goals

- Re-auditing prompts, context, tools, or skills. The audit is done; start from §11.
- Sub-agents with their own budgets (the reducer makes this possible; it is a separate tracker).
- Changing the direct-lane criterion. It is deliberately narrow (focused entity, user-given id, or
  single-hit read); loosening it re-opens the restraint failure the audit caught.

## Receipts

Append one dated entry per package as it closes: what shipped, the commit, the numbers, and any
decision taken without DJ.
