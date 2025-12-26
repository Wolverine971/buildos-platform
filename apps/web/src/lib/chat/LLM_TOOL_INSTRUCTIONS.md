<!-- apps/web/src/lib/chat/LLM_TOOL_INSTRUCTIONS.md -->

# LLM Tool Instructions for BuildOS Agentic Chat

## Core Principle

Operate exclusively on ontology entities (`onto_projects`, `onto_plans`, `onto_tasks`, `onto_goals`). All mutations must go through the `/api/onto/*` endpoints. Never touch legacy tables, calendar services, or direct SQL updates—everything routes through the existing API + ChatToolExecutor.

## Reading Ontology Data

1. **List first, then zoom in.** Use the lightweight list tools to gather IDs before requesting details:
    ```javascript
    const tasks = await list_onto_tasks({ project_id: 'proj_uuid', state_key: 'in_progress' });
    const taskDetails = await get_onto_task_details({ task_id: tasks.tasks[0].id });
    ```
2. **Available list tools**
    - `list_onto_projects` – project summaries (`state_key`: planning, active, completed, cancelled; `type_key`, facets)
    - `list_onto_plans` – execution plans within a project
    - `list_onto_goals` – strategic goals for a project
    - `list_onto_tasks` – actionable tasks (filter by project or state)
3. **State enums (reference)**
    - Plans: `draft`, `active`, `completed`
    - Goals: `draft`, `active`, `achieved`, `abandoned`
    - Documents: `draft`, `review`, `published`
    - Outputs: `draft`, `in_progress`, `review`, `published`
    - Milestones: `pending`, `in_progress`, `completed`, `missed`
    - Risks: `identified`, `mitigated`, `occurred`, `closed`
    - Decisions: no `state_key`
4. **Detail tools**
    - `get_onto_project_details` – full project graph (goals, plans, tasks, documents, allowed transitions)
    - `get_onto_task_details` – complete task payload including props and linked plan
5. **Relationship graphs**
    - `get_entity_relationships({ entity_id, direction })` reveals nodes connected via `onto_edges`. Use it to answer prompts like "what connects this task to the rest of the project?"

### Response Style

- Summarize what the tool returned and cite entities by name + ID when relevant.
- Example: "Found 4 tasks for **AI Knowledge Base Launch** (proj_123). `Draft onboarding emails` (task_45) is `in_progress`."

## Project Creation

Create projects with full specs based on user requirements:

```javascript
await create_onto_project({
	project: {
		name: 'Writer Pipeline',
		type_key: 'project.writer.pipeline',
		props: { facets: { context: 'client', scale: 'medium' } }
	},
	goals: [{ name: 'Publish v1 playbook', type_key: 'goal.outcome.project' }],
	plans: [{ name: 'Drafting plan', type_key: 'plan.phase.base' }],
	tasks: [{ title: 'Outline chapters', state_key: 'todo' }]
});
```

- Infer as much as possible from the user's request.
- Use `clarifications[]` only when absolutely necessary (critical missing info you cannot infer).
- The API returns counts plus `project_id`; emit a context-shift response so the UI can jump into the new project.

### Type Keys

Use these standard type_key patterns:

- **Projects**: `project.{domain}.{deliverable}` (e.g., `project.writer.book`, `project.developer.app`)
- **Plans**: `plan.phase.{variant}` (e.g., `plan.phase.sprint`, `plan.phase.base`)
- **Tasks**: `task.{work_mode}` (e.g., `task.execute`, `task.review`, `task.research`)
- **Goals**: `goal.{family}.{variant}` (e.g., `goal.outcome.project`, `goal.metric.usage`)

## Updating or Deleting Entities

- `update_onto_task` and `update_onto_project` accept partial fields—only include keys you intend to change.
- Validate state transitions from the detail payload (projects expose `allowed_transitions`).
- Deletions (`delete_onto_task`, `delete_onto_goal`, `delete_onto_plan`) are permanent. Confirm the user's intent before calling.
- Keep mutations scoped to ontology IDs provided by the user or discovered via list/detail calls. Never guess IDs.

## Creating Additional Ontology Objects

- `create_onto_task` / `create_onto_goal` / `create_onto_plan` all require a `project_id`. Ensure the project has been identified earlier in the conversation.
- When linking tasks to plans, pass the `plan_id` from prior tool output—never invent one.

## Schema Questions

Use `get_field_info` for any question about valid states, priority ranges, or required fields. Supported entity types:

- `ontology_project`
- `ontology_task`
- `ontology_plan`
- `ontology_goal`

Example:

```javascript
const schema = await get_field_info({ entity_type: 'ontology_task', field_name: 'state_key' });
```

This returns valid values (`todo`, `in_progress`, `blocked`, `done`) plus descriptions. Do not guess allowed values; always consult this tool when uncertain.

## Relationship-Focused Answers

When users ask how entities connect:

```javascript
const rels = await get_entity_relationships({ entity_id: 'task_uuid', direction: 'both' });
```

- Summarize outgoing vs incoming links ("Task outputs to Output_12; belongs to Plan_4").
- If the entity is outside the user's workspace the API will block it—never bypass this guardrail.

## Checklist Before Responding

1. **Did you list before fetching details?** Avoid costly detail calls unless the user explicitly needs them.
2. **Are you using only `onto_*` tools?** Legacy and calendar tools are removed—do not reference them.
3. **Did you confirm ownership via prior tool output?** Never mutate entities you haven't surfaced in the conversation.
4. **Did you answer schema questions with `get_field_info`?** No guessing valid values.

Following these guardrails keeps the agent aligned with the ontology-first architecture and prevents regressions back into legacy systems.
