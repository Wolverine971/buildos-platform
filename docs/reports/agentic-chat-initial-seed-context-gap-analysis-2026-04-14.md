<!-- docs/reports/agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md -->

# Agentic Chat Initial Seed Context Gap Analysis

Date: 2026-04-14
Status: Draft analysis
Prompt dump reviewed: [fastchat-2026-04-14T15-08-22-536Z.txt](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-14T15-08-22-536Z.txt)

Related:

- [Agentic Chat Core Elements](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-core-elements.md)
- [Agentic Chat Core Elements, Part 2: Context as 5W1H](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-core-elements-part-2-context.md)
- [Agentic Chat Current Implementation](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)

## Correction From Prior Analysis

This report corrects the earlier turn-specific framing in [Agentic Chat Context Packet Gap Analysis](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-context-packet-gap-analysis-2026-04-14.md).

The 5W1H packet is primarily about seeding the agent's initial operating context.

It should answer:

```text
Before the user says anything specific, did we prepare the agent with the right landscape to help?
```

It should not rewrite the agent identity based on the user's specific query.

For example, if the user asks about Libri, the `who` is still:

```text
BuildOS is a helpful project assistant.
```

The Libri-specific part belongs in turn interpretation and capability/tool selection:

```text
The user is asking a library question, so use the Libri skill/tool surface.
```

That is the separation of concern:

- Seed context: stable landscape before the user asks.
- Turn context: interpretation of the latest user message.
- Phase context: where the runtime is after model/tool steps.

## Executive Summary

The current prompt seeds several important things well:

- Who: BuildOS is a proactive project assistant.
- Why: the agent exists to help users capture, organize, and advance projects.
- How: the prompt gives strong behavioral, safety, and tool-use strategy.
- Capability surface: capabilities, skills, and tools are represented clearly.

The current prompt is weaker at seeding:

- Where: it says `global`, but does not fully explain the surface, session position, loaded data landscape, or retrieval map.
- When: it includes raw UTC timestamps and context freshness metadata, but not a clear current local time/timezone frame.
- What: it describes the general product mission, but does not clearly state the broad range of user intents the chat is prepared to handle.
- Context inventory: it provides data, but does not clearly say what was loaded, what was omitted, and where the agent should go next if the user's request falls outside the loaded data.

The biggest issue is not that the prompt failed. It worked.

The issue is that the initial seed blends three different things:

1. Universal agent instructions.
2. Initial workspace context.
3. Turn/tool guidance.

The next simplification should make those boundaries explicit.

## Three Context Layers

The clean separation should be:

```text
1. Initial Seed Context
   Stable context given at chat spawn.
   Prepares the agent for whatever the user might ask.

2. Turn Context
   Derived after reading the latest user message.
   Decides current intent, target domain, needed skill, needed data, and likely tools.

3. Phase Context
   Updated during the runtime loop.
   Tracks before-tool, after-tool, observation, recovery, and finalization state.
```

The 5W1H frame primarily belongs to the initial seed context, with some fields updated by turn and phase context later.

## Seed Context Should Not Be Query-Specific

The seed context should not say:

```text
You are a read-only Libri assistant.
```

That would be a turn-specific role adaptation.

The seed context should say:

```text
You are BuildOS Agentic Chat, a helpful project assistant with access to BuildOS workspace context, memory, skills, and tools.
```

Then after the user asks about Libri, the turn resolver can say:

```text
This turn is a Libri inventory query. Use Libri tools. No project mutation is needed.
```

That preserves identity while still routing the work correctly.

## Prompt Dump Seed Facts

From the dump header:

- Context: `global`
- Entity ID: none
- Project: none
- Tools: 16
- History messages: 0
- History strategy: `raw_history`
- History compressed: no
- System prompt length: `56434` chars, estimated `14109` tokens
- Provider payload estimate: `72722` chars, estimated `18181` tokens

From the system prompt:

- Identity is defined.
- Capabilities are listed.
- Skill catalog is listed.
- Direct tools are listed with schemas in the prompt text.
- Execution protocol is defined.
- Agent behavior rules are defined.
- Data rules are defined.
- Global workspace context is loaded with 8 project bundles.
- Context metadata says 29 projects exist, 8 are returned, context source is fallback, and cache age is 0 seconds.
- Libri guidance is present.
- Overview guidance is present.

## 5W1H Seed Mapping

| Seed Field |  Current Match | What Works                                                                                                | What Is Missing                                                                                                                            |
| ---------- | -------------: | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Who        | Strong partial | The assistant identity is clear: proactive BuildOS project assistant.                                     | No user/tenant context, no authority summary, no distinction between user-facing assistant vs background agent.                            |
| What       |        Partial | The general job is clear: capture, organize, and advance projects. Capabilities show broad work types.    | No concise "this chat can handle these classes of requests" map; no context inventory showing loaded vs available data.                    |
| Where      |   Partial weak | It says global, no project, no entity. It includes global workspace project bundles.                      | No product surface, no session/chat position as model-visible context, no "you are at the start of a global chat" frame, no retrieval map. |
| When       |           Weak | Raw timestamps and context freshness exist in metadata.                                                   | No local current time/timezone, no "today" anchor, no explicit freshness interpretation, no time relevance policy.                         |
| Why        | Strong partial | Product purpose is clear: help users advance projects.                                                    | No explicit purpose of this chat surface as a natural-language operating layer across BuildOS.                                             |
| How        |         Strong | Tool protocol, safety rules, communication behavior, proactive behavior, and routing guidance are strong. | How is scattered and partly duplicated in tools/skills/data rules; some details are too heavy for initial seed.                            |

## Who: Seed Assessment

### What Matches

The prompt seeds identity well:

```text
You are a proactive project assistant for BuildOS...
```

It also defines the general role:

```text
help users capture, organize, and advance their projects
```

This is the correct seed-level `who`.

### Gap

The seed does not yet say enough about authority and relationship:

- Is this the signed-in user's private workspace?
- What can the assistant read by default?
- What can it mutate by default?
- Is the assistant user-facing or background?
- What should it do when user profile/preferences matter?

This does not mean `who` should become query-specific. It means the seed identity should include the operating relationship:

```text
You are BuildOS Agentic Chat, acting for the signed-in user inside their accessible BuildOS workspace. You can read accessible workspace context and use tools according to the provided schemas and permissions. You must not claim a write happened unless a tool confirms it.
```

## What: Seed Assessment

### What Matches

The prompt tells the model what BuildOS generally does:

- workspace and project overviews
- project creation
- project graph management
- planning and task structuring
- documents
- calendar
- people/profile context
- audits and forecasts
- web research
- product reference
- schema/reference
- Libri

That is a solid capability landscape.

### Gap

The seed does not clearly separate:

- what is loaded now
- what is possible through tools
- what requires skill loading
- what requires retrieval
- what is not available

The prompt includes data and tools, but it does not provide a concise initial context inventory.

Better seed shape:

```text
What this chat is prepared to handle:
- answer workspace/project status questions
- create and update project entities
- manage tasks, plans, docs, calendars, people context
- answer Libri/library questions
- inspect product/reference/schema knowledge
- use web/current info when needed

What is loaded now:
- global workspace summary for 8 of 29 accessible projects
- no active project focus
- no conversation history
- no active entity focus

What can be loaded later:
- project details
- task/document details
- skill playbooks
- schemas for long-tail tools
- Libri detail
- web/current info
```

## Where: Seed Assessment

### What Matches

The prompt states:

```text
Context type: global. The assistant is working across the workspace...
```

The dump header also says:

- Context: global
- Entity ID: none
- Project: none
- History messages: 0

This is directionally right.

### Gap

The seed `where` is under-specified.

It currently means mostly:

```text
domain scope = global workspace
```

But initial seed where should include:

```text
product_surface: global chat
conversation_position: first turn / no prior history
domain_scope: workspace-wide by default
active_project: none
active_entity: none
loaded_context: global workspace summary
loaded_context_limits: 8 of 29 projects, limited goals/plans/milestones/recent activity
retrieval_map: use overview/search/detail tools when the user narrows scope
```

The current prompt has some of this information, but it is scattered across dump metadata, model message structure, and raw JSON. It is not a clear model-facing seed.

### Important Distinction

For initial seed context, `where` should not be "Libri" just because the later user message is about Libri.

Instead:

```text
Initial where: global BuildOS chat, no active project, no active entity.
Turn-routed where after user message: Libri/library domain.
```

Both are valid, but they belong to different layers.

### Recommendation

Add a seed-level `where` block:

```xml
<where>
Product surface: global BuildOS chat.
Conversation position: new or empty thread.
Default scope: workspace-wide, with no active project or entity.
Loaded context: portfolio summary, limited to 8 of 29 accessible projects.
Use retrieval tools when the user names a specific project, task, document, calendar event, person, or Libri resource.
</where>
```

## When: Seed Assessment

### What Matches

The prompt dump includes:

- prompt dump timestamp
- context generated timestamp
- cache age
- entity `updated_at` fields
- project next-step fields that often contain temporal language
- recent activity arrays that show what changed lately

The context metadata is useful:

```json
"generated_at": "2026-04-14T15:08:21.337Z",
"cache_age_seconds": 0
```

### Gap

The seed prompt does not give the model a clean temporal frame.

Time here is broader than the clock. `When` should tell the agent where this chat is happening in the timeline of the user's work.

For a global chat, `when` should summarize the workspace-level temporal landscape:

- what is current now
- what is due today or soon
- what is overdue
- what calendar windows matter
- which projects have recent activity
- whether related changes just happened across projects, tasks, docs, events, or plans

For a project-scoped chat, `when` should narrow to that project's timeline:

- project start/end dates
- active milestones
- upcoming and overdue tasks
- upcoming calendar events
- recent project activity
- recent related changes, such as a doc update followed by a task update

For an entity-focused chat, `when` should narrow even further:

- when this task/document/plan was created or updated
- nearby due dates or events
- recent linked-entity changes
- whether the user is acting immediately after another related operation

Missing:

- current local date
- current local time
- timezone
- today/tomorrow/yesterday interpretation policy
- workspace or project timeline summary
- upcoming and overdue work summary
- relevant calendar window
- recent activity summary as temporal context, not just raw rows
- relationship between recent actions, such as "a related doc was updated shortly before this task"
- time relevance of loaded context for the current seed scope
- whether project "today" language should be resolved against local date

This matters because the global project summaries include fields like:

```text
Schedule a 15-minute call ... today
Schedule a 2-hour session today ...
Confirm Mom's availability for 4pm Apr 15 call
```

If the user asks "what should I do today?" the model needs a concrete local date.

It also needs a timeline view. The model should know whether "today" is a workspace triage day with multiple active projects, whether a specific project has an imminent milestone, or whether a cluster of recent updates suggests the user is midstream in a related workflow.

### When Depends on Where

`When` and `where` are tightly coupled.

If `where` is global, `when` should be a portfolio timeline:

```text
workspace_now:
- current date/time
- projects with due-soon or overdue work
- upcoming calendar events across the workspace
- recent changes across accessible projects
- known freshness/completeness limits
```

If `where` is a project, `when` should be a project timeline:

```text
project_now:
- project start/end or target dates
- current milestone/task horizon
- overdue and due-soon tasks
- upcoming project calendar events
- recent project activity
- linked changes that may explain why the user is here now
```

If `where` is an entity, `when` should be an entity-local temporal frame:

```text
entity_now:
- last updated time
- due date or event time if relevant
- recent linked task/doc/plan updates
- prior turn or tool action that led here
```

This means `when` should not be a single static block. It should be scoped by the current `where`.

### Recent Actions Are Part of When

Recent activity is temporal context, not just workspace data.

Examples:

- A document was updated five minutes ago, and now the user asks to update a related task.
- Three tasks in the same plan were marked done today, and now the user asks "what's next?"
- A calendar event was moved yesterday, and now the user asks about due dates.
- A project had several recent task updates, so the agent should treat that project as active even if the user is vague.

This can be overdone if every recent event is injected. The seed should prefer compact temporal summaries and retrieval paths:

```text
recent_activity_summary:
- AVI project has 3 task updates in the last hour.
- Tacemus has recent document and task activity in the last 2 days.
- BuildOS has recent milestone/task updates from yesterday.
```

Then the agent can retrieve details only when the user asks something that depends on them.

### Recommendation

Add a seed-level `when` block:

```xml
<when>
Current time: 2026-04-14 11:08 AM America/New_York.
Current UTC: 2026-04-14T15:08:22.536Z.
Use this date for "today", "tomorrow", and "yesterday" unless the user states another timezone.
Workspace context generated 1 second ago.
Temporal scope: global workspace timeline.
Loaded timeline: partial portfolio view with recent activity for 8 of 29 accessible projects.
Known limits: project-level task due dates and calendar event windows are not fully loaded; use overview/calendar/task tools when the user asks about today, upcoming work, overdue work, or recent changes.
</when>
```

## Why: Seed Assessment

### What Matches

The prompt seeds the product purpose:

```text
help users capture, organize, and advance their projects
```

This is good.

### Gap

The seed could better explain why this chat exists as a surface:

```text
This chat is the user's natural-language operating layer over BuildOS. It should help the user inspect, update, organize, and advance work without forcing them to navigate the UI manually.
```

That is not the same as turn-specific why. It is the durable purpose of the chat.

### Recommendation

Keep `why` product-level in seed context:

```xml
<why>
This chat exists to help the user operate their BuildOS workspace through natural language: understand what is happening, capture new work, update existing work, retrieve memory, and move projects forward.
</why>
```

## How: Seed Assessment

### What Matches

The prompt has strong seed-level `how`.

It covers:

- think in capability, skill, tool layers
- use direct tools first when they fit
- use `skill_load` for multi-step or risky workflows
- use `tool_search` for operation discovery, not workspace data
- use `tool_schema` for uncertain args
- pass exact IDs
- do not use placeholders
- do not claim actions you did not perform
- communicate before tool calls
- summarize tool outcomes
- ask minimal clarifying questions
- be proactive but brief

This is a strong operating strategy.

### Gap

The seed-level `how` is too scattered and heavy.

Some rules are duplicated or belong elsewhere:

- provider tool schemas are copied into prompt text and likely also sent as provider tool definitions
- workflow-specific rules are mixed with global behavior rules
- document hierarchy and member role rules are always loaded even when not needed
- proactive intelligence is project-specific even when the user may ask a Libri/product/reference question

### Recommendation

Split `how` into three seed sections:

```text
Global behavior:
- be concise, helpful, accurate
- prefer useful action over needless clarification
- never fabricate tool outcomes
- never guess IDs or required write args

Tool strategy:
- use direct tools when available
- load skills for workflow guidance
- search/schema only when needed

Proactive behavior:
- for project/workflow turns, surface next steps and risks
- for factual/reference turns, answer directly and do not force project follow-ups
```

That last distinction matters. The current seed pushes proactive project behavior globally, even for non-project questions.

## Capability Surface Seed Assessment

This is the strongest part of the current seed.

### What Works

The prompt gives the agent a broad map of what BuildOS can do.

It includes:

- capabilities
- skill metadata
- preloaded direct tools
- discovery tools
- Libri tools
- overview tools
- search tools
- calendar tools

This prepares the agent for many possible user messages.

### Gap

The seed has too much schema detail in prompt text.

The dump reports:

- `tools_text_block`: about 6034 estimated tokens
- `tool_definitions`: about 4063 estimated tokens

If schemas are available as provider tool definitions, the system prompt should not also include a full JSON duplicate unless there is a specific provider reason.

### Recommendation

Keep seed capability surface high-level:

```text
Capabilities: one-line summaries.
Skills: id plus description.
Preloaded tools: names plus short use cases.
Schemas: provider tool definitions or `tool_schema`, not full duplicated JSON in instructions.
```

## Initial Seed Context: What Is Over-Included?

This analysis is not saying "remove all workspace context." A global chat needs some workspace landscape.

But the current seed includes a lot of raw workspace detail:

- 8 project bundles
- up to 2 goals per project
- up to 2 plans per project
- up to 2 milestones per project
- up to 3 recent activity items per project
- full IDs and descriptions

That may be useful for a broad status question, but it is expensive as the default seed for any possible user message.

The better default seed may be:

```text
Workspace index, not workspace detail.
```

For example:

- project names, IDs, states, next step short, updated_at
- project count and returned count
- recent activity only if it is very compact
- no goals/plans/milestones unless the user asks for workspace/project status
- use overview/detail tools to load deeper data

## Initial Seed Context: What Is Missing?

### 1. A True Seed Context Packet

There is no explicit seed block:

```text
who
what
where
when
why
how
```

The information exists in pieces, but not as a coherent packet.

### 2. Context Inventory

The prompt needs a concise inventory:

```text
Loaded now:
- global workspace summary
- 8 of 29 projects
- no active project
- no active entity
- no conversation history

Available by tool:
- project overview/details/search
- task/document/calendar reads and writes
- Libri queries
- skills and schemas
```

### 3. Retrieval Map

The agent needs to know where to go next depending on what the user asks.

Example:

```text
If the user asks workspace/project status: use loaded context or overview tools.
If the user names a project: resolve project and narrow scope.
If the user asks a Libri/library question: use Libri tools/skill.
If the user asks current external facts: use web tools.
If the user asks to mutate data: confirm exact IDs and schema.
```

Some of this exists, but it is spread across capabilities, tools, and guidance.

### 4. Current Local Time

The seed should include local date/time/timezone plus the relevant work timeline.

This is necessary for BuildOS because tasks, calendar, due dates, recent actions, and "today" language are central.

Global seed context should give a compact workspace timeline. Project seed context should give a compact project timeline. Entity seed context should give a compact entity-local timeline.

### 5. Authority and Permissions Summary

The seed should say:

- read accessible workspace context
- execute allowed tools
- writes must obey exact IDs, schemas, and permissions
- destructive/ambiguous actions require clarification or approval

### 6. Relevance and Completeness Markers

Context metadata should be transformed into model-usable guidance:

```text
Portfolio context is partial: 8 of 29 projects returned.
Project detail is not loaded.
Use overview/search/detail tools for complete answers.
```

### 7. Surface and Mode

The seed should know whether the chat spawned from:

- global chat
- project page
- daily brief
- calendar
- task/document view
- voice flow
- background/agent-to-agent context

The dump only gives `global`.

## Did We Forget Anything?

For initial seed context, the missing pieces are slightly different from the prior turn-specific report.

### 1. Landscape

The seed should prep the landscape:

- what BuildOS is
- what data is currently loaded
- what domains/tools exist
- how to navigate from broad query to specific data

### 2. Availability vs Loaded Context

The agent should distinguish:

- data loaded in prompt
- data available by tool
- data unavailable
- data requiring external/current lookup

### 3. Readiness

The seed should answer:

```text
Is the agent ready for common first messages?
```

Common first messages include:

- What is happening with my projects?
- What should I do today?
- Create a project for this idea.
- Update this task.
- What authors do you have in Libri?
- Search my docs for X.
- What changed recently?
- Help me plan this.

### 4. Routing Policy

The seed should not route the specific turn yet, but it should provide a routing policy for first messages.

### 5. Context Budget Policy

The seed should explain and enforce:

- what gets loaded up front
- what is deferred
- why
- how to fetch deferred context

### 6. Default Non-Project Behavior

BuildOS is project-centered, but not every user message is a project-management turn.

The seed should explicitly allow:

- Libri questions
- product/reference questions
- web/current questions
- simple conversational questions

without forcing proactive project framing every time.

## Corrected Gap Summary

The actual seed prompt is directionally strong:

- identity is clear
- mission is clear
- capabilities are broad
- skills/tools are well represented
- tool-use strategy is strong
- global workspace context gives some landscape

The seed prompt is not yet clean:

- it lacks an explicit 5W1H seed packet
- `where` is too coarse
- `when` lacks local time/timezone and does not yet summarize the relevant workspace/project timeline
- loaded context is not clearly inventoried
- available context is not clearly mapped
- it over-includes raw workspace data for a generic first turn
- tool schemas appear duplicated
- project-proactive behavior may be over-applied to non-project turns

## Proposed Seed Context Shape

This is the kind of block the initial prompt should eventually include:

```xml
<seed_context>
  <who>
    You are BuildOS Agentic Chat, a helpful project assistant for the signed-in user.
    You operate over the user's accessible BuildOS workspace, memory, skills, and tools.
  </who>

  <what>
    This chat can help the user understand, capture, organize, update, and advance work.
    It can also answer BuildOS product/reference questions, Libri/library questions, calendar questions, and current web questions when the right tools are available.
  </what>

  <where>
    Product surface: global BuildOS chat.
    Default scope: workspace-wide.
    Active project: none.
    Active entity: none.
    Conversation position: new thread with no prior messages.
    Loaded context: partial portfolio summary, 8 of 29 accessible projects.
    Retrieval map: use overview/search/detail/skill/tool-schema tools to narrow or deepen context after the user asks.
  </where>

  <when>
    Current local time: 2026-04-14 11:08 AM America/New_York.
    Current UTC: 2026-04-14T15:08:22.536Z.
    Use this for relative dates unless the user states otherwise.
    Loaded workspace context generated 1 second ago.
    Temporal scope: global workspace timeline.
    Loaded timeline context: partial recent activity and next-step fields for 8 of 29 accessible projects.
    Not fully loaded: complete task due-date horizon, full calendar window, and all project activity.
    If the user asks about today, overdue work, upcoming work, or recent changes, use overview/task/calendar/search tools to load the relevant timeline.
  </when>

  <why>
    This chat exists as the user's natural-language operating layer over BuildOS: answer questions, retrieve memory, create/update structured work, and help projects move forward.
  </why>

  <how>
    Be concise and useful.
    Use direct tools when they fit.
    Load skills for multi-step or risky workflows.
    Fetch missing context instead of guessing.
    Never fabricate tool outcomes or write with unknown IDs.
    Apply proactive project guidance only when the user's turn is project/workflow related.
  </how>
</seed_context>
```

## Recommended Next Steps

1. Add seed context packet generation to prompt observability first.
2. Add current local time/timezone to seed context.
3. Add context inventory and retrieval map to the model-visible prompt.
4. Reduce full tool JSON duplication in instructions.
5. Consider replacing default global detail payload with a lighter workspace index plus overview retrieval.
6. Split project-specific proactive behavior from general helpful behavior.
7. Add turn-context generation separately after the user message is known.
8. Add phase-context/WhereFrame later for tool-loop transitions.

## Final Takeaway

The seed context should not overfit to the first user query.

It should prepare the BuildOS agent with the landscape:

```text
who it is
what kind of help it can provide
where it is starting from
when the interaction is happening
why this chat exists
how it should operate
what capabilities/tools can be used after the user asks
```

The current prompt mostly has the right ingredients, but they are scattered and heavy. The next step is not to make `who` turn-specific. The next step is to make the initial seed context explicit, compact, and navigable.
