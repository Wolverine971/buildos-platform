<!-- docs/reports/agentic-chat-gateway-prompt-audit-2026-03-29.md -->

# Agentic Chat Gateway Prompt Audit

Date: 2026-03-29
Scope: FastChat v2 prompt dump review with `AGENTIC_CHAT_TOOL_GATEWAY=true`
Reviewed dump: `apps/web/.prompt-dumps/fastchat-2026-03-30T01-13-14-851Z.txt`

## Summary

The capability/skill/tool model is directionally correct, but the live prompt is still too large and too repetitive. The main problems are:

- Prompt-level heuristic routing residue inside the gateway discovery instructions.
- Redundant structured context between `agent_state` and the main `data` payload.
- Oversupplied document context through both full `doc_structure` and a broad `documents` list.
- Duplicated assistant lead-ins being persisted into conversation history.

This is primarily a prompt-builder and context-shaping problem, not a gateway registry problem.

## Findings

### 1. Prompt-level heuristic routing residue

The prompt teaches the clean three-layer model and then partially undermines it with routing heuristics.

- `capability_system` already defines `capability -> skill -> tool/op`
- `tool_discovery` repeats the same model
- `tool_discovery` also adds a `Path heuristic` list and `Good skill entry points`

This reintroduces keyword-style steering into the prompt even though the runtime tool gate is now capability-oriented.

### 2. Redundant structured context

`agent_state` contains:

- active notes
- assumptions
- expectations
- tentative hypotheses
- `current_understanding.entities`

The same entities then appear again in the structured `data` payload:

- `goals`
- `milestones`
- `plans`
- `tasks`
- `documents`
- `events`

This spends tokens twice for the same ontology snapshot.

### 3. Document context is oversupplied

Project prompt context currently includes:

- full `doc_structure`
- a separate `documents` list

For most turns this is unnecessary duplication. The linked documents already exist in the tree. The extra list is most useful for unlinked documents and recent document metadata, not for re-listing the full linked tree.

### 4. History persistence is feeding repetition back into the model

Stored assistant messages include both:

- the pre-tool live lead-in
- the later substantive answer

When that full text is loaded as history, the model sees repeated assistant openings from prior turns and learns that duplicated pattern.

### 5. Prompt size is creating avoidable churn

The reviewed dump showed:

- system prompt around 13.8k tokens
- later passes above 26k prompt tokens
- a run ending at `tool_repetition_limit`

This does not prove the repetition loop was caused by prompt size alone, but the current size clearly increases discovery and recovery churn.

## Recommended Remediation

### Prompt guidance

- Keep `buildos_capabilities`
- Keep `capability_system`
- Keep `capability_catalog`
- Keep `skill_catalog`
- Shrink `tool_discovery` to execution contract, canonical op guidance, ID rules, scope-completeness rules, and repair behavior
- Remove prompt-level `Path heuristic`
- Remove `Good skill entry points`

### Agent state

- Keep `items`, `assumptions`, `expectations`, and `tentative_hypotheses`
- Drop `current_understanding.entities` from prompt-time serialization when structured context data is already present
- Keep `dependencies` only when non-empty

### Document context

- Avoid sending both the entire linked tree and the full linked document list in the same prompt
- Prefer:
    - `doc_structure`
    - unlinked documents
    - small document scope metadata

### History

- Persist only the final assistant answer for history
- Do not persist intermediate pre-tool lead-ins as the main assistant message body
- Continue streaming lead-ins to the UI, but keep them out of the replay history

## Implementation Targets

- `apps/web/src/lib/services/agentic-chat/tools/registry/gateway-guidance.ts`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts`

## First Pass Plan

1. Remove heuristic residue from gateway guidance.
2. Compact `agent_state` during prompt serialization.
3. Reduce prompt-time document duplication.
4. Persist only final assistant answer content to history and agent-state reconciliation.
5. Update tests around prompt contents and runtime persistence behavior.
