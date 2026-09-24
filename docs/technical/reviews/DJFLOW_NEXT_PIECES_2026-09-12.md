<!-- docs/technical/reviews/DJFLOW_NEXT_PIECES_2026-09-12.md -->

# Chat workflow: latency and regression work

Status: incremental synthesis passes focused tests and a real queued smoke run.
The subsequent complete regression gate scored 52/52 on behavior and quality but
failed four latency checks. Lightweight admission,
durable step recovery, and the ordinary-chat review control remain on the
[build list](https://github.com/Wolverine971/buildos-platform/blob/f46e9090c774/docs/archive/agentic-chat-djflow/djflow-build-list.md).

## Visible change

The final editor now feeds chunks into the existing bounded text publisher while
it generates the answer. Planner output and specialist drafts remain private until
complete. Accepted specialist findings still appear separately in the progress card.
The final answer step completes only after a successful provider finish. Cancellation,
connection loss, and output exhaustion do not replay visible text or claim completion.

One live streaming run, compared with the retained earlier buffered run:

| Client-observed milestone   | Buffered baseline | Streaming |
| --------------------------- | ----------------: | --------: |
| Submission response headers |             3.49s |     3.38s |
| First server progress       |             4.96s |     5.21s |
| First specialist findings   |            20.74s |    18.91s |
| Synthesis starts            |            24.14s |    24.43s |
| First main answer text      |            33.46s |    27.18s |
| Synthesis completes         |            32.86s |    32.43s |
| Terminal event              |            34.32s |    33.73s |

These are individual observations with different model output, not a controlled
benchmark or an SLA. Streaming exposes the answer about 6.5 seconds before terminal
completion in the new run; it does not remove the planning and specialist work
before synthesis. Submission still performs web preparation.

The smoke verified all five completed stages, both saved reports, no model tool
calls, and unchanged project plus eight domain tables. Its retained project is
`bdeddefe-9863-4eb0-8fb2-b2a741ee18e1`, session
`61c09e5d-698e-421e-a921-5267eeffb1d2`.

Evidence: [current smoke](../../../output/workflow-prototype/smoke.json),
[verification](../../../output/workflow-prototype/verification.json), and
[buffered baseline](../../../output/workflow-prototype-buffered-baseline-2026-09-12/smoke.json).
No authenticated manual browser run was performed for this change set.
The local lab is running at `http://127.0.0.1:5188/workflow-lab`. A subsequent
authenticated HTTP readiness check confirmed QA sign-in, the rendered lab, the
retained demo, and a healthy worker matching current source. Its fingerprint
differs from the gate only because three architecture/build-list/guide Markdown
files changed; the compared executable files are unchanged. See
[readiness](../../../output/workflow-prototype/local-readiness.json) and
[source differences](../../../output/workflow-prototype/gate-source-differences.json).

## Regression findings and fixes

The first full rerun completed 45 turns across three repetitions and scored 48/52.
Its executable provenance matched the web and worker. Preserve
[that failed gate](../../../output/agentic-gate/djflow-next-baseline-2026-09-12/gate.json).

- The original document-edit stall was a provider connection that returned no
  headers for 90 seconds. The client now bounds header wait separately at 10 seconds,
  preserving the overall generation deadline. It cancels a late response even when a
  fetch adapter ignores abort. The rerun's document edits took 26.1, 24.8, and 22.8 seconds.
- The original budget assertion confused unknown actual spend with an absent budget
  cap. A focused subject/predicate check and eleven positive/negative examples repair
  that assertion. The retained false positive is covered.
- One task update took 35.2 seconds because an unnecessary description rewrite
  triggered correction and another independent review. Update-tool guidance now asks
  for the estimate field alone unless prose editing is requested. The existing tool
  already reconciles its generated estimate prefix while preserving other text.
- The calendar judge lacked the returned event intervals and source coverage; its
  transcript contained only assistant text and tool calls. It now receives the actual
  results. A regression test verifies both intervals and failures reach the judge.
- The status report still produced an unsupported "Permits approved: No" despite
  a later unknown-status caveat. The response contract now makes confirmed yes,
  confirmed no, and unknown explicit, including the first word of table entries.
- Another status repetition made ten reads, exceeding the existing eight-call limit.
  Read guidance ties additional retrieval to an unanswered requested fact and stops
  after relevant scoped searches leave the remaining facts unknown.

Thresholds and the independent review policy were not relaxed. The subsequent full
run verified the behavior changes: all calendar checks scored 5/5, estimate edits
used three model passes without correction loops, and status reports used five or
six reads with acceptable unknown-status labels. It still failed timing.

## Validation

The second change set passes 207 focused tests: worker workflow/executor 107,
web prompt/oracle 94, runtime catalog 3, and task estimate reconciliation 3.
Worker typecheck and both changed dependency builds passed. The live workflow smoke
also passed. The earlier provider-client suite passed all 80 tests after the separate
header deadline change.

The [full streaming gate](../../../output/agentic-gate/djflow-streaming-2026-09-12/gate.json)
completed 45 turns across three repetitions in an isolated frozen checkout. Its
52/52 score does **not** mean the gate passed: document edits took 36.5s, 32.2s,
and 30.3s against the unchanged 30s limit; the last status report took 54.4s against
40s. Verified web and worker executable provenance: commit
`c324762250e8c9546d63cf1dada4b6c885d36974`, dirty-tree
SHA-256 `50393e32d7a1765eccb9c5032ef2cbe5159a9a01e911eb1256ff4fdb4d2e9d3e`.
Keep the rollback lane and internal cohort restriction. No production deployment or
database schema change was made.

## Latency diagnostic and next boundary

A subsequent two-case, one-repetition diagnostic on the same executable source
completed the document edit in 23.6s and the status report in 17.6s. It is explicitly
not a release gate and does not erase the full-run failures. The retained
[timing analysis](../../../output/agentic-gate/djflow-timing-profile-2026-09-12/timing-analysis.json)
includes its instrumentation hash, limitations, and request counts; the raw endpoint
timings and preload are alongside it. Instrumentation ran only against the isolated
QA REST host and did not record credentials or request/response content.

The document edit made 63 worker REST calls carrying its turn ID, including 14
semantic writes and 17 delivery acknowledgements. The status report made 75.
These counts exclude calls without the turn ID. Individual request times overlap;
their sum is not wall-clock overhead. The probe measures response-header latency,
not SQL execution alone or the separate Realtime broadcast path.

The publisher currently awaits persist, broadcast, and acknowledgement for each
semantic event. This exposes a concrete optimization candidate, but simply dropping
acknowledgements would break uncertainty handling. Any change needs to preserve
ordered delivery, sticky reconciliation after an uncertain acknowledgement, terminal
drain, and stale-worker fencing. The fast diagnostic did not reproduce the earlier
long gap after mutation review, so its exact cause remains unresolved.

Lightweight admission is a separate versioned-contract change. Current writers use
v3 prepared input, while readers retain v2. The architecture now specifies a v4 raw
request artifact with immutable identity and a separate worker-prepared context
checkpoint; it does not disguise an empty prompt as existing prepared input. That
checkpoint also gives durable step recovery a stable context to reuse. These
contracts and the ordinary-chat review control are planned, not implemented.
