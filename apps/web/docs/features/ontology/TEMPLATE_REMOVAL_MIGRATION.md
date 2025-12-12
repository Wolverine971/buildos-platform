<!-- apps/web/docs/features/ontology/TEMPLATE_REMOVAL_MIGRATION.md -->

# Template Removal Migration Specification

**Date**: December 10, 2025
**Status**: Ready for Implementation
**Related**: `TEMPLATE_FREE_ONTOLOGY_SPEC.md`

---

## Overview

This migration removes the template system from BuildOS while preserving the `type_key` classification system on entities.

## What Gets Removed

### Tables

| Table                              | Action                      |
| ---------------------------------- | --------------------------- |
| `onto_templates`                   | DROP                        |
| `agent_template_creation_requests` | DROP (depends on templates) |

### Columns

| Table         | Column              | Action |
| ------------- | ------------------- | ------ |
| `onto_events` | `template_id`       | DROP   |
| `onto_events` | `template_snapshot` | DROP   |

### Enums

| Enum                   | Action |
| ---------------------- | ------ |
| `onto_template_status` | DROP   |

### Functions to Remove

- `get_template_catalog()`
- `resolve_template()` / `get_resolved_template()`
- `get_allowed_transitions()` RPC (state validation moves to app layer)
- Any function referencing `onto_templates`

---

## What Gets Kept

### Tables (No Changes)

All entity tables remain with their `type_key` columns:

- `onto_projects` - `type_key` stays
- `onto_tasks` - `type_key` stays
- `onto_plans` - `type_key` stays
- `onto_outputs` - `type_key` stays
- `onto_documents` - `type_key` stays
- `onto_goals` - `type_key` stays
- `onto_requirements` - `type_key` stays
- `onto_milestones` - `type_key` stays
- `onto_risks` - `type_key` stays
- `onto_metrics` - `type_key` stays
- `onto_events` - `type_key` stays

### Columns (No Changes)

- `type_key` - Classification string (no longer references templates)
- `state_key` - Simple state string
- `props` - JSONB for dynamic properties
- All facet generated columns

---

## Migration SQL

```sql
-- supabase/migrations/YYYYMMDD_remove_template_system.sql
-- Migration: Remove template system
-- Description: Drops onto_templates and related dependencies, keeps type_key as classification
-- Author: [Agent]
-- Date: 2025-12-10

BEGIN;

-- ============================================================================
-- STEP 1: Drop dependent tables
-- ============================================================================

-- Drop agent template creation requests (depends on onto_templates)
DROP TABLE IF EXISTS agent_template_creation_requests CASCADE;

-- ============================================================================
-- STEP 2: Remove template references from onto_events
-- ============================================================================

-- Drop the foreign key constraint first
ALTER TABLE onto_events
  DROP CONSTRAINT IF EXISTS onto_events_template_id_fkey;

-- Drop the template_id and template_snapshot columns
ALTER TABLE onto_events
  DROP COLUMN IF EXISTS template_id,
  DROP COLUMN IF EXISTS template_snapshot;

-- ============================================================================
-- STEP 3: Drop template-related functions
-- ============================================================================

DROP FUNCTION IF EXISTS get_allowed_transitions(text, uuid) CASCADE;
DROP FUNCTION IF EXISTS get_template_catalog(text, text, text) CASCADE;
DROP FUNCTION IF EXISTS get_template_catalog(text, text) CASCADE;
DROP FUNCTION IF EXISTS get_resolved_template(text, text) CASCADE;
DROP FUNCTION IF EXISTS resolve_template(uuid) CASCADE;
DROP FUNCTION IF EXISTS resolve_template_chain(uuid) CASCADE;

-- ============================================================================
-- STEP 4: Drop the templates table
-- ============================================================================

DROP TABLE IF EXISTS onto_templates CASCADE;

-- ============================================================================
-- STEP 5: Drop the template status enum
-- ============================================================================

DROP TYPE IF EXISTS onto_template_status CASCADE;

COMMIT;
```

---

## Application Code Changes

### Implementation Task List

1. [ ] **Fix project page** - Remove all template references
2. [ ] **Remove template references from all APIs**
3. [ ] **Replace get_allowed_transitions RPC calls** - Use `state-transitions.ts` in the app layer
4. [ ] **Remove templates from graph visualization**
5. [ ] **Update create project flow** - Go straight to agentic chat with create project context
6. [ ] **Remove find-or-create-template.service** - Replace with props inference instructions
7. [ ] **Update agentic chat flow** - Remove all template tools, context, and prompts
8. [ ] **Update /admin/migration** - Remove all template info
9. [ ] **Create database migration** - Drop onto_templates and related

### Files to Remove

```
# Template Services
src/lib/services/ontology/find-or-create-template.service.ts
src/lib/services/ontology/template-resolver.service.ts
src/lib/services/ontology/template-crud.service.ts
src/lib/services/ontology/template-family-cache.service.ts
src/lib/services/ontology/template-validation.service.ts

# Template API Routes
src/routes/api/onto/templates/+server.ts
src/routes/api/onto/templates/[id]/+server.ts
src/routes/api/onto/templates/catalog/+server.ts
src/routes/api/onto/templates/find-or-create/+server.ts

# FSM Engine (or significantly simplify)
src/lib/server/fsm/engine.ts
src/lib/server/fsm/guards.ts
src/lib/server/fsm/actions/ (entire directory)

# Types (consolidate/simplify)
src/lib/types/onto/template.ts
```

### Files to Create

```
# New state transition module (application-layer FSM)
src/lib/server/ontology/state-transitions.ts  # See TEMPLATE_FREE_ONTOLOGY_SPEC.md for implementation
```

### Files to Modify

| File                                               | Changes                                                 |
| -------------------------------------------------- | ------------------------------------------------------- |
| Project page components                            | Remove template selection, template display             |
| `src/lib/server/ontology/instantiation.service.ts` | Remove template lookup, use type_key directly           |
| Graph visualization components                     | Remove template nodes from graph                        |
| Agentic chat tools                                 | Remove template-related tools                           |
| Agentic chat prompts                               | Remove template context, add prop inference guidance    |
| `/admin/migration` page                            | Remove template migration UI                            |
| Agent system prompts                               | Remove template references, add prop inference guidance |

### State Transition Logic

Move from database FSM to application layer (`src/lib/server/ontology/state-transitions.ts`) and drop the RPC.

```typescript
export const ENTITY_STATES = {
	project: ['draft', 'active', 'paused', 'complete', 'archived'],
	task: ['todo', 'in_progress', 'blocked', 'done', 'abandoned'],
	plan: ['draft', 'active', 'review', 'complete'],
	output: ['draft', 'review', 'approved', 'published'],
	document: ['draft', 'published'],
	goal: ['active', 'achieved', 'abandoned'],
	milestone: ['pending', 'achieved', 'missed'],
	event: ['scheduled', 'confirmed', 'completed', 'cancelled']
} as const;

export const STATE_TRANSITIONS: Record<string, Record<string, string[]>> = {
	project: {
		draft: ['active', 'archived'],
		active: ['paused', 'complete', 'archived'],
		paused: ['active', 'archived'],
		complete: ['archived'],
		archived: []
	},
	task: {
		todo: ['in_progress', 'abandoned'],
		in_progress: ['blocked', 'done', 'abandoned', 'todo'],
		blocked: ['in_progress', 'abandoned'],
		done: ['todo'],
		abandoned: ['todo']
	},
	plan: {
		draft: ['active'],
		active: ['review', 'complete'],
		review: ['active', 'complete'],
		complete: []
	},
	output: {
		draft: ['review'],
		review: ['draft', 'approved'],
		approved: ['published'],
		published: []
	},
	document: {
		draft: ['published'],
		published: ['draft']
	},
	goal: {
		active: ['achieved', 'abandoned'],
		achieved: [],
		abandoned: ['active']
	},
	milestone: {
		pending: ['achieved', 'missed'],
		achieved: [],
		missed: []
	},
	event: {
		scheduled: ['confirmed', 'cancelled'],
		confirmed: ['completed', 'cancelled'],
		completed: [],
		cancelled: []
	}
};

export function canTransition(
	entityType: keyof typeof STATE_TRANSITIONS,
	currentState: string,
	targetState: string
): boolean {
	return STATE_TRANSITIONS[entityType]?.[currentState]?.includes(targetState) ?? false;
}
```

---

## Rollback Plan

If issues arise:

1. Keep a backup of `onto_templates` data before migration
2. Migration can be reverted by re-creating the table and re-seeding

```sql
-- Rollback (if needed)
-- Re-run the original 20250601000001_ontology_system.sql template section
-- Re-seed templates from backup
```

---

## Testing Checklist

After migration:

- [ ] All entity CRUD operations work without templates
- [ ] State transitions work via application layer (project/task/plan/output/document/goal/milestone/event)
- [ ] type_key values are preserved on all entities
- [ ] props JSONB continues to work
- [ ] No broken foreign key errors
- [ ] Agent can create projects/tasks without template lookup
- [ ] UI renders entities correctly

---

## Migration Order

1. **Deploy application changes first** (remove template dependencies, replace `get_allowed_transitions` RPC usage with `state-transitions.ts`, and stop reading `template_snapshot`)
2. **Run database migration** (drop template tables, columns, and functions)
3. **Verify** all functionality works
4. **Clean up** any remaining template-related code

---

**End of Migration Specification**
