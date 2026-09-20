<!-- artifacts/agentic-chat-ef4ad9a-regression-handoff.md -->

# Agentic chat `ef4ad9a` regression handoff

## Executive diagnosis

The main regression is in the **durable-mutation contract review path**. Clear update requests reach the correct record, but the acting pass emits an incomplete or malformed turn contract. The independent semantic reviewer then fails to return a decision the harness can bind and validate. The fail-closed fallback converts that internal review failure into a user clarification, even when the user already supplied an exact UUID and exact final values.

This is most likely a combined **prompt/schema regression plus a harness observability gap**:

1. The acting model is producing worse contract declarations: missing `required_fields` and `changes`, repeated target IDs, and inappropriate symbolic labels for records that already exist.
2. The reviewer repair path, which successfully corrected incomplete declarations in the previous release, now returns an invalid or unbound decision across task updates, document updates, and relationship writes.
3. The harness collapses several distinct reviewer failures into one generic `harness_review_fallback` reason, so production telemetry does not reveal whether the rejected decision had a bad SHA, invalid schema, unparseable corrected contract, disallowed revision, or another validation issue.

Confidence is **high** that the failure boundary is the contract-review pipeline. Confidence is **moderate** about the exact defective line because the rejected private reviewer output and its validation errors are not retained in the turn events examined here.

The full browser retest is in [agentic-chat-failed-cases-ef4ad9a.md](/Users/djwayne/buildos-platform/artifacts/agentic-chat-failed-cases-ef4ad9a.md). Exact case scores, run receipts, and independently queried state are in the adjacent JSON artifacts.

## Release differential

The comparison is between:

- Previously tested release: `4ac73bde73bdf34c747f3db8cc272139a59c8097`
- Regressed release: `ef4ad9a10efd38268be8982b6b8565ec0472c78f`

The new release is one commit after the previous test target. It directly changed the contract-review prompt, effect-field descriptions, task duration field normalization, relationship-label contracts, mutation authorization, and contract fulfillment logic. The relevant diff is 203 insertions and 14 deletions across seven files.

Most relevant changed files:

- [provider/review/turn-contract.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts:32): reviewer system prompt, task-duration semantics, and instructions for dependency link outcomes.
- [provider/contract-fields.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/contract-fields.ts:34): update-task effect fields and nested `props.duration_minutes` discovery.
- [runtime turn-contract.ts](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/loop/turn-contract.ts:540): `src_label`/`dst_label` parsing, relationship validation, task field aliases, serialization, and fulfillment.
- [provider/validation.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/validation.ts:250): authorization for labelled relationship endpoints.
- [provider/review/contract-execution.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/review/contract-execution.ts:23): completion instructions for unresolved relationship endpoints.

The generic production fallback is generated in [decision-completion.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/review/decision-completion.ts:51). At line 114, several rejection branches become the same message: `Independent semantic review returned an invalid or unbound decision.` That file was not changed in the release, but it is where the newly invalid reviewer output becomes a misleading clarification.

## Strongest before/after evidence

### Narrow task update

The same scenario succeeded at the mutation layer on `4ac73bd` and was blocked before mutation on `ef4ad9a`.

| Release   | Run                                    | Observed control flow                                                            | Durable result                                                                  |
| --------- | -------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `4ac73bd` | `f9640b74-43d8-4512-b834-a7cb81f85858` | `declare_turn_contract` → `approve_turn_contract_review` → `update_onto_task`    | Update succeeded. The old release still had a later fulfillment-accounting bug. |
| `ef4ad9a` | `bd67667d-f390-4f73-88f9-b963a11857b0` | `get_onto_task_details` → `declare_turn_contract` → `request_turn_clarification` | No update tool call; task unchanged.                                            |
| `ef4ad9a` | `f0c2b495-7147-40d4-8a63-55dc6188d4a2` | Exact UUID in prompt → `declare_turn_contract` → `request_turn_clarification`    | No update tool call; task unchanged.                                            |

The prior task contract contained one target plus:

```json
{
	"required_fields": ["due_at", "duration_minutes"],
	"changes": [
		{ "field": "due_at", "value": "2026-09-22" },
		{ "field": "duration_minutes", "value": "120" }
	]
}
```

Both new-release task contracts omitted `required_fields` and `changes`. The first new contract also repeated the same target UUID 50 times in raw `target_ids`; normalization reduced it to one. The exact-UUID recovery had one clean target ID and still failed, so the repeated-ID defect is evidence of degraded contract generation but is not sufficient to explain the fallback.

The user prompt was already fully bound. The exact-UUID retry rules out genuine entity ambiguity, and the final values were explicitly supplied. A clarification is therefore the wrong product behavior even if the proposed contract needs internal repair.

### Selective document update

The document case isolates the reviewer regression from task field schemas.

| Release   | Run                                    | Observed control flow                                                                                   | Durable result                           |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `4ac73bd` | `259f6a28-2555-47d1-b54f-aa6828941f9b` | `declare` → two `request_proposal_revision` passes → `approve` → read document → `update_onto_document` | Exact edit saved successfully.           |
| `ef4ad9a` | `aacf658a-5b28-4c76-b16f-eff62e012a80` | Read exact document → `declare` → `request_turn_clarification`                                          | No update tool call; document unchanged. |

Both releases began with a document contract containing one exact target and no `required_fields` or `changes`. On the previous release the reviewer repaired that incomplete contract and approved it. On the new release the reviewer path produced the generic invalid/unbound fallback instead. This is the cleanest evidence that the reviewer repair behavior regressed.

### Relationship-only recovery

Run `78adb24c-7382-4421-ac3b-6b0a9f734dd3` loaded all five existing tasks. The acting model declared three relationship outcomes twice:

1. The first declaration used `src_label` and `dst_label` such as `order_cabinets` and `confirm_permit`. Those labels did not belong to create outcomes in the same contract; all tasks already existed.
2. The second declaration removed the labels but did not replace them with `src_id`/`dst_id` changes.

The reviewer then fell back to the same invalid/unbound clarification. No relationship tool was called and zero edges were saved.

This points to a prompt/example problem in addition to the generic reviewer failure. The new reviewer instruction correctly describes labels for tasks created in the same contract, but the acting pass applied that pattern to pre-existing tasks. The tool/context guidance should explicitly distinguish:

- Same-turn creates: use create labels, then `src_label`/`dst_label`.
- Existing records: use their loaded UUIDs as `src_id`/`dst_id` changes.

The reviewer should be able to repair the second situation from loaded evidence without asking the user.

## Why this is not primarily a missing-tool problem

- The prior release called `update_onto_task` and `update_onto_document` successfully for the same scenarios.
- The new release advertises the mutation surface and reports 25 mutation capabilities.
- Current runs stop before the update or relationship mutation tool. The blocking call is a control tool generated by the review harness.
- Exact record reads succeed before the fallback.

The relationship flow does need better tool-use guidance, but the capability exists. The failure occurs in contract construction and review before execution.

## Why this is not real user ambiguity

Four heterogeneous turns produced the identical fallback:

- Named single-task update.
- Exact-UUID single-task update.
- Exact-document update after loading the record.
- Three relationships after loading all five endpoints.

Every fallback recorded:

```text
status: clarification_required
reason: Independent semantic review returned an invalid or unbound decision.
decided_by: harness_review_fallback
question: I could not safely verify the exact target and values for this change. Which exact item should I change, and what should the final value be?
```

The exact-UUID case already answered both parts of that question. The document case also had one loaded target and exact replacement text. The harness is exposing its inability to validate an internal reviewer decision as if the user omitted information.

## Likely mechanism

The most likely sequence is:

1. The acting model declares a minimal contract without required effect fields or scalar changes.
2. The contract is accepted by the declaration parser because those fields are optional at that boundary.
3. Independent review is expected to approve or emit a typed corrected contract.
4. Changes to the reviewer prompt and contract schema cause the provider to emit a decision that is truncated, malformed, uses the wrong field shape, has the wrong contract SHA, or cannot be bound.
5. `completeTurnContractReviewDecision` rejects it and emits the generic clarification fallback.
6. Forced synthesis renders that clarification and the run ends `completed/stop`, masking the internal review failure as a successful turn.

Production evidence does not retain which condition in step 4 fired. That missing discriminator should be fixed first or alongside the behavior change; otherwise another prompt adjustment will be difficult to validate.

## Separate orchestration regression: failure after partial writes

Two task-recovery runs created durable records and then ended `provider_forced_synthesis_failed`:

- `9a31d293-dc9a-4cda-a0b8-9f65f088f10d`: two tasks created, then failed.
- `65307e1e-52b2-4019-aa96-0a3285614401`: three tasks created, then failed.

The throw occurs in [turn-provider.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/agentic-chat/provider/turn-provider.ts:1741) after forced-synthesis retries yield neither usable prose nor an admissible terminal response. This is probably distinct from semantic decision binding, although both live in the multi-pass provider orchestration.

The serious product issue is partial durability plus a failed turn. A user retry can duplicate work unless every recovery re-reads and deduplicates. The terminal response should acknowledge successful effects even when final synthesis fails, or a deterministic receipt renderer should take over.

## Other findings that should not be conflated with the regression

### False project ambiguity

The task-batch prompt searched for one exact project name but treated the matching project and its Context Document as two candidate projects. This is a search result typing/ranking or acting-context issue. It caused a 172.4-second dead turn before any write.

### Personal calendar

Calendar reads are a separate production-configuration problem. Both connected sources returned `credentials_unreadable`; the worker reported that the token-encryption key could not decrypt stored credentials and Google was never contacted. The assistant response handled this honestly. This is not caused by the mutation-contract regression.

The earlier release reported `credentials_not_configured`, while this release reports `credentials_unreadable`. That suggests credentials or an encryption key are now present but are incompatible with the stored ciphertext. Verify the deployed encryption secret against the environment that wrote the connection tokens, then reconnect/rotate tokens if the secret cannot be restored.

### Start Here

The asynchronous refresh works after project chat closes. The remaining **Open document** problem is a front-end navigation bug: the modal closes and Project Overview remains selected. It is unrelated to agent contract review.

### Owner-report grounding

Read-only retrieval remains accurate, but the assistant still converts missing evidence into broad claims such as no payments or permits not approved. That is a prompt/synthesis grounding issue and was unchanged at 3/4.

## Recommended investigation order

1. **Expose the actual reviewer rejection reason.** In `completeTurnContractReviewDecision`, record a structured reason before replacing it with the generic fallback: unexpected control tool, revision disallowed, corrected-contract parse failure, SHA mismatch, validation issue list, ambiguity gate, or unexecutable effect fields. Include provider `finishedReason` and whether the accumulated tool call was complete/truncated. Avoid storing sensitive prompt content.
2. **Replay the three production contract shapes.** Use the exact task, document, and existing-relationship declarations from the run IDs above. Exercise the real reviewer request builder and the same production model/provider path if possible; mocked reviewer calls cannot reveal model/schema incompatibility.
3. **Compare reviewer request payloads at both SHAs.** Inspect tool schemas, system-prompt length, contract SHA placement, field-semantics text, and available control tools. Confirm the provider sees exactly one valid decision tool and enough output-token budget to complete it.
4. **Make deterministic repairs in code where user intent is already bound.** Missing `required_fields`/`changes` for one exact update can be derived from the acting prompt and admitted mutation schema, or sent through a bounded reviewer revision. Internal incompleteness should not become user clarification unless an actual user-owned choice remains.
5. **Clarify relationship contract guidance.** Add an explicit existing-record example using `src_id`, `dst_id`, endpoint kinds, and `rel=depends_on`. Reserve `src_label`/`dst_label` for labelled creates in the same contract.
6. **Add a deterministic final receipt fallback.** If durable writes succeeded but forced synthesis fails, render the write ledger rather than terminally failing the whole turn.
7. **Fix exact-match entity typing.** A Context Document must not appear as a second project choice for an exact project lookup.

## Tests the current suite appears to miss

The release added [agenticChatRetest20260904Regressions.test.ts](/Users/djwayne/buildos-platform/apps/worker/tests/agenticChatRetest20260904Regressions.test.ts:1), including valuable contract-normalization tests. Those tests mostly supply mocked reviewer decisions. They prove that code handles a known valid or repairable decision; they do not prove that the configured reviewer can produce one from the real prompt and tool schema.

Add at least these integration or recorded-replay tests:

1. Exact task UUID + due date + nested duration update reaches `update_onto_task` after review.
2. Exact document ID + selective content edit reaches `update_onto_document` after a bounded reviewer correction.
3. Three already-existing task UUID pairs produce three authorized `link_onto_entities` calls without labels.
4. Five same-turn task creates with three labelled dependencies bind endpoints and create all edges.
5. Reviewer output truncated, missing SHA, invalid corrected contract, and validation failure each produce distinct internal telemetry; only true candidate ambiguity asks the user.
6. Successful writes followed by empty/stray synthesis output end with a deterministic effect receipt, not `provider_forced_synthesis_failed`.
7. An exact project name plus a same-named Context Document resolves directly to the project record.

## Acceptance criteria

- The original case-4 prompt changes the one cabinet task to Sep 22 local and 120 minutes in one turn.
- Supplying the exact task UUID follows `declare → approve/revise → update`, never `harness_review_fallback`.
- The selective Marketing Brief edit updates one document in place and preserves every protected byte.
- The five-task prompt creates five tasks and exactly three dependency edges in one successful turn.
- No successful durable write can end as an opaque failed turn.
- Internal reviewer failure is observable as a specific engineering code and is not presented as user ambiguity.
- The targeted five-case subset returns to at least 13/20 before running the full battery; task update should be 4/4 and task dependencies should be 4/4.

## Production IDs for trace lookup

| Purpose                                     | Turn run ID                            |
| ------------------------------------------- | -------------------------------------- |
| Previous task mutation succeeded            | `f9640b74-43d8-4512-b834-a7cb81f85858` |
| Current named task update blocked           | `bd67667d-f390-4f73-88f9-b963a11857b0` |
| Current exact-UUID update blocked           | `f0c2b495-7147-40d4-8a63-55dc6188d4a2` |
| Previous document repair/update succeeded   | `259f6a28-2555-47d1-b54f-aa6828941f9b` |
| Current document update blocked             | `aacf658a-5b28-4c76-b16f-eff62e012a80` |
| Existing-task relationship contract blocked | `78adb24c-7382-4421-ac3b-6b0a9f734dd3` |
| Two writes then forced-synthesis failure    | `9a31d293-dc9a-4cda-a0b8-9f65f088f10d` |
| Three writes then forced-synthesis failure  | `65307e1e-52b2-4019-aa96-0a3285614401` |

Retained synthetic project: `ad4580e6-19aa-4f94-95a1-e00ed1337bb6`.
