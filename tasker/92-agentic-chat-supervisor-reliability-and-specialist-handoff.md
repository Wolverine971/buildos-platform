<!-- tasker/92-agentic-chat-supervisor-reliability-and-specialist-handoff.md -->

# 92 — Supervisor reliability and specialist quality: takeover handoff

**Created:** 2026-09-21. **Owner:** next implementation agent; DJ owns paid-run approval.
**Status (2026-09-21, pass 3):** A, B, C, and D built; DJ committed all source and test files in `3a407d688` (2026-09-21 21:23 local). Still uncommitted: the applied comparisons migration file `20260922002140` (production is ahead of the repo until it lands), the four slice documents, `docs/research/specialist-quality-2026-09-21/`, this tracker, `tasker/README.md`, and `AGENTS.md` with the paid-test rule. Nothing pushed or deployed. The search-reliability worktree and its fully merged branch were removed on 2026-09-21 after verifying main held everything. DJ chose to
stack A and B, chose the ambitious comparison lab fed by real pilot runs for D, and deferred
the paid gate to the end of this work. A DJ-approved cheap gate ran 2026-09-22 02:31–02:53 UTC on HEAD `3a407d688` and **failed 38/52 (C)**; it routed acting to `unbiased/pareto` (the gate env file's model) and cost $1.70, far above the $0.30 estimate that was based on the 2026-09-21 DeepSeek run and above DJ's stated $0.25–$0.50 budget. Record: `docs/research/specialist-quality-2026-09-21/tasker92-gate-2026-09-22.json`; raw run `output/agentic-gate/tasker92-final-20260922T023058Z/`.
**Next action:** DJ decides on a DeepSeek rerun (env file already switched; the gate now refuses Pareto; about $0.29) over the five post-gate fixes. No paid run without DJ's approval. D adds no model calls and is not gated; its migration was applied to the linked production database on 2026-09-22 (UTC) at DJ's request and recorded in the ledger. See
"Implementation pass 1" below.
**Scope of the original handoff:** documentation only. The passes below made local code
changes and ran free tests only; no model calls, deployments, or applied database changes
(D's migration was applied to the linked production database on 2026-09-22 UTC at DJ's explicit request; no other database change).

## User intent and spending boundary

DJ wants an ambitious multi-agent chat supervisor that assigns useful work to specialists,
shares evidence, evaluates results, and reliably completes the request. Continue from the
existing implementation rather than rebuilding the workbench or specialist execution path.

DJ's latest explicit instruction supersedes older instructions to run a gate automatically:

> “Okay stop running paid tests that cost money. You need to ask me before you run a paid test that costs money. Remember this going forward.”

- Ask before **every paid test run or rerun**, including `pnpm agentic:gate`, live model/Jev
  probes, paid smoke tests, answer generation, and model-based judging. Wait for explicit
  approval for that run. General implementation authorization is not spending authorization.
- Describe scope and estimated cost, or state that cost is uncertain. Historical cost estimates
  in other documents are not current quotes or authorization.
- Use existing traces, mocked transports, free local tests, and disposable local database
  fixtures first. Inspect scripts before execution; a local command can still call a paid API.
- Do not trigger paid CI indirectly through a push or PR without the corresponding approval.
- The rule is saved in [AGENTS.md](../AGENTS.md). An unapproved gate is **pending/not run**,
  never passing. Keep the previous failed result visible. Do not claim a live fix or promotion.

No paid test was running when this preference was recorded. No new agent task has been started
by this handoff. The next agent should pick up the work when assigned.

## Read these first

1. [Bounded semantic-search implementation and failed gate](../docs/architecture/SEARCH_RELIABILITY_2026-09-21.md).
2. [Next specialist contracts](../docs/architecture/SPECIALIST_QUALITY_NEXT_CONTRACTS_2026-09-21.md), especially sections 2 and 6.
3. [September 21 reassessment](../docs/technical/reviews/SPECIALIST_AGENTS_REASSESSMENT_2026-09-21.md).
4. [Original September 19 audit](../docs/technical/reviews/SPECIALIST_AGENTS_REVIEW_2026-09-19.md), as historical context; several implementation gaps have since been addressed.
5. [Agentic Chat gate contract](../docs/testing/agentic-chat-gate.md), subject to the approval rule above.

Task [82](82-chat-workflow-regression-repairs.md) retains related regression work;
[89](89-chat-workflow-integration-acceptance.md) owns broader integration acceptance.
Task [91](91-workflow-lab-audit-and-export.md) already implements a workflow inspector/export
locally; reuse it for inspection and future comparison work.

## Current state: preserve this work

| Area                      | Recorded implementation and limits                                                                                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specialist infrastructure | Versioned definitions, shared document evidence, authored reference knowledge, workbench publication, and explicit published-version execution exist. Inspect current flags and deployment receipts before describing any feature as live.                                                                       |
| Project Review v2         | Richer project evidence and abstention support are implemented. See [v2](../docs/architecture/PROJECT_REVIEW_V2_2026-09-21.md).                                                                                                                                                                                  |
| Project Review v3         | Default-off source-bound reports accept exact excerpts and code-computed overdue-task facts. The editor arranges accepted IDs; host code renders the result. This is narrower than general semantic claim verification. See [v3](../docs/architecture/PROJECT_REVIEW_V3_2026-09-21.md).                          |
| Jev                       | Bounded semantic judgments and shadow evaluation are useful research inputs. Jev is not deterministic proof. Authorization, validation, budgets, idempotency, and recovery remain code/database responsibilities. Do not infer working automatic routing from recommendation types or starter UI alone.          |
| Search reliability        | Optional embedding plus vector search has a combined five-second budget. Cancellation reaches embedding fetch/retry/body reads and vector HTTP; lexical results and explicit partial coverage survive semantic failure and prompt compaction. Required lexical/auth failures and parent cancellation still fail. |
| Validation                | The search slice had 133 focused tests passing, worker/runtime typechecks passing, and an offline hung-embedding replay settling in 5,008 ms. These are recorded results for that source snapshot, not a new check of today's tree.                                                                              |
| Release                   | Latest complete gate failed **48/52**. No production flags, deployment, schema, or routing policy changed in the search slice. Preserve rollback support and the default-off specialist rollout.                                                                                                                 |

The search change does not bound authorization, required keyword reads, or whole-turn time.
HTTP cancellation does not prove an already-running database statement stopped. Do not weaken
these distinctions while repairing the remaining bottlenecks.

## Retained baseline and evidence

The completed gate ran on September 21 from **20:26:23Z to 20:51:40Z**, across all three
repetitions: **44/45 turns passed, 48/52 overall, zero evidence-capture errors**, with verified
web/worker/final-tree provenance. The timing failure on an otherwise correct task batch still counts.

- Tested base commit: `85f6c5a91172222e946bb00b91b52a3444c96c74` plus frozen changes.
- Tested executable-tree hash: `f8e64cdf4e03add9467a1994a5373fda78c832b8ee7e5ae582225481ebd38463`.
- Workspace HEAD observed while writing this handoff: `57749651c932290fb6e11e6cbcb757203320a6ad`.
  This newer HEAD is not a fresh validation receipt. Reconcile current source before editing.
- Frozen worktree retained at `/private/tmp/buildos-search-reliability-20260921`, branch
  `codex/search-reliability-20260921`. Treat temporary paths as conveniences; check they still
  exist. Never copy the entire older worktree over the current shared checkout.
- Eleven implementation/test files were copied back only after checking original bytes;
  unrelated changes and staging were preserved. The shared checkout still contains other work.

| Evidence                                                                                | Location                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portable scorecard, source identity, failures, model/tool/HTTP spans                    | [search-reliability-gate.json](../docs/research/specialist-quality-2026-09-21/search-reliability-gate.json)                                                           |
| Full gate, scorecard, latency analysis, worker/web logs, raw turn and provider captures | `output/agentic-gate/search-reliability-final-2026-09-21/`                                                                                                            |
| Slow task-batch diagnostic                                                              | `output/search-reliability-2026-09-21/task-batch-timing-diagnostic.json`                                                                                              |
| Exact search-slice patch and file manifest                                              | `output/search-reliability-2026-09-21/change.patch` and `change-manifest.json`                                                                                        |
| Offline fault replay and recorded result                                                | [script](../docs/research/specialist-quality-2026-09-21/search-timeout-replay.mts), [JSON](../docs/research/specialist-quality-2026-09-21/search-timeout-replay.json) |
| Inspectable search budget model                                                         | [search-reliability.html](../docs/research/specialist-quality-2026-09-21/search-reliability.html)                                                                     |

The earlier `output/agentic-gate/search-reliability-2026-09-21/` attempt was intentionally
interrupted after 19 captured turns when prompt compaction was found dropping structured
coverage. That bug was corrected before the final run. The interrupted attempt is not a pass.
Raw output folders may be ignored/local-only; if unavailable, start from the portable diagnostic
and report the missing evidence. Do not regenerate paid evidence automatically or commit secrets.

## Implementation pass 1 — 2026-09-21 (Claude, free local work only)

Source identity: workspace HEAD `57749651c932290fb6e11e6cbcb757203320a6ad`; all changes
uncommitted. No paid test was run. The failed 48/52 baseline is unchanged and retained.

| Slice | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Where                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | **Applied.** Shared, cancellable read-tool fence; abort forwarded through the claim RPC; snapshot write moved before the provider request; typed `read_tool_fence_timeout` (`transient_infra`). 131 focused tests, worker typecheck, eslint on changed sources; before/after injected reproduction recorded.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [READ_TOOL_FENCE_RELIABILITY_2026-09-21.md](../docs/architecture/READ_TOOL_FENCE_RELIABILITY_2026-09-21.md), [probe](../docs/research/specialist-quality-2026-09-21/read-tool-fence-probe.json). Files: `apps/worker/src/workers/agentic-chat/{readToolFence.ts,executionControl.ts,turn-executor.ts}`, tests `agenticChatReadToolFence.test.ts`, `agenticChatExecutionControl.test.ts`, `agenticChatTurnExecutor.test.ts`. |
| B     | **Applied (pass 2, DJ's decision to stack).** One policy for optional `type_key` across the task tool schema, the field reference, and the reviewer commission rules, with fixtures for the three cases. 30 runtime + 19 worker tests, runtime typecheck. The patch and manifest remain as the record of the change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [TASK_CLASSIFICATION_POLICY_2026-09-21.md](../docs/architecture/TASK_CLASSIFICATION_POLICY_2026-09-21.md), [patch](../docs/research/specialist-quality-2026-09-21/task-classification-policy.patch), [manifest](../docs/research/specialist-quality-2026-09-21/task-classification-policy-manifest.json). Apply: `git apply --3way <patch>`.                                                                                |
| C     | **Implemented (pass 2).** `completion-receipt.ts` in the runtime loop; `completion_receipt` persisted in assistant metadata on completed terminals only; stage approvals bound to batch SHA-256, request verdict from the contract resolution, never from writes alone. 11 runtime + 3 executor tests; both typechecks (runtime dist rebuilt); eslint clean. Follow-ups listed in the doc.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [COMPLETION_RECEIPT_CONTRACT_2026-09-21.md](../docs/architecture/COMPLETION_RECEIPT_CONTRACT_2026-09-21.md)                                                                                                                                                                                                                                                                                                                 |
| D     | **Built (pass 3, DJ's interview: ambitious lab, real pilot runs).** Blind comparison lab at `/workflow-lab/compare`: frozen question/source packet with canonical SHA-256, candidates from `chat_turn_workflow_runs` (owner-scoped, same accepted context only) or written answers, per-reviewer blind labels, vote-before-reveal with sealed votes, rubric (required facts, unsupported claims, abstention), receipts with unknown as unknown, exploratory vs held-out, disclosure flag. One migration file (three tables, guard triggers, four service-role RPCs), types, pure core, storage adapter, API, page, component. 23 + 13 + 7 web tests, SQL contract on disposable PostgreSQL 16, svelte-check 0/0, eslint/prettier clean. No model calls; migration applied to the linked production database on 2026-09-22 UTC (DJ's request); no browser walk-through. Doc: `docs/architecture/ANSWER_COMPARISON_LAB_2026-09-21.md`. | `AnswerComparisonLab.svelte`; `answer-comparison-core.ts`; `answer-comparison.server.ts`; `comparisons/+server.ts`; migration `20260922002140`; SQL contract `supabase/tests/20260922002140_agentic_chat_answer_comparisons_v1.test.sql`                                                                                                                                                                                    |

Unproven after this pass: why the QA database was slow for ~46 s in case 14 (lock waits plus
general slowness are bounded, not root-caused); whether the abandoned claims' server statements
stopped when the turn finalized. Both are recorded in the slice A document.

Process note: the first attempt to save B's patch wrote an empty file (an unquoted shell
variable under zsh) and the tree was restored before the mistake was seen; B was re-applied from
the recorded edit scripts, re-verified, and captured with explicit paths. The manifest records
the patch hash.

## Gate run — 2026-09-22 (DJ-approved cheap test; failed 38/52)

DJ approved a run of at most about $0.50. The estimate given was about $0.30, taken from
the 2026-09-21 run's recorded $0.29, but that run used `deepseek/deepseek-v4.1-flash`
while `.env.agentic-gate.local` on main sets `AGENTIC_CHAT_OPENROUTER_MODEL` to
`unbiased/pareto`. The routing was not checked before launch. Actual spend by the
OpenRouter usage counter: **$1.70** ($1.61 of it on Pareto acting passes, 653K input
tokens). Balance left on the gate key: $2.22. This overshoot is recorded as a process
failure of this pass, not of the gate.

Result: 38/52 (73.1%, C), three repetitions, HEAD `3a407d688`, provenance recorded
(git SHA plus dirty-tree hash). Cases 1, 3, 4, 6, 7, 8, 10, 13 scored 4/4 and cases 4
and 8 met their timing limits in every repetition.

| Case | Score | What happened                                                                                                                                                      |
| ---- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2    | 1/4   | Reps 1–2: the five creates were approved and executed, then the model stopped without proposing the three links; rep 3 did both stages but took 76 s against 60 s. |
| 5    | 0/4   | `provider_stream_error` on the ambiguous move request in every repetition (transport, Pareto).                                                                     |
| 9    | 1/4   | Reviewer sent the document create back for revision and the turn ended with the corrected proposal instead of the write.                                           |
| 11   | 2/4   | Judge 1/5: the DST refusal was right but the offered example converted 1:30 AM EST wrongly.                                                                        |
| 14   | 2/4   | Judge quality verdicts on the status report's content; no stall, all reps under 40 s with at most 4 tool calls.                                                    |

Per slice:

- **A:** zero `read_tool_fence_timeout`, zero claim HTTP 500s, zero aborted claims, 90
  claim calls versus 127 on 2026-09-21. The case 14 stall did not recur. Weak evidence
  (one run, different model), consistent with the repair.
- **B:** case 2's first batch was approved on the first review in all three repetitions;
  no repair pass over `type_key`. Same caveat on the model.
- **C:** `completion_receipt` was written on all three case 2 terminals and matched the
  ledger. The finding: reps 1–2 ran under an **implicit** five-outcome contract derived
  from the first proposed batch, so the verdict was `request_fulfilled` (rep 2) even
  though the dependency links were never proposed; rep 1 became `request_partial` only
  through a typed provider failure. The receipt cannot see work the model never declared.
  The follow-up already listed in the C document (an expectation derived from the
  admitted `turnIntent` or the request itself for batch-lane turns) is now evidenced live
  and should be built before the receipt is used for any host-rendered completion claim.

Not a controlled comparison with the 48/52 baseline: different acting model, plus other
sessions' changes in `3a407d688`. A comparable rerun would set the gate env model to
`deepseek/deepseek-v4.1-flash` (about $0.30) and needs DJ's approval.

## Fixes after the 2026-09-22 gate (free, local; not yet re-gated)

DJ: "It should not be using the Pareto model." Five defects the run exposed, each with a
free test, ready for a DeepSeek rerun that needs DJ's approval (about $0.29).

| #   | Defect seen in the run                                                                                                                                                    | Fix                                                                                                                                                                                                                                                                                                                                    | Proof                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The gate ran on `unbiased/pareto` because the env file said so; the $0.30 estimate came from a DeepSeek run.                                                              | `.env.agentic-gate.local` now names `deepseek/deepseek-v4.1-flash`; `scripts/agentic/preflight.ts` `assertGateModelAllowed` refuses any model outside `AGENTIC_GATE_ALLOWED_MODELS` (default DeepSeek) before services boot and names the known spend; `AGENTS.md` paid-test rule now requires naming the model and its measured cost. | `preflight.test.ts` (4 pass); gate doc updated.                                                                                          |
| 2   | Case 2 reps 1–2: after the five creates the model answered "Proposing that stage for independent review:" and stopped; the promise heuristic only matched "I'll/I will…". | `hasUnfinishedBatchAction` also matches gerund-led promises and trailing stage handoffs, with negation guards, so the existing one-shot batch-promise repair fires.                                                                                                                                                                    | `agenticChatRepairPolicy.test.ts` (+6 positive/negative fixtures incl. the exact text).                                                  |
| 3   | Case 9 rep 2: the revision pass after a reviewer rejection used `tool_choice: auto` and narrated the corrected batch as JSON prose; nothing executed.                     | `buildMutationBatchRevisionRequest` sets `tool_choice: required`; a required pass that still answers in prose already falls back to one withheld tool-free answer.                                                                                                                                                                     | `agenticChatMutationBatchReview.test.ts` (+2 assertions). **Reverted after the DeepSeek rerun: it caused the case 1 duplicate (fix 6).** |
| 4   | Case 2 rep 1: the final pass returned no text and no calls, so `provider_no_assistant_text` (permanent) turned five saved creates into a partial failure.                 | One bounded re-ask (`buildEmptyReplyRepairRequest`, flag `emptyReplyRepairAttempted`); the second empty reply still fails.                                                                                                                                                                                                             | `agenticChatTurnProvider.test.ts` (re-ask then failure; re-ask then recovery).                                                           |
| 5   | Case 5 rep 1: after one timeout the retry sent `provider.ignore` for the model's only provider and OpenRouter answered 404 "All providers have been ignored".             | `applyTurnRouteHealth` never lets remembered failures exclude the entire configured `order` pool; it retries the pool instead.                                                                                                                                                                                                         | `agenticChatOpenRouterClient.test.ts` (+1).                                                                                              |

Worker suites 266/266, worker typecheck and eslint clean. Not fixed by code: case 11's wrong
timezone example and case 14's absence claims were judge verdicts on Pareto's prose; case 2
rep 3's 76 s was Pareto pass latency. C's implicit-contract gap (the receipt cannot see stages
the model never proposed) remains the listed follow-up; fix 2 narrows it by catching the
handoff prose, but the request-level expectation is still the real answer.

## Gate rerun — 2026-09-22 14:15Z (DeepSeek, DJ-approved; failed 43/52)

DJ approved the rerun ("Okay, go ahead and do the run.") at an estimate of about $0.29.
Acting model `deepseek/deepseek-v4.1-flash` (checked in the env file and enforced by
`assertGateModelAllowed` before services booted); reviewer `openai/gpt-5.6-luna`. Measured
spend by the OpenRouter usage counter: **$0.32** (pass receipts $0.21: acting $0.16, review
$0.035, repair $0.012, final $0.001). Balance left on the gate key: $1.89. Ran 14:15:30Z to
14:45:27Z on HEAD `3a407d688` plus the five post-gate fixes in the dirty tree (hash
`522c4756…`), provenance verified on web and worker.

Result: 43/52 (82.7%, B). Cases 2, 3, 4, 5, 6, 7, 8, 9, 11, 13 scored 4/4. Against the
Pareto run, cases 2, 5, 9 and 11 recovered (fixes 2 to 5 were not contradicted; case 2
proposed both stages and had every batch approved on the first review in all three
repetitions). Against the 48/52 DeepSeek baseline of 09-21 it is down five points, and all
three losses are new.

| Case | Score | What happened                                                                                                                                                                                                                                                                                                           |
| ---- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 1/4   | Rep 1: the reviewer struck a follow-up goal create; the revision pass, forced to `tool_choice: required` by fix 3, re-proposed the original `create_onto_project` batch with an identical digest; the reviewer approved the identical bytes again; the project existed twice. Reps 2 and 3 passed. **Caused by fix 3.** |
| 10   | 0/4   | Rep 3: `provider_stream_error` (`provider_throttle`, transient) after first-byte timeouts on the calendar turn. Reps 1 and 2 passed. A case scores 0 when any repetition fails transport.                                                                                                                               |
| 14   | 2/4   | Rep 3: judge 1/5 because the report asserted the marketing brief had no revision since the initial draft (an absence claim read off a change log that lists only the draft). Reps 1 and 2 passed under 40 s. Same failure shape as both Pareto losses.                                                                  |

Timing limits missed on otherwise correct turns: case 2 rep 1 at 70.1 s (limit 60), case 4
rep 1 turn 1 at 31.4 s (limit 30), case 8 rep 2 at 40.5 s (limit 30). These are DeepSeek
pass latency, not code, and the 09-21 baseline lost its only point the same way. Harness:
case 13 rep 2 failed before any turn ran (Postgres statement timeout while seeding the
project, 9.6 s); the two turns that ran passed and the case still scored 4/4.

Per slice, now like-for-like with the baseline's acting model:

- **A:** zero `read_tool_fence_timeout`, zero claim HTTP 500s, 108 claim calls; case 14
  finished under 40 s with at most 8 tool calls in every repetition. The stall did not recur.
- **B:** zero `type_key` mentions in the worker log; case 2's first batch was approved on the
  first review in 3/3 (the 09-21 baseline paid one `type_key` repair pass in case 2 rep 1).
- **C:** `completion_receipt` on 43 of the 44 captured turns (the missing one is the case 10
  transport failure): 17 `request_fulfilled`, 1 `request_partial`, 25 `request_unverified`
  (turns that declared no contract). Case 2 was fulfilled with two stages in 3/3, so the
  implicit-contract gap seen on Pareto did not surface. Case 1 rep 1's receipt records **two
  approved stages** under `request_partial`: the receipt faithfully shows the replayed batch,
  which is how the duplicate was confirmed.

Record: [tasker92-gate-2026-09-22-deepseek.json](../docs/research/specialist-quality-2026-09-21/tasker92-gate-2026-09-22-deepseek.json);
raw `output/agentic-gate/tasker92-deepseek-20260922T141529Z/`.

## Fixes after the DeepSeek rerun (free, local; not re-gated)

| #   | Defect seen in the run                                                                                                                                       | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Proof                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | Case 1 rep 1: fix 3's forced revision pass re-proposed bytes that had already executed, and the reviewer approved the same digest twice (duplicate project). | Fix 3 reverted: `buildMutationBatchRevisionRequest` is back to `tool_choice: auto` (case 9 was 4/4 on DeepSeek with `auto` in the 09-21 baseline; the narrated-JSON revision was Pareto behaviour). New same-turn replay protection in `turn-provider.ts`: the digest of every executed reviewed batch is remembered for the turn; a later proposal with an identical digest is never reviewed or executed, the turn answers from the write receipts and finishes. | `agenticChatTurnProvider.test.ts` (+1: identical re-proposal after execution → no review, no writes, receipt text, finish `stop`); `agenticChatMutationBatchReview.test.ts` assertion flipped to `auto`. Worker suites 267/267, worker typecheck and prettier clean. |

Not fixed by code: case 10's provider timeouts (transient throttle on the calendar turn),
the three latency misses, and case 14's absence claim. The absence claim is a prompt
question: the ordinary-chat system prompt carries no "missing evidence does not establish
absence" rule (only the project-review-v3 specialist does), and the judge accepts "the change
log lists only the initial draft; later revisions are unknown". Whoever owns that prompt
should add the rule; this pass did not edit it. A re-proposal that differs by even one byte
is still not caught by the digest check; that needs an entity-level duplicate check (search
before create) and is out of scope here.

Any further run needs DJ's approval: DeepSeek measured $0.32 per three-repetition gate;
$1.89 left on the key.

## Ordered implementation work

### A. Investigate and repair stalled ownership checks — first

**Observed failure:** case 14, repetition 1, turn
`8f1ed224-f229-411f-a3cf-ae4fd0d5ed4d`, took **49.393 seconds** against a 40-second limit.
The model requested document detail, three searches, and a document list. The first four
parallel calls each hit the ten-second `read-tool fence claim` deadline **before tool execution**.
The queued fifth call eventually listed documents. No semantic lookup ran in this failed repetition.

Same-turn `claim_agentic_chat_turn` requests returned HTTP 500 after approximately 46 seconds.
Prompt-snapshot persistence timed out after 15 seconds, and other persistence requests also
slowed. These observations identify a failing stage; they do **not** establish a database
deadlock, a specific blocking query, or saturation as the underlying cause.

**Work:**

1. Trace each read's claim check, prompt-snapshot persistence, cancellation observation, and
   other same-turn writes. Inspect the latest SQL definitions and migration amendments;
   a function's first migration may not be its current implementation.
2. Reproduce slow claims and competing operations with injected ports, controllable promises,
   and, if needed, a disposable local Postgres fixture. Record call count, ordering, deadline
   behavior, and whether timed-out operations continue in the background.
3. Investigate whether duplicate concurrent ownership checks or persistence scheduling contribute.
   Share an in-flight check only if its identity/freshness/cancellation semantics can be proven
   safe. Do not replace fencing with an indefinitely cached successful claim or just raise timeouts.
4. Make the smallest supported repair. Preserve turn, queue job, session, user, correlation,
   generation, input artifact, and user-message identity checks. Keep mutation authority separate.

**Acceptance:** concurrent reads progress with bounded control work; cancelled, terminal, or
stale-generation turns never start a tool; one caller's cancellation cannot grant another caller
stale authority; late responses cannot revive cancelled work. Recovery and changed ownership are
covered. Record what the local reproduction proves and what remains unproven about the live incident.

The other two grounded-status repetitions passed in **19.353** and **12.632 seconds**. Their six
searches took **719–1,147 ms**, with complete lexical/semantic coverage reaching the next model
request. No live semantic fallback fired; only local fault injection proved that timeout branch.

### B. Align optional task classification with review policy

**Observed failure:** case 2, repetition 1, turn
`926c3a0a-f200-48f1-b5c2-6ddd654ce8e4`, took **70.140 seconds** against a 60-second limit.
All five task creates and three dependency links passed their behavior assertions. No searches ran.

Two failed provider attempts took 8.837 and 5.016 seconds. The reviewer also rejected unrequested
`type_key` classifications, causing correction and re-review, while the tool description says
“Omit when unsure.” The later dependency review took 8.517 seconds. These spans overlap or nest;
do not sum them as a disjoint wall-clock breakdown or promise that classification alone fixes latency.

**Work:** choose and encode one consistent policy for optional work-type inference in the canonical
tool catalog, acting guidance, reviewer guidance, and fixtures. The conservative starting proposal
is to omit optional classification unless the request/evidence warrants it; verify compatibility
with existing documented product behavior. Preserve explicit user classifications and unrelated
scope/date/priority safeguards. Do not broadly relax review just to remove a rejection.

**Acceptance:** focused fixtures cover ordinary unclassified creation, explicit classification,
and unsupported additions. The schema and reviewer agree on each case. Provider retry latency is
reported separately, and no model route is changed without evidence.

### C. Make whole-request completion explicit

Start with [the completion-receipt proposal](../docs/architecture/SPECIALIST_QUALITY_NEXT_CONTRACTS_2026-09-21.md).
Inspect existing turn contracts, reviewer decisions, effect verification, and partial-result
handling before adding another protocol.

Persist a versioned distinction between **this stage is approved** and **verified effects fulfill
the entire request**, bound to the exact reviewed bytes and expected effects. Only the latter can
justify a host-rendered final change summary that saves another model call. Successful attempted
writes or approval of one batch are insufficient evidence of whole-request completion.

**Acceptance:** missing dependencies, partial effects, wrong dates, ambiguous targets, uncertain
writes, cancellation, and restart cannot become “complete.” Receipts replay without duplicate
effects. A remaining stage continues or is explicitly disclosed. Host-compiled dependencies with
references to newly created results are a separate versioned recovery change, not a shortcut in A.

### D. Build an answer-quality comparison surface

After reliability, extend the existing specialist workbench/inspector with **Compare answers**.
Start with saved or synthetic answers so the first inspectable artifact incurs no model spend.
Use the same frozen question/source packet, randomized A/B labels, inspectable source excerpts,
coverage, latency, and recorded cost. Capture preference and reasons before revealing identities.
Missing cost is unknown, not zero; capability checks are not answer-quality scores.

**Acceptance:** comparison cannot trigger paid inference by loading the page; source packets and
candidate versions are bound; unsupported claims and abstention can be scored; missing receipts
are visible. Keep exploratory cases separate from held-out evaluation. Generating new answers or
using paid judges needs its own prior approval. Automatic routing remains a later promotion decision.

**Status (pass 3):** built as decided in DJ's interview. Details, rules, validation, and known gaps
in [ANSWER_COMPARISON_LAB_2026-09-21.md](../docs/architecture/ANSWER_COMPARISON_LAB_2026-09-21.md).
The page loads nothing from a model and cannot trigger inference. The migration was applied to the linked production database on 2026-09-22 (UTC) at DJ's request, wrapped in one transaction, verified (three tables, six functions, RLS on, service-role grants only), and recorded with `supabase migration repair`. Ledger note: four local 2026-09-21 migrations (041759, 042959, 143217, 154425) have no remote ledger entry; the v2 and v3 project-review objects do exist on that database, so those two were applied without being recorded; the other two were not probed. DJ also asked to merge the `codex/search-reliability-20260921` worktree branch into main: every commit on it is already an ancestor of main, and its 190 uncommitted files are either byte-identical to main's working tree (177) or older copies of files main has since changed, so nothing was merged. The route returns 404 to anyone outside `AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS` and fails closed with
503 if the tables are missing. Gaps: no "add a candidate later" control in the UI (API supports it);
one reviewer per comparison in practice; no browser walk-through yet.

## Source map for the next agent

Paths below are relative to the repository root. Use symbol search rather than historical line numbers.

| Boundary                      | Starting files/symbols                                                                                                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read ownership checks         | `apps/worker/src/workers/agentic-chat/turn-executor.ts`: `assertCurrentReadToolFence`, `awaitOverhead`, and both call sites                                                                                                                                     |
| Claim RPC and persistence     | `apps/worker/src/workers/agentic-chat/executionControl.ts`; `promptSnapshot.ts` in the same directory                                                                                                                                                           |
| Claim SQL history             | `supabase/migrations/20260802020100_agentic_chat_worker_claim_fencing.sql`; `20260806020000_agentic_chat_timing_evidence_repair.sql`; search later amendments too                                                                                               |
| Snapshot SQL history          | `supabase/migrations/20260817010000_agentic_chat_prompt_snapshot_runtime_augmentation.sql`; `20260914165546_agentic_chat_workflow_prompt_snapshot.sql`; search later amendments too                                                                             |
| Task classification schema    | `packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts`: `create_onto_task.type_key`                                                                                                                                                          |
| Review and completion         | `apps/worker/src/workers/agentic-chat/provider/review/{turn-contract,mutation-batch,decision-completion,contract-execution,disposition}.ts`; `reviewedTurnContract.ts`                                                                                          |
| Bounded search and compaction | `packages/agentic-chat-runtime/src/tools/ontology-search.ts`; `src/loop/tool-payload-compaction.ts`; `packages/shared-agent-ops/src/embeddings/openai-embeddings.ts`                                                                                            |
| Existing workbench/inspection | [Task 91 source map](91-workflow-lab-audit-and-export.md); [workbench implementation](../docs/architecture/SPECIALIST_WORKBENCH_2026-09-20.md)                                                                                                                  |
| Focused worker tests          | `apps/worker/tests/agenticChatTurnExecutor.test.ts`, `agenticChatExecutionControl.test.ts`, `agenticChatPromptSnapshot.test.ts`, `agenticChatReviewedTurnContract.test.ts`, `agenticChatMutationBatchReview.test.ts`, `agenticChatToolExecutionAdapter.test.ts` |

## Validation and safe takeover

1. Read `AGENTS.md`, inspect `git status`, and reconcile current source with this dated handoff.
   Do not revert or stage unrelated changes. Use an isolated checkout if shared-file activity
   would make a validation result ambiguous; carry over relevant WIP deliberately.
2. Begin with A and a small retained reproduction. Do not rebuild completed search/v3 features
   or start all four implementation slices at once.
3. Run only the free focused tests relevant to changed behavior. For example, after confirming
   the selected tests use local mocks, run sequentially through the machine-wide test gate:

    ```sh
    test-gate run pnpm --filter @buildos/worker exec vitest run tests/agenticChatTurnExecutor.test.ts tests/agenticChatExecutionControl.test.ts
    ```

    Add snapshot/reviewer suites when those boundaries change. Honor the repo worker caps and
    memory gate; on resource refusal wait at least 60 seconds, retry once, then report. Do not
    launch whole-repository suites or concurrent heavy validation to save time.

4. Preserve the existing offline replay result before rerunning its script: it writes a result
   file. New evidence should carry its own date/source identity and must not erase the failed baseline.
5. Before stacking another runtime change set, the repo requires the full Agentic Chat gate.
   **Ask first.** If approval is absent, leave it pending and continue only independent read-only
   analysis, documentation, or fixtures; do not silently treat free tests as the release gate.
6. An approved live run needs a fixed executable tree, isolated QA database, dedicated calendar
   connection, and no other worker consuming its queue. Keep credentials in a private env file;
   never substitute production. Recheck prerequisites rather than trusting old local setup.
7. Full acceptance still requires three repetitions, 52/52, verified source provenance, complete
   evidence, and unchanged limits: case 2 <60s; cases 4/8 <30s; case 14 <40s and at most eight
   tool calls. A default-off specialist contract additionally needs its own approved live smoke.
   Do not broaden rollout or delete rollback support based on local-only proof.

## Handoff/exit checklist

- [x] A has a reproducible failure model, bounded repair, and free cancellation/fencing/recovery evidence (2026-09-21, uncommitted; live gate pending).
- [x] B has one documented policy and matching actor/reviewer/catalog fixtures (as a verified, unapplied patch; apply before gating it).
- [x] C has an explicit reviewed completion contract and recovery tests (implemented, pass 2; host summary consumer and batch-lane expectation are listed follow-ups).
- [x] D built as a blind comparison lab over real pilot runs with bound packets, sealed votes, rubric, and receipts (pass 3; migration applied to production 2026-09-22 UTC at DJ's request; free tests plus a disposable-PostgreSQL SQL contract).
- [x] Each slice records source identity, checks performed, remaining uncertainty, and any approvals (pass 1 table above and the linked documents).
- [x] Required paid acceptance ran with DJ's approval on 2026-09-22 and **failed 38/52**; retained in `output/agentic-gate/tasker92-final-20260922T023058Z/` and the portable record. Not a pass; no live fix is claimed. The model differed from the 48/52 baseline (Pareto vs DeepSeek), so it is not a controlled comparison.
- [ ] Deployment/flag changes, if later requested, have their own recorded scope and verification.

Keep this tracker open while required implementation or verification remains. When its actual
exit conditions are met, move lasting evidence into the architecture/review documents, move any
genuine residual to an owned tracker, and delete this tracker and its README row together.
