<!-- thoughts/shared/research/2025-11-04_ontology-template-gaps-analysis.md -->
# Ontology Template Gaps Analysis & Base Template Recommendations

**Date**: November 4, 2025
**Author**: Claude (AI Assistant)
**Status**: Analysis Complete, Recommendations Ready
**Category**: Research / Architecture

---

## Executive Summary

**Problem**: The BuildOS ontology system has a critical gap - while the database schema supports tasks, goals, and other entities, **NO base templates exist for these core entity types**. This creates inconsistency and makes it difficult to instantiate properly-structured tasks and goals.

**Current State**:

- ✅ 13 project templates (writer, coach, developer, founder, student, personal, marketer)
- ✅ 2 plan templates (weekly, sprint)
- ✅ 10+ output templates (with inheritance hierarchy)
- ✅ 3 document templates
- ❌ **0 task templates** (major gap!)
- ❌ **0 goal templates** (major gap!)
- ❌ **0 requirement templates**
- ❌ Limited plan template diversity

**Impact**:

- Tasks created without type differentiation or FSM guidance
- Goals lack structure and measurement frameworks
- Missing domain-specific workflows
- Can't leverage template inheritance for tasks/goals

**Recommendation**: Create **base template hierarchy** for tasks, goals, requirements, and expand plan templates inspired by the old task data model.

---

## 1. MIGRATION FILES STATUS

### ✅ Final Migration Files (KEEP)

All ontology tables created with `onto_` prefix in **public schema**:

1. **`supabase/migrations/20250601000001_ontology_system.sql`** (Main system)
    - Creates all 15 entity tables (projects, tasks, plans, outputs, documents, goals, etc.)
    - Seeds 3 facets (context, scale, stage) with 25+ facet values
    - Seeds 25 templates (13 project + 2 plan + 3 output + 3 document + 4 enhanced FSMs)
    - Creates graph edge system and access control

2. **`supabase/migrations/20250601000002_ontology_helpers.sql`** (Helper functions)
    - `ensure_actor_for_user()` - Actor creation
    - `get_project_with_template()` - Template resolution
    - `get_allowed_transitions()` - FSM state transitions
    - `get_template_catalog()` - Template browsing
    - `validate_facet_values()` - Facet validation
    - Guard evaluation functions for FSM

3. **`supabase/migrations/20250602000001_add_base_output_templates.sql`** (Output inheritance)
    - Creates `output.base` (abstract root)
    - Creates `output.document` (abstract text document base)
    - Adds specialized output templates: article, blog_post, case_study, whitepaper, newsletter
    - Establishes template inheritance pattern

4. **`supabase/migrations/20250603000001_fix_documents_schema.sql`** (Document FSM support)
    - Adds `state_key` and `updated_at` to `onto_documents`
    - Creates trigger for auto-updating timestamps

### ❌ Outdated File (DELETED)

- ~~`thoughts/shared/ideas/ontology/v1-migration.sql`~~ ✅ **Deleted**
    - Was an old draft using `onto.` schema (separate schema)
    - Actual implementation uses `onto_` prefix in public schema
    - Conflicted with final design

---

## 2. EXISTING TEMPLATES ANALYSIS

### 2.1 What Was Seeded

#### Project Templates (13)

| Template Key         | Name                    | Realm        | FSM States                                         | Enhanced FSM |
| -------------------- | ----------------------- | ------------ | -------------------------------------------------- | ------------ |
| `writer.book`        | Book Project            | creative     | draft, writing, editing, published                 | ✅ Yes       |
| `writer.article`     | Article/Essay           | creative     | draft, writing, review, published                  | No           |
| `coach.client`       | Coaching Client         | service      | intake, active, paused, completed                  | No           |
| `coach.program`      | Group Coaching Program  | service      | planning, enrollment, active, completed            | No           |
| `developer.app`      | Application Development | technical    | planning, development, testing, deployed           | No           |
| `developer.feature`  | Feature Development     | technical    | backlog, in_progress, review, done                 | No           |
| `founder.startup`    | Startup Launch          | business     | ideation, building, launching, growth              | ✅ Yes       |
| `founder.product`    | Product Launch          | business     | concept, development, beta, launched               | No           |
| `student.assignment` | Assignment/Homework     | education    | assigned, working, submitted, graded               | No           |
| `student.project`    | Student Project         | education    | assigned, research, building, presenting, complete | No           |
| `personal.goal`      | Personal Goal           | personal_dev | planning, active, achieved, abandoned              | No           |
| `personal.routine`   | Habit/Routine           | personal_dev | designing, testing, established, maintaining       | ✅ Yes       |
| `marketer.campaign`  | Marketing Campaign      | business     | planning, creating, reviewing, launched, analyzing | ✅ Yes       |

#### Plan Templates (2)

| Template Key  | Name             | States                             |
| ------------- | ---------------- | ---------------------------------- |
| `plan.weekly` | Weekly Plan      | planning, active, review, complete |
| `plan.sprint` | Sprint (2 weeks) | planning, active, review, complete |

#### Output Templates (10+)

| Template Key          | Name               | Parent          | Abstract |
| --------------------- | ------------------ | --------------- | -------- |
| `output.base`         | Base Output        | -               | Yes      |
| `output.document`     | Text Document      | output.base     | Yes      |
| `output.chapter`      | Book Chapter       | output.document | No       |
| `output.article`      | Article/Essay      | output.document | No       |
| `output.blog_post`    | Blog Post          | output.document | No       |
| `output.case_study`   | Case Study         | output.document | No       |
| `output.whitepaper`   | Whitepaper         | output.document | No       |
| `output.newsletter`   | Newsletter Edition | output.document | No       |
| `output.design`       | Design Asset       | -               | No       |
| `output.workout_plan` | Workout Plan       | -               | No       |

#### Document Templates (3)

| Template Key | Name           | States                     |
| ------------ | -------------- | -------------------------- |
| `doc.brief`  | Project Brief  | draft, review, approved    |
| `doc.notes`  | Notes/Research | active, archived           |
| `doc.intake` | Intake Form    | draft, submitted, reviewed |

### 2.2 Template Inheritance Pattern (Established)

The output templates demonstrate the **inheritance hierarchy pattern**:

```
output.base (abstract)
  ↓ inherits from
output.document (abstract)
  ├→ output.chapter
  ├→ output.article
  ├→ output.blog_post
  ├→ output.case_study
  ├→ output.whitepaper
  └→ output.newsletter
```

**Inheritance Rules**:

- Schema properties accumulate (parent + child)
- FSM: Child overrides parent completely
- Metadata: Child wins on conflicts
- Facet defaults: Child wins on conflicts
- Abstract templates (is_abstract=true) cannot be instantiated

---

## 3. CRITICAL GAPS IDENTIFIED

### 3.1 NO Task Templates ❌

**Problem**: The `onto_tasks` table exists, but **ZERO task templates** were seeded.

**Current State**:

```sql
-- onto_tasks table structure (simple)
CREATE TABLE onto_tasks (
  id uuid,
  project_id uuid,
  plan_id uuid,
  title text,
  state_key text DEFAULT 'todo',  -- NO template guidance!
  priority int,
  due_at timestamptz,
  props jsonb,  -- Everything else goes here
  facet_scale text,  -- Only 1 facet for tasks
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
);
```

**Old Tasks Model** (for comparison):

```typescript
// Old tasks table had rich metadata:
tasks: {
  title: string;
  description: string;
  details: string;
  task_type: string;              // ⭐ Differentiated task types!
  status: string;
  priority: string;
  dependencies: string[];          // ⭐ Task dependencies
  duration_minutes: number;        // ⭐ Time estimates
  recurrence_pattern: string;      // ⭐ Recurring tasks
  recurrence_ends: string;
  parent_task_id: uuid;            // ⭐ Subtask hierarchy
  task_steps: string;              // ⭐ Multi-step tasks
  source: string;
  source_calendar_event_id: uuid;
  start_date: timestamptz;
  completed_at: timestamptz;
  deleted_at: timestamptz;
  outdated: boolean;
}
```

**What's Missing**:

- No task type differentiation (quick_task vs deep_work vs meeting_prep)
- No default FSM states for different task types
- No schema for task-specific properties
- No inheritance hierarchy for tasks
- Can't specify default durations, recurrence patterns, or dependencies via templates

**Impact**:

- All tasks created are generic, no type-specific behavior
- No FSM guidance (what states should a task have?)
- Missing task patterns from old system (recurring tasks, subtasks, dependencies)

---

### 3.2 NO Goal Templates ❌

**Problem**: The `onto_goals` table exists, but **ZERO goal templates** were seeded.

**Current State**:

```sql
CREATE TABLE onto_goals (
  id uuid,
  project_id uuid,
  name text,
  type_key text,     -- References template, but NO templates exist!
  props jsonb,       -- Unstructured
  created_by uuid,
  created_at timestamptz
);
```

**What's Missing**:

- No goal type differentiation (outcome goals, learning goals, behavior change, metrics)
- No measurement frameworks
- No FSM for goal lifecycle (draft → active → achieved / abandoned)
- No schema for success criteria
- No target date structure

**Impact**:

- Goals are just text with no structure
- No way to track progress or define success
- Missing measurement and accountability features

---

### 3.3 NO Requirement Templates ❌

**Problem**: The `onto_requirements` table exists with minimal structure.

**Current State**:

```sql
CREATE TABLE onto_requirements (
  id uuid,
  project_id uuid,
  text text,
  type_key text DEFAULT 'requirement.general',  -- Only general type!
  props jsonb,
  created_by uuid,
  created_at timestamptz
);
```

**What's Missing**:

- No requirement type differentiation (functional, non-functional, constraint, acceptance criteria)
- No priority levels
- No validation state (draft, approved, implemented, validated)

---

### 3.4 Limited Plan Template Diversity

**Current State**: Only 2 plan templates (weekly, sprint)

**Missing**:

- Domain-specific plan types:
    - `plan.content_calendar` - Content planning
    - `plan.client_onboarding` - Client onboarding workflows
    - `plan.product_roadmap` - Product development phases
    - `plan.marketing_campaign` - Campaign timeline
    - `plan.monthly` - Monthly planning
    - `plan.quarterly` - OKR/quarterly planning

---

## 4. OLD TASK MODEL INSPIRATION

The old `tasks` table had valuable features we should preserve via templates:

### 4.1 Task Type Differentiation

- Different task types with different behaviors
- Examples: one-off, recurring, subtask, milestone

### 4.2 Task Dependencies

- `dependencies: string[]` - Track prerequisite tasks
- Can be modeled in new system via:
    - `props.dependencies` array
    - Graph edges: `task -[depends_on]-> task`

### 4.3 Time Estimation

- `duration_minutes: number` - How long will this take?
- Can be modeled via `props.estimated_duration`

### 4.4 Recurrence Patterns

- `recurrence_pattern: string` - RRULE format
- `recurrence_ends: string` - End date
- Can be modeled via `props.recurrence`
- FSM action: `schedule_rrule` already exists!

### 4.5 Subtask Hierarchy

- `parent_task_id: uuid` - Nested subtasks
- Can be modeled via:
    - FK: `parent_task_id` (add to schema)
    - Graph edges: `task -[has_subtask]-> task`

### 4.6 Multi-Step Tasks

- `task_steps: string` - Checklist within a task
- Can be modeled via `props.steps: string[]`

---

## 5. RECOMMENDATIONS: BASE TEMPLATES TO CREATE

### 5.1 Task Template Hierarchy

**Proposed Structure**:

```
task.base (abstract)
  ├→ task.quick (concrete)
  ├→ task.deep_work (concrete)
  ├→ task.meeting_prep (concrete)
  ├→ task.research (concrete)
  ├→ task.writing (concrete)
  ├→ task.coding (concrete)
  ├→ task.review (concrete)
  ├→ task.recurring (concrete)
  └→ task.milestone (concrete)
```

#### Task Base Template (`task.base`)

```json
{
	"scope": "task",
	"type_key": "task.base",
	"name": "Base Task",
	"status": "active",
	"is_abstract": true,
	"parent_template_id": null,

	"schema": {
		"type": "object",
		"properties": {
			"title": { "type": "string" },
			"description": { "type": "string" },
			"estimated_duration_minutes": { "type": "number", "minimum": 5 },
			"actual_duration_minutes": { "type": "number" },
			"dependencies": { "type": "array", "items": { "type": "string", "format": "uuid" } },
			"subtasks": { "type": "array", "items": { "type": "string" } },
			"notes": { "type": "string" }
		},
		"required": ["title"]
	},

	"fsm": {
		"type_key": "task.base",
		"states": ["todo", "in_progress", "blocked", "done", "abandoned"],
		"transitions": [
			{ "from": "todo", "to": "in_progress", "event": "start" },
			{ "from": "in_progress", "to": "blocked", "event": "block" },
			{ "from": "blocked", "to": "in_progress", "event": "unblock" },
			{ "from": "in_progress", "to": "done", "event": "complete" },
			{ "from": "todo", "to": "abandoned", "event": "abandon" },
			{ "from": "in_progress", "to": "abandoned", "event": "abandon" }
		]
	},

	"default_props": {},
	"facet_defaults": { "scale": "small" },
	"default_views": [{ "view": "list", "sort_by": "priority" }],

	"metadata": {
		"realm": "productivity",
		"description": "Abstract base template for all tasks"
	}
}
```

#### Quick Task Template (`task.quick`)

```json
{
	"scope": "task",
	"type_key": "task.quick",
	"name": "Quick Task",
	"status": "active",
	"is_abstract": false,
	"parent_template_id": "<task.base id>",

	"schema": {
		"type": "object",
		"properties": {
			"is_urgent": { "type": "boolean", "default": false }
		}
	},

	"fsm": {
		"type_key": "task.quick",
		"states": ["todo", "done"],
		"transitions": [{ "from": "todo", "to": "done", "event": "complete" }]
	},

	"default_props": {
		"estimated_duration_minutes": 15
	},

	"facet_defaults": { "scale": "micro" },

	"metadata": {
		"realm": "productivity",
		"typical_duration": "5-30 minutes",
		"description": "Simple one-step tasks that can be done quickly"
	}
}
```

#### Deep Work Task Template (`task.deep_work`)

```json
{
	"scope": "task",
	"type_key": "task.deep_work",
	"name": "Deep Work Task",
	"status": "active",
	"is_abstract": false,
	"parent_template_id": "<task.base id>",

	"schema": {
		"type": "object",
		"properties": {
			"requires_focus_time": { "type": "boolean", "default": true },
			"preferred_time_of_day": {
				"type": "string",
				"enum": ["morning", "afternoon", "evening"]
			},
			"work_sessions": { "type": "array", "items": { "type": "object" } }
		}
	},

	"default_props": {
		"estimated_duration_minutes": 120,
		"requires_focus_time": true
	},

	"facet_defaults": { "scale": "small" },

	"metadata": {
		"realm": "productivity",
		"typical_duration": "1-4 hours",
		"requires_deep_focus": true,
		"description": "Tasks requiring extended focused attention"
	}
}
```

#### Recurring Task Template (`task.recurring`)

```json
{
	"scope": "task",
	"type_key": "task.recurring",
	"name": "Recurring Task",
	"status": "active",
	"is_abstract": false,
	"parent_template_id": "<task.base id>",

	"schema": {
		"type": "object",
		"properties": {
			"recurrence_rule": { "type": "string", "description": "RRULE format" },
			"recurrence_ends": { "type": "string", "format": "date" },
			"skip_count": { "type": "number", "default": 0 },
			"completion_history": {
				"type": "array",
				"items": { "type": "string", "format": "date-time" }
			}
		},
		"required": ["recurrence_rule"]
	},

	"fsm": {
		"type_key": "task.recurring",
		"states": ["active", "paused", "completed_instance", "ended"],
		"transitions": [
			{ "from": "active", "to": "paused", "event": "pause" },
			{ "from": "paused", "to": "active", "event": "resume" },
			{
				"from": "active",
				"to": "completed_instance",
				"event": "complete_instance",
				"actions": [{ "type": "schedule_next_occurrence" }]
			},
			{ "from": "active", "to": "ended", "event": "end_recurrence" }
		]
	},

	"default_props": {
		"recurrence_rule": "FREQ=WEEKLY;BYDAY=MO"
	},

	"facet_defaults": { "scale": "micro" },

	"metadata": {
		"realm": "productivity",
		"supports_recurrence": true,
		"description": "Tasks that repeat on a schedule"
	}
}
```

#### Milestone Task Template (`task.milestone`)

```json
{
	"scope": "task",
	"type_key": "task.milestone",
	"name": "Milestone",
	"status": "active",
	"is_abstract": false,
	"parent_template_id": "<task.base id>",

	"schema": {
		"type": "object",
		"properties": {
			"deliverable_output_id": { "type": "string", "format": "uuid" },
			"success_criteria": { "type": "array", "items": { "type": "string" } },
			"stakeholders": { "type": "array", "items": { "type": "string" } }
		}
	},

	"fsm": {
		"type_key": "task.milestone",
		"states": ["planned", "in_progress", "delivered", "accepted", "rejected"],
		"transitions": [
			{ "from": "planned", "to": "in_progress", "event": "start" },
			{ "from": "in_progress", "to": "delivered", "event": "deliver" },
			{ "from": "delivered", "to": "accepted", "event": "accept" },
			{ "from": "delivered", "to": "rejected", "event": "reject" },
			{ "from": "rejected", "to": "in_progress", "event": "rework" }
		]
	},

	"facet_defaults": { "scale": "medium" },

	"metadata": {
		"realm": "productivity",
		"is_milestone": true,
		"description": "Critical project milestones with deliverables"
	}
}
```

---

### 5.2 Goal Template Hierarchy

**Proposed Structure**:

```
goal.base (abstract)
  ├→ goal.outcome (concrete)
  ├→ goal.learning (concrete)
  ├→ goal.behavior (concrete)
  └→ goal.metric (concrete)
```

#### Goal Base Template (`goal.base`)

```json
{
	"scope": "goal",
	"type_key": "goal.base",
	"name": "Base Goal",
	"status": "active",
	"is_abstract": true,

	"schema": {
		"type": "object",
		"properties": {
			"name": { "type": "string" },
			"description": { "type": "string" },
			"target_date": { "type": "string", "format": "date" },
			"measurement_criteria": { "type": "string" },
			"success_definition": { "type": "string" },
			"priority": { "type": "string", "enum": ["high", "medium", "low"] },
			"notes": { "type": "string" }
		},
		"required": ["name", "success_definition"]
	},

	"fsm": {
		"type_key": "goal.base",
		"states": ["draft", "active", "achieved", "abandoned"],
		"transitions": [
			{ "from": "draft", "to": "active", "event": "commit" },
			{ "from": "active", "to": "achieved", "event": "achieve" },
			{ "from": "active", "to": "abandoned", "event": "abandon" }
		]
	},

	"default_props": { "priority": "medium" },
	"default_views": [{ "view": "list", "sort_by": "target_date" }],

	"metadata": {
		"realm": "goals",
		"description": "Abstract base template for all goals"
	}
}
```

#### Outcome Goal Template (`goal.outcome`)

```json
{
	"scope": "goal",
	"type_key": "goal.outcome",
	"name": "Outcome Goal",
	"status": "active",
	"is_abstract": false,
	"parent_template_id": "<goal.base id>",

	"schema": {
		"type": "object",
		"properties": {
			"desired_outcome": { "type": "string" },
			"current_state": { "type": "string" },
			"obstacles": { "type": "array", "items": { "type": "string" } },
			"action_plan": { "type": "string" }
		},
		"required": ["desired_outcome"]
	},

	"metadata": {
		"realm": "goals",
		"goal_type": "outcome",
		"description": "Goals focused on achieving specific outcomes"
	}
}
```

#### Learning Goal Template (`goal.learning`)

```json
{
	"scope": "goal",
	"type_key": "goal.learning",
	"name": "Learning Goal",
	"status": "active",
	"is_abstract": false,
	"parent_template_id": "<goal.base id>",

	"schema": {
		"type": "object",
		"properties": {
			"skill_to_learn": { "type": "string" },
			"current_level": { "type": "string", "enum": ["beginner", "intermediate", "advanced"] },
			"target_level": {
				"type": "string",
				"enum": ["beginner", "intermediate", "advanced", "expert"]
			},
			"learning_resources": { "type": "array", "items": { "type": "string" } },
			"practice_schedule": { "type": "string" }
		},
		"required": ["skill_to_learn"]
	},

	"metadata": {
		"realm": "goals",
		"goal_type": "learning",
		"description": "Goals focused on acquiring new skills or knowledge"
	}
}
```

#### Behavior Change Goal Template (`goal.behavior`)

```json
{
	"scope": "goal",
	"type_key": "goal.behavior",
	"name": "Behavior Change Goal",
	"status": "active",
	"is_abstract": false,
	"parent_template_id": "<goal.base id>",

	"schema": {
		"type": "object",
		"properties": {
			"current_behavior": { "type": "string" },
			"target_behavior": { "type": "string" },
			"frequency_target": { "type": "string" },
			"tracking_method": { "type": "string" },
			"completion_log": {
				"type": "array",
				"items": { "type": "string", "format": "date-time" }
			}
		}
	},

	"metadata": {
		"realm": "goals",
		"goal_type": "behavior",
		"description": "Goals focused on changing habits and behaviors"
	}
}
```

#### Metric Goal Template (`goal.metric`)

```json
{
	"scope": "goal",
	"type_key": "goal.metric",
	"name": "Metric Goal",
	"status": "active",
	"is_abstract": false,
	"parent_template_id": "<goal.base id>",

	"schema": {
		"type": "object",
		"properties": {
			"metric_name": { "type": "string" },
			"current_value": { "type": "number" },
			"target_value": { "type": "number" },
			"unit": { "type": "string" },
			"measurement_frequency": { "type": "string", "enum": ["daily", "weekly", "monthly"] },
			"data_points": { "type": "array", "items": { "type": "object" } }
		},
		"required": ["metric_name", "target_value", "unit"]
	},

	"metadata": {
		"realm": "goals",
		"goal_type": "metric",
		"description": "Goals focused on achieving specific numeric targets"
	}
}
```

---

### 5.3 Additional Plan Templates

#### Content Calendar Plan (`plan.content_calendar`)

```json
{
	"scope": "plan",
	"type_key": "plan.content_calendar",
	"name": "Content Calendar",
	"status": "active",

	"schema": {
		"type": "object",
		"properties": {
			"theme": { "type": "string" },
			"platforms": { "type": "array", "items": { "type": "string" } },
			"publish_frequency": { "type": "string" },
			"content_types": { "type": "array", "items": { "type": "string" } }
		}
	},

	"fsm": {
		"type_key": "plan.content_calendar",
		"states": ["planning", "scheduled", "publishing", "complete"],
		"transitions": [
			{ "from": "planning", "to": "scheduled", "event": "schedule" },
			{ "from": "scheduled", "to": "publishing", "event": "start_publishing" },
			{ "from": "publishing", "to": "complete", "event": "finish" }
		]
	},

	"facet_defaults": { "scale": "medium", "stage": "execution" },

	"metadata": {
		"typical_use_by": ["marketer", "writer", "content-creator"],
		"description": "Plan for organizing content creation and publishing"
	}
}
```

#### Client Onboarding Plan (`plan.client_onboarding`)

```json
{
	"scope": "plan",
	"type_key": "plan.client_onboarding",
	"name": "Client Onboarding",
	"status": "active",

	"schema": {
		"type": "object",
		"properties": {
			"client_name": { "type": "string" },
			"start_date": { "type": "string", "format": "date" },
			"onboarding_duration_days": { "type": "number" },
			"key_milestones": { "type": "array", "items": { "type": "string" } }
		}
	},

	"fsm": {
		"type_key": "plan.client_onboarding",
		"states": ["preparing", "in_progress", "complete", "paused"],
		"transitions": [
			{ "from": "preparing", "to": "in_progress", "event": "start" },
			{ "from": "in_progress", "to": "paused", "event": "pause" },
			{ "from": "paused", "to": "in_progress", "event": "resume" },
			{ "from": "in_progress", "to": "complete", "event": "finish" }
		]
	},

	"facet_defaults": { "context": "client", "scale": "small" },

	"metadata": {
		"typical_use_by": ["coach", "consultant", "agency"],
		"description": "Structured plan for onboarding new clients"
	}
}
```

---

## 6. IMPLEMENTATION PLAN

### Phase 1: Create Migration for Base Task Templates

**Priority**: High
**Estimated Effort**: 2-4 hours

1. Create migration file: `20250605000001_add_base_task_templates.sql`
2. Insert task.base (abstract)
3. Insert task.quick, task.deep_work, task.meeting_prep, task.recurring, task.milestone
4. Test template resolution and instantiation

### Phase 2: Create Migration for Base Goal Templates

**Priority**: High
**Estimated Effort**: 1-2 hours

1. Create migration file: `20250605000002_add_base_goal_templates.sql`
2. Insert goal.base (abstract)
3. Insert goal.outcome, goal.learning, goal.behavior, goal.metric
4. Test template resolution

### Phase 3: Expand Plan Templates

**Priority**: Medium
**Estimated Effort**: 2-3 hours

1. Create migration file: `20250605000003_expand_plan_templates.sql`
2. Add domain-specific plan templates
3. Test FSM transitions

### Phase 4: Update Documentation

**Priority**: High
**Estimated Effort**: 1 hour

1. Update `/apps/web/docs/features/ontology/DATA_MODELS.md`
2. Update template count in implementation summary
3. Document new template hierarchy

### Phase 5: Update Service Layer

**Priority**: Medium
**Estimated Effort**: 1-2 hours

1. Update TemplateResolverService to handle task/goal templates
2. Add helper functions for task template selection
3. Update UI to show task/goal type selection

---

## 7. MIGRATION APPROACH

### Option A: Single Comprehensive Migration (Recommended)

Create one migration: `20250605000001_add_missing_base_templates.sql`

**Pros**:

- Single atomic operation
- Clear before/after state
- Easier to rollback if needed

**Cons**:

- Larger file
- All-or-nothing approach

### Option B: Separate Migrations per Entity Type

Create multiple migrations:

- `20250605000001_add_task_templates.sql`
- `20250605000002_add_goal_templates.sql`
- `20250605000003_expand_plan_templates.sql`

**Pros**:

- Smaller, focused migrations
- Can deploy incrementally
- Easier to review

**Cons**:

- Multiple deployments
- Dependency management

**Recommendation**: Use **Option A** for consistency with existing ontology migrations.

---

## 8. EXAMPLE MIGRATION SQL

```sql
-- ============================================
-- Add Missing Base Templates
-- Tasks, Goals, and Expanded Plans
-- ============================================

-- System actor reference
DO $$
DECLARE
  v_system_actor_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Verify system actor exists
  IF NOT EXISTS (SELECT 1 FROM onto_actors WHERE id = v_system_actor_id) THEN
    RAISE EXCEPTION 'System actor not found. Run ontology_system migration first.';
  END IF;
END$$;

-- ============================================
-- TASK TEMPLATES
-- ============================================

-- task.base (abstract)
INSERT INTO onto_templates (
  scope, type_key, name, status, is_abstract,
  schema, fsm, default_props, default_views, facet_defaults, metadata, created_by
) VALUES (
  'task',
  'task.base',
  'Base Task',
  'active',
  true,  -- Abstract template
  '{
    "type": "object",
    "properties": {
      "title": {"type": "string"},
      "description": {"type": "string"},
      "estimated_duration_minutes": {"type": "number", "minimum": 5},
      "dependencies": {"type": "array", "items": {"type": "string", "format": "uuid"}}
    },
    "required": ["title"]
  }'::jsonb,
  '{
    "type_key": "task.base",
    "states": ["todo", "in_progress", "blocked", "done", "abandoned"],
    "transitions": [
      {"from": "todo", "to": "in_progress", "event": "start"},
      {"from": "in_progress", "to": "blocked", "event": "block"},
      {"from": "blocked", "to": "in_progress", "event": "unblock"},
      {"from": "in_progress", "to": "done", "event": "complete"},
      {"from": "todo", "to": "abandoned", "event": "abandon"}
    ]
  }'::jsonb,
  '{}'::jsonb,
  '[{"view": "list", "sort_by": "priority"}]'::jsonb,
  '{"scale": "small"}'::jsonb,
  '{"realm": "productivity", "description": "Base template for all tasks"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- task.quick
INSERT INTO onto_templates (
  scope, type_key, name, status, is_abstract, parent_template_id,
  schema, fsm, default_props, facet_defaults, metadata, created_by
) VALUES (
  'task',
  'task.quick',
  'Quick Task',
  'active',
  false,
  (SELECT id FROM onto_templates WHERE type_key = 'task.base' AND scope = 'task'),
  '{"type": "object", "properties": {"is_urgent": {"type": "boolean"}}}'::jsonb,
  '{
    "type_key": "task.quick",
    "states": ["todo", "done"],
    "transitions": [{"from": "todo", "to": "done", "event": "complete"}]
  }'::jsonb,
  '{"estimated_duration_minutes": 15}'::jsonb,
  '{"scale": "micro"}'::jsonb,
  '{"realm": "productivity", "typical_duration": "5-30 minutes"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- Add more task templates: task.deep_work, task.recurring, task.milestone...

-- ============================================
-- GOAL TEMPLATES
-- ============================================

-- goal.base (abstract)
INSERT INTO onto_templates (
  scope, type_key, name, status, is_abstract,
  schema, fsm, default_props, metadata, created_by
) VALUES (
  'goal',
  'goal.base',
  'Base Goal',
  'active',
  true,
  '{
    "type": "object",
    "properties": {
      "name": {"type": "string"},
      "success_definition": {"type": "string"},
      "target_date": {"type": "string", "format": "date"}
    },
    "required": ["name", "success_definition"]
  }'::jsonb,
  '{
    "type_key": "goal.base",
    "states": ["draft", "active", "achieved", "abandoned"],
    "transitions": [
      {"from": "draft", "to": "active", "event": "commit"},
      {"from": "active", "to": "achieved", "event": "achieve"},
      {"from": "active", "to": "abandoned", "event": "abandon"}
    ]
  }'::jsonb,
  '{"priority": "medium"}'::jsonb,
  '{"realm": "goals", "description": "Base template for all goals"}'::jsonb,
  '00000000-0000-0000-0000-000000000001'
) ON CONFLICT (scope, type_key) DO NOTHING;

-- goal.outcome
-- Add more goal templates...

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
  RAISE NOTICE 'Missing base templates created successfully';
  RAISE NOTICE 'Task templates: task.base + 5 concrete types';
  RAISE NOTICE 'Goal templates: goal.base + 4 concrete types';
  RAISE NOTICE 'Updated plan templates: +3 domain-specific plans';
END$$;
```

---

## 9. TESTING CHECKLIST

After implementing base templates:

### Template Resolution

- [ ] Can resolve task.base (abstract)
- [ ] Can resolve task.quick (concrete, inherits from task.base)
- [ ] Schema merging works correctly (parent + child)
- [ ] FSM override works (child FSM replaces parent)

### Task Creation

- [ ] Can create task.quick instance
- [ ] Props validate against merged schema
- [ ] Default props apply correctly
- [ ] Facet defaults apply

### Goal Creation

- [ ] Can create goal.outcome instance
- [ ] FSM states work correctly (draft → active → achieved)
- [ ] Success criteria validate

### FSM Transitions

- [ ] Task state transitions work
- [ ] Goal state transitions work
- [ ] Guards evaluate correctly
- [ ] Actions trigger appropriately

### API Endpoints

- [ ] GET /api/onto/templates?scope=task returns task templates
- [ ] GET /api/onto/templates?scope=goal returns goal templates
- [ ] POST /api/onto/tasks/create accepts type_key

---

## 10. CONCLUSION

**Summary**:
The ontology system has a critical gap - **no base templates for tasks or goals** despite having database tables for them. This creates inconsistency and makes it difficult to leverage the template system's power.

**Impact**:

- Tasks created without type differentiation
- No FSM guidance for tasks/goals
- Missing valuable features from old task model (recurrence, dependencies, subtasks)

**Solution**:
Create comprehensive base template hierarchy:

- **9 task templates** (1 abstract base + 8 concrete types)
- **5 goal templates** (1 abstract base + 4 concrete types)
- **3+ additional plan templates** (content calendar, onboarding, roadmap)

**Next Steps**:

1. Review and approve template designs
2. Create migration file(s)
3. Test template resolution and instantiation
4. Update UI to show template selection
5. Update documentation

**Benefits**:

- ✅ Type-safe task/goal creation
- ✅ FSM guidance for lifecycle management
- ✅ Preserves features from old task model
- ✅ Inheritance hierarchy for extensibility
- ✅ Consistent with existing output template pattern
- ✅ Enables domain-specific workflows

---

**End of Analysis**
