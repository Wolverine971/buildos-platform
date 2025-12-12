# FSM Simplification: Migration Complete

**Date**: December 12, 2025
**Status**: ✅ COMPLETE

---

## Summary

We simplified the BuildOS ontology state management from a complex Finite State Machine (FSM) system to simple PostgreSQL enums. This change removes unnecessary complexity that was originally designed for a template-driven system that no longer exists.

---

## Why We Made This Change

### The Problem

1. **Broken Infrastructure**: After removing the template system, the `get_allowed_transitions` database function was querying the deleted `onto_templates` table, returning nothing for all entities.

2. **Dead Code**: The FSM engine (`engine.ts`) was disabled with an error message: "FSM execution no longer supported without template system."

3. **Unnecessary Complexity**: The FSM machinery (guards, actions, transitions) was designed for template-driven workflows where different entity types could have different state machines. With templates gone, every entity of a given kind uses the same static states.

4. **UI Already Using Fallback**: Components like `TaskEditModal.svelte` were already falling back to simple `<Select>` dropdowns when `allowedTransitions` was empty.

### The Solution

Replace the FSM with simple database enums:

- Users select states from a dropdown
- PostgreSQL enforces valid states via enum types
- TypeScript provides compile-time type safety
- No more database function calls for state changes

---

## What Changed

### Database (Migration: `20251212_simplify_fsm_to_enums.sql`)

**New Enum Types Created:**

| Entity    | Enum Type         | Valid States                                    |
| --------- | ----------------- | ----------------------------------------------- |
| Task      | `task_state`      | `todo`, `in_progress`, `blocked`, `done`        |
| Project   | `project_state`   | `planning`, `active`, `completed`, `cancelled`  |
| Plan      | `plan_state`      | `draft`, `active`, `completed`                  |
| Output    | `output_state`    | `draft`, `in_progress`, `review`, `published`   |
| Document  | `document_state`  | `draft`, `review`, `published`                  |
| Goal      | `goal_state`      | `draft`, `active`, `achieved`, `abandoned`      |
| Milestone | `milestone_state` | `pending`, `in_progress`, `completed`, `missed` |
| Risk      | `risk_state`      | `identified`, `mitigated`, `occurred`, `closed` |

**Functions Removed:**

- `get_allowed_transitions(text, uuid)`
- `onto_guards_pass(jsonb, jsonb)`

**Views Updated:**

- `task_documents` - recreated with enum-to-text cast for compatibility

### Files Deleted (12 files)

```
apps/web/src/lib/server/fsm/
├── engine.ts
├── actions/
│   ├── create-output.ts
│   ├── notify.ts
│   ├── schedule-rrule.ts
│   ├── email-user.ts
│   ├── email-admin.ts
│   ├── run-llm-critique.ts
│   └── __tests__/utils.test.ts

apps/web/src/routes/api/onto/fsm/
├── transitions/+server.ts
└── transition/+server.ts

apps/web/src/lib/components/ontology/
├── FSMStateVisualizer.svelte
└── FSMStateBar.svelte
```

### Files Modified

**Type Definitions:**

- `apps/web/src/lib/types/onto.ts`
    - Added state enum constants (`TASK_STATES`, `PROJECT_STATES`, etc.)
    - Added TypeScript types (`TaskState`, `ProjectState`, etc.)
    - Added Zod schemas (`TaskStateSchema`, `ProjectStateSchema`, etc.)
    - Added helper functions (`getStatesForKind()`, `isValidState()`, `getDefaultState()`)
    - Marked FSM types as `@deprecated`

- `apps/web/src/lib/types/onto-api.ts`
    - Marked `AllowedTransitionResponse` as `@deprecated`
    - Marked `allowed_transitions` field as `@deprecated`

**UI Components Updated:**

- `TaskEditModal.svelte` - Uses `TASK_STATES` enum in dropdown
- `GoalEditModal.svelte` - Uses `GOAL_STATES` enum in dropdown, removed stale `loadTransitions()` call
- `PlanEditModal.svelte` - Uses `PLAN_STATES` enum in dropdown
- `RiskEditModal.svelte` - Removed FSM reference from comments

**API Routes Updated:**

- `routes/api/onto/tasks/[id]/full/+server.ts` - Removed `get_allowed_transitions` RPC call, no longer returns `transitions` in response
- `routes/api/onto/projects/[id]/+server.ts` - Added note about FSM removal

**New Component Created:**

- `StateDisplay.svelte` - Simple badge component to display entity state

**Project Pages Updated:**

- `routes/projects/[id]/+page.svelte` - Uses `StateDisplay` instead of `FSMStateBar`
- `routes/projects/projects-v2/[id]/+page.svelte` - Uses `StateDisplay` instead of `FSMStateBar`

---

## Benefits

| Before                                        | After                            |
| --------------------------------------------- | -------------------------------- |
| Complex FSM with guards, actions, transitions | Simple enum dropdown             |
| Database RPC calls for every state check      | Direct column read/write         |
| FSM engine evaluating guards                  | PostgreSQL enforces valid values |
| 12+ FSM-related files                         | 0 FSM files                      |
| Broken transition system                      | Working state selection          |

### Performance

- No more database function calls to check allowed transitions
- Direct state assignment without guard evaluation

### Maintainability

- States are obvious from enum definition
- No hidden logic in database functions
- TypeScript provides compile-time validation

### Developer Experience

- Simple `<Select>` with `{#each STATES}` pattern
- Type-safe state values
- Clear error messages from PostgreSQL if invalid state

---

## Migration Notes

### State Mappings Applied

The migration automatically maps old state values to new enums:

| Old Value   | New Value   | Entity    |
| ----------- | ----------- | --------- |
| `completed` | `done`      | Task      |
| `archived`  | `done`      | Task      |
| `draft`     | `planning`  | Project   |
| `approved`  | `published` | Output    |
| `completed` | `achieved`  | Goal      |
| `done`      | `completed` | Milestone |

### Rollback Plan

If needed, the migration can be rolled back:

```sql
-- Convert enums back to varchar
ALTER TABLE onto_tasks ALTER COLUMN state_key TYPE varchar USING state_key::text;
-- Repeat for other tables...

-- Drop enum types
DROP TYPE IF EXISTS task_state, project_state, plan_state,
                    output_state, document_state, goal_state,
                    milestone_state, risk_state;
```

---

## Usage Examples

### In Svelte Components

```svelte
<script>
	import { TASK_STATES } from '$lib/types/onto';
	let stateKey = $state('todo');
</script>

<Select bind:value={stateKey}>
	{#each TASK_STATES as state}
		<option value={state}>{state}</option>
	{/each}
</Select>
```

### In TypeScript

```typescript
import { TASK_STATES, type TaskState, isValidState, getDefaultState } from '$lib/types/onto';

// Type-safe state
const state: TaskState = 'in_progress';

// Validate state
if (isValidState('task', userInput)) {
	// safe to use
}

// Get default
const defaultState = getDefaultState('task'); // 'todo'
```

### In API Routes

```typescript
import { TaskStateSchema } from '$lib/types/onto';

// Validate incoming state_key
const result = TaskStateSchema.safeParse(body.state_key);
if (!result.success) {
	return ApiResponse.error('Invalid state', 400);
}
```

---

## Related Documentation

- [FSM Simplification Plan](./FSM_SIMPLIFICATION_PLAN.md) - Original planning document
- [Template Removal Progress](./TEMPLATE_REMOVAL_PROGRESS.md) - Context on template removal
- [Data Models](./DATA_MODELS.md) - Updated schema documentation

---

## What Was NOT Changed

- The `state_key` column name remains the same in all tables
- Entity relationships and edges are unchanged
- All other ontology features (facets, type_key, props) are unchanged
- API endpoints for CRUD operations work the same way
- The database schema is backward compatible (enums cast to text)
