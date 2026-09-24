<!-- docs/technical/reviews/AGENTIC_CHAT_THIRD_PASS_2026-09-03.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Agentic Chat — third review and repair pass

Local source based on `f28e8f7bc2fd41718c4141dc6d4fd40dd09a45d3`, preserving the existing staged and unstaged changes. This pass adds completion fixes, removes repeated validation plumbing, and implements recovery from repeated invalid submissions.

## Changes

- **Completion after creation:** a labelled create previously checked only create receipts for additional fields. A later successful update could repair a missing/wrong goal date without satisfying the contract, or overwrite a correct date while the contract still appeared fulfilled. The resolver now checks successful creates and updates for the bound entity through one field/value checker. Failed updates, other IDs, other entity kinds, and updates without a create binding remain ineligible. Three regression cases failed before this fix.
- **Repeated validation failures:** the first rejected submission receives the existing literal repair feedback. If the next submission leaves the same validation failures unresolved, the final existing repair avoids that response's actual model/provider. The detector ignores provider call IDs, JSON key order, and cosmetic payload changes. A different failure remains on the warm route. The two-repair limit, tool authority, mutation review, and capacity behavior are unchanged.
- **Scoped provider feedback:** delayed rejection is matched to the completed response's turn, stream, claim token, generation, logical round, round kind, and role. It cannot penalize a newer response or an unrelated warm pin. It retains no prompt or argument contents and does not rewrite already-recorded transport receipts.
- **Contract instructions:** distinguish outcome `id` from optional entity `label`; explain canonical goal `name`; supply a complete labelled-goal example verified by the parser; omit project labels and routing IDs from project-create postconditions.
- **Fields that receipts can prove:** live testing exposed goal/task contracts requiring `project_id` as a changed field, although the ledger excludes it as scope. Extended the admitted-schema/ledger field guard from documents to goal/task creates, including reviewer corrections. The existing composite-create test contained the same impossible requirement; its corrected contract now removes it.
- **Cleanup:** consolidated four copies of call-validation error handling and combined document/target-ID validation into one parse loop. The older live-probe instrumentation now forwards the new routing-feedback hook.

## Verification

| Check                                                     | Result                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| Entire shared runtime suite                               | 362 passed                                                               |
| All worker `agenticChat*` suites                          | 753 passed; 11 opt-in tests skipped                                      |
| Web validation/ledger consumers                           | 23 passed                                                                |
| Distinct automated tests                                  | **1,138 passed**                                                         |
| Runtime typecheck and build                               | Passed                                                                   |
| Worker source typecheck                                   | Passed                                                                   |
| Changed worker source ESLint, formatting, diff whitespace | Passed                                                                   |
| Worker test-type debt gate                                | Passed at 215 existing errors / 217 baseline; not a clean test typecheck |

HTTP-stream integration tests run through the real client and coordinator. They verify recovery and exhaustion in three requests, route changes despite cosmetic edits, retention of the route for a different error, preservation of tools and feedback, no invalid mutations, no semantic-error throttle cooldown, and released capacity. Separate tests cover stale feedback and a completed physical fallback whose route differs from the current pin.

## Live model evidence

The retained probe uses synthetic intent, current local coordinator/client/schema code, and only the OpenRouter network endpoint. It has no database client, queue consumer, or mutation executor and stops at contract declaration before review.

Live testing informed two refinements:

1. Clearer instructions alone did not stop DeepInfra from returning invalid labels. A subsequent normal-routing pass produced a syntactically accepted contract that required `project_id`; checking the ledger exposed the additional field-validation gap.
2. After adding that guard, DeepInfra kept the same missing-name error across three superficially different payloads. This defeated the initial argument-hash detector. The final detector compares validation failures, and the cosmetic-change regression fails against the earlier implementation.

The final live run passed in **12.293 seconds**, using DeepSeek V4 Flash through DeepInfra. It returned a valid contract after **one repair** and the requested happy-path synthetic receipts (one project, one goal, three tasks) fulfilled that contract. Capacity returned to zero active requests. This final run did not require the new provider switch; switching under repeated failures is verified by the HTTP integration cases.

An earlier attempt to force the opening request onto DeepInfra encountered an unavailable endpoint and fell back to NextBit. It is retained as diagnostic evidence, not counted as live proof of semantic-failure switching. Historical files ending `before-field-guard` record declaration-stage acceptance only; the final result additionally checks receipt fulfillment.

## Migration and remaining gates

Migration `20260902150000_agentic_chat_recovery_throttle_backoff_seconds` was already applied and independently verified at `2026-09-03 02:15:27 UTC`; the retained receipt confirms the seconds-based backoff and restricted execution permissions. These TypeScript changes need no additional migration.

No deployment or hosted end-to-end rerun occurred in this pass. The original hosted document follow-up and project-create cases still need validation after deployment. Other previously recorded work includes answer-only clarification gating, admission/minimize lifecycle, terminal-status projection, and browser-client initialization. A further completion audit should check allocation of distinct receipts across overlapping unlabelled create outcomes; the live probe here verifies the successful full-receipt case.

Evidence is in [the local verification directory](agentic-chat-local-verification-2026-09-02/), including `third-pass-project-contract-probe.ts`, the final `third-pass-project-contract-results.json`, retained failed live cases, and `third-pass-*.log` verification output.
