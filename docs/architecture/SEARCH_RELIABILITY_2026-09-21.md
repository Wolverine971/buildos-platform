<!-- docs/architecture/SEARCH_RELIABILITY_2026-09-21.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-21; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Bounded semantic search — September 21, 2026

Optional semantic recall must not consume an entire read deadline or continue
dispatching database requests after the turn has stopped. This change bounds the
embedding and vector lookup together to five seconds. A degraded semantic channel
returns the required keyword results with explicit partial-coverage metadata.

## Evidence and scope

The earlier v3 gate retained a `search_project` failure on turn
`13fbdd4d-3960-4799-a2d4-a2362538c1eb`, searching for
`construction completed inspection walkthrough`. Its outer read failed after
30.003 seconds. A semantic RPC began at `2026-09-21T15:16:48.126Z`, after that
deadline, and took another 15.022 seconds. Other semantic lookups nearby completed
in roughly 1.3–1.6 seconds. The source-unverified run is diagnostic evidence, not a
release pass or a controlled performance comparison.

The code confirmed two independent causes: shared reads never received the
worker's deadline signal, and optional semantic search had neither a deadline nor
cancellation. Embedding retries and response-body reads also ignored cancellation.
This fixes those paths for targeted ontology search. It does not claim every shared
read now cancels its database requests, or that provider startup and persistence
latency have been solved.

## Behavior

- `search_project`, `search_all_projects`, and `search_ontology` allow five seconds
  total for embedding plus vector lookup, after their authorization checks.
- Healthy hybrid ranking, similarity thresholds, result limits, and access checks
  remain the same. `explore_project` retains its existing strict error behavior.
- Semantic timeout/error preserves lexical results. `search_coverage` distinguishes
  `complete`, `timed_out`, `unavailable`, `not_configured`, and `not_requested`
  semantic channels. The message states that missing matches do not establish
  absence when semantic recall was unavailable.
- Host cancellation and the outer read deadline still reject the read. Lexical
  failures and authorization failures remain fatal. Required-branch failure
  cancels the optional work too.
- Web and worker embedding ports forward `AbortSignal` through fetch, response
  consumption, and retry backoff. Aborted work does not retry or start later
  batches. An embedding port that ignores cancellation cannot dispatch a late
  vector read when it eventually resolves.
- The vector RPC uses Supabase's supported
  [abortSignal modifier](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal).
  Cancelling HTTP is not a guarantee that an already-running database statement
  immediately stops on the server.

Five seconds is an initial latency/recall policy, not a calibrated universal
threshold. Its tradeoff is explicit: slow semantic-only matches can be omitted,
with partial coverage reported. The gate's 30/40/60-second thresholds were not
relaxed. Five seconds is a channel budget, not a bound on the complete turn or on
authorization and required keyword reads.

## Validation

The eleven-file implementation was developed from a frozen worktree snapshot at
`85f6c5a91172222e946bb00b91b52a3444c96c74`; its executable-tree hash is
`f8e64cdf4e03add9467a1994a5373fda78c832b8ee7e5ae582225481ebd38463`.
Only those eleven file changes were copied back, after checking each workspace file
against its original bytes. Concurrent changes and staging were preserved.

- 133 focused tests passed: 14 embedding-client, 25 shared search/exploration,
  43 worker tool-adapter, eight web search/access, and 43 prompt-compaction tests.
- Worker and shared-runtime typechecks passed; serial dependency builds passed.
- Tests cover hung embeddings, a real Supabase builder with an aborted fetch,
  a shared embedding/vector budget, parent cancellation, forbidden late RPCs,
  retry/body/batch cancellation, required-branch failure, and authorization.
- A wall-clock replay with synthetic keyword data and an injected hung embedding
  transport settled in **5,008 ms**, aborted the fetch signal, retained the keyword
  result, and made no vector request after the delayed response resolved.
  [Replay data](../research/specialist-quality-2026-09-21/search-timeout-replay.json),
  [reproduction script](../research/specialist-quality-2026-09-21/search-timeout-replay.mts)
  and [interactive budget model](../research/specialist-quality-2026-09-21/search-reliability.html)
  explicitly distinguish fault injection from live measurements.

The first gate attempt was intentionally interrupted after 19 captured turns when
inspection found that prompt compaction discarded structured coverage (the prose
warning survived). Its evidence is retained as incomplete under
`output/agentic-gate/search-reliability-2026-09-21/interrupted-run.json`.
Coverage is now a bounded, protected field in model payloads, with regression tests
for all three search tools and oversized results. The final replay also verifies
that the `timed_out` field reaches the model payload.

The corrected full three-repetition gate **failed**, with **48/52**, 44 of 45 turns
passing, zero evidence-capture errors, and verified web/worker/final-tree provenance.
It ran from `20:26:23Z` to `20:51:40Z`. Results are retained at
`output/agentic-gate/search-reliability-final-2026-09-21/`.
[Compact scorecard and diagnostics](../research/specialist-quality-2026-09-21/search-reliability-gate.json).
No production flags, deployment, schema, or routing policy changed.

The first task-batch repetition already exceeded its 60-second limit at 70.140
seconds, despite all requested writes and dependencies passing their checks. It
made no search calls. Two failed provider attempts took 8.837 and 5.016 seconds;
the reviewer required removal of unrequested `type_key` classifications, causing
a repair and re-review; the later dependency review took 8.517 seconds. These
durations are not a disjoint decomposition of wall time. The complete trace is
retained at `output/search-reliability-2026-09-21/task-batch-timing-diagnostic.json`.

Grounded-status repetition 1 also failed, after 49.393 seconds. Its first four
parallel calls hit the executor's ten-second ownership-check deadline before
reaching the read tools. The fifth call, listing documents, eventually succeeded.
Same-turn `claim_agentic_chat_turn` RPCs returned HTTP 500 after approximately
46 seconds; prompt-snapshot persistence timed out at 15 seconds and other
persistence requests slowed too. These traces identify the failing stage, not the
underlying database lock/load cause. No semantic lookup ran in that failed
repetition. It must not be described as fixed by this search change.

The other grounded-status repetitions passed in **19.353** and **12.632 seconds**.
They executed six real searches in **719–1,147 ms**, all with complete lexical
and semantic coverage. Both subsequent model requests contained `search_coverage`.
No semantic deadline fired in the live gate; timeout behavior is verified by the
fault-injection tests and replay, not claimed from these healthy live calls.
All task writes and dependency links, narrow edits and follow-ups, document edits,
hostile-source cases, live calendar reads, DST checks and cold retrieval cases
passed their behavior assertions. The task-batch latency violation still counts.

The next reliability work should investigate same-turn ownership/prompt-snapshot
contention and cancellation without weakening generation fences. Separately,
align the task tool's optional work-type guidance with review policy: the schema
says to omit `type_key` when unsure, while this reviewer rejected confident but
unrequested classifications. Preserve the failed baseline before testing either
change. The rollback lane and default-off specialist rollout stay in place.

An abandoned turn from an earlier QA gate had no worker, over an hour without
progress, no effects, and no reserved/irreversible boundary. Its complete evidence
was saved under `output/search-reliability-2026-09-21/`; the fenced finalization and
recovery APIs marked it failed and reconciled its queue before this run.
