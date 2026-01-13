<!-- apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md -->

# Project Activity Logging & Next Steps Feature

## Overview

This feature adds a project activity logging system and "next moves" capability to BuildOS. It enables:

1. **Activity Logging**: Track all changes to project-related entities with before/after state
2. **Next Steps**: AI-generated actionable next steps per project with embedded entity references

---

## Status

| Phase                       | Status       | Notes                                           |
| --------------------------- | ------------ | ----------------------------------------------- |
| 1. Database Migration       | ✅ Completed | `20251208_project_activity_logging.sql`         |
| 2. TypeScript Types         | ✅ Completed | `project-activity.types.ts` created             |
| 3. Worker Service Extension | ✅ Completed | Chat classification extended with activity logs |
| 4. Brain Dump Integration   | ✅ Completed | Next step seeding added to operations executor  |
| 5. Shared Utilities         | ✅ Completed | Parser and service created                      |
| 6. UI Integration           | 🔲 Pending   | Display activity logs and next steps in UI      |
| 7. API Endpoints            | 🔲 Pending   | REST endpoints for logs and next steps          |

---

## Implemented Files

### Database

- **Migration**: `supabase/migrations/20251208_project_activity_logging.sql`
    - Creates `onto_project_logs` table with RLS policies
    - Adds `next_step_*` columns to `onto_projects`
    - Helper functions `log_project_change()` and `update_project_next_step()` were removed; logging and next-step updates are handled in app services.

### Shared Types (packages/shared-types)

- **Types**: `src/project-activity.types.ts`
    - `ProjectLogEntry`, `ProjectLogInsert`
    - `EntityReference`, `ParsedNextStepLong`
    - `NextStepGenerationContext`
    - Worker/API request/response types

### Web App (apps/web)

- **Entity Reference Parser**: `src/lib/utils/entity-reference-parser.ts`
    - `parseEntityReferences()` - Extract entity refs from markdown
    - `createEntityReference()` - Create `[[type:id|text]]` format
    - `renderEntityReferencesAsHtml()` - Convert to clickable links
    - `stripEntityReferences()` - Remove refs, keep display text
    - `ENTITY_MODAL_MAP` - Maps entity types to modal components

- **Activity Log Service**: `src/lib/services/project-activity-log.service.ts`
    - `logChange()`, `logChanges()` - Log single/multiple changes
    - `getProjectLogs()` - Query logs with pagination/filtering
    - `getEntityHistory()` - Get history for specific entity
    - `updateNextStep()`, `getNextStep()`, `clearNextStep()`
    - `getActivitySummary()` - Summary statistics

- **Next Step Seeding Service**: `src/lib/services/next-step-seeding.service.ts`
    - `seedNextSteps()` - Generate and persist initial next steps
    - Works with both legacy `projects` and `onto_projects` tables
    - Intelligent step generation based on tasks, priority, and context

- **Operations Executor Integration**: `src/lib/utils/operations/operations-executor.ts`
    - Added `seedProjectNextSteps()` call after project creation
    - Non-blocking (fire-and-forget with error catching)

### Worker (apps/worker)

- **Chat Session Activity Processor**: `src/workers/chat/chatSessionActivityProcessor.ts`
    - `processSessionActivityAndNextSteps()` - Main processing function
    - Maps `chat_operations` to activity logs
    - Generates next steps via LLM based on session context
    - Handles project-related sessions only

- **Chat Session Classifier Extension**: `src/workers/chat/chatSessionClassifier.ts`
    - Added import for `chatSessionActivityProcessor`
    - Calls `processSessionActivityAndNextSteps()` after classification
    - Non-fatal error handling (doesn't fail classification job)

---

## Data Models

### 1. `onto_project_logs` Table (NEW)

Tracks all changes to project-related entities.

| Column            | Type        | Nullable | Description                              |
| ----------------- | ----------- | -------- | ---------------------------------------- |
| `id`              | UUID        | NO       | Primary key (default: gen_random_uuid()) |
| `project_id`      | UUID        | NO       | FK to onto_projects.id                   |
| `entity_type`     | TEXT        | NO       | Type of entity changed                   |
| `entity_id`       | UUID        | NO       | ID of the changed entity                 |
| `action`          | TEXT        | NO       | 'created', 'updated', 'deleted'          |
| `before_data`     | JSONB       | YES      | State before change (null for creates)   |
| `after_data`      | JSONB       | YES      | State after change (null for deletes)    |
| `changed_by`      | UUID        | NO       | FK to auth.users.id                      |
| `change_source`   | TEXT        | YES      | 'chat', 'form', 'brain_dump', 'api'      |
| `chat_session_id` | UUID        | YES      | FK to chat_sessions.id (if from chat)    |
| `created_at`      | TIMESTAMPTZ | NO       | When the change occurred                 |

**Supported `entity_type` values:**

- `project` - Project metadata changes (name, description, dates, facets)
- `task` - onto_tasks
- `note` - onto_notes
- `goal` - onto_goals
- `milestone` - onto_milestones
- `risk` - onto_risks
- `plan` - onto_plans
- `requirement` - onto_requirements
- `source` - onto_sources
- `edge` - onto_edges

**Indexes:**

- `idx_project_logs_project_id` on `project_id`
- `idx_project_logs_entity` on `(entity_type, entity_id)`
- `idx_project_logs_created_at` on `created_at DESC`
- `idx_project_logs_changed_by` on `changed_by`
- `idx_project_logs_chat_session` on `chat_session_id` (partial)

### 2. `onto_projects` New Columns

| Column                 | Type        | Nullable | Default | Description                               |
| ---------------------- | ----------- | -------- | ------- | ----------------------------------------- |
| `next_step_short`      | TEXT        | YES      | NULL    | One sentence summary (< 100 chars)        |
| `next_step_long`       | TEXT        | YES      | NULL    | Markdown with entity refs (max 650 chars) |
| `next_step_updated_at` | TIMESTAMPTZ | YES      | NULL    | When next step was last updated           |
| `next_step_source`     | TEXT        | YES      | NULL    | 'ai' or 'user'                            |

---

## Entity Reference Embedding Format

For embedding clickable entity references in `next_step_long`:

```
[[entity_type:entity_id|display_text]]
```

**Examples:**

```markdown
Complete the [[task:abc123|project brief]] and review [[document:def456|Brand Guidelines]].
```

**Supported entity types:**

- `task` → Opens TaskEditModal
- `document` / `output` → Opens DocumentEditModal
- `goal` → Opens GoalEditModal
- `milestone` → Opens MilestoneEditModal
- `risk` → Opens RiskEditModal
- `note` → Opens NoteEditModal
- `user` → Opens user profile/card

**Parser Regex:**

```typescript
/\[\[(\w+):([a-f0-9-]+)\|([^\]]+)\]\]/gi;
```

---

## Integration Flow

### 1. Chat Session Close → Activity Logging + Next Steps

```
User closes chat modal
        ↓
AgentChatModal.handleClose()
        ↓
RailwayWorkerService.queueChatSessionClassification()
        ↓
Worker: processChatClassificationJob()
        ↓
    1. Generate title (existing)
    2. Extract topics (existing)
    3. processSessionActivityAndNextSteps()
        ↓
        a. Get session context (check if project-related)
        b. Fetch chat_operations for session
        c. Map operations to activity logs
        d. Insert into onto_project_logs
        e. Generate next steps via LLM
        f. Update onto_projects.next_step_*
```

### 2. Brain Dump → Project Creation + Next Step Seeding

```
Brain dump submitted
        ↓
processBrainDump()
        ↓
operationsExecutor.executeOperations()
        ↓
handleCreateOperation() for 'projects' table
        ↓
    1. Insert project (existing)
    2. Mark brain dump completed (existing)
    3. seedProjectNextSteps() (NEW - fire-and-forget)
        ↓
        a. Build project context from data
        b. Generate intelligent initial next step
        c. Update onto_projects (if exists) or log warning
```

---

## API Endpoints (TODO)

| Method | Endpoint                                  | Description                   |
| ------ | ----------------------------------------- | ----------------------------- |
| GET    | `/api/projects/[id]/logs`                 | Get activity logs for project |
| GET    | `/api/projects/[id]/next-step`            | Get current next step         |
| PUT    | `/api/projects/[id]/next-step`            | Update next step (user edit)  |
| POST   | `/api/projects/[id]/next-step/regenerate` | Trigger AI regeneration       |

---

## Usage Examples

### Log a Change (from application code)

```typescript
import { createProjectActivityLogService } from '$lib/services/project-activity-log.service';

const activityService = createProjectActivityLogService(supabase);

// Log a task update
await activityService.logUpdate(
	projectId,
	'task',
	taskId,
	{ title: 'Old title' },
	{ title: 'New title' },
	userId,
	'form'
);
```

### Parse Entity References (in UI)

```typescript
import {
	parseEntityReferences,
	renderEntityReferencesAsHtml
} from '$lib/utils/entity-reference-parser';

const nextStepLong = project.next_step_long;
const { entities } = parseEntityReferences(nextStepLong);

// Render as HTML with clickable links
const html = renderEntityReferencesAsHtml(nextStepLong, (ref) => {
	return `/projects/${projectId}/${ref.type}s/${ref.id}`;
});
```

### Seed Next Steps (programmatic)

```typescript
import { seedProjectNextSteps } from '$lib/services/next-step-seeding.service';

await seedProjectNextSteps(supabase, {
	projectId,
	userId,
	projectData: { name, description },
	tasks: initialTasks,
	isOntoProject: true
});
```

---

## Testing Strategy

1. **Unit Tests**
    - Entity reference parser (parse, create, validate)
    - Activity log service methods

2. **Integration Tests**
    - Chat classification with activity logging
    - Brain dump with next step seeding

3. **LLM Tests**
    - Next step generation quality
    - Entity reference accuracy

---

## Remaining Work

1. **UI Components**
    - Activity log timeline component
    - Next step display with entity links
    - Next step edit modal

2. **API Endpoints**
    - REST endpoints as defined above

3. **Database Types Regeneration**
    - Run Supabase type generation after migration is applied
    - Update `database.schema.ts` with new types

---

## Changelog

| Date       | Change                                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| 2025-12-08 | Initial plan created                                                              |
| 2025-12-08 | Implemented: migration, types, services, worker extension, brain dump integration |
