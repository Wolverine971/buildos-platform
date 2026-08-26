<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_PHASE_4_BATTERY_FAILURE_INVESTIGATION_HANDOFF_2026-08-20.md -->

# Agentic Chat Worker Phase 6 — Phase 4 Battery Failure Investigation Handoff

**Date:** 2026-08-20 EDT / 2026-08-21 UTC  
**Status:** INVESTIGATED 2026-08-20 — see `AGENTIC_CHAT_WORKER_PHASE_6_PHASE_4_BATTERY_ROOT_CAUSE_REPORT_2026-08-20.md`. All 8 over-clarifications were reviewer vetoes on contract form; restraint failures = reviewer never forced to enumerate candidates; date failures = harness/prompt timezone split-brain (instrument + live product defect). No remediation or paid rerun performed.  
**Source under test:** `49dcd5a2b4574ac9efdb456b5c3734c9827e7035`  
**Purpose:** Give the next agent enough evidence to investigate the three behavioral failure clusters from the post-Railway Phase 4 battery without repeating the run.

## 1. Executive conclusion

The new dedicated Railway worker worked correctly as infrastructure, but the agent's behavioral
quality regressed sharply against both Phase 4 comparison lanes.

- **Scenario repetitions:** `5/18` passed.
- **Turn assertions:** `8/21` passed.
- **Every turn completed:** `21/21`.
- **Stream-error turns:** `0`.
- **Evidence-capture errors:** `0`.
- **Execution attribution:** every turn was exact
  `worker_realtime / agentic_chat_worker_v1`; there was no legacy fallback.
- **Provider cost:** `$0.11526330`.

The thirteen failed repetitions fall into three concrete behavior clusters:

| Cluster                                                       | Count | What went wrong                                                                                                                                      |
| ------------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Over-clarification / failure to execute a resolved commission |     8 | The agent asked for confirmation or another choice even though the user had already supplied enough information or delegated the remaining judgment. |
| Under-restraint / guessing through genuine ambiguity          |     3 | The agent selected one of three matching email tasks, approved the mutation twice, and wrote it instead of asking which task the user meant.         |
| Relative-date resolution                                      |     2 | The agent executed the correct task mutation but set Friday to `2026-08-28` instead of the next day, `2026-08-21`.                                   |

These clusters point in opposite directions. This is not adequately explained as the agent being
globally “too cautious” or “too aggressive.” It was cautious when the commission was resolved and
aggressive when the target was genuinely unresolved. The investigation should therefore center on
how the acting pass and semantic reviewers distinguish a **required user choice** from a choice the
user already made or explicitly delegated.

Do not treat this as a Railway transport failure. The worker claimed, executed, published,
persisted, finalized, and exposed retained evidence correctly throughout the run.

## 2. User direction for this investigation

The user wants another agent to deep-dive the failures and determine what happened.

- Do **not** respond to this handoff by building deterministic fixtures.
- Do **not** run another paid battery without fresh authorization.
- Do **not** widen the production cohort or leave mutation capabilities enabled.
- Start with the retained production evidence and the exact failed turn IDs below.
- Return evidence-backed root-cause findings and recommended next actions before changing behavior.

## 3. Exact run identity

### 3.1 Repository and harness

The battery ran from a detached, clean worktree:

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| Worktree        | `/private/tmp/buildos-phase4-current`      |
| Git head        | `49dcd5a2b4574ac9efdb456b5c3734c9827e7035` |
| Git tree        | `e7d8ad60fef4688b2901934f8975a747e0e7675b` |
| Dirty           | `false`                                    |
| Base URL        | `https://build-os.com`                     |
| Execution mode  | `worker_realtime`                          |
| Repetitions     | `3` per scenario                           |
| Harness retries | `0`                                        |
| Turn count      | `21`                                       |
| Vitest duration | `1364.50s`                                 |

The explicit zero-spend preflight passed `1/1` in `9.731s` before the battery. It authenticated,
subscribed to Realtime, and obtained an exact worker transport lease without starting a model turn.

The paid command shape was:

```bash
AGENTIC_E2E_BASE_URL=https://build-os.com \
AGENTIC_E2E_EXECUTION_MODE=worker_realtime \
AGENTIC_ASSERT_TELEMETRY=true \
AGENTIC_PHASE0_CAPTURE=true \
AGENTIC_PHASE0_REPETITIONS=3 \
AGENTIC_E2E_RUN_LABEL=phase6-post-railway-phase4-battery-20260820 \
AGENTIC_PHASE0_OUTPUT_PATH=/private/tmp/buildos-agentic-phase6-phase4-battery-20260820-49dcd5a2b.json \
AGENTIC_SCENARIOS=restraint-noop-and-ambiguity,task-reschedule-cold-reference,task-multi-update,project-catchup-cold,task-complete-cold-reference,project-organize \
pnpm --filter @buildos/web exec vitest run \
  --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts \
  --retry=0
```

### 3.2 Live deployment receipts used during the battery

| Surface                       | Receipt                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| Vercel test-cohort deployment | `dpl_EP1h8QPDcfWSig53BV6kDhQDCjZa`                                    |
| Vercel test URL               | `build-ivhlunjvo-djwayne35gmailcoms-projects.vercel.app`              |
| Railway staged deployment     | `37e3a6fb-c491-4d1f-88b6-ac4534ca025d`                                |
| Railway source                | exact `49dcd5a2b4574ac9efdb456b5c3734c9827e7035`                      |
| Railway entrypoint            | `node apps/worker/dist/chat-worker.js`                                |
| Test user UUID                | `76c04859-837c-4d13-88ea-9a39ed15ed81`                                |
| Staged provider capabilities  | `createOntoDocument,createOntoTask,updateOntoTask,moveDocumentInTree` |
| Staged adapter capabilities   | same exact four values                                                |

### 3.3 Raw artifact

The retained JSON is currently at:

`/private/tmp/buildos-agentic-phase6-phase4-battery-20260820-49dcd5a2b.json`

SHA-256:

`686d35ceb3e94548c34bf90f672bd60b5d58f7a2418cce689ee81caacd755835`

The artifact is approximately 202 KB. It contains no prompt, message, tool-argument, tool-result,
or event payload bodies. It does contain exact turn IDs, terminal state, assertion outcomes, tool
names, timings, usage, provider/model attribution, and retained-row measurements. The next agent
should use the IDs below to query the service-only durable evidence when payload-level analysis is
needed.

Because the artifact is in `/private/tmp`, preserve it into the normal evidence directory before
cleaning temporary worktrees or rebooting the machine.

## 4. Comparison with Phase 4

| Scenario                         | Current dedicated worker | Latest Phase 4 worker | Same-day legacy comparator |
| -------------------------------- | -----------------------: | --------------------: | -------------------------: |
| `project-catchup-cold`           |                  **3/3** |               **3/3** |                        2/3 |
| `task-complete-cold-reference`   |                      2/3 |                   1/3 |                    **3/3** |
| `restraint-noop-and-ambiguity`   |                      0/3 |                   2/3 |                        1/3 |
| `task-reschedule-cold-reference` |                      0/3 |               **3/3** |                    **3/3** |
| `task-multi-update`              |                      0/3 |                   2/3 |                    **3/3** |
| `project-organize`               |                      0/3 |                   0/3 |                        0/3 |
| **Total**                        |                 **5/18** |             **11/18** |                  **12/18** |
| **Turn assertions**              |                 **8/21** |             **14/21** |                  **15/21** |
| **Stream-error turns**           |                    **0** |                     2 |                          0 |
| **Cost**                         |          **$0.11526330** |           $0.11939497 |                $0.29185278 |

Historical sources:

- Latest Phase 4 worker artifact:
  `docs/plans/evidence/agentic_chat_worker_phase4_six_class_second_remediation_exit_2026-08-19_33b4faec.json`
- Same-day legacy comparator:
  `docs/plans/evidence/agentic_chat_worker_phase4_six_class_LEGACY_comparator_2026-08-19_11c50cb2b.json`
- Comparator report:
  `docs/plans/evidence/AGENTIC_CHAT_WORKER_PHASE_4_LEGACY_SAME_DAY_COMPARATOR_2026-08-19.md`
- Phase 4 continuation history:
  `docs/plans/AGENTIC_CHAT_WORKER_PHASE_4_CONTINUATION_HANDOFF_2026-08-18.md`

The current worker improved completion from `1/3` to `2/3` and retained catch-up at `3/3`, but it
lost all prior passes in restraint, rescheduling, and multi-update. Organization remained `0/3`.

## 5. Cluster one — over-clarification and failure to execute

### 5.1 Summary

Eight repetitions did not execute a mutation even though the scenario supplied a resolved
commission or delegated the remaining judgment:

- `project-organize`: `3/3` failed this way.
- `task-complete-cold-reference`: `1/3` failed this way.
- `task-reschedule-cold-reference`: `1/3` failed this way.
- `task-multi-update`: `3/3` failed this way.

This is the largest cluster and is not merely a conversational-style issue. In every case the
clarification prevented the durable outcome the user requested.

### 5.2 Project organization — three failures

User commission:

> This project's documents are a mess — loose notes, raw meeting dumps, half-baked ideas, all piled
> at the top level. Help me get it organized into something sensible.

The user explicitly delegated what “sensible” organization means. The existing semantic guidance
also says delegated organization may include reasonable parent creation and moving existing items.

Observed outcomes:

| Rep | Stream run                             | Turn run                               | Control/tool path                                                                                           | Failure                                                                           |
| --: | -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
|   1 | `88009f91-eb64-4229-8484-d79033e14cc8` | `7de4077c-b413-46f0-b7a3-18d055114512` | 13 document reads → `declare_turn_contract` → `approve_turn_contract_review` → `request_turn_clarification` | It obtained approval and still switched to clarification; no move executed.       |
|   2 | `354c5726-d009-4e99-beac-33c351391dfb` | `f1836dfb-c2da-4c6d-bd4f-48e0cbb0baa0` | `get_document_tree` → declaration → clarification                                                           | It requested a choice the user had delegated; semantic review was never approved. |
|   3 | `39ff26ae-d9f9-4db3-a303-162520b997ad` | `538cdca9-a866-4661-86f5-3724494a794f` | tree + six outline reads → declaration → clarification                                                      | Same delegated-choice failure after gathering substantial evidence.               |

Rep 1 is especially important. The independent turn-contract review approved the declared
commission, yet the continuation later requested clarification. Investigate whether the acting
model, the post-review continuation, or the forced-synthesis path can supersede an approved
contract without new contradictory evidence.

Also inspect why rep 1 spent nine provider requests and sixteen tool executions, including repeated
document reads, before declining to act. It cost `$0.01695511` by itself and retained 73 rows / about
208 KB of serialized row data.

### 5.3 Cold task completion — one failure

User report:

> hey so the task where i was gonna talk to that company northwind, just talked to them, it went
> well, they liked the agent orchestration stuff. now the next thing is i'm just waiting to hear
> back from them

Exactly one Northwind task existed. The user stated that the work happened. Optional follow-up
metadata did not need to block completing the existing task.

| Rep | Stream run                             | Turn run                               | Tool path                              | Failure                                                              |
| --: | -------------------------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
|   1 | `a5f12a83-3c93-4d50-b776-873676320b1d` | `21f80366-cf25-4f38-b67f-ae63080ac709` | declaration → approval → clarification | No `update_onto_task`; the already-approved completion did not land. |

Reps 2 and 3 passed. Compare their prompt snapshots, provider routes, semantic-control tool arguments,
and continuation messages directly against rep 1. This is the cleanest same-run pass/fail contrast
for the over-clarification cluster.

### 5.4 Cold task reschedule — one clarification failure

User instruction:

> push the beta list email thing to friday, i'm not gonna get to it before then

The fixture had exactly one task matching the description, and the run occurred on Thursday,
August 20, 2026 in the scenario timezone.

| Rep | Stream run                             | Turn run                               | Tool path                   | Failure                                                                             |
| --: | -------------------------------------- | -------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
|   1 | `9fd089c0-cff0-4779-a0c2-6f652146df24` | `f112407f-094e-4e76-812e-06c84383672e` | declaration → clarification | Asked whether Friday meant August 21 or August 28 instead of using the next Friday. |

This rep belongs to both the general clarification investigation and the relative-date
investigation. Determine what current date/timezone context the acting pass actually received.

### 5.5 Multi-update — three clarification failures

User report/instruction:

> ok so i knocked out the resume update and the linkedin thing this morning, and the halcyon prep
> needs to be top priority now, they moved the onsite up

The message contains three resolved operations: mark the unique resume task done, mark the unique
LinkedIn task done, and raise the unique Halcyon task's priority. A fourth control task must remain
untouched.

| Rep | Stream run                             | Turn run                               | Tool path                   | Failure                                                              |
| --: | -------------------------------------- | -------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
|   1 | `237f9e2f-c6b3-425d-a740-adf8a94263a7` | `7592b7dc-4c16-4668-bf4d-e9ded870e024` | declaration → clarification | Asked the user to reconfirm the completed tasks and clarify Halcyon. |
|   2 | `8471e9cf-3fed-4ad5-ba4d-c1e07d137ac5` | `e207d077-1190-4dc3-8b8e-36574a8edb43` | declaration → clarification | Restated the two completions, then stopped for clarification.        |
|   3 | `ab8e9094-9b8d-4715-b78e-7fe432882a5d` | `dd95bc51-698c-48af-958f-6450df092a54` | declaration → clarification | Explicitly asked whether to perform the already-stated changes.      |

All three failed before `approve_turn_contract_review`, mutation-batch review, or any
`update_onto_task` call. Investigate the initial semantic disposition and why the current explicit
guidance—“several explicitly commissioned changes in one utterance belong to one contract”—did not
control these passes.

### 5.6 Questions for cluster one

1. Which model/provider made the final `request_turn_clarification` decision in each turn?
2. What exact unresolved field or required user choice was named in the control-tool arguments?
3. Did the prompt include the full loaded project context and the current semantic commission
   guidance?
4. Did any reviewer reject a correct declaration, or did the acting model request clarification
   before review?
5. In organization rep 1, why could clarification override an approved contract?
6. Did the unavailable-skill or forced-synthesis repair path participate in any of these turns?
7. Are prompt length, repeated reads, or provider fallback correlated with the disposition change?

## 6. Cluster two — under-restraint and ambiguous-target mutation

### 6.1 Summary

All three `restraint-noop-and-ambiguity` repetitions correctly handled the first, read-only turn.
They then failed the second turn in exactly the dangerous direction: the user said “the email
one's done” while three tasks matched “email,” and the worker guessed the beta-list task.

The three candidates were:

1. `Send the launch email to the beta list`
2. `Draft the investor update email`
3. `Fix the email verification bug on signup`

Expected behavior was to name the candidates, ask which one the user meant, and write nothing.

### 6.2 Exact failures

| Rep | Stream run                             | Turn run                               | Tool path                                                                           | Failure                                   |
| --: | -------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
|   1 | `3844c897-5685-4318-924c-eab32186fbc0` | `10979fb1-25af-4573-8023-b3cb732b5ab6` | declaration → turn-contract approval → mutation-batch approval → `update_onto_task` | Guessed and completed the beta-list task. |
|   2 | `71f01a6e-c5c4-4255-8362-6b7eca8f26ad` | `5038a869-731e-4432-92ba-f81fbf5122b6` | same four-stage path                                                                | Same incorrect target and durable write.  |
|   3 | `7e711cd2-a450-4449-a970-0a6e4c79ef64` | `0c1293e7-d4a0-4a78-ab3c-9caf3bfc20bc` | same four-stage path                                                                | Same incorrect target and durable write.  |

This was not one acting-model guess that a reviewer caught. Both independent safety boundaries
approved the guessed target in every repetition:

- `approve_turn_contract_review`
- `approve_mutation_batch_review`

That makes this the highest-risk cluster despite having fewer failures than cluster one. The
semantic-review layers did not add independent restraint.

### 6.3 Investigation focus

1. Query the exact declaration, review, mutation-batch, and update arguments for all three turns.
2. Determine what evidence was presented to each reviewer about the three matching candidates.
3. Check whether session history from turn 1 accidentally biased “the email one” toward the
   beta-list task even though turn 1 deliberately discussed the non-email pricing task.
4. Check the project context/tool result supplied to the acting model. Did it include all three
   email tasks, or did ranking/truncation surface only one?
5. Verify whether the reviewers were given the same candidate set or only the acting model's
   selected target.
6. Determine whether “past-tense reports commission a state change when exactly one loaded entity
   fits” was applied without enforcing its “exactly one” condition.
7. Compare against the historical Phase 4 passes for this scenario and the legacy comparator's
   one passing repetition.

The investigation should explicitly say whether the defect is in retrieval/context assembly,
acting-model semantic disposition, reviewer evidence, reviewer prompt policy, or more than one
layer.

## 7. Cluster three — relative-date resolution

### 7.1 Summary

Two reschedule repetitions found the correct task, passed both semantic reviews, and executed
`update_onto_task`, but wrote the wrong date:

- Run date in `America/New_York`: Thursday, August 20, 2026.
- User phrase: “to friday.”
- Expected next Friday: `2026-08-21`.
- Written date: `2026-08-28`.

| Rep | Stream run                             | Turn run                               | Tool path                                                 | Failure                                      |
| --: | -------------------------------------- | -------------------------------------- | --------------------------------------------------------- | -------------------------------------------- |
|   2 | `1d5d06ee-43d0-423d-af19-a37a53762c10` | `cb76e20c-551f-4f34-afb6-e45feae3becd` | declaration → approval → mutation-batch approval → update | Correct target, wrong Friday (`2026-08-28`). |
|   3 | `54330b8a-b552-4b35-82a5-12d46207374f` | `b84c120d-93ec-46fb-8987-a05616c53e29` | same path                                                 | Correct target, same wrong Friday.           |

Rep 1 asked the user to choose between August 21 and August 28. Across all three repetitions, the
agent recognized the two candidate dates but did not reliably apply “next upcoming Friday.”

### 7.2 Investigation focus

1. Read the exact current-date and timezone context in each retained prompt snapshot.
2. Confirm whether the worker prompt said `2026-08-20`, UTC `2026-08-21`, or both.
3. Check the exact `due_at` value proposed by the acting model and approved by the mutation reviewer.
4. Determine whether any date normalization layer modified the model-proposed date.
5. Compare these turns with the historical Phase 4 worker and legacy runs, both `3/3`.
6. Check whether the UTC date boundary during the test caused a prompt/scenario timezone mismatch.

This cluster may be a model/prompt error, a timezone-context error, or a harness expectation issue.
Do not assume which one without comparing the prompt snapshot, model arguments, server clock, and
scenario fixture notes.

## 8. Passing evidence worth using as controls

The next agent should not analyze only failed turns. The same run has useful controls:

- `project-catchup-cold`: `3/3` passed.
- `task-complete-cold-reference`: reps 2 and 3 passed while rep 1 failed.
- `restraint-noop-and-ambiguity`: the first read-only turn passed in all three repetitions; only the
  ambiguous second turn failed.
- Every worker turn completed with a durable terminal row.

The completion scenario is the strongest same-input stochastic comparison. Use it to isolate model
route, provider, prompt snapshot, tool arguments, and reviewer decisions that differ between the
one failure and two passes.

## 9. Reliability and performance evidence

### 9.1 Infrastructure result

The run produced no evidence of a worker-transport defect:

- `21/21` terminal completed turns.
- `0` stream-error turns.
- `0` capture-error turns.
- Health snapshots during the run repeatedly showed:
    - one active turn while executing;
    - fresh successful claims;
    - zero consecutive claim failures;
    - zero recovery candidates;
    - no draining.
- After the run, the worker returned to zero active turns.

### 9.2 Timing

| Metric               |    Current | Latest Phase 4 worker |
| -------------------- | ---------: | --------------------: |
| Client total p50     |  `57.980s` |             `53.729s` |
| Client total p95     |  `98.053s` |            `135.573s` |
| Client total max     | `102.811s` |            `151.002s` |
| TTFT p50             |  `10.260s` |              `8.981s` |
| TTFT p95             |  `41.441s` |             `28.245s` |
| Response headers p50 |   `2.261s` |              `2.287s` |
| First SSE event p50  |   `3.417s` |              `3.740s` |

Tail completion latency improved materially and deterministic stream failures disappeared. TTFT
tail latency worsened. Organization rep 1's repeated reads are a major long-turn contributor and
should be analyzed separately from queue/transport latency.

### 9.3 Cost and retained data

- Total cost: `$0.11526330`, close to the latest worker battery's `$0.11939497` and about 60.5%
  below the same-day legacy comparator's `$0.29185278`.
- Tool executions: `83` samples versus `70` in the latest Phase 4 worker artifact.
- Retained rows per turn: p50 `34`, p95 `46`, max `73`.
- Retained approximate JSON bytes per turn: p50 `159,939`, p95 `178,083`, max `207,772`.

## 10. Configuration defect exposed during staging

Before the battery, changing Railway variables caused a replacement instance to fail startup with:

`AGENTIC_CHAT_OPENROUTER_MODEL must be a nonempty canonical value`

Readback proved the dedicated service's model variable was an exact empty string. The already
running instance remained healthy, so this defect would have surfaced on the next restart even
without the battery.

- Failed deployment: `3039b71a-df97-4c8c-bad0-bd9d57450aa1`.
- Corrected explicit value: `deepseek/deepseek-v4-flash`.
- Corrected staged deployment: `37e3a6fb-c491-4d1f-88b6-ac4534ca025d`.
- Final restored deployment: `52b13839-6a70-4136-8717-61bd07536808`.

The reason the value became blank was not proven in this run. Do not state a specific variable
reference chain as fact without examining Railway variable history. The repair was intentionally
retained because the documented production contract requires this exact model and leaving it blank
would make the service restart-unsafe.

This startup issue was resolved before the preflight and is separate from the three behavioral
clusters.

## 11. Production restoration receipt

Production was restored web-first after the battery.

### Vercel

| Field                                  | Final value                                             |
| -------------------------------------- | ------------------------------------------------------- |
| Deployment                             | `dpl_4QEUShXWuT5dYBkvRroRVet3wLTg`                      |
| State                                  | `READY`, aliased to `build-os.com`                      |
| `AGENTIC_CHAT_WORKER_ROUTING_ENABLED`  | exact `true`                                            |
| `AGENTIC_CHAT_WORKER_ROUTING_USER_IDS` | exact `255735ad-a34b-4ca9-942c-397ed8cc1435`            |
| `PRIVATE_AGENTIC_CHAT_WORKER_URL`      | `https://agentic-chat-worker-production.up.railway.app` |
| `PUBLIC_RAILWAY_WORKER_URL`            | `https://daily-brief-worker-production.up.railway.app`  |
| `AGENTIC_CHAT_WORKER_KILL_EPOCH`       | `0`                                                     |

### Dedicated Railway worker

| Field                          | Final value                                      |
| ------------------------------ | ------------------------------------------------ |
| Deployment                     | `52b13839-6a70-4136-8717-61bd07536808`           |
| State                          | `SUCCESS`                                        |
| Source                         | exact `49dcd5a2b4574ac9efdb456b5c3734c9827e7035` |
| Start command                  | `node apps/worker/dist/chat-worker.js`           |
| Worker enabled/profile         | `true` / `production`                            |
| Model                          | `deepseek/deepseek-v4-flash`                     |
| Internal cohort                | exact `255735ad-a34b-4ca9-942c-397ed8cc1435`     |
| Provider mutation capabilities | exact empty string                               |
| Adapter mutation capabilities  | exact empty string                               |
| Concurrency / poll             | `1` / `1000ms`                                   |

Final health showed zero active turns, zero claim failures, no draining, zero recovery candidates,
and zero recovery failures. The legacy `daily-brief-worker` remained healthy with Agentic Chat
disabled and `runtime = null`. `https://build-os.com` returned HTTP 200.

## 12. Recommended investigation sequence

This is an investigation sequence, not an implementation or fixture plan.

1. Verify the raw artifact checksum and parse the failed turns by `streamRunId`.
2. Query retained `chat_turn_runs`, `chat_turn_events`, `chat_tool_executions`,
   `chat_prompt_snapshots`, execution observations, and `llm_usage_logs` for the exact IDs in this
   handoff.
3. Reconstruct each control sequence:
    - acting semantic disposition;
    - turn-contract declaration;
    - independent contract review;
    - mutation-batch review;
    - final mutation or clarification.
4. Identify the model, provider, request number, and prompt snapshot responsible for each decision.
5. Compare current failures against:
    - same-run passing completion reps;
    - latest Phase 4 worker turns;
    - same-day legacy comparator turns.
6. Audit whether every reviewer saw the underlying evidence or only the acting model's selected
   target/value.
7. Check changes between `33b4faec017264e87ecda102cbd5db12a962316c` and
   `49dcd5a2b4574ac9efdb456b5c3734c9827e7035`, especially:
    - semantic commission guidance in `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts`;
    - clarification-forced synthesis behavior;
    - unavailable-skill repair behavior;
    - Phase 5 prompt/execution changes that may alter context or pass ordering.
8. Separate findings into:
    - confirmed code/prompt defect;
    - confirmed context/retrieval defect;
    - confirmed date/timezone defect;
    - provider/model nondeterminism;
    - harness issue;
    - unknown pending more evidence.
9. Return a short root-cause report with confidence levels, supporting IDs, and the smallest credible
   remediation options. Do not implement or rerun until the user chooses a direction.

## 13. Investigator deliverable

The next agent should return:

| Area                | Required output                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Over-clarification  | Exact decision layer responsible for each of the eight failures and why the commission was treated as unresolved.      |
| Under-restraint     | Why all three matching tasks were not preserved as ambiguity and why both reviewers approved the guessed target.       |
| Relative dates      | Exact date/timezone context, proposed mutation value, reviewer-visible value, and where `2026-08-28` entered the path. |
| Model/provider role | Whether failures correlate with a provider route, request number, fallback, or prompt-length condition.                |
| Code-change role    | Whether any change after `33b4faec` materially altered the failing decision paths.                                     |
| Harness validity    | Any confirmed defect in scenario expectation or instrumentation, kept separate from product behavior.                  |
| Recommendation      | Ranked remediation options and what evidence would validate them, without starting another paid battery.               |

The investigator should lead with confirmed evidence, explicitly label inference, and avoid calling
the Railway migration unhealthy merely because the model-policy score regressed.
