<!-- docs/specs/agentic-chat-core-elements.md -->

# Agentic Chat Core Elements

Status: Draft source of truth for simplification
Date: 2026-04-14
Owner: BuildOS Agentic Chat

Related local docs:

- [Agentic Chat Operating Model](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-operating-model.md)
- [Agentic Chat Tool Surface Refactor Plan](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-tool-surface-refactor-plan.md)
- [Agentic Chat Skill + Tool Architecture V2](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-skill-tool-architecture-v2.md)
- [Agentic Chat Current Implementation](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)
- [Agentic Chat Prompt Dump Assessment](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-prompt-dump-assessment-2026-04-09.md)
- [Agentic Chat Design Audit](/Users/djwayne/buildos-platform/research-library/design-agentic-chat-audit.md)

External research inputs:

- [Claude Agent Skills overview](https://docs.claude.com/en/docs/agents-and-tools/agent-skills)
- [Anthropic: Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [OpenAI Agents SDK: Running agents](https://openai.github.io/openai-agents-js/guides/running-agents/)
- [OpenAI Agents SDK: Guardrails](https://openai.github.io/openai-agents-js/guides/guardrails/)
- [Model Context Protocol: Resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources)
- [Model Context Protocol: Prompts](https://modelcontextprotocol.io/specification/2025-06-18/server/prompts)
- [Model Context Protocol: Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

## Purpose

This document defines the conceptual core of BuildOS agentic chat so the implementation can be simplified around a small number of stable ideas.

The target is not a less capable agent. The target is a system where the model, codebase, and developer all agree on the same few concepts:

1. Strategy
2. Context
3. Capabilities, skills, and tools

Those are the primary model-facing concepts. Everything else should be treated as supporting runtime infrastructure unless it must influence the current turn.

## Executive Summary

Your three-part breakdown is directionally right:

- Strategy: what the agent is trying to accomplish and how it chooses the next move.
- Context: where the agent is, what it knows, what just happened, and what working set it should use.
- Capabilities, skills, and tools: what the system can do, how to do it well, and the exact executable surface.

The parts that are missing or easy to underweight are:

- Intent and turn mode: the system needs to decide whether the current turn is answer, retrieve, mutate, plan, clarify, audit, forecast, or recover.
- State: the agent needs explicit working state, not just chat history. This includes current scope, focus entity, last-turn referents, active task, tool results, cancellation state, and whether a write actually succeeded.
- Memory and compaction: this belongs inside Context, not as a fourth model-facing concept. It decides what survives across turns and what is safe to omit.
- Rules and guardrails: global invariants stay in the system/runtime; workflow-specific rules live in skills; exact argument rules live in tool schemas.
- Control loop: the runtime needs a deterministic loop for model -> tool -> observation -> next model pass -> final response, with limits and failure policy.
- Streaming events: this is the UI contract for exposing state transitions. It should be small and entity-based, not a separate conceptual universe.
- Observability and evals: prompt snapshots, traces, tool metrics, and failure taxonomies are how the system learns what to simplify next.

The simplification goal should be:

> Three model-facing concepts, backed by a small runtime spine.

The model-facing concepts are Strategy, Context, and Capability Surface.

The runtime spine is State, Control Loop, Guardrails, Memory, Events, Persistence, and Observability.

## Core Mental Model

Agentic chat is an augmented LLM loop:

```text
User turn
  -> resolve strategy
  -> assemble context
  -> expose a small capability/tool surface
  -> model responds and may call tools
  -> runtime executes tools and records observations
  -> model incorporates observations
  -> final response plus updated state
```

The user experiences this as one chat. The system should not expose the internal fragmentation of context types, tool families, skill catalogs, repair instructions, and stream events unless there is a product reason.

## Element 1: Strategy

Strategy is the operating policy for the agent.

It answers:

- What is the user trying to get done?
- What kind of turn is this?
- Should the agent answer directly, retrieve context, mutate data, ask a question, load a skill, or stop?
- What should the agent optimize for: speed, correctness, completeness, safety, or depth?

Strategy should be stable and compact. It should not be redefined separately for every context type.

### What Strategy Contains

Strategy should include:

- Product role: BuildOS helps users capture, organize, and advance projects.
- Default behavior: prefer useful action over unnecessary clarification.
- Turn mode: answer, retrieve, mutate, plan, audit, forecast, create, clarify, recover.
- Risk posture: reads can be direct; writes need concrete IDs and valid args; destructive or ambiguous actions need confirmation.
- Effort level: simple status questions should take the direct overview path; complex workflows can load skills and take more tool rounds.
- Communication pattern: short lead-in, tool work if needed, concise result, next useful follow-up.

### What Strategy Should Not Contain

Strategy should not contain:

- Full tool schemas.
- Full skill bodies.
- Long workflow playbooks.
- Context payloads.
- Implementation-specific event names.

### Simplification Rule

There should be one strategy model with context-sensitive parameters.

Avoid multiplying strategy into separate conceptual systems like:

- global strategy
- project strategy
- calendar strategy
- audit strategy
- forecast strategy
- creation strategy

Those should be modes or policies inside one strategy, not separate agents in the model's head.

## Element 2: Context

Context is the agent's working environment for the current turn.

It answers:

- Where is the agent?
- What is the agent working on?
- What data is available?
- What happened recently?
- What can be trusted?
- What is missing or ambiguous?

The user's phrase "where the agent is and what it is doing" is right, but it should be expanded to include working state, permissions, memory, and data quality.

### Context Layers

Context should be assembled as layers:

1. Scope: global workspace, project, calendar, daily brief, or entity focus.
2. Focus: specific project, task, document, plan, goal, milestone, event, contact, or brief.
3. Working set: the compact data payload relevant to this turn.
4. Conversation memory: recent raw turns, compressed summary, and last-turn continuity.
5. Referents: exact IDs and names recently surfaced to the user or returned by tools.
6. Permissions: what the current user can read or mutate.
7. Freshness and completeness: when context was generated, whether it is cached, and whether lists are truncated.
8. Runtime state: active session, stream run, cancellation state, tool results, and write outcome state.

### Context Is Not Just Prompt Text

Some context belongs in the model prompt. Some belongs in runtime state.

Prompt context:

- Current scope and focus.
- Compact working set.
- Relevant conversation summary.
- Recent exact referents.
- High-signal warnings, such as "context is incomplete" or "multiple matches exist."

Runtime-only context:

- Raw cache metadata unless it affects behavior.
- Full database rows not relevant to the turn.
- Stream timing details.
- Internal retry counters.
- Prompt dump paths.
- Full observability traces.

### Scope Model

The current system has many context types. The simplification target should be:

```ts
type ChatScope = 'global' | 'project' | 'calendar' | 'daily_brief';

type ChatMode = 'default' | 'create' | 'audit' | 'forecast' | 'brain_dump' | 'recovery';

type ChatFocus = {
	entityType:
		| 'project'
		| 'task'
		| 'document'
		| 'plan'
		| 'goal'
		| 'milestone'
		| 'event'
		| 'contact';
	entityId: string;
	entityName?: string;
};

type TurnContext = {
	scope: ChatScope;
	mode: ChatMode;
	focus?: ChatFocus;
	workingSet: unknown;
	memory: ConversationMemory;
	permissions: PermissionSnapshot;
	completeness: ContextCompleteness;
};
```

This preserves the expressive power of current context types without making the model learn 10-plus top-level categories.

### Memory and Compaction

Memory and compaction should be owned by Context.

The context manager should decide:

- How many raw turns to keep.
- When to compress earlier history.
- What exact entity references must survive compression.
- What tool observations must survive into the next turn.
- Whether session-level memory is trustworthy enough to inject.

The important distinction:

- Conversation history is what was said.
- Working memory is what should be used.
- Persistent memory is what should survive across sessions.

Do not rely on raw transcript text alone for continuity. The prompt dump assessment already found that follow-up turns can lose exact entity references unless structured referents are carried forward.

## Element 3: Capabilities, Skills, and Tools

This is the system's ability surface.

It answers:

- What can BuildOS do?
- What guidance should be loaded for this kind of work?
- What exact action can be executed?

The model should learn this as progressive disclosure:

```text
Capabilities -> Skills -> Tool discovery -> Tool schema -> Direct tool call
```

### Capabilities

Capabilities are high-level product affordances.

They answer:

- What kind of job is this?
- Is this within BuildOS?
- Which skill or tool family might be relevant?

Examples:

- Workspace and project overviews.
- Project creation.
- Planning and task structuring.
- Document workspace management.
- Calendar management.
- People and profile context.
- Workflow audit.
- Workflow forecast.
- Web research.
- BuildOS product reference.

Capabilities should be:

- broad
- stable
- short
- prompt-time only

Capabilities should not be:

- tool schemas
- path trees
- nested operation catalogs
- a second hidden routing system

### Skills

Skills are workflow playbooks.

They answer:

- How should the agent approach this kind of work?
- What sequence should it follow?
- What mistakes should it avoid?
- What rules are specific to this workflow?

The Claude Skills docs are a useful reference model: metadata is always loaded, instructions load only when the skill is triggered, and extra resources/code load only when needed. That maps directly to the BuildOS goal of avoiding a large initial prompt.

BuildOS skill files should own workflow-specific rules, such as:

- project creation payload sequencing
- document tree rules
- calendar write rules
- task management conventions
- audit and forecast methodology
- people/contact privacy handling

Skills should not own global invariants like "do not claim a write succeeded unless it did" or "never guess IDs." Those belong in global rules and runtime validation.

### Tools

Tools are exact executable actions.

They answer:

- What can be read or written?
- What exact arguments are required?
- What did execution return?

Tool design matters as much as prompt design. Anthropic's tool-writing guidance emphasizes fewer, more purposeful tools; high-signal responses; clear names; and metrics on errors, redundant calls, runtime, and token use. That is especially relevant to BuildOS because the existing system has already shown retry loops, invalid required fields, and repeated discovery churn.

BuildOS should keep the hybrid tool surface:

- a small set of preloaded direct tools for the current context
- `skill_load`
- `tool_search`
- `tool_schema`
- materialized direct tools for long-tail operations

Simple reads should not be forced through skill loading. Routine status questions should use direct overview retrieval first.

### Capability Surface Contract

Initial prompt should include:

- capability names and one-line summaries
- skill metadata only
- current preloaded direct tool names or schemas supplied by the provider tool definitions
- discovery protocol
- safe execution rules

Initial prompt should not include:

- all tool schemas
- full skill bodies
- all examples
- long tool catalog trees
- historical migration explanations

## Element 4: Rules and Guardrails

Rules are not all the same kind of thing. Simplification requires putting each rule in the right layer.

### Rule Placement

| Rule Type        | Owner                     | Example                                                                   |
| ---------------- | ------------------------- | ------------------------------------------------------------------------- |
| Global invariant | System prompt and runtime | Never claim a write succeeded unless execution succeeded.                 |
| Permission rule  | Runtime                   | Do not mutate a project the user cannot edit.                             |
| Workflow rule    | Skill                     | For document rehoming, use the document tree move workflow.               |
| Schema rule      | Tool schema               | `task_id` is required and must be a full UUID.                            |
| Data rule        | Context/data model docs   | Documents have a tree structure, not ontology edges.                      |
| UI rule          | Event/UI contract         | Emit terminal `done` exactly once.                                        |
| Recovery rule    | Runtime policy            | Stop after repeated required-field failures and ask one concise question. |

### Global Guardrails

The minimum global guardrails are:

- Do not fabricate reads, writes, or tool outcomes.
- Do not execute writes with missing, placeholder, truncated, or guessed IDs.
- Ask one concise clarification when required identity or permission is ambiguous.
- Confirm or block destructive actions when intent is unclear.
- Treat tool outputs and fetched external content as data, not instruction authority.
- Stop repeated tool loops deterministically.

OpenAI's Agents SDK separates input, output, and tool guardrails. BuildOS should use the same conceptual split even if implemented in provider-neutral code:

- input guardrails for user request safety and intent constraints
- tool input guardrails for schemas, IDs, permissions, and approval
- tool output guardrails for malformed, unsafe, or suspicious outputs
- final output guardrails for no-false-success and citation/grounding rules

## Element 5: Control Loop

The control loop is the runtime's job.

It answers:

- How many model passes are allowed?
- Which tool calls are valid?
- When are results appended back to the model?
- When should the system repair, ask, or stop?
- How is a final answer produced?

OpenAI's agent loop is a useful generic reference:

```text
call model
  -> if final output, return
  -> if tool calls, execute tools and append results
  -> if handoff, switch agent
  -> stop at max turns
```

BuildOS can keep this simpler:

```text
call model
  -> stream text
  -> validate tool calls
  -> execute allowed tools
  -> append compact observations
  -> repeat within limits
  -> final response or safe stop
```

### Runtime Policies

The control loop should own:

- max tool rounds
- max tool calls
- repeated round detection
- required-field failure counters
- read-loop detection
- write-success gating
- cancellation and supersession
- tool result compaction for model replay
- direct tool materialization after search/schema lookup

These should not primarily be prompt prose. Prompt prose can describe the policy, but runtime should enforce it.

## Element 6: Streaming Events

Streaming events are the UI contract for a turn.

They should not define the conceptual architecture. They should expose state changes from the architecture.

The simplification target is an entity/state event model:

```ts
type StreamEntity = 'session' | 'assistant' | 'context' | 'tool' | 'memory' | 'timing' | 'error';

type StreamEvent = {
	entity: StreamEntity;
	state: string;
	data: unknown;
};
```

This avoids growing a new top-level event type for every product feature.

### Suggested Event Mapping

| Current Event       | Simplified Entity                 | Notes                                    |
| ------------------- | --------------------------------- | ---------------------------------------- |
| `session`           | `session:ready`                   | Session is resolved or created.          |
| `agent_state`       | `assistant:state`                 | Thinking, executing, waiting, cancelled. |
| `context_usage`     | `context:usage`                   | Token budget and compression status.     |
| `text_delta`        | `assistant:text_delta`            | User-visible assistant stream.           |
| `tool_call`         | `tool:called`                     | Tool intent and args summary.            |
| `tool_result`       | `tool:completed` or `tool:failed` | Tool observation.                        |
| `context_shift`     | `context:shifted`                 | Scope/focus changed.                     |
| `last_turn_context` | `memory:updated`                  | Continuity payload for next turn.        |
| `timing`            | `timing:summary`                  | Turn latency breakdown.                  |
| `error`             | `error:terminal`                  | Terminal failure.                        |
| `done`              | `assistant:done`                  | Final turn boundary.                     |

The UI can still render rich activity, but it should come from a small state vocabulary.

## Element 7: Persistence and State

Persistence is not just storing chat messages. It is how the agent maintains continuity and accountability.

BuildOS needs persistent state for:

- sessions
- messages
- tool calls and tool results
- timing metrics
- prompt snapshots and prompt sections
- context cache
- last-turn context
- context shifts
- cancel reasons
- write outcomes and idempotency keys
- session summaries

The state model should make it impossible or at least easy to detect when:

- the assistant says it changed something but no write succeeded
- a follow-up asks about "that task" and the exact prior task ID is known
- a cached context is stale after a context shift
- a stream was superseded by a newer turn

## Element 8: Observability and Evaluation

Observability is a core simplification tool. Without it, simplification becomes taste-based.

Track:

- prompt size by section
- context usage and compression status
- tool calls per turn
- tool errors by type
- repeated tool round fingerprints
- skill loads per workflow
- time to first event and first text
- total runtime
- final outcome: answered, wrote, clarified, stopped, errored, cancelled
- no-false-success violations
- follow-up referent reuse success

Use evals to decide:

- which direct tools should be preloaded
- which tools should be consolidated
- which skill files are too long
- where the prompt is teaching obsolete behavior
- which repair logic should become deterministic runtime code

Anthropic's tool guidance explicitly recommends analyzing redundant tool calls, tool errors, runtime, and token consumption. That fits the BuildOS prompt dump findings: repeated invalid tool calls and discovery churn are architecture signals, not just model mistakes.

## What Belongs in the Initial Prompt

The initial prompt should contain the few things the model must know before acting:

1. Identity and strategy.
2. Current scope, mode, and focus.
3. Compact working context.
4. Conversation summary or recent history.
5. Recent exact referents.
6. High-level capabilities.
7. Skill catalog metadata.
8. Preloaded direct tools and discovery protocol.
9. Global safe execution rules.

The initial prompt should not contain:

- full skill files
- all tool schemas
- complete operation catalogs
- every historical rule
- stream event documentation
- full observability data
- raw unbounded project data
- implementation migration notes

## What Should Move Behind Progressive Disclosure

Use progressive disclosure for:

- full skill bodies
- workflow examples
- long-tail tool schemas
- rarely used tools
- detailed API argument rules
- large project/document data
- external research
- deep audit/forecast methodology

Do not hide:

- capability summaries
- skill names and descriptions
- core direct tools for the current context
- global safety invariants
- exact referents needed for the current turn

## What Was Oversimplified in the Three-Part Model

The three concepts are good, but each one needs a sharper boundary.

### Strategy Needs Intent

Strategy is incomplete without turn intent. "What is the agent doing?" is not only context; it is a decision:

- answer
- retrieve
- mutate
- create
- plan
- audit
- forecast
- clarify
- recover

This can be a lightweight runtime classification, not necessarily a separate LLM call.

### Context Needs State

Context is incomplete without state. Chat history alone is too weak for an agent that mutates structured data.

State should include:

- current scope and focus
- last-turn referents
- active operation
- tool observations
- write outcomes
- cancellation/supersession
- context freshness

### Capabilities Need an Execution Boundary

Capabilities, skills, and tools are only clean if each layer has a hard boundary:

- capabilities orient
- skills teach
- tool search finds
- tool schema specifies
- direct tools execute

If any layer starts doing all jobs, the abstraction collapses.

### Rules Need Ownership

Some rules should live in skills, but not all.

Global rules stay global. Workflow rules live in skills. Tool argument rules live in tool schemas. Permissions and write validity live in runtime.

## Simplification Principles

Use these principles when simplifying the current implementation:

1. One chat, not many hidden chats.
2. Scope plus mode plus focus, not many unrelated context types.
3. Capabilities are broad and stable.
4. Skills are markdown playbooks loaded on demand.
5. Tools are exact, small, and high-signal.
6. Direct hot-path tools beat generic discovery for common work.
7. Discovery is for uncertainty, not every turn.
8. Runtime enforces safety; prompts explain safety.
9. Context manager owns memory and compaction.
10. Stream events expose state changes; they do not define architecture.
11. Observability decides what to simplify next.

## Proposed Canonical Architecture

```text
Agentic Chat
  Strategy
    identity
    turn intent
    decision policy
    communication policy

  Context
    scope
    mode
    focus
    working set
    memory and compaction
    referents
    permissions
    freshness/completeness

  Capability Surface
    capabilities
    skills
    tool discovery
    tool schemas
    direct tools

  Runtime Spine
    control loop
    validation
    guardrails
    tool execution
    tool result compaction
    streaming events
    persistence
    observability/evals
```

## Simplification Targets for Current BuildOS

### 1. Collapse Context Types

Replace many context types with:

- scope
- mode
- focus

Keep legacy aliases at API boundaries until migration is complete, but do not teach them as first-class concepts to the model.

### 2. Keep the Hybrid Tool Surface

The current hybrid direction is right:

- preloaded direct tools for hot paths
- `skill_load`
- `tool_search`
- `tool_schema`
- materialized direct tools for long-tail operations

Avoid returning to either extreme:

- all tools in prompt
- only generic meta-tools

### 3. Make Context Explicit and Small

Every context payload should answer:

- why this data is included
- what was omitted
- whether it is complete
- which exact IDs are available
- whether it is fresh or cached

### 4. Move Workflow Rules into Skills

Good candidates:

- project creation
- task management
- plan management
- document workspace
- calendar management
- people context
- workflow audit
- workflow forecast

Keep global invariants out of skills.

### 5. Move Repair Out of Prompt Prose

Repeated failures should be handled by deterministic policy:

- classify the failure
- decide retry, repair, clarify, or stop
- append the minimum needed guidance
- stop loops quickly

### 6. Unify Stream Events

Move toward entity/state events. Maintain compatibility adapters if needed, but simplify the conceptual surface.

### 7. Treat Prompt Size as a Budget

Every prompt section should justify its token cost:

- Does it improve the current turn?
- Can it be loaded later?
- Is it duplicated in tool schemas or skill files?
- Is it runtime state rather than model context?

## Open Questions

These should be answered before this becomes final canonical guidance:

1. Should "strategy" be a static prompt section only, or should there be a small turn-intent resolver that produces structured strategy for each turn?
2. What is the minimum context schema that supports global, project, daily brief, calendar, and entity focus without reintroducing many special cases?
3. Which rules are truly global invariants versus workflow-specific skill rules?
4. What direct tools should be preloaded in each scope after looking at real tool-call telemetry?
5. What event entity/state vocabulary should replace the current V2 event list?
6. How should approval work for destructive actions, external APIs, and ambiguous writes?
7. What is the durable memory boundary between session summary, last-turn context, project state, and user profile memory?

## Final Position

The source-of-truth simplification should be:

```text
Strategy tells the agent how to decide.
Context tells the agent where it is and what it knows.
Capabilities, skills, and tools tell the agent what it can do and how to act.
Runtime infrastructure enforces memory, safety, execution, events, persistence, and observability.
```

That is the smallest model that still covers what an agentic chat actually needs.
