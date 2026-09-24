<!-- docs/research/specialist-quality-2026-09-21/GATE_FAILURES.md -->
<!-- doc-status: point-in-time -->

# Gate findings during Project Review v2 validation

The first two runs leave the new project-review flag off; the separate DeepSeek run enables it,
but these ordinary-chat cases do not request project-review admission. These are baseline/runtime
findings discovered while validating the new change, not evidence that the v2 recipe caused them.
Do not conflate passing focused tests with a passing release gate.

## First run: stopped, failed/incomplete

`output/agentic-gate/specialist-review-v2-2026-09-21/` retains 13 captured turns, logs, the gate's
failed receipt and an explicit interruption record. No complete scorecard was produced. The run
was stopped once the repeated attribution defect was established.

The attribution harness required every usage row to have operation type
`agentic_chat_worker_stream`. Real Jev-enabled turns also have a fully attributed
`agentic_chat_tool_selection` row. The repair admits that exact operation, retains it in the
reported passes, requires at least one real worker-model pass, and rejects unknown/incomplete
receipts. It does not filter inconvenient records out of the score.

Case 2, repetition 2 created the requested tasks, then stopped with a promise to propose their
dependency links. Tool selection had included `link_onto_entities`; absent tools were not the
cause. The fix gives a reviewed, successful batch one bounded continuation when its terminal
draft explicitly promises an execution stage. The same independent review and tool surface still
apply. A repeated promise gets a receipt-only partial answer. Silent omissions remain a separate
completion-contract problem.

One interrupted synthetic turn could not recover automatically because its durable event window
was incomplete. After confirming the old worker stopped, cancellation and the existing fenced
finalization RPC preserved its saved text/projection and terminalized it as cancelled. The first
finalization attempt rolled back for absent tool-round metadata; the accepted call used the RPC's
existing cancellation-only fallback for an unknown round count. The queue later reconciled to cancelled as well. No rows were deleted. The original
run's `cleanup.json` retains the turn identity and receipt details.

## Repaired Pareto run: failed, 41/52

`output/agentic-gate/specialist-review-v2-repaired-2026-09-21/` uses the same private QA configuration:
acting model `unbiased/pareto`, semantic reviewer `openai/gpt-5.6-luna`, Jev tool selection enabled.
The source intentionally calls Pareto an explicit local quality experiment in `config.ts`.

The complete run retained 45 turns across all three repetitions. The case score was **41/52**;
source provenance failed for the pre-execution infrastructure error below, and document edit
repetition 3 took **32.184 seconds**, over its 30-second limit. The source remained fixed and
startup web/worker identities matched. A case can pass its saved-state assertions yet still fail
the timing gate.

The retained behavioral/transport failures are:

| Case                         | Evidence                                                                                                                                         | Meaning                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Project create, repetition 1 | Two startup attempts time out at approximately 10 seconds before response headers                                                                | No successful provider completion; not an attribution failure                  |
| Task batch, repetition 1     | Five creates succeed; next attempt times out; retry returns HTTP 404, “All providers have been ignored”                                          | Dependencies were never executed                                               |
| Task batch, repetition 2     | Five creates succeed; next request returns HTTP 429 for credit-verification timeout; retry reports usage/stop but emits no assistant-text events | Runtime records `provider_no_assistant_text`; dependencies were never executed |

Cold retrieval, repetition 3 also failed before execution began. Its terminal error was
`transient_infra`; no worker-phase provenance receipt existed, so the provenance assertion
correctly failed. HTTP traces show the input-artifact read taking 7.39 seconds and the execution
begin RPC taking 12.73 seconds, beyond the caller's roughly ten-second wait. Nearby cancellation
reads were also slow (19.65 seconds). This is evidence of delayed QA database responses, not an
observed wrong worker build or model-quality failure. The trace does not establish the database
root cause.

The second task failure's 429 is not proof of an exhausted balance: the account balance was checked
before starting the run and was positive. The provider's own error says its credit check timed out.
Captured response events do not include the raw upstream body, so they do not establish why the
successful retry had no usable text.

On September 21, the primary endpoint catalog reports one Pareto provider, Unbiased, with
`tool_choice: auto` supported and `none`, `required`, and named-function choices unsupported.
The runtime uses those control modes on some paths. This is a compatibility gap to investigate,
not proof that it caused every observed timeout or empty answer.
[Endpoint catalog](https://openrouter.ai/api/v1/models/unbiased/pareto/endpoints).

Provider health is also relevant: after a timed-out pinned provider, the client adds its slug to
the next request's `provider.ignore`. Excluding the sole provider leaves no alternate endpoint.
OpenRouter documents `ignore` as an exclusion, while provider fallbacks operate among available
providers for the chosen model. The retained 404 is consistent with that routing state.
[Provider selection](https://openrouter.ai/docs/guides/routing/provider-selection).

Both failed task batches finished internally as `mutation_unfulfilled`, but the fallback message
said only “I completed 5 requested changes.” The absence of a declared contract means the guard
cannot name all unexecuted outcomes. That must not erase the host's known unfinished status from
the visible answer. A targeted repair now appends a host-authored unfinished-request notice whenever the host
marks a mutation turn `mutation_unfulfilled`. It does not infer completion or disclosure from
prose, including task titles containing “pending”. The correction preserves append-only stream
text. Four new regression cases and the ten existing terminal-integrity tests pass; worker
typecheck passes. Live verification of this later source is separate from the failed run above.

Keep this Pareto experiment separate from validation of the specialist policy's existing DeepSeek
route. A passing run on another model would not prove Pareto repaired. Never silently switch a
model or weaken state, timing, source-provenance, or evidence-capture assertions to obtain a pass.

## Separate DeepSeek run: 52/52 behavior, failed timing gate

`output/agentic-gate/specialist-review-v2-deepseek-2026-09-21/` runs the repaired source with
DeepSeek v4.1 Flash, the unchanged Luna semantic reviewer, Jev enabled, and v2 flags enabled.
It uses a separate private QA env copy. The original Pareto env is untouched.

The complete three-repetition run finished at **06:01:47 UTC** with **52/52** on the case
scorecard, all **45** retained turns passing their behavior/state checks, verified source
provenance and zero capture errors. The release gate still **failed**, with the four latency
violations below. Calendar, DST, cold retrieval and grounded-status checks all passed; the last
case took 16.210, 20.668 and 31.151 seconds with 6, 5 and 6 tool calls, within its bounds.
Source hash: `bbeda6036ceff78284a4c26e909bbf6b9489f95dd1322f61d8856403b3304f39`.
QA active turn and queue counts were both zero after the gate stopped its services.

Task batch repetition 2 saved all five tasks and three dependency links correctly but took
**70.182 seconds**, over 60 seconds. A Parasail acting pass failed the buffered progress watchdog
after **8.037 seconds** and retried successfully on Together. Model-request durations sum to
30.894 seconds; tool-execution durations sum to 17.190 seconds. These sums are not a disjoint
wall-clock decomposition. Admission, queue, durable publication and gaps also contribute.
The first task-batch repetition passed at 44.997 seconds. All three narrow updates also passed
saved-state checks but took **31.764, 30.993 and 33.195 seconds**, over their 30-second bound.
Those are the remaining three timing failures; all document edits met their timing bounds.

[Retained per-pass timing analysis](deepseek-latency-case.json) supports investigating provider
tail latency and serial persistence/tool overhead together. It does not justify removing semantic
review, bypassing durable receipts, loosening timing limits, blindly parallelizing writes, or
claiming a provider ranking from one observation.

[Narrow-update trace summaries](deepseek-narrow-update-latency.json) retain each model pass,
tool duration, host phase and the slowest worker HTTP requests in each isolated turn window.
The first update incurred a 5.011-second failed acting attempt; the second and third did not
need that retry. Intake response headers arrived after 2.918, 6.646 and 9.958 seconds respectively.
The second update's complete model-request durations sum to only 5.895 seconds, while its full
turn took 30.993 seconds. Faster inference alone cannot account for the whole gap.

Several database requests took seconds, including durable read-tool and semantic-event
publication. These request windows can overlap, and timestamp matching is not per-request turn
attribution. Investigate queue delay, repeated round trips and database response variability;
the traces do not establish one database root cause or prove that any particular write can be
removed or combined safely. Preserve authorization, idempotency and recovery fences in any
subsequent optimization.

No release thresholds were changed and the failed run was not repeated to seek a green result.
This ordinary-chat score does not validate the new specialist's factual prose. The separate
durable-v2 smoke still has a documented date error, despite structurally correct execution.
Keep v2 default-off. Performance and source-bound synthesis remain independent release blockers.
