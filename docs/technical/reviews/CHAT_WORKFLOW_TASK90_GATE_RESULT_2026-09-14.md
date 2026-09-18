<!-- docs/technical/reviews/CHAT_WORKFLOW_TASK90_GATE_RESULT_2026-09-14.md -->

# Task 90 — isolated gate result, 2026-09-14

**Investigation update:** DJ requested a separate failure write-up and independent
fresh-context analysis before choosing fixes. See the
[failure brief and open questions](CHAT_WORKFLOW_TASK90_FAILURE_BRIEF_2026-09-14.md).
The observations below remain the gate receipt; the earlier preference for fixing
routing first is a hypothesis under review, not an agreed implementation plan.

**Failed acceptance: 45/52.** DJ authorized one full gate after the
[392 passing focused tests](CHAT_WORKFLOW_TASK90_FOCUSED_REPAIRS_2026-09-14.md).
The strict three-repetition run finished without interruption; 44 of 45 expected
turns were recorded. Case 9 repetition 2 stopped after its first-turn assertion
failed, so its follow-up did not run. Of the recorded turns, 41 passed behavior
and quality, one failed behavior, and two failed quality. One behavior-passing
turn also exceeded its latency limit. Tasks 82/84 and Task 90 acceptance remain open.

## Evidence and isolation

- [Gate receipt](../../../output/agentic-gate/task90-acceptance-20260914T013318Z/gate.json),
  [scorecard](../../../output/agentic-gate/task90-acceptance-20260914T013318Z/scorecard.json),
  [classification](../../../output/agentic-gate/task90-acceptance-20260914T013318Z/classification.json),
  and [latency analysis](../../../output/agentic-gate/task90-acceptance-20260914T013318Z/latency-analysis.json).
- Execution: **01:35:37–01:57:13 UTC on September 14**. All 13 cases were attempted
  three times. The runner retained 125 provider captures and reported zero turn
  capture errors. Original failed gates remain intact.
- Independent snapshot: `/private/tmp/buildos-task90-gate-20260914T013318Z`.
  It includes the uncommitted repairs and diagnostics; workspace dependencies
  resolve within that snapshot. No executable source changed during the run.
- Git SHA: `199a6ba44c8688c181654e2b159cb41a7cfabfbc`.
  Executable dirty-tree SHA-256:
  `a4be3fcc7da758200f67f5b48f12ceb8ce067266034108c25d2f7c856d1071d0`.
  Web, worker, scorecard, and final snapshot provenance match.
- Preflight verified isolated QA configuration, a connected dedicated calendar,
  an empty active chat queue, and OpenRouter credit headroom. The host was on AC
  with `caffeinate`. The runner stopped its services; no snapshot web/worker
  process remains and the test-gate slot is released.
- Product receipts total approximately **$0.378**, including 16 estimated failed
  attempt receipts; judge receipts total **$0.084**. These are receipt totals,
  not an independently reconciled invoice. Product calls used V4.1 Flash, V4 Flash,
  and GPT-5.6 Luna; judges used Luna and Kimi K3. No Astra calls occurred.

## Required timing checks

| Case                           |             Rep 1 |             Rep 2 |             Rep 3 | Required                |
| ------------------------------ | ----------------: | ----------------: | ----------------: | ----------------------- |
| 2 — task creation/dependencies |           47.613s |           36.123s |           45.618s | <60s; pass              |
| 4 — update turn                |           18.214s |           23.205s |           14.924s | <30s; pass              |
| 8 — document edit              |           22.574s |           29.572s |       **34.521s** | <30s; fail              |
| 14 — grounded status           | 13.992s / 4 calls | 24.276s / 7 calls | 25.816s / 5 calls | <40s and ≤8 calls; pass |

Case 14's timing pass does not override its repetition-2 quality failure.

## Four remaining failures

**Case 8 repetition 3 — provider recovery is still too slow.** Turn
`d529d5c1-25f6-4fe8-abe6-50699fc15ae5` took 34.521s. Its second acting round spent
3.478s opening the Venice response, then hit the four-second progress limit:
7.486s total for the discarded attempt, request
`gen-1789350431-pbqDrfEfzqJbtVReGL36`. The V4 fallback on Phala then took 6.441s.
The reviewer approved on its first pass in 4.080s; the document tool took 1.967s;
the final Phala response took 3.569s. These are components of the total, not
additional elapsed time. Publisher request attempts peaked at 404ms, usage writes
at 176ms, with no persistence retries, pressure waits, or failed usage writes.
The slow-stream cutoff bounded an attempt but did not provide sufficient total
latency headroom. The counterfactual completion time without abort is unknown.

**Case 9 repetition 2 — quoted source deletion and false confirmation.** Turn
`d5eb468c-4614-4fd4-842f-d07109433b6d` recovered from a 7.010s Venice slow-stream
attempt onto Wafer V4. The successful `create_onto_document` arguments omitted the
embedded quoted block that the user explicitly commissioned for verbatim storage.
The final response then claimed byte-for-byte preservation. The omission was
already in the actor's tool arguments; this was not a database sanitizer removing
correctly supplied content. No mutation reviewer pass was captured for this turn.
Before/after task rows, edges, and events are identical; the project description
and budget are unchanged. The project's document structure and update timestamp
changed to attach the commissioned new document. This is a source-fidelity failure,
not evidence that the embedded instructions executed.

**Case 10 repetition 3 — invalid calendar buffer.** Turn
`df8ad357-acea-4849-9692-852809a31e48` hit the new five-second response-header
timeout, then used Wafer V4. The returned source coverage was complete and included
a 10:00–11:00 busy event. The answer proposed 09:30–10:00 despite the requested
15-minute gap, and its prose also misstated the blocked intervals. The correct
expanded exclusion interval is 09:45–11:15. The judge's **3/5 against 4** is
supported by the captured answer and calendar receipt; calendar setup was valid.

**Case 14 repetition 2 — ungrounded absence claim.** Turn
`638e03cd-60a4-405c-85c4-2cf4e14bcb5e` recovered from a 5.893s Venice slow stream
onto Wafer V4. Its summary said **“No work started”**, although the evidence only
showed no recorded progress. Earlier qualified wording did not cure the later
unqualified claim. The judge's **1/5 against 3** is supported by the answer. It
finished in 24.276s with seven calls, so neither the time nor read budget failed.

## Candidate explanations requiring further analysis

All three content/quality failures occurred after recovery onto V4 Flash. The
15 slow-stream aborts and one response-header timeout exercised the intended
bounded retry, but the inherited routing policy marks a failed model as well as
its provider and then keeps the successful fallback model for subsequent passes.
One candidate is to distinguish provider slowness from model failure and evaluate
recovery on another V4.1 provider before demoting the whole turn. Other candidates
include calibrating the progress heuristic, strengthening exact-source storage,
computing calendar intervals, and improving evidence-to-answer synthesis. The
independent review will assess these before a fix is chosen. Any recovery change
must preserve the retry cap, abort/discard boundary, cancellation, and accounting.
The shared fallback path is an observed association: 13 of 16 V4-ending turns
passed behavior/quality, including other Case 9/10 repetitions. It does not prove
that an un-aborted V4.1 answer would have passed or finished sooner.

Potential focused coverage includes detecting silent omission when exact source
storage is commissioned, validating slot intervals against buffered busy intervals,
and preserving the distinction between no recorded work and no work.
Do not encode Cedar House titles, dates, or phrases as product exceptions. Tests
should cover the fallback path as well as normal execution. Then run a new strict
gate only after the demonstrated defects are addressed; do not repeatedly sample
this unchanged snapshot until it happens to pass.

The live reviewer produced 16 approval decisions, including one successful
`approval_sha_mismatch` format recheck in Case 8 repetition 1. No false scalar
revision occurred, so the new contradiction recheck remains supported by focused
tests rather than a live example. No further runtime edits, tests, gate, commit,
deployment, or rollback-lane removal were performed after this failed gate.
