<!-- docs/research/specialist-quality-2026-09-21/README.md -->
<!-- doc-status: point-in-time -->

# Specialist evidence and Jev research — September 21, 2026

The richer evidence recipe produced a useful improvement in a small synthetic comparison. Jev
also distinguished most supported, contradicted and unsupported claims, but made one meaningful
uncertainty error. These are exploratory results, not a promotion decision or production guarantee.
All source material is fictional and agent-authored. No customer content was sent to these probes.

Implementation and release status: [Project Review v2](../../architecture/PROJECT_REVIEW_V2_2026-09-21.md).
The final ordinary-chat QA run scored 52/52 with verified provenance, but failed four timing
limits. The separate durable specialist smoke also exposed a false date claim. V2 stays default-off;
neither structural execution success nor this synthetic research is a release approval.
[Complete gate findings](GATE_FAILURES.md).

The subsequent default-off [Project Review v3](../../architecture/PROJECT_REVIEW_V3_2026-09-21.md)
implements exact excerpts, code-computed overdue facts, SQL revalidation and ID-only synthesis.
Its final-code durable QA smoke passed in **15.427 seconds**, preserved the $1,200 fee and correct
**2 of 5** count, and made no project changes. All four model steps were accepted on their first
attempt. This is a single synthetic smoke. The complete v3 gate subsequently failed **44/52**:
two transport/read failures, four timing violations, and source-verification failure after concurrent
checkout edits. Its 44 retained turns have zero evidence-capture errors; they do not establish one
immutable validated build. All 83 focused cases and worker typecheck passed again under the updated
tooling. V3 remains default-off.
[Live receipt and actual answer](live-v3-review.json) · [Claim inspector](claim-inspector.html).
[Gate diagnostics](v3-gate-diagnostics.json) · [Retained scorecard evaluation](v3-gate-policy-evaluation.json).

The next [search reliability change](../../architecture/SEARCH_RELIABILITY_2026-09-21.md)
bounds optional semantic recall to five seconds, cancels its transport, and returns keyword
results with explicit coverage when that channel fails. A local hung-provider replay settled
in **5.008 seconds**, aborted the fetch, and made zero late vector requests. This replay uses
synthetic data and an injected transport; it is not a live speed comparison. 133 focused
tests and shared-runtime/worker typechecks pass. The full gate finished **48/52**, with 44 of
45 turns passing, verified source provenance and zero capture errors. It **failed**: one
task batch took 70.140 seconds, and one grounded-status run failed in database ownership
checks before reaching search. The other status runs passed in 19.353 and 12.632 seconds;
their six searches took 719–1,147 ms and carried coverage into the model prompts. No live
semantic timeout occurred, so the injected replay remains the evidence for that failure path.
[Interactive search budget](search-reliability.html) · [Fault replay](search-timeout-replay.json) ·
[Reproduction script](search-timeout-replay.mts) · [Final gate diagnostics](search-reliability-gate.json).

[Open the answer-comparison prototype](answer-comparison.html) to inspect four paired full answers,
their exact source packets, and model receipts. It hides the variant labels until reveal, records
whether a preference was chosen before or after reveal, and exports local ratings. Labels are
alternated, not randomly assigned; this prototype is not a blinded production evaluation.
Ratings are held in memory until export and reset on reload. Browser checks verified initial
render, preference selection, reveal, case switching and a clean reload.

## Evidence recipe comparison

Eight live requests compared the frozen v1 risk reviewer with v2's risk reviewer on four identical
questions. The v1 recipe received document inventory without bodies and omitted risk/relationship
families; the v2 recipe used the new bounded packet builder. Both used
`deepseek/deepseek-v4.1-flash`, served by Together, low reasoning and a 4,000-token cap.
No planner, second specialist, editor, retries, database writes or full workflow timing were included.

| Synthetic case                                     | v1 observation                                                                                                | v2 observation                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Harbor Launch: most important saved blocker        | Could not identify the blocker from a completed room task.                                                    | Identified outstanding permit approval and the opening dependency, citing both records.            |
| Sparse project: does evidence establish readiness? | Said evidence was insufficient but emitted four findings about absent evidence to meet the contract.          | Returned `insufficient_evidence`, zero findings/risks and a concrete missing-evidence explanation. |
| Birch Workshop: open catering risk?                | Could not inspect the absent register; emitted three findings about missing context.                          | Returned `no_material_findings`, correctly identifying the supplied risk as mitigated.             |
| Atlas Migration: cutover date and downtime         | Could not inspect document text. One finding incorrectly equated no packet omissions with no source omission. | Extracted October 12, 2026 and the 30-minute cap from the supplied document body.                  |

All eight reports passed their structural parser. That does **not** establish that every statement
was supported. The v2 Birch recommendation unnecessarily preferred creating a new risk over
reopening the old one; the source did not establish that workflow choice. V2's Atlas risk also
calls lack of independent corroboration a concern without establishing its materiality. These
examples support the next claim/proposal boundary rather than declaring answer quality solved.

Total recorded cost: **$0.004758324**. Individual requests took **973–2,153 ms**. These measurements
exclude normal workflow overhead and are single observations, not latency guarantees.

[Exact inputs, prompts, outputs and usage](answer-comparison-results.json) ·
[Reproduction script](answer-comparison-probe.ts)

## Claim-support probe

The [36-case corpus](claim-support-corpus.json) has three fictional projects and balanced labels:
12 supported, 12 contradicted and 12 insufficient. Twelve cases were designated held-out before
running the probe. Labels and the rubric were written by the implementing agent; they have not
been independently human-calibrated. They must not be reported as a production accuracy estimate.

Three calls batched 12 independent Choice questions each using `typesafe/jev-1.13`, served as
`typesafe/jev-1.13-20260917`, with retries disabled. State contained sources and claims but omitted
expected labels and split names. The prompt separated source content from instructions and warned
against inferring completeness from a partial excerpt or truncated collection.

- Agreement with the authored labels: **35/36** overall; **11/12** on the predeclared held-out subset.
- No unsupported/contradicted claim was classified as supported in this sample.
- Disagreement: “The workshop has no remaining risks.” The input contained one mitigated risk and
  coverage showing four unread risks. The expected answer was `insufficient`; Jev chose
  `contradicted` with probability 0.79 and confidence 0.69. Unread risks need not be open.
- Recorded cost: **$0.000455112**. Batch durations: **928, 272 and 269 ms**.

No rubric or threshold was tuned after seeing the held-out result. Further tuning requires new
held-out cases. Next add ambiguous inferences, numeric/date entailment, contradictory source
versions, omission boundaries and independent human labels. Measure false-supported claims
separately from disagreement between contradiction and insufficient evidence.

[Scorecard](claim-support-scorecard.json) · [Exact requests and receipts](claim-support-results.json) ·
[Reproduction script](claim-support-probe.ts)

To reproduce from the repository root, first build the shared dependencies, set
`AGENTIC_GATE_ENV_FILE` to the private QA configuration, then run a chosen script with
`node --import tsx docs/research/specialist-quality-2026-09-21/<script>.ts`.
These commands make paid model calls and overwrite their local result files. Preserve a prior
result first when running a new experiment. Neither script mutates a BuildOS database.

## Research decisions

### Planner ablation

A second probe ran both specialists and an editor on the same four frozen v2 fixtures. Each
fixture received one model-planned run and one run using the frozen compiled assignments; arm
order alternated. This is 28 sequential model calls, with no production persistence, transport
retries, dispatch ledger or independent human scoring. Both arms used the same DeepSeek route.

| Arm                  | Calls across four cases | Accepted specialist reports | Mean model-only run duration | Total cost   |
| -------------------- | ----------------------- | --------------------------- | ---------------------------- | ------------ |
| Compiled assignments | 12                      | 8/8                         | 6,226 ms                     | $0.008327202 |
| Model planner        | 16                      | 7/8                         | 10,794 ms                    | $0.014156091 |

Both arms answered the central question in all four cases on manual inspection by the implementing
agent. The model-planned Harbor risk report exceeded the summary limit and was rejected; its
editor correctly labeled the result partial. No retries were allowed in this probe. The sample
does not establish a statistical quality tie or a production latency benefit. It does justify
evaluating a versioned compiled-plan template instead of assuming a planner call is necessary.

The complete answers exposed another product problem: they repeatedly describe database families,
role names, completion counts and internal coverage metadata instead of simply answering. Both
Atlas answers objected that a document titled “Migration plan” was not a plan-type record. That is
an unhelpful interpretation of the user's ordinary language. The model-planned Birch answer also
invented an additional schema-verification chore around a clearly recorded `mitigated` state.
Several answers recommend extra checks without demonstrating why those checks matter to the
question. The quality rubric must measure usefulness and unnecessary work as well as factuality.

Total recorded cost: **$0.022483293**. Preserve the exact outputs; do not promote the compiled arm
based on this tiny synthetic sample alone.
[Requests and answers](planner-ablation-results.json) · [Reproduction script](planner-ablation-probe.ts).

### One specialist versus two

A follow-up used one project analyst plus the same editor on the four frozen v2 fixtures.
All four specialist reports passed their parser, and all four answers contained the central
requested fact or appropriate uncertainty on inspection by the implementing agent. Eight calls
cost **$0.005510304**, with mean model-only duration **5,502 ms**. The earlier compiled two-specialist
arm used 12 calls, cost $0.008327202 and averaged 6,226 ms. These runs were not interleaved, and
four simple questions cannot establish that independent review has no value on harder cases.

One specialist did not remove the output problems. The sparse answer incorrectly called an
`insufficient_evidence` outcome a “no-material-findings result”; the Atlas answer still foregrounded
the distinction between a document titled “Migration plan” and the database's plan records.
Harbor described the permit's current status as unrecorded after correctly reporting it outstanding.
These are additional evidence for validating and simplifying synthesis, rather than adding agents
or treating parser acceptance as answer correctness.

The first invocation was blocked by network isolation before any model calls; its zero-call record
is retained separately. The successful invocation used the same script with network access.
[Requests and answers](single-specialist-results.json) · [Reproduction script](single-specialist-probe.ts).

### Live date failure and a deterministic claim prototype

The corrected durable-v2 QA smoke passed the execution/persistence checks in **31.918 seconds**,
including a risk found only in the register, both new specialist identities, and unchanged project
records. Manual answer inspection nevertheless failed: the analyst called September 29 overdue
on September 21; the editor expanded that to “all five tasks are past due,” including October 1
and October 3. The citations were real. Membership validation accepted the incorrect claim.
The retained `quality-review.json` explicitly prevents this structural pass from being reported
as an answer-quality pass.

A separate [source-bound claim prototype](source-bound-claims.mjs) now demonstrates three narrow
boundaries without changing the runtime:

- Exact field quotes are bound to a host-created frozen source hash and unambiguous UTF-16 span.
  Quoting a source does not verify an arbitrary paraphrase or the underlying source's truth.
- A typed overdue comparison uses saved due instants, task states and snapshot time in code.
  Missing dates/states remain uncertain; statements concern the cited subset, never all project work.
- The editor can arrange checked units by ID. Unknown IDs and new factual prose are rejected.

Six boundary tests pass. Replaying the actual synthetic QA packet produces **2 of 5 overdue**,
contradicts the original all-overdue claim, and preserves the exact $1,200 risk excerpt.
[Interactive claim inspector](claim-inspector.html) ·
[Replay and frozen references](source-bound-live-replay.json) · [Tests](source-bound-claims.test.mjs).
Browser checks covered the initial contradiction, a supported “some” claim, selecting only the
three future tasks, and a clean reset. The original saved answer and source hashes are inspectable.

The offline script remains a research prototype with no authorization, database, provider,
durable dispatch or recovery integration. The separate v3 runtime now implements the versioned
extractive policy/report, SQL validation and recovery integration, using Unicode code-point spans
instead of this prototype's UTF-16 spans. General entailment and calibrated semantic shadow
remain outside its deterministic checks. Promotion still requires the complete release gate.

### Decision-model scope

TypeSafe's Choice primitive returns a distribution over a fixed option set. Independent questions
can share a request; include an insufficient/none option where appropriate. Confidence summarizes
the distribution's concentration and does not establish correctness. Thresholds need testing on
the actual task. [Choice](https://docs.typesafe.ai/primitives/choice),
[Confidence](https://docs.typesafe.ai/confidence).

State can group related records and claims while keeping judging instructions separate. Each
question evaluates that same state independently. This fits batched support judgments but does
not make one answer available as evidence to another question in the batch.
[State](https://docs.typesafe.ai/concepts/state).

Agent evaluation should combine structural/state checks with task-specific semantic rubrics and
human calibration. Inspect transcripts, include both positive and negative cases, and preserve a
stable environment. The current probe covers a small judging task; it does not replace a workflow
quality comparison or the Cedar House release gate.
[Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).

## Optional external probe not run

An additional semantic probe of retained QA task/risk/project fields was rejected by automatic
approval review because it would transmit project-derived data to Jev/OpenRouter. It did not run
and produced no additional Jev result. The source-bound replay and interactive inspector above
ran offline instead. This does not change the completed 36-case fictional corpus results.

Tasker 92, pass 1 (2026-09-21): the grounded-status ownership-check stall was traced to a
four-wide burst of identical `claim_agentic_chat_turn` requests, none cancellable, racing the
prompt-snapshot write for the same turn-row lock. The worker-side repair and its before/after
injected reproduction are in [read-tool-fence-probe.json](read-tool-fence-probe.json) and
[READ_TOOL_FENCE_RELIABILITY_2026-09-21.md](../../architecture/READ_TOOL_FENCE_RELIABILITY_2026-09-21.md).
The optional task-classification policy was later applied (Tasker 92 slice B); it lives in
`apps/worker/src/workers/agentic-chat/provider/review/controls.ts`.
Neither is a gate result; the 48/52 baseline stands.
