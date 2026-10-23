<!-- docs/research/write-review-reasons-2026-10.md -->

# Faster write turns: routing evidence and implementation

Date: 2026-10-19. Task: [138](../../tasker/138-faster-write-turns.md). Scope: lean items 1–4, authorized after the investigation briefing. Local implementation only; no deployment, production writes, or paid model calls.

## Result

A fulfilled reviewed write can now close with its durable receipt, saving one acting pass. The frozen whole-request expectation must be satisfied, every write must have a successful ledger entry with an entity identity, and the turn must have no domain reads, withheld non-mutation calls, live image request, or required user action. The existing `AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT` flag controls this behavior.

The local provider fixture verifies one acting pass plus one reviewer pass for four approved task creates, versus two acting passes before the fix. The task's historical acting-pass p50 suggests roughly 2.6 seconds saved on eligible turns; this is an expectation, not a measured production improvement. Turns needing a prose answer or more work keep their continuation. Partial reviewed batches retain the existing `mutation_unfulfilled` fallback and cannot render a success receipt.

The direct-write limits are unchanged. Historical evidence cannot establish a qualifying route bucket, and the repeat-review evidence does not justify reusing approvals across batches.

## Read-only production report

The window is 2026-09-19 00:00 through 2026-10-19 00:00 America/New_York, ending exclusively (`2026-09-19T04:00:00Z` to `2026-10-19T04:00:00Z`). It contains nine more harness passes than the earlier task snapshot; the real-user count is unchanged.

| Cohort     | Route reason | Passes | Distinct batch/round keys | Approved | Revise | Refuse | Invalid | Unknown verdict | Approval / known decisions |
| ---------- | ------------ | -----: | ------------------------: | -------: | -----: | -----: | ------: | --------------: | -------------------------: |
| Harness    | unknown      |    224 |                       205 |        2 |      1 |      0 |       0 |             221 |                      66.7% |
| Real users | unknown      |     41 |                        38 |       19 |     15 |      1 |       0 |               6 |                      54.3% |

Approval percentages exclude unknown verdicts. Passes include retries and are not independent batch samples; distinct batch/round keys are a coverage diagnostic, not an eligibility sample count. No reason bucket meets the task's ≥10 independent samples and ≥95% approval threshold. The multi-hit target-resolution bucket is also unknown; its existing review requirement stays intact.

| Cohort     | Passes | Linked turns | Passes with tool history | Passes with turn events |
| ---------- | -----: | -----------: | -----------------------: | ----------------------: |
| Real users |     41 |           26 |                       41 |                       2 |
| Harness    |    224 |            1 |                        3 |                       0 |

Production retains executed tools, approval hashes, and review diagnostics, but not the complete original withheld proposal. Rejected calls never execute, and mixed proposals drop their reads before review. Even a matching hash for executed mutations cannot prove that the original proposal had no reads. Inferring routes from surviving successful writes would bias the report toward approvals. The script therefore reports historical routes as unknown instead of inventing a replay.

Of the eight real-user turns with multiple reviewer passes, seven contain revision requests; only one has two approvals without a revision. This is evidence against assuming that repeat reviews are mostly redundant approvals. It is not enough evidence to identify the dominant semantic correction or safely reuse approval scopes. Ambitious item 5 remains deferred.

## Telemetry and method

`takeWithheldMutationBatch` now records the actual routing assessment. Reviewer usage metadata includes `writeRouteReason`, unique sorted `writeRouteTools`, `writeRouteCount`, and `writeRouteBatchSha256`. A previously reviewed turn whose new batch otherwise qualifies as simple records `reviewed_turn_continuation`. These fields are host telemetry only and never enter the model request body or acting-pass usage metadata.

Verdicts already exist as `provider_review_decided` execution observations, with validated outcomes including approval, revision, refusal/clarification and invalid decisions. The report joins these by turn, logical round and time window, falling back to a unique successful reviewer control execution when observations are unavailable. Ambiguous decisions, overlapping attempts, repeated logical rounds and missing links stay unknown. Format repairs reuse a logical round, while observation writes are asynchronous; a delayed first decision can arrive during the repair pass. The usage and observation attempt counters are not the same identity. A follow-up regression exposed this and the report now refuses that ambiguous attribution. Rerunning the same GET-only window moved one approval and one revision to unknown (the initial report had 20 approvals, 16 revisions and four unknowns).

The report script performs paginated HTTP GETs against existing Supabase tables using the existing local server credentials. It fetches structural tool fields and decision telemetry, not user messages or tool argument bodies. Email addresses are used internally only to distinguish the `agentic-e2e…` account prefix and are never emitted. Optional JSON output contains only sanitized report rows, not the source evidence.

```bash
node --import tsx scripts/agentic/write-review-reasons.ts \
  --from 2026-09-19T00:00:00-04:00 \
  --to 2026-10-19T00:00:00-04:00 \
  --json /tmp/buildos-write-review-reasons.json
```

Use `--input <snapshot.json>` with `{ usage, users, tools, observations, events }` to exercise the analyzer offline. `--json` is a sanitized analysis export, not that raw input format. After deployment, rerun the report over a window containing recorded route telemetry before considering any routing expansion.

## Structured source preservation

`create_onto_document` and `update_onto_document` now expose optional `content_source: 'user_verbatim'`. The model sets it when exact preservation is requested; the router sends those writes for source-fidelity review. The flag participates in the approved arguments and does not become a persisted document field. The old message-keyword classifier is deleted. Literal UUID parsing remains because it handles a structured identifier, not intent.

The same words without the structured flag no longer force review. Whether the acting model reliably supplies the flag in live use still needs post-deployment validation. The independent exact-source correction test now supplies it explicitly and verifies that only the approved corrected document executes.

## Validation

Regression failures were observed before implementation for missing route telemetry, the extra acting pass after fulfilled review, the source-preservation route/schema, and the missing script module. Skeptical review found an additional failure: a mixed proposal's dropped read was invisible to the execution ledger and incorrectly allowed receipt completion. A failing regression was added, then fixed by tracking withheld non-mutation calls.

Existing safety tests and newly added guard cases were also run; these were not all failing on the baseline. The broad worker run initially found one stale exact-source fixture and passed after it was updated to the structured argument.

DJ requested a second review on 2026-10-19. In addition to the delayed-verdict bug above, a new test exposed a malformed-receipt edge case: the ledger can credit a count-only create outcome from a success status and proposed fields even if the result contains no saved entity ID. The reviewed receipt shortcut now requires identities on every ledger entry and keeps the acting pass when one is missing. This is a defensive guard on top of the adapter's receipt validation, not evidence of malformed production writes. An image-bearing reviewed turn was also explicitly tested: it preserves the image input and the closing acting pass.

Both new bug regressions failed before their fixes, then passed. Follow-up checks: **202 worker tests passed** across `agenticChatDirectWriteReceipt`, `agenticChatReviewedTurnContract` and `agenticChatTurnProvider`; **6 report tests passed**. Both worker typechecks passed after correcting the new image fixture's message type. The production-routing policy and tool schemas were unchanged during this follow-up.

Validation totals and final build/typecheck results are recorded in task 138. Project tool size is 72,440 bytes against a 72,460-byte cap; global is 54,782 bytes and project-create is 8,426 bytes. The project surface has only 20 bytes of remaining budget.

## Live comparison still pending

The documented before battery on `1499e4d54` is **48/52**, with p50 7.0 s and p90 16.7 s, and **$0.25 measured on DeepSeek V4.1 Flash**. See the dated entry in [the code triage report](../technical/reviews/CODE_TRIAGE_2026-10-18.md). It is not a 52/52 passing baseline.

After review and deployment, a separately authorized paid run can compare acting passes, reviewer passes and turn timing while checking the scorecard. No live speed or live model-compliance claim follows from the offline tests. No new product decision is needed for the lean implementation; future direct-lane widening requires newly recorded evidence.
