<!-- artifacts/agentic-chat-ef4ad9a-investigation-and-fixes.md -->

# Agentic chat ef4ad9a investigation and fixes

Date: 2026-09-04 (America/New_York). Investigated against local HEAD `f42e76557`, whose worker review code still contains the `ef4ad9a` regression. Existing staged UI edits and unrelated workspace changes were preserved.

## Confirmed cause

The configured semantic reviewer emits every optional symbolic label field, including fields that do not apply to its corrected outcome. Before this change, the schema permitted only strings for these fields. In a live synthetic replay through the production request builder and OpenRouter client, it supplied:

- Task update: the correct task UUID, due date, and `props.duration_minutes=120`, plus `label`, `src_label`, `dst_label`, and `parent_label` set to `cabinet-update`.
- Document edit: the correct UUID and `required_fields=["content"]`, plus all four labels set to `x`.
- Existing-task relationships: the correct three `src_id`/`dst_id`/`rel` triples, plus invented endpoint labels such as `existing-order-cabinets`.

The older reviewer cleanup removed `label` and `parent_label` where inapplicable. The new endpoint fields were not included. The parser therefore rejected correct task/document repairs and rejected relationship repairs for simultaneously declaring UUIDs and labels. The harness converted all three internal failures into the same question about missing targets and values.

This is directly reproduced with fresh model output, rather than inferred only from production telemetry. The original production review bodies were not retained, so they cannot be compared byte for byte. The matching failure signatures, affected release diff, and successful replay after correction make this a strong explanation for the observed regression.

## Changes

1. **Schema:** all four optional symbolic labels accept `null`; descriptions explicitly allow null/omission and reject placeholders. The live reviewer now emits null for unused labels. Target guidance calls for distinct IDs without padding.
2. **Canonical repair:** remove endpoint labels on unrelated actions. For existing relationship endpoints, discard an unbound decorative label only when that endpoint already has a canonical UUID and the label cannot refer to a create in the same contract. Preserve actual create-label/ID conflicts for rejection. Never infer an endpoint UUID from a label.
3. **Prompts:** describe scalar update fields, content postconditions, existing UUID endpoints versus same-turn create labels, and project-versus-Context-Document typing. Preserve the source request as the authority for selective text edits.
4. **Internal review failure:** emit structured rejection codes, finish state/reason, validation counts and fixed field names, and argument sizes/hashes/truncation flags. Do not retain reviewer prose or argument values in diagnostic events. Schema/SHA failures receive one private repair pass; transport truncation already has its own bounded retry and gets no additional semantic retry. Physical attempt IDs remain distinct without advancing the logical round.
5. **Failure presentation:** exhausted internal review ends with an explicit internal-check failure and no mutation authorization. Genuine candidate ambiguity still uses the normal clarification path. The obsolete generic clarification fallback was removed.
6. **Partial-write receipt:** if forced synthesis fails after a successful durable effect, render the write ledger deterministically. Name saved effects, failed effects, and unconfirmed contract outcomes; never replay a mutation. Cancellation continues to propagate. Read-only failures cannot produce a fabricated successful-write receipt.

Core implementation: [decision-completion.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/review/decision-completion.ts), [control schema](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/catalog/definitions/controls.ts), [turn-provider.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/turn-provider.ts), [receipt renderer](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/repair-policy.ts).

## Verification

Live replays use `openai/gpt-5.6-luna`, the production reviewer request builder and streaming client, the 4,000-token cap, and OpenAI/Azure provider preference. They use synthetic entities and execute no database mutations.

| Scenario                                     | Before                          | After               |
| -------------------------------------------- | ------------------------------- | ------------------- |
| Exact task UUID, due date, duration          | Internal clarification fallback | Revision → approval |
| Exact document UUID, selective edit          | Internal clarification fallback | Revision → approval |
| Three links between existing tasks           | Internal clarification fallback | Revision → approval |
| Five creates and three labelled dependencies | Not replayed before             | Approval            |

Machine-readable results: [reviewer-replay-results.json](/Users/djwayne/buildos-platform/artifacts/agentic-chat-ef4ad9a-reviewer-replay-results.json). Failing synthetic model responses are retained as [recorded regression fixtures](/Users/djwayne/buildos-platform/apps/worker/tests/fixtures/agenticChatEf4ad9aReviewerReplay.json).

Offline verification passed: 878 worker agentic-chat tests and 125 runtime contract, validation, and catalog tests (1,003 total). Four live reviewer scenarios also passed. Regression coverage checks recorded model corrections, exact relationship authorization, unresolved endpoints, real label/UUID conflicts, genuine candidate ambiguity, distinct private failure diagnostics, internal retry identity, and saved-write receipts after empty, stray-tool, and failed synthesis. Worker source typecheck, the existing test-type debt gate, and lint on the modified provider files were also run. The test-type gate still tracks pre-existing type debt; it is not a clean test typecheck.

The opt-in live test is [agenticChatContractReviewer.live.test.ts](/Users/djwayne/buildos-platform/apps/worker/tests/agenticChatContractReviewer.live.test.ts). Run from `apps/worker` with `AGENTIC_CHAT_REVIEWER_REPLAY=true`; `PRIVATE_OPENROUTER_API_KEY` may be supplied through the environment or the worker's local `.env`. Optional `AGENTIC_CHAT_REVIEWER_REPLAY_OUTPUT=/tmp/reviewer-replay` saves synthetic pass evidence. The regular test suite does not call the model provider.

## Remaining production work

- Changes are local; no deployment or production data mutation was performed. Re-run the original browser cases after deploying the worker/shared runtime. Live reviewer approval proves the repaired review boundary, not end-to-end persisted document bytes, due-date normalization, or dependency counts.
- Task creation after partial success must still be retested end to end. The receipt fallback prevents an opaque synthesis failure; it does not turn an unfinished batch into a fully executed one.
- The exact-project/Context-Document rule was added to acting and reviewer guidance; the search/UI scenario still needs a browser retest.
- Calendar `credentials_unreadable` requires checking the deployed encryption configuration against the credential writer. No secrets were changed or exposed.
- Start Here document navigation and read-only owner-report overclaims remain separate issues from this worker regression. Existing staged frontend changes were not modified by this investigation.
