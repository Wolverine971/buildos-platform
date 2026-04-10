<!-- docs/specs/agentic-chat-entity-resolution-spec.md -->

# Agentic Chat Entity Resolution Spec

Date: 2026-04-09

## Purpose

Define the simplest reliable rule for how BuildOS agentic chat should resolve projects, tasks, documents, goals, plans, milestones, and other ontology entities before calling tools.

This spec is intentionally narrow.

It does not redesign retry behavior.
It does not add autonomous write fallbacks.
It does not replace the broader skill/tool architecture.

It defines one thing clearly:

- when the agent should reuse an exact known entity id
- when the agent should search
- which search surface the agent should prefer

## Problem

Recent prompt dumps show that the agent often knows the right operation family but still fails to build valid args.

Typical failure:

- the previous assistant turn already surfaced the exact task id
- the user follows up with "mark that one done"
- the model emits `buildos_call({ op: "onto.task.update", args: {} })`

The current system has two related gaps:

1. Exact recent referents are not carried forward strongly enough.
2. The search fallback rule is not taught clearly enough.

## Current Surface

There are two different search concepts in the current architecture:

1. `tool_search`
    - finds the right canonical BuildOS op
    - answers "Which tool/op should I use?"

2. ontology/entity search ops
    - find actual BuildOS entities
    - current examples:
        - `onto.project.search`
        - `onto.task.search`
        - `onto.document.search`
        - `onto.search`

The model must not confuse these.

`tool_search` is not entity lookup.

## Decision

The agent should resolve entities in this order:

1. Reuse exact ids already known in structured context, recent tool results, or recent referents from the prior turn.
2. If the target entity is not exact yet, search within the current project first when project scope is known.
3. If project scope is unknown or project-scoped search does not resolve the target, search across the accessible BuildOS workspace.
4. Only call `onto.*.get`, `onto.*.update`, or `onto.*.delete` once the exact `*_id` is known.
5. If search returns multiple plausible matches, ask one concise clarification question before writing.

## Required Agent Rule

The prompt and relevant skills should teach this exact rule:

- Reuse exact ids first.
- Search only when unresolved.
- Prefer project-scoped search before workspace-wide search.
- Use `tool_search` only to discover ops, not entities.

## Phase 1 Scope

Phase 1 should stay minimal.

### 1. Prompt guidance

Add explicit entity-resolution guidance to the master prompt and gateway guidance:

- reuse exact ids from recent context first
- if unresolved, search
- search in project scope first
- `tool_search` is for ops, not entity instances

### 2. Recent referent carry-forward

Add a small server-authored recent-referent hint for the current turn, derived from `lastTurnContext`.

This hint should:

- include exact ids and names for recently referenced entities
- prioritize entities explicitly surfaced to the user in the last assistant turn
- stay compact
- only carry forward real UUIDs for ontology entities
- never carry forward placeholder/example ids from schema/help payloads

### 3. Better last-turn extraction

When building `lastTurnContext`, extract explicit name+UUID mentions from assistant text in addition to tool results.

This is needed because the assistant often tells the user exact task ids in plain text, but those ids are not always preserved in the structured continuity artifact.

Tool-result extraction should be conservative:

- mine entity referents from real data-bearing tool results
- do not mine `tool_schema`, `tool_help`, `tool_search`, or `skill_load` payloads for entity ids

### 4. Skill alignment

Task-management guidance should explicitly say:

- if the exact task id is already known from the previous turn or structured context, reuse it
- otherwise search for it before writing

### 5. Gateway fallback behavior

When a gateway `onto.<entity>.get` call is missing its required `*_id`, the runtime should apply the same entity-resolution rule instead of defaulting immediately to a broad list read.

Required fallback behavior:

- if a usable entity query can be inferred from recent args or the latest user message, execute `onto.<entity>.search` first
- if no usable query can be inferred, fall back to `onto.<entity>.list`
- preserve `project_id` from context when the search/list op supports it
- return `_fallback` metadata so the model can extract candidate ids and retry with an exact id

## Search Behavior

In the current architecture, entity lookup should use the existing ontology search ops:

- `onto.task.search`
- `onto.project.search`
- `onto.document.search`
- `onto.search`

Preferred behavior:

- If project scope is known:
    - use `onto.<entity>.search` with `project_id` when available
    - or use `onto.search` with `project_id`
- If project scope is not known:
    - use `onto.search`
    - or the relevant entity-specific search op

## Non-Goals For This Phase

- no retry-loop redesign
- no automatic mutation retries
- no automatic write fallback from update to search+update in one hidden step
- no new agent-facing primary search tool surface yet

Those can come later.

## Future Direction

The long-term search direction already exists in the draft search spec:

- `search_buildos`
- `search_project`

That remains the right end-state for agent simplicity.

Phase 1 of this spec does not require that new surface to land first.

## Success Criteria

This phase is successful if:

1. Follow-up task updates reuse exact ids from the prior assistant turn more reliably.
2. The model searches when the target entity is unresolved instead of emitting empty write args.
3. Prompt dumps show explicit entity-resolution guidance.
4. Prompt dumps show recent referents that preserve exact ids for follow-up turns.
5. Failed writes are reduced because the model resolves ids before mutating.
6. Missing-id `onto.<entity>.get` calls search first when a usable query is available, instead of defaulting to broad list reads.
