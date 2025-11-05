# Ontology Naming Conventions Analysis & Recommendations

**Date**: November 4, 2025
**Author**: Claude (AI Assistant)
**Status**: Architecture Decision
**Context**: Based on `buildos-ontology-master-plan.md` v3.1

---

## Executive Summary

**Question**: Should we expand the `{domain}.{deliverable}[.{variant}]` pattern to tasks, plans, goals, and other entity types?

**Answer**: **NO.** Only **projects** should use domain-specific naming. All other entities (tasks, plans, goals, outputs, documents) should use **generic type patterns** because they inherit domain context from their parent project.

**Rationale**:

- Projects are **domain-specific containers** (writer's book, coach's client)
- Tasks/plans/goals/outputs are **generic, reusable work units** that apply across domains
- Domain context flows from project → plans → tasks via relationships
- Generic types are more maintainable and reusable

---

## 1. MASTER PLAN CONVENTIONS (from v3.1)

### 1.1 Project Template Naming

**Pattern**: `{domain}.{deliverable}[.{variant}]`

**Philosophy** (from master plan):

> The `type_key` is the main way to identify and categorize work. It should be:
>
> - **Descriptive:** immediately understandable
> - **Specific:** enough to be useful (not too generic)
> - **Reusable:** general enough for multiple instances
> - **Perspective-based:** reflects the actor's relationship to the work

**Components**:

1. **Domain** = actor perspective (who is doing the work)
    - Examples: writer, coach, developer, founder, student, personal, consultant, marketer

2. **Deliverable** = primary output (what is being created/managed)
    - Examples: book, article, client, app, feature, startup, product, assignment, goal, routine

3. **Variant** = optional specialization (when distinct schemas/FSMs needed)
    - Examples: `writer.book.fiction`, `coach.client.executive`, `developer.app.mobile`

**Examples from Master Plan**:

```
writer.book              ✅ Actor + deliverable
writer.book.fiction      ✅ Actor + deliverable + variant
coach.client             ✅ Actor + deliverable
developer.app            ✅ Actor + deliverable
founder.startup          ✅ Actor + deliverable
student.assignment       ✅ Actor + deliverable
personal.goal            ✅ Actor + deliverable
personal.routine         ✅ Actor + deliverable
```

**Anti-patterns**:

```
book.writer              ❌ Backwards perspective
writeBook                ❌ CamelCase
write-book               ❌ Hyphens
writer                   ❌ Too vague (deliverable missing)
writer.fiction.book.ya   ❌ Too many levels
```

---

### 1.2 Other Entity Template Naming (from Master Plan)

**Plans** (seeded examples):

```
plan.weekly              ✅ Generic planning type
plan.sprint              ✅ Generic planning type
```

**Deliverables/Outputs** (seeded examples):

```
deliverable.chapter      ⚠️ Master plan says "deliverable"
deliverable.design       ⚠️ Master plan says "deliverable"
deliverable.workout_plan ⚠️ Master plan says "deliverable"

BUT actual migration uses:
output.chapter           ✅ Actual implementation
output.design            ✅ Actual implementation
output.workout_plan      ✅ Actual implementation
```

**Documents** (seeded examples):

```
doc.brief                ✅ Generic document type
doc.notes                ✅ Generic document type
doc.intake               ✅ Generic document type
```

---

## 2. KEY INSIGHT: Domain Hierarchy

**The Domain Hierarchy**:

```
PROJECT (domain-specific: writer.book, coach.client)
  ↓ inherits domain context
  ├─ PLAN (generic: plan.sprint, plan.weekly)
  │   ↓ inherits domain context
  │   └─ TASK (generic: task.quick, task.deep_work)
  │
  ├─ GOAL (generic: goal.outcome, goal.metric)
  ├─ OUTPUT (generic: output.chapter, output.design)
  └─ DOCUMENT (generic: doc.brief, doc.notes)
```

**Key Principle**: **Domain context flows DOWN the hierarchy through relationships, not through naming.**

Example:

```
Project: writer.book
  ├─ Plan: plan.weekly (not writer.plan.weekly!)
  │   └─ Task: task.deep_work (not writer.task.writing!)
  ├─ Goal: goal.outcome (not writer.goal.book_completion!)
  └─ Output: output.chapter (not writer.output.chapter!)
```

**Why?** Because:

1. The task's domain is **inherited from its project** via `project_id` FK
2. A "deep work task" is a deep work task regardless of whether it's for writing, coding, or coaching
3. Generic types are **reusable across domains**
4. Simpler to understand and maintain

---

## 3. ANALYSIS: Should Tasks Use Domain Naming?

### Option A: Domain-Specific Tasks (❌ NOT RECOMMENDED)

**Pattern**: `{domain}.task.{type}`

```
writer.task.chapter      ❌ Domain-specific task
writer.task.editing      ❌ Domain-specific task
developer.task.coding    ❌ Domain-specific task
developer.task.review    ❌ Domain-specific task
coach.task.session       ❌ Domain-specific task
```

**Cons**:

- ❌ **Explosion of templates**: Need task types for EVERY domain
- ❌ **Duplication**: "Quick task" concept repeats across all domains
- ❌ **Maintenance nightmare**: Update task behavior = update 10+ templates
- ❌ **Violates DRY**: A quick task is a quick task, regardless of domain
- ❌ **Confusing**: Domain is already known from parent project
- ❌ **Breaking master plan philosophy**: Tasks aren't deliverables with actor perspectives

**When might it make sense?**

- Only if task has **radically different schema/FSM** per domain
- Example: `coach.task.session` requires session notes, client prep, follow-up
- But this can be handled via **project-specific props** and **FSM actions**

---

### Option B: Generic Tasks (✅ RECOMMENDED)

**Pattern**: `task.{type}`

```
task.quick               ✅ Generic task type
task.deep_work           ✅ Generic task type
task.recurring           ✅ Generic task type
task.milestone           ✅ Generic task type
task.meeting_prep        ✅ Generic task type
task.research            ✅ Generic task type
task.review              ✅ Generic task type
```

**Pros**:

- ✅ **Reusable**: One `task.deep_work` template for ALL domains
- ✅ **Maintainable**: Update once, applies everywhere
- ✅ **Simple**: Easy to understand and document
- ✅ **Follows master plan pattern**: Plans, outputs, docs are generic
- ✅ **Domain context from project**: Task inherits domain via `project_id`
- ✅ **Matches actual usage**: A 2-hour focused task is the same work pattern everywhere

**Domain-specific behavior via**:

- **Props**: Task props can vary based on project context
- **FSM actions**: Project FSM actions spawn domain-appropriate tasks
- **Templates**: Project templates define default task types to create

Example:

```typescript
// Writer project spawns writing tasks
project: "writer.book"
  └─ task: "task.deep_work" {
       title: "Write Chapter 1",
       props: {
         word_count_target: 3000,  // Writer-specific prop
         genre_notes: "..."         // Writer-specific prop
       }
     }

// Developer project spawns coding tasks
project: "developer.app"
  └─ task: "task.deep_work" {
       title: "Implement auth system",
       props: {
         story_points: 8,           // Developer-specific prop
         tech_stack: ["React"]      // Developer-specific prop
       }
     }
```

**Same task template, different props based on project!**

---

## 4. FINAL NAMING CONVENTION RECOMMENDATIONS

### 4.1 Complete Pattern Reference

| Entity Type     | Pattern                              | Examples                                              | Domain-Specific? |
| --------------- | ------------------------------------ | ----------------------------------------------------- | ---------------- |
| **Project**     | `{domain}.{deliverable}[.{variant}]` | `writer.book`, `coach.client`, `founder.startup`      | ✅ YES           |
| **Plan**        | `plan.{type}`                        | `plan.weekly`, `plan.sprint`, `plan.content_calendar` | ❌ NO            |
| **Task**        | `task.{type}`                        | `task.quick`, `task.deep_work`, `task.recurring`      | ❌ NO            |
| **Goal**        | `goal.{type}`                        | `goal.outcome`, `goal.learning`, `goal.behavior`      | ❌ NO            |
| **Output**      | `output.{type}`                      | `output.chapter`, `output.design`, `output.article`   | ❌ NO            |
| **Document**    | `doc.{type}`                         | `doc.brief`, `doc.notes`, `doc.intake`                | ❌ NO            |
| **Requirement** | `requirement.{type}`                 | `requirement.functional`, `requirement.constraint`    | ❌ NO            |
| **Milestone**   | `milestone.{type}`                   | `milestone.delivery`, `milestone.launch`              | ❌ NO            |
| **Risk**        | `risk.{type}`                        | `risk.technical`, `risk.timeline`                     | ❌ NO            |
| **Metric**      | `metric.{type}`                      | `metric.performance`, `metric.engagement`             | ❌ NO            |

### 4.2 Rationale

**Why only projects are domain-specific:**

1. Projects are **top-level containers** representing bounded initiatives
2. Projects reflect **actor's perspective** on their work (writer's book, coach's client)
3. All child entities **inherit domain context** via relationships
4. Generic child entities are **reusable across all domains**

**Why everything else is generic:**

1. **Tasks**: Work patterns transcend domains (deep work is deep work everywhere)
2. **Plans**: Planning structures are universal (weekly plans work for everyone)
3. **Goals**: Goal types are universal (outcome goals apply to all domains)
4. **Outputs**: Output types are generic artifacts (chapters, designs, reports)
5. **Documents**: Document types are universal (briefs, notes, forms)

---

## 5. MASTER PLAN ALIGNMENT CHECK

### 5.1 Quoted from Master Plan

> **Type-first, not taxonomy-first:** The `type_key` (`writer.book`) is the primary identifier, carrying domain semantics naturally.

✅ **Projects carry domain semantics**, not child entities.

> **Facets for orthogonal dimensions:** Only 3 facets (context, scale, stage) that genuinely vary per instance.

✅ **Tasks use facets (scale)**, not domain naming, for variation.

> **Configuration over code:** New verticals = data (templates + FSM), not deployments.

✅ **Generic task templates work across all verticals** without duplication.

### 5.2 Master Plan Examples Analysis

From section 12, "Type Key Registry (Seeded Examples)":

```
**Plans:**
- plan.weekly (week plans)           ✅ Generic pattern
- plan.sprint (sprints)              ✅ Generic pattern

**Deliverables:**
- deliverable.chapter (writing)      ✅ Generic pattern
- deliverable.design (design work)   ✅ Generic pattern
- deliverable.workout_plan (coaching) ✅ Generic pattern

**Documents:**
- doc.brief (briefs)                 ✅ Generic pattern
- doc.notes (research)               ✅ Generic pattern
- doc.intake (forms)                 ✅ Generic pattern
```

**Master plan is ALREADY using generic patterns for non-project entities!**

The master plan NEVER shows:

- `writer.plan.chapter_planning` ❌
- `coach.deliverable.session_notes` ❌
- `developer.doc.tech_spec` ❌

All non-project entities use generic types.

---

## 6. INCONSISTENCY TO FIX

### 6.1 Deliverable vs Output Naming

**Master Plan Says**: `deliverable.chapter`, `deliverable.design`
**Actual Migration Uses**: `output.chapter`, `output.design`
**Database Table**: `onto_outputs` (not `onto_deliverables`)

**Recommendation**: Standardize on **"output"** because:

1. ✅ Already implemented in migrations
2. ✅ Database table is `onto_outputs`
3. ✅ More accurate (outputs vs deliverables has connotation differences)
4. ✅ Shorter to type

**Action**: Update master plan to use `output.*` pattern consistently.

---

## 7. RECOMMENDED TASK TEMPLATES (Updated)

### 7.1 Task Template Hierarchy

**Pattern**: `task.{type}` (generic, reusable)

```
task.base (abstract)
  ├→ task.quick (5-30min, simple completion)
  ├→ task.deep_work (1-4hr, focused work)
  ├→ task.meeting_prep (prep for meetings)
  ├→ task.research (information gathering)
  ├→ task.writing (content creation)
  ├→ task.coding (software development)
  ├→ task.review (reviewing work)
  ├→ task.recurring (repeating tasks)
  └→ task.milestone (critical deliverables)
```

**Note**: `task.writing` and `task.coding` are **generic work patterns**, not domain-specific. They describe the **nature of work**, not the **actor doing it**.

Compare:

- ❌ `writer.task.writing` (redundant domain)
- ✅ `task.writing` (generic work type)

A writer might do `task.research`, `task.writing`, AND `task.review` tasks.
A developer might do `task.coding`, `task.review`, AND `task.writing` (documentation) tasks.

**The task type describes WHAT KIND OF WORK, not WHO IS DOING IT.**

---

## 8. RECOMMENDED GOAL TEMPLATES (Updated)

### 8.1 Goal Template Hierarchy

**Pattern**: `goal.{type}` (generic, reusable)

```
goal.base (abstract)
  ├→ goal.outcome (achieve specific result)
  ├→ goal.learning (acquire skills/knowledge)
  ├→ goal.behavior (change habits)
  └→ goal.metric (reach numeric target)
```

**Works for all domains**:

- Writer: `goal.outcome` = "Finish book manuscript"
- Coach: `goal.outcome` = "Help client achieve promotion"
- Developer: `goal.outcome` = "Launch v2.0"
- Student: `goal.learning` = "Master calculus"

---

## 9. RECOMMENDED PLAN TEMPLATES (Updated)

### 9.1 Plan Template Hierarchy

**Pattern**: `plan.{type}` (generic, reusable)

```
plan.weekly              ✅ Generic time-box (already seeded)
plan.sprint              ✅ Generic agile cycle (already seeded)
plan.content_calendar    ✅ Generic content planning
plan.client_onboarding   ✅ Generic onboarding flow
plan.product_roadmap     ✅ Generic product planning
plan.monthly             ✅ Generic time-box
plan.quarterly           ✅ Generic time-box (OKRs)
```

**Works for all domains**:

- Writer: Uses `plan.content_calendar` for blog posts
- Coach: Uses `plan.client_onboarding` for new clients
- Developer: Uses `plan.sprint` for development cycles
- Founder: Uses `plan.quarterly` for OKR planning

---

## 10. EDGE CASES & EXCEPTIONS

### 10.1 When Might Domain-Specific Child Entities Make Sense?

**Rare exceptions where domain-specific types might be justified**:

1. **Highly specialized workflows** with unique schema/FSM
    - Example: `coach.session` as a special task type with session notes, prep, follow-up
    - But could also be: `task.coaching_session` (still generic, multiple coaches could use it)

2. **Regulated/compliance-driven workflows**
    - Example: `legal.contract_review` with specific legal requirements
    - But could also be: `task.legal_review` (generic legal work pattern)

**Decision criteria**:

- ✅ Use domain-specific IF: Radically different schema AND only one domain uses it
- ❌ Keep generic IF: Multiple domains could use the pattern

**Recommendation**: Start generic, only create domain-specific when proven necessary by usage patterns.

---

## 11. VALIDATION & CONSTRAINTS

### 11.1 Type Key Format Validation

**Projects**: `^{domain}\.{deliverable}(\.{variant})?$`

- Regex: `^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$`
- Examples: `writer.book`, `coach.client.executive`

**All Other Entities**: `^{scope}\.{type}$`

- Regex: `^[a-z_]+\.[a-z_]+$`
- Examples: `task.quick`, `plan.weekly`, `goal.outcome`

**Implementation**:

```sql
-- Projects can have 2 or 3 levels (domain.deliverable OR domain.deliverable.variant)
ALTER TABLE onto_projects ADD CONSTRAINT chk_project_type_key_format
  CHECK (type_key ~ '^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$');

-- Other entities should have exactly 2 levels (scope.type)
ALTER TABLE onto_tasks ADD CONSTRAINT chk_task_type_key_format
  CHECK (type_key ~ '^task\.[a-z_]+$');

ALTER TABLE onto_plans ADD CONSTRAINT chk_plan_type_key_format
  CHECK (type_key ~ '^plan\.[a-z_]+$');

ALTER TABLE onto_goals ADD CONSTRAINT chk_goal_type_key_format
  CHECK (type_key ~ '^goal\.[a-z_]+$');

ALTER TABLE onto_outputs ADD CONSTRAINT chk_output_type_key_format
  CHECK (type_key ~ '^output\.[a-z_]+$');
```

---

## 12. MIGRATION STRATEGY

### 12.1 Template Type Key Updates

**No changes needed!** Current migration already follows correct pattern:

**Projects** (domain-specific):

```sql
('project', 'writer.book', ...)         ✅ Correct
('project', 'coach.client', ...)        ✅ Correct
('project', 'developer.app', ...)       ✅ Correct
```

**Plans** (generic):

```sql
('plan', 'plan.weekly', ...)            ✅ Correct
('plan', 'plan.sprint', ...)            ✅ Correct
```

**Outputs** (generic):

```sql
('output', 'output.chapter', ...)       ✅ Correct (but master plan says "deliverable")
('output', 'output.design', ...)        ✅ Correct
```

**Documents** (generic):

```sql
('document', 'doc.brief', ...)          ✅ Correct
('document', 'doc.notes', ...)          ✅ Correct
```

### 12.2 New Templates to Add

**Tasks** (generic):

```sql
('task', 'task.base', ...)              ✅ Add
('task', 'task.quick', ...)             ✅ Add
('task', 'task.deep_work', ...)         ✅ Add
('task', 'task.recurring', ...)         ✅ Add
('task', 'task.milestone', ...)         ✅ Add
```

**Goals** (generic):

```sql
('goal', 'goal.base', ...)              ✅ Add
('goal', 'goal.outcome', ...)           ✅ Add
('goal', 'goal.learning', ...)          ✅ Add
('goal', 'goal.behavior', ...)          ✅ Add
('goal', 'goal.metric', ...)            ✅ Add
```

---

## 13. SUMMARY & DECISION

### 13.1 Core Principles

1. **Projects are domain-specific** (`writer.book`, `coach.client`)
    - They represent the actor's perspective on their work
    - They are top-level containers

2. **Everything else is generic** (`task.quick`, `plan.weekly`, `goal.outcome`)
    - They inherit domain context from parent project
    - They are reusable across all domains
    - They describe work patterns, not actor perspectives

3. **Domain context flows through relationships**, not naming
    - Task knows its domain via `project_id` → project's `type_key`
    - No need to repeat domain in task's `type_key`

### 13.2 Final Recommendations

✅ **DO**:

- Use `{domain}.{deliverable}[.{variant}]` for **projects only**
- Use `{scope}.{type}` for all other entities (task, plan, goal, output, doc)
- Let domain context flow through relationships
- Keep templates generic and reusable

❌ **DON'T**:

- Use `writer.task.writing` or `developer.task.coding`
- Create domain-specific variants of generic work patterns
- Duplicate templates across domains unnecessarily
- Mix domain naming patterns inconsistently

### 13.3 Pattern Reference Card

```
✅ CORRECT PATTERNS:
project:    writer.book
plan:       plan.weekly
task:       task.deep_work
goal:       goal.outcome
output:     output.chapter
document:   doc.brief

❌ INCORRECT PATTERNS:
project:    book.writer                  (wrong perspective)
plan:       writer.plan.weekly           (unnecessary domain)
task:       writer.task.writing          (redundant domain)
goal:       writer.goal.book_completion  (wrong scope)
output:     writer.output.chapter        (unnecessary domain)
document:   writer.doc.notes             (unnecessary domain)
```

---

## 14. ACTION ITEMS

1. ✅ **Confirm naming convention**: Use generic patterns for tasks, goals, plans
2. ✅ **Update template designs**: Remove domain prefixes from task/goal templates
3. ✅ **Add validation constraints**: Enforce pattern per entity type
4. ✅ **Update master plan** (future): Change "deliverable._" to "output._" for consistency
5. ✅ **Document pattern clearly**: Add to developer guidelines

---

**End of Analysis**

Generated: 2025-11-04
Purpose: Clarify and standardize naming conventions across all ontology entity types
Decision: Generic patterns for all non-project entities
