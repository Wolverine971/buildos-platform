<!-- apps/web/docs/features/ontology/TASK_TEMPLATES_FSM_FUTURE_ENHANCEMENTS.md -->

# Task Templates: Future FSM Enhancements Reference

**Last Updated**: December 1, 2025
**Status**: 🔮 Future Reference (Not Implemented)
**Category**: Architecture Planning

---

## Assessment Summary

> **Decision (Dec 2025): Keep current uniform FSM implementation.**
> This document contains proposed FSM enhancements for future consideration when user demand justifies the added complexity.

---

## Current Implementation vs. This Proposal

### What We Implemented (Dec 2025)

| Aspect        | Current State                                    |
| ------------- | ------------------------------------------------ |
| **Migration** | `20251201_task_templates_seed.sql`               |
| **Templates** | 8 base work modes + 4 specializations            |
| **FSM**       | **Uniform** across all tasks                     |
| **States**    | `todo → in_progress → blocked → done → archived` |
| **Schema**    | Type-specific props per template                 |

### What This Document Proposes

| Aspect             | Proposed Enhancement                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| **Base Template**  | Abstract `task.base` parent                                                |
| **FSM**            | **Per-type** state machines                                                |
| **Unique States**  | `synthesizing`, `reviewing`, `scheduled`, `verifying`, `failed`, `skipped` |
| **Richer Schemas** | Additional type-specific fields                                            |

---

## Why We Chose Uniform FSM (Analysis)

### 1. Simpler Mental Model

Users don't need to learn different state machines for different task types. "Start → Do → Complete" is universal.

### 2. `blocked` State Covers Edge Cases

The current `blocked` state handles:

- Research stuck waiting for sources
- Deploy paused for approval
- Review waiting on dependencies

### 3. Type-Specific Behavior Lives in Props

The `props` column and JSON Schema handle differentiation without FSM complexity.

### 4. Avoids UI Complexity

Different FSMs per type would require:

- Different state badges/chips per task type
- Different transition buttons per type
- Different visualizations in `FSMStateBar.svelte` and `FSMStateVisualizer.svelte`

### 5. Incremental Enhancement Path

Templates can be updated individually later:

```sql
UPDATE onto_templates SET fsm = '{"states":["scheduled","active","done"]...}'
WHERE type_key = 'task.coordinate.meeting';
```

---

## When to Implement These Enhancements

### Implement Work-Mode-Specific FSM When:

| Signal                                                             | Action                                            |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| Users report: "I need to track deploy verification separately"     | Add `verifying` state to `task.execute.deploy`    |
| Users report: "My research tasks have a synthesis phase"           | Add `synthesizing` to `task.research`             |
| Users report: "Meetings should show as scheduled until they start" | Change initial state to `scheduled` for meetings  |
| Users report: "I need to mark standups as skipped"                 | Add `skipped` state for `task.coordinate.standup` |
| Users report: "Review tasks need approved/rejected outcomes"       | Add outcome states to `task.review`               |

### Schema Enhancements Can Be Added Now

The richer schemas proposed below can be adopted **without changing FSM**:

- Add `research_type`, `sources_hint` to `task.research`
- Add `environment`, `version`, `rollback_plan` to `task.execute.deploy`
- Add `agenda`, `attendees`, `action_items_summary` to `task.coordinate.meeting`

---

## Comparison Table: Current vs. Proposed FSM

| Task Type                 | Current States                             | Proposed States                                                     | Delta                  |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------- | ---------------------- |
| `task.create`             | todo, in_progress, blocked, done, archived | todo, in_progress, **blocked**, done, canceled                      | Similar                |
| `task.refine`             | todo, in_progress, blocked, done, archived | todo, in_progress, **review**, done, canceled                       | +review stage          |
| `task.research`           | todo, in_progress, blocked, done, archived | todo, in_progress, **synthesizing**, done, canceled                 | +synthesis stage       |
| `task.review`             | todo, in_progress, blocked, done, archived | **pending**, **reviewing**, **approved/rejected**, canceled         | Completely different   |
| `task.coordinate.meeting` | todo, in_progress, blocked, done, archived | **scheduled**, in_progress, done, canceled                          | +scheduled initial     |
| `task.coordinate.standup` | todo, in_progress, blocked, done, archived | **scheduled**, done, **skipped**                                    | Ultra-light 3-state    |
| `task.plan`               | todo, in_progress, blocked, done, archived | todo, **drafting**, **review**, **finalized**, canceled             | +drafting/review cycle |
| `task.execute.deploy`     | todo, in_progress, blocked, done, archived | **pending**, **running**, **verifying**, done, **failed**, canceled | CI/CD lifecycle        |

---

## Implementation Checklist (When Ready)

When you decide to implement work-mode-specific FSMs:

- [ ] Update individual template FSMs in `onto_templates` table
- [ ] Update `FSMStateBar.svelte` to handle type-specific state rendering
- [ ] Update `FSMStateVisualizer.svelte` for new state transitions
- [ ] Add migrations for any new FSM action handlers (e.g., auto-archive on skip)
- [ ] Update UI transition buttons to show type-appropriate actions
- [ ] Test FSM engine with new transitions
- [ ] Update documentation in `TYPE_KEY_TAXONOMY.md`

---

## Original Proposal Details

> **Note**: The content below is the original LLM-generated proposal preserved for reference.

---

# Original Proposal: Task Templates with Work-Mode-Specific FSMs

Nice, this is exactly the kind of thing templates are good at.

I'll give you:

1. Overall design for task templates in `onto_templates`
2. A **shared base schema** + FSM conventions
3. Concrete template definitions for:
    - 8 base modes
    - 4 specializations (`meeting`, `standup`, `deploy`, `checklist`)

You can then wire this into your seed script / migrations.

---

## 1. Overall design

### 1.1. One abstract base, concrete per work mode

Use one abstract parent + concrete children:

- `task.base` (abstract, scope=`"task"`)
- `task.create`
- `task.refine`
- `task.research`
- `task.review`
- `task.coordinate`
- `task.coordinate.meeting`
- `task.coordinate.standup`
- `task.admin`
- `task.plan`
- `task.execute`
- `task.execute.deploy`
- `task.execute.checklist`

In `onto_templates`:

- `scope = 'task'`
- `type_key = 'task.create'` etc.
- `parent_template_id` → points to `task.base` for all of them (you'll set this in seeding).

### 1.2. What template schema covers

Even though `onto_tasks` has columns for `title`, `due_at`, etc., **template.schema** is your contract for:

- validating `props`
- driving auto-forms / UIs
- giving LLMs a shape to target

So we'll:

- Put common stuff (title, description, due_at, priority, estimate) in the base schema.
- Add _mode-specific_ props in concrete templates (e.g. `agenda` for meetings, `checklist_items` for checklists).
- Use `fsm` per template to define state & transitions.

---

## 2. Base task template: `task.base` (abstract)

This is the parent for all tasks.

```ts
const taskBaseTemplate = {
	type_key: 'task.base',
	name: 'Base Task',
	scope: 'task',
	is_abstract: true,
	status: 'active',
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			effort_points: { type: 'number', minimum: 0 },
			tags: { type: 'array', items: { type: 'string' } },
			// lightweight relations and flags that can live in props if you want
			blocking_task_ids: {
				type: 'array',
				items: { type: 'string', format: 'uuid' }
			},
			related_output_ids: {
				type: 'array',
				items: { type: 'string', format: 'uuid' }
			},
			notes: { type: 'string' }
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'in_progress', 'done', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'done', event: 'complete' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Base task template. All task types inherit this schema and can extend it.',
		work_mode: 'generic'
	},
	default_props: {},
	facet_defaults: {},
	default_views: {}
};
```

---

## 3. Concrete templates by work mode

Below, assume:

- You'll set `parent_template_id` to the `id` of `task.base` when seeding.
- `schema` merges parent+child in your resolver (child extends/overrides).
- `fsm` on child replaces parent's FSM (simpler to implement).

### 3.1. `task.create`

Generative work: drafting, designing, building something new.

```ts
const taskCreateTemplate = {
	type_key: 'task.create',
	name: 'Create Task',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null, // set in seed script
	schema: {
		type: 'object',
		properties: {
			// inherits base
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			effort_points: { type: 'number', minimum: 0 },
			tags: { type: 'array', items: { type: 'string' } },
			// extra hints
			output_type_hint: { type: 'string' }, // e.g. "deliverable.chapter"
			is_deep_work: { type: 'boolean' }
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'in_progress', 'blocked', 'done', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'blocked', event: 'block' },
			{ from: 'blocked', to: 'in_progress', event: 'unblock' },
			{ from: 'in_progress', to: 'done', event: 'complete' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Generative work that produces a new artifact or clear outcome.',
		work_mode: 'create',
		icon: 'sparkles'
	},
	default_props: {},
	facet_defaults: {
		stage: 'execution'
	},
	default_views: {}
};
```

### 3.2. `task.refine`

Improvement / iteration on existing work.

```ts
const taskRefineTemplate = {
	type_key: 'task.refine',
	name: 'Refine Task',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			effort_points: { type: 'number', minimum: 0 },
			tags: { type: 'array', items: { type: 'string' } },
			// refinement-specific
			target_output_id: { type: 'string', format: 'uuid' },
			target_version: { type: 'integer' }, // optional hint
			refinement_notes: { type: 'string' }
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'in_progress', 'review', 'done', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'review', event: 'submit_for_review' },
			{ from: 'review', to: 'in_progress', event: 'request_changes' },
			{ from: 'review', to: 'done', event: 'approve' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' },
			{ from: 'review', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Improve or iterate on an existing artifact.',
		work_mode: 'refine',
		icon: 'pencil'
	},
	default_props: {},
	facet_defaults: {
		stage: 'execution'
	},
	default_views: {}
};
```

### 3.3. `task.research`

Learning, discovery, investigation.

```ts
const taskResearchTemplate = {
	type_key: 'task.research',
	name: 'Research Task',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			effort_points: { type: 'number', minimum: 0 },
			tags: { type: 'array', items: { type: 'string' } },
			research_question: { type: 'string' },
			research_type: {
				type: 'string',
				enum: ['generic', 'user', 'market', 'competitive', 'academic']
			},
			sources_hint: {
				type: 'array',
				items: { type: 'string' }
			}
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'in_progress', 'synthesizing', 'done', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'synthesizing', event: 'start_synthesis' },
			{ from: 'synthesizing', to: 'done', event: 'complete' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' },
			{ from: 'synthesizing', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Investigate, learn, or gather information for a project.',
		work_mode: 'research',
		icon: 'search'
	},
	default_props: {},
	facet_defaults: {
		stage: 'discovery'
	},
	default_views: {}
};
```

### 3.4. `task.review`

Evaluate or approve work.

```ts
const taskReviewTemplate = {
	type_key: 'task.review',
	name: 'Review Task',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			effort_points: { type: 'number', minimum: 0 },
			tags: { type: 'array', items: { type: 'string' } },
			target_output_id: { type: 'string', format: 'uuid' },
			decision: {
				type: 'string',
				enum: ['pending', 'approved', 'rejected', 'changes_requested']
			},
			review_notes: { type: 'string' }
		},
		required: ['title']
	},
	fsm: {
		states: ['pending', 'reviewing', 'approved', 'rejected', 'canceled'],
		transitions: [
			{ from: 'pending', to: 'reviewing', event: 'start' },
			{ from: 'reviewing', to: 'approved', event: 'approve' },
			{ from: 'reviewing', to: 'rejected', event: 'reject' },
			{ from: 'pending', to: 'canceled', event: 'cancel' },
			{ from: 'reviewing', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'pending'
	},
	metadata: {
		description: 'Evaluate or approve work produced by yourself or others.',
		work_mode: 'review',
		icon: 'check-circle'
	},
	default_props: {},
	facet_defaults: {
		stage: 'validation'
	},
	default_views: {}
};
```

### 3.5. `task.coordinate` (generic comms)

Most communications that _aren't_ structured meetings.

```ts
const taskCoordinateTemplate = {
	type_key: 'task.coordinate',
	name: 'Coordinate Task',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			tags: { type: 'array', items: { type: 'string' } },
			channel: {
				type: 'string',
				enum: ['email', 'dm', 'call', 'thread', 'other']
			},
			counterparties: {
				type: 'array',
				items: { type: 'string' }
			}
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'in_progress', 'done', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'done', event: 'complete' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Communication and coordination work that is not a full meeting.',
		work_mode: 'coordinate',
		icon: 'messages'
	},
	default_props: {},
	facet_defaults: {
		stage: 'execution'
	},
	default_views: {}
};
```

---

## 4. Specialized coordination templates

### 4.1. `task.coordinate.meeting`

Tied to events, agenda, attendees.

```ts
const taskCoordinateMeetingTemplate = {
	type_key: 'task.coordinate.meeting',
	name: 'Meeting',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' }, // often = start_at
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			tags: { type: 'array', items: { type: 'string' } },
			event_id: { type: 'string', format: 'uuid' }, // onto_events id
			attendees: {
				type: 'array',
				items: { type: 'string' } // actor ids or emails
			},
			agenda: {
				type: 'array',
				items: { type: 'string' }
			},
			action_items_summary: { type: 'string' },
			meeting_link: { type: 'string' }
		},
		required: ['title']
	},
	fsm: {
		states: ['scheduled', 'in_progress', 'done', 'canceled'],
		transitions: [
			{ from: 'scheduled', to: 'in_progress', event: 'start_meeting' },
			{ from: 'in_progress', to: 'done', event: 'wrap_up' },
			{ from: 'scheduled', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'scheduled'
	},
	metadata: {
		description: 'Scheduled meeting tied to a calendar event, with agenda and attendees.',
		work_mode: 'coordinate',
		specialization: 'meeting',
		icon: 'calendar-clock'
	},
	default_props: {},
	facet_defaults: {
		stage: 'execution'
	},
	default_views: {}
};
```

### 4.2. `task.coordinate.standup`

Ultra-light, recurring.

```ts
const taskCoordinateStandupTemplate = {
	type_key: 'task.coordinate.standup',
	name: 'Standup',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			tags: { type: 'array', items: { type: 'string' } },
			event_id: { type: 'string', format: 'uuid' },
			yesterday_done: { type: 'string' },
			today_planned: { type: 'string' },
			blockers: { type: 'string' }
		},
		required: ['title']
	},
	fsm: {
		states: ['scheduled', 'done', 'skipped'],
		transitions: [
			{ from: 'scheduled', to: 'done', event: 'complete' },
			{ from: 'scheduled', to: 'skipped', event: 'skip' }
		],
		initial_state: 'scheduled'
	},
	metadata: {
		description: 'Quick standup checkpoint, usually recurring.',
		work_mode: 'coordinate',
		specialization: 'standup',
		icon: 'list-checks'
	},
	default_props: {},
	facet_defaults: {
		stage: 'execution'
	},
	default_views: {}
};
```

---

## 5. Execution templates

### 5.1. `task.admin`

Operational / overhead work.

```ts
const taskAdminTemplate = {
	type_key: 'task.admin',
	name: 'Admin Task',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			tags: { type: 'array', items: { type: 'string' } },
			admin_category: {
				type: 'string',
				enum: ['finance', 'legal', 'hr', 'ops', 'other']
			}
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'in_progress', 'done', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'done', event: 'complete' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Administrative or operational overhead work.',
		work_mode: 'admin',
		icon: 'file-cog'
	},
	default_props: {},
	facet_defaults: {
		stage: 'support'
	},
	default_views: {}
};
```

### 5.2. `task.plan`

Strategy, roadmapping, planning.

```ts
const taskPlanTemplate = {
	type_key: 'task.plan',
	name: 'Planning Task',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			tags: { type: 'array', items: { type: 'string' } },
			plan_id: { type: 'string', format: 'uuid' }, // onto_plans
			planning_horizon: {
				type: 'string',
				enum: ['day', 'week', 'month', 'quarter', 'year']
			}
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'drafting', 'review', 'finalized', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'drafting', event: 'start' },
			{ from: 'drafting', to: 'review', event: 'submit_for_review' },
			{ from: 'review', to: 'drafting', event: 'request_changes' },
			{ from: 'review', to: 'finalized', event: 'finalize' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'drafting', to: 'canceled', event: 'cancel' },
			{ from: 'review', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Work to design a plan, roadmap, or strategy.',
		work_mode: 'plan',
		icon: 'map'
	},
	default_props: {},
	facet_defaults: {
		stage: 'planning'
	},
	default_views: {}
};
```

### 5.3. `task.execute` (generic)

Following a known process / SOP.

```ts
const taskExecuteTemplate = {
	type_key: 'task.execute',
	name: 'Execute Task',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			estimate_minutes: { type: 'integer', minimum: 5 },
			tags: { type: 'array', items: { type: 'string' } },
			sop_output_id: { type: 'string', format: 'uuid' }, // deliverable.sop
			execution_mode: {
				type: 'string',
				enum: ['sop', 'monitor', 'maintenance', 'training', 'other']
			}
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'in_progress', 'verified', 'done', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'verified', event: 'verify' },
			{ from: 'verified', to: 'done', event: 'complete' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' },
			{ from: 'verified', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Execute a well-defined procedure or SOP.',
		work_mode: 'execute',
		icon: 'play-circle'
	},
	default_props: {},
	facet_defaults: {
		stage: 'execution'
	},
	default_views: {}
};
```

### 5.4. `task.execute.deploy`

Deployment-specific execution.

```ts
const taskExecuteDeployTemplate = {
	type_key: 'task.execute.deploy',
	name: 'Deploy',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			due_at: { type: 'string', format: 'date-time' },
			tags: { type: 'array', items: { type: 'string' } },
			environment: {
				type: 'string',
				enum: ['dev', 'staging', 'production', 'other']
			},
			version: { type: 'string' }, // e.g. git tag or semver
			rollback_plan: { type: 'string' },
			ci_job_url: { type: 'string' },
			release_output_id: { type: 'string', format: 'uuid' } // deliverable.release
		},
		required: ['title']
	},
	fsm: {
		states: ['pending', 'running', 'verifying', 'done', 'failed', 'canceled'],
		transitions: [
			{ from: 'pending', to: 'running', event: 'start' },
			{ from: 'running', to: 'verifying', event: 'deploy_success' },
			{ from: 'verifying', to: 'done', event: 'verify_success' },
			{ from: 'running', to: 'failed', event: 'deploy_failed' },
			{ from: 'verifying', to: 'failed', event: 'verify_failed' },
			{ from: 'pending', to: 'canceled', event: 'cancel' },
			{ from: 'running', to: 'canceled', event: 'cancel' },
			{ from: 'verifying', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'pending'
	},
	metadata: {
		description: 'Execute a deployment with environment and rollback semantics.',
		work_mode: 'execute',
		specialization: 'deploy',
		icon: 'rocket'
	},
	default_props: {},
	facet_defaults: {
		stage: 'execution'
	},
	default_views: {}
};
```

### 5.5. `task.execute.checklist`

Checklist-style execution.

```ts
const taskExecuteChecklistTemplate = {
	type_key: 'task.execute.checklist',
	name: 'Checklist',
	scope: 'task',
	is_abstract: false,
	parent_template_id: null,
	schema: {
		type: 'object',
		properties: {
			title: { type: 'string' },
			description: { type: 'string' },
			due_at: { type: 'string', format: 'date-time' },
			priority: { type: 'integer', minimum: 1, maximum: 5 },
			tags: { type: 'array', items: { type: 'string' } },
			checklist_items: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						label: { type: 'string' },
						done: { type: 'boolean' }
					},
					required: ['label']
				}
			}
		},
		required: ['title']
	},
	fsm: {
		states: ['todo', 'in_progress', 'verified', 'done', 'canceled'],
		transitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'verified', event: 'verify' },
			{ from: 'verified', to: 'done', event: 'complete' },
			{ from: 'todo', to: 'canceled', event: 'cancel' },
			{ from: 'in_progress', to: 'canceled', event: 'cancel' },
			{ from: 'verified', to: 'canceled', event: 'cancel' }
		],
		initial_state: 'todo'
	},
	metadata: {
		description: 'Execute a simple checklist or SOP-style task.',
		work_mode: 'execute',
		specialization: 'checklist',
		icon: 'check-square'
	},
	default_props: {},
	facet_defaults: {
		stage: 'execution'
	},
	default_views: {}
};
```

---

## 6. How to actually seed these

In your seed script:

1. Insert `task.base`, grab its `id`.
2. Insert each concrete template with `parent_template_id = baseId`.
3. Set `scope = 'task'`, `status = 'active'`, `created_by` to system actor, etc.

If you want, next step I can:

- Collapse all of these into a single `const taskTemplates = [...]` array you can drop into a Supabase seed script (with types), plus a little resolver note (how to merge parent+child schema/FSM).

---

## Related Documentation

- [TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md) - Current taxonomy implementation
- [DATA_MODELS.md](./DATA_MODELS.md) - Database schema reference
- [Current seed migration](../../../../supabase/migrations/20251201_task_templates_seed.sql) - What's actually deployed
