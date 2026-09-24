<!-- docs/technical/reviews/CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-18; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Task 90 — closeout and retained testing history

**Created:** 2026-09-13  
**Closed:** 2026-09-14, at DJ's direction to defer calendar work and move on.  
**Disposition:** The investigation and focused repair batch are complete, and Task 90 is removed from the active queue. Four further repairs passed **371 distinct focused worker tests**, source/test types, and lint. The latest focused diagnostic passed **12/12 turns** across Cases 8/9/14. The last complete gate remains failed at **45/52**; closure does not change its outcome or claim release acceptance. See the [phase 2 findings and evidence](CHAT_WORKFLOW_TASK90_PHASE2_REPAIRS_2026-09-14.md) and [previous full-gate result](CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md).  
**Coordinates with:** [81](../../../tasker/81-chat-workflow-implementation-program.md), [82](../../../tasker/82-chat-workflow-regression-repairs.md), [84](../../../tasker/84-chat-workflow-delivery-and-stall-visibility.md), and [89](../../../tasker/89-chat-workflow-integration-acceptance.md).

**Completed work:** The requested failure write-up and independent fresh-context
analysis are complete. Both investigate causes and multiple remedies before further
fixes. See the [failure brief](CHAT_WORKFLOW_TASK90_FAILURE_BRIEF_2026-09-14.md)
and [independent analysis](CHAT_WORKFLOW_TASK90_INDEPENDENT_ANALYSIS_2026-09-14.md).
The completed changes address event identity with queued text, dated-model recovery
coverage, selective source-preservation review, and a bounded longer header window
on the final existing retry. The source review caught an actual omitted block before
saving; a separate controlled test proves the longer header window. See the
[phase 2 repairs and focused validation](CHAT_WORKFLOW_TASK90_PHASE2_REPAIRS_2026-09-14.md).
Both focused diagnostics are complete and stopped. No additional test, runtime
change, commit, or deployment was made for this closeout. The earlier routing-first
recommendation remains unselected.

## Residual ownership

- **Calendar — deferred by DJ:** retain the Case 10 buffer/overlap findings in
  [82](../../../tasker/82-chat-workflow-regression-repairs.md) and the phase 2 report. Do no further
  calendar implementation or testing until that work is resumed.
- **Grounding — follow-up under 82:** Case 14 r2 turn
  `93390441-8559-4ee9-999a-f2ae569eac11` inferred no revision from a sparse change
  log; the judge gave it 5/5. Preserve the manual finding, calibrate the judge, and
  evaluate evidence-qualified synthesis in that workstream.
- **Acceptance — retained under 89:** preserve failed and focused receipts, source
  provenance, and the rollback lane. Full acceptance remains future work; no full
  battery is requested by this closeout.
- **Program — continue under 81:** Task 90 no longer holds the active work queue.
  The next existing package was 83, bounded workflow reviews and prompt snapshots.
  DJ closed it on 2026-09-14; see its
  [receipt](CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md).

## Retained handoff context

The sections below preserve the investigation chronology and its original operating
constraints. Historical next-action notes are not instructions to restart Task 90.

### Original starting context

- Read [the investigation and change history](CHAT_WORKFLOW_CASE8_LATENCY_INVESTIGATION_2026-09-13.md), then [the gate contract](../../testing/agentic-chat-gate.md).
- Work in `/Users/djwayne/buildos-platform`. The checkout contains substantial pre-existing staged and unstaged work plus these repairs. Inspect and preserve it; do not reset, restage everything, or assume every dirty file belongs to this task.
- The existing private `.env.agentic-gate.local` configures the isolated QA database and dedicated calendar. Never print its credentials or substitute the normal application database. Only one gate and its own worker may use this QA database at a time.
- Keep the durable contract rollback lane and existing approval, ownership, effect-ledger, billing, and terminal-reconciliation guarantees.

## Implementation already present

1. Model usage writes are registered as pending turn effects without blocking the next model pass. Completion and failure/cancellation paths drain them before billing. Usage requests have independent bounded cancellation. Publisher and usage traces distinguish request attempts, retries, acceptance, and pressure waits.
2. Two redundant generic progress events before approved mutation execution were removed. Review-start visibility remains, and durable `tool_call` acceptance still precedes execution. The context-gathering ledger now narrows after distinct searches explicitly provide complete coverage, while preserving reads needed for missing facts and incomplete coverage.
3. Reviewer wording distinguishes the currently executable prerequisite stage from later links needing returned IDs. Exact held arguments and rejection of uncommissioned fields remain. The gate adds metadata-only QA HTTP tracing and retains intake `Server-Timing`; its analyzer handles missing usage receipts and missing terminal timestamps honestly.

Main source areas: `apps/worker/src/workers/agentic-chat/{persistenceTrace.ts,streamPublisher.ts,turn-executor.ts,bootstrap.ts,composition-root.ts}`, `provider/{openrouter-client.ts,turn-provider.ts,review/mutation-batch.ts}`, `packages/smart-llm/src/usage-logger.ts`, `packages/agentic-chat-runtime/src/loop/context-gathering-ledger.ts`, `apps/web/src/lib/tests/agentic-e2e/harness/{types.ts,worker-client.ts}`, and `scripts/agentic/{gate.ts,http-trace.mjs,latency-analysis.ts}`. Corresponding tests are in the checkout; see the investigation for the boundary proofs.

Focused checks already passed, so do not repeat them without a relevant change or unresolved concern:

- Accounting/tracing: 258 focused tests; worker source/test typechecks and smart-LLM build.
- Progress/discovery: 367 focused worker, shared-ledger, and web tests; runtime/worker source and worker test typechecks.
- Review wording/diagnostics: 137 worker tests, 16 harness tests, four diagnostic tests, and web test-type baseline. The third gate also passed its 112-test bootstrap oracle, four diagnostic tests, and dependency builds.

## Preserved gates

All paths below are under `output/agentic-gate/`. Keep the original evidence intact.

| Directory                                            | Result                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat-workflow-82-84-combined-2026-09-13/`           | Original 52/52 behavior; Case 8 rep 2 took 34.759s against 30s.                                                                                                     |
| `chat-workflow-case8-accounting-2026-09-13/`         | Initial sandbox setup failure; no product turns.                                                                                                                    |
| `chat-workflow-case8-accounting-network-2026-09-13/` | Complete 45-turn gate, 52/52; all time limits pass, but Case 14 rep 2 uses 11 calls against eight. Failed acceptance.                                               |
| `chat-workflow-case8-progress-2026-09-13/`           | Complete 45-turn gate, 44/52 and 43/45 behavior checks; timing and read-checkpoint failures. Case 14 call counts pass at 4/5/5. Failed acceptance.                  |
| `chat-workflow-case8-final-2026-09-13/`              | Interrupted at user request. 35/45 turn records, no `scorecard.json`. `gate.json` says failed because the scorecard is missing. Partial evidence is not acceptance. |

The interrupted gate started at **15:52:59.977 UTC** and recorded its finish at
**16:35:54.896 UTC** on September 13. Startup web/worker provenance matched HEAD
`c324762250e8c9546d63cf1dada4b6c885d36974` and executable-tree hash
`9c52001bbb1092420dfe7e165ae1fe3d14ac066dabefbfa2d2a8433d562e2feb`.
Final provenance verification was not completed. Recheck the current source before
resuming; other work may have changed this shared checkout.

Partial results requiring investigation before another run:

| Case | Retained measurements                                           | Next question                                                                                                            |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 2    | 39.600 / 50.857 / 43.099s, all behavior checks pass             | Confirm the prerequisite-stage false rejection remains absent in captured passes.                                        |
| 4    | 18.917 / 16.275 / 16.416s, all update and follow-up checks pass | No retained ceiling failure.                                                                                             |
| 8    | 22.503 / **1,775.255** / **35.809**s, all document checks pass  | Classify the long machine/network interruption and subsequent queue delays before attributing these times to the repair. |
| 10   | Reps 1 and 2 emit `provider_stream_error` at 10.148 / 9.172s    | Inspect captured failures and their relation to the stop window; calendar reads alone do not establish the cause.        |
| 14   | Not reached                                                     | All three repetitions still required.                                                                                    |

Case 8 rep 2 is turn `97065f52-f28b-460f-b45d-37ce27c59ae5`:
the client started at 16:04:08.732 but admission occurred at 16:33:20.086 UTC.
Worker `claim_pending_jobs` and web `load_fastchat_context` requests both remained
unresolved for roughly 1,749 seconds, ending without HTTP status or gateway timing.
That interval cannot be classified as 29 minutes of SQL execution. Investigate host
sleep/suspension, connectivity, and request cancellation using retained logs and any
available host evidence; those are hypotheses, not established causes. Rep 2 then
had 12.547s queue wait; rep 3 (`43be3c3d-f4b0-46f1-932f-198eba1b77b5`) had 15.757s.

Case 10 failed turns are `80ceb9a8-d80f-4ab6-a8c4-c183206839ac` and
`dfc55f02-d6fa-468b-829d-d37f5681f6b7`, with terminal timestamps 16:35:27.032
and 16:35:42.263 UTC. Preserve the distinction between an independent provider
failure and effects of stopping the run; it has not been established here.

The partial `latency-analysis.json` retains 1,810 persistence trace records and
4,349 HTTP records. Earlier multi-second requests had gateway upstream time close
to their client wait and one upstream attempt, with low local event-loop use.
Gateway time includes upstream processing and upstream network time; it is not a
SQL timer. The original historical six-second save still has no retroactive retry
proof. A cancellation-observation RPC locks matching turns and is a possible
contention investigation target, not an established defect or authorization to
remove locking. No SQL behavior was changed by these repairs.

## Step 1 result (2026-09-13, ~23:10 UTC)

Full classification: [investigation, final section](CHAT_WORKFLOW_CASE8_LATENCY_INVESTIGATION_2026-09-13.md) and `output/agentic-gate/chat-workflow-case8-final-2026-09-13/classification-2026-09-13.json`.

| Case      | Classification                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| 8 r2      | **Host idle sleep on battery**, 16:04:08 → 16:32:37 UTC (`pmset`). Not product, gateway, or SQL latency.                 |
| 8 r3      | Invalid sample. Its 15.8s queue wait was the post-wake same-user backlog: Case 9 r1 → 8 r2 → 8 r3 ran one after another. |
| 9 r1      | Began during a dark wake while Case 8 was still in flight. Fits overdue 450s Vitest timeouts firing on wake.             |
| 10 r1, r2 | **OpenRouter HTTP 402 (credits exhausted)** on round 2, 27s and 12s before the worker's SIGTERM. Not caused by the stop. |
| 2         | All review passes approved. No false prerequisite rejection.                                                             |
| 4         | Pass.                                                                                                                    |
| 14        | Not reached.                                                                                                             |

The current provenance still matches the partial gate's startup (`c3247622…` / `9c52001b…`).

**Blocker, needs DJ:** OpenRouter account shows `total_credits` 150 and `total_usage` 150.09.
The gate env, `.env`, `.env.local`, `apps/web/.env`, and `apps/worker/.env` all use this key.
A complete gate costs about $0.34 in product model calls. Production `llm_usage_logs` show no
failures in 48h, but also no model calls since 15:58 UTC. Whether production shares this account
is unverified.

**Next action:** add credits, then run step 3 once, on AC power, prefixed with `caffeinate -dims`.

Residuals, not in scope: a 402 surfaces as a generic `provider_stream_error`, and a timed-out
scenario test does not cancel its in-flight turn.

## Steps 3–4 result (2026-09-13, 23:25–23:48 UTC)

The gate output is in `output/agentic-gate/chat-workflow-82-84-resume-20260913T232548Z/` (`gate.json`, `scorecard.json`, `classification.json`). All 45 turns ran and scored **52/52**. Case 10 passed, the host did not sleep, and model spend was $0.36. **Failed acceptance.**

| Failure                           | Turn                                   | Cause                                                                                                                                                                                                            |
| --------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Case 2 r1 **115.7s** (limit <60s) | `0e82c66e-26fe-43fd-b948-6d616874002a` | Modal served the acting pass: 58.1s at 21.6 tok/s. The reviewer then sent a false revision request ("high = priority 2 … proposed call uses priority 2?"). The repair attempt stalled 10s on the header timeout. |
| Case 4 r3 **33.7s** (limit <30s)  | `87b5f50b…`                            | Both acting passes went to Novita, at 38.8 and 23.8 tok/s (10.3s + 8.6s). The review approved on the first pass.                                                                                                 |
| Final provenance                  | —                                      | Commit `199a6ba44` landed in this checkout at 23:42:25 UTC, mid-gate. Startup provenance had verified.                                                                                                           |

Near misses: Case 4 r2 at 28.5s lost 10s to a header stall. Case 8 r2 at 29.4s spent 2.3s on the durable `tool_call` save during a burst of slow QA database/gateway requests.

Case 8 passed all three repetitions (19.0 / 29.4 / 22.7s). Case 14 passed all three (12.9 / 24.8 / 24.3s, 5 calls each).

**Decision (2026-09-14):** DJ chose record and stop. Options considered but not built:

- **Lean:** ignore Modal on the V4.1 route; cut the response-headers timeout from 10s to about 5s; re-run the review once when a revision request contradicts itself, and never auto-approve.
- **Ambitious:** the lean fixes plus a throughput hedge.

Whoever resumes should apply the chosen fixes with focused tests. Then run the next gate from an isolated worktree snapshot, so commits in the shared checkout cannot break provenance.

Notes for resuming:

- **Still uncommitted after `199a6ba44`:** `apps/worker/src/workers/agentic-chat/streamPublisher.ts`, `apps/worker/src/workers/agentic-chat/workflow/context-loader.ts`, and `scripts/agentic/gate.ts`. Also still untracked: `scripts/agentic/http-trace.mjs`, `http-trace.test.mjs`, `latency-analysis.ts`, and `latency-analysis.test.ts`. A worktree snapshot must include them, or the gate's tracing and analysis disappear.
- **Models:** use the cheaper models only, never GPT-6 Astra (DJ, 2026-09-13). The gate path currently uses DeepSeek V4.1 Flash (fallback V4 Flash) for acting, GPT-5.6 Luna for review, and Luna → Kimi K3 → Grok 4.6 for the judge. A full gate costs about $0.36 in product calls plus about $0.15 in judge calls.
- **Routing research:** OpenRouter's `preferred_min_throughput` and `preferred_max_latency` are soft, percentile-based preferences. `validateProviderRouting` must learn those fields before config can send them. See the investigation's "Supporting evidence" section for per-provider latency, stall turns, and delivery numbers.
- **Before any gate:** check that OpenRouter `/api/v1/credits` shows headroom, plug in, keep the lid open, and wrap the command in `caffeinate -dims`.

## Final validation and transferred follow-ups

The [focused repair phase](CHAT_WORKFLOW_TASK90_FOCUSED_REPAIRS_2026-09-14.md)
passed 392 distinct tests plus worker source/test types and changed-runtime lint.
DJ then explicitly authorized the full gate. It ran once from independent snapshot
`/private/tmp/buildos-task90-gate-20260914T013318Z`, with evidence in
`output/agentic-gate/task90-acceptance-20260914T013318Z/`. The gate finished at
01:57:13 UTC on September 14. Case 9 r2's first-turn failure prevented its second
turn; the other repetitions completed. This is a failed gate, not acceptance.

1. Completed: the independent investigation informed four further changes, 371
   distinct focused worker tests, and two fixed-snapshot diagnostics. The first
   recorded 12/14 passing turns and two recovery failures; the second recorded
   12/12 passing turns after the final-retry header repair. Keep both receipts:
   `task90-focused-20260914T153248Z/` and `task90-focused-20260914T154345Z/`.
2. Transferred to 82: resolve the remaining quality boundaries without relaxing assertions or adding
   Cedar House-specific rules. Case 14 r2 turn `93390441-8559-4ee9-999a-f2ae569eac11`
   asserts no revision since the initial change-log entry despite incomplete
   history; the judge scored it 5/5. Calibrate that distinction, then compare concise
   evidence-qualified synthesis on synthetic controls. Case 10 interval arithmetic
   and complete overlap retrieval are deferred at DJ's request; three fresh passes
   alone do not repair the retained invalid-slot behavior.
3. Transferred to 89: retain the validation evidence and eventual acceptance criteria.
   DJ's current scope uses focused tests for changed and failed behavior.
   Full release acceptance remains a separate future step, not an instruction to
   rerun the full battery now. Its unchanged requirements are 45 expected turns,
   52/52, verified
   web/worker/final provenance, Case 2 **<60s**, Cases 4/8 **<30s**, and Case 14
   **<40s with ≤8 calls** in every repetition. Do not rerun unchanged until green.
4. Keep the rollback lane and all prior receipts. Tasks 81/82/84/89 and the original
   investigation link the earlier failed result. No commit or deployment was made
   in this repair phase; no gate remains active.

Optional standalone reviewer probes in `/tmp/case8-stage-review-probe.ts` were
**not run**: automatic approval review rejected resending retained project data
to an external model. Do not execute that script as a workaround. Local tests and
the normal isolated gate with fresh QA fixtures are the established validation path.

## Closure decision

DJ explicitly closed Task 90 on September 14 after the focused repair batch,
deferred calendar work, and requested moving on. The remaining grounding and
acceptance work has named owners above, so this testing handoff is retired.
The task closure does not mark 82/84 or the full pilot accepted.
