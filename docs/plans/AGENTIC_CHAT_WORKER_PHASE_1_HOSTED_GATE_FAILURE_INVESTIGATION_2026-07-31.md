<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_1_HOSTED_GATE_FAILURE_INVESTIGATION_2026-07-31.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-07-31; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Phase 1 Hosted Gate Failure Investigation Handoff

**Prepared:** 2026-07-31

**Gate verdict:** Resolved — the remediation rerun passed 24/24 scenario executions and 30/30 turn assertions

**Current instruction:** No further Phase 1 hosted rerun is required

**Phase state:** Phase 1 is exited; Phase 2 is unblocked

## Executive conclusion

The three failed executions must not be classified as random variance. They have three different, inspectable failure signatures:

1. `project-organize` produced a valid-looking but semantically weak organization: every original document ended under a different parent. One malformed move was retried successfully and was not the final cause of the assertion failure.
2. `research-turn-finalizes` exhausted two stream attempts after receiving substantial answer text but no terminal event. The runtime discarded the partial answer and failed the turn because the existing degraded-partial recovery lane did not apply.
3. `task-reschedule-cold-reference` did **not** write the wrong date. It left the seeded August 5 date unchanged. The model issued the same schema-valid but semantically no-op task update three times, omitting `due_at` every time, and the repetition guard stopped the loop.

These are real product/runtime behaviors even if provider sampling determined which repetition exposed them. None is yet proven to have been caused by the Phase 1 admission refactor. All three failed turns were cold turns with zero raw/model history messages, and neither the scenario definitions nor the stream orchestrator changed between the retained Phase 0 and Phase 1 measured commits. The Phase 1 route did change materially, so causality still needs to be tested rather than assumed.

Do not weaken the assertions, increase retry/repetition counts, or rerun the full paid cohort before the deterministic paths below are investigated.

## Resolution summary — 2026-07-31 EDT

The three mechanisms below were reproduced deterministically and remediated without changing scenario assertions, timeouts, tool-round caps, repetition counts, or Vitest retry settings. After explicit approval, the complete clean hosted cohort was rerun from `bb0f16da1ddb96d2519c92987753e941fd46fb43` / tree `61f94f626cc0c96077cc62677bfa0319c6883fd8`.

The retained artifact `docs/plans/evidence/agentic_chat_worker_phase1_gate_rerun_2026-07-31_bb0f16da1.json` records:

- 24/24 scenario executions and 30/30 turn assertions passed;
- all 30 turns completed with `finished_reason=stop`;
- zero stream-error turns and zero capture-error turns;
- repository `dirty=false` and Vitest retry count `0`; and
- total provider/model cost `$0.09693123`.

Every former failure scenario passed all three repetitions. This result closes the Phase 1 hard gate; the dossiers below remain as the historical causal record, not as unresolved blockers.

## Evidence inventory

### Durable evidence

- Phase 1 artifact: `docs/plans/evidence/agentic_chat_worker_phase1_gate_2026-07-31_0147cbd94.json`
- Passing Phase 0 comparator: `docs/plans/evidence/agentic_chat_worker_phase0_gate_2026-07-31_0f63e47bb.json`
- Phase 1 measured commit/tree: `0147cbd94e85f406512245803758796145e0e950` / `49e74889c528eb0a475b9c0c257e75ff4eb9118e`
- Phase 0 measured commit/tree: `0f63e47bbafc4e58d85b360b1edb1ef8d0fe3fb5` / `6e3f1b451e7920478f54fa36dddbb79dc68e7c83`
- Both artifacts report clean isolated worktrees and Vitest retry count `0`.

The Phase 1 run used eight scenarios, three repetitions, 24 scenario executions, and 30 agent turns. Its recorded provider/model cost was `$0.12909659`.

### Ephemeral prompt/runtime traces

The clean Phase 1 worktree still contains untracked prompt dumps at the time of this handoff:

- Organization failure: `/private/tmp/buildos-phase1-gate-94bb04e62/apps/web/.prompt-dumps/fb-2026-07-31T19-58-50-455Z-lite-turn1.txt`
- Research failure: `/private/tmp/buildos-phase1-gate-94bb04e62/apps/web/.prompt-dumps/fb-2026-07-31T20-16-06-977Z-lite-turn1.txt`
- Reschedule failure: `/private/tmp/buildos-phase1-gate-94bb04e62/apps/web/.prompt-dumps/fb-2026-07-31T20-22-15-852Z-lite-turn1.txt`

These paths are temporary and are not committed evidence. Preserve sanitized copies or extract any additional facts before that worktree is removed. Do not commit whole prompt dumps without a privacy/secrets review.

The JSON artifact deliberately does not retain prompt, message, tool-argument, tool-result, or event bodies. It measures their byte footprint only. That limitation is why the exact argument traces below come from the temporary prompt dumps.

### Console-only observation

The research terminal-error measurements were visible in the hosted run's server output but are not present in the JSON artifact or failed prompt dump. They are recorded verbatim as structured values in this document so the next investigator knows what must be made durable:

- error: `LlmStreamPassTerminalError: terminated`
- pass: `4`
- pass role: `tool_followup`
- attempts/max attempts: `2/2`
- retry count: `1`
- configured per-attempt timeout: `60000 ms`
- logical pass duration: `69105 ms`
- terminal event received: `false`
- assistant text characters received: `1262`
- reasoning characters received: `9804`
- tool calls received in the failed logical pass: `0`
- retryable: `true`
- attempts exhausted: `true`
- last error message: `terminated`

The duration is the logical pass duration accumulated by `runLlmStreamPass`, not proven to be the duration of only the final attempt.

## Separate preflight incident: fixed before the measured cohort

The first hosted preflight found a deterministic Phase 1 adapter regression before model execution. `turn-admission.ts` detached `params.supabase.rpc` and invoked it without the Supabase client receiver, producing `Cannot read properties of undefined (reading 'rest')`.

That preflight was stopped before an evidence artifact or meaningful model spend. Commit `9521d814f` binds the method with `params.supabase.rpc.bind(params.supabase)` and adds a receiver-dependent regression test. The corrected 24-scenario cohort described here ran after that fix. This incident is not one of the three quality failures, but it demonstrates why the remaining failures should also be investigated rather than waived as noise.

## Cohort-level comparison

| Measure                     | Passing Phase 0 | Failed Phase 1 |          Delta |
| --------------------------- | --------------: | -------------: | -------------: |
| Scenario executions         |           24/24 |          21/24 |      -3 passes |
| Turn assertions             |           30/30 |          27/30 |      -3 passes |
| Stream-error turns          |               0 |              1 |             +1 |
| Capture-error turns         |               0 |              0 |      unchanged |
| Cost                        |   `$0.13314743` |  `$0.12909659` | `-$0.00405084` |
| Client response headers p95 |      296.283 ms |     444.635 ms |    +148.352 ms |
| Client TTFT p50             |    4,253.559 ms |   8,643.546 ms |  +4,389.987 ms |
| Client TTFT p95             |   16,681.192 ms |  33,479.594 ms | +16,798.402 ms |
| Client total duration p50   |   30,643.520 ms |  63,771.410 ms | +33,127.890 ms |
| Client total duration p95   |  171,001.530 ms | 174,478.661 ms |  +3,477.131 ms |
| Server admission p50        |           96 ms |         111 ms |         +15 ms |
| Server admission p95        |          108 ms |         187 ms |         +79 ms |
| Server total request p95    |      170,454 ms |     173,737 ms |      +3,283 ms |
| Tool execution p50          |          649 ms |         490 ms |        -159 ms |
| Tool execution p95          |        3,963 ms |       4,845 ms |        +882 ms |
| Retained rows p95           |             105 |            105 |      unchanged |
| Retained bytes p95          |         312,523 |        318,936 |   +6,413 bytes |

The median and p95 time-to-first-token approximately doubled, while admission increased by tens of milliseconds. Admission latency alone cannot explain the long provider/tool paths or the three semantic failures. It should still be monitored because Phase 1 changed admission, but it is a separate performance investigation.

## Failed-turn overview

| Scenario / repetition                | Durable turn state                   | Tool shape                                                                                       | Assertion failure                                        |
| ------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `project-organize` / 3               | `completed`, `stop`                  | 20 calls, 4 rounds; 19 successful and 1 validation failure                                       | No parent contained at least two original documents      |
| `research-turn-finalizes` / 3        | `failed`, `error`                    | Seven successful read executions before failed pass; counters incorrectly say 0 calls / 0 rounds | One generic stream error; no persisted assistant message |
| `task-reschedule-cold-reference` / 1 | `completed`, `tool_repetition_limit` | Three identical successful `update_onto_task` calls                                              | Target remained August 5; expected August 7              |

All three report `history_strategy=raw_history`, `raw_history_count=0`, and `history_for_model_count=0`.

## Failure dossier 1: project organization

### Identity and timing

- Scenario/repetition: `project-organize` / `3`
- Session: `f596fdd3-0310-475e-9d73-3c84ea4febeb`
- Turn run: `59377be1-6d28-4c5e-b798-df6efa0097a9`
- Started: `2026-07-31T19:58:49.393Z`
- First response: 17,719 ms
- Total request: 271,628 ms
- Turn result: `completed`, `finished_reason=stop`
- Usage: six requests, `$0.00862124`, models recorded as DeepSeek V4 Flash and Tencent HY3

### Contract under test

`project-organize.scenario.ts` seeds six loose documents and asks for a sensible organization. Its deterministic assertions require:

1. all original documents still exist;
2. their content is unchanged;
3. at least two original documents are nested; and
4. at least one parent contains two or more original documents.

The failed turn passed the first three checks and failed only the fourth. This means the result was not “nothing happened”; it was a structurally real but low-value one-document-per-folder organization.

### Exact execution shape

The turn read all six documents. It then issued these final effective moves:

| Original document        | Final requested parent title |
| ------------------------ | ---------------------------- |
| `notes`                  | `Notes`                      |
| `meeting 3-14 raw`       | `Meeting Notes`              |
| `TODO dump`              | `Tasks`                      |
| `pricing ideas v2 FINAL` | `Pricing`                    |
| `random thoughts`        | `Brainstorming`              |
| `customer email draft??` | `Drafts`                     |

Every original therefore ended under a distinct parent. The earlier move of `random thoughts` to `Ideas` was superseded by its later move to `Brainstorming`.

Tool execution 13 contained truncated JSON for the pricing move and failed validation. Tool execution 19 repeated the same pricing move with valid JSON and succeeded. Error-log ID `300c9135-27f2-4fb3-af84-92e5a1bc3d1c` corresponds to the malformed call. Because the move was repaired and the final quality failure was one-document-per-parent, the malformed JSON is a secondary reliability signal, not the root cause of this assertion.

The two passing Phase 1 repetitions reused a parent title:

- repetition 1 placed two originals under `Meeting notes`;
- repetition 2 placed two originals under `Brain dump`.

### Relevant implementation behavior

- The write-intent instruction in `stream-orchestrator/index.ts` tells the model to call `move_document_in_tree` per document and to use short category names. It does not explicitly define organization as reusing a category for related documents.
- The tool schema in `ontology-write.ts` accepts any `new_parent_title` and automatically reuses or creates that parent.
- Successful tool execution proves the moves landed, but there is no runtime postcondition that checks whether the resulting structure is useful rather than merely nested.

### Ranked hypotheses

1. **Strong:** the prompt/tool contract permits one category per document, so a sampled model can satisfy the mechanical tool contract while failing the user-level organization contract. The failing and passing traces directly demonstrate both behaviors.
2. **Possible:** the forced write-intent path and model/provider rotation made category selection less coherent. The failure used a different model mix from the two simpler passing write traces, but the artifact does not retain enough per-pass routing to establish causality.
3. **Weak:** the malformed pricing call disrupted the plan. It was repaired successfully, and the other five originals still ended under five different parents.
4. **Weak:** the tree executor lost moves. The assertion reached the per-parent distribution check, and the prompt dump records successful final moves. A tree bug is still testable, but it is not the leading explanation.

### Non-paid diagnostics and candidate fixes

1. Add an orchestrator unit fixture matching the six observed moves and prove what the write ledger/finalization guard currently considers fulfilled.
2. Decide whether a commissioned “organize” intent should require evidence of at least one reused parent title when multiple related documents are moved. If yes, make that an intent-aware repair/postcondition, not a scenario-name special case.
3. Test a repair instruction that says grouping requires reusing the **same exact parent title** for related documents; examples should include two documents sharing one category.
4. Consider a bounded final-state verification read only if write-ledger evidence cannot distinguish useful grouping. Measure its latency/cost before adopting it.
5. Add malformed trailing-JSON recovery coverage separately. Do not treat that parser improvement as the organization-quality fix.

## Failure dossier 2: research turn finalization

### Identity and timing

- Scenario/repetition: `research-turn-finalizes` / `3`
- Session: `2c9bd50a-e2c2-4f16-bd4a-c257dc013713`
- Turn run: `caa7ba55-91b5-4db2-ac15-62bff9137076`
- Started: `2026-07-31T20:16:06.209Z`
- First response: 3,563 ms
- Total request: 137,663 ms
- Durable result: `failed`, `finished_reason=error`, no assistant message
- Usage: five requests, `$0.00527133`, models recorded as DeepSeek V4 Flash and Tencent HY3

### Contract under test

The scenario asks the agent to inspect a Q3 roadmap, check existing tasks, recommend the next work, and conditionally add anything untracked. It requires a multi-tool path, narration before action, at least 120 characters of final assistant text, a completed turn run, and mutation honesty if a create tool was called.

The failed execution completed seven successful reads:

1. `get_document_outline`
2. `list_onto_tasks`
3. three `read_document_section` calls
4. two `get_onto_task_details` calls

The final logical LLM pass received substantial text and reasoning but no terminal event. After two attempts, `runLlmStreamPass` threw `LlmStreamPassTerminalError: terminated`. The route emitted the generic SSE error `An error occurred while streaming.`, persisted the turn as failed, and did not persist an assistant message.

### Existing recovery boundary

`llm-pass-runner.ts` already retains `bestPartialAssistantText` and structured terminal measurements. `stream-orchestrator/index.ts` can recover a usable partial from a failed tool-enabled pass only when all of these hold:

- it is not already a no-tool synthesis pass;
- the turn is not mutation-requested;
- no tool call is pending;
- the partial passes the 120-character/18-word threshold; and
- at least one successful pure-read tool execution exists.

This turn had no tool calls in the failed pass, had successful reads, and produced a 1,262-character partial. The scenario's conditional authorization to add work likely caused `mutationRequested` to block the read-only recovery lane; confirm that intent value in a deterministic unit trace before changing behavior. The runtime then rethrew to the route error handler.

The existing safety concern is valid: partial output from a mutation-requested turn must not falsely claim a write. The current all-or-nothing boundary, however, discards a potentially useful answer even when no write executed in the failed pass.

### Telemetry inconsistency

The artifact contains seven successful `toolExecutions`, but the failed `chat_turn_runs` record reports `tool_call_count=0` and `tool_round_count=0`. The route catch persists execution rows, but the terminal counters are not reconciled on this error path. This does not cause the user-facing failure, but it makes failure analysis misleading and should be fixed or explicitly documented.

The failed prompt dump also lacks appended runtime routing/tool metadata because that metadata is appended only on a normal orchestrator return. The most important terminal measurements therefore existed only in console output.

### Ranked hypotheses

1. **Confirmed transport fact:** both attempts ended without a terminal completion event; the last retryable error was `terminated` and attempts were exhausted.
2. **Strong product/runtime gap:** a useful partial answer was available but the degraded recovery predicate excluded this mutation-requested/conditional-write turn.
3. **Possible provider factor:** provider/model routing produced a long reasoning stream and missing terminal event. Passing Phase 1 repetitions completed, one using the same recorded model mix, so model-family labels alone do not isolate the cause.
4. **Unproven Phase 1 regression:** the orchestrator and scenario code did not change between measured commits. The route/error/persistence boundaries did change, but there is no evidence that admission caused the provider stream to terminate.
5. **Secondary only:** the error logger later encountered a transient `ECONNRESET` while recording the error. That happened after the stream failure and did not cause it.

### Non-paid diagnostics and candidate fixes

1. Add an orchestrator test for a conditional-mutation turn that has completed reads, no successful writes, no pending calls, a usable partial answer, and two exhausted terminal-less attempts.
2. Evaluate a guarded degraded completion that runs mutation-outcome integrity over the partial, forbids claims of unexecuted writes, records `completed_degraded`, and clearly records that conditional mutation did not occur.
3. Add the complementary negative tests: never recover a partial with pending tool calls, a successful write whose outcome is not reflected, a write claim without evidence, or an unusably short lead-in.
4. Persist sanitized terminal measurements and the recovery decision on the error path. At minimum retain pass/role, attempts, route candidates, timeouts, received character counts, terminal-event flag, last error class, and whether a partial was discarded.
5. Reconcile `tool_call_count` and `tool_round_count` from completed executions when the route fails after tools have run.
6. Investigate provider termination separately from partial recovery. Do not merely add more retries: that increases latency/cost and still leaves the discarded-answer path intact.

## Failure dossier 3: cold-reference reschedule

### Identity and timing

- Scenario/repetition: `task-reschedule-cold-reference` / `1`
- Session: `117731b0-e71a-4fb5-9bb3-0de9acbf2ad9`
- Turn run: `b159002b-74f0-4a6c-bf38-9775bbe18dc4`
- Started: `2026-07-31T20:22:15.001Z`
- First response: 18,636 ms
- Total request: 30,232 ms
- Durable result: `completed`, `finished_reason=tool_repetition_limit`
- Usage: three requests, `$0.00284733`, DeepSeek V4 Flash

### Fixture and expected date

The scenario ran on Friday, July 31, 2026. Its explicit fixture rule interprets “push it to Friday” on a Friday as the next future Friday:

- expected target date: `2026-08-07`
- seeded target date: `2026-08-05T15:00:00Z`
- seeded unrelated control date: `2026-08-09T15:00:00Z`

The prompt supplied current time `2026-07-31T20:22:15.849Z`, timezone `UTC`, and the target's existing August 5 date. At that instant both UTC and America/New_York were Friday, so the assertion's next-Friday expectation was not created by a day-boundary disagreement.

### Exact execution shape

All three tool calls were effectively identical:

```json
{
	"task_id": "<target task id>",
	"title": "Send the launch announcement to the beta list",
	"type_key": "task.default"
}
```

None contained `due_at`. The two passing Phase 1 repetitions each made one call with `due_at: "2026-08-07T15:00:00+00:00"`.

The update tool schema requires only `task_id`; `due_at` is optional because the same tool supports many update intents. The executor rejects an entirely empty update, but title/type fields make this request non-empty even when their values already match the task. The PATCH therefore succeeds, the unchanged task is reported as updated, and the model repeats the same no-effect call.

The repetition fingerprint includes tool name, parsed arguments, success, and error. In gateway mode the repetition limit is three, so the guard correctly detected the identical sequence and stopped it. The guard prevented a longer loop; it did not repair the missing scheduling field.

### Ranked hypotheses

1. **Confirmed model/tool-argument failure:** the emitted update omitted `due_at` three times. For this non-gateway schema tool, `normalizeToolCallDefaults` returns the call unchanged, so the scheduling field was not stripped by that normalizer.
2. **Strong executor/result gap:** unchanged title/type patches are treated as successful progress. The model receives success rather than a repairable no-effect signal.
3. **Strong intent-validation gap:** the runtime knows this is a reschedule request but does not require a scheduling field on the selected update call.
4. **Weak fixture/timezone explanation:** the deterministic fixture tests cover Friday and timezone boundaries, the prompt time was unambiguous, and two adjacent repetitions produced August 7 correctly.
5. **Not supported:** “the agent wrote August 5.” August 5 was the seeded value and never changed.

### Non-paid diagnostics and candidate fixes

1. Add an intent-aware validation test: when the resolved action is reschedule and `update_onto_task` lacks both `start_at` and `due_at`, return a repairable validation failure before execution.
2. Add executor/result tests for a patch whose supplied values all equal current values. Decide whether it should return `no_effect`, `success=false`, or structured `changed_fields=[]`; the orchestrator must not count it as mutation progress.
3. Ensure the repair message names the missing semantic field (`due_at`) and preserves the already-resolved task ID.
4. Add an orchestrator fixture with three observed no-op calls and prove the corrected path repairs once or terminates as degraded without claiming success.
5. Review whether `tool_repetition_limit` should map to a completed-but-degraded outcome rather than ordinary completion. Do not remove the limit or raise it as the fix.

## Cross-cutting causality assessment

### Evidence against a common history/admission corruption

- All three failed turns were turn 1 with raw/model history counts `0/0`.
- Their prompt dumps show fresh context loaded from the RPC and the correct seeded project/task/document inventory.
- The Phase 1 prompt context included the right current request and entity IDs.
- The scenario and stream-orchestrator directories have no code diff between measured Phase 0 commit `0f63e47bb` and measured Phase 1 commit `0147cbd94`.

### Evidence that Phase 1 still cannot be declared innocent

- The stream route changed substantially between the measured commits, including admission, history projection, event sink, observability, and server-only writer boundaries.
- The cohort is a small sample: 3/24 failures versus a retained 24/24 pass is material but cannot localize causality by itself.
- Provider latency and model routing differed between runs.
- Payload bodies and per-pass terminal routing are incomplete in the durable artifact.

### Working classification

| Failure                                | Product defect exposed by sampling?  | Plausible provider contribution?      | Evidence of Phase 1 admission regression? |
| -------------------------------------- | ------------------------------------ | ------------------------------------- | ----------------------------------------- |
| One-document-per-parent organization   | Yes, strong                          | Yes                                   | None found                                |
| Terminal-less partial answer discarded | Yes, strong recovery gap             | Yes, confirmed transport contribution | None found                                |
| Reschedule no-op updates               | Yes, strong validation/no-effect gap | Yes, model emitted bad args           | None found                                |

The defensible statement is: **the failures are not random in mechanism, but the trigger frequency and Phase 1 causality remain unresolved.**

## Investigation order for the next agent

### 1. Preserve and normalize evidence

- Extract sanitized failed/pass prompt-dump traces before `/private/tmp/buildos-phase1-gate-94bb04e62` disappears.
- Do not retain secrets, auth headers, full user data, or unrelated prompt bodies.
- Add durable structured terminal metadata for future failures before spending on another run.

### 2. Reproduce each mechanism without a provider

- Organization: feed the observed successful move set into the write-ledger/finalization logic and prove that semantic grouping is currently invisible.
- Research: stub two terminal-less streams with a long partial, completed reads, conditional mutation intent, and no pending calls.
- Reschedule: stub three identical title/type-only updates against an unchanged task and observe success/repetition behavior.

Useful non-paid suites:

```bash
pnpm --filter @buildos/web exec vitest run \
  src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.test.ts \
  src/lib/tests/agentic-e2e/scenarios/task-reschedule-cold-reference.scenario.test.ts \
  src/lib/tests/agentic-e2e/harness/assertions.test.ts
```

Add the smallest focused executor/validation suite required by any chosen fix.

### 3. Audit observability before another run

- Make failed-pass metadata durable.
- Fix or explain the seven-executions-versus-zero-counters discrepancy.
- Retain sanitized semantic tool fields needed for diagnosis, such as changed field names and `changed_fields`, without retaining arbitrary bodies.
- Ensure prompt-dump runtime metadata is appended on terminal errors as well as normal returns.

### 4. Implement only evidence-backed fixes

- Keep organization quality, stream recovery, and no-op mutation handling as separate patches/tests.
- Do not weaken scenario assertions.
- Do not increase retries, timeouts, tool rounds, or repetition limits without demonstrating why the current bound is the cause.
- Do not redesign the Phase 1 worker boundary to solve unrelated quality issues; fixes belong in the existing legacy runtime and must preserve parity.

### 5. Define readiness before requesting paid diagnostics

A targeted hosted diagnostic is justified only after:

1. each observed mechanism has a deterministic local regression test;
2. the proposed fix passes focused and existing orchestrator/executor suites;
3. terminal metadata is durable enough to explain a repeat failure;
4. the diff is reviewed against both measured commits; and
5. the user explicitly approves the hosted writes/provider spend.

Targeted scenario runs can validate a hypothesis but cannot close Phase 1. The final exit still requires a complete clean, retry-free 24-scenario / 30-turn cohort.

## Future paid commands — reference only, do not run without approval

For a future targeted diagnostic, use a clean exact server/test checkout, a new output path, retry `0`, and only the approved scenario IDs. Do not use the package script for a targeted subset because that script pins all eight scenario IDs and three repetitions.

```bash
AGENTIC_E2E_BASE_URL=http://127.0.0.1:5199 \
AGENTIC_PHASE0_CAPTURE=true \
AGENTIC_ASSERT_TELEMETRY=true \
AGENTIC_PHASE0_REPETITIONS=1 \
AGENTIC_E2E_RUN_LABEL=phase1-diagnostic \
AGENTIC_SCENARIOS=<approved-comma-separated-scenarios> \
AGENTIC_PHASE0_OUTPUT_PATH=<new-reviewed-output-path> \
pnpm --filter @buildos/web exec vitest run \
  --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts \
  --retry=0
```

The eventual full gate remains:

```bash
AGENTIC_E2E_BASE_URL=http://127.0.0.1:5199 \
AGENTIC_PHASE0_OUTPUT_PATH=<new-reviewed-output-path> \
pnpm --filter @buildos/web test:agentic:phase0-evidence
```

Both commands spend provider/judge money and write disposable fixtures/telemetry to hosted Supabase. Neither is authorized by this handoff.

## Exit criteria — satisfied by the remediation rerun

The Phase 1 block required all of the following. Each condition is now satisfied:

- the three mechanisms have been investigated with deterministic local evidence;
- any accepted fixes have regression coverage and do not weaken the quality contract;
- observability can explain terminal/repetition failures without relying on transient console output;
- an explicitly approved, clean, retry-free full cohort passes 24/24 scenarios and 30/30 turn assertions with zero stream/capture errors; and
- the Phase 1 handoff and parity ledger record that passing artifact and an explicit exit verdict.

## Fixes implemented 2026-07-31 (landed in `bb0f16da1`; DJ-approved)

All three mechanisms were reproduced deterministically without a provider and fixed in the
legacy web runtime, per this document's investigation order. No scenario assertion, retry
count, timeout, tool-round cap, or repetition limit was changed.

### Reschedule no-op loop (dossier 3)

- `turn-intent.ts` — new `turnIntentRequestsTaskScheduling()`: ground-truth detection of
  re-dating requests from the USER's words only (reschedule/postpone/defer/delay, "push …
  to friday", "push … out", due-date phrasing), scoped to update/organize intents against a
  task or unresolved target. Never keys off model output (forward-carry escape-hatch
  lesson).
- `tool-validation.ts` + `stream-orchestrator/index.ts` — while the turn is a scheduling
  request and no call in the turn has carried `start_at`/`due_at`, an `update_onto_task`
  without either fails validation pre-execution with a repair message naming `due_at` and
  preserving the resolved `task_id`. Round-atomic: one dated call in the round clears
  sibling calls (rename + reschedule splits do not ping-pong).
- `ontology-write-executor.ts` — `updateOntoTask` now detects a no-effect patch (every
  supplied scalar field equals the stored value, date fields compared after parse) and
  throws a repairable error instead of reporting "Updated". Fail-open on details-load
  failure; payloads touching `props`/assignees skip the check.
- Reproductions: `reschedule-noop-update.regression.test.ts` (observed echo blocked,
  repaired call is the only PATCH), no-effect cases in
  `ontology-write-executor.write-integrity.test.ts`, predicate cases in
  `turn-intent.test.ts`, validation cases in `tool-validation.test.ts`.

### Discarded transport partial (dossier 2)

- `stream-orchestrator/index.ts` — the recovery predicate now admits a mutation-requested
  turn when ZERO successful writes exist (nothing half-done can be misreported); once a
  write has succeeded the turn still fails loudly. Recovered text is passed through
  `enforceMutationOutcomeIntegrity`, which rewrites success claims for unexecuted writes
  and appends an explicit "has not run yet / remains pending" disclosure for the
  conditional mutation. Recovered turns finish `completed_degraded` /
  `synthesis_recovered` (not in the harness failure set — the scenario contract holds
  without weakening).
- Reproduction: `mutation-partial-recovery.regression.test.ts` — two terminal-less
  attempts after successful reads recover the 120+-char partial; a claiming partial is
  rewritten; a turn with an executed write still fails and carries the recovery decision.

### Observability (investigation-order step 3)

- `llm-pass-runner.ts` — `LlmStreamPassTerminalError` now carries `turnProgress`
  (rounds/calls/executions), `discardedPartialChars`, and `recoveryBlockedReason`, stamped
  by the orchestrator before rethrow.
- `routes/api/agent/v2/stream/+server.ts` — the error path now records a durable
  `stream_terminal_failure` event with the full terminal measurements (previously
  console-only) and reconciles `tool_call_count` / `tool_round_count` from completed
  executions plus the stamped snapshot (fixes the seven-executions-versus-zero-counters
  discrepancy).
- `stream-orchestrator/index.ts` — dev prompt dumps now get runtime metadata appended on
  terminal errors, not only on normal returns.

### One-document-per-parent organization (dossier 1, prompt-level fix only)

- The forced write-pass instruction (`index.ts`) and
  `buildOrganizeCommissionRepairInstruction` (`repair-instructions.ts`) now state that
  grouping requires reusing the exact same `new_parent_title` for related documents, with
  a two-documents-one-category example, and that one-folder-per-document is filing, not
  organizing. A runtime grouping postcondition was deliberately deferred until this recurs
  after the instruction fix.

### Verification

- `vitest run` over `agentic-chat-v2/` + `agentic-chat/tools/` + the reschedule scenario
  unit/assertions suites: 72 + 52 files, 1,086+ tests, all passing; `svelte-check` 0/0.
- Coordination note: these edits change the v2 route — the tasker/41 open-brief cohort's
  production-control lane. No lane output existed at edit time (corpus gate still blocks
  execution); the cohort must record the post-fix commit as its control build.

### Hosted verification and remaining follow-ups

- The explicitly approved, clean, retry-free-at-the-test-level full cohort passed 24/24
  scenarios and 30/30 turn assertions. Artifact:
  `docs/plans/evidence/agentic_chat_worker_phase1_gate_rerun_2026-07-31_bb0f16da1.json`.
- The formerly failing organization, terminal-research, and reschedule scenarios each
  passed 3/3 repetitions. No runtime grouping postcondition was needed for this exit.
- One `research-log-readback` pass hit the runtime's 60-second LLM-pass timeout and then
  recovered through its existing built-in transient retry. The turn finished `completed`
  / `stop`, its readback assertion passed, and the artifact records no stream/capture
  error. This event is ephemeral server-log evidence and should remain in the separate
  provider timeout-band investigation; it is not a hidden scenario retry.
- TTFT remains a performance follow-up. On the passing rerun, client TTFT p50/p95 was
  5.065/17.448 seconds versus the retained Phase 0 baseline's 4.254/16.681 seconds. Hosted
  admission p50/p95 was 119/194 ms versus 96/108 ms in Phase 0.
