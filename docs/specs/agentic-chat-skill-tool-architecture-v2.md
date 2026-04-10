<!-- docs/specs/agentic-chat-skill-tool-architecture-v2.md -->

# Agentic Chat Skill + Tool Architecture V2

Status: In Progress
Date: 2026-04-09
Owner: BuildOS Agentic Chat
Related docs:

- [Agentic Chat Operating Model](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-operating-model.md)
- [Agentic Chat (Current Implementation)](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)

Replaces:

- [Agentic Chat Skills System - Design Spec](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-skills-system.md)
- [Progressive Tool Disclosure Gateway Spec](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/progressive-tool-disclosure-spec.md)
- [Spec v2: Progressive Tool Disclosure for BuildOS Ontology + Utility Tools](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/tool-help-spec.md)
- [tool-help-spec-2](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/tool-help-spec-2.md)

## 1. Executive Summary

BuildOS should use four distinct layers:

1. Capabilities
   Broad prompt-time statements about what BuildOS can do.
2. Skills
   On-demand workflow playbooks that teach the model how to use BuildOS well.
3. Tool discovery
   On-demand lookup for which exact BuildOS tool exists for a task.
4. Tool execution
   The runtime call that actually performs the read or write.

The current gateway collapses layers 2-4 into `tool_help` plus `tool_exec`. That kept the visible tool list small, but it also overloaded one help path with:

- capability browsing
- skill browsing
- namespace browsing
- exact schema lookup
- retry guidance

This has created muddled abstractions, path-oriented prompting, and repair-heavy runtime logic.

This spec replaces that model with:

- broad, static capability awareness in the prompt
- preloaded skill metadata only
- first-class `skill_load`
- first-class `tool_search`
- first-class `tool_schema`
- a single execution surface `buildos_call`

The result is a simpler mental model:

- capabilities tell the model what BuildOS can do
- skills teach process
- tool discovery finds the exact callable thing
- schema lookup teaches exact arguments
- execution performs the action

## 2. Why Change

### 2.1 Current repo findings

Current prompt/runtime behavior:

- The prompt preloads `buildos_capabilities`, `capability_catalog`, and `skill_catalog` in both V2 and legacy prompt builders.
- In gateway mode, the model only sees two callable tools: `tool_help` and `tool_exec`.
- `tool_help` currently returns capabilities, skills, directories, and exact op help from one generic path tree.
- Runtime recovery logic contains explicit handling for:
    - repeated `tool_help("root")` loops
    - malformed `tool_help` payloads
    - malformed `tool_exec` payloads
    - special-case repair guidance for `onto.project.create`

Relevant code:

- [master-prompt-builder.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [prompt-generation-service.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/prompts/prompt-generation-service.ts)
- [tool-help.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-help.ts)
- [gateway.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts)
- [stream-orchestrator.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts)
- [tool-registry.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts)
- [external-tool-gateway.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/external-tool-gateway.ts)

### 2.2 What the external research says

Anthropic's current guidance is materially aligned with the desired BuildOS model:

- Skills should be prompt-based playbooks, not tools.
- Only skill metadata should be preloaded up front.
- Full skill content should load on demand.
- Tools should be self-describing, schema-rich, and example-rich.
- Large tool libraries should use deferred loading or tool search instead of front-loading everything.

Primary references:

- [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
- [Tool reference](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-reference)
- [Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

### 2.3 Provider constraint

BuildOS is OpenRouter-first, with direct provider fallback. We should not make the core BuildOS architecture depend on Anthropic-only native `tool_search` or `defer_loading`.

Instead, BuildOS should implement a provider-neutral equivalent:

- small fixed meta-tool surface
- internal tool registry
- on-demand schema lookup
- optional future integration with provider-native deferred tools when the serving stack supports it cleanly

Relevant runtime context:

- [CLAUDE.md](/Users/djwayne/buildos-platform/CLAUDE.md)
- [smart-llm-service.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/smart-llm-service.ts)

## 3. Design Principles

### 3.1 Capabilities are broad, not routable

Capabilities are prompt-only product awareness. They are not a path tree and they are not a schema catalog.

Good capability examples:

- BuildOS can create and structure projects
- BuildOS can manage tasks, plans, goals, milestones, and documents
- BuildOS can work with calendars and project calendar mappings
- BuildOS can search and summarize workspace or project state
- BuildOS can use people and profile context

Capabilities answer:

- "What kinds of work can BuildOS do?"

They do not answer:

- "Which exact tool do I call?"
- "What args are required?"
- "What is the exact workflow?"

### 3.2 Skills teach process

Skills are reusable workflow playbooks.

They should:

- explain when to use the skill
- explain the recommended workflow
- call out common mistakes
- reference related canonical tools
- teach decision-making and sequencing

They should not:

- act like hidden tool definitions
- shadow an exact executable tool too closely
- require directory browsing to discover

### 3.3 Tools are the execution surface

Tools should be discoverable independently of skills.

Skill lookup and tool schema lookup are different actions:

- `skill_load` answers "How should I approach this workflow?"
- `tool_search` answers "Which tool should I use?"
- `tool_schema` answers "What exact arguments does that tool require?"

### 3.4 Tool schemas should be available on demand

The model should not need every tool definition in the initial prompt.

The model should be able to say, in effect:

- "I need a calendar update tool"
- "I need the schema for project creation"
- "I need examples for task update"

and receive that information on demand.

### 3.5 Keep the callable surface small

The model does need some callable surface up front.

The recommended default BuildOS callable surface is:

- `skill_load`
- `tool_search`
- `tool_schema`
- `buildos_call`

This preserves the token and reliability benefits of a small tool list without forcing skill and schema discovery through one overloaded pseudo-filesystem.

## 4. Target Mental Model

The model should be taught one compact operating model:

1. BuildOS has broad capabilities.
2. Skills are playbooks for workflows.
3. Tools are exact actions.
4. Search for a tool when you do not know the exact action.
5. Load a schema when you do not know the exact arguments.
6. Call the tool only when you have concrete arguments.

Prompt-time instruction should sound like this:

- Use a skill when the task is multi-step, stateful, or easy to get wrong.
- Do not load skills speculatively.
- Search tools when the exact action is not already known.
- Load the exact schema before first-time or risky writes.
- Do not guess IDs or required fields.

## 5. Target Runtime Architecture

### 5.1 Prompt-time content

Always preload:

- BuildOS capability summary
- skill registry metadata only
- global safety / mutation rules
- direct overview guidance for routine status questions

Do not preload:

- capability routing catalogs
- skill path trees
- full skill bodies
- all tool definitions
- path heuristics like "start with root"

### 5.2 Skill registry

Each skill should have:

- `id`
- `name`
- `summary`
- `when_to_use`
- `related_ops`
- `legacy_paths`

At prompt time, preload only lightweight skill metadata such as id/name/summary.

The full skill body should be loaded through `skill_load`.

Implementation note:

- The source of truth for a BuildOS skill should be a markdown `SKILL.md` file.
- Each `SKILL.md` should use YAML frontmatter with at least `name` and `description`.
- The body should be a markdown playbook, not a JSON-like tool spec.
- Recommended section shape:
    - `## When to Use`
    - `## Workflow`
    - `## Related Tools`
    - `## Guardrails`
    - `## Examples`
    - `## Notes`
- Runtime code may parse `SKILL.md` into structured metadata for prompt preload and UI/activity display, but the authored artifact should remain markdown-first.

### 5.3 Tool registry

The internal registry remains the source of truth for canonical BuildOS tools.

It should map:

- canonical tool id
- underlying implementation name
- JSON schema
- examples
- aliases
- read/write kind
- risk level
- contexts
- summary
- common mistakes

The current `tool-registry.ts` is the right place to evolve this, but it should become a canonical tool registry, not only an op registry for `tool_exec`.

### 5.4 Execution surface

BuildOS should use one provider-neutral execution tool:

- `buildos_call`

Input:

```json
{
	"op": "onto.project.create",
	"args": {},
	"idempotency_key": "optional",
	"dry_run": false
}
```

This keeps the visible tool list small while still letting the system use semantic canonical tool ids.

The existing executor can continue mapping canonical ids to underlying implementation names during migration.

## 6. Canonical Concepts

### 6.1 Capabilities

Capabilities are broad statements only.

Proposed prompt-time capability list:

- project creation and structuring
- workspace and project status retrieval
- planning and task management
- document workspace management
- calendar operations
- people and profile context
- workflow audit and forecast
- BuildOS reference and schema guidance

Capabilities should no longer be exposed as a path catalog like `capabilities.project_creation`.

### 6.2 Skills

Skills should use stable, human-readable ids.

Proposed skill ids:

- `project_creation`
- `calendar_ops`
- `planning`
- `task_management`
- `document_workspace`
- `people_context`
- `workflow_audit`
- `workflow_forecast`

Example rename mapping:

- `onto.project.create.skill` -> `project_creation`
- `cal.skill` -> `calendar_ops`
- `onto.plan.skill` -> `planning`
- `onto.task.skill` -> `task_management`
- `onto.document.skill` -> `document_workspace`
- `util.people.skill` -> `people_context`
- `workflow.audit.skill` -> `workflow_audit`
- `workflow.forecast.skill` -> `workflow_forecast`

### 6.3 Tools

Canonical tools should continue to use semantic ids like:

- `onto.project.create`
- `onto.task.update`
- `onto.document.tree.move`
- `cal.event.update`
- `util.workspace.overview`
- `util.project.overview`

These remain canonical registry ids even if provider-facing function names must stay underscore-based.

## 7. New Meta-Tools

### 7.1 `skill_load`

Purpose:

- Load a skill playbook by stable skill id.

Input:

```json
{
	"skill": "project_creation"
}
```

Output:

```json
{
	"type": "skill",
	"id": "project_creation",
	"name": "Project Creation",
	"format": "short",
	"version": "tool-registry/...",
	"description": "Project creation playbook for turning a user idea into the smallest valid BuildOS project payload with inferred name, type_key, props, and only the initial structure the user actually described.",
	"summary": "Create a minimal valid BuildOS project from a rough idea.",
	"when_to_use": [
		"Creating a new project from scratch",
		"Inferring project name, type, and minimal initial structure"
	],
	"workflow": [
		"1) Start from the smallest valid project payload: project { name, type_key }, entities: [], relationships: [].",
		"2) Infer project.name from the user message when it is reasonably clear.",
		"3) Infer project.type_key using the project.{realm}.{domain}[.{variant}] pattern."
	],
	"related_ops": ["onto.project.create"],
	"guardrails": ["Do not omit project, entities, or relationships from the payload."],
	"examples": []
}
```

Notes:

- This replaces skill retrieval through `tool_help`.
- Skills are not directories and are not addressed as tool paths.

### 7.2 `tool_search`

Purpose:

- Discover candidate tools for a job when the exact tool is not already known.

Input:

```json
{
	"query": "reschedule a project work session",
	"group": "cal",
	"kind": "write",
	"limit": 8
}
```

Output:

```json
{
	"type": "tool_search_results",
	"version": "tool-registry/...",
	"query": "reschedule a project work session",
	"filters": {
		"capability": null,
		"group": "cal",
		"kind": "write",
		"entity": null
	},
	"total_matches": 2,
	"matches": [
		{
			"op": "cal.event.update",
			"summary": "Update an existing calendar event.",
			"group": "cal",
			"kind": "write",
			"entity": "event",
			"action": "update",
			"tool_name": "update_calendar_event",
			"related_skills": ["calendar_management"]
		},
		{
			"op": "cal.event.list",
			"summary": "List calendar events in a time range.",
			"group": "cal",
			"kind": "read",
			"entity": "event",
			"action": "list",
			"tool_name": "list_calendar_events",
			"related_skills": ["calendar_management"]
		}
	],
	"next_step": "Pick the best candidate op, then call tool_schema({ op: \"<canonical op>\" }) before buildos_call for first-time or complex writes."
}
```

Notes:

- `tool_search` should support lexical search first and be upgradeable to semantic search later.
- It should be backed by the canonical tool registry, not a hand-authored path tree.
- It should be usable by both internal chat and external BuildOS agent-call clients.

### 7.3 `tool_schema`

Purpose:

- Return the exact tool contract for one canonical tool id.

Input:

```json
{
	"op": "onto.project.create",
	"include_examples": true,
	"include_schema": true
}
```

Output:

```json
{
	"type": "tool_schema",
	"op": "onto.project.create",
	"summary": "Create a new project in the ontology system.",
	"tool_name": "create_onto_project",
	"usage": "buildos_call({ op: \"onto.project.create\", args: { ... } })",
	"required_args": ["project", "entities", "relationships"],
	"id_args": [],
	"args": [
		{
			"name": "project",
			"type": "object",
			"required": true,
			"description": "Project definition."
		}
	],
	"notes": [
		"onto.project.create requires args.project, args.entities, and args.relationships.",
		"args.project must include project.name and project.type_key."
	],
	"example_buildos_call": {
		"op": "onto.project.create",
		"args": {
			"project": {
				"name": "Project Name",
				"type_key": "project.business.initiative"
			},
			"entities": [],
			"relationships": []
		}
	},
	"schema": {}
}
```

Notes:

- `tool_schema` should become the single source of truth for "what exact args do I pass?"
- It replaces exact op lookup through `tool_help`.
- This tool should return compact, model-optimized schema summaries by default and full JSON schema only when requested.

### 7.4 `buildos_call`

Purpose:

- Execute a canonical BuildOS tool with final arguments.

Input:

```json
{
	"op": "onto.task.update",
	"args": {
		"task_id": "11111111-1111-4111-8111-111111111111",
		"title": "Updated title"
	}
}
```

Success envelope:

```json
{
	"op": "onto.task.update",
	"ok": true,
	"result": {},
	"meta": {
		"latency_ms": 123,
		"warnings": []
	}
}
```

Error envelope:

```json
{
	"op": "onto.task.update",
	"ok": false,
	"error": {
		"code": "VALIDATION_ERROR",
		"message": "Missing required parameter: task_id",
		"schema_hint": "onto.task.update",
		"suggested_next_step": "Call tool_schema for onto.task.update and retry with complete args."
	}
}
```

Notes:

- This is the compatibility-preserving replacement for `tool_exec`.
- Existing op normalization and execution plumbing can be reused during migration.

## 8. Overview and Search Rules

The repo's own recent direction is correct: routine status questions should not be forced through skill lookup first.

Policy:

- For routine workspace status questions, go straight to `util.workspace.overview`.
- For one-project status questions, go straight to `util.project.overview`.
- Do not load a skill first for ordinary status retrieval.
- Load audit or forecast skills only when the request is deeper than status.

This can still happen through `buildos_call`, but the prompt should teach it as a direct first move:

- status question -> direct overview tool
- workflow question -> relevant skill, then tool discovery/schema if needed

Relevant repo background:

- [agentic-chat-v2-overview-refactor-plan-2026-03-30.md](/Users/djwayne/buildos-platform/docs/reports/agentic-chat-v2-overview-refactor-plan-2026-03-30.md)
- [AGENTIC_BUILDOS_SEARCH_SPEC.md](/Users/djwayne/buildos-platform/docs/specs/AGENTIC_BUILDOS_SEARCH_SPEC.md)

## 9. Prompt Changes

### 9.1 Remove

- `capability_catalog`
- capability-to-skill routing trees
- path heuristics
- "start with root" protocol guidance
- global skill path catalogs

### 9.2 Keep

- BuildOS capability summary
- compact skill registry summary
- overview guidance
- safety rules
- mutation guidance

### 9.3 Add

Prompt-time skill metadata should look like:

```text
Available skills:
- project_creation: Create a minimal valid BuildOS project from a rough idea. Use when creating a new project from scratch.
- calendar_ops: Manage calendar reads/writes, scope decisions, and project calendar mapping.
- planning: Turn outcomes into plans and tasks, or refine an existing plan.
```

Prompt-time tool policy should look like:

- Load a skill when the workflow is complex or easy to get wrong.
- Search for a tool when the exact action is unknown.
- Load the exact schema before first-time or risky writes.
- For routine status questions, use overview tools directly.

## 10. Telemetry and Analytics

We should preserve the observability improvements from the current gateway model while renaming concepts.

### 10.1 New event types

- `skill_requested`
- `skill_loaded`
- `tool_search_requested`
- `tool_schema_requested`
- `tool_call_executed`

### 10.2 Replace or adapt

- `first_skill_path` -> `first_skill_id`
- `help_path` -> `schema_hint` or `tool_id`
- `gateway_op` -> `canonical_tool_id`

### 10.3 Preserve

- per-tool execution rows
- latency
- success/failure
- arguments and result snapshots
- prompt-eval scenarios

## 11. External Agent-Call API Alignment

The transport already supports:

- `tools/list`
- `tools/call`

That transport should remain.

What should change is the set of exposed public tools. Instead of:

- `tool_help`
- `tool_exec`

the public BuildOS agent-call gateway should eventually expose:

- `skill_load`
- `tool_search`
- `tool_schema`
- `buildos_call`

This keeps the external protocol small while making the semantics much clearer.

Relevant files:

- [agent-call-service.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/agent-call-service.ts)
- [external-tool-gateway.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/server/agent-call/external-tool-gateway.ts)
- [buildos/+server.ts](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent-call/buildos/+server.ts)

## 12. Migration Plan

### Phase 0: Adopt this spec

- Treat this document as the new source of truth.
- Mark older skill/tool-help specs as superseded.

### Phase 1: Prompt simplification

- Remove capability catalog language from prompt builders.
- Keep only broad capabilities and skill metadata.
- Stop teaching root-path browsing.

Expected result:

- smaller prompt
- less routing clutter
- cleaner mental model

### Phase 2: Skill identity refactor

- Introduce stable skill ids.
- Rename existing skills away from path-shaped identifiers.
- Update telemetry, UI activity labels, and prompt references.

Expected result:

- skills are clearly process artifacts, not tool paths

### Phase 3: Registry split

- Keep one canonical tool registry.
- Split the current `tool_help` responsibilities into:
    - `skill_load`
    - `tool_search`
    - `tool_schema`

Expected result:

- clearer protocols
- simpler model behavior
- less repair logic

### Phase 4: Execution rename

- Introduce `buildos_call`.
- Keep `tool_exec` as compatibility alias for one migration window.
- Update internal prompts and tests to prefer `buildos_call`.

Expected result:

- tool execution terminology matches the new architecture

### Phase 5: External gateway alignment

- Update external BuildOS agent-call public tool list.
- Preserve `tools/list` and `tools/call`.
- Migrate external docs and bootstrap instructions.

### Phase 6: Runtime cleanup

- Remove `tool_help("root")` repair logic once no longer needed.
- Remove path-based skill discovery logic.
- Reduce special-case project creation repair text where schema and skill loading make it unnecessary.

## 13. Testing and Evaluation

### 13.1 Unit tests

- skill registry metadata shape
- `skill_load` returns expected payloads
- `tool_search` ranks expected tools for common intents
- `tool_schema` returns required fields, aliases, and example calls
- `buildos_call` executes canonical tool ids correctly

### 13.2 Prompt tests

- prompt includes capabilities and skill metadata only
- prompt does not include capability catalog or path heuristics
- prompt instructs direct overview usage for status questions
- prompt instructs skill load -> tool search/schema -> call workflow for complex tasks

### 13.3 End-to-end chat evals

Required scenarios:

- create a project from a rough idea
- reschedule a project work session
- move an unlinked document into the doc tree
- ask "what is happening with my projects?"
- ask "what is going on with 9takes?"
- run an audit of a project
- update a task when the id is unknown

Success metrics:

- lower repeated discovery loops
- fewer malformed write calls
- fewer retries caused by missing required args
- lower tool-count per successful task
- improved first-pass success for project creation

## 14. Acceptance Criteria

- Skills are no longer represented as tool-path variants.
- Prompt preloads only broad capabilities and skill metadata.
- Exact tool schemas are available on demand without preloading all tool definitions.
- Common status questions bypass skill loading and avoid discovery churn.
- The visible callable surface remains small.
- External agent-call transport remains stable.
- Runtime repair logic for root browsing and malformed empty calls is materially reduced.

## 15. Decision

BuildOS should move away from the current `tool_help` plus `tool_exec` abstraction as the primary long-term model.

Short-term:

- keep compatibility where needed
- implement the new architecture beside the old one

Long-term:

- make `skill_load`, `tool_search`, `tool_schema`, and `buildos_call` the primary protocol
- keep provider-native deferred tool support as an optional future optimization, not a requirement
