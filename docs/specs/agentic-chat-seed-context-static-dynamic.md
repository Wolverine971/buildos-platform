<!-- docs/specs/agentic-chat-seed-context-static-dynamic.md -->

# Agentic Chat Seed Context: Static and Dynamic Sections

Status: Draft spec
Date: 2026-04-14
Owner: BuildOS Agentic Chat

Related:

- [Agentic Chat Core Elements](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-core-elements.md)
- [Agentic Chat Core Elements, Part 2: Context as 5W1H](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-core-elements-part-2-context.md)
- [Agentic Chat Initial Seed Context Gap Analysis](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md)
- [Global prompt dump](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-14T15-08-22-536Z.txt)
- [Project prompt dump](/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/fastchat-2026-04-14T18-09-25-958Z.txt)

## Purpose

This doc defines what should be static and what should be dynamically hydrated in the initial seed context for BuildOS agentic chat.

The goal is to seed the agent with the right landscape before it responds to the user, without overfitting the prompt to a specific query and without loading every possible detail upfront.

## Core Separation

There are four layers. They should not be mixed together.

```text
1. Static Agent Frame
   Stable identity, mission, behavior, and global rules.

2. Spawn Seed Context
   Dynamic context known when the chat starts or resumes:
   global/project/entity focus, loaded data, time, permissions, history, retrieval map.

3. Turn Context
   Lightweight context after reading the latest user message.
   Prefer model/runtime handling over a separate pre-turn router.
   If captured, treat this as trace/eval metadata first, not a new control plane.

4. Phase Context
   Dynamic context inside the runtime loop:
   before tool, after tool, observation, recovery, finalization.
```

The current discussion is mostly about layers 1 and 2.

## Recommended Top-Level Prompt Shape

The initial seed does not need rigid equal-sized `who/what/why/where/when/how` sections. Use sections where they carry real information.

Recommended shape:

```text
1. Identity and Mission
2. Current Focus and Purpose
3. Location and Loaded Context
4. Timeline and Recent Activity
5. Operating Strategy
6. Capabilities, Skills, and Tools
7. Context Inventory and Retrieval Map
8. Safety and Data Rules
```

This keeps the 5W1H model, but maps it into sections that are easier to hydrate.

## Static vs Dynamic Summary

| Section                | Static? |  Dynamic? | Notes                                                                                                      |
| ---------------------- | ------: | --------: | ---------------------------------------------------------------------------------------------------------- |
| Identity               |     Yes |    Rarely | BuildOS is a helpful project assistant. Do not rewrite this per query.                                     |
| Mission / Why          |  Mostly | Sometimes | Product-level purpose is static; surface-level purpose can vary by global/project/daily brief.             |
| What We Are Focused On |      No |       Yes | Global workspace, one project, or focused entity. This should be hydrated from spawn context.              |
| Where We Are           |      No |       Yes | Product surface, scope, active project/entity, conversation position, loaded context.                      |
| When / Timeline        |      No |       Yes | Current time plus timeline scoped by `where`.                                                              |
| How / Strategy         |  Mostly |       Yes | Global behavior is static; surface/focus-specific strategy is dynamic.                                     |
| Capabilities           |  Mostly |  Slightly | Capability catalog is stable; availability can be feature-flagged.                                         |
| Skills                 |  Mostly |  Slightly | Skill metadata is stable; enabled skills can vary. Full skill bodies are dynamic/on-demand.                |
| Tools                  |      No |       Yes | Preloaded direct tools depend on scope and enabled integrations. Schemas should be deferred when possible. |
| Context Inventory      |      No |       Yes | Must describe what was loaded, omitted, and where to retrieve more.                                        |
| Safety Rules           |  Mostly | Sometimes | Core invariants are static; permission/approval details are dynamic.                                       |

## Section 1: Identity and Mission

This is mostly static.

### Should Include

- BuildOS agent identity.
- The agent is a helpful project assistant.
- BuildOS is a workspace for projects, tasks, plans, docs, goals, milestones, events, people context, and memory.
- The agent helps the user understand, capture, organize, update, and advance work.
- The agent can use skills and tools when needed.

### Should Not Include

- Turn-specific role rewrites like "you are a Libri assistant."
- Current user request interpretation.
- Tool schemas.
- Focus-specific data.

### Example

```text
You are BuildOS Agentic Chat, a helpful project assistant for the signed-in user.
Your job is to help the user understand, capture, organize, update, and advance work in BuildOS.
BuildOS represents work as projects, tasks, plans, documents, goals, milestones, events, people context, and memory.
```

## Section 2: Current Focus and Purpose

This is dynamic.

This is where `what` and `why` should live together. `What` should not be a generic capability list. It should describe what this chat is currently centered on. `Why` should come right after it because the purpose depends on the focus.

### Global Context

Load:

- focus type: global workspace
- active project: none
- active entity: none
- purpose: help the user operate across the workspace and narrow scope when needed

Example:

```text
Current focus: global workspace.
Active project: none.
Active entity: none.
Purpose: provide a workspace-level operating layer; answer broad questions, find the right project/entity, and narrow scope when the user points to something specific.
```

### Project Context

Load:

- project ID and name
- project state
- short project description
- current next step
- purpose: help the user understand and advance this project

Example:

```text
Current focus: project "AVI meetings teaching claude code".
Project ID: aed40b38-5d42-439e-8b25-1b943256de0c.
Purpose: help the user operate inside this project, using its tasks, docs, events, members, and timeline as the default working set.
```

### Project Entity Focus

Load:

- parent project ID/name
- focused entity type, ID, name/title
- entity state
- entity path or relationship to project
- purpose: help with this entity while preserving project context

Example:

```text
Current focus: task "Invoice AVI $900 for OpenClaw support work".
Parent project: "AVI meetings teaching claude code".
Purpose: help the user update, understand, or act on this task while keeping nearby project tasks, docs, events, and dependencies in view.
```

## Section 3: Location and Loaded Context

This is dynamic.

This is the `where` section. It should not only say `global` or `project`. It should explain what surface and scope the agent is starting from and what data has already been hydrated.

### Should Include

- product surface: global chat, project page, document view, task view, daily brief, calendar, voice, agent-to-agent
- conversation position: new thread, follow-up, resumed thread, post-compaction
- scope: workspace, project, entity focus
- active project/entity
- loaded context type
- loaded context limits
- what is intentionally not loaded

### Global Context Hydration

Load a high-level portfolio landscape:

- accessible project count
- returned project count
- project ID/name/state/updated_at
- next step short
- compact recent activity summary per selected project
- maybe high-level active/blocked/due-soon counts if available
- context freshness and completeness

Avoid loading by default:

- full goals/plans/milestones for every project
- full task lists
- full docs
- full event windows
- deep relationship graphs

Why:

- global context should help orient and route
- it should not become a full workspace dump

### Project Context Hydration

Load the project working set:

- project object
- current goals
- current milestones
- current plans
- prioritized tasks
- documents and doc tree summary
- relevant events/calendar window
- members and permissions
- recent project activity if available
- context completeness by entity type

Avoid loading by default:

- unrelated projects
- complete document bodies unless focused or requested
- all historical activity
- full deep graph if a compact working set is enough

Why:

- project context should let the agent operate inside one project without rediscovering basic structure.

### Project Entity-Focused Hydration

Load the focused entity and its neighborhood:

- parent project object
- focused entity full details
- linked entities
- parent/child/sibling records
- relevant document tree path or graph path
- nearby tasks/docs/events/plans/goals
- recent updates to focused entity and linked entities
- permissions and allowed write operations

Avoid loading by default:

- entire project graph if the entity neighborhood is enough
- unrelated project tasks
- full document bodies unless the focused entity is a document or the turn requires content

Why:

- entity focus should answer "where does this thing fit?" not just "what is this thing?"

## Section 4: Timeline and Recent Activity

This is dynamic.

This is the `when` section. It should include absolute time, but more importantly it should show where the current focus sits in the timeline of work.

### Always Load

- current local date/time
- timezone
- current UTC time
- context generated time
- freshness/cache age
- relative date policy for today/tomorrow/yesterday

### Global Context Timeline

Load a compact portfolio timeline:

- projects with due-soon or overdue work
- upcoming calendar events across the workspace, if available
- recent activity clusters across projects
- projects with meaningful recent changes
- any timeline limits or omitted data

Example:

```text
Timeline scope: global workspace.
Current local time: 2026-04-14 11:08 AM America/New_York.
Loaded timeline: partial portfolio recent activity for 8 of 29 projects.
Known limits: full task due-date horizon and full calendar window are not loaded; use overview/task/calendar tools for complete today/upcoming/overdue answers.
```

### Project Context Timeline

Load a project timeline:

- project start/end/target dates
- tasks due today, due soon, overdue
- upcoming project events
- current milestones
- recently updated project entities
- recent related changes, such as doc updates followed by task changes
- event window and task selection limits

Example from the recent project dump:

```text
Timeline scope: project "AVI meetings teaching claude code".
Current event window: 2026-04-07 to 2026-04-28.
Loaded tasks include due dates on Apr 14, Apr 20, and Apr 27.
Recent activity: invoice/follow-up tasks updated around Apr 14 14:40 UTC.
Known limits: goals/plans/milestones are empty; 6 of 6 tasks loaded; 6 of 6 events loaded.
```

### Project Entity Timeline

Load an entity-local timeline:

- entity created/updated/completed timestamps
- due date or scheduled event if applicable
- nearby linked events
- recent linked entity updates
- prior turn/tool action that may explain why the user is acting now

Example:

```text
Timeline scope: focused task.
Task due: 2026-04-20 23:59 UTC.
Task updated: 2026-04-14 14:40 UTC.
Linked project events include start/due events.
Recent related activity suggests this task is part of today's AVI follow-up batch.
```

### Important Rule

Recent activity should be summarized, not dumped, unless the user asks for detail.

## Section 5: Operating Strategy

This is mixed: mostly static, with dynamic scope tuning.

This is the `how` section.

### Static How

Always include:

- be concise and useful
- prefer action over unnecessary clarification
- do not fabricate tool outcomes
- do not guess IDs or write arguments
- ask one concise clarification when identity or required data is ambiguous
- use tools only when they are needed
- reuse exact IDs from context/tool results

### Dynamic How by Scope

Global:

- orient across workspace
- narrow scope when the user names or implies a project/entity
- use overview/search tools for broad questions
- avoid overcommitting to one project unless evidence is clear

Project:

- assume the named project is the default working set
- prefer project-scoped tools and IDs
- connect tasks/docs/events/goals/plans inside the project
- mention cross-project context only when user asks or evidence requires it

Entity focus:

- prioritize the focused entity
- preserve parent project context
- inspect linked records before changing related entities
- do not lose the entity's location in the project structure

Non-project/factual turns:

- answer directly using the relevant capability/tool
- do not force project-proactive suggestions unless the user connects the topic to a project

## Section 6: Capabilities, Skills, and Tools

This is mixed.

The capability/skill model is mostly static. The exposed tool surface is dynamic.

### Static

Keep in seed:

- capability names and short summaries
- skill IDs and short descriptions
- explanation of progressive disclosure
- tool-use policy

### Dynamic

Hydrate by scope:

Global tools:

- workspace overview
- project overview/search/list
- broad BuildOS search
- task/document search/list
- calendar list/create/update if appropriate
- Libri tools if enabled
- web/product reference tools if enabled

Project tools:

- project overview/details/graph
- task list/get/search/create/update
- document list/get/create/update/tree/move
- project calendar get/set
- project-scoped event tools
- Libri/web tools only if globally useful and not too distracting

Entity focus tools:

- focused entity get/update tools
- linked entity lookup tools
- parent project overview/graph
- document tree/path tools when focused on docs
- task docs tools when focused on tasks

### Avoid

- duplicating full provider tool schemas in the system prompt when schemas are already provided as model tools
- loading every long-tail tool upfront
- hiding hot-path direct tools behind generic discovery

## Section 7: Context Inventory and Retrieval Map

This is dynamic and should probably be explicit.

This may be the missing bridge between the 5W1H sections and actual tool behavior.

### Should Include

- what data is loaded now
- what data is partial
- what data is omitted
- what can be loaded by direct tool
- what requires skill loading
- what requires tool search/schema
- what should not be assumed

### Example: Global

```text
Loaded now:
- portfolio index for 8 of 29 accessible projects
- compact recent activity for selected projects
- no active project or entity

Not loaded:
- full project graphs
- full task due-date horizon
- full calendar across all projects
- full document bodies

Use tools:
- workspace overview for broad status
- project overview when project is named
- search_buildos for cross-project search
- list_calendar_events for time-bound calendar questions
```

### Example: Project

```text
Loaded now:
- project details
- 6 tasks, 6 events, 1 document tree item
- members and permissions
- entity scope completeness says tasks/events/documents are complete for this project context

Not loaded:
- full document body
- unrelated projects

Use tools:
- update_onto_task for task mutations with exact task IDs
- get_onto_document_details for full document content
- get_project_calendar/set_project_calendar for calendar mapping
```

### Example: Entity Focus

```text
Loaded now:
- focused entity full details
- parent project
- linked entities and edges
- nearby documents/tasks/events

Not loaded:
- entire project history
- unrelated sibling branches beyond neighborhood

Use tools:
- focused entity update tool for direct changes
- graph/search tools for ambiguous related entities
- document/task detail tools for deeper context
```

## Static Prompt Content

This should be stable across contexts:

- identity
- mission
- global behavior rules
- core safety rules
- progressive disclosure model
- capability summaries
- skill metadata
- high-level data model
- high-level tool strategy

Keep it short. Static content is paid for on every turn.

## Dynamic Prompt Content

This should be hydrated per spawn/context:

- focus and purpose
- where/scope/surface
- when/timeline/recent activity
- loaded data
- context completeness
- permissions
- conversation summary/history
- recent referents
- preloaded direct tools
- retrieval map

Dynamic content should be selected by the current `where`.

## What Should Move After the User Message

Do not over-seed turn-specific interpretation, and do not build a heavy pre-turn
router just to classify the request. That would duplicate the model plus tool
request/response loop and create a second place for routing to go wrong.

The practical version is:

- let the model read the seed context and choose the tool path
- let direct tools, skill loading, and tool discovery handle the request/response loop
- record what route was actually chosen for observability and evals
- add deterministic hints only when the UI/session already knows the scope

If captured, turn context should be a lightweight trace object derived from the
request and the first model/tool actions, not a required preflight plan.

Possible fields:

- intent
- target domain
- target project/entity if implied
- needed capability
- whether a skill should be loaded
- whether existing seed data is sufficient
- whether to fetch more context
- tool route
- output contract for this turn

Example:

```text
User asks: What authors do you have in Libri?
Observed turn route: Libri inventory question; model called query_libri_library/list_authors; no project mutation occurred.
```

This is turn context, not seed identity.

## What Should Move Into Phase Context

After tool calls, derive:

- tool succeeded or failed
- what changed or was learned
- exact IDs now known
- current workflow phase
- next expected step: continue, repair, clarify, or final answer

This should not be mixed into the initial seed.

## Proposed Seed Template

This is an example shape, not a strict requirement.

```xml
<identity_and_mission>
You are BuildOS Agentic Chat, a helpful project assistant for the signed-in user.
You help the user understand, capture, organize, update, and advance work in BuildOS.
</identity_and_mission>

<current_focus_and_purpose>
Focus: {global workspace | project | entity}.
Purpose: {scope-specific purpose}.
</current_focus_and_purpose>

<location_and_loaded_context>
Surface: {global chat | project page | task view | doc view | daily brief}.
Conversation position: {new thread | follow-up | resumed | post-compaction}.
Loaded context: {compact inventory}.
Known limits: {omissions/completeness}.
</location_and_loaded_context>

<timeline_and_recent_activity>
Current local time: {local datetime and timezone}.
Timeline scope: {workspace | project | entity}.
Loaded timeline: {due/upcoming/recent summary}.
Known limits: {calendar/task/activity limits}.
</timeline_and_recent_activity>

<operating_strategy>
{static global behavior}
{scope-specific strategy}
</operating_strategy>

<capabilities_skills_tools>
{capability summaries}
{skill metadata}
{preloaded direct tool names or concise descriptions}
{discovery policy}
</capabilities_skills_tools>

<context_inventory_and_retrieval_map>
Loaded now: ...
Available by tool: ...
Not loaded: ...
Use retrieval when: ...
</context_inventory_and_retrieval_map>
```

## Concrete Gap Against Current Dumps

### Global Dump

Current:

- loads 8 project bundles
- says `Context type: global`
- includes overview and Libri guidance
- includes no explicit seed packet
- includes no current local time
- includes no context inventory/retrieval map

Better:

- keep a portfolio index
- add seed focus/where/when/context inventory
- summarize timeline rather than dump deep project details
- defer deeper project/task/calendar details to overview/search tools

### Project Dump

Current:

- loads project details
- loads tasks with due dates
- loads events with a window
- loads members
- loads doc tree
- has context metadata with completeness
- says `Context type: project`

Better:

- keep most project working-set hydration
- add explicit project timeline summary
- add context inventory and completeness in prose
- add focused retrieval map
- reduce duplicated tool schema text

### Entity Focus

Current:

- code supports focus tags, but recent dumps found here mostly show `focus_entity_type: none`
- entity focus needs a more explicit design target

Better:

- load parent project plus focused entity
- load linked entities and surrounding structure
- load entity-local timeline
- load exact write/retrieval tools for entity type
- tell the model where this entity sits in the project

## Final Position

The seed prompt should be built from stable blocks plus dynamic hydration.

Static:

```text
who BuildOS is
why BuildOS chat exists
global behavior and safety
capability/skill/tool model
```

Dynamic:

```text
what we are focused on
where this chat starts
when this focus sits in the timeline
what data is loaded
what data is omitted
which tools are preloaded
how strategy should adjust to global/project/entity focus
```

Turn-specific:

```text
what the user just asked
which capability/skill/tool route applies
what extra context must be fetched
```

Phase-specific:

```text
what a tool just did
where the runtime is now
what should happen next
```

This keeps the initial seed broad enough to handle whatever the user says, while making the dynamic context precise enough that the agent knows where it is starting from.
