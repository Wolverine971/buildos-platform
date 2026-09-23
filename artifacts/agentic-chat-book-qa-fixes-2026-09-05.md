<!-- artifacts/agentic-chat-book-qa-fixes-2026-09-05.md -->

# Agentic chat book QA — focused fixes

Date: September 5, 2026

Status: Implemented and validated locally. Not deployed; production records were inspected read-only during this fix pass.

## What changed

| Issue                                                         | Root cause                                                                                                                                                                                                                | Fix                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A successful document edit ended with “Done: 0 of 1 creation” | The reviewer removed an unwanted create outcome and the provider executed the corrected edit-only plan. Terminal text and completion metadata reconstructed the original declarations, ignoring that approved correction. | Both terminal consumers now replay the worker's durable review decisions. An approved correction replaces the original proposal only when its exact SHA matches both the approval call and receipt. |
| Project appeared empty while loading                          | The skeleton-first route does not load counts, but the workspace displayed fallback zeros. Overview rendered empty-state messages from arrays that had not been hydrated.                                                 | Hide unknown tab counts; render an accessible overview loading state. Keep all four data-dependent panels out of empty-state rendering after a failed load.                                         |
| “Try again” could never recover initial hydration             | The button awaited the same already-settled failed server promise again.                                                                                                                                                  | Retry the existing full-data endpoint with a fresh request. Prevent duplicate retries, serialize chat refreshes behind the retry, and ignore hydration that completes after unmount.                |

The changes are independent of books, chapter names, or any QA fixture. No domain-specific rules, extra model passes, database migrations, or new loading framework were added.

## Evidence and correction to the original assessment

The diagnostic scope was the QA project `[QA 2026-09-05] The Last Signal — Book Draft`, project ID `e256363c-2da0-4313-abaf-fea4fcc6da87`, chat session `913bcb29-b30d-4b79-b4c2-15a00db606db`.

The saved edit turn (`258954cd-53dc-4b02-876d-2e573ad977b9`) contained this sequence:

1. Read the existing document and its outline/section.
2. Reject an invalid declaration.
3. Accept a declaration containing document update **and** document create outcomes.
4. Durably record the reviewer's complete corrected contract containing only the requested update.
5. Approve the corrected contract.
6. Successfully update the document and read its outline.
7. Finish with `mutation_unfulfilled` and an unwanted-creation disclosure.

The completion checker was using a different plan from the executor. The fix corrects that disagreement; it does not suppress legitimate incomplete-work warnings. Saved completion metadata uses the same corrected resolver as the user-visible receipt, so removed outcomes are not retained as unfinished work.

Two earlier broad requests were manually cancelled: the initial project request after approximately 149 seconds, and the four-document request after approximately 80 seconds. They demonstrate slow/incomplete attempts under interruption, **not proven batch-creation failures**. The original assessment was too strong on that point. This patch does not claim those full workflows now pass.

## Safety and performance boundaries

- An unapproved correction, failed tool receipt, invalid correction, or mismatched approval hash cannot replace the original contract.
- Repeated approved corrections, new declarations, cancellation, and clarification retain their existing semantics.
- Actual unfinished outcomes remain visible, including additional work required by an approved correction.
- Declaration-only and legacy direct-write flows still use the existing runtime resolver.
- Initial page hydration continues to reuse the server's deferred request; there is no duplicate full-data fetch on mount.
- Retry adds one fresh fetch per attempt. A mutation arriving during retry waits, then uses the existing targeted refresh path.
- Existing task/document chat updates still fetch only the changed data rather than refreshing the entire project.
- No authorization rules, tool availability, model prompts, or mutation batching limits changed.
- No project records were modified or deleted in this fix pass. Unrelated workspace changes were preserved; no commit or deployment was performed by this task.

## Validation

126 distinct tests passed across the targeted runs, including 29 new regression cases:

| Command / check                                                                                                   | Result                                                                            |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Worker: `vitest run tests/agenticChatReviewedTurnContract.test.ts tests/agenticChatTerminalTextIntegrity.test.ts` | 27 passed, including 20 new cases                                                 |
| Worker: `vitest run tests/agenticChatTurnExecutor.test.ts`                                                        | 70 passed                                                                         |
| Worker: `vitest run tests/agenticChatTurnProvider.test.ts -t 'typed\|corrected\|revision\|read-only'`             | 6 passed; 106 intentionally not selected                                          |
| Web: `vitest run 'src/routes/projects/[id]/ProjectWorkspace.test.ts'`                                             | 23 passed, including 9 new cases                                                  |
| `pnpm --filter @buildos/worker typecheck`                                                                         | Passed                                                                            |
| `pnpm --filter @buildos/web check`                                                                                | Zero errors and zero warnings                                                     |
| Svelte autofixer on `ProjectWorkspace.svelte`                                                                     | No issues; only suggestions concerning existing `bind:this` usage, left unchanged |
| Scoped diff whitespace check                                                                                      | Passed                                                                            |

Regression coverage includes document/task/project corrections; exact approval identity; missing, failed, malformed, and prose-only review results; repeated corrections; cancellation and clarification; truthful incomplete-work reporting; loading versus empty/error UI states across all tabs; successful and repeatedly failed retries; duplicate retry prevention; mutation refresh ordering; and late hydration after unmount.

Tests exercise the actual completion/receipt functions and rendered Svelte workspace. They are deterministic regression tests, not a fresh production end-to-end chat battery. Worker provider/runner tests use their existing mocked execution fixtures. The Svelte skill informed the loading-state implementation and validation without migrating unrelated component patterns.

## Files

- `apps/worker/src/workers/agentic-chat/turn/reviewed-turn-contract.ts`
- `apps/worker/src/workers/agentic-chat/turn/terminal-text-integrity.ts`
- `apps/worker/src/workers/agentic-chat/turn/turn-executor.ts`
- `apps/worker/tests/agenticChatReviewedTurnContract.test.ts`
- `apps/web/src/routes/projects/[id]/ProjectWorkspace.svelte`
- `apps/web/src/routes/projects/[id]/ProjectWorkspace.test.ts`

## Remaining live verification

After deploying both web and worker, rerun an edit-in-place request that requires a reviewer correction; confirm the saved text, final answer, and completion metadata agree. Then test a new project with several requested documents, tasks, and organization steps through natural completion, recording timings and any cancellation separately.

Latency remains a concern: the recorded chapter edit took approximately 119 seconds. These fixes address correctness and recovery, not the full review/planning latency. Do not infer a latency improvement or general batch success from the local regression results.
