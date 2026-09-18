<!-- docs/technical/reviews/CHAT_WORKFLOW_REGRESSION_REPAIRS_2026-09-13.md -->

# Agentic Chat workflow regression repairs — 2026-09-13

Status: ready for 82/84 integration validation; not accepted until the combined
three-repetition gate is 52/52.

## Failure-to-source map

| Failure               | Retained source fact                                                                                                                                                                                                                                                                                                                  | Repair boundary                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Case 2, repetition 2  | The five `create_onto_task` receipts succeeded. The next acting pass proposed all three `link_onto_entities` calls correctly. Both review attempts approved the semantics but returned `a007...424f...` instead of the quoted batch digest `a007...424c...`, so the links never executed and the turn ended `semantic_review_failed`. | Keep the first reviewer tool schema static. On the one bounded `approval_sha_mismatch` retry only, constrain `batch_sha256` to the held digest; still require a fresh decision and the existing fail-closed identity check. |
| Case 7, repetition 3  | The acting provider's original `create_onto_document.content` already contained `copper &amp; oak`; the adapter and receipt preserved exactly what was proposed.                                                                                                                                                                      | Prompt for byte fidelity, reject a provable model-authored HTML entity transformation through the existing validation-repair loop, and let persistence continue to store the accepted argument unchanged.                   |
| Case 14, repetition 1 | The first pass already batched the marketing document plus scoped permit, invoice/payment/spend, and completed-work searches. The next seven calls refetched loaded overview/task/calendar facts and fanned complete no-matches into synonym searches. Total: 49,959.8 ms and 11 calls.                                               | Plan from missing fact coverage, batch independent reads with known arguments, preserve true projection dependencies, and stop after relevant complete coverage rather than at an arbitrary call count.                     |
| Case 14, repetition 3 | The seven-call answer said both `Unknown` and the unbounded sentence `No evidence that work has begun`; it also headed invoices/payments as `None`. The judge correctly applied the false-absence rule.                                                                                                                               | Separate recorded status from real-world inference and scope every absence to the inspected records.                                                                                                                        |

Primary evidence:

- `output/agentic-gate/djflow-subscription-race-2026-09-12/turns/cedar-02-task-batch-2-1.json`
- `output/agentic-gate/djflow-subscription-race-2026-09-12/turns/cedar-07-document-create-3-1.json`
- `output/agentic-gate/djflow-subscription-race-2026-09-12/turns/cedar-14-grounded-status-1-1.json`
- `output/agentic-gate/djflow-subscription-race-2026-09-12/turns/cedar-14-grounded-status-3-1.json`
- Corresponding requests in `output/agentic-gate/djflow-subscription-race-2026-09-12/provider-passes/` and execution graphs in `worker.log`.

## Critical-path profile and 84 handoff

Case 14 repetition 1 measured 49,959.8 ms at the client and 44,788.2 ms from
server admission through terminal commit. Provider authority through finish was
40,580.5 ms; worker start to provider authority was 1,460 ms, and provider finish
to the terminal call was 1,356.1 ms. The four provider passes were 4,761, 4,220,
4,743, and 5,741 ms. The three read-round critical paths were 3,387, 1,991, and
11,472 ms. Their concurrent call-duration sums (12,044, 5,113, and 41,983 ms) are
not elapsed time and must not be added to the turn.

The retained boundary logs expose `read_op`, `ledger_persist`, and
`tool_result_publish`, plus aggregate provider/publisher spans. The runtime timing
log renders detailed span objects as `[Object]`, and mutation execution is not
split into effect reserve, effect begin, adapter, reconciliation, receipt
persistence, and delivery spans in the retained artifact. Task 84 therefore owns
making those structured spans inspectable before attributing or changing the
delivery path. The 82 repair removes unnecessary read rounds; it does not loosen
durable acknowledgement or publishing guarantees.

## Focused proof

- Worker: `agenticChatMutationBatchReview.test.ts` plus
  `agenticChatTurnProvider.test.ts` — 137/137 passing.
- Web prompt: `build-lite-prompt.test.ts` — 63/63 passing.
- Coverage includes a wrong-SHA link-review retry after prior task-create receipts,
  proof that the retry neither replays those creates nor releases the held link claim,
  fail-closed exhaustion, rejection (not decoding) of `&amp;` substituted for literal
  `&`, and byte-for-byte preservation of intentional `&amp;`, quotes, punctuation,
  and Markdown.

## Full-gate status

The required gate was started with the isolated env at
`output/agentic-gate/2026-09-13T01-17-55-593Z`. Oracle, dependency, worker, and web
startup phases completed, and 30 turns reached terminal timing while turn 31 was
active. During the run, a coordinator reported another worker attached to the same
QA database and multiple executable files changed in the shared checkout. The run
was stopped to prevent further model spend. It is non-authoritative and failed by
the gate's isolation and checkout-provenance contract; it produced no scorecard and
must not be counted as acceptance. The coordinator should run one clean combined
82/84 gate after the shared tree and isolated worker are stable.
