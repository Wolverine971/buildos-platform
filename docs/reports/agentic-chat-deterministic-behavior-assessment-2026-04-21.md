<!-- docs/reports/agentic-chat-deterministic-behavior-assessment-2026-04-21.md -->

# Agentic Chat Deterministic Behavior Assessment

- **Date:** 2026-04-21
- **Trigger:** Qwen 3.6 Plus fantasy-novel replay exposed repeated product-level misses that should not depend on the model following prompt prose.
- **Related audit:** `docs/reports/agentic-chat-session-audit-fantasy-novel-qwen36-plus-2026-04-21.md`

## Executive Summary

The current product has the right ideas, but enforcement is split across prompts, skills, tool-surface selection, write ledgers, repair instructions, and route persistence. That means a capable model can still miss deterministic product obligations without any tool failure.

The fix should be runtime ownership, not more prompt copy. Prompts and skills should express intent and examples. The stream orchestrator and tool policy layer should derive obligations from the user turn, verify the actual tool write set, and either repair or synthesize the safe final outcome.

The three deterministic behaviors should be owned as follows:

| Behavior               | Current owner                             | Correct owner                        | Fix                                                                                                         |
| ---------------------- | ----------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Post-tool finalization | Prompt + partial repair checks            | Stream orchestrator                  | Add a finalization guard that never persists a pre-tool lead-in when writes succeeded.                      |
| Progress capture       | Prompt + task skill + tool-selector regex | Deterministic turn-obligation policy | Detect progress claims before tool use, require a progress write, then verify the write set.                |
| Existing-task updates  | Task skill prose                          | Existing-entity resolver + verifier  | Resolve high-confidence task references before writes, then block or repair duplicate create-only behavior. |

## Current Enforcement Map

### Prompt Rules

`apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` already tells the model to:

- ground final responses in actual tool results
- mention successful writes
- include `state_key` when task work visibly advances
- honor document placement as a create-then-tree-move contract

These are useful instructions, but they are not guarantees. The Qwen turn-1 miss happened even with these rules present.

### Skill Rules

`apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md` gives the model the correct workflow:

- reuse exact `task_id` for clear follow-ups
- search/list when the ID is not known
- include `state_key` when real-world task work advanced
- never emit empty task updates

This is the right place for playbook details, but not the right place for product invariants. The model can simply create new tasks and never touch the existing one.

### Tool Surface Selection

`apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts` and `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts` already classify mixed turns such as "Chapter 2 is complete, draft chapter 3, and save notes" into the combined write/document surface.

This ensures tools are available. It does not ensure the model uses the right combination of tools.

### Runtime Write Ledger

`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/write-ledger.ts` builds a compact post-tool write ledger, and `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts` injects it after each tool round.

This is good grounding context. It still depends on the model producing a correct final message after receiving the ledger.

### Runtime Final Integrity

`apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts` has `enforceMutationOutcomeIntegrity(...)`, which prevents false success claims and some unsupported write claims.

The gap is that it sanitizes an available final answer. It does not create a safe final answer when the model stops after only the optimistic pre-tool lead-in.

### Persistence Fallback

`apps/web/src/routes/api/agent/v2/stream/+server.ts` persists `finalAssistantText` first, then falls back to `assistantText`.

That fallback is the direct failure mode from the Qwen turn-1 replay: if the only emitted user-visible text is the pre-tool lead-in and no final text is produced, the persisted assistant message can say "I'll create..." after the project was already created.

## Recommended Architecture

### 1. Add a Post-Tool Finalization Guard

Create a small runtime module, for example:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-guard.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-guard.test.ts`

The guard should run after the model reaches a final no-tool state and before `resolvePersistableAssistantContent(...)`.

Inputs:

- `assistantText`
- `candidateFinalText`
- `toolExecutions`
- `contextType`

Rules:

- If no durable writes succeeded, keep current behavior.
- If writes succeeded and the final text is empty, synthesize a short outcome from the write ledger.
- If writes succeeded and final text is only a pre-tool intent lead-in, replace it with a short outcome from the write ledger.
- If writes failed, mention the failure and do not claim success.
- If documents were created but not tree-moved, do not claim placement.

This should be deterministic string generation from the actual tool execution records, not another LLM pass.

### 2. Add Turn Obligations Before Tool Use

Create a deterministic policy layer, for example:

- `apps/web/src/lib/services/agentic-chat-v2/deterministic-policies/turn-obligations.ts`
- `apps/web/src/lib/services/agentic-chat-v2/deterministic-policies/progress-capture.ts`
- `apps/web/src/lib/services/agentic-chat-v2/deterministic-policies/existing-task-resolver.ts`

The policy should derive obligations from the user message and bounded project context before the first model call.

Example obligations:

```ts
type TurnObligation =
	| { type: 'progress_capture'; subject: string; evidence: string; targetDocumentId?: string }
	| { type: 'existing_task_update'; taskId: string; reason: string; suggestedState?: string }
	| { type: 'artifact_document'; documentType: string; reason: string };
```

The model can still choose exact wording and content, but the runtime now knows what must happen.

### 3. Verify Obligations Against Tool Executions

After each tool round, compare the obligations to the actual write set.

Examples:

- `progress_capture` is satisfied by an append/update/create document write that includes the progress evidence.
- `existing_task_update` is satisfied only by `update_onto_task` against the resolved `taskId`.
- `artifact_document` is satisfied by a document create/update with the required type or a compatible type.

If an obligation is unmet:

- Prefer a repair instruction and another tool round when semantic judgment is needed.
- Use a synthetic deterministic write only for narrow, high-confidence cases where the target and text are already resolved.
- Never allow the final response to claim an unmet obligation.

### 4. Keep Executors Focused On Safety, Not Intent

Tool executors should keep enforcing local invariants:

- no empty updates
- valid task state keys
- durable text is safe
- required IDs are present

They should not be responsible for deciding whether a user progress claim should update an existing task. The executor sees a single tool call; the obligation verifier sees the whole turn.

## Why This Fixes The Qwen Replay Misses

### Turn 1: Project Created, Final Text Stayed As "I'll Create..."

The finalization guard would see successful durable writes and no grounded final answer. It would synthesize a short created-project outcome and persist that instead of the lead-in.

### Turn 2: Chapter 2 Progress Became Only New Tasks

The turn-obligation policy would detect a progress claim and require a progress capture write. The verifier would reject a create-only task set as incomplete, even if every tool call succeeded.

### Turn 3: Research Document Created, Existing Tasks Not Updated

The existing-task resolver would match the research content to high-confidence existing tasks such as magic system, blacksmithing, or Aethermoor mapping. If confidence is high enough, the verifier would require task updates. If confidence is not high enough, the final response should avoid claiming those tasks were advanced.

## Implementation Order

1. **Finalization guard.** Smallest blast radius and directly fixes the persisted pre-tool lead-in bug.
2. **Progress obligation detector + verifier.** Covers the most important semantic miss from turn 2.
3. **Existing-task resolver.** More nuanced; start with high-confidence exact/near-title matches and avoid aggressive updates.
4. **Replay evals.** Add fantasy-novel fixtures for the three misses and assert tool writes plus persisted final text.

## Non-Goals

- Do not add another long prompt section as the primary fix.
- Do not rely on `agent_state_reconciliation` to repair user-facing behavior; it runs after the turn and is hidden state.
- Do not make tool executors infer broad user intent from isolated tool arguments.
- Do not auto-mark existing tasks `done` unless the user explicitly says the existing task is complete or the resolver has a very high-confidence mapping.

## Success Criteria

- A successful write turn cannot persist only an optimistic lead-in.
- A user progress report produces either a progress document update or a clear, non-success final response explaining what was missing.
- High-confidence references to existing tasks result in updates instead of duplicate create-only behavior.
- Final assistant text is always a function of actual tool outcomes, not planned intent.
