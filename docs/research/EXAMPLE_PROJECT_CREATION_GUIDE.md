<!-- docs/research/EXAMPLE_PROJECT_CREATION_GUIDE.md -->

# Example Project Creation Guide

## Overview

This guide documents the process for creating historically accurate, deeply-nested ontology example projects for BuildOS. These projects serve as public demonstrations of the platform's capabilities.

---

## Phase 1: Project Selection

### Selection Criteria

Choose projects that have:

| Criterion                 | Why It Matters            | Example                                |
| ------------------------- | ------------------------- | -------------------------------------- |
| **Clear goals**           | Maps to `onto_goals`      | "Win independence", "Land on the moon" |
| **Defined milestones**    | Maps to `onto_milestones` | Battles, launches, releases            |
| **Complex planning**      | Maps to `onto_plans`      | Campaigns, phases, sprints             |
| **Actionable tasks**      | Maps to `onto_tasks`      | Build X, recruit Y, test Z             |
| **Critical decisions**    | Maps to `onto_decisions`  | Technology choices, personnel          |
| **Known risks**           | Maps to `onto_risks`      | Weather, funding, enemies              |
| **Documentary evidence**  | Maps to `onto_documents`  | Letters, reports, specs                |
| **Rich interconnections** | Maps to `onto_edges`      | Causal chains, dependencies            |

### Recommended Project Categories

#### Historical/Military

- **Apollo Program** (1961-1972) - Space race, engineering, risk management
- **D-Day Invasion** (1944) - Logistics, deception, coordination
- **Manhattan Project** (1942-1946) - Science, secrecy, ethics
- **Lewis & Clark Expedition** (1804-1806) - Exploration, diplomacy, survival

#### Business/Startup

- **Apple Macintosh Launch** (1984) - Product development, marketing
- **SpaceX Falcon 9 Development** - Iterative engineering, failures to success
- **Netflix Pivot to Streaming** (2007-2013) - Business transformation

#### Construction/Engineering

- **Empire State Building** (1930-1931) - Fast-track construction
- **Panama Canal** (1904-1914) - Engineering challenges, disease control
- **Sydney Opera House** (1959-1973) - Design evolution, budget overruns

#### Creative/Entertainment

- **Lord of the Rings Film Trilogy** (1997-2003) - Production, adaptation
- **Hamilton Musical** (2009-2015) - Creation to Broadway

#### Technology

- **Linux Kernel Development** (1991-present) - Open source, collaboration
- **iPhone Development** (2004-2007) - Secrecy, integration, launch

---

## Phase 2: Research Process

### Step 1: Initial Research Queries

Use Perplexity or similar research tools with structured queries:

```
Query Template:
"[PROJECT NAME] [ASPECT] detailed timeline with specific dates,
key personnel, decisions made, and outcomes"
```

**Essential Research Topics:**

1. **Chronological Timeline**
    - "Apollo program complete timeline 1961-1972 with all missions"

2. **Key Personnel & Decisions**
    - "Apollo program key decisions by NASA leadership"
    - "Who made critical technology choices for Apollo"

3. **Risks and Failures**
    - "Apollo program failures and near-disasters"
    - "What risks did Apollo planners identify"

4. **Documentary Sources**
    - "Primary source documents from Apollo program"
    - "Famous speeches and memos from Apollo era"

5. **Causal Relationships**
    - "How Apollo 1 fire changed Apollo program"
    - "What enabled Apollo 11 success"

### Step 2: Create Research Document

Create timestamped research doc:

```
/docs/research/YYYY-MM-DD_[project_slug]_research.md
```

**Required Sections:**

```markdown
---
type: research
project: [Project Name]
created: YYYY-MM-DD
status: in_progress
---

# [Project Name] Research

## Executive Summary

[2-3 paragraph overview]

## Goals (Strategic Objectives)

List 5-8 high-level goals with:

- Goal name
- Strategic importance
- Success criteria
- Historical outcome

## Milestones (Key Events/Achievements)

For each goal, list 5-10 milestones with:

- Date
- Name
- Description
- Outcome (achieved/failed/partial)
- Key personnel
- Connected milestones (causal chains)

## Plans (Operational Approaches)

For each milestone, identify:

- Planning phases
- Sub-plans
- Resource allocation
- Timeline

## Tasks (Specific Actions)

Granular work items:

- Task description
- Assignee/responsible party
- Dependencies
- Completion status

## Decisions (Critical Choices)

Document key decisions:

- Decision context
- Options considered
- Choice made
- Rationale
- Outcome
- Decision-maker

## Risks (Identified Threats)

For each major risk:

- Risk description
- Probability assessment
- Impact level
- Mitigation strategy
- Actual outcome (occurred/mitigated/avoided)

## Documents (Primary Sources)

Key documents:

- Title
- Date
- Author
- Significance
- Notable quotes

## Cross-Cutting Relationships

Map causal chains:

- [Event A] enabled [Event B]
- [Decision X] led to [Outcome Y]
- [Risk Z] occurred, causing [Consequence]
```

### Step 3: Validate Research

- Cross-reference multiple sources
- Verify dates and names
- Check for disputed facts (note controversies)
- Ensure quotes are accurate and attributed

---

## Phase 3: Entity Mapping

### UUID Structure Convention

Use consistent UUID patterns for easy identification:

```
Project:     11111111-1111-1111-1111-111111111111
System User: 00000000-0000-0000-0000-000000000002

Goals:       22221111-[GOAL#]-0000-0000-000000000001
Milestones:  33331111-[GOAL#]-[MILE#]-0000-000000000001
Plans:       44441111-[GOAL#]-[MILE#]-[PLAN#]-000000000001
Sub-Plans:   44441111-[GOAL#]-[MILE#]-[PLAN#]-[SUB#]00001
Tasks:       55551111-[GOAL#]-[MILE#]-[TASK#]-000000000001
Decisions:   66661111-[GOAL#]-[MILE#]-[DEC#]-000000000001
Risks:       77771111-[GOAL#]-[MILE#]-[RISK#]-000000000001
Documents:   88881111-[GOAL#]-[MILE#]-[DOC#]-000000000001
```

### Entity Count Targets

For a comprehensive example project:

| Entity Type | Target Count | Notes                  |
| ----------- | ------------ | ---------------------- |
| Goals       | 5-8          | Strategic objectives   |
| Milestones  | 40-60        | Key events per goal    |
| Plans       | 20-30        | Operational approaches |
| Tasks       | 60-80        | Granular work items    |
| Decisions   | 12-20        | Critical choices       |
| Risks       | 12-20        | Identified threats     |
| Documents   | 12-20        | Primary sources        |
| Edges       | 150-200+     | All relationships      |

### Graph Relationship Types

**Standard Edge Types:**

```sql
-- Hierarchical (parent-child)
'has'        -- Project has Goal, Goal has Milestone
'contains'   -- Plan contains Tasks

-- Causal
'enabled'    -- Victory A enabled Victory B
'led_to'     -- Decision X led to Outcome Y
'caused'     -- Risk occurrence caused Impact

-- Associative
'documents'  -- Document documents Milestone
'mitigates'  -- Plan mitigates Risk
'informs'    -- Decision informs Plan
```

---

## Phase 3.5: Database Schema Reference (CRITICAL)

**IMPORTANT:** Always use these exact column definitions when creating INSERT statements. Incorrect column names will cause migration failures.

### Projects (`projects` table)

```sql
INSERT INTO projects (
  id,
  org_id,           -- Organization ID (use '00000000-0000-0000-0000-000000000001' for system)
  name,
  description,
  type_key,         -- e.g., 'project.historical', 'project.software'
  state_key,        -- e.g., 'active', 'completed', 'archived'
  props,            -- JSONB for additional metadata
  start_at,         -- Start date as timestamptz
  end_at,           -- End date as timestamptz
  is_public,        -- TRUE for public example projects
  created_by        -- User UUID
) VALUES (...);
```

### Goals (`onto_goals` table)

```sql
INSERT INTO onto_goals (
  id,
  project_id,
  name,
  description,
  type_key,         -- e.g., 'goal.strategic', 'goal.operational'
  state_key,        -- e.g., 'active', 'achieved', 'abandoned'
  props,            -- JSONB for additional metadata
  created_by
) VALUES (...);
```

### Milestones (`onto_milestones` table)

```sql
INSERT INTO onto_milestones (
  id,
  project_id,
  title,            -- NOT 'name'!
  type_key,         -- e.g., 'milestone.launch', 'milestone.achievement'
  due_at,           -- Date as timestamptz (NOT 'state_key'!)
  props,            -- JSONB - can include {"state": "achieved"} for status
  created_by
) VALUES (...);

-- Example:
('33331111-0001-0001-0000-000000000001', '[PROJECT_UUID]',
 'Apollo 11 Moon Landing', 'milestone.achievement',
 '1969-07-20'::timestamptz,
 '{"state": "achieved", "description": "First humans walk on the Moon"}',
 '[USER_UUID]');
```

### Plans (`onto_plans` table)

```sql
INSERT INTO onto_plans (
  id,
  project_id,
  name,
  description,
  type_key,         -- e.g., 'plan.phase', 'plan.sprint'
  state_key,        -- e.g., 'draft', 'active', 'completed', 'abandoned'
  props,
  created_by
) VALUES (...);
```

### Tasks (`onto_tasks` table)

```sql
INSERT INTO onto_tasks (
  id,
  project_id,
  type_key,         -- e.g., 'task.engineering', 'task.testing'
  title,            -- NOT 'name'!
  state_key,        -- e.g., 'todo', 'in_progress', 'done', 'blocked'
  priority,         -- Integer priority (1-5, where 1 is highest)
  due_at,           -- Date as timestamptz
  props,            -- JSONB for additional metadata
  created_by
) VALUES (...);

-- Example:
('55551111-0001-0001-0001-000000000001', '[PROJECT_UUID]',
 'task.engineering', 'Design lunar module descent stage',
 'done', 1, '1966-06-01'::timestamptz,
 '{"assignee": "Grumman Aerospace", "description": "..."}',
 '[USER_UUID]');
```

### Decisions (`onto_decisions` table)

```sql
INSERT INTO onto_decisions (
  id,
  project_id,
  title,            -- NOT 'name'! NO 'type_key' or 'state_key'!
  decision_at,      -- Date decision was made as timestamptz
  rationale,        -- Text explaining the decision rationale
  props,            -- JSONB - include {"type": "decision.xxx"} here
  created_by
) VALUES (...);

-- Example:
('66661111-0001-0001-0001-000000000001', '[PROJECT_UUID]',
 'Lunar Orbit Rendezvous Selection',
 '1962-07-11'::timestamptz,
 'LOR selected over direct ascent and Earth orbit rendezvous due to weight savings',
 '{"type": "decision.technical", "state": "decided", "decided_by": "NASA Leadership"}',
 '[USER_UUID]');
```

### Risks (`onto_risks` table)

```sql
INSERT INTO onto_risks (
  id,
  project_id,
  title,            -- NOT 'name'!
  type_key,         -- e.g., 'risk.technical', 'risk.safety'
  probability,      -- NUMERIC 0.0 to 1.0 (e.g., 0.3 for 30% chance)
  impact,           -- NOT 'severity'! Text: 'low', 'medium', 'high', 'critical'
  state_key,        -- e.g., 'identified', 'mitigated', 'occurred', 'closed'
  props,
  created_by
) VALUES (...);

-- Example:
('77771111-0001-0001-0001-000000000001', '[PROJECT_UUID]',
 'Spacecraft Fire Risk', 'risk.safety',
 0.2, 'critical', 'occurred',
 '{"description": "Pure oxygen atmosphere fire risk", "mitigation": "Redesigned atmosphere mix"}',
 '[USER_UUID]');
```

### Documents (`onto_documents` table)

```sql
INSERT INTO onto_documents (
  id,
  project_id,
  title,            -- NOT 'name'! Documents use 'title'
  type_key,         -- e.g., 'document.speech', 'document.memo', 'document.report'
  state_key,        -- e.g., 'draft', 'review', 'published'
  props,            -- JSONB for document content and metadata
  created_by
) VALUES (...);
```

### Edges (`onto_edges` table)

**IMPORTANT:** The `onto_edges` table does NOT have `id` or `created_by` columns. IDs are auto-generated.

```sql
INSERT INTO onto_edges (
  src_kind,         -- e.g., 'project', 'goal', 'milestone', 'plan', 'task', 'decision', 'risk', 'document'
  src_id,
  rel,              -- Relationship type: 'has', 'contains', 'enabled', 'led_to', 'caused', 'documents', 'mitigates', 'informs'
  dst_kind,
  dst_id,
  project_id,
  props
) VALUES (...);

-- Example:
('project', '11111111-1111-1111-1111-111111111111', 'has', 'goal', '22221111-0001-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('goal', '22221111-0001-0000-0000-000000000001', 'has', 'milestone', '33331111-0001-0001-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{}'::jsonb),
('milestone', '33331111-0001-0001-0000-000000000001', 'enabled', 'milestone', '33331111-0001-0002-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"description": "Event A enabled Event B"}'::jsonb);
```

### Common Mistakes to Avoid

| Wrong                                       | Correct                              | Entity                              |
| ------------------------------------------- | ------------------------------------ | ----------------------------------- |
| `name`                                      | `title`                              | milestones, tasks, decisions, risks |
| `state_key` (for date)                      | `due_at`                             | milestones                          |
| `severity`                                  | `impact`                             | risks                               |
| `type_key` in decisions                     | Put in `props` as `{"type": "..."}`  | decisions                           |
| `state_key` in decisions                    | Put in `props` as `{"state": "..."}` | decisions                           |
| Missing `org_id`                            | Always include                       | projects                            |
| Missing `priority`                          | Required field                       | tasks                               |
| `id` column in edges                        | Auto-generated, omit it              | edges                               |
| `created_by` in edges                       | Column doesn't exist                 | edges                               |
| `'high'`/`'medium'`/`'low'` for probability | Use numeric (0.8, 0.5, 0.2)          | risks                               |

### Valid Enum Values (CRITICAL)

**Always use these exact values - invalid enums will cause migration failures:**

| Enum Type         | Valid Values                                               |
| ----------------- | ---------------------------------------------------------- |
| `task_state`      | `'todo'`, `'in_progress'`, `'blocked'`, `'done'`           |
| `decision_state`  | `'pending'`, `'decided'`, `'revisited'`                    |
| `risk_state`      | `'identified'`, `'mitigated'`, `'occurred'`, `'closed'`    |
| `document_state`  | `'draft'`, `'review'`, `'published'`                       |
| `milestone_state` | `'pending'`, `'in_progress'`, `'completed'`, `'missed'`    |
| `goal_state`      | `'draft'`, `'active'`, `'achieved'`, `'abandoned'`         |
| `plan_state`      | `'draft'`, `'active'`, `'completed'`                       |
| `project_state`   | `'planning'`, `'active'`, `'completed'`, `'cancelled'`     |
| `output_state`    | `'draft'`, `'in_progress'`, `'review'`, `'published'`      |

**Important Column Types:**

- `probability` in `onto_risks` is **NUMERIC** (0.0 to 1.0), NOT text
- `impact` in `onto_risks` is **TEXT** ('low', 'medium', 'high', 'critical')

**Common Invalid Values:**

- ❌ `'abandoned'` for plans → use `'completed'` with `{"status": "abandoned"}` in props
- ❌ `'accepted'` → use `'mitigated'` or `'closed'` for risks
- ❌ `'archived'` → use `'published'` for documents
- ❌ `'complete'` → use `'done'` for tasks, `'completed'` for plans
- ❌ `'approved'` → use `'decided'` for decisions
- ❌ `'high'` for probability → use numeric like `0.8`
- ❌ `'not_started'` for milestones → use `'pending'`
- ❌ `'achieved'` for milestones → use `'completed'` (put "achieved" in props if needed)
- ❌ `'active'` for goals without `'draft'` first → goals start at `'draft'` by default

---

## Phase 4: Migration File Creation

### File Naming Convention

```
supabase/migrations/YYYYMMDD_seed_[project_slug]_example_project.sql
```

### Migration File Structure

```sql
-- supabase/migrations/YYYYMMDD_seed_[project_slug]_example_project.sql
-- ============================================
-- [Project Name] Example Project
-- [Brief description]
-- ============================================
-- Version X.0
--
-- DESIGN PRINCIPLE: Deeply nested graph
-- [Document the hierarchy]

-- ============================================
-- SCHEMA EXTENSIONS (if needed)
-- ============================================
-- Add any columns needed for this project type

-- ============================================
-- CLEANUP (for idempotent re-runs)
-- ============================================
DELETE FROM onto_edges WHERE project_id = '[PROJECT_UUID]';
DELETE FROM onto_tasks WHERE project_id = '[PROJECT_UUID]';
DELETE FROM onto_documents WHERE project_id = '[PROJECT_UUID]';
DELETE FROM onto_decisions WHERE project_id = '[PROJECT_UUID]';
DELETE FROM onto_risks WHERE project_id = '[PROJECT_UUID]';
DELETE FROM onto_plans WHERE project_id = '[PROJECT_UUID]';
DELETE FROM onto_milestones WHERE project_id = '[PROJECT_UUID]';
DELETE FROM onto_goals WHERE project_id = '[PROJECT_UUID]';
DELETE FROM projects WHERE id = '[PROJECT_UUID]';

-- ============================================
-- PROJECT
-- ============================================
INSERT INTO projects (id, name, description, ..., is_public) VALUES
(..., TRUE);  -- Mark as public for homepage display

-- ============================================
-- GOALS
-- ============================================
INSERT INTO onto_goals (...) VALUES
...;

-- ============================================
-- MILESTONES
-- [Organize by Goal]
-- ============================================

-- Goal 1: [Name]
INSERT INTO onto_milestones (...) VALUES
...;

-- Goal 2: [Name]
...

-- ============================================
-- PLANS
-- ============================================

-- ============================================
-- TASKS
-- ============================================

-- ============================================
-- DECISIONS
-- ============================================

-- ============================================
-- RISKS
-- ============================================

-- ============================================
-- DOCUMENTS
-- ============================================

-- ============================================
-- GRAPH EDGES
-- ============================================

-- Project → Goals
INSERT INTO onto_edges (...) VALUES
...;

-- Goals → Milestones
...

-- Cross-cutting relationships
...

-- ============================================
-- COMPLETION NOTICE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE '[Project Name] - vX.0';
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'ENTITY COUNTS:';
  RAISE NOTICE '  - X Goals';
  RAISE NOTICE '  - X Milestones';
  ...
END$$;
```

### Valid Enum Values Reference

Always check current enum definitions before creating entities:

```sql
-- task_state: 'todo', 'in_progress', 'blocked', 'done'
-- decision_state: 'pending', 'decided', 'revisited'
-- risk_state: 'identified', 'mitigated', 'occurred', 'closed'
-- document_state: 'draft', 'review', 'published'
-- milestone_state: 'pending', 'in_progress', 'completed', 'missed'
-- goal_state: 'draft', 'active', 'achieved', 'abandoned'
-- plan_state: 'draft', 'active', 'completed'
-- project_state: 'planning', 'active', 'completed', 'cancelled'
-- output_state: 'draft', 'in_progress', 'review', 'published'
```

---

## Phase 5: Testing & Validation

### Pre-Deployment Checklist

- [ ] All UUIDs are unique and follow convention
- [ ] All enum values are valid
- [ ] All foreign key references exist
- [ ] No orphaned entities (everything connected via edges)
- [ ] `is_public = TRUE` set on project
- [ ] Cleanup migration created for re-runs
- [ ] Entity counts documented in completion notice

### Test Queries

```sql
-- Verify entity counts
SELECT 'goals' as type, COUNT(*) FROM onto_goals WHERE project_id = '[UUID]'
UNION ALL
SELECT 'milestones', COUNT(*) FROM onto_milestones WHERE project_id = '[UUID]'
UNION ALL
SELECT 'plans', COUNT(*) FROM onto_plans WHERE project_id = '[UUID]'
UNION ALL
SELECT 'tasks', COUNT(*) FROM onto_tasks WHERE project_id = '[UUID]'
UNION ALL
SELECT 'decisions', COUNT(*) FROM onto_decisions WHERE project_id = '[UUID]'
UNION ALL
SELECT 'risks', COUNT(*) FROM onto_risks WHERE project_id = '[UUID]'
UNION ALL
SELECT 'documents', COUNT(*) FROM onto_documents WHERE project_id = '[UUID]'
UNION ALL
SELECT 'edges', COUNT(*) FROM onto_edges WHERE project_id = '[UUID]';

-- Verify graph connectivity
SELECT src_kind, rel, dst_kind, COUNT(*)
FROM onto_edges
WHERE project_id = '[UUID]'
GROUP BY src_kind, rel, dst_kind
ORDER BY src_kind, rel;

-- Find orphaned milestones (no edge from goal)
SELECT m.id, m.name
FROM onto_milestones m
WHERE m.project_id = '[UUID]'
AND NOT EXISTS (
  SELECT 1 FROM onto_edges e
  WHERE e.dst_id = m.id
  AND e.dst_kind = 'milestone'
  AND e.src_kind = 'goal'
);
```

---

## Phase 6: Recommended Next Projects

### Tier 1: High Priority (Rich Documentation, Clear Structure)

1. **Apollo Program (1961-1972)**
    - Project UUID: `22222222-2222-2222-2222-222222222222`
    - Goals: Land on Moon, Beat Soviets, Advance Technology, Ensure Safety
    - Rich in: Decisions, risks, technical milestones, famous documents

2. **D-Day Invasion (1944)**
    - Project UUID: `33333333-3333-3333-3333-333333333333`
    - Goals: Establish beachhead, Deception (Fortitude), Air superiority
    - Rich in: Planning, logistics, risks, coordination

3. **Manhattan Project (1942-1946)**
    - Project UUID: `44444444-4444-4444-4444-444444444444`
    - Goals: Build atomic bomb, Maintain secrecy, Beat Germany
    - Rich in: Decisions, risks, scientific milestones, ethics

### Tier 2: Medium Priority (Good Structure, Moderate Documentation)

4. **Lewis & Clark Expedition (1804-1806)**
5. **Panama Canal Construction (1904-1914)**
6. **SpaceX Falcon 9 Development (2005-2015)**

### Tier 3: Future Consideration

7. **iPhone Development (2004-2007)**
8. **Lord of the Rings Film Trilogy (1997-2003)**
9. **Linux Kernel 1.0 (1991-1994)**

---

## Appendix: Research Query Templates

### For Military/Historical Projects

```
"[Battle/Campaign] order of battle commanders units"
"[Battle/Campaign] timeline hour by hour"
"[Leader] letters correspondence about [event]"
"[War] logistics supply chain challenges"
"[Campaign] intelligence operations spies"
"[Battle] casualties outcomes strategic significance"
```

### For Technology Projects

```
"[Product] development timeline key milestones"
"[Company] internal decisions about [product]"
"[Product] technical challenges engineering problems"
"[Launch] marketing strategy preparation"
"[Product] what almost went wrong near failures"
```

### For Construction/Engineering

```
"[Project] construction phases timeline"
"[Project] engineering challenges solutions"
"[Project] budget overruns cost increases"
"[Project] safety incidents accidents"
"[Project] key personnel architects engineers"
```

---

## Phase 7: UI Display Configuration

### Project Commander Display

The `ExampleProjectGraph` component on the landing page displays a "Led by [Commander]" line under the project title. Commanders are **hardcoded by project ID** in the component.

**File Location:** `apps/web/src/lib/components/landing/ExampleProjectGraph.svelte`

When creating a new example project, you must add the commander to the `PROJECT_COMMANDERS` map:

```typescript
// In ExampleProjectGraph.svelte
const PROJECT_COMMANDERS: Record<string, string> = {
	'11111111-1111-1111-1111-111111111111': 'General George Washington', // Washington Campaign
	'22222222-2222-2222-2222-222222222222': 'NASA Administrator James E. Webb', // Apollo Program
	'33333333-3333-3333-3333-333333333333': 'Dr. Ryland Grace', // Project Hail Mary
	'44444444-4444-4444-4444-444444444444': 'George R.R. Martin', // ASOIAF Writing
	'55555555-5555-5555-5555-555555555555': 'Sarah J. Maas', // ACOTAR Writing
	'66666666-6666-6666-6666-666666666666': 'Brigadier General Leslie R. Groves' // Manhattan Project
};
```

**Fallback Behavior:** If the project ID is not in the hardcoded map, the component falls back to checking `props.commander` from the project data.

### Current Example Projects

| Project             | UUID                                   | Commander                             |
| ------------------- | -------------------------------------- | ------------------------------------- |
| Washington Campaign | `11111111-1111-1111-1111-111111111111` | General George Washington             |
| Apollo Program      | `22222222-2222-2222-2222-222222222222` | NASA Administrator James E. Webb      |
| Project Hail Mary   | `33333333-3333-3333-3333-333333333333` | Dr. Ryland Grace                      |
| ASOIAF Writing      | `44444444-4444-4444-4444-444444444444` | George R.R. Martin                    |
| ACOTAR Writing      | `55555555-5555-5555-5555-555555555555` | Sarah J. Maas                         |
| Manhattan Project   | `66666666-6666-6666-6666-666666666666` | Brigadier General Leslie R. Groves    |

---

## Version History

| Version | Date       | Changes                                                                                                                       |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2024-12-20 | Initial guide based on Washington project                                                                                     |
| 1.1     | 2024-12-20 | Added Phase 3.5: Database Schema Reference with correct column definitions for all entity types                               |
| 1.2     | 2024-12-20 | Added Phase 7: UI Display Configuration for project commanders                                                                |
| 1.3     | 2024-12-21 | Fixed `onto_edges` schema: no `id` or `created_by` columns; fixed `onto_risks.probability` must be numeric (0.0-1.0) not text |
| 1.4     | 2024-12-21 | Fixed enum values: `milestone_state` uses `pending`/`completed` not `not_started`/`achieved`; `goal_state` includes `draft`; added `project_state` and `output_state` enums; added ACOTAR and Manhattan Project examples |
