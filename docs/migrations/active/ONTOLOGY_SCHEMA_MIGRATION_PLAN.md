<!-- docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md -->
# Ontology Schema Migration Plan

> **Created:** 2024-12-20
> **Status:** Complete
> **Priority:** High
> **Progress:** All 10 Phases Complete (onto_tasks, onto_projects, onto_documents, onto_plans, onto_goals, onto_milestones, onto_risks, onto_requirements, onto_outputs, onto_decisions)

## Overview

This document outlines the comprehensive migration plan for updating the ontology data models with new columns, migrating data from `props` to dedicated columns, and updating all related code (API endpoints, modals, services, and chat tools).

---

## Migration Summary

### Tables to Update

| Table               | New Columns                                                                      | Removed Columns | Data Migration                                                           |
| ------------------- | -------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `onto_tasks`        | `start_at`, `completed_at`, `deleted_at`, `description`                          | —               | `props.description` → `description`                                      |
| `onto_projects`     | —                                                                                | `also_types`    | —                                                                        |
| `onto_documents`    | `content`, `description`, `deleted_at`                                           | —               | `props.body_markdown` → `content`                                        |
| `onto_plans`        | `plan`, `description`, `deleted_at`                                              | —               | `props.description` → `description`                                      |
| `onto_goals`        | `goal`, `description`, `updated_at`, `completed_at`, `target_date`, `deleted_at` | —               | `props.description` → `description`, `props.target_date` → `target_date` |
| `onto_milestones`   | `milestone`, `description`, `completed_at`, `updated_at`, `deleted_at`           | —               | `props.description` → `description`                                      |
| `onto_risks`        | `content`, `deleted_at`, `mitigated_at`, `updated_at`                            | —               | —                                                                        |
| `onto_requirements` | `deleted_at`, `updated_at`, `priority`                                           | —               | —                                                                        |
| `onto_outputs`      | `deleted_at`, `description`                                                      | —               | —                                                                        |
| `onto_decisions`    | `deleted_at`, `updated_at`                                                       | —               | —                                                                        |

---

## Implementation Order

We will update tables **one at a time** in the following order:

1. **onto_tasks** (most complex, sets pattern for others)
2. **onto_projects** (remove `also_types`)
3. **onto_documents** (complex `body_markdown` → `content` migration)
4. **onto_plans**
5. **onto_goals**
6. **onto_milestones**
7. **onto_risks**
8. **onto_requirements**
9. **onto_outputs**
10. **onto_decisions**

---

## Phase 1: onto_tasks Migration

### 1.1 New Columns

```sql
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS description text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onto_tasks_start_at ON onto_tasks(start_at);
CREATE INDEX IF NOT EXISTS idx_onto_tasks_completed_at ON onto_tasks(completed_at);
CREATE INDEX IF NOT EXISTS idx_onto_tasks_deleted_at ON onto_tasks(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_tasks_date_range ON onto_tasks(start_at, due_at);
```

### 1.2 Data Migration

```sql
-- Migrate description from props to column
UPDATE onto_tasks
SET description = props->>'description'
WHERE props->>'description' IS NOT NULL
  AND description IS NULL;

-- Set completed_at for tasks with state_key = 'done'
UPDATE onto_tasks
SET completed_at = updated_at
WHERE state_key = 'done'
  AND completed_at IS NULL;
```

### 1.3 Files to Update

#### API Endpoints

| File                                                              | Changes Required                                                                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/apps/web/src/routes/api/onto/tasks/create/+server.ts`           | Add `start_at`, `description` to insert; auto-set `completed_at` on done state            |
| `/apps/web/src/routes/api/onto/tasks/[id]/+server.ts`             | GET: Select new columns; PATCH: Update new columns; DELETE: Soft delete with `deleted_at` |
| `/apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts`        | Include new columns in selection                                                          |
| `/apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts` | Filter out soft-deleted tasks                                                             |

#### Modal Components

| File                                                           | Changes Required                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/apps/web/src/lib/components/ontology/TaskCreateModal.svelte` | Add start date picker; bind description to column                     |
| `/apps/web/src/lib/components/ontology/TaskEditModal.svelte`   | Add start date field; show completed_at in metadata; bind description |

#### Chat Tools

| File                                                                                     | Changes Required                                           |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`        | Update `list_onto_tasks` to return description             |
| `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`       | Update `create_onto_task` schema for start_at, description |
| `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/field-metadata.ts`       | Update ontology_task schema                                |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts` | Include description, filter deleted                        |

#### Services

| File                                                                  | Changes Required                |
| --------------------------------------------------------------------- | ------------------------------- |
| `/apps/web/src/lib/services/ontology/task-migration.service.ts`       | Use description column          |
| `/apps/web/src/lib/services/ontology/batch-task-migration.service.ts` | Use description column          |
| `/apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`           | Filter deleted, use new columns |

#### Types

| File                                            | Changes Required              |
| ----------------------------------------------- | ----------------------------- |
| `/packages/shared-types/src/database.schema.ts` | Add new columns to onto_tasks |
| `/packages/shared-types/src/database.types.ts`  | Regenerate after migration    |

### 1.4 Backwards Compatibility

During transition period, read from both:

```typescript
const description = task.description ?? (task.props?.description as string) ?? '';
```

---

## Phase 2: onto_projects Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 2.1 Column Changes

```sql
-- Remove also_types column
ALTER TABLE onto_projects DROP COLUMN IF EXISTS also_types;
DROP INDEX IF EXISTS idx_onto_projects_also_types;
```

### 2.2 Files Updated

| File                                                                               | Changes Made                       | Status |
| ---------------------------------------------------------------------------------- | ---------------------------------- | ------ |
| `/packages/shared-types/src/database.types.ts`                                     | Removed also_types                 | ✅     |
| `/packages/shared-types/src/database.schema.ts`                                    | Removed also_types                 | ✅     |
| `/apps/web/src/lib/types/onto.ts`                                                  | Removed from Project schemas       | ✅     |
| `/apps/web/src/lib/services/ontology/instantiation.service.ts`                     | Removed also_types from insert     | ✅     |
| `/apps/web/src/lib/services/ontology/migration/enhanced-project-migrator.ts`       | Removed also_types                 | ✅     |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts`            | Removed from CreateOntoProjectArgs | ✅     |
| `/apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts` | Removed from schema                | ✅     |
| `/apps/worker/tests/ontologyBriefDataLoader.test.ts`                               | Removed from mock                  | ✅     |

---

## Phase 3: onto_documents Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 3.1 New Columns

```sql
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_onto_documents_deleted_at ON onto_documents(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_documents_active ON onto_documents(project_id, state_key) WHERE deleted_at IS NULL;
```

### 3.2 Data Migration

```sql
-- Migrate body_markdown from props to content column
UPDATE onto_documents
SET content = props->>'body_markdown'
WHERE props->>'body_markdown' IS NOT NULL
  AND content IS NULL;
```

### 3.3 Files Updated

#### API Endpoints

| File                                                            | Changes Made                                 | Status |
| --------------------------------------------------------------- | -------------------------------------------- | ------ |
| `/apps/web/src/routes/api/onto/documents/create/+server.ts`     | Accept content/description, store in columns | ✅     |
| `/apps/web/src/routes/api/onto/documents/[id]/+server.ts`       | PATCH: update content; DELETE: soft delete   | ✅     |
| `/apps/web/src/routes/api/onto/tasks/[id]/documents/+server.ts` | Use content column, filter deleted           | ✅     |

#### Chat Tools

| File                                                                                      | Changes Made                               | Status |
| ----------------------------------------------------------------------------------------- | ------------------------------------------ | ------ |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts` | Use content column for create/update       | ✅     |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`  | Select content/description, filter deleted | ✅     |

#### Services

| File                                                           | Changes Made                           | Status |
| -------------------------------------------------------------- | -------------------------------------- | ------ |
| `/apps/web/src/lib/services/ontology/instantiation.service.ts` | Use content column for document insert | ✅     |

#### Types

| File                                            | Changes Made                           | Status |
| ----------------------------------------------- | -------------------------------------- | ------ |
| `/packages/shared-types/src/database.types.ts`  | Added content, description, deleted_at | ✅     |
| `/packages/shared-types/src/database.schema.ts` | Added content, description, deleted_at | ✅     |
| `/apps/web/src/lib/types/onto.ts`               | Added to DocumentSchema                | ✅     |

### 3.4 Backwards Compatibility

During transition, both `content` column and `props.body_markdown` are maintained:

- New documents: Content stored in `content` column AND `props.body_markdown`
- Read operations: Prefer `content` column, fall back to `props.body_markdown`

#### Modal Components ✅

| File                                                                    | Changes Made                           | Status |
| ----------------------------------------------------------------------- | -------------------------------------- | ------ |
| `/apps/web/src/lib/components/ontology/DocumentModal.svelte`            | Load/save using content column         | ✅     |
| `/apps/web/src/lib/components/ontology/OntologyContextDocModal.svelte`  | Load/save using content column         | ✅     |
| `/apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte` | Read content column with fallback      | ✅     |
| `/apps/web/src/lib/components/ontology/TaskEditModal.svelte`            | Load/save workspace docs using content | ✅     |

---

## Phase 4: onto_plans Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 4.1 New Columns

```sql
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS plan text;
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_onto_plans_deleted_at ON onto_plans(deleted_at) WHERE deleted_at IS NULL;
```

### 4.2 Data Migration

```sql
UPDATE onto_plans
SET description = props->>'description'
WHERE props->>'description' IS NOT NULL
  AND description IS NULL;
```

### 4.3 Files Updated

| File                                                                                     | Changes Made                           | Status |
| ---------------------------------------------------------------------------------------- | -------------------------------------- | ------ |
| `/apps/web/src/routes/api/onto/plans/create/+server.ts`                                  | Use description column                 | ✅     |
| `/apps/web/src/routes/api/onto/plans/[id]/+server.ts`                                    | PATCH with new columns, soft delete    | ✅     |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts` | Filter deleted_at, include description | ✅     |
| `/packages/shared-types/src/database.schema.ts`                                          | Added plan, description, deleted_at    | ✅     |
| `/apps/web/src/lib/types/onto.ts`                                                        | Added to PlanSchema                    | ✅     |

---

## Phase 5: onto_goals Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 5.1 New Columns

```sql
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS goal text;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS target_date timestamptz;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_onto_goals_deleted_at ON onto_goals(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_goals_target_date ON onto_goals(target_date);
```

### 5.2 Data Migration

```sql
UPDATE onto_goals
SET description = props->>'description',
    target_date = (props->>'target_date')::timestamptz
WHERE (props->>'description' IS NOT NULL OR props->>'target_date' IS NOT NULL);
```

### 5.3 Files Updated

| File                                                                                     | Changes Made                                        | Status |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------- | ------ |
| `/apps/web/src/routes/api/onto/goals/create/+server.ts`                                  | Use description, target_date columns                | ✅     |
| `/apps/web/src/routes/api/onto/goals/[id]/+server.ts`                                    | Soft delete, use new columns                        | ✅     |
| `/apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts` | Filter deleted_at, include description, target_date | ✅     |
| `/packages/shared-types/src/database.schema.ts`                                          | Added all new columns                               | ✅     |
| `/apps/web/src/lib/types/onto.ts`                                                        | Added GoalSchema                                    | ✅     |

---

## Phase 6: onto_milestones Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 6.1 New Columns

```sql
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS milestone text;
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_onto_milestones_deleted_at ON onto_milestones(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_milestones_completed_at ON onto_milestones(completed_at);
```

### 6.2 Data Migration

```sql
UPDATE onto_milestones
SET description = props->>'description'
WHERE props->>'description' IS NOT NULL
  AND description IS NULL;

-- Set completed_at for achieved milestones
UPDATE onto_milestones
SET completed_at = updated_at
WHERE state_key = 'completed'
  AND completed_at IS NULL;
```

### 6.3 Files Updated

| File                                                         | Changes Made                 | Status |
| ------------------------------------------------------------ | ---------------------------- | ------ |
| `/apps/web/src/routes/api/onto/milestones/create/+server.ts` | Use description column       | ✅     |
| `/apps/web/src/routes/api/onto/milestones/[id]/+server.ts`   | Soft delete, use new columns | ✅     |
| `/packages/shared-types/src/database.schema.ts`              | Added all new columns        | ✅     |
| `/apps/web/src/lib/types/onto.ts`                            | Added MilestoneSchema        | ✅     |

---

## Phase 7: onto_risks Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 7.1 New Columns

```sql
ALTER TABLE onto_risks ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE onto_risks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_risks ADD COLUMN IF NOT EXISTS mitigated_at timestamptz;
ALTER TABLE onto_risks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_onto_risks_deleted_at ON onto_risks(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_risks_mitigated_at ON onto_risks(mitigated_at);

-- Search vector with content column
ALTER TABLE onto_risks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
  ) STORED;
```

### 7.2 Files Updated

| File                                                    | Changes Made                                        | Status |
| ------------------------------------------------------- | --------------------------------------------------- | ------ |
| `/apps/web/src/routes/api/onto/risks/[id]/+server.ts`   | Soft delete, set mitigated_at, updated_at, content  | ✅     |
| `/apps/web/src/routes/api/onto/risks/create/+server.ts` | Accept content column                               | ✅     |
| `/packages/shared-types/src/database.schema.ts`         | Added content, deleted_at, mitigated_at, updated_at | ✅     |
| `/apps/web/src/lib/types/onto.ts`                       | Added RiskSchema                                    | ✅     |

---

## Phase 8: onto_requirements Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 8.1 New Columns

```sql
ALTER TABLE onto_requirements ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_requirements ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE onto_requirements ADD COLUMN IF NOT EXISTS priority integer;

CREATE INDEX IF NOT EXISTS idx_onto_requirements_deleted_at ON onto_requirements(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_requirements_priority ON onto_requirements(priority);
```

### 8.2 Files Updated

| File                                            | Changes Made                           | Status |
| ----------------------------------------------- | -------------------------------------- | ------ |
| `/packages/shared-types/src/database.schema.ts` | Added deleted_at, updated_at, priority | ✅     |
| SQL migration file                              | Added columns and indexes              | ✅     |

**Note:** No dedicated API endpoints or modals exist for requirements. Consider adding if needed.

---

## Phase 9: onto_outputs Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 9.1 New Columns

```sql
ALTER TABLE onto_outputs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_outputs ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_onto_outputs_deleted_at ON onto_outputs(deleted_at) WHERE deleted_at IS NULL;

-- Search vector with description column
ALTER TABLE onto_outputs ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
  ) STORED;
```

**Note:** `onto_outputs` already has `updated_at` column.

### 9.2 Files Updated

| File                                                      | Changes Made                                        | Status |
| --------------------------------------------------------- | --------------------------------------------------- | ------ |
| `/apps/web/src/routes/api/onto/outputs/create/+server.ts` | Accept description column                           | ✅     |
| `/apps/web/src/routes/api/onto/outputs/[id]/+server.ts`   | Soft delete (deleted_at), PATCH description, filter | ✅     |
| `/packages/shared-types/src/database.schema.ts`           | Added deleted_at, description                       | ✅     |

**Modals:** OutputCreateModal.svelte and OutputEditModal.svelte can be updated to use description field.

---

## Phase 10: onto_decisions Migration ✅ COMPLETE

> **Completed:** 2024-12-20

### 10.1 New Columns

```sql
ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_onto_decisions_deleted_at ON onto_decisions(deleted_at) WHERE deleted_at IS NULL;
```

### 10.2 Files Updated

| File                                            | Changes Made                 | Status |
| ----------------------------------------------- | ---------------------------- | ------ |
| `/packages/shared-types/src/database.schema.ts` | Added deleted_at, updated_at | ✅     |
| SQL migration file                              | Added columns and indexes    | ✅     |

**Note:** No dedicated API endpoints or modals exist for decisions. Consider adding if needed.

---

## Type Definition Updates

After each phase, regenerate TypeScript types:

```bash
# Regenerate database types from Supabase
pnpm supabase gen types typescript --local > packages/shared-types/src/database.types.ts

# Update lightweight schema
cd packages/shared-types && pnpm generate-schema
```

---

## Testing Checklist

For each table migration:

- [ ] Schema migration runs successfully
- [ ] Data migration completes without errors
- [ ] API endpoints work with new columns
- [ ] Modals display and save new fields
- [ ] Chat tools read/write new columns
- [ ] Soft delete works (records hidden, not removed)
- [ ] Worker services filter deleted records
- [ ] TypeScript types compile without errors
- [ ] Existing data is preserved
- [ ] Search vectors still work

---

## Rollback Strategy

Each migration should have a corresponding rollback:

```sql
-- Example rollback for onto_tasks
ALTER TABLE onto_tasks DROP COLUMN IF EXISTS start_at;
ALTER TABLE onto_tasks DROP COLUMN IF EXISTS completed_at;
ALTER TABLE onto_tasks DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE onto_tasks DROP COLUMN IF EXISTS description;
```

---

## Implementation Schedule

| Phase | Table             | Estimated Effort | Dependencies        |
| ----- | ----------------- | ---------------- | ------------------- |
| 1     | onto_tasks        | High             | None (sets pattern) |
| 2     | onto_projects     | Low              | None                |
| 3     | onto_documents    | High             | None                |
| 4     | onto_plans        | Medium           | None                |
| 5     | onto_goals        | Medium           | None                |
| 6     | onto_milestones   | Medium           | None                |
| 7     | onto_risks        | Low              | None                |
| 8     | onto_requirements | Low              | None                |
| 9     | onto_outputs      | Low              | None                |
| 10    | onto_decisions    | Low              | None                |

---

## Notes

1. **Backwards Compatibility**: During transition, support reading from both `props.X` and dedicated column
2. **Soft Deletes**: All queries must filter `WHERE deleted_at IS NULL`
3. **Chat Tools**: Update both tool definitions and executors
4. **Worker Services**: Update brief generation to use new columns
5. **Search Vectors**: May need to include new columns in tsvector generation

---

## Related Documentation

- `/docs/architecture/ONTOLOGY_DATA_MODEL_ANALYSIS.md` - Original analysis
- `/apps/web/docs/features/ontology/DATA_MODELS.md` - Feature documentation
- `/packages/shared-types/src/database.schema.ts` - TypeScript schema
