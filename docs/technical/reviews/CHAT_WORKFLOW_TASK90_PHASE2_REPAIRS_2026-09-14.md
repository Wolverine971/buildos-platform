<!-- docs/technical/reviews/CHAT_WORKFLOW_TASK90_PHASE2_REPAIRS_2026-09-14.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-18; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Task 90 — repairs after independent analysis

The [independent analysis](CHAT_WORKFLOW_TASK90_INDEPENDENT_ANALYSIS_2026-09-14.md)
was reviewed before selecting these changes. This phase fixes two reproduced
control/measurement defects, adds a measured mitigation for source omission, and
adjusts the last retry's header deadline after the first focused run exposed two
recovery failures.
It does not establish the cause of every stochastic answer failure or claim full
release acceptance. No provider exclusion or visible-progress threshold changed.

**Current result:** 371 distinct focused worker tests pass, with source/test types
and changed-runtime lint passing. The final live diagnostic passed all 12 selected
turns across Cases 8/9/14; Case 10 passed all three repetitions in the preceding
diagnostic. Manual inspection still found an unsupported revision-history claim
that the status judge scored 5/5. No full battery was rerun.

**Closeout decision:** DJ closed Task 90 on September 14 to move on, explicitly
deferring calendar work. Grounding follow-up remains under Tasker 82 and acceptance
under 89. The [closeout record](CHAT_WORKFLOW_TASK90_CLOSEOUT_2026-09-14.md) preserves
the handoff history and residual ownership; closure does not change these results.

## Changes and evidence

### Reconciliation must use the same event identity as live delivery

The executor previously predicted the next semantic sequence as the last durable
sequence plus one. Text persistence is asynchronous, so a queued text batch can
already be ahead of that semantic event. The publisher's eventual receipt then
has a different sequence from the one embedded in the saved UI projection.
Reconciliation can deliver the same logical tool call again under that other ID.

A regression with deliberately delayed text persistence reproduced projected
sequence **4** versus live sequence **5**. The executor now reserves past pending
persistence operations as well as committed sequences. Delivery-only backlog is
excluded because those events already consumed their durable sequences. Snapshot
and semantic enqueue remain synchronous within the serialized publication task.
The tool still cannot execute before durable acceptance.

This mechanism explains how the distinct IDs observed for the same Case 10 call
can arise. The historical log does not retrospectively expose every queue state.
It is not evidence that the original tool executed twice. Raw event collection
was left intact; the defect was not hidden by deduplicating the scorecard.

### Dated V4.1 names must follow the same recovery policy

The progress guard matched only `deepseek/deepseek-v4.1-flash`. OpenRouter can
report `deepseek/deepseek-v4.1-flash-20260910` in either headers or an SSE frame.
Both paths bypassed the existing guard in the new controlled tests.

The guard now recognizes the canonical name and its eight-digit deployment
suffix, both when starting and when checking the timer. V4, dated V4, and unrelated
suffixes remain excluded. The four-second window, byte floor, retry allowance,
budget protection, and cancellation behavior are unchanged.

This fixes inconsistent policy application, not the policy's unproven
counterfactual benefit. More dated responses are now eligible for recovery;
focused unit tests alone cannot establish a latency or quality improvement.

### Explicit source preservation requires a content review

The existing simple-write route proves operation shape and target resolution;
it does not prove that a new document preserves commissioned source text.
The existing mutation reviewer already compares exact document content with the
original user message, and its approval is bound to the actual held arguments.

Before changing routing, a small live experiment used freshly authored fictional
sources, the real review-request builder, the existing OpenRouter client, and
Luna with low reasoning. It included hostile and benign embedded tags, Unicode,
a literal HTML entity, omitted interior text, and model-authored encoding.
Two repetitions of six valid fixtures produced **12/12 correct decisions**:
six exact copies approved with matching batch digests, and six malformed copies
returned for revision. Calls took **2.541–4.380 seconds** and cost about **$0.00491**.
No database data, retained project prompts, or mutations were involved.

The first experiment had accidentally omitted the schema-required document
description. All twelve proposals were therefore invalid and were rejected;
those receipts are preserved under `invalid-fixture-*` and excluded from the
12/12 result. Correcting the fixture, rather than counting those rejections as
source-fidelity evidence, was necessary to measure false rejection of good copies.

Document creates and updates with explicit English source-preservation
cues now use the existing independent review. Ordinary composition keeps its
direct route. A provider integration regression proves that an omitted source
proposal never emits a mutation, the reviewer sees the original source, the
corrected proposal is reviewed again, and only its approved arguments execute.

This is a conservative routing mitigation, not universal byte-preservation
enforcement. It can miss paraphrases or other languages, can request an unnecessary
review, and a reviewer can still make mistakes. It adds review latency to matching
creates. It neither guesses source boundaries nor treats a hash of model-authored
content as independent truth. A source-reference transfer would be a separate,
larger contract requiring authenticated original spans and explicit boundaries.

## Focused validation

Evidence directory: `output/task90-repairs-phase2-2026-09-14/`.

- `reproduction.log`: the event-identity regression and both dated-name regressions
  failed before their fixes; the other 108 tests passed.
- `reproduction-source-route.log`: five source-preservation routing cases failed
  before the routing change; 27 other cases passed.
- `focused-worker.log`: **286 tests passed** across the four directly affected
  worker files. Includes ordinary writes, SHA binding, held-batch correction,
  durable execution fences, backlog behavior, and bounded recovery.
- `focused-source-final.log`: **173 tests passed** after closing an additional
  bypass where an exact-source create omitted the entire optional `content`
  argument. Across these runs, **287 distinct focused tests** passed.
- `worker-types.log`, `worker-test-types.log`, `changed-runtime-lint.log`: worker
  source types, test types (zero errors), and changed-runtime lint passed.
- `source-review-probe.mts`, `source-review-inputs.json`,
  `source-review-results.json`, `source-review-summary.json`: reproducible synthetic
  experiment and individual decisions. The script requires explicit `--run` for
  model calls; without it, it only builds the fictional requests.

The user's focused-testing scope is retained. The live diagnostic selects only
Cases **8, 9, 10, and 14**, with three repetitions and no automatic scenario reruns.
It uses the existing gate runner's diagnostic selection, not the full battery.
The bootstrap oracles and dependency builds remain necessary for verified startup.

Snapshot: `/private/tmp/buildos-task90-focused-20260914T153248Z`.
Evidence: `output/agentic-gate/task90-focused-20260914T153248Z/`.
Git: `199a6ba44c8688c181654e2b159cb41a7cfabfbc`; all 8,295 copied files matched at
snapshot creation. The isolated QA queue was empty; calendar metadata and credit
headroom passed preflight. The first calendar metadata check had a transient fetch
failure; the one retry succeeded. Services run under `caffeinate` on AC power.

**First live diagnostic: failed, 12/14 recorded turns passed.** Case 9 repetition
3's failed create prevented its follow-up, leaving 14/15 expected turns. The
worst-repetition case score is **8/16**, not a full-battery score. Web/worker startup
provenance and the final snapshot check match executable hash
`a12ace5994ece5f669084b2475706f7ed2250976292f7fdc39b8cd884b851289`.
The runner finished at 15:40:55 UTC and stopped its services.

| Case              | Repetition 1                    | Repetition 2                       | Repetition 3                                     |
| ----------------- | ------------------------------- | ---------------------------------- | ------------------------------------------------ |
| 8, document edit  | Pass, 22.686s                   | Pass, 28.423s                      | Pass, 22.065s                                    |
| 9, source capture | Pass, 17.767s; follow-up passes | Pass, 17.116s; follow-up passes    | Provider failure, 15.469s; follow-up not reached |
| 10, calendar      | Pass, 35.410s                   | Pass, 14.226s                      | Pass, 33.595s                                    |
| 14, status        | Pass, 12.138s, 4 calls          | Provider failure, 15.207s, 0 calls | Pass, 15.272s, 4 calls                           |

All completed calendar judgments scored 5/5. Neither surviving status answer
reproduced the unsupported actual-start conclusion. That is passing evidence,
not proof that the old calendar and grounding failure modes are eliminated.
No duplicate tool-call IDs or evidence-capture errors appeared in the 14 turns.
All Case 8 attempts succeeded without recovery, so these latency passes do not
demonstrate that aborting a slow response is beneficial.

The run made 39 physical model attempts: 32 successes, five local progress aborts,
and two header timeouts. The two failed turns both lost their initial acting pass
to a progress abort and then lost the last retry before headers arrived:

- Case 9 r3, `863c8e8c-b5f7-4ee1-a7de-26a73b5c1008`: Venice V4.1 ran 6.470s,
  including 2.459s before headers and four seconds of observed progress. It emitted
  159 argument bytes across 42 normalized events; the JSON proposal was incomplete.
  V4 fallback then timed out without headers after 5.016s. No review or write ran.
- Case 14 r2, `78841345-8300-428f-a4cb-ff6650c0df13`: Venice V4.1 ran 5.499s before
  the progress abort. V4 fallback timed out without headers after 5.013s. No read,
  answer, or quality judgment was reached.

The requested fallback endpoint is unknown when no response headers arrive.
These failures cannot be attributed to Wafer, nor can the cancelled original
completions be reconstructed. Classification and physical-attempt references are
in the run's `focused-classification.json`; the Case 9 byte accounting is in
`case9-recovery-failure.json`.

The live snapshot includes the original source-review rule for proposals carrying
content. During the run, code review found that a proposal omitting the whole
content argument also needs review. The final local rule includes that case;
`after-snapshot-source-guard.patch` records the exact difference and the focused
source tests above cover it. The running snapshot was not modified or restarted.
Its live receipt must not be presented as a test of that final additional branch.

## Follow-up repair: give the final retry a bounded connection window

The first cutoff has another attempt behind it; the last cutoff terminates the
turn. Applying the same five-second header window to both spent the last chance
while substantial turn budget remained. The selected mitigation keeps five seconds
for the first attempt and uses a default ten-second header window for the atomic
buffer's final existing attempt. An explicit internal flag identifies that attempt;
it is not inferred from a model name or a global retry ordinal. The configured
attempt timeout and the remaining turn budget, including finalization reserve,
still cap it. A larger explicitly configured header window is not shortened.

This adds no attempt, concurrent request, model, provider exclusion, or extra
progress hedge. It can add up to five seconds to the default final header wait.
It does not prove either failed fallback would have returned by ten seconds.

Controlled tests first failed with the old policy, then demonstrated that:

- A fallback opening after 6.5 seconds completes, while the first stream still
  receives its four-second progress cutoff.
- An unresponsive final attempt stops at ten seconds without a third dispatch.
- A turn with less available time shortens that window to six seconds, preserving
  the existing five-second finalization reserve.

`focused-final-retry.log` records **242 passing tests** across recovery, the real
OpenRouter client, and provider orchestration. Combined with the unchanged executor
and final source-routing checks, **371 distinct focused worker tests passed**.
Worker source/test types and changed-runtime lint are recorded in the `*-final.log`
files. The initial red probes are retained in `reproduction-final-retry.log`.

A new fixed snapshot includes both the header change and the missing-content
source guard: `/private/tmp/buildos-task90-focused-20260914T154345Z` (8,296 copied
files, no mismatches). Its fresh diagnostic checks only Cases **8, 9, and 14**,
three repetitions: the two new failures plus the latency-sensitive document edit.
Case 10 is not repeated. Evidence is in
`output/agentic-gate/task90-focused-20260914T154345Z/`.

**Follow-up diagnostic result: all 12/12 expected turns passed the existing checks.**
The selected-case score is **12/12 (A)**. Startup web/worker and final snapshot
provenance match executable hash
`345c942a131e724f249474dd60f8fbadc25679bd73306bcfa1018ef7fe6afb9a`.
The runner finished at **15:51:07 UTC** and stopped its services. Its exit code is
1 and `gate.json` remains `failed` solely because diagnostic mode and the omitted
full 13-case battery cannot satisfy release policy. This is passing focused
evidence, not full release acceptance.

| Case              | Repetition 1                     | Repetition 2                                       | Repetition 3                     |
| ----------------- | -------------------------------- | -------------------------------------------------- | -------------------------------- |
| 8, document edit  | Pass, 23.830s                    | Pass, 23.955s                                      | Pass, 18.328s                    |
| 9, source capture | Pass, 26.323s; follow-up 10.185s | Pass, 33.448s; follow-up 16.655s                   | Pass, 33.210s; follow-up 17.482s |
| 14, status        | Judge pass, 13.076s, 4 calls     | Judge pass, 17.991s, 5 calls; manual concern below | Judge pass, 18.225s, 5 calls     |

All 42 physical model attempts are accounted for: 39 successes and three local
progress aborts, each followed by a successful fallback. No duplicate tool-call
IDs or evidence-capture errors appeared. The three fallbacks opened headers after
1.194s, 1.028s, and 0.778s, so this live sample did **not** exercise the additional
five-second connection allowance. Only the controlled 6.5-second-header regression
proves that boundary changed. There were again no recoveries in Case 8. The green
run therefore cannot establish that either recovery-policy change improved latency
or rescued the two earlier header failures.

The follow-up exercised the original source-loss failure and the new
review barrier in the same turn. Case 9 r2, `1393a6d1-3adc-47a1-aee8-28cd6d2ff5ec`,
proposed a 272-character V4 document that omitted the quoted block and changed the
wording. Luna rejected that held proposal. The acting repair then proposed the
original 339-character source; the second review approved it, and the saved result
matched the original source exactly. `source-fidelity-correction.json` independently
compares the raw proposals and saved receipt with the fixture's original message
span; it does not rely only on the reviewer's explanation or a model-authored hash.

### Manual review found a grounding issue that the judge missed

Case 14 r2, turn `93390441-8559-4ee9-999a-f2ae569eac11`, said:

> Change log shows only "2026-09-03: Initial draft," so it has not been revised since.

The first clause is supported by the read document. The second treats a sparse
change log as a complete revision history. No complete audited history was
observed. This repeats a qualification failure identified by the independent
analysis, even though construction, permit, and payment uncertainty were handled
correctly in this answer. Repetitions 1 and 3 instead used the supported statement
"No later revisions [are] recorded."

The judge gave repetition 2 **5/5**. Its rubric supplies the change log and a general
accuracy requirement, but the explicit score-1 examples focus on construction,
permits, payments, and invented marketing text. The captured result establishes a
missed overclaim; it does not prove whether rubric specificity or judge variability
caused the miss. The raw judge and scorecard are unchanged. The separate
`manual-grounding-review.json` records this finding and the exact turn, so a green
formal score cannot erase it.

## Transferred follow-ups and limits

These findings are retained after Task 90's closure. Calendar work is deferred;
the other follow-ups belong to 82/84/89 rather than an active Task 90.

- **Case 8:** policy consistency is repaired; the retained 34.521-second miss does
  not prove that aborting the original response helped. Evaluate the new physical
  attempt chain rather than subtracting cancelled time or selecting providers from
  a confounded quality comparison.
- **Case 9:** the new review path rejected a real omission and saved the corrected
  source in the fresh fixture. Source omission and false final confirmation remain
  distinct boundaries; the latter has no new general prose validator in this phase.
- **Case 10:** interval arithmetic still needs a structured calculation and a
  faithful output path. An additional source audit found the ontology event query
  filters `start_at` into the requested range, potentially missing an event that
  started earlier and still overlaps it. This did **not** cause the retained
  failure, whose busy interval was present. Before computing availability, tests
  must cover overlap reads, buffer-expanded query boundaries, all-day/timezone
  normalization, source failures, and truncated pages. No calendar query or
  calculator was changed in this phase.
- **Case 14:** the current prompt already explicitly requires unknown actual status
  and consistent qualification in conclusions. More wording is not an established
  fix. First calibrate the judge against qualified and unqualified revision-history
  conclusions, including complete history and explicit revision evidence as positive
  controls. Then compare concise evidence-qualified synthesis against the current
  prompt on synthetic positive, negative, missing, stale, and partial evidence.
  Both ordinary acting answers and forced final responses must be covered. No
  arbitrary phrase ban or final-response-only reviewer was added.

The previous complete failed gate, independent report, and rollback lane are
preserved. A final byte comparison confirms that all five changed runtime files
and four changed test files match the final live snapshot; see
`output/task90-repairs-phase2-2026-09-14/final-source-comparison.json`.
These repairs have not been committed or deployed.
