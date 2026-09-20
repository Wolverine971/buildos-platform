<!-- docs/technical/reviews/AGENTIC_CHAT_FIRST_FIXES_2026-09-02.md -->
<!-- doc-status: point-in-time -->

# Agentic chat first fixes — September 2, 2026

Implemented against local HEAD `f28e8f7bc2fd41718c4141dc6d4fd40dd09a45d3`, following the [independent review](./AGENTIC_CHAT_FOLLOWUP_REVIEW_2026-09-02.md). This batch addresses deterministic contract and clarification failures. These application changes have not been deployed.

## Changes

- **Clarification repair before execution.** Shared preflight now uses the same pure semantic validator as control execution. A question that paraphrases its candidate labels returns specific validation feedback through the existing two-repair allowance. A corrected question proceeds; three invalid attempts exhaust that allowance without any mutation and release provider capacity.
- **Executable document postconditions.** Actor declarations and reviewer corrections must name fields available from the admitted document tools and the write ledger's field normalization. Invented fields such as `rollback_section_text`, prose acceptance criteria, routing IDs, and `update_strategy` cannot become completion requirements. Section-edit intent belongs in `description`, with `required_fields:["content"]`. Invalid actor declarations enter existing repair; invalid reviewer corrections use the existing clarification fallback instead of installing an impossible contract. Validation uses the stable admitted tools even when the acting model temporarily has only control tools.
- **Correct goal label binding.** Goal `title` already normalizes to `name`, but labelled-create validation and receipt binding still looked for `title`. Both now use the same canonical field. Tests use two named goals with reversed receipt order so elimination cannot hide a binding failure. Missing names remain invalid.
- **Document review guidance and approval-hash clarity.** The reviewer now treats a full replacement as a valid section edit only when the loaded original's other content is preserved. A live probe also found that the reviewer correctly accepted a replacement's scope but copied the contract hash into `batch_sha256`. Removed the unused top-level contract hash from the batch-review prompt and explicitly labelled the batch approval value. Contract authorization, approval binding, and exact-hash rejection remain unchanged.

## Verification

Regression tests failed before their fixes and passed afterward. Final coverage totals **1,082 distinct deterministic tests passed**, with **11 opt-in live tests skipped**:

| Check                                                                        | Result                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Entire shared runtime suite                                                  | 347 passed                                                                                     |
| All worker `agenticChat*` tests                                              | 722 passed, 11 opt-in cases skipped                                                            |
| Final worker review/provider regression rerun, including one added hash test | 120 passed; 119 overlap the preceding worker suite                                             |
| Web shared tool-validation consumer                                          | 12 passed                                                                                      |
| Shared runtime build and typecheck                                           | Passed                                                                                         |
| Worker source typecheck and changed-source ESLint                            | Passed                                                                                         |
| Worker test-type debt gate                                                   | Passed at 215 existing errors against a 217-error baseline; this is not a clean test typecheck |
| Patch whitespace check                                                       | Passed                                                                                         |

The organization fixture now requires the actual `parent_id` effect, rather than treating routing `project_id` and `document_id` as changed fields.

Real-model verification used the current local review request builders, completion validators, and transport with `openai/gpt-5.6-luna`, synthetic document content, and no database or queue client:

| Scenario after fixes                                                               | Result                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| Review the exact section-edit contract                                             | Approved, 5.36 s                                  |
| Replace document content with only Rollback changed                                | Approved with the exact batch hash, 2.69 s        |
| Also change the unrelated Monitoring section                                       | Rejected with a specific revision request, 2.94 s |
| Repeat the valid replacement with the prior contract approval/hash in turn history | Approved with the exact batch hash, 3.06 s        |

The retained evidence includes the pre-fix wrong-hash response and the passing post-fix responses. These model samples verify the observed review behavior; they are not a full durable-turn or browser rerun.

[Verification logs and live probe](./agentic-chat-local-verification-2026-09-02/) · [Live review evidence](./agentic-chat-local-verification-2026-09-02/first-fixes-document-review-results.json)

To repeat the paid, synthetic model probe from `apps/web`:

```sh
pnpm exec vite-node --config vitest.config.ts --mode test \
  ../../docs/technical/reviews/agentic-chat-local-verification-2026-09-02/first-fixes-document-review-probe.ts
```

## Migration and remaining work

Migration `20260902150000_agentic_chat_recovery_throttle_backoff_seconds` was already applied and verified at `2026-09-03 02:15:27 UTC`; this code batch requires no new migration. [Receipt and implementation verification](./agentic-chat-local-verification-2026-09-02/migration-reverification.json).

Still open from the review: route changes for repeated provider protocol/repair failures, project-create guidance for unnecessary labels, false clarification gates on answer-only prose, admission/minimize lifecycle, authoritative terminal-status projection, and shared browser-client initialization. The original hosted durable scenarios still need another run after the relevant worker changes are available there. This batch does not claim those end-to-end failures are all resolved.
