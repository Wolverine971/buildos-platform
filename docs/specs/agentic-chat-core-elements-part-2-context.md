<!-- docs/specs/agentic-chat-core-elements-part-2-context.md -->

# Agentic Chat Core Elements, Part 2: Context as 5W1H

Status: Draft analysis
Date: 2026-04-14
Owner: BuildOS Agentic Chat

Related:

- [Agentic Chat Core Elements](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-core-elements.md)
- [Agentic Chat Operating Model](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-operating-model.md)
- [Agentic Chat Current Implementation](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)
- [Agentic Chat Prompt Dump Assessment](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-prompt-dump-assessment-2026-04-09.md)

## Purpose

This is a follow-up to the first core-elements doc.

The updated framing is:

> Context is who, what, where, when, why, and how for the agent.

In this framing, strategy is not a sibling of context. Strategy is the "how" portion of context.

This document analyzes that idea, explains why it is useful, names the risks, and proposes a more precise context model for BuildOS agentic chat.

## The Revised Model

The first doc used three model-facing concepts:

1. Strategy
2. Context
3. Capabilities, skills, and tools

The revised version should be:

1. Context packet
2. Capability surface
3. Runtime spine

The context packet contains the agent's 5W1H:

- Who: identity, role, persona, user, and authority.
- What: current task, user request, target objects, and success condition.
- Where: product surface, conversation location, domain scope, workflow phase, and runtime step.
- When: absolute time, deadlines, sequence position, recency, freshness, and time constraints.
- Why: purpose, endstate, priority, and reason this work matters.
- How: strategy, behavior, tone, decision rules, risk posture, and execution style.

The capability surface remains separate because it is not context in the same sense. It is the available action interface:

- capabilities
- skills
- tool discovery
- tool schemas
- direct tools

The runtime spine also remains separate because it enforces and records execution:

- control loop
- validation
- guardrails
- memory and compaction
- streaming events
- persistence
- observability

## Why This Framing Is Strong

The 5W1H framing is strong because it matches what an agent actually needs at spawn time.

When an agent begins a turn, it should not receive only:

- system identity
- a blob of project data
- a tool list
- chat history

It needs a coherent operating frame:

```text
Who am I?
What am I doing?
Where am I in the product, conversation, workflow, and execution loop?
When is this happening and what time constraints matter?
Why does this turn matter?
How should I behave and decide?
What can I do?
```

That is cleaner than treating identity, mission, scope, time, behavior, and memory as scattered prompt sections.

## Recommended Abstract Model

```text
Agent Spawn Contract
  Context Packet
    who
    what
    where
    when
    why
    how

  Capability Surface
    capabilities
    skill metadata
    preloaded direct tools
    discovery tools

  Runtime Contract
    loop limits
    validation
    memory update rules
    event contract
    persistence/observability hooks
```

In this model, "strategy" is not removed. It becomes a typed sub-block inside `context.how`.

That keeps the conceptual model simpler without losing the value of explicit strategy.

## The Context Packet

BuildOS should eventually produce a structured context packet for each turn.

Example shape:

```ts
type AgentContextPacket = {
	who: WhoContext;
	what: WhatContext;
	where: WhereContext;
	when: WhenContext;
	why: WhyContext;
	how: HowContext;
};
```

The important thing is not the exact TypeScript. The important thing is that each piece has a clear job.

## Who

Who tells the model what identity and authority it has.

It should answer:

- Who is the agent?
- Who is the user?
- What role should the agent play?
- What authority does the agent have?
- Should it act as a fast assistant, careful operator, reviewer, planner, or collaborator?

For BuildOS, this might include:

- agent identity: BuildOS project assistant
- persona: pragmatic, concise, project-aware
- user relationship: assistant to the signed-in user
- authority: can read allowed workspace data and execute allowed tools
- limitation: cannot claim actions that tools did not complete

### Pros

- Makes behavior less implicit.
- Reduces persona drift.
- Lets different surfaces use different stances without creating separate agents.
- Helps spawned or background agents know whether they are acting as operator, analyst, reviewer, or assistant.

### Risks

- Persona can become fluff if not tied to actual decisions.
- Too much "act like X" language can fight product behavior.
- Multiple persona instructions from skills, system prompt, and context packet can conflict.

### Recommendation

Keep `who` short and durable.

Do not put workflow strategy here. Put workflow strategy in `how`.

## What

What tells the model the current job.

It should answer:

- What did the user ask?
- What entity or data is the turn about?
- What output or action is expected?
- What counts as done?
- What is unknown?

For BuildOS, this might include:

- latest user message
- normalized intent
- target project/entity if known
- requested operation type: answer, retrieve, create, update, audit, forecast, clarify, recover
- expected result: answer text, tool write, plan, summary, question, or safe stop

### Pros

- Prevents the model from treating every turn like open-ended chat.
- Creates a natural home for intent classification.
- Makes "done" explicit enough to test.

### Risks

- Intent classification can be wrong and overconstrain the model.
- "What" can duplicate user message history if not compact.
- If success criteria are inferred too aggressively, the agent can run past what the user asked.

### Recommendation

Make `what` compact and revisable.

Use it as a working hypothesis, not as an irreversible command.

## Where

Where is the most underdeveloped part of the current model.

The current system has context type, project focus, history, tool observations, and context shifts, but those do not fully describe where the agent is in the flow.

Where should answer:

- Where in the product did this chat start?
- Where in the conversation are we?
- Where in the user's project/workspace are we?
- Where in the workflow are we?
- Where in the runtime loop are we?
- Where did the last tool call leave us?

This is more than `context_type`.

### The Where Stack

BuildOS should think of `where` as a stack:

```text
where
  product_surface: global_chat | project_page | daily_brief | calendar | document | task
  conversation_position: first_turn | follow_up | resumed_thread | post_compaction
  domain_scope: workspace | project | entity | cross_project | external
  focus: project/task/document/goal/plan/milestone/event/contact id and name
  workflow_phase: orienting | retrieving | planning | executing | observing | finalizing | recovering | waiting_on_user
  runtime_step: before_model | streaming_text | before_tool | inside_tool | after_tool | before_final
  data_location: prompt_context | tool_observation | cached_context | persistent_memory | external_source
```

This gives the system a much sharper way to say:

> We are not just "in project context." We are on a follow-up turn, inside the project page, focused on task X, after a successful update tool call, before final response.

That is the missing abstraction.

### Why Tool Calls Change Where

A tool call is not just data retrieval. It is a location change in the agent's flow.

Before a tool call, the agent is in decision mode:

```text
where.workflow_phase = executing
where.runtime_step = before_tool
```

During a tool call, the model should not need the full original prompt again. The runtime is executing a chosen action.

After a tool call, the agent is in observation mode:

```text
where.workflow_phase = observing
where.runtime_step = after_tool
where.data_location = tool_observation
```

At that point, the next model pass should receive a compact frame that says:

- what tool was called
- whether it succeeded
- what changed or what was learned
- what exact IDs are now known
- what phase the agent is now in
- what should happen next

It should not necessarily receive the whole original context again.

### Current BuildOS Concern

Today, the V2 loop appends tool observations back into the message list and continues. That is a normal agent loop, but the context vocabulary is coarse.

The side note is correct:

- the runtime has a tool result
- it appends a compact payload
- it may emit `tool_result` and maybe `context_shift`
- it later builds `last_turn_context`

But there is no first-class "where frame" that says the model is now in a post-tool observation phase with a narrowed local context.

That can lead to two bad outcomes:

- The model reconsiders the whole task too broadly after every tool.
- The runtime resends or reuses context as a blob instead of passing a precise phase-local frame.

### Recommendation

Create a `WhereFrame` concept.

```ts
type WhereFrame = {
	productSurface: 'global_chat' | 'project_page' | 'daily_brief' | 'calendar' | 'document';
	conversationPosition: 'first_turn' | 'follow_up' | 'resumed_thread' | 'post_compaction';
	domainScope: 'workspace' | 'project' | 'entity' | 'cross_project' | 'external';
	focus?: {
		entityType: string;
		entityId: string;
		entityName?: string;
	};
	workflowPhase:
		| 'orienting'
		| 'retrieving'
		| 'planning'
		| 'executing'
		| 'observing'
		| 'finalizing'
		| 'recovering'
		| 'waiting_on_user';
	runtimeStep:
		| 'before_model'
		| 'streaming_text'
		| 'before_tool'
		| 'inside_tool'
		| 'after_tool'
		| 'before_final';
	localObservation?: {
		source: 'tool' | 'context_cache' | 'history' | 'external';
		toolName?: string;
		success?: boolean;
		changedEntities?: Array<{ entityType: string; entityId: string; entityName?: string }>;
		learnedEntities?: Array<{ entityType: string; entityId: string; entityName?: string }>;
	};
};
```

This would let BuildOS pass smaller, more precise updates between phases.

## When

When tells the model the time context.

It should answer:

- What is the current absolute date/time and timezone?
- Where is this turn in the sequence of the chat?
- What happened just now?
- What deadlines, due dates, calendar windows, or freshness windows matter?
- Is the loaded context fresh, cached, stale, or partial?

When has two meanings:

1. Real-world time.
2. Sequence position in the flow.

Both matter.

Examples:

- It is April 14, 2026 in America/New_York.
- This is the first turn in a newly opened project chat.
- This is the second model pass after a tool result.
- The project context was cached 90 seconds ago.
- The calendar view includes the next 14 days.
- The user asked "today," so resolve that to a concrete date.

### Pros

- Prevents vague relative-date reasoning.
- Helps the agent distinguish fresh tool output from stale cached prompt context.
- Makes conversation depth and compaction state explicit.

### Risks

- Time context can bloat the prompt if every timestamp is included.
- Stale context can be trusted too much if freshness is not explicit.
- Relative dates can be mishandled if timezone is missing.

### Recommendation

Always include current absolute time and timezone.

Include only time constraints that affect the turn.

Mark cached context with age and freshness status when it matters.

## Why

Why tells the model the purpose of the turn.

It should answer:

- Why is the user asking this?
- What outcome are we trying to move toward?
- Why should the agent act now?
- What does success look like from the user's point of view?

For BuildOS, "why" often means:

- help the user move a project forward
- reduce ambiguity
- turn scattered thoughts into usable project structure
- surface what matters next
- avoid making the user repeat context

### Pros

- Gives the agent a reason to prioritize.
- Helps decide between direct answer, tool call, and clarifying question.
- Can make proactive suggestions more relevant.

### Risks

- The agent can over-infer motivation.
- "Why" can become vague mission language if not tied to the turn.
- Too much inferred purpose can make the assistant pushy.

### Recommendation

Keep `why` grounded in user-visible evidence.

Distinguish:

- explicit purpose: the user said it
- inferred purpose: the system guessed it
- product purpose: BuildOS default mission

## How

How is strategy.

It should answer:

- How should the agent behave?
- How should it decide?
- How much initiative should it take?
- How should it use tools?
- How should it handle uncertainty, risk, and errors?
- How should it communicate?

This is where the old "Strategy" element belongs.

For BuildOS, `how` should include:

- be concise unless depth is requested
- prefer useful action over unnecessary clarification
- use direct overview tools for routine status questions
- load skills for multi-step, stateful, or risky workflows
- never guess IDs or write arguments
- do not claim tool actions that did not succeed
- stop repeated loops and ask for the minimum needed clarification

### Pros

- Makes strategy part of the agent's current operating context.
- Lets the same agent behave differently by phase or surface.
- Avoids treating strategy as a separate abstraction from the situation.

### Risks

- If all strategy becomes "context," global invariants may become too soft.
- Workflow-specific "how" can duplicate skill files.
- Tool-specific "how" can duplicate schemas.

### Recommendation

Represent `how` as three layers:

```text
how
  global_behavior: durable invariants
  turn_strategy: current decision policy
  workflow_guidance: loaded from skills only when needed
```

That keeps strategy inside context while preserving rule ownership.

## Pros of the 5W1H Context Framing

### 1. It Gives Agent Spawn a Clean Contract

Every agent or sub-agent can be spawned with the same kind of packet:

- who you are
- what you are doing
- where you are
- when this is happening
- why this matters
- how to act

This is much easier to reason about than a custom prompt shape for every workflow.

### 2. It Makes Strategy Less Abstract

Strategy becomes grounded in situation.

Instead of:

> Here is the strategy.

the agent gets:

> Given who you are, what you are doing, where you are in the flow, when this is happening, and why it matters, here is how to act.

That is closer to how real decisions work.

### 3. It Highlights the Real Weak Spot: Where

The framing exposes that "where" is overloaded and under-specified.

BuildOS currently has:

- context type
- project focus
- message history
- tool result payloads
- context shifts

But it does not yet have a rich enough "where am I in the flow?" model.

### 4. It Supports Progressive Context

If context is structured, the runtime can disclose only the part needed for the current phase.

For example:

- initial model pass gets full turn context
- tool execution gets validated tool args and permissions
- post-tool model pass gets the tool observation frame
- final response gets success/failure state and next-step context

### 5. It Creates a Better Home for Memory

Memory can be scoped by 5W1H:

- who: user preferences and agent identity
- what: active task and target entities
- where: scope, focus, workflow phase
- when: recency, freshness, sequence
- why: project purpose and user goal
- how: preferred behavior and strategy

This is more useful than treating memory as just a summary string.

## Cons and Risks

### 1. Context Can Become Too Broad

If context means everything, it can stop being a useful abstraction.

The fix is to split context into:

- model-visible context
- runtime-only context
- persistent memory
- observability

Do not put all context into the prompt.

### 2. Strategy as Context Can Hide Important Policy

Some strategy is situational, but some strategy is invariant.

For example:

- never fabricate tool results
- never guess IDs
- obey permissions
- stop repeated invalid tool loops

Those are not optional "how" details. They are global policy and runtime constraints.

The fix is to include them in `how.global_behavior` and enforce them in runtime.

### 3. 5W1H Is Intuitive, Not Sufficiently Operational by Itself

Who/what/where/when/why/how is a good thinking model, but implementation needs typed fields.

Without typed fields, "where" can still mean:

- page location
- chat history depth
- project scope
- workflow phase
- tool result step
- memory source

The fix is the `WhereFrame`.

### 4. It Can Encourage Over-Prompting

The model does not need every 5W1H detail on every pass.

The fix is to build context frames by phase:

- spawn frame
- turn frame
- tool frame
- observation frame
- finalization frame

### 5. Why Can Become Over-Inferred

The agent can start assuming user motivation.

The fix is to label purpose as:

- explicit
- inferred
- product-default

### 6. How Can Duplicate Skills

If `how` includes long workflow guidance, it defeats progressive disclosure.

The fix is:

- `how` contains short strategy
- skills contain workflow playbooks
- tool schemas contain exact argument rules

## Proposed Part 2 Revision to the Core Model

The first doc should probably evolve from:

```text
Strategy
Context
Capabilities, skills, and tools
```

to:

```text
Context Packet
Capability Surface
Runtime Spine
```

Where:

```text
Context Packet = who + what + where + when + why + how
How = strategy
Capability Surface = capabilities + skills + tools
Runtime Spine = control loop + state + guardrails + memory + events + persistence + observability
```

This is more abstract and probably more correct.

## The "Where" Design Direction

The biggest concrete design change should be to make `where` first-class.

### Current Coarse Where

Today, the model mostly gets:

```text
context_type = project
project_id = ...
focus_entity = ...
history = ...
tool_result = ...
```

This tells it the data scope, but not the flow location.

### Better Where

The model should get something closer to:

```json
{
	"product_surface": "project_page",
	"conversation_position": "follow_up",
	"domain_scope": "project",
	"focus": {
		"entity_type": "task",
		"entity_id": "full-uuid",
		"entity_name": "Draft onboarding copy"
	},
	"workflow_phase": "observing",
	"runtime_step": "after_tool",
	"local_observation": {
		"source": "tool",
		"tool_name": "update_onto_task",
		"success": true,
		"changed_entities": [
			{
				"entity_type": "task",
				"entity_id": "full-uuid",
				"entity_name": "Draft onboarding copy"
			}
		]
	}
}
```

This tells the model:

- we are not starting over
- we are after a tool
- the write succeeded
- this exact entity changed
- the next job is probably finalization or next-step suggestion

### Practical Runtime Implication

BuildOS should eventually separate:

- base context: durable turn context
- phase context: where we are in the loop now
- observation context: what the latest tool/result changed
- memory update: what should survive to next turn

This avoids treating every model pass as if it needs the same full context blob.

## Suggested Implementation Path

This is not a request to rewrite everything immediately. The model can be introduced incrementally.

### Step 1: Define the Context Packet Type

Create a small type or spec for:

- who
- what
- where
- when
- why
- how

Do not wire it everywhere yet. Use it as the shared vocabulary.

### Step 2: Add WhereFrame Internally

Start with runtime-only `WhereFrame` values around:

- initial model pass
- before tool execution
- after tool result
- before final answer

Use this for observability first.

### Step 3: Emit Where in Prompt Dumps

Add `where` to prompt dumps or prompt observability, even before showing it to the model.

This will reveal whether the fields are useful and whether the labels are right.

### Step 4: Add Minimal Model-Visible Where

Inject a compact `<where>` block only when it helps:

- follow-up turn
- post-tool model pass
- context shift
- recovery
- post-compaction

### Step 5: Replace Coarse Context Language

Gradually replace broad prompt lines like:

```text
Context type: project.
```

with:

```text
You are in a project-scoped follow-up turn on the project page, currently after a successful task update tool call and before the final user-facing response.
```

### Step 6: Use Where to Shrink Context

Once `where` is reliable, use it to decide what not to resend.

For example:

- post-tool observing phase gets local observation plus relevant referents
- it does not need the full project graph unless the next action requires it

## Final Assessment

The new framing is better than the first framing.

It is more abstract, but also more complete:

```text
Context is the full situation.
Strategy is how the agent should act inside that situation.
Capabilities, skills, and tools are what actions are possible.
Runtime spine manages the flow between situations.
```

The strongest insight is that "where" should not mean only project/global/calendar context.

For BuildOS, "where" should mean:

```text
product surface
+ conversation position
+ domain scope
+ entity focus
+ workflow phase
+ runtime step
+ data/observation location
```

That gives the agent a much better sense of place. It also gives the runtime a better way to pass smaller, phase-specific context instead of reflexively resending broad context after every tool call.
