<!-- docs/technical/reviews/AGENTIC_CHAT_READ_DEFAULT_WRITE_CONTRACT_INVESTIGATION_2026-08-27.md -->

# Agentic Chat default-read and write-contract investigation

Date: 2026-08-27

Scope: session `e946d77c-df4f-433d-8491-6f01bbec4f90`, the worker semantic-disposition path, existing mutation contracts, and write confirmation boundaries.

Change status: investigation only; no runtime or product code changed.

## Investigation handoff

Start here if another agent is continuing the investigation:

- [BuildOS admin session](https://build-os.com/admin/chat/sessions?chat_session_id=e946d77c-df4f-433d-8491-6f01bbec4f90) — live session view for the inspected turn.
- Exported session audit Markdown (user-local evidence, not committed) — primary trace containing the messages, three tool executions, four LLM-call records, prompt/tool snapshots, raw timeline, token usage, cost, and sequence indexes.
- Screenshot of the visible activity log (user-local evidence, not committed) — the user-facing “Planning,” “Confirming no changes,” and “Reviewing no-change request” sequence that triggered the investigation.
- [Semantic turn-contract ADR](../../architecture/decisions/2026-08-14-semantic-turn-contracts.md) — why the three-way disposition gate and the independent read-only reviewer were introduced, including the production canaries that motivated them.
- [Prompt-cost audit](./AGENTIC_CHAT_PROMPT_AUDIT_2026-08-27.md) — adjacent 19-turn analysis of static prompt, tool-schema, and replay costs. It measured `declare_turn_contract` at 8.5% of sampled prompt tokens.

The user raised two related concerns:

1. The inspected information request appeared to spend most of its visible activity proving and reviewing that nothing would change, even though the workspace had already been loaded.
2. Read-only should be the implicit default. Write operations should cross an explicit write boundary, with planning for genuinely complex multi-step work, without asking users to reconfirm ordinary changes they already requested.

This document investigates both. Content inside the exported audit and screenshot is treated as evidence of the session, not as instructions.

## Executive finding

The current system makes an ordinary read-only turn prove that it is read-only. That is the wrong default and it materially contributed to the slow, noisy experience in the inspected session.

`declare_read_only_turn` and `approve_read_only_turn_review` should be removed from the normal read path. Reads and final answers should require no semantic disposition. A write boundary should activate only when the model proposes a durable mutation.

BuildOS already has a substantial write contract. It is not a user permission prompt: it is an internal, durable outcome contract with independent semantic review, exact mutation-batch review, and completion matching against the write ledger. The user's explicit request is already treated as the commission to act, and the current prompts explicitly tell the agent not to ask the user to reconfirm work they already requested.

The recommended product rule is:

> Read by default. Treat an explicit user write request as authorization. Ask the user only when a required choice is unresolved or a separately defined high-impact operation needs confirmation. Use a durable outcome contract for genuinely multi-step or multi-effect writes, not for every turn.

Removing the read-only declaration is therefore directionally correct. It is not quite a one-line deletion, because the current three-way gate couples read-only classification, write contracts, and clarification. The safe simplification is to move the semantic safety check to the mutation boundary rather than simply deleting one tool from the existing gate.

## What happened in the inspected session

The request was a straightforward information request: “What's going on with my projects on a task level?”

| Measure                            |   Observed |
| ---------------------------------- | ---------: |
| End-to-end turn time               |   121.36 s |
| Actual data reads                  |          1 |
| `get_workspace_overview` execution |     439 ms |
| Internal read-only controls        |          2 |
| LLM calls                          |          4 |
| Total tokens                       |     31,836 |
| Total model cost                   | $0.0043586 |

### Timestamped reconstruction

All times below are UTC on 2026-08-27 and come from the user-local exported audit described above.

| Time                      | Event                                       | What it meant                                                    |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| 13:33:10.425              | Global chat session created                 | Workspace/global context assembly began before the user message. |
| 13:33:12.506              | User asked for project status at task level | Informational request; no mutation was commissioned.             |
| 13:33:14.490–13:33:16.276 | Acting model call 1                         | Selected `get_workspace_overview`.                               |
| 13:33:18.009              | Workspace overview persisted                | The only data read completed in 439 ms.                          |
| 13:33:18.404–13:33:20.199 | Acting model call 2                         | Produced `declare_read_only_turn` rather than the answer.        |
| 13:33:20.744              | Read-only declaration persisted             | Internal control; no user data changed.                          |
| 13:33:21.461–13:33:23.902 | Independent reviewer call                   | Verified that the information request was really read-only.      |
| 13:33:24.935              | Read-only approval persisted                | Second internal control; no user data changed.                   |
| 13:33:25.291–13:33:45.019 | Acting model call 4                         | Generated the final 552-token answer.                            |
| 13:35:13.648              | Stream reached sequence 210                 | Approximately 88.6 seconds after provider generation completed.  |
| 13:35:13.866              | Final assistant message persisted           | End-to-end time: 121.36 seconds.                                 |

The audit metadata says `request_prewarmed_context=false`, but that does not mean the model started without workspace context. The prompt snapshot contains a bounded loaded-context index and workspace-level project/timeline information. The later `get_workspace_overview` result was generated at 13:33:17.950 and added a task rollup for 10 of 33 accessible projects. The final prose then said “out of 44 accessible projects,” reflecting the broader loaded workspace context rather than the tool result. That 33-versus-44 discrepancy is another reason to trace the preload and overview sources separately.

The four provider calls were:

1. Choose `get_workspace_overview` — 1.786 s.
2. After the read, declare the turn read-only — 1.795 s.
3. Independently approve that read-only declaration — 2.441 s.
4. Produce the answer — 19.728 s.

The read-only declaration and its reviewer consumed 17,681 prompt/completion tokens and about $0.0031, roughly 71% of the turn's model cost. Their tool executions themselves took 0 ms and 1 ms; the overhead was the two provider passes, repeated context, durable transitions, and UI activity they caused.

The 439 ms workspace read was not the source of the two-minute response. It was also not completely valueless: the preloaded workspace context already contained project orientation, recent activity, and aggregate workspace signals, but the overview result supplied the project-by-project task rollup used in the answer. The product issue is that a task-status question had to fetch a second workspace summary instead of receiving the relevant rollup in its initial context. This should be fixed by enriching or specializing the preload, not by forbidding a useful read when the loaded context is insufficient.

There was a second, larger latency problem after the models finished. The final model call began at approximately 13:33:25 and reported a 19.728 s provider duration, but the final message was not durable until 13:35:13. The trace contains approximately 196 final text-delta sequences. The executor currently [appends each text delta and awaits its individual delivery](../../../apps/worker/src/workers/agentic-chat/turn-executor.ts#L498-L503) before accepting the next delta, even though the publisher is [configured to batch at 3 KB or 150 ms](../../../apps/worker/src/workers/agentic-chat/streamPublisher.ts#L29-L31). That serial acknowledgement path appears to account for roughly 89 seconds between model completion and the final durable response. This is separate from the read-only design, and is likely the largest single wall-clock defect in this trace.

## Why the UI showed “a lot of nothing”

The visible activity accurately reflected internal machinery, but the machinery was not useful to the user:

- After any read round without a disposition, the worker [forces a semantic-disposition pass](../../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts#L1064-L1069).
- Before final prose without a disposition, the worker can [withhold the prose and force the same pass](../../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts#L503-L519).
- The pass [requires exactly one](../../../apps/worker/src/workers/agentic-chat/provider/review/disposition.ts#L132-L176) of `declare_turn_contract`, `declare_read_only_turn`, or `request_turn_clarification`.
- A read-only declaration then invokes a distinct model reviewer because [the declaration is treated as an untrusted semantic claim](../../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts#L1386-L1390).
- Every tool round [emits the generic activity “Planning the first step...”](../../../apps/worker/src/workers/agentic-chat/provider/steps.ts#L24-L45).
- The web presenter deliberately renders the internal controls as [“Confirming no changes requested” and “Reviewing no-change request”](../../../apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts#L1139-L1144).

That explains the duplicate planning messages and the two no-change messages in the screenshot. They are not evidence of useful work; they expose protocol implementation details as user-facing progress.

## What write contracts already exist

There are four different concepts that can be mistaken for “permission”:

| Concept                     | Current mechanism                                                  | Should the user be asked?                  |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| Data access authorization   | Project membership/RLS and worker actor checks                     | No; enforce automatically                  |
| User commission             | The user's explicit request to create/update/move/etc.             | No second confirmation for ordinary writes |
| Internal execution contract | `declare_turn_contract` plus reviewers and ledger matching         | Internal; normally invisible               |
| High-impact confirmation    | Operation-specific preview/token or a destructive-operation policy | Yes, only when that policy is triggered    |

### 1. Platform authorization

BuildOS already distinguishes read, write, and admin access at the data layer. Project children require read access for `SELECT` and write access for `INSERT/UPDATE/DELETE`; project deletion requires admin access. Service-role code has a separate explicit actor membership check and is not supposed to treat service-role access as authorization ([authentication and permissions architecture](../../architecture/AUTHENTICATION_AND_PERMISSIONS.md#L45-L66)).

This is the real permission boundary. A language-model declaration should never substitute for it.

### 2. User commission

The semantic reviewer treats an explicit request as the commission to mutate. Current guidance says that explicitly delegated choices are resolved, several commissioned changes belong to one contract, and the agent should not ask the user to reconfirm them ([semantic commission guidance](../../../apps/worker/src/workers/agentic-chat/provider/review/controls.ts#L9-L22)). Project creation repeats the rule directly: [“Do not ask the user to reconfirm work they already requested”](../../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts#L132-L142).

So a request such as “mark the launch task done” is already permission for that update, subject to access checks and a uniquely resolved target. Asking “May I mark it done?” would add friction without adding meaningful consent.

### 3. The durable write contract

`declare_turn_contract` already provides the multi-step write plan the question is asking about. It describes user-visible outcomes rather than tool steps:

- action and entity kind;
- known eligible target IDs;
- required durable fields and values;
- minimum number of distinct successful effects;
- labels that bind entities created in an earlier step to later dependent moves.

The contract is only a proposal. On the worker path:

1. An independent reviewer checks the exact SHA-bound contract against the full user turn.
2. The acting model proposes concrete mutation calls.
3. A second independent reviewer checks every exact target and value in the SHA-bound mutation batch against the approved commission before execution.
4. Successful effects enter a durable write ledger.
5. Finalization verifies cardinality, target identity, and required fields, and carries unfinished outcomes forward.

This is a strong contract for an operation such as “organize these documents into sensible folders,” where reads, container creation, returned IDs, moves, and several distinct effects must all line up. It is considerably more than a lightweight plan.

### 4. Clarification and high-impact confirmation

`request_turn_clarification` is not a general write-permission prompt. It is for a real unresolved choice: multiple plausible targets, or a required value that neither the user nor loaded context resolves. It prevents a write rather than asking the user to approve an already clear instruction.

There are also narrower confirmation boundaries for actual impact. For example, a clean cross-project task move executes immediately, but a move that must remove incompatible relationships or assignees returns an impact preview and `confirmation_token`. The user must [confirm those exact effects in a later turn](../../../apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts#L199-L219). Irreversible delete tools are currently [deferred from the reviewed worker surface](../../../apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts#L513-L548) under `irreversible_delete_without_tombstone`.

Those are appropriate places for confirmation. A normal task update is not.

## Why `declare_read_only_turn` was added

The read-only reviewer was not added because reads are dangerous. It was added after a canary showed that, on an ambiguous commissioned mutation, the acting model could label the turn read-only and thereby avoid the write-contract reviewer. The architecture decision therefore [treats read-only as an untrusted claim](../../architecture/decisions/2026-08-14-semantic-turn-contracts.md#L35-L42) and asks a second model to verify that no durable change was commissioned.

That closes a real correctness loophole, but at the wrong boundary. A false read-only decision can cause the agent to skip requested work; it cannot itself mutate data. The dangerous event is an actual proposed write with a guessed target or value. That event is already held before execution and independently reviewed.

In other words, the current design spends write-grade semantic review on every read turn to prevent a missed write. That is a completeness safeguard, not a data-safety safeguard. The inspected session shows that its routine latency, cost, prompt weight, and UI noise are too high for the value it provides.

## Recommended contract

### Default path: read and answer

- Start with read access and loaded context.
- Answer directly when loaded context is sufficient.
- Call pure-read tools freely when more current or detailed data is required.
- Do not call `declare_read_only_turn`.
- Do not invoke an independent no-change reviewer.
- Do not require any semantic disposition before final prose.

No write proposal means no durable side effect. That is the default safety property.

### Simple write path

For one clear, bounded mutation—such as completing one uniquely identified task or changing one date:

1. Treat the user's explicit instruction as the commission; do not ask again.
2. Hold the exact proposed mutation at the existing pre-execution boundary.
3. Check project access, tool admission, target identity, arguments, idempotency, and scope.
4. Review the exact proposed mutation against the user request when semantic target/value review is required.
5. Execute and record the durable effect.

This can use a lightweight implicit contract derived from the exact held call and the user's commission. It should not require the full `declare_turn_contract` schema plus a separate contract-review call before the exact batch is reviewed.

### Complex write path

Use the existing durable outcome contract when a request has any of these properties:

- more than one distinct required effect;
- multiple targets or different values across targets;
- dependent writes that consume IDs from earlier writes;
- reads followed by a nontrivial organization or transformation;
- an operation that must continue across turns;
- a meaningful partial-completion or recovery risk.

For these turns, keep contract review, exact mutation-batch review, ledger matching, and unfinished-outcome carry-forward. A short user-visible plan can be shown when it helps explain the work, but the internal contract should remain hidden and should not create an approval detour when the user already commissioned the result.

### Ask the user only at real decision boundaries

Ask for input when:

- several targets plausibly match the user's description;
- a required outcome/value cannot be inferred or was not delegated;
- an operation-specific impact preview requires confirmation;
- the operation is irreversible, externally visible, or unusually broad under an explicit product policy.

Do not ask for input merely because a write exists, because a multi-step plan exists, or because the model must choose ordinary implementation details inside a delegated outcome.

## Proposed state model

```text
START (read-only by default)
  |
  +-- needs information --------------------> read tools -> answer
  |
  +-- proposes a durable mutation
        |
        +-- unresolved user choice ---------> clarification; no write
        |
        +-- high-impact confirmation needed -> preview/confirm; no write yet
        |
        +-- simple bounded write ------------> exact-call review -> execute -> receipt
        |
        +-- complex/multi-effect write ------> outcome contract -> exact-batch review(s)
                                                -> execute -> ledger fulfillment
```

There is intentionally no “prove no write” branch.

## Important implementation caution

The current code [requires all three disposition controls](../../../apps/worker/src/workers/agentic-chat/provider/review/disposition.ts#L101-L110) to build the gate, and the [gate builder returns no gate](../../../apps/worker/src/workers/agentic-chat/provider/review/disposition.ts#L132-L150) if any is absent. Deleting `declare_read_only_turn` alone would therefore also disable the present pre-mutation gate. The replacement must first make the mutation boundary self-sufficient:

- direct/simple proposed writes need an implicit or lightweight contract path;
- complex writes continue to use `declare_turn_contract`;
- exact proposed mutations remain withheld until their applicable validation/review completes;
- `request_turn_clarification` remains available from the write reviewer;
- final prose on a no-write turn is allowed without classification.

Removing the read-only reviewer does mean the runtime will no longer use a second model to catch every case where the acting model silently skips a commissioned write. That is an acceptable trade if it is treated as an answer-quality/completeness defect rather than a mutation-safety defect. It should be monitored with targeted commissioned-write evaluations and telemetry, not prevented by taxing all read traffic. If a hard runtime guarantee is still required, it should be limited to turns already routed or identified as write commissions—not universal read turns.

## Recommended sequence for a later implementation

1. Fix serial final-text delivery first; it was the largest wall-clock defect in this trace.
2. Make simple direct mutations reviewable at the exact-call boundary without a full declared contract.
3. Remove `declare_read_only_turn`, its independent reviewer, and the pre-final no-disposition gate from the default path.
4. Retain `declare_turn_contract` for complex/multi-effect work and slim or materialize its large schema only when needed. The current prompt audit measured it at 8.5% of all sampled prompt tokens despite one use in 19 turns.
5. Keep ambiguity clarification and operation-specific high-impact confirmation.
6. Stop rendering internal control tools as user-facing activity. Show real reads, meaningful work phases, mutations, and outcomes.
7. Add timing spans for provider generation, semantic review, publisher queueing, durable acknowledgement, and client render so future regressions are attributable immediately.
8. Enrich the workspace preload with task rollups for task-status questions and reconcile the observed accessible-project count discrepancy between preload and overview results.

## Decision recommendation

Proceed with a design change that removes read-only declaration/review and makes read-only the implicit default. Do not introduce a blanket “ask permission to write” interaction. Preserve the user's explicit instruction as the authorization for ordinary writes, preserve platform access checks, and reserve user confirmation for ambiguity or defined high-impact effects.

Keep the existing durable contract, but narrow it to the complex writes it is good at. For simple writes, review the exact held mutation once at the write boundary and record its effect. This is the smallest architecture that preserves the important safety property—no unreviewed mutation—without making every information request pay to prove that nothing will change.

## Primary evidence

### Session artifacts

- [Live admin session](https://build-os.com/admin/chat/sessions?chat_session_id=e946d77c-df4f-433d-8491-6f01bbec4f90)
- User-supplied session export (local evidence; not committed)
- User-supplied screenshot (local evidence; not committed)

### Design and prompt context

- [Semantic turn-contract ADR](../../architecture/decisions/2026-08-14-semantic-turn-contracts.md)
- [Authentication and permissions architecture](../../architecture/AUTHENTICATION_AND_PERMISSIONS.md)
- [Prompt-cost audit](./AGENTIC_CHAT_PROMPT_AUDIT_2026-08-27.md)
- [Loaded-context and overview prompting](../../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts#L93-L103)
- [Instruction to start with loaded context](../../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts#L947)

### Read-only and write-contract implementation

- [Control tool definitions](../../../packages/agentic-chat-runtime/src/catalog/definitions/controls.ts#L1-L205)
- [Durable turn-contract parser, normalization, fulfillment, and carry-forward](../../../packages/agentic-chat-runtime/src/loop/turn-contract.ts)
- [Worker disposition and read-only review request](../../../apps/worker/src/workers/agentic-chat/provider/review/disposition.ts)
- [Worker read/final/pre-mutation gates](../../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts#L480-L525)
- [Independent contract reviewer](../../../apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts)
- [Independent exact mutation-batch reviewer](../../../apps/worker/src/workers/agentic-chat/provider/review/mutation-batch.ts)
- [Mutation admission and operation-specific confirmation policy](../../../apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts)

### Visible activity and streaming

- [Generic “Planning the first step” event](../../../apps/worker/src/workers/agentic-chat/provider/steps.ts#L24-L45)
- [UI labels for read-only control activity](../../../apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts#L1139-L1144)
- [Per-text-delta delivery await](../../../apps/worker/src/workers/agentic-chat/turn-executor.ts#L498-L503)
- [Publisher batching configuration](../../../apps/worker/src/workers/agentic-chat/streamPublisher.ts#L29-L47)

## Suggested follow-up questions for another agent

1. Confirm the approximately 88.6-second post-provider gap by correlating text-batch RPC timestamps, publisher queue receipts, and database sequence rows—not only the executor source shape.
2. Determine whether `await queued.delivery` on every provider delta defeats batching in production or whether another layer coalesces deltas before `turn-executor.ts` sees them.
3. Trace why the loaded global context reported 44 accessible projects while `get_workspace_overview` reported 33, and identify which source is authoritative.
4. Prototype the smallest simple-write boundary that can review an exact held mutation without requiring the full `declare_turn_contract` schema and contract-review pass.
5. Re-run the original ambiguity and restraint canaries against a default-read design to prove that guessed writes still fail closed while true read turns incur no semantic review.
6. Measure end-to-end latency, tokens, cost, and visible activity for the inspected question before and after removing the read-only path.
