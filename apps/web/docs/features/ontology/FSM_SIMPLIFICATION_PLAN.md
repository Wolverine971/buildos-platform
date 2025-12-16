<!-- apps/web/docs/features/ontology/FSM_SIMPLIFICATION_PLAN.md -->

# FSM Simplification Plan: From State Machines to Simple Enums

**Created**: December 12, 2025
**Status**: 🚧 IN PROGRESS
**Author**: Claude Code

---

## Executive Summary

This document outlines the plan to simplify the BuildOS ontology state management from a complex FSM (Finite State Machine) system to simple database enums. The FSM machinery was designed for template-driven workflows, but with templates removed, every entity type uses the same static states - making the FSM unnecessary overhead.

---

## Current State (Problems)

### 1. Broken Migration

The `20251213_fix_get_allowed_transitions_for_tasks.sql` migration queries `onto_templates` table which was dropped in `20251212_drop_template_system.sql`. Result: `get_allowed_transitions` returns nothing.

### 2. Disabled FSM Engine

`engine.ts:96-99` returns an error: "FSM execution no longer supported without template system". The FSM is effectively dead code.

### 3. Unnecessary Complexity

- Guards array is always `[]` in hardcoded transitions
- Actions never execute (engine disabled)
- Transition events provide no value without guards/actions
- Database RPC calls for simple state changes

### 4. UI Already Using Fallback

When `allowedTransitions` is empty, components like `TaskEditModal.svelte` fall back to simple `<Select>` dropdowns.

---

## Target State (Solution)

### Simple State Enums Per Entity Type

| Entity        | States                                          | Default      |
| ------------- | ----------------------------------------------- | ------------ |
| **Task**      | `todo`, `in_progress`, `blocked`, `done`        | `todo`       |
| **Project**   | `planning`, `active`, `completed`, `cancelled`  | `planning`   |
| **Plan**      | `draft`, `active`, `completed`                  | `draft`      |
| **Output**    | `draft`, `in_progress`, `review`, `published`   | `draft`      |
| **Document**  | `draft`, `review`, `published`                  | `draft`      |
| **Goal**      | `draft`, `active`, `achieved`, `abandoned`      | `draft`      |
| **Milestone** | `pending`, `in_progress`, `completed`, `missed` | `pending`    |
| **Risk**      | `identified`, `mitigated`, `occurred`, `closed` | `identified` |

---

## Implementation Plan

### Phase 1: Database Migration ✅

**File**: `supabase/migrations/YYYYMMDD_simplify_fsm_to_enums.sql`

1. Create PostgreSQL enums for each entity type
2. Migrate existing `state_key` varchar columns to enums
3. Drop `get_allowed_transitions` function
4. Drop `onto_guards_pass` function
5. Add CHECK constraints for valid states

### Phase 2: TypeScript Types

**Files to update**:

- `apps/web/src/lib/types/onto.ts` - Add state enums, remove FSM types
- `apps/web/src/lib/types/onto-api.ts` - Remove `AllowedTransitionResponse`
- `packages/shared-types/src/database.schema.ts` - Update state_key types

### Phase 3: Remove FSM Infrastructure

**Delete entirely**:

- `apps/web/src/lib/server/fsm/engine.ts`
- `apps/web/src/lib/server/fsm/actions/*.ts` (6 files)
- `apps/web/src/routes/api/onto/fsm/transitions/+server.ts`
- `apps/web/src/routes/api/onto/fsm/transition/+server.ts`
- `apps/web/src/lib/components/ontology/FSMStateVisualizer.svelte`
- `apps/web/src/lib/components/ontology/FSMStateBar.svelte`

### Phase 4: Update UI Components

**Modals to update** (replace FSMStateVisualizer with Select):

- `TaskEditModal.svelte`
- `PlanEditModal.svelte`
- `OutputEditModal.svelte`
- `GoalEditModal.svelte`
- `DocumentModal.svelte`
- `RiskEditModal.svelte`
- `MilestoneEditModal.svelte`
- `OntologyProjectHeader.svelte`

### Phase 5: Update API Routes

**Update state validation** in:

- `/api/onto/tasks/[id]/+server.ts`
- `/api/onto/plans/[id]/+server.ts`
- `/api/onto/outputs/[id]/+server.ts`
- `/api/onto/documents/[id]/+server.ts`
- `/api/onto/goals/[id]/+server.ts`
- `/api/onto/risks/[id]/+server.ts`
- `/api/onto/milestones/[id]/+server.ts`
- `/api/onto/projects/[id]/+server.ts`

**Remove transition fetching** from:

- `/api/onto/projects/[id]/+server.ts`
- `/api/onto/tasks/[id]/full/+server.ts`

### Phase 6: Update Services

**Remove FSM references** from:

- `instantiation.service.ts`
- `onto-event.service.ts`
- Agentic chat tool definitions

### Phase 7: Documentation Cleanup

**Update**:

- `TEMPLATE_REMOVAL_PROGRESS.md`
- `DATA_MODELS.md`
- `TEMPLATE_FREE_ONTOLOGY_SPEC.md`
- API documentation

---

## Detailed File Changes

### Files to DELETE (12 files)

```
apps/web/src/lib/server/fsm/
├── engine.ts                          # DELETE
├── actions/
│   ├── create-output.ts               # DELETE
│   ├── notify.ts                      # DELETE
│   ├── schedule-rrule.ts              # DELETE
│   ├── email-user.ts                  # DELETE
│   ├── email-admin.ts                 # DELETE
│   ├── run-llm-critique.ts            # DELETE
│   └── __tests__/utils.test.ts        # DELETE

apps/web/src/routes/api/onto/fsm/
├── transitions/+server.ts             # DELETE
└── transition/+server.ts              # DELETE

apps/web/src/lib/components/ontology/
├── FSMStateVisualizer.svelte          # DELETE
└── FSMStateBar.svelte                 # DELETE
```

### Files to UPDATE

#### Type Definitions

- `apps/web/src/lib/types/onto.ts` - Remove FSM schemas, add state enums
- `apps/web/src/lib/types/onto-api.ts` - Remove transition types
- `packages/shared-types/src/database.schema.ts` - Update state_key types

#### UI Components (8 files)

- Replace FSMStateVisualizer usage with Select dropdowns
- Remove transition loading/handling code

#### API Routes (10+ files)

- Remove `get_allowed_transitions` calls
- Add enum validation for state_key updates

---

## Migration Script

```sql
-- supabase/migrations/20251212_simplify_fsm_to_enums.sql

-- ============================================
-- STEP 1: Create state enums
-- ============================================

CREATE TYPE task_state AS ENUM ('todo', 'in_progress', 'blocked', 'done');
CREATE TYPE project_state AS ENUM ('planning', 'active', 'completed', 'cancelled');
CREATE TYPE plan_state AS ENUM ('draft', 'active', 'completed');
CREATE TYPE output_state AS ENUM ('draft', 'in_progress', 'review', 'published');
CREATE TYPE document_state AS ENUM ('draft', 'review', 'published');
CREATE TYPE goal_state AS ENUM ('draft', 'active', 'achieved', 'abandoned');
CREATE TYPE milestone_state AS ENUM ('pending', 'in_progress', 'completed', 'missed');
CREATE TYPE risk_state AS ENUM ('identified', 'mitigated', 'occurred', 'closed');

-- ============================================
-- STEP 2: Migrate existing data to enums
-- ============================================

-- Tasks: Map old states to new enum
ALTER TABLE onto_tasks
  ALTER COLUMN state_key TYPE task_state
  USING (
    CASE state_key
      WHEN 'todo' THEN 'todo'::task_state
      WHEN 'in_progress' THEN 'in_progress'::task_state
      WHEN 'blocked' THEN 'blocked'::task_state
      WHEN 'done' THEN 'done'::task_state
      WHEN 'completed' THEN 'done'::task_state  -- Alias
      WHEN 'archived' THEN 'done'::task_state   -- Map archived to done
      ELSE 'todo'::task_state  -- Default fallback
    END
  );

-- Projects
ALTER TABLE onto_projects
  ALTER COLUMN state_key TYPE project_state
  USING (
    CASE state_key
      WHEN 'planning' THEN 'planning'::project_state
      WHEN 'active' THEN 'active'::project_state
      WHEN 'completed' THEN 'completed'::project_state
      WHEN 'cancelled' THEN 'cancelled'::project_state
      ELSE 'planning'::project_state
    END
  );

-- Plans
ALTER TABLE onto_plans
  ALTER COLUMN state_key TYPE plan_state
  USING (
    CASE state_key
      WHEN 'draft' THEN 'draft'::plan_state
      WHEN 'active' THEN 'active'::plan_state
      WHEN 'completed' THEN 'completed'::plan_state
      ELSE 'draft'::plan_state
    END
  );

-- Outputs
ALTER TABLE onto_outputs
  ALTER COLUMN state_key TYPE output_state
  USING (
    CASE state_key
      WHEN 'draft' THEN 'draft'::output_state
      WHEN 'in_progress' THEN 'in_progress'::output_state
      WHEN 'review' THEN 'review'::output_state
      WHEN 'published' THEN 'published'::output_state
      ELSE 'draft'::output_state
    END
  );

-- Documents
ALTER TABLE onto_documents
  ALTER COLUMN state_key TYPE document_state
  USING (
    CASE COALESCE(state_key, 'draft')
      WHEN 'draft' THEN 'draft'::document_state
      WHEN 'review' THEN 'review'::document_state
      WHEN 'published' THEN 'published'::document_state
      ELSE 'draft'::document_state
    END
  );

-- Goals
ALTER TABLE onto_goals
  ALTER COLUMN state_key TYPE goal_state
  USING (
    CASE state_key
      WHEN 'draft' THEN 'draft'::goal_state
      WHEN 'active' THEN 'active'::goal_state
      WHEN 'achieved' THEN 'achieved'::goal_state
      WHEN 'abandoned' THEN 'abandoned'::goal_state
      WHEN 'completed' THEN 'achieved'::goal_state  -- Alias
      ELSE 'draft'::goal_state
    END
  );

-- Milestones
ALTER TABLE onto_milestones
  ALTER COLUMN state_key TYPE milestone_state
  USING (
    CASE state_key
      WHEN 'pending' THEN 'pending'::milestone_state
      WHEN 'in_progress' THEN 'in_progress'::milestone_state
      WHEN 'completed' THEN 'completed'::milestone_state
      WHEN 'missed' THEN 'missed'::milestone_state
      ELSE 'pending'::milestone_state
    END
  );

-- Risks
ALTER TABLE onto_risks
  ALTER COLUMN state_key TYPE risk_state
  USING (
    CASE state_key
      WHEN 'identified' THEN 'identified'::risk_state
      WHEN 'mitigated' THEN 'mitigated'::risk_state
      WHEN 'occurred' THEN 'occurred'::risk_state
      WHEN 'closed' THEN 'closed'::risk_state
      ELSE 'identified'::risk_state
    END
  );

-- ============================================
-- STEP 3: Set defaults
-- ============================================

ALTER TABLE onto_tasks ALTER COLUMN state_key SET DEFAULT 'todo'::task_state;
ALTER TABLE onto_projects ALTER COLUMN state_key SET DEFAULT 'planning'::project_state;
ALTER TABLE onto_plans ALTER COLUMN state_key SET DEFAULT 'draft'::plan_state;
ALTER TABLE onto_outputs ALTER COLUMN state_key SET DEFAULT 'draft'::output_state;
ALTER TABLE onto_documents ALTER COLUMN state_key SET DEFAULT 'draft'::document_state;
ALTER TABLE onto_goals ALTER COLUMN state_key SET DEFAULT 'draft'::goal_state;
ALTER TABLE onto_milestones ALTER COLUMN state_key SET DEFAULT 'pending'::milestone_state;
ALTER TABLE onto_risks ALTER COLUMN state_key SET DEFAULT 'identified'::risk_state;

-- ============================================
-- STEP 4: Drop FSM functions
-- ============================================

DROP FUNCTION IF EXISTS get_allowed_transitions(text, uuid);
DROP FUNCTION IF EXISTS onto_guards_pass(jsonb, jsonb);

-- ============================================
-- STEP 5: Add comments
-- ============================================

COMMENT ON TYPE task_state IS 'Valid states for tasks: todo → in_progress → done, or blocked';
COMMENT ON TYPE project_state IS 'Valid states for projects: planning → active → completed, or cancelled';
COMMENT ON TYPE plan_state IS 'Valid states for plans: draft → active → completed';
COMMENT ON TYPE output_state IS 'Valid states for outputs: draft → in_progress → review → published';
COMMENT ON TYPE document_state IS 'Valid states for documents: draft → review → published';
COMMENT ON TYPE goal_state IS 'Valid states for goals: draft → active → achieved, or abandoned';
COMMENT ON TYPE milestone_state IS 'Valid states for milestones: pending → in_progress → completed, or missed';
COMMENT ON TYPE risk_state IS 'Valid states for risks: identified → mitigated/occurred → closed';
```

---

## Rollback Plan

If issues arise, we can:

1. Re-create varchar columns from enums
2. Restore `get_allowed_transitions` from backup
3. Restore FSM engine files from git

```sql
-- Emergency rollback (if needed)
ALTER TABLE onto_tasks ALTER COLUMN state_key TYPE varchar USING state_key::text;
-- ... repeat for other tables
DROP TYPE IF EXISTS task_state, project_state, plan_state, output_state, document_state, goal_state, milestone_state, risk_state;
```

---

## Testing Plan

### Pre-migration

- [ ] Backup database
- [ ] Run migration on staging first
- [ ] Verify all existing state values map correctly

### Post-migration

- [ ] Create/update entities of each type
- [ ] Change states via UI dropdowns
- [ ] Verify API validation rejects invalid states
- [ ] Check no TypeScript errors
- [ ] Run full test suite

---

## Benefits

1. **Simplicity**: Direct state assignment, no RPC calls
2. **Performance**: No database function calls
3. **Type Safety**: PostgreSQL enforces valid states
4. **Maintainability**: States obvious from enum definition
5. **Developer Experience**: TypeScript enums match DB enums

---

## Progress Tracker

- [x] Create plan document
- [ ] Create database migration
- [ ] Update TypeScript types
- [ ] Delete FSM infrastructure
- [ ] Update UI components
- [ ] Update API routes
- [ ] Update services
- [ ] Update documentation
- [ ] Test on staging
- [ ] Deploy to production

---

**Last Updated**: December 12, 2025
