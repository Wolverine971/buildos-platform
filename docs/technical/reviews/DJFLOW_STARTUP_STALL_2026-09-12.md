<!-- docs/technical/reviews/DJFLOW_STARTUP_STALL_2026-09-12.md -->

# Workflow lab startup stall

Status: transport patch implemented; focused regression reproduced the failure
against the installed Supabase SDK and now passes. The full gate completed with
broader failures. The browser replay progressed and finished with an explicitly
partial review after one specialist exhausted its response allowance.

## Observed failure

The user's review in session `2560c876-99bb-4373-bc58-39aa1ebe987f`, turn
`c2762391-d870-4e41-8a96-d2a84499a02e`, was admitted at 23:32:40 UTC and started
execution about one second later. Only the initial `turn_phase` event persisted.
It failed at 23:37:42 with `provider_budget_exhausted`, after the five-minute
execution budget. The saved turn recorded zero model passes and zero tool calls.
The browser showed “BuildOS is thinking” while its reconciliation requests kept
succeeding. This was a worker delivery stall, not slow model generation.

## Cause and change

The executor intentionally starts a best-effort reconciliation hint concurrently
with the first durable lifecycle event. The broadcast adapter cached a channel
only after subscription completed. Both publications could therefore subscribe
to the same topic while the first subscription was still joining.

The installed `@supabase/realtime-js` 2.89.0 client returns the existing channel
for a duplicate topic. Its `subscribe()` only registers the callback when the
channel is closed. A second call while joining silently returns without registering
the second callback. The adapter's second promise never settled, blocking the
durable publisher before context loading or model invocation. Healthy queue polls
and a connected first subscription concealed this from the existing health check.

The adapter now shares an in-flight subscription promise per topic. It also owns
a deadline for the callback wait, ignores success arriving after that deadline,
cleans failed pending entries so the next publication can reconnect, and prevents
an opening channel from being cached after shutdown. Persist-before-broadcast,
exact-sequence acknowledgement, and reconciliation rules are unchanged.

## Validation

- A regression using the installed SDK's real channel lookup and subscription
  behavior, with socket transport stubbed, failed before the patch: two calls to
  `subscribe()`, with the second publication stranded.
- All 22 publisher/adapter tests pass after the patch, including concurrent startup,
  a missing callback, late success, retry, close during setup, and synchronous throw.
- The workflow and executor suites passed another 107 tests, for 129 focused
  tests total. Worker typecheck passed.
- The complete gate ran all 45 turns with matching web/worker provenance and no
  startup hang, but **failed at 44/52**. Its remaining failures were an incomplete
  mutation review before saving task dependencies, model-authored `&amp;` replacing
  a requested literal `&`, and status-report quality/latency/read-count failures.
  The last report's judge rejected an unbounded "No evidence that work has begun"
  claim. The first status report took 50.0s and 11 reads against 40s/eight reads.
  The three document edits passed at 23.1s, 25.7s, and 26.3s. This is not a passing
  release gate and does not prove these timings will hold on subsequent runs.
- Gate provenance: commit `c324762250e8c9546d63cf1dada4b6c885d36974`, dirty-tree
  SHA-256 `cefa157a84de53f399f1e0d95d5c5ba58fc01bdd062a008939de49c7a5be5454`.
  [Retained scorecard](../../../output/agentic-gate/djflow-subscription-race-2026-09-12/scorecard.json).
- Replayed the exact question on the same project through the user's Chrome tab.
  The browser visibly showed context/planning completion, both specialists running,
  and answer text arriving while synthesis was still marked running. It ended at
  **Partial review ready**, with the Stop button removed. The analyst and synthesis
  completed; the risk reviewer reached its response limit. This is a verified end
  to the startup stall, not a successful two-specialist review.

## Browser replay evidence and limits

New turn `594561f2-85f2-4552-8d9a-96c6f0a3fc41`, session
`a90b8a62-25fc-4ed8-aae9-daff70f98e7c`, used the same project and question.
The Start click was observed at 00:05:16.585 UTC on September 13 (September 12 local).
Admission occurred at 00:05:20.392; the first durable event at 00:05:21.470; context
work began at 00:05:22.413; first answer text persisted at 00:05:49.819; terminal
truth committed at 00:05:54.851. That is 34.46 seconds after admission, or about
38.27 seconds after the observed click. These are backend milestones relative to
a browser click, not a newly instrumented client time-to-first-token benchmark.

The final answer was saved as assistant message `280d1249-cc7c-42bb-81a5-7ad65580ec5b`.
No domain tools ran. [Replay evidence](../../../output/workflow-startup-stall-2026-09-12/browser-replay.json)
preserves the final step states and timings. The worker matched current source;
only the build-list Markdown differs from the gate checkout, as recorded in
`gate-source-differences.json` beside the replay evidence.

Two follow-ups surfaced in this real browser path:

- The reviewer exhausted its response allowance. Preserve the partial result;
  improve bounded report sizing and per-step recovery rather than rerunning until
  a convenient full result appears.
- Prewarmed workflow prompt-snapshot persistence logged
  `agentic_chat_prompt_snapshot_invalid_runtime_augmentation`. This did not block
  execution, but its diagnostic snapshot contract still needs correction. The
  failure is retained in the post-fix worker log.

Failure evidence will remain in `output/workflow-startup-stall-2026-09-12`.
The original user review remains failed; a successful new review must not rewrite
that history or imply that the original produced an answer.

## Remaining architecture concern

This failure also exposed a coupling: the executor awaits lifecycle publication,
and publication awaits subscription, broadcast, and delivery acknowledgement.
Even a saved startup event can therefore block model work on client delivery.
The patch removes the reproduced indefinite wait, but does not redesign that
boundary. A later latency change should separate confirmed durable persistence
from live delivery without losing ordered events, acknowledgement uncertainty,
or terminal drain. Worker health should also distinguish fresh queue polling from
individual turns that have made no progress. These are follow-up changes, not
claims about this patch.
