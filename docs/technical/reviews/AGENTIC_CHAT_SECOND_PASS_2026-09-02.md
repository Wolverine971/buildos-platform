<!-- docs/technical/reviews/AGENTIC_CHAT_SECOND_PASS_2026-09-02.md -->
<!-- doc-status: point-in-time -->

# Agentic chat second review and provider recovery — September 2, 2026

Reviewed the [first batch](./AGENTIC_CHAT_FIRST_FIXES_2026-09-02.md), added regressions for the gaps below, fixed them, and implemented the next provider-recovery item from the independent review. Changes remain local; no deployment or new migration was performed.

## Review findings fixed

1. **Document field validation still admitted execution metadata.** `merge_instructions` is an instruction to the document operation, not a persisted field. The shared write ledger now excludes it from both changed fields and values, so it cannot satisfy a document completion requirement or appear in the reviewer's advertised effect fields.
2. **Organization borrowed fields from helper creates.** The recovery tool list includes `create_onto_document` because grouping may need a parent. Creating that parent does not fulfill the organization of the target document. The field guard now derives organization fields from its move operation, even when only the helper-create capability is present. One older provider fixture was corrected to admit the move capability needed to finish its declared organization; its first authorized operation remains folder creation.
3. **Goal labels could bind to document parents.** The parent-by-title binding fallback did not check the entity kind. With canonical goal names supported, a same-named document parent could be mistaken for a goal. That fallback now requires a document-compatible outcome. Unbound-goal feedback also names the canonical `name` field rather than `title`.
4. **Binding a label bypassed other completion requirements.** A created goal with the correct name could fulfill a contract despite a missing or incorrect target date. Binding now proves identity only; additional required fields and exact values go through the existing receipt checks for the bound entity. Ordinary parent-by-title grouping remains valid when only its identity was required; it cannot imply unobserved descriptions or other fields.

The new tests reproduced these failures before the fixes. Positive cases still verify correct goal dates, document fields, folder grouping, and goal-name aliases.

## Next item implemented: disabled-tool provider recovery

A provider response that streams tool calls or reports `tool_calls`/`function_call` while `tool_choice=none` is now recorded as a failed provider attempt. It clears the turn's model/provider pin and excludes the failing provider when its identity is available. The forced-synthesis coordinator's existing one retry can then use a different available route.

The client deliberately does not introduce another retryable error event for this case: that would engage a separate retry loop and multiply attempts. Token usage from the failed attempt is still recorded. The coordinator continues to discard the rejected candidate and never executes its tool calls.

HTTP-stream integration tests use the real OpenRouter client and provider coordinator with deterministic responses. They verify:

- A previously pinned provider is avoided on retry, including switching providers while retaining the same model.
- Tool definitions stay absent and `tool_choice=none` stays set for both synthesis requests.
- Rejected assistant text and the unsolicited mutation never reach execution or the user-facing response.
- A valid second response finishes; a second violation fails with `provider_forced_synthesis_failed`.
- Both paths make exactly one opening read request and at most two synthesis requests, release capacity, and do not apply a throttle cooldown for a protocol violation.
- Failed-attempt diagnostics retain usage and a specific failure class without retaining tool argument contents.

This addresses the disabled-tool forced-synthesis failure from the retained document scenario. It does not add route switching for repeated semantically invalid contract declarations.

## Verification

**1,109 deterministic tests passed; 11 opt-in live tests skipped.** This turn used local tests, including simulated HTTP streams, rather than another hosted end-to-end run.

| Check                                                    | Result                                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Entire shared runtime suite                              | 354 passed                                                                               |
| All worker `agenticChat*` tests                          | 732 passed, 11 skipped                                                                   |
| Web tool-validation and write-ledger consumers           | 23 passed                                                                                |
| Shared runtime build and typecheck                       | Passed                                                                                   |
| Worker source typecheck                                  | Passed                                                                                   |
| Changed worker source ESLint, formatting, and whitespace | Passed                                                                                   |
| Worker test-type debt gate                               | Passed at 215 existing errors against the 217-error baseline; not a clean test typecheck |

[Test evidence](./agentic-chat-local-verification-2026-09-02/second-pass-worker-tests.log) · [Runtime tests](./agentic-chat-local-verification-2026-09-02/second-pass-runtime-tests.log) · [Before-fix provider reproduction](./agentic-chat-local-verification-2026-09-02/second-pass-provider-red.log)

Migration `20260902150000_agentic_chat_recovery_throttle_backoff_seconds` remains covered by the prior [application and implementation verification](./agentic-chat-local-verification-2026-09-02/migration-reverification.json). These changes require no additional migration.

Next unresolved work remains repeated invalid contract submissions and project-create label guidance, answer-only clarification gating, admission/minimize lifecycle, exact terminal-status projection, and browser-client initialization. The original hosted document and project-create scenarios still need a rerun after deployment of the relevant changes.
