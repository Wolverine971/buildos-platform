<!-- tasker/58-agentic-chat-provider-tool-validation-errors.md -->
<!-- doc-status: point-in-time -->

# 58 — Investigate Agentic Chat provider tool-validation failures

**Status:** Closed 2026-08-21. All six exit conditions passed.  
**Created:** 2026-08-21  
**Mission:** Explain and fix the three provider/tool-validation failures in the latest Phase 4 worker
battery without weakening tool schemas, contract review, or mutation safety.

## Why this is a separate task

The latest battery contains two different error families that the scenario headline scores obscure:

1. `provider_tool_arguments_invalid`: the provider's streamed tool arguments could not be accepted
   as a JSON object.
2. `provider_tool_validation_repair_exhausted`: arguments were assembled, but completed tool calls
   remained invalid after the worker's bounded repair loop.

These are execution-contract failures, not LLM quality-judge failures. They affected two of three
`project-organize` repetitions and one of three `task-multi-update` repetitions. Fixing them is
necessary before those behavior scores can be interpreted confidently.

## Live failures in scope

Source artifact:
`docs/plans/evidence/agentic_chat_worker_phase6_phase4_rerun_2026-08-20_0ee9cb82f.json`

| Scenario / rep            | Error                                       | Stream run                             | Durable turn run                       |
| ------------------------- | ------------------------------------------- | -------------------------------------- | -------------------------------------- |
| `project-organize` rep 1  | `provider_tool_arguments_invalid`           | `ce06a335-ef95-44eb-83f5-d9122382c685` | `d05ff17c-cb7a-473b-950c-c91844f13335` |
| `project-organize` rep 2  | `provider_tool_arguments_invalid`           | `b95927e8-9294-4980-a35b-fd56c3c6cbf6` | `25ccd841-9ec5-4fe3-ba29-7c7b59b00cf9` |
| `task-multi-update` rep 2 | `provider_tool_validation_repair_exhausted` | `5536abdd-671e-4675-a7d2-267afc87f9ba` | `731d8b08-bd1a-4552-a71d-4ea9fdd77640` |

The retained battery artifact intentionally omits prompt bodies, tool argument bodies, tool results,
and raw event payloads. It identifies the failed turns but does not contain enough information to
name the malformed JSON or exact schema path. Do not guess those details from the error code.

## Relevant implementation

Primary file: `apps/worker/src/workers/agentic-chat/readOnlyProvider.ts`

- `MAX_VALIDATION_REPAIR_ROUNDS = 2` bounds repair attempts.
- Around lines 2168–2171, exhausted completed-call validation throws
  `provider_tool_validation_repair_exhausted`.
- Around lines 2621 and 2660–2663, invalid streamed arguments throw
  `provider_tool_arguments_invalid` when a delta is not a string, JSON parsing fails, or the parsed
  value is not an object.

Existing regression coverage:
`apps/worker/tests/agenticChatReadOnlyProvider.test.ts` includes a bounded repeated-validation-repair
test, but it exercises a generic missing-required-argument case rather than these live contract
schemas and provider stream shapes.

## Investigation tracks

### Track A — streamed argument assembly and JSON parsing

Applies to the two `project-organize` failures.

Determine which of these branches fired for each turn:

- a provider tool-argument delta was not a string;
- the concatenated argument string was not valid JSON; or
- valid JSON parsed to a non-object value.

Then determine the concrete cause: truncation, duplicate or out-of-order deltas, invalid escaping,
provider framing differences, or model-emitted malformed JSON. The code must distinguish these cases
without retaining user content.

### Track B — schema/policy validation repair exhaustion

Applies to `task-multi-update` rep 2.

Recover the validation issues for all three failed `declare_turn_contract` attempts. Identify:

- the tool and schema version;
- the failing property path and validator code;
- whether each repair repeated the same error or introduced a new one;
- whether the repair prompt included enough structured information to correct it; and
- whether recent heterogeneous-outcome or `changes` schema work changed the failure surface.

Do not assume this is the same defect as Track A. The error proves that call assembly reached the
validation-repair path, while the organization errors failed earlier during argument completion.

## Work plan

### 1. Recover exact evidence without new model spend

- Query retained `chat_tool_executions`, durable turn events, and Railway worker logs for the three
  exact run pairs above.
- Capture only safe diagnostics: tool name, provider/request correlation, error branch, JSON length,
  parse position/category, validator code, property path, attempt number, and a payload hash.
- Do not copy full prompts, document contents, user text, or unrestricted raw argument bodies into
  this task.
- If retention no longer contains the necessary facts, state exactly what is absent. Do not infer a
  payload that was not observed.

### 2. Build payload-minimized regression reproductions

- Convert each observed failure shape into the smallest provider/unit test fixture that reaches the
  same code branch.
- Include fragmented SSE argument deltas if Track A is an assembly defect.
- Include the real tool schema and validation issue path if Track B is a repair defect.
- Verify the test fails against the current implementation before changing production code.

These deterministic fixtures are for parser and validation mechanics only. They do **not** replace
the live-model behavioral evaluation, consistent with the decision not to use deterministic
fixtures to score Agentic Chat behavior.

### 3. Fix at the narrowest correct layer

Acceptable directions include:

- correcting provider delta assembly or completion handling;
- making parse failure classification and safe diagnostics precise;
- improving bounded repair instructions with structured validator issues;
- preventing the same invalid repaired call from being retried without useful new feedback; or
- correcting a schema mismatch between the advertised tool and runtime validator.

Unacceptable shortcuts:

- accepting malformed or schema-invalid arguments;
- deleting or bypassing semantic contract review;
- silently coercing ambiguous mutation targets or values;
- swapping providers/models as the only “fix”;
- increasing repair rounds without identifying why repair fails; or
- weakening the behavior scenarios to avoid the failing tools.

### 4. Add safe observability

For future failures, retain enough structured evidence to answer the cause without payload exposure:

- provider and provider request ID;
- canonical tool name and schema version/hash;
- failure stage (`delta_type`, `json_parse`, `json_shape`, `schema`, or `policy`);
- parse error category/offset or validator code/property path;
- repair attempt count and whether the issue signature changed;
- argument byte length and content hash; and
- stream and durable turn correlation IDs.

Never record hidden reasoning, raw prompts, or full argument payloads in ordinary production logs.

### 5. Verify locally and then live

Before any paid rerun:

- pass the new focused regression tests;
- pass the full worker provider test file;
- pass relevant worker typechecks and formatting/lint checks; and
- show that malformed arguments are still rejected safely.

After deployment, request explicit approval for a paid isolated live battery of
`task-multi-update,project-organize`. Use the production worker path, zero harness retries, and retain
the same evidence contract. Do not turn a parser regression test into a claim of deterministic model
quality.

## Exit conditions

This tracker closes only when:

1. Each of the three live failures is classified with an observed argument/parsing or validation
   cause, not merely its top-level error code.
2. Each distinct failure shape has a payload-minimized regression test.
3. The implementation fix preserves strict JSON/schema rejection and reviewer safety.
4. Safe structured diagnostics make an equivalent future failure self-classifying.
5. Focused and full worker provider tests plus relevant typechecks pass.
6. The deployed worker completes an approved isolated live rerun with **zero**
   `provider_tool_arguments_invalid` and **zero** `provider_tool_validation_repair_exhausted` errors.

Behavioral perfection is not required to close this parser/validation task. Reviewer clarification or
a poor organization judge score must be tracked as behavior, not mislabeled as validation failure.

## Related deep dives

- `docs/plans/AGENTIC_CHAT_MULTI_TASK_UPDATE_TEST_DEEP_DIVE_2026-08-21.md`
- `docs/plans/AGENTIC_CHAT_PROJECT_ORGANIZATION_TEST_DEEP_DIVE_2026-08-21.md`
- `docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_PHASE_4_BATTERY_ROOT_CAUSE_REPORT_2026-08-20.md`

---

## Findings — 2026-08-21

All three failures are explained by observed evidence. Neither cause was a model
writing malformed JSON.

### Track A — `provider_tool_arguments_invalid` (both `project-organize` failures)

The semantic reviewer was truncated at its token cap and the provider did not say so.

1. `phase3Bootstrap.ts` capped the semantic reviewer at `maxTokens: 1_200`.
2. The reviewer model `openai/gpt-5.6-luna` is a reasoning model. `reasoning: { exclude: true }`
   keeps reasoning out of the stream but **not** out of the completion budget.
   Observed reasoning: **1007/1200** (rep 1) and **593/1200** (rep 2).
3. `project-organize` is the battery's largest reviewer payload (multi-outcome contracts over
   6–7 document ids), so its decision arguments are the longest.
4. The generation hit the cap mid-`arguments`, leaving truncated JSON.
5. **The provider still reported `finish_reason: "tool_calls"`** — confirmed in
   `agentic_chat_execution_observations` for both turns. The reviewer paths' truncation guard
   (`finishedReason !== 'tool_calls' → fallbackReason`) therefore never fired.
6. `completeToolCalls()` parsed the truncated text, `JSON.parse` threw, and the turn died with
   `provider_tool_arguments_invalid` / `permanent`.

Correlation, from `llm_usage_logs` over the battery window: of **32** reviewer calls, exactly
**2** reported `completion_tokens: 1200` (the cap) — precisely the two failing turns. The next
highest reviewer completion was **909**. No false positives, no false negatives.

Latent severity beyond the crash: a truncated `approve_*` call can carry a complete, correctly
SHA-bound prefix. Parsing it as a finished decision risks reading an approval the reviewer never
made. Regression-tested at `never treats a truncated reviewer decision as an approval`.

### Track B — `provider_tool_validation_repair_exhausted` (`task-multi-update` rep 2)

Recovered from `chat_tool_executions` for session `071d45e7`: three `declare_turn_contract`
attempts, attempts 1 and 2 byte-identical, attempt 3 differing only in `description` prose.

The sole defect was outcome 3:

```
target_ids: [1 task]   changes: [priority, state_key]   minimum_successful_effects: 2
```

`normalizeOutcome` rejects `minimumSuccessfulEffects > targetIds.length`. The model counted
_fields changed_ (2); the parser counts _targets_ (1). Verified by re-running the parser on the
retained arguments: outcomes 1 and 2 parse alone, outcome 3 does not, and setting its
`minimum_successful_effects` to 1 makes the whole contract parse.

The rejection is correct. The failure was the feedback: `parseDeclaredTurnContract` returned one
bit, and validation converted it into a single sentence listing four possible causes without
naming the one that fired. The bounded repair loop had nothing to act on, so the model resent the
same contract until rounds were exhausted.

## Fixes

| Layer                                         | Change                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openRouterReadOnlyClient.ts`                 | A pass whose `completion_tokens` reaches the `max_tokens` we sent is reported as `finishedReason: 'length'` regardless of the provider's claim. `max_tokens` is our own value, so this never guesses. The corrected reason also lands in the `provider_attempt_ended` observation.                        |
| `readOnlyProvider.ts`                         | All three reviewer paths degrade to the existing clarification fallback when a decision cannot be parsed, instead of killing the turn. The finish reason is now judged **before** arguments are parsed in `streamInitial`/`streamContinuation`, so truncation is no longer misreported as malformed JSON. |
| `readOnlyProvider.ts` / `providerContract.ts` | New `provider_tool_arguments_truncated` code plus a `rejected_tool_arguments` diagnostic carrying stage, byte length, parse offset/category, content SHA-256, claimed finish reason, and budget-exhaustion flag.                                                                                          |
| `fixtureTurnExecutor.ts`                      | Emits that diagnostic on the typed-failure log so an equivalent future failure is self-classifying.                                                                                                                                                                                                       |
| `phase3Bootstrap.ts`                          | Reviewer budget raised to `AGENTIC_CHAT_SEMANTIC_REVIEWER_MAX_TOKENS = 4_000`, sized against observed reasoning (max 1007) plus a long decision. Only generated tokens are billed, so calls that already fit cost the same.                                                                               |
| `turn-contract.ts`                            | `describeDeclaredTurnContractIssues()` reports the exact outcome index, property, and observed values. `parseDeclaredTurnContract` behaviour is unchanged.                                                                                                                                                |
| `tool-validation.ts`                          | Repair feedback now carries those specific issues instead of the catch-all sentence.                                                                                                                                                                                                                      |
| `gateway.ts`                                  | `minimum_successful_effects` description states the ≤ `target_ids.length` constraint and that fields-per-target do not add effects.                                                                                                                                                                       |

Nothing was loosened: malformed and schema-invalid arguments are still rejected, contract review
still runs, and a truncated approval is never honoured.

### Repair feedback, before and after

Before — for every rejection cause:

> Invalid turn contract: every outcome must use a supported action and entity kind, valid
> target/field arrays, and minimum_successful_effects from 1 to 100.

After — for the live failure:

> Invalid turn contract: Outcome 3: minimum_successful_effects is 2 but target_ids lists only 1
> target. An effect is one target that changed, not one field changed on a target: setting several
> fields on a single target is still one effect. Either set minimum_successful_effects to at most
> 1, or list every target this outcome must change in target_ids.

## Regression coverage

Each shape has a payload-minimized fixture, and each was confirmed failing against the previous
implementation before the fix landed.

- `turn-contract.test.ts` — the live contract still rejects; the issue names outcome 3 and both
  observed numbers; the repaired contract reports no issues; action / entity-kind / range /
  outcome-count causes are named separately.
- `agenticChatOpenRouterReadOnlyClient.test.ts` — a capped generation claiming `tool_calls` is
  reported as `length`; an uncapped one is untouched; the observation records the corrected reason.
- `agenticChatReadOnlyProvider.test.ts` — a truncated reviewer decision degrades to clarification;
  a truncated SHA-bound `approve_*` is never treated as an approval; truncated acting-model
  arguments classify as `provider_tool_arguments_truncated` with payload-free diagnostics;
  genuinely malformed arguments still classify as `provider_tool_arguments_invalid`.

## Verification

- `apps/worker` — 1097 passed, 1 skipped.
- `packages/agentic-chat-runtime` — 264 passed.
- `apps/web` agentic-chat suites — 1475 passed, 1 failed.
- `turbo typecheck` — worker, runtime, and web all clean.
- `turbo lint` — clean. Prettier clean on every touched file.

The single web failure is `tool-surface-size-report.test.ts`, which **was already failing at HEAD**
(20809 chars against a 20200 cap) before any change here. The tightened
`minimum_successful_effects` description adds 95 chars to that already-over-budget surface. Tracked
as pre-existing; not introduced by this task.

## Live exit verification — 2026-08-21

The approved isolated production-worker battery ran `task-multi-update,project-organize` three times
each with zero harness retries. The exact clean evidence tree was `ff6e8eed6` (base application
commit `648a24731`), and the retained schema-v2 artifact is:

`docs/plans/evidence/agentic_chat_worker_tasker58_isolated_two_scenario_2026-08-21_ff6e8eed6.json`

Tasker 58's exit codes were all absent across the six accepted worker turns:

- zero `provider_tool_arguments_invalid`;
- zero `provider_tool_validation_repair_exhausted`; and
- zero `provider_tool_arguments_truncated`.

This closes exit condition 6 and therefore Tasker 58. Behavioral perfection was explicitly not an
exit condition. The battery did expose separate follow-up failures: one
`provider_round_budget_exceeded`, two `provider_tool_not_allowlisted` failures for `skill_load`, and
three reviewer/candidate-gate clarification outcomes. Those are not regressions of the JSON parsing
or contract-validation repair defects fixed here; see
`docs/plans/AGENTIC_CHAT_WORKER_TASKER58_ISOLATED_TWO_SCENARIO_RERUN_2026-08-21.md`.
