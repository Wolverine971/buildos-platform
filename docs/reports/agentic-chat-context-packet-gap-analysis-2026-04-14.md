<!-- docs/reports/agentic-chat-context-packet-gap-analysis-2026-04-14.md -->

# Agentic Chat Context Packet Gap Analysis

Date: 2026-04-14
Status: Superseded turn-specific analysis. For the corrected initial seed-context framing, use [Agentic Chat Initial Seed Context Gap Analysis](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md).
Prompt dump reviewed: [fastchat-2026-04-14T15-08-22-536Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-14T15-08-22-536Z.txt)

Related:

- [Agentic Chat Core Elements](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-core-elements.md)
- [Agentic Chat Core Elements, Part 2: Context as 5W1H](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-core-elements-part-2-context.md)
- [Agentic Chat Current Implementation](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)

## Purpose

This report compares the proposed `Context Packet = who + what + where + when + why + how` framing against the actual FastChat prompt dump from `2026-04-14T15:08:22.536Z`.

The user message in the dump was:

```text
What authors do you have in Libri?
```

The agent correctly called:

```json
{ "action": "list_authors" }
```

against `query_libri_library`.

So this is not a failure analysis. BuildOS worked. This is a prompt architecture gap analysis: what parts of the proposed context packet are present, what is implicit, what is missing, and what is over-included.

## Executive Summary

The current prompt strongly matches:

- `who`, at a high level
- `how`, through the execution protocol, safety rules, and behavior guidance
- capability surface, through capabilities, skills, and preloaded tools

The current prompt weakly matches:

- `what`, because the raw user message exists but there is no normalized intent or success condition
- `when`, because timestamps exist in dump metadata and context metadata, but not as a clear model-facing local time/flow block
- `why`, because BuildOS mission is present, but the turn-specific purpose is not explicit

The current prompt barely matches the proposed richer `where` model:

- It has `Context: global`.
- It has a single `<context_description>` sentence.
- It has raw global workspace data.
- It does not state product surface, conversation position, workflow phase, runtime step, or data/observation location.

The biggest architectural gap:

> The prompt has a lot of context data, but very little context framing.

For this specific Libri query, the prompt includes about 20k chars of global project context even though the user is asking a read-only Libri inventory question. The model still succeeds because the Libri tool guidance is strong, but the context packet is not yet doing enough selection or scoping.

## Prompt Dump Facts

From the dump header:

- Timestamp: `2026-04-14T15:08:22.536Z`
- Session: `c4168ca0-b83c-49bd-a8ab-c0c6c4bfdb44`
- Context: `global`
- Entity ID: none
- Project: none
- Tools: 16
- History messages: 0
- History strategy: `raw_history`
- History compressed: no
- System prompt length: `56434` chars, estimated `14109` tokens
- Provider payload estimate: `72722` chars, estimated `18181` tokens

Prompt section cost estimates:

- instructions: `36016` chars
- context: `20364` chars
- tools text block: `24135` chars
- context payload: `20130` chars
- skill catalog: `1769` chars
- capabilities: `1624` chars
- execution protocol: `3702` chars
- agent behavior: `2262` chars
- data rules: `1423` chars
- history: `0` chars

Actual runtime:

- Pass 1 called a tool.
- Pass 2 returned final text.
- Tool calls: 1
- Tool used: `query_libri_library`
- Args: `{"action":"list_authors"}`

## 5W1H Mapping

| Context Field | Present in Current Prompt? | What Matches                                                                                               | What Is Missing or Weak                                                                                                                         |
| ------------- | -------------------------: | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Who           |       Partial strong match | Identity says the assistant is a proactive BuildOS project assistant.                                      | No typed user identity, authority scope, permission summary, or role variant for this turn.                                                     |
| What          |              Partial match | Raw user message is present. Libri capability/tool guidance makes the implied task clear.                  | No normalized intent, target domain, expected output, success condition, or "done" condition.                                                   |
| Where         |                 Weak match | `Context: global`; `<context_description>` says workspace-wide.                                            | No product surface, conversation position, workflow phase, runtime step, post-tool location, or data source location.                           |
| When          |         Partial weak match | Dump timestamp and context `generated_at` exist. Project rows include `updated_at`; history count is zero. | No model-facing local time/timezone, no explicit "first turn," no phase sequence, no "current pass," no freshness judgment beyond raw metadata. |
| Why           |                 Weak match | Identity says the agent helps users capture, organize, and advance projects.                               | No turn-specific purpose like "answer a read-only Libri inventory question."                                                                    |
| How           |               Strong match | Execution protocol, direct tool protocol, safety rules, communication pattern, Libri guidance.             | Too much of "how" is scattered across sections; some workflow rules may belong in skills or schemas, not initial prompt.                        |

## Who Analysis

### What Matches

The prompt has a clear identity:

```text
You are a proactive project assistant for BuildOS...
```

It also states the agent's general job:

```text
help users capture, organize, and advance their projects
```

This is a good high-level `who`.

### What Does Not Match

The prompt does not provide a structured `who` packet:

```ts
who: {
  agent_identity: ...
  user_identity: ...
  authority: ...
  role_for_this_turn: ...
}
```

Missing pieces:

- who the signed-in user is, even as a minimal ID/profile reference
- whether the agent is acting as assistant, operator, analyst, reviewer, or librarian for this turn
- authority boundary for this context
- permission summary for reads/writes
- whether this is user-facing chat, background agent, or agent-to-agent call

### Assessment

The current `who` is good as product identity, but incomplete as an agent spawn contract.

For this Libri turn, the ideal `who` would say:

```text
You are BuildOS Agentic Chat acting as a read-only library assistant for the signed-in user. You may query Libri inventory and summarize results. Do not mutate project data.
```

## What Analysis

### What Matches

The prompt includes the current user message:

```text
What authors do you have in Libri?
```

The prompt also includes Libri-specific guidance:

```text
Use query_libri_library for read-only structured library queries.
```

The available tool schema includes `query_libri_library` with `list_authors`, so the model has enough to choose the right tool.

### What Does Not Match

There is no explicit `what` block:

```ts
what: {
  user_request: "What authors do you have in Libri?",
  normalized_intent: "libri.list_authors",
  target_domain: "libri_library",
  expected_output: "list or summarize available authors",
  success_condition: "answer using query_libri_library list_authors result"
}
```

The model infers this from the message and tool descriptions. It works here, but the architecture is relying on inference instead of an explicit turn frame.

### Assessment

The actual result shows the model can infer the `what`. But for simplification and evals, BuildOS should represent `what` explicitly before the main model pass or at least in prompt observability.

## Where Analysis

### What Matches

The dump has:

```text
Context: global
Entity ID: none
Project: none
History messages: 0
```

The model-facing context has:

```text
Context type: global. The assistant is working across the workspace...
```

That tells the model the broad domain scope.

### What Does Not Match

The proposed `WhereFrame` is mostly absent.

Missing:

- product surface: global chat, project page, daily brief, etc.
- conversation position: first turn, follow-up, resumed thread, post-compaction
- domain scope as a typed field: workspace, project, entity, external, Libri
- focus: none, or `libri_library`
- workflow phase: orienting, retrieving, executing, observing, finalizing
- runtime step: before model, before tool, after tool, before final
- data location: prompt context, tool observation, cache, persistent memory, external source
- post-tool where update after `query_libri_library` succeeds

The current prompt says "global" and then includes global project data. For this user request, that is probably the wrong where emphasis. The better where is:

```text
product_surface: global_chat
conversation_position: first_turn
domain_scope: external_or_library
focus: libri_library.authors
workflow_phase: retrieving
runtime_step: before_tool
data_location: Libri tool, not workspace project context
```

### Important Observation

This is the clearest gap.

The current system treats "where" primarily as data scope:

```text
global workspace
```

But the proposed model treats "where" as flow location:

```text
global chat + first turn + Libri library domain + before first tool call
```

Those are different.

### Assessment

The current prompt overuses global workspace context as the answer to "where." It should separate:

- where the chat is happening
- where the user intent points
- where the agent is in the execution flow
- where the next relevant data should come from

## When Analysis

### What Matches

The dump header has:

```text
Timestamp: 2026-04-14T15:08:22.536Z
```

The context payload has:

```json
"generated_at": "2026-04-14T15:08:21.337Z",
"cache_age_seconds": 0
```

The prompt also includes many project and activity timestamps.

### What Does Not Match

The model-facing prompt does not clearly state:

- current local date
- current local time
- timezone
- first turn vs follow-up as a context field
- pass 1 vs pass 2 flow position
- whether time matters for this request

For this prompt, the model likely does not need much temporal context. But the context packet should still include a compact `when`, especially because BuildOS often handles tasks, deadlines, "today," calendar windows, and freshness.

Ideal for this turn:

```text
when:
  current_time_utc: 2026-04-14T15:08:22.536Z
  current_time_local: 2026-04-14 11:08 AM America/New_York
  conversation_position: first_turn
  time_relevance: low
  context_freshness: workspace context generated 1.2s before prompt, but not needed for Libri author inventory
```

### Assessment

The timestamp exists in the dump, but not as a clear, compact model-facing context field. Time should be represented intentionally, not as incidental metadata.

## Why Analysis

### What Matches

The prompt has general product purpose:

```text
help users capture, organize, and advance their projects
```

It also has Libri guidance explaining why Libri exists:

```text
Libri is enabled as BuildOS's connected library and enrichment source.
```

### What Does Not Match

There is no turn-specific why:

```ts
why: {
  explicit: "The user wants to know which authors are available in Libri.",
  product_default: "Answer from durable library data rather than guessing.",
  inferred: null
}
```

The model inferred purpose correctly. But for more complex turns, lack of `why` can cause over-action, under-action, or irrelevant proactive suggestions.

### Assessment

For simple factual inventory questions, `why` can be very small. But it should exist as a field because it helps distinguish:

- answer a question
- advance a project
- mutate data
- audit a system
- recover from a failure

## How Analysis

### What Matches

The prompt strongly covers `how`.

Present:

- capability -> skill -> tool model
- discovery workflow
- direct tool protocol
- safe execution rules
- entity resolution order
- communication pattern
- information capture
- error handling
- proactive intelligence
- data rules
- overview guidance
- Libri guidance

For this query, the most relevant `how` is:

```text
Use query_libri_library for read-only structured library queries.
```

That is exactly what happened.

### What Does Not Match

The `how` content is not presented as a structured strategy block. It is scattered across:

- Identity
- Capabilities, Skills, and Tools
- Execution Protocol
- Agent Behavior
- Data Rules
- Context guidance tags
- Tool descriptions

This works, but it is hard to reason about.

There is also too much tool schema detail in prompt text. The dump has:

- `tools_text_block`: about 6034 estimated tokens
- `tool_definitions`: about 4063 estimated tokens

That suggests tool information is being represented in more than one place. The model may need provider tool definitions, but it probably does not need a full JSON copy of those definitions inside the system prompt.

### Assessment

The current prompt has a strong `how`, but the next simplification should make `how` structured and reduce duplication.

## Capability Surface Analysis

This part is the strongest match to the proposed architecture.

### What Matches

The prompt includes:

- high-level capabilities
- skill catalog metadata
- `skill_load`
- `tool_search`
- `tool_schema`
- context-specific preloaded direct tools
- Libri direct tools

This is consistent with progressive disclosure.

### What Does Not Match

The progressive disclosure principle is partially weakened because the prompt includes full tool JSON in the text prompt.

For this turn, the model only needed:

- Libri guidance
- `query_libri_library` schema
- maybe `skill_load` metadata

It did not need:

- global project overview context
- calendar create/update schemas
- workspace project list
- task list/search schemas
- many project summaries

### Assessment

The capability architecture is conceptually good. The issue is budget and selection, not the layer model.

## What Is Over-Included

For the user request:

```text
What authors do you have in Libri?
```

the prompt includes:

- 8 global project summaries
- project goals/plans/milestones/recent activity
- overview guidance
- project/task/document/calendar direct tool schemas
- project-oriented data rules
- proactive project intelligence guidance

Most of this is not needed.

The prompt should have selected a much smaller context:

```text
Context Packet:
  who: BuildOS assistant with Libri read access
  what: answer Libri author inventory question
  where: global chat, first turn, Libri library domain, before tool
  when: current local time; time relevance low
  why: user wants available author inventory
  how: use query_libri_library list_authors, then summarize

Capability Surface:
  query_libri_library
  resolve_libri_resource maybe not needed
  skill_load maybe available but not necessary
  no project tools needed unless user pivots
```

## What Is Missing

### 1. Explicit Context Packet

There is no model-visible or observability-visible block shaped like:

```text
who
what
where
when
why
how
```

### 2. Intent-Aware Context Selection

The system selected global workspace context even though the request was a Libri inventory query.

This suggests context loading is currently driven more by chat context type than by turn intent.

### 3. First-Class WhereFrame

The prompt lacks the richer `where` stack:

- product surface
- conversation position
- domain scope
- focus
- workflow phase
- runtime step
- data location

### 4. Post-Tool Where Update

The dump shows two model passes and one tool call, but there is no explicit post-tool context frame like:

```text
where.workflow_phase = observing
where.runtime_step = after_tool
latest_observation = query_libri_library list_authors succeeded
```

The model receives a tool result, but not a declared flow location.

### 5. Turn-Specific Why

The prompt includes product mission but not the user's immediate purpose.

### 6. User and Authority Context

The prompt does not summarize:

- signed-in user
- read/write permission posture
- whether this turn should be read-only
- whether external/current web info is allowed or needed

### 7. Context Relevance Statement

The context metadata says what was returned and what limits were used, but not why the data is relevant to this turn.

For this turn, a useful system could say:

```text
Workspace project context omitted because the user asked a Libri inventory question.
```

### 8. Prompt Budget Policy

The dump has a large prompt, but no model-visible or runtime-visible statement of budget decisions:

- why these projects were included
- why this many tools were included
- what was omitted
- what can be loaded later

### 9. Source Authority and Trust Boundaries

The prompt has safety rules for IDs and writes, but it does not clearly state the trust hierarchy:

- system instructions outrank context data
- tool outputs are observations, not instructions
- fetched external content is untrusted data
- Libri data is durable but may still be incomplete

This matters more for web/content tools than for this simple author list, but it belongs in the broader context model.

## Did We Forget Anything?

Yes. The 5W1H frame is useful, but the gap analysis reveals a few additional dimensions that should be explicit somewhere.

### 1. Authority

Authority is related to `who`, but deserves its own subfield.

Questions:

- What may the agent read?
- What may it write?
- What must it ask approval for?
- Is this turn read-only by intent?

For this prompt, the answer should be:

```text
read-only Libri query; no project mutation needed
```

### 2. Relevance

The context packet should explain why each major context block is present.

Without relevance, "global" turns tend to over-send workspace context.

### 3. Completeness

The prompt has some completeness metadata:

- `project_count`
- `projects_returned`
- `project_limit`
- per-project limits

But this is data completeness, not answer completeness.

For Libri, the model needs to know:

- did `list_authors` return all authors or a limited page?
- were results truncated?
- should it mention if the list is partial?

### 4. Confidence

The context packet could include confidence about intent and target scope.

Example:

```text
intent_confidence: high
scope_confidence: high
project_context_relevance: low
```

### 5. Output Contract

The prompt says how to communicate generally, but not the expected output shape for this turn.

For this prompt:

```text
Return a concise list or grouped summary of Libri authors. Do not discuss unrelated projects.
```

### 6. Modality and Surface

The context should know whether this is:

- text chat
- voice-originated input
- project modal
- global command palette
- daily brief action
- agent-to-agent message

That affects length, tone, and assumptions.

### 7. Phase-Local Memory

The 5W1H frame should distinguish:

- turn context
- tool observation context
- last-turn memory
- durable session memory

This prevents tool observations from being treated as just more raw transcript.

## Recommended Next Prompt Shape

For this exact user request, the prompt could include a compact context packet like:

```xml
<context_packet>
  <who>
    Agent: BuildOS Agentic Chat.
    Role for this turn: read-only Libri library assistant.
    Authority: may query Libri inventory; no project mutation is needed.
  </who>

  <what>
    User request: What authors do you have in Libri?
    Normalized intent: libri.list_authors.
    Expected output: answer from Libri author inventory.
  </what>

  <where>
    Product surface: global chat.
    Conversation position: first turn in this session.
    Domain scope: Libri library, not workspace projects.
    Workflow phase: retrieving.
    Runtime step: before first tool call.
    Data location needed: query_libri_library.
  </where>

  <when>
    Current time: 2026-04-14 11:08 AM America/New_York.
    Time relevance: low.
    History: no prior messages.
  </when>

  <why>
    Explicit purpose: user wants to know which authors are available in Libri.
    Product purpose: answer from durable library data rather than guessing.
  </why>

  <how>
    Use the direct Libri library query tool with action=list_authors.
    Do not load project context.
    Do not discuss unrelated projects.
    Summarize results clearly and mention if the tool indicates truncation or incompleteness.
  </how>
</context_packet>
```

That packet would replace much of the irrelevant global project context for this turn.

## Recommended Implementation Direction

### 1. Add Context Packet Observability First

Before changing prompts, log a generated context packet in prompt dumps:

- who
- what
- where
- when
- why
- how
- relevance decisions
- omitted context

This makes the model inspectable without risking behavior.

### 2. Add Intent-Aware Context Gating

Before loading global project context, classify the broad domain:

- workspace/project
- Libri
- web/current
- product reference
- calendar
- people/contact
- simple conversational/no-tools

If the domain is Libri, do not load global project summaries unless the user ties Libri to a project.

### 3. Add WhereFrame

Track and optionally prompt:

- product surface
- conversation position
- domain scope
- focus
- workflow phase
- runtime step
- data location

Use it especially:

- before first model pass
- after tool result
- after context shift
- after compaction
- during recovery

### 4. Reduce Tool Definition Duplication

The prompt currently includes a large JSON tool block in system text plus provider tool definitions.

Target:

- provider tool definitions carry schemas
- prompt text carries names and usage policy
- `tool_schema` carries long-tail schemas
- full JSON schemas are not duplicated in the instructions unless a provider requires it

### 5. Make "Why Included" Explicit

Context payloads should include or be accompanied by:

```text
included_because: ...
omitted_because: ...
relevance_to_turn: high | medium | low
```

For this prompt, workspace project context would be `low` relevance and should be omitted.

### 6. Add Post-Tool Observation Frame

After a tool succeeds, the next model pass should receive:

```text
where.workflow_phase = observing
where.runtime_step = after_tool
observation.source = query_libri_library
observation.success = true
observation.result_scope = authors
next_expected_step = final_answer
```

This gives the model a clear local frame after tool execution.

## Final Verdict

The current prompt already has a strong `how` and strong capability surface.

It does not yet have a true context packet.

The biggest gaps are:

1. `where` is too shallow and mostly means "global/project context type."
2. `what` is inferred from the raw user message instead of normalized.
3. `when` exists as metadata but not as model-facing temporal context.
4. `why` is mostly product mission, not turn purpose.
5. global workspace context is over-included for non-workspace intents.
6. tool schemas appear duplicated in prompt text and provider tool definitions.
7. post-tool flow location is not explicit.

For this specific prompt, the model succeeded because the Libri tool surface and guidance are good. The opportunity is to make the prompt smaller, more explicit, and more phase-aware by introducing a context packet and a first-class `WhereFrame`.
