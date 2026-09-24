<!-- docs/technical/reviews/CHAT_WORKFLOW_TASK90_FAILURE_BRIEF_2026-09-14.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-18; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Task 90 — failure brief and open questions

**Investigation only. No fix has been selected.** DJ requested this write-up and
a fresh-context independent analysis before further implementation. The author of
this brief also implemented the preceding repairs. To reduce anchoring, the other
agent was given raw artifacts and the exact executable snapshot and instructed to
form its own findings before reading our earlier interpretations.

The prior [gate receipt](CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md) accurately
records the observed failures, but its statement that recovery routing should be
the first repair was premature. Routing is one candidate; the following separates
the observed events, possible mechanisms, and evidence needed to choose a remedy.
The [independent analysis](CHAT_WORKFLOW_TASK90_INDEPENDENT_ANALYSIS_2026-09-14.md)
is a separate assessment, not instructions to implement this brief's suggestions.

## What the run establishes

Run: `output/agentic-gate/task90-acceptance-20260914T013318Z/`.
Snapshot: `/private/tmp/buildos-task90-gate-20260914T013318Z`.
The [scorecard](../../../output/agentic-gate/task90-acceptance-20260914T013318Z/scorecard.json)
scored **45/52**. The [gate](../../../output/agentic-gate/task90-acceptance-20260914T013318Z/gate.json)
failed on three behavior/quality cases and a separate latency violation. Startup
and final source provenance match; the run was not interrupted. Case 9 repetition
2's first-turn assertion prevented its follow-up, leaving **44/45 expected turns**.
Of those 44, 41 passed behavior and quality; one of those 41 failed the time limit.
No captured turn reports an evidence-capture error.

| Failure                        | Direct observation                                                                                                                                              | What this alone does not establish                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Case 8 r3, 34.521s             | A local progress cutoff aborted an opened V4.1 response after 7.486s overall; a V4 retry took 6.441s. Total exceeded 30s.                                       | That aborting saved time, that the provider was stuck, or that another V4.1 provider would finish sooner.             |
| Case 9 r2, source preservation | The successful create call already lacked the requested quoted block. The saved document matched that omission; final prose falsely claimed exact preservation. | Why the actor omitted it, whether model choice was decisive, or whether more prompt wording would prevent recurrence. |
| Case 10 r3, calendar reasoning | Given a 10:00–11:00 busy event and a 15-minute buffer, the answer proposed 09:30–10:00 and described the exclusion intervals incorrectly.                       | A calendar integration failure, an unavailable source, or a proven need for an additional model reviewer.             |
| Case 14 r2, grounded reporting | The answer qualified missing records earlier, then asserted “No work started” in its summary.                                                                   | That work actually had or had not started, or that a phrase filter would enforce factual grounding generally.         |

Exact turn IDs and timing components are in the prior receipt; the primary raw
files are `turns/cedar-08-document-edit-3-1.json`,
`turns/cedar-09-hostile-source-2-1.json`,
`turns/cedar-10-calendar-availability-3-1.json`, and
`turns/cedar-14-grounded-status-2-1.json`. Each links its physical provider captures.
The Case 10 and Case 14 judge failures can be checked directly against the answer
and tool evidence; their numerical grades are not being treated as causal proof.

## Questions the earlier interpretation left unresolved

### 1. Does the new recovery policy improve the whole turn?

The run recorded **15 local insufficient-progress aborts** and **one five-second
response-header timeout**. Those are different triggers. In Case 10 r3 no response
opened before the timeout; Cases 8/9/14 had opened streams. These are locally
enforced cutoffs, not necessarily upstream service errors.

The progress watcher measures visible text and tool-argument bytes, starts after
headers open, and excludes hidden reasoning. It is a heuristic for user-useful
output, not a measurement of provider token generation. It cannot distinguish all
forms of slow reasoning, delayed first output, and transport stalls from the
retained normalized events alone. A low byte count proves the threshold was hit;
it does not prove abandoning that attempt was beneficial.

There is also a measurement asymmetry: the watcher's model check requires the
exact canonical V4.1 identifier, while successful responses sometimes report the
dated `deepseek/deepseek-v4.1-flash-20260910` identifier. That is a source-level
coverage question to investigate, not evidence that every such response was slow.
See snapshot `provider/openrouter-client.ts:592`, `:1542`, and `:1908` under
`apps/worker/src/workers/agentic-chat/`.

Case 8 r2 passed without a retry at **29.572s**, leaving only 428ms headroom.
Case 8 r1 incurred a SHA-approval format recheck and still passed at 22.574s.
This variability argues for examining the whole critical path, not treating one
cutoff or one extra request as a complete latency explanation. In the failed r3,
the captured persistence attempts were short and had no retries/pressure waits;
that narrows this instance without proving persistence is irrelevant in all runs.

### 2. Is V4 fallback the cause, a contributor, or a marker?

All three content/quality failures ended on V4 after recovery. However:

- Of **16 turns ending on V4**, **13 passed behavior/quality and three failed**.
  The Case 8 timing miss is among the 13 behavior/quality passes.
- All 28 turns ending on V4.1 passed behavior/quality in this run.
- Case 9 r3 successfully created the exact note on Wafer V4 after recovery.
- Case 10 r1 and r2 produced passing calendar answers on Wafer V4 after recovery.
- The previous complete run had four V4-ending recovered turns, all behavior
  passes. That run still failed its timing/provenance acceptance requirements.

These are descriptive counts, not independent randomized samples or estimates of
model quality. Recovery timing, task difficulty, first versus later round,
available context, route, prompt/cache state, and sampling vary together. The new
policy exposes the existing fallback more often, but the current evidence cannot
assign all three failures to one model change.

The per-turn grouping and its method are retained in
[analysis-route-comparison.json](../../../output/agentic-gate/task90-acceptance-20260914T013318Z/analysis-route-comparison.json).
It groups by the last successful non-reviewer request's model and grades only
behavior/quality, not elapsed time.

### 3. Where did Case 9 lose the content, and why was success overstated?

The fallback request included the original source and explicit instructions to
preserve exact text, including embedded instructions as data. The omission appeared
in the actor's tool arguments, before the write. No mutation-review pass was
captured for this create. Whether this create path should invoke review requires
examining its intended authorization policy; missing review is not automatically
a defect.

Final synthesis received `content_length: 174` and a preview containing the entire
174-character saved content. It nevertheless asserted preservation of the missing
block. Thus source preservation and truthful confirmation are two distinct
failure boundaries. The evidence does not support blaming a truncated preview or
storage sanitization for this particular failure. The hostile instructions did
not change the budget or tasks.

### 4. What checks could actually improve Cases 10 and 14?

For Case 10 the correct buffered exclusion interval is **09:45–11:15**. The
calendar response supplied the necessary times and complete source coverage.
There is a demonstrated arithmetic/constraint failure in the generated answer.
Validating structured intervals is feasible; reliably extracting every intended
slot and constraint from arbitrary prose is a different, harder problem.

For Case 14, the evidence was adequate for a bounded statement about recorded
progress. The response lost that qualification during summarization. More reads
cannot establish whether unrecorded real-world work occurred. A grounding check
must preserve that distinction across the whole answer, not merely require one
disclaimer or ban one phrase.

## Candidate approaches, with tradeoffs

These are alternatives to evaluate, not a selected implementation plan.

| Approach                                                                                           | Why consider it                                                                    | Cost or uncertainty                                                                                         | Discriminating evidence                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Adjust or temporarily disable only the progress heuristic in a diagnostic variant                  | Tests whether premature recovery is adding latency and exposing avoidable fallback | May restore very long acting passes; cannot be assumed safe for acceptance                                  | Controlled fresh-fixture comparisons of elapsed time, output quality, abort rate, and cost; separate first output from sustained output |
| Recover on another provider without immediately demoting the model                                 | A provider's slow response need not mean model failure                             | Another route may be equally slow or unavailable; bounded retry can still miss the ceiling                  | Offline routing invariants plus matched diagnostic comparisons; retain the retry and cost cap                                           |
| Change fallback selection or reasoning/prompt policy                                               | Could preserve answer quality when recovery is necessary                           | Changes latency, cost, and behavior; passing counterexamples rule out a simple universal explanation        | Compare the same minimal fresh cases across explicitly recorded variants                                                                |
| Preserve an explicitly identified source span directly, or validate its hash at the write boundary | Makes exact-copy fidelity independent of generative copying                        | Must reliably identify the commissioned source and distinguish exact storage from requested editing/summary | Local tests for delimiters, Unicode, quoted instructions, allowed formatting, and partial edits; reject ambiguous boundaries            |
| Route more creates through semantic review                                                         | May catch an omitted requirement before storage                                    | Adds calls and latency; a reviewer can miss the same error                                                  | Inspect existing create fast path and replay the held batch locally; evaluate reviewer coverage before expanding it                     |
| Compute/validate structured availability slots                                                     | Interval arithmetic and all-day overlap can be checked exactly                     | Requires a real structured contract and coverage semantics, not regex extraction from prose                 | Focused timezone, all-day, partial-coverage, buffer-boundary, and overlapping-slot cases                                                |
| Tighten evidence-to-answer synthesis or add a targeted faithfulness check                          | Addresses false confirmations and loss of uncertainty in the answer                | More prompt text may be ignored; another model adds cost and another failure mode                           | Compare held evidence with claims; vary structure and wording beyond the three failed samples                                           |

## Before selecting changes

1. Finish the independent raw-evidence review, including counterexamples and the
   intended execution/review boundaries. Explicitly record disagreement with this
   brief or the earlier receipt.
2. Separate deterministic defects in control flow or measurement from stochastic
   answer failures. An offline replay can validate transformations and guard
   behavior; it cannot tell us what an aborted model would eventually have said.
3. Agree on the smallest experiments that distinguish the leading explanations.
   Any future live experiment should use fresh isolated fixtures, cheap models,
   fixed source provenance, and an explicit cost/sample bound. No retained private
   prompts were replayed externally for this analysis.
4. Choose changes based on that evidence, then use focused tests and the strict
   acceptance gate at the appropriate stage. The 392 focused tests establish their
   tested control-flow invariants; they did not establish this heuristic's live
   benefit or prevent these semantic errors.

No source/test changes, services, live probes, or new gate were started for this
investigation. The prior raw receipts and rollback lane remain intact.

## Independent review completed

The [fresh-context report](CHAT_WORKFLOW_TASK90_INDEPENDENT_ANALYSIS_2026-09-14.md)
confirms the four failures independently and agrees that routing alone is not an
established explanation. It adds several distinctions that matter before fixes:

- The simple-create policy deliberately skips independent review when operation
  shape and target resolution qualify. Its checks do not establish exact-source
  fidelity. Expanding review and introducing source-bound copying are different
  remedies with different latency and correctness tradeoffs.
- Cases 10 and 14 emit the bad answer from ordinary acting passes. A check attached
  only to the dedicated `final_response` role would miss these failures.
- Case 10's four reported tool calls represent three distinct proposed/receipted
  calls. One call was delivered twice under different event sequence IDs. The
  collector explains the inflated count; the origin of the differently numbered
  duplicate events remains an open investigation. This does not explain the
  calendar arithmetic error.
- Actual provider requests use throughput sorting even though the gate summary
  shows a null routing override. Provider request bodies, not that summary field
  alone, must drive any comparison of routing policies.

The independent report evaluates seven remedy families and recommends first
validating measurement/recovery semantics, then using isolated quality experiments
and narrow checks with independently derived ground truth. It specifically warns
that hashing the actor's rewritten content does not prove fidelity to the original,
and that banning one phrase cannot enforce groundedness generally. No implementation
choice has been made from these reports.
