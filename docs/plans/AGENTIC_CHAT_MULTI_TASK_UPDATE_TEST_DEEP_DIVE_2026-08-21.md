<!-- docs/plans/AGENTIC_CHAT_MULTI_TASK_UPDATE_TEST_DEEP_DIVE_2026-08-21.md -->

# Agentic Chat `task-multi-update` Test Deep Dive

**Date:** 2026-08-21  
**Scenario ID:** `task-multi-update`  
**Current verdict:** Keep the test. Its product requirement is legitimate. The current worktree now
separates behavioral outcomes from transport failures and treats the exact tool name as a diagnostic
rather than the ultimate source of truth.

## Executive answer

This test asks whether Agentic Chat can apply **three distinct changes from one natural, dictated
sentence** without dropping a clause or touching an unrelated task:

1. Mark the resume task done.
2. Mark the LinkedIn task done.
3. Raise the Halcyon preparation task to top priority.
4. Leave a fourth control task alone and create no duplicate tasks.

That is a credible user behavior, not a synthetic edge case. The latest worker run scored **1/3**.
That does **not** mean an LLM judge assigned two zeroes. One repetition asked an unnecessary
clarifying question, one died in provider tool-validation repair, and only the successful repetition
became eligible for the 1–5 quality judge. That eligible repetition passed with a score somewhere in
the accepted **3–5** range; the evidence format did not retain the exact value.

## Implementation update — current worktree, not yet live-verified

The investigation followed the six surfaces in the Agent Surfaces Framework rather than assuming
the prompt or model was the only problem:

| Surface    | Ground-up finding and current action                                                                                                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model      | Three live repetitions are too few to isolate a model-level regression. No model change was made.                                                                                                                                                                                                                                 |
| Context    | The retained failing runs contained the four seeded task identities and enough unique title context to resolve `resume`, `linkedin`, and `halcyon`. No context-flow defect was found.                                                                                                                                             |
| Tools      | The task tool definition already states that priority `1` is highest. The runtime did have a postcondition gap: it could count a write to the right field as fulfillment without proving the declared value landed. The write ledger now records scalar values, and contract fulfillment checks the final value after all writes. |
| Skills     | The task-management skill already covers exact IDs, state changes, and priority direction. The failures occurred before skill guidance could plausibly decide the outcome, so forcing another skill load would add context cost without addressing the defect.                                                                    |
| Harness    | The current worker already includes bounded reviewer revision and clearer provider-validation diagnostics added after the retained artifact. The runtime value check above closes the remaining false-positive contract-fulfillment path.                                                                                         |
| Instrument | Database state is now primary; exact mutation routes are diagnostic. The scenario records independent subchecks, full seeded-row collateral fingerprints, structured judge outcomes, transport/behavior/quality/instrument classifications, content-free execution observations, and Wilson 95% intervals.                        |

These changes have deterministic unit and type-check coverage, but the latest live evidence remains
the historical **1/3** result below. The next credible product verdict requires a clean, deployed,
exact-revision run with at least five repetitions; no paid production run was started implicitly from
this dirty shared worktree.

## Where the test lives and runs

| Concern                                                | Location                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Scenario fixture, prompt, assertions, and judge rubric | `apps/web/src/lib/tests/agentic-e2e/scenarios/task-multi-update.scenario.ts`            |
| Battery registration and production execution          | `apps/web/src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts`                |
| Assertion helpers and judge transcript builder         | `apps/web/src/lib/tests/agentic-e2e/harness/assertions.ts`                              |
| Database and turn telemetry reads                      | `apps/web/src/lib/tests/agentic-e2e/harness/telemetry.ts`                               |
| Assertion-before-judge sequencing                      | `apps/web/src/lib/tests/agentic-e2e/harness/turn-sequencing.ts`                         |
| LLM judge implementation                               | `apps/web/src/lib/tests/agentic-e2e/harness/judge.ts`                                   |
| Latest retained run                                    | `docs/plans/evidence/agentic_chat_worker_phase6_phase4_rerun_2026-08-20_0ee9cb82f.json` |

The scenario is a production-path end-to-end test. It seeds real project data, sends one chat turn
through the configured execution path, observes streamed output and durable telemetry, and then
queries the database to verify the final state.

## Exact fixture and prompt

The test creates a personal job-search project named `Multi Update` with four tasks:

| Task                                              | Initial state | Initial priority | Intended result     |
| ------------------------------------------------- | ------------- | ---------------: | ------------------- |
| `Update resume with the orchestration work`       | `todo`        |            unset | `done`              |
| `Refresh the LinkedIn headline and about section` | `todo`        |            unset | `done`              |
| `Prep system design answers for Halcyon Labs`     | `todo`        |              `4` | priority `1` or `2` |
| `Write the take-home postmortem`                  | `todo`        |            unset | remain `todo`       |

The single user message is:

> ok so i knocked out the resume update and the linkedin thing this morning, and the halcyon prep
> needs to be top priority now, they moved the onsite up

The wording is deliberately informal and run-on. The scenario comment says it is modeled on the
way the product owner actually dictates updates: content references rather than artificial ordinal
instructions such as “mark the first two done.”

## What the test is actually measuring

The kernel is **multi-clause completeness**. A response can sound polished while silently applying
only the first clause. Database checks are therefore more important than the prose response.

The test also measures:

- entity resolution from short, unique content references (`resume`, `linkedin`, `halcyon`);
- direct execution when the user reports facts and gives an unambiguous priority change;
- priority-direction correctness, where a lower number means higher priority;
- restraint around an unrelated control task;
- absence of accidental duplicate task creation;
- worker transport and durable-run completion; and
- concise, accurate reporting after the mutations have occurred.

It is **not** testing exact phrasing, exact task titles in the response, an exact priority of `1`, or a
specific order of tool calls.

## How scoring works

This is a hybrid deterministic-plus-LLM test. It retains one end-to-end pass/fail result per
repetition while also recording independent diagnostic subchecks and a failure classification.

### Stage 1: deterministic gate

The assertions execute in this order:

1. The streamed turn succeeded with no terminal stream error.
2. The assistant returned non-empty text.
3. The durable turn run completed.
4. All four seeded tasks still exist.
5. The resume task is `done`.
6. The LinkedIn task is `done`.
7. Halcyon has a numeric priority of `1` or `2`.
8. The control task is still `todo`.
9. No new tasks were created.
10. A full material-field fingerprint permits only the intended state/completion timestamps on the
    first two tasks, priority on Halcyon, and unavoidable `updated_at` changes.

Observed contract approvals and canonical ontology mutation calls are retained as independent
diagnostics. They are not allowed to overrule the durable database outcome.

The three requested changes are collected into one detailed error if the test reaches the database
checks, so it can report whether one or several clauses were dropped.

### Stage 2: LLM quality judge

Only after **every deterministic assertion passes**, a separate judge scores the transcript from
`1` to `5`. The passing threshold is `3`.

The rubric rewards:

- applying all three changes;
- briefly reporting which changes were made; and
- making the result easy to verify.

It penalizes:

- applying only part of the sentence while implying the whole request was handled;
- asking permission for facts or instructions the user already made explicit; and
- a long recap that obscures the actual result.

The sequencing is important: a deterministic failure is **not a judge score of zero**. The judge is
never called for that repetition. Current evidence persists the numeric judge score, pass flag,
bounded reasoning, and infrastructure error when a judge is called; the older artifact below predates
that schema.

## Latest run: score and reason for every repetition

Latest artifact: `agentic_chat_worker_phase6_phase4_rerun_2026-08-20_0ee9cb82f.json`, commit
`0ee9cb82f`, worker realtime, three repetitions, zero harness retries.

| Rep | Official result | What happened                                                                                                                                                                                                                              | Judge                                                                |
| --: | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
|   1 | **Fail**        | The acting model declared a contract, but the semantic reviewer chose clarification. The assistant recognized the three requested changes and then asked an unnecessary question instead of mutating. No `update_onto_task` call occurred. | Not run                                                              |
|   2 | **Fail**        | Three attempted `declare_turn_contract` executions failed validation. After the bounded repair rounds, the worker emitted `provider_tool_validation_repair_exhausted`. No mutation occurred.                                               | Not run                                                              |
|   3 | **Pass**        | The worker revised and approved the contract, approved the mutation batch, executed three successful `update_onto_task` calls, and the final database state satisfied every invariant.                                                     | Passed; exact score not retained, therefore known only to be **3–5** |

### Reconstructed diagnostic checks

These are useful sub-results derived from the retained artifact; they were not stored as independent
official scores.

| Check                                         |                  Result | Why                                                                                      |
| --------------------------------------------- | ----------------------: | ---------------------------------------------------------------------------------------- |
| Clean stream completion                       |                 **2/3** | Rep 2 ended with validation-repair exhaustion.                                           |
| Required mutation tool observed               |                 **1/3** | Only rep 3 reached task mutations.                                                       |
| All three requested database changes          |                 **1/3** | Only rep 3 changed the database.                                                         |
| Control task preserved and no duplicate tasks | **1/3 fully evaluated** | The full database assertion chain passed in rep 3; earlier reps stopped before mutation. |
| Judge eligibility                             |                 **1/3** | Deterministic checks passed only in rep 3.                                               |
| Judge success among eligible turns            |                 **1/1** | The one eligible turn cleared the `3/5` threshold.                                       |
| Overall scenario score                        |                 **1/3** | One complete end-to-end pass.                                                            |

The latest three repetitions cost `$0.01890044` in total. Cost and latency are operational evidence,
not scoring dimensions.

### Correlation IDs for direct investigation

| Rep | Stream run                             | Durable turn run                       |
| --: | -------------------------------------- | -------------------------------------- |
|   1 | `0b7b841f-fa4e-47b6-b818-7370ff928446` | `be235f3d-41e6-4fbe-a4bb-bad3561a2493` |
|   2 | `5536abdd-671e-4675-a7d2-267afc87f9ba` | `731d8b08-bd1a-4552-a71d-4ea9fdd77640` |
|   3 | `7ccb970b-665f-41be-b6f6-8d67d3da584a` | `4c63a5fb-400e-415f-be45-8f94c9838fb5` |

## Historical score context

The scenario has moved with the worker architecture and reviewer behavior, so historical numbers
are context rather than a single statistically clean time series.

| Run                                                   | Path   |   Score | Interpretation                                                        |
| ----------------------------------------------------- | ------ | ------: | --------------------------------------------------------------------- |
| 2026-07-31 closure baseline                           | Legacy | **3/3** | Older but strong evidence that the core behavior is achievable.       |
| 2026-08-18 battery (`091300faf`)                      | Worker | **0/3** | Tool allowlisting and reviewer clarification failures.                |
| 2026-08-19 battery (`870c3feef`)                      | Worker | **1/3** | Some recovery, still inconsistent.                                    |
| 2026-08-19 battery (`33b4faec`)                       | Worker | **2/3** | Best recent worker result before Railway.                             |
| 2026-08-19 same-day comparator (`11c50cb2b`)          | Legacy | **3/3** | Exact then-current shared behavior was healthy on legacy.             |
| 2026-08-20 first Railway worker battery (`49dcd5a2b`) | Worker | **0/3** | Reviewer over-clarification prevented mutations.                      |
| Latest rerun (`0ee9cb82f`)                            | Worker | **1/3** | One success, one over-clarification, one provider validation failure. |

The older derived legacy history was **12/12**, which further supports the behavior requirement, but
those runs should not be treated as perfectly definition-identical to today's worker test.

## Is this a legitimate test?

### Yes: the core behavior is well chosen

- The prompt is a credible real-world utterance.
- Each reference uniquely maps to a seeded task.
- The requested outcomes are explicit; clarification is not necessary.
- The priority assertion allows either `1` or `2`, avoiding an arbitrary exact-value requirement.
- Database state, not assistant self-report, decides whether the work happened.
- The untouched task and no-duplicates checks catch dangerous collateral behavior.
- Multi-clause completeness is a central capability for a useful agent, not an obscure edge case.

The current **1/3** therefore represents meaningful unreliability. Rep 1 is a product-behavior
failure; rep 2 is an execution-infrastructure failure; both prevent the user from getting the work
done.

### Instrument status after this investigation

1. **Resolved locally: exact tool-name coupling.** Durable outcomes are authoritative; contract and
   mutation routes remain diagnostic subchecks.
2. **Resolved locally: incomplete collateral protection.** The harness fingerprints the material
   fields of every seeded task and rejects missing, extra, or unauthorized row changes.
3. **Resolved locally: missing judge detail.** New evidence retains the score, pass result, bounded
   reasoning, and judge infrastructure error.
4. **Resolved locally: fail-fast diagnostic loss.** Evidence subchecks run independently even after
   an official assertion fails, so transport, contract, mutation, effects, and collateral remain
   separately visible.
5. **Improved, not eliminated: small live sample.** Per-scenario pass rates now include a Wilson 95%
   interval, but the next run still needs at least five repetitions and should not be presented as a
   stable production success percentage.

## Recommended disposition

Keep the scenario and its fixture. The current worktree implements the measurement changes without
replacing the live natural-language behavior with a deterministic fixture:

1. Durable database outcomes are the primary pass condition; canonical mutation routes are
   diagnostic.
2. Explicit subchecks cover stream health, contract disposition, mutation execution, all three
   effects, and collateral preservation.
3. Seeded rows are fingerprinted with a narrow allowlist for intended changes.
4. Structured judge results retain the score, pass flag, bounded reasoning, and errors.
5. Result classes separate transport, behavior, quality, judge-infrastructure, and instrument
   failures while all user-visible failures continue to count against end-to-end reliability.
6. Runtime contract fulfillment proves declared scalar values, not merely writes to matching fields.

## Bottom line

The test is asking the right product question: **can the agent hear one natural update, apply every
part, and avoid collateral changes?** The latest live answer is still “only one of three times.” The
local runtime and instrument now close the identified verification gaps; the next step is a clean
five-or-more-repetition run of the exact deployed revision to determine whether reviewer and provider
behavior are actually reliable.
