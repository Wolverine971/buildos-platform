<!-- thoughts/shared/research/2025-11-04_ontology-architecture-clarification.md -->
# Ontology Architecture Clarification: Projects, Plans, Tasks & Relationships

**Date**: November 4, 2025
**Author**: Claude (AI Assistant)
**Status**: Architectural Clarification
**Purpose**: Clarify hierarchy and relationship patterns

---

## Executive Summary

**Key Architectural Decisions**:

1. ✅ **Use edges for semantic relationships** (dependencies, subtasks) - NOT props arrays or FKs
2. ✅ **Plans are OPTIONAL** - Tasks can exist directly under projects
3. ✅ **Reserve FKs for ownership** - project_id, plan_id (optional)
4. ✅ **Use graph edges for everything else** - Dependencies, subtasks, blocking relationships

---

## 1. THE HIERARCHY (Database Schema)

From the actual migration files:

```sql
-- Projects (top-level containers)
CREATE TABLE onto_projects (
  id uuid PRIMARY KEY,
  org_id uuid,
  name text NOT NULL,
  type_key text NOT NULL,  -- e.g., 'writer.book', 'founder.startup'
  state_key text NOT NULL,
  props jsonb,
  -- No plan_id FK! Projects don't "have a base plan"
);

-- Plans (OPTIONAL organizational layers)
CREATE TABLE onto_plans (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES onto_projects(id),  -- Plan belongs to project
  name text NOT NULL,
  type_key text NOT NULL,  -- e.g., 'plan.weekly', 'plan.sprint'
  state_key text NOT NULL,
  props jsonb,
  -- Plans are children of projects
);

-- Tasks (actionable items)
CREATE TABLE onto_tasks (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES onto_projects(id),  -- ✅ Required: task belongs to project
  plan_id uuid REFERENCES onto_plans(id),                 -- ⚠️ OPTIONAL: task MAY belong to plan
  title text NOT NULL,
  state_key text NOT NULL,
  priority int,
  due_at timestamptz,
  props jsonb,
  -- NO parent_task_id! Use edges for subtasks
  -- NO dependencies array! Use edges for dependencies
);

-- Edges (flexible graph relationships)
CREATE TABLE onto_edges (
  id uuid PRIMARY KEY,
  src_kind text NOT NULL,   -- 'project', 'task', 'plan', 'goal', etc.
  src_id uuid NOT NULL,
  rel text NOT NULL,        -- 'depends_on', 'has_subtask', 'blocks', 'contains', etc.
  dst_kind text NOT NULL,
  dst_id uuid NOT NULL,
  props jsonb,              -- Edge metadata (weight, reason, etc.)
);
```

---

## 2. THE FLOW: Project → Plans → Tasks

### Flow Option A: Project with Plans (Organized)

```
📦 Project "Write Book" (project_id: proj-123)
   type_key: 'writer.book'
   state: 'active'

   ├─ 📋 Plan "Research Phase" (plan_id: plan-1, project_id: proj-123)
   │  type_key: 'plan.weekly'
   │  └─ ✅ Task "Read 3 books" (task-1, project_id: proj-123, plan_id: plan-1)
   │  └─ ✅ Task "Interview experts" (task-2, project_id: proj-123, plan_id: plan-1)
   │
   ├─ 📋 Plan "Writing Phase" (plan_id: plan-2, project_id: proj-123)
   │  type_key: 'plan.sprint'
   │  └─ ✅ Task "Write Chapter 1" (task-3, project_id: proj-123, plan_id: plan-2)
   │  └─ ✅ Task "Write Chapter 2" (task-4, project_id: proj-123, plan_id: plan-2)
   │
   └─ 📋 Plan "Editing Phase" (plan_id: plan-3, project_id: proj-123)
      └─ ✅ Task "Proofread manuscript" (task-5, project_id: proj-123, plan_id: plan-3)
```

**Key Points**:

- ✅ Project has multiple plans
- ✅ Each plan groups related tasks
- ✅ Every task has `project_id` (ownership)
- ✅ Every task has `plan_id` (grouping)

---

### Flow Option B: Project WITHOUT Plans (Flat)

```
📦 Project "Quick Website" (project_id: proj-456)
   type_key: 'developer.app'
   state: 'active'

   ├─ ✅ Task "Design mockup" (task-6, project_id: proj-456, plan_id: NULL)
   ├─ ✅ Task "Code homepage" (task-7, project_id: proj-456, plan_id: NULL)
   └─ ✅ Task "Deploy site" (task-8, project_id: proj-456, plan_id: NULL)
```

**Key Points**:

- ✅ Project has NO plans
- ✅ Tasks exist directly under project
- ✅ `plan_id` is NULL for all tasks
- ✅ This is VALID and SUPPORTED by the schema

---

### Flow Option C: Mixed (Some tasks in plans, some not)

```
📦 Project "Marketing Campaign" (project_id: proj-789)
   type_key: 'marketer.campaign'

   ├─ 📋 Plan "Content Creation" (plan_id: plan-4)
   │  └─ ✅ Task "Write blog posts" (task-9, plan_id: plan-4)
   │
   └─ ✅ Task "Review analytics" (task-10, plan_id: NULL)  ← No plan!
```

**Key Points**:

- ✅ Some tasks in plans, some directly under project
- ✅ Flexible organization

---

## 3. RELATIONSHIPS: FKs vs Edges

### 🔗 Use Direct Foreign Keys For: OWNERSHIP

**Rule**: If relationship is **structural ownership** (parent-child hierarchy), use FK.

| Relationship     | Implementation                | Reason                                  |
| ---------------- | ----------------------------- | --------------------------------------- |
| Task → Project   | `tasks.project_id` FK         | Task MUST belong to exactly one project |
| Task → Plan      | `tasks.plan_id` FK (nullable) | Task MAY belong to one plan             |
| Plan → Project   | `plans.project_id` FK         | Plan MUST belong to exactly one project |
| Output → Project | `outputs.project_id` FK       | Output belongs to project               |
| Goal → Project   | `goals.project_id` FK         | Goal belongs to project                 |

**Characteristics**:

- One-to-many relationships
- Enforced by database constraints
- Cascade deletes
- Query optimization via indexes

---

### 🕸️ Use Graph Edges For: SEMANTIC RELATIONSHIPS

**Rule**: If relationship is **semantic** (meaning-based, flexible), use edges.

| Relationship                  | Edge Definition                      | Example                                        |
| ----------------------------- | ------------------------------------ | ---------------------------------------------- |
| Task depends on task          | `task-A -[depends_on]-> task-B`      | "Code homepage" depends on "Design mockup"     |
| Task has subtask              | `task-A -[has_subtask]-> task-B`     | "Launch Campaign" contains "Write blog post"   |
| Task blocks task              | `task-A -[blocks]-> task-B`          | "Bug X" blocks "Feature Y"                     |
| Task contributes to goal      | `task-A -[contributes_to]-> goal-X`  | "Write Chapter 1" contributes to "Finish Book" |
| Output implements requirement | `output-A -[implements]-> req-X`     | "User Dashboard" implements "Requirement 5"    |
| Project references source     | `project-A -[references]-> source-X` | "Book Project" references "Research Paper"     |
| Plan contains milestone       | `plan-A -[contains]-> milestone-X`   | "Sprint 3" contains "MVP Release"              |

**Characteristics**:

- Many-to-many relationships
- Flexible (can add new relationship types anytime)
- Can have metadata (props on edge)
- Queryable in both directions
- No schema changes needed for new relationship types

---

## 4. TASK DEPENDENCIES: Use Edges, NOT Props

### ❌ WRONG: Dependencies in Props

```json
// DON'T DO THIS!
{
	"scope": "task",
	"type_key": "task.base",
	"schema": {
		"properties": {
			"dependencies": {
				"type": "array",
				"items": { "type": "string", "format": "uuid" } // ❌ Bad!
			}
		}
	}
}
```

**Problems**:

- Duplicates ontology edge system
- Hard to query in reverse ("what tasks depend on this one?")
- Can't have metadata on relationships
- Violates DRY principle

---

### ✅ CORRECT: Dependencies as Edges

```sql
-- Task A depends on Task B
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
VALUES (
  'task',
  'task-A-uuid',
  'depends_on',
  'task',
  'task-B-uuid',
  '{"reason": "needs design before coding"}'::jsonb  -- Optional metadata
);

-- Query: What does Task A depend on?
SELECT dst_id, dst_kind, props
FROM onto_edges
WHERE src_kind = 'task'
  AND src_id = 'task-A-uuid'
  AND rel = 'depends_on';

-- Query: What tasks depend on Task B? (Reverse!)
SELECT src_id, src_kind, props
FROM onto_edges
WHERE dst_kind = 'task'
  AND dst_id = 'task-B-uuid'
  AND rel = 'depends_on';
```

**Benefits**:

- ✅ Uses existing ontology infrastructure
- ✅ Queryable in both directions
- ✅ Can have edge metadata (reason, weight, etc.)
- ✅ Flexible (add new relationship types anytime)

---

## 5. SUBTASKS: Use Edges, NOT parent_task_id

### ❌ WRONG: parent_task_id Column

```sql
-- DON'T DO THIS!
ALTER TABLE onto_tasks ADD COLUMN parent_task_id uuid REFERENCES onto_tasks(id);
```

**Problems**:

- Adds schema complexity
- Requires migration
- Hard to query multi-level hierarchies
- Single relationship type only

---

### ✅ CORRECT: Subtasks as Edges

```sql
-- Task A has subtask Task B
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
VALUES (
  'task',
  'task-A-uuid',
  'has_subtask',
  'task',
  'task-B-uuid',
  '{"order": 1}'::jsonb  -- Optional: ordering
);

-- Query: Get all subtasks of Task A
SELECT dst_id
FROM onto_edges
WHERE src_kind = 'task'
  AND src_id = 'task-A-uuid'
  AND rel = 'has_subtask'
ORDER BY (props->>'order')::int;

-- Query: Get parent task of Task B (Reverse!)
SELECT src_id
FROM onto_edges
WHERE dst_kind = 'task'
  AND dst_id = 'task-B-uuid'
  AND rel = 'has_subtask';
```

**Benefits**:

- ✅ No schema changes needed
- ✅ Flexible (multiple relationship types)
- ✅ Can represent complex hierarchies
- ✅ Easy to traverse in any direction

---

## 6. CORRECTED TASK TEMPLATE SCHEMA

### Before (WRONG):

```json
{
	"schema": {
		"properties": {
			"dependencies": { "type": "array" }, // ❌ Remove this!
			"parent_task_id": { "type": "string" } // ❌ Remove this!
		}
	}
}
```

### After (CORRECT):

```json
{
	"scope": "task",
	"type_key": "task.base",
	"schema": {
		"type": "object",
		"properties": {
			"title": { "type": "string" },
			"description": { "type": "string" },
			"estimated_duration_minutes": { "type": "number", "minimum": 5 },
			"notes": { "type": "string" }
			// ✅ NO dependencies array!
			// ✅ NO parent_task_id!
			// Use edges for relationships instead
		},
		"required": ["title"]
	}
}
```

---

## 7. RECURRENCE: Keep in Props (Not a Relationship)

Recurrence is a **property of the task itself**, not a relationship, so it SHOULD be in props:

```json
{
	"scope": "task",
	"type_key": "task.recurring",
	"schema": {
		"properties": {
			"recurrence_rule": { "type": "string", "description": "RRULE format" },
			"recurrence_ends": { "type": "string", "format": "date" },
			"completion_history": {
				"type": "array",
				"items": { "type": "string", "format": "date-time" }
			}
		}
	}
}
```

**Why?** Because recurrence is intrinsic to the task's behavior, not a relationship with another entity.

---

## 8. QUESTIONS ANSWERED

### Q: "Do projects have a base plan?"

**A: NO.** Projects don't have "a base plan." Here's what they have:

- ✅ Projects can have **ZERO or MORE plans** (one-to-many)
- ✅ Plans are **OPTIONAL organizational layers**
- ✅ Tasks can exist **directly under projects** (plan_id = null)

```
Project
  ├─ Plan 1 (optional)
  │   └─ Tasks
  ├─ Plan 2 (optional)
  │   └─ Tasks
  └─ Tasks (no plan, directly under project)
```

### Q: "Do tasks have a base plan?"

**A: NO.** Tasks have an **optional reference to a plan**:

- ✅ `tasks.plan_id` can be NULL (task exists directly under project)
- ✅ `tasks.plan_id` can reference a plan (task belongs to plan)
- ✅ `tasks.project_id` is ALWAYS required (task must belong to project)

### Q: "Or are these separate scopes?"

**A: YES.** Project, Plan, and Task are **separate scopes/entity types**:

- ✅ Each has its own template scope (`scope: 'project'`, `scope: 'plan'`, `scope: 'task'`)
- ✅ Each has its own type_keys (`writer.book`, `plan.sprint`, `task.quick`)
- ✅ Related by FKs (ownership) and edges (semantics)

---

## 9. EDGE RELATIONSHIP EXAMPLES

### Example 1: Task Dependencies

```
Task "Design mockup" (task-1)
  ↓ edge: depends_on
Task "Code homepage" (task-2)
  ↓ edge: depends_on
Task "Deploy site" (task-3)
```

```sql
-- Task 2 depends on Task 1
INSERT INTO onto_edges VALUES (
  gen_random_uuid(),
  'task', 'task-2-uuid',
  'depends_on',
  'task', 'task-1-uuid',
  '{}'::jsonb
);

-- Task 3 depends on Task 2
INSERT INTO onto_edges VALUES (
  gen_random_uuid(),
  'task', 'task-3-uuid',
  'depends_on',
  'task', 'task-2-uuid',
  '{}'::jsonb
);
```

---

### Example 2: Task Subtasks

```
Task "Launch Marketing Campaign" (parent, task-10)
  ├─ edge: has_subtask → Task "Create social posts" (task-11)
  ├─ edge: has_subtask → Task "Design email" (task-12)
  └─ edge: has_subtask → Task "Schedule ads" (task-13)
```

```sql
-- Parent task has subtasks
INSERT INTO onto_edges VALUES
  (gen_random_uuid(), 'task', 'task-10-uuid', 'has_subtask', 'task', 'task-11-uuid', '{"order": 1}'::jsonb),
  (gen_random_uuid(), 'task', 'task-10-uuid', 'has_subtask', 'task', 'task-12-uuid', '{"order": 2}'::jsonb),
  (gen_random_uuid(), 'task', 'task-10-uuid', 'has_subtask', 'task', 'task-13-uuid', '{"order": 3}'::jsonb);
```

---

### Example 3: Task Contributes to Goal

```
Goal "Finish Book by June"
  ↑ edge: contributes_to
  ├─ Task "Write Chapter 1"
  ├─ Task "Write Chapter 2"
  └─ Task "Write Chapter 3"
```

```sql
-- Tasks contribute to goal
INSERT INTO onto_edges VALUES
  (gen_random_uuid(), 'task', 'task-ch1-uuid', 'contributes_to', 'goal', 'goal-book-uuid', '{}'::jsonb),
  (gen_random_uuid(), 'task', 'task-ch2-uuid', 'contributes_to', 'goal', 'goal-book-uuid', '{}'::jsonb),
  (gen_random_uuid(), 'task', 'task-ch3-uuid', 'contributes_to', 'goal', 'goal-book-uuid', '{}'::jsonb);
```

---

## 10. SUMMARY: Design Principles

### ✅ DO:

1. **Use FKs for ownership** (project_id, plan_id)
2. **Use edges for semantics** (depends_on, has_subtask, blocks, contributes_to)
3. **Keep plans optional** (plan_id can be null)
4. **Use edges for task relationships** (dependencies, subtasks)
5. **Put intrinsic properties in props** (recurrence, duration estimates)

### ❌ DON'T:

1. **Don't duplicate edges in props** (no dependencies array!)
2. **Don't add parent_task_id** (use edges!)
3. **Don't assume projects have a base plan** (plans are optional!)
4. **Don't use FKs for semantic relationships** (use edges!)

---

## 11. FINAL ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                        ONTO_PROJECTS                        │
│  (Top-level containers, no base plan)                      │
└─────────────────────────────────────────────────────────────┘
           │ 1:many (FK: project_id)
           ├──────────────────────┬──────────────────────
           ↓                      ↓
┌──────────────────────┐  ┌──────────────────────┐
│    ONTO_PLANS        │  │    ONTO_TASKS        │
│  (Optional grouping) │  │  (Actionable items)  │
│  project_id FK       │  │  project_id FK (req) │
└──────────────────────┘  │  plan_id FK (opt)    │
           │              └──────────────────────┘
           │ 1:many (FK: plan_id)    │
           └──────────────────────────┘
                                     │
                                     ↓
                          ┌──────────────────────┐
                          │    ONTO_EDGES        │
                          │  (Flexible graph)    │
                          │                      │
                          │  src: task-A         │
                          │  rel: depends_on     │
                          │  dst: task-B         │
                          │                      │
                          │  src: task-parent    │
                          │  rel: has_subtask    │
                          │  dst: task-child     │
                          └──────────────────────┘
```

---

**End of Clarification**

Generated: 2025-11-04
Purpose: Clarify project-plan-task hierarchy and relationship patterns
