<!-- docs/architecture/COMPLETION_RECEIPT_CONTRACT_2026-09-21.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-21; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Whole-request completion receipts — September 21, 2026

Tasker 92, slice C. Implemented locally, uncommitted, free tests only. A reviewer's
approval of one mutation batch proves that stage was commissioned; it never proves
the whole request landed. Every completed turn now carries a versioned receipt that
keeps those two facts apart, computed only from the durable tool-execution ledger.

## What already existed

- **Turn contracts.** A reviewed `TurnContract` lists outcomes. After execution,
  `resolveTurnContractOutcome` in `packages/agentic-chat-runtime/src/loop/turn-contract.ts`
  yields a `TurnContractResolution` (`fulfilled | blocked | unfulfilled | failed`) with
  one result per outcome: matched versus required effects, missing targets, missing
  required fields, unbound parent labels. It is ledger-derived, not model text.
- **Stage approval as exact bytes.** Each proposed mutation batch is reviewed by
  digest; the reviewer echoes the batch SHA-256 and only that batch executes
  (`provider/review/mutation-batch.ts`, `tools/execution-adapter.ts`). The approval is
  recorded in the ledger as an execution whose result carries `batch_sha256`.
- **Continuation and disclosure.** `buildContractCompletionRequest` re-asks for
  unfulfilled outcomes; `terminalTextIntegrity.ts` appends the partial notice and
  finalizes `completed` with `mutation_unfulfilled` after a post-start failure.

Missing was a persisted, versioned record binding stage approvals to their reviewed
bytes and to the host's request-level verdict, so an inspector, a recovery path, or
a future host-rendered summary can trust it without recomputing.

## Evidence

Case 2 of the 2026-09-21 gate created five tasks under one approval and linked three
dependencies under another. An earlier run lost the dependency stage after provider
failures; the partial notice prevented a false "done", but nothing recorded which
stage was complete and which was owed.

## The receipt

`packages/agentic-chat-runtime/src/loop/completion-receipt.ts`, exported from the loop
index. `buildAgenticChatCompletionReceiptV1` is a pure function of the contract, its
digest, the tool executions, the finished reason, and any partial failure class.

```ts
type AgenticChatCompletionReceiptV1 = {
	version: 1;
	contractSha256: string | null; // digest of the reviewed contract bytes
	expectation: 'turn_contract' | 'none';
	stages: Array<{
		batchSha256: string; // the digest the reviewer echoed
		approvalCallId: string;
		executedCallIds: string[]; // successful writes under this approval
		failedCallIds: string[];
		disposition: 'stage_approved' | 'stage_partial' | 'stage_failed';
	}>;
	unreviewedWriteCallIds: string[]; // simple direct writes outside any stage
	failedUnreviewedWriteCallIds: string[];
	request: {
		disposition:
			| 'request_fulfilled'
			| 'request_partial'
			| 'request_uncertain'
			| 'request_unverified';
		outcomeStatus: 'fulfilled' | 'blocked' | 'unfulfilled' | 'failed';
		outcomes: TurnContractOutcomeResult[];
		reasons: string[]; // stable code-owned reasons, empty only when fulfilled
	};
};
```

Rules the tests pin:

- A stage opens at each accepted approval (status `mutation_batch_review_approved`,
  a 64-hex digest) and collects the write executions that follow it. Forged, failed,
  or malformed approvals open nothing. Rejected proposals that never reached the
  adapter are not writes.
- `request_fulfilled` needs a turn contract whose resolution is fulfilled and no
  partial failure. Without a contract the verdict is `request_unverified`: successful
  writes alone are never completion. A post-start partial failure is
  `request_partial` even when the ledger looks complete. `uncertain_external_commit`
  is `request_uncertain`. A clarification stop resolves `blocked`, so partial.
- `isAgenticChatRequestFulfilledV1` is the only predicate that could ever justify a
  host-rendered final change summary in place of the closing model call. Nothing
  consumes it that way yet.

## Persistence

`turn-executor.ts` computes the receipt beside `outcome_status` and writes it as
`completion_receipt` in the assistant message metadata for `completed` terminals
only. Cancelled, failed, stale-generation, and pre-start paths leave none. It needs
no schema change and no extra RPC, so a finalize replay yields the identical receipt
and creates no duplicate effect. Stage call ids are provider tool-call ids; the durable
effect ids live in the mutation ledger rows keyed by turn, generation, and sequence.

## Validation (free, local)

- `completion-receipt.test.ts`: 11 cases covering the case table (approved creates
  with the dependency stage never run, a failed link inside a stage, a wrong due
  date, an approval no write followed, a clarification stop, a partial post-start
  failure over a complete ledger, an uncertain commit, a contract-free direct write,
  forged and failed approvals, replay determinism).
- Executor suite: three new tests (fulfilled two-target move, partial two-of-six move
  naming `missing_targets:outcome_1`, no receipt on a cancelled terminal); 109 passed.
- Runtime and worker typechecks pass after rebuilding the runtime package's `dist`,
  which the worker typecheck reads. ESLint on the changed worker sources is clean.

No live run. The 48/52 baseline stands; the gate is deferred by DJ to the end of this
work.

## Live evidence (2026-09-22 gate, failed 38/52)

All three case 2 terminals carried a `completion_receipt` that matched the ledger. Two of them ran under an implicit five-outcome contract built from the first proposed batch, so the verdict was `request_fulfilled` while the three dependency links were never proposed; one became `request_partial` only because a typed provider failure fired. The receipt is faithful to what was declared and blind to what was not. The batch-lane expectation below is therefore required, not optional, before any host-rendered completion claim. Record: `docs/research/specialist-quality-2026-09-21/tasker92-gate-2026-09-22.json`.

## Live evidence 2 (2026-09-22 DeepSeek rerun, failed 43/52)

Read from `chat_messages.metadata.completion_receipt` on the isolated gate database and joined to the turn captures: a receipt on 43 of 44 captured turns (the missing one is a transport failure that never finalized). Dispositions: 17 `request_fulfilled`, 1 `request_partial`, 25 `request_unverified`, the last only on turns that declared no contract (read-only, clarification and follow-up turns). Case 2 was `request_fulfilled` with two stages (creates, then links) in all three repetitions, so the implicit-contract gap did not surface on this model. Case 1 rep 1, the duplicate-project failure, carries `request_partial` with **two approved stages**: the receipt faithfully recorded the replayed batch, which is how the duplicate was traced to the forced revision pass. Record: `docs/research/specialist-quality-2026-09-21/tasker92-gate-2026-09-22-deepseek.json`.

## Follow-up implementation (September 22): expectation before execution

The default batch reviewer now records `request_expectation` on its first approval,
before any write. It covers the entire durable user commission, including later stages
that need returned IDs. The checklist reuses the existing outcome schema and matcher;
it is never assigned to the acting model's contract state and never grants write
permission. The exact proposed calls still require their own SHA-bound batch approval.
There is no additional planning or review pass on a healthy turn, though the first
reviewer's response contains the checklist.

The worker validates the checklist before accepting an approval. The control execution
persists its normalized form beside `batch_sha256`; the provider verifies that the result
matches the reviewed arguments before releasing held writes. Only the first durable
approval before writes can establish this expectation. Later reviews see the frozen
checklist and cannot shrink or replace it. Missing, late, or mismatched historic
expectations cannot become retrospective proof of request completion.

At a proposed final answer, code reconciles the checklist with execution receipts.
Unfulfilled outcomes trigger at most one acting repair, using saved IDs and the normal
write review. Failed/uncertain writes are not automatically retried. If work remains,
the worker returns a saved-write summary naming the missing outcomes and ends with
`mutation_unfulfilled`. Forced synthesis and duplicate exits retain those missing
outcomes. This replaces the batch promise/gerund regex in the active provider path:
an ordinary sentence cannot trigger another write when the checklist is satisfied.

The V1 receipt adds `expectation: 'reviewed_request'` and `requestExpectation`, containing
the frozen normalized outcomes. An implicit contract derived from attempted writes can
no longer produce `request_fulfilled`. The terminal text guard also reads the checklist,
and persisted `outcome_status` agrees with its resolution. On these turns the receipt
carries request outcomes; the older implicit `turn_contract` metadata is omitted.

Limits: the reviewer still must interpret the user correctly. This verifies durable
outcomes supported by the existing matcher, not subjective answer quality or every
document byte. Exact document text remains the stage reviewer's responsibility. The
existing 20-outcome schema bound applies. Direct-write turns without a pre-write
expectation remain `request_unverified`; their attempted effects are not a substitute
checklist. No host-rendered completion shortcut has been enabled.

Free validation: 351 focused worker tests and 23 receipt tests passed; runtime build,
worker source/test typechecks, and targeted source lint passed. Coverage includes omitted
stages, missing targets, wrong/reversed/failed links, immutable expectations, rejected
malformed approvals, receipt persistence, bounded repair, and healthy turns without
extra passes. The user explicitly skipped the paid gate; live acceptance remains pending.

## Remaining follow-ups

- Live validation of the reviewer-authored checklist and its coverage of the original
  request. The current admission path intentionally omits `turnIntent`; it is not the
  source of this expectation.
- A host-rendered final change summary gated on `isAgenticChatRequestFulfilledV1`.
- Host-compiled dependency plans with references to newly created results remain a
  separate versioned protocol, not a shortcut inside this receipt.
