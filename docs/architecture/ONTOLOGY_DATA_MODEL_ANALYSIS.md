<!-- docs/architecture/ONTOLOGY_DATA_MODEL_ANALYSIS.md -->

# Ontology Data Model Analysis

> **Date:** 2024-12-20
> **Purpose:** Analyze core ontology data models and identify columns to add back from legacy tables

## Overview

This document compares the new `onto_*` tables with their legacy counterparts (`tasks`, `projects`) and identifies columns that should be added back to the ontology models. The template system was removed in favor of using a flexible `props` JSON column, but some columns are better served as first-class fields.

---

## 1. `onto_tasks` vs Legacy `tasks`

### Current `onto_tasks` Schema

```sql
onto_tasks:
  created_at      timestamptz
  created_by      uuid
  due_at          timestamptz
  facet_scale     text
  id              uuid
  priority        integer
  project_id      uuid
  props           jsonb
  search_vector   tsvector
  state_key       text
  title           text
  type_key        text
  updated_at      timestamptz
```

### Legacy `tasks` Schema (for comparison)

```sql
tasks:
  completed_at              timestamptz
  created_at                timestamptz
  deleted_at                timestamptz
  dependencies              text[]
  description               text
  details                   text
  duration_minutes          integer
  id                        uuid
  outdated                  boolean
  parent_task_id            uuid
  priority                  text (enum)
  project_id                uuid
  recurrence_end_source     text
  recurrence_ends           timestamptz
  recurrence_pattern        text
  source                    text
  source_calendar_event_id  text
  start_date                date
  status                    text
  task_steps                text
  task_type                 text
  title                     text
  updated_at                timestamptz
  user_id                   uuid
```

### Gap Analysis

| Legacy Column              | Purpose                              | Recommendation                                                     |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `start_date`               | When work should begin               | **ADD as `start_at`** - essential for scheduling/calendar views    |
| `completed_at`             | When task was completed              | **ADD** - critical for tracking completion time & velocity metrics |
| `deleted_at`               | Soft delete timestamp                | **ADD** - enables soft deletes and data recovery                   |
| `description`              | Detailed task description            | **ADD** - more visible than buried in props                        |
| `details`                  | Additional context                   | Keep in `props`                                                    |
| `duration_minutes`         | Estimated time to complete           | **ADD** - essential for time-blocking and scheduling               |
| `parent_task_id`           | Subtask hierarchy                    | **ADD** - enables nested tasks/subtasks                            |
| `dependencies`             | Task dependencies array              | Use `onto_edges` relationship table instead                        |
| `recurrence_pattern`       | Repeating tasks pattern              | **ADD** - or delegate to `onto_events` for recurring items         |
| `recurrence_ends`          | End date for recurrence              | **ADD** if adding recurrence support                               |
| `recurrence_end_source`    | How end was determined               | Keep in `props` if needed                                          |
| `source`                   | Origin (braindump, calendar, manual) | **ADD** - useful for analytics and provenance                      |
| `source_calendar_event_id` | Link to external calendar            | Use `onto_event_sync` table instead                                |
| `task_steps`               | Checklist/subtask items              | Keep in `props`                                                    |
| `outdated`                 | Staleness flag                       | Keep in `props` or derive from `updated_at`                        |

### Recommended Schema Additions for `onto_tasks`

```sql
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES onto_tasks(id);
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS recurrence_pattern text;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS recurrence_ends timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS source text;

-- Index for soft deletes
CREATE INDEX IF NOT EXISTS idx_onto_tasks_deleted_at ON onto_tasks(deleted_at) WHERE deleted_at IS NULL;

-- Index for parent/child relationships
CREATE INDEX IF NOT EXISTS idx_onto_tasks_parent_task_id ON onto_tasks(parent_task_id);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_onto_tasks_start_due ON onto_tasks(start_at, due_at);
```

### Updated `onto_tasks` Schema (Proposed)

```sql
onto_tasks:
  -- Existing columns
  id              uuid PRIMARY KEY
  created_at      timestamptz NOT NULL
  created_by      uuid NOT NULL
  updated_at      timestamptz NOT NULL
  project_id      uuid NOT NULL REFERENCES onto_projects(id)
  title           text NOT NULL
  state_key       text NOT NULL
  type_key        text NOT NULL
  priority        integer
  due_at          timestamptz
  facet_scale     text
  props           jsonb NOT NULL DEFAULT '{}'
  search_vector   tsvector

  -- New columns to add
  start_at        timestamptz          -- When work should begin
  completed_at    timestamptz          -- When marked complete
  deleted_at      timestamptz          -- Soft delete timestamp
  duration_minutes integer             -- Estimated duration
  parent_task_id  uuid REFERENCES onto_tasks(id)  -- Subtask hierarchy
  description     text                 -- Detailed description
  recurrence_pattern text              -- RRULE string for repeating
  recurrence_ends timestamptz          -- When recurrence stops
  source          text                 -- Origin: 'braindump', 'calendar', 'manual', 'ai'
```

---

## 2. `onto_projects` vs Legacy `projects`

### Current `onto_projects` Schema

```sql
onto_projects:
  also_types              text[]
  created_at              timestamptz
  created_by              uuid
  description             text
  end_at                  timestamptz
  facet_context           text
  facet_scale             text
  facet_stage             text
  id                      uuid
  name                    text
  next_step_long          text
  next_step_short         text
  next_step_source        text
  next_step_updated_at    timestamptz
  org_id                  uuid
  props                   jsonb
  start_at                timestamptz
  state_key               text
  type_key                text
  updated_at              timestamptz
```

### Legacy `projects` Schema (for comparison)

```sql
projects:
  calendar_color_id           text
  calendar_settings           jsonb
  calendar_sync_enabled       boolean
  context                     text
  core_context_descriptions   jsonb
  core_goals_momentum         text
  core_harmony_integration    text
  core_integrity_ideals       text
  core_meaning_identity       text
  core_opportunity_freedom    text
  core_people_bonds           text
  core_power_resources        text
  core_reality_understanding  text
  core_trust_safeguards       text
  created_at                  timestamptz
  description                 text
  end_date                    date
  executive_summary           text
  id                          uuid
  name                        text
  slug                        text
  source                      text
  source_metadata             jsonb
  start_date                  date
  status                      text
  tags                        text[]
  updated_at                  timestamptz
  user_id                     uuid
```

### Gap Analysis

| Legacy Column           | Purpose                   | Recommendation                                     |
| ----------------------- | ------------------------- | -------------------------------------------------- |
| `slug`                  | URL-friendly identifier   | **ADD** - essential for clean URLs                 |
| `status`                | Project status enum       | Already using `state_key` ✓                        |
| `context`               | Detailed project context  | **ADD** - more visible than props                  |
| `executive_summary`     | AI-generated summary      | **ADD** - frequently accessed, shouldn't be buried |
| `tags`                  | Categorization array      | **ADD** - essential for filtering/organization     |
| `calendar_color_id`     | Color coding              | **ADD** or keep in `props`                         |
| `calendar_sync_enabled` | Calendar integration flag | Move to `project_calendars` table                  |
| `calendar_settings`     | Calendar config           | Move to `project_calendars` table                  |
| `source`                | Origin of project         | **ADD** - useful for analytics                     |
| `source_metadata`       | Source details            | Keep in `props`                                    |
| `core_*` columns        | 9 core dimension fields   | Keep in `props` - too specific                     |

### Recommended Schema Additions for `onto_projects`

```sql
ALTER TABLE onto_projects ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE onto_projects ADD COLUMN IF NOT EXISTS context text;
ALTER TABLE onto_projects ADD COLUMN IF NOT EXISTS executive_summary text;
ALTER TABLE onto_projects ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE onto_projects ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE onto_projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_projects ADD COLUMN IF NOT EXISTS color text;

-- Unique constraint on slug (scoped to org if multi-tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_onto_projects_slug ON onto_projects(slug) WHERE deleted_at IS NULL;

-- Index for soft deletes
CREATE INDEX IF NOT EXISTS idx_onto_projects_deleted_at ON onto_projects(deleted_at) WHERE deleted_at IS NULL;

-- GIN index for tags
CREATE INDEX IF NOT EXISTS idx_onto_projects_tags ON onto_projects USING GIN(tags);
```

### Updated `onto_projects` Schema (Proposed)

```sql
onto_projects:
  -- Existing columns
  id                    uuid PRIMARY KEY
  created_at            timestamptz NOT NULL
  created_by            uuid NOT NULL
  updated_at            timestamptz NOT NULL
  name                  text NOT NULL
  description           text
  state_key             text NOT NULL
  type_key              text NOT NULL
  also_types            text[]
  start_at              timestamptz
  end_at                timestamptz
  facet_context         text
  facet_scale           text
  facet_stage           text
  org_id                uuid
  props                 jsonb NOT NULL DEFAULT '{}'
  next_step_short       text
  next_step_long        text
  next_step_source      text
  next_step_updated_at  timestamptz

  -- New columns to add
  slug                  text UNIQUE       -- URL-friendly identifier
  context               text              -- Detailed project context
  executive_summary     text              -- AI-generated summary
  tags                  text[]            -- Categorization tags
  source                text              -- Origin: 'braindump', 'calendar', 'manual'
  deleted_at            timestamptz       -- Soft delete timestamp
  color                 text              -- UI color coding
```

---

## 3. `onto_events` - Calendar Integration

### Current `onto_events` Schema

```sql
onto_events:
  all_day             boolean
  created_at          timestamptz
  created_by          uuid
  deleted_at          timestamptz
  description         text
  end_at              timestamptz
  external_link       text
  facet_context       text
  facet_scale         text
  facet_stage         text
  id                  uuid
  last_synced_at      timestamptz
  location            text
  org_id              uuid
  owner_entity_id     uuid
  owner_entity_type   text
  project_id          uuid
  props               jsonb
  recurrence          jsonb
  start_at            timestamptz
  state_key           text
  sync_error          text
  sync_status         text
  timezone            text
  title               text
  type_key            text
  updated_at          timestamptz
```

### Assessment

This schema is **well-designed** for calendar integration. Key strengths:

- ✅ `start_at` / `end_at` for precise timing
- ✅ `all_day` flag for date-only events
- ✅ `recurrence` (JSON) for flexible repeat patterns (RRULE compatible)
- ✅ `sync_status` / `sync_error` / `last_synced_at` for external calendar sync
- ✅ `owner_entity_id` / `owner_entity_type` for polymorphic linking to tasks/projects
- ✅ `timezone` for proper time handling
- ✅ `deleted_at` for soft deletes already present

### Potential Additions

| Column            | Purpose                           | Priority                                  |
| ----------------- | --------------------------------- | ----------------------------------------- |
| `attendees`       | JSON array of attendee info       | Medium - if collaborative features needed |
| `reminders`       | JSON array of reminder settings   | Medium - notification integration         |
| `visibility`      | public/private/confidential       | Low - if sharing features needed          |
| `busy_status`     | free/busy/tentative/out_of_office | Medium - for availability features        |
| `conference_data` | Meeting link details (Zoom, Meet) | Medium - useful for meeting events        |
| `organizer_email` | Who created the event externally  | Low - for sync purposes                   |

### Recommended Schema Additions for `onto_events`

```sql
-- Only add if these features are actively needed
ALTER TABLE onto_events ADD COLUMN IF NOT EXISTS attendees jsonb DEFAULT '[]';
ALTER TABLE onto_events ADD COLUMN IF NOT EXISTS reminders jsonb DEFAULT '[]';
ALTER TABLE onto_events ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'private';
ALTER TABLE onto_events ADD COLUMN IF NOT EXISTS busy_status text DEFAULT 'busy';
ALTER TABLE onto_events ADD COLUMN IF NOT EXISTS conference_data jsonb;
```

---

## 4. `onto_documents`

### Current Schema

```sql
onto_documents:
  created_at      timestamptz
  created_by      uuid
  id              uuid
  project_id      uuid
  props           jsonb
  search_vector   tsvector
  state_key       text
  title           text
  type_key        text
  updated_at      timestamptz
```

### Assessment

The current schema is minimal. Documents likely need more first-class fields depending on use case.

### Recommended Additions

| Column        | Purpose                                        | Priority                           |
| ------------- | ---------------------------------------------- | ---------------------------------- |
| `description` | Document summary/excerpt                       | High                               |
| `content`     | Actual document content (for notes/text)       | High - if storing content directly |
| `file_uri`    | Link to file storage (S3, etc.)                | High - if storing files            |
| `mime_type`   | Document type (text/markdown, application/pdf) | Medium                             |
| `size_bytes`  | File size                                      | Low                                |
| `tags`        | Categorization                                 | Medium                             |
| `facet_stage` | Workflow stage (draft, review, final)          | Medium                             |
| `deleted_at`  | Soft delete                                    | Medium                             |

### Recommended Schema Additions for `onto_documents`

```sql
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS file_uri text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS facet_stage text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- GIN index for tags
CREATE INDEX IF NOT EXISTS idx_onto_documents_tags ON onto_documents USING GIN(tags);
```

---

## 5. `onto_plans`

### Current Schema

```sql
onto_plans:
  created_at      timestamptz
  created_by      uuid
  facet_context   text
  facet_scale     text
  facet_stage     text
  id              uuid
  name            text
  project_id      uuid
  props           jsonb
  search_vector   tsvector
  state_key       text
  type_key        text
  updated_at      timestamptz
```

### Assessment

Plans represent strategic planning entities. The current schema captures the basics but could use temporal and descriptive fields.

### Recommended Additions

| Column           | Purpose                        | Priority |
| ---------------- | ------------------------------ | -------- |
| `description`    | Plan details/summary           | High     |
| `start_at`       | Plan timeframe start           | Medium   |
| `end_at`         | Plan timeframe end             | Medium   |
| `objective`      | What this plan aims to achieve | Medium   |
| `status_summary` | Current status narrative       | Low      |
| `deleted_at`     | Soft delete                    | Medium   |

### Recommended Schema Additions for `onto_plans`

```sql
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS end_at timestamptz;
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS objective text;
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
```

---

## 6. `onto_goals`

### Current Schema

```sql
onto_goals:
  created_at      timestamptz
  created_by      uuid
  id              uuid
  name            text
  project_id      uuid
  props           jsonb
  search_vector   tsvector
  state_key       text
  type_key        text
```

### Assessment

Goals should support tracking progress toward objectives. Missing `updated_at` and progress tracking fields.

### Recommended Additions

| Column             | Purpose                               | Priority                  |
| ------------------ | ------------------------------------- | ------------------------- |
| `description`      | Goal details                          | High                      |
| `updated_at`       | Last modification                     | High - currently missing! |
| `target_date`      | When goal should be achieved          | High                      |
| `target_value`     | Quantifiable target (if metric-based) | Medium                    |
| `current_value`    | Progress toward target                | Medium                    |
| `progress_percent` | Computed or stored progress           | Low - can derive          |
| `deleted_at`       | Soft delete                           | Medium                    |

### Recommended Schema Additions for `onto_goals`

```sql
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS target_date timestamptz;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS target_value numeric;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS current_value numeric;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
```

---

## 7. `onto_milestones`

### Current Schema

```sql
onto_milestones:
  created_at      timestamptz
  created_by      uuid
  due_at          timestamptz
  id              uuid
  project_id      uuid
  props           jsonb
  search_vector   tsvector
  state_key       text
  title           text
  type_key        text
```

### Assessment

Milestones represent key checkpoints in a project. The schema is reasonable but could use completion tracking.

### Recommended Additions

| Column         | Purpose           | Priority                  |
| -------------- | ----------------- | ------------------------- |
| `description`  | Milestone details | Medium                    |
| `completed_at` | When achieved     | High                      |
| `updated_at`   | Track changes     | High - currently missing! |
| `deleted_at`   | Soft delete       | Medium                    |

### Recommended Schema Additions for `onto_milestones`

```sql
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
```

---

## 8. Other Ontology Tables

### `onto_risks`

Current schema looks complete. Consider adding:

- `deleted_at` for soft deletes
- `mitigated_at` for when risk was addressed
- `updated_at` if missing

### `onto_requirements`

Current schema looks complete. Consider adding:

- `deleted_at` for soft deletes
- `updated_at` if missing
- `priority` for requirement prioritization

### `onto_outputs`

Current schema includes `facet_stage` and versioning via `onto_output_versions`. Consider:

- `deleted_at` for soft deletes
- `description` for output summary

### `onto_decisions`

Current schema looks complete with `decision_at` and `rationale`. Consider:

- `deleted_at` for soft deletes
- `updated_at` if missing

---

## Summary: Priority Additions

### High Priority (Essential Functionality)

#### `onto_tasks`

| Column             | Type        | Purpose                           |
| ------------------ | ----------- | --------------------------------- |
| `start_at`         | timestamptz | When work should begin            |
| `completed_at`     | timestamptz | When marked complete              |
| `duration_minutes` | integer     | Estimated duration for scheduling |
| `parent_task_id`   | uuid        | Subtask hierarchy support         |
| `description`      | text        | Detailed task description         |

#### `onto_projects`

| Column              | Type   | Purpose                      |
| ------------------- | ------ | ---------------------------- |
| `slug`              | text   | URL-friendly identifier      |
| `tags`              | text[] | Filtering and categorization |
| `executive_summary` | text   | AI-generated summary         |

#### `onto_goals` / `onto_milestones`

| Column       | Type        | Purpose                                  |
| ------------ | ----------- | ---------------------------------------- |
| `updated_at` | timestamptz | Track modifications (currently missing!) |

### Medium Priority (Enhanced Features)

| Table             | Column                              | Purpose             |
| ----------------- | ----------------------------------- | ------------------- |
| `onto_tasks`      | `deleted_at`                        | Soft delete support |
| `onto_tasks`      | `recurrence_pattern`                | Repeating tasks     |
| `onto_tasks`      | `source`                            | Track origin        |
| `onto_projects`   | `deleted_at`                        | Soft delete support |
| `onto_projects`   | `context`                           | Detailed context    |
| `onto_documents`  | `description`, `content`            | Document content    |
| `onto_plans`      | `description`, `start_at`, `end_at` | Plan details        |
| `onto_goals`      | `target_date`, `target_value`       | Progress tracking   |
| `onto_milestones` | `completed_at`                      | Completion tracking |

### Low Priority (Nice to Have)

| Table            | Column                         | Purpose                |
| ---------------- | ------------------------------ | ---------------------- |
| `onto_events`    | `attendees`, `conference_data` | Collaboration features |
| `onto_projects`  | `color`                        | UI color coding        |
| `onto_documents` | `mime_type`, `size_bytes`      | File metadata          |

---

## Migration Strategy

1. **Phase 1:** Add high-priority columns to `onto_tasks` and `onto_projects`
2. **Phase 2:** Add missing `updated_at` to `onto_goals` and `onto_milestones`
3. **Phase 3:** Add soft delete (`deleted_at`) across all ontology tables
4. **Phase 4:** Add medium-priority columns based on feature needs

### Sample Migration (Phase 1)

```sql
-- Migration: Add high-priority columns to onto_tasks
BEGIN;

ALTER TABLE onto_tasks
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES onto_tasks(id),
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS idx_onto_tasks_parent_task_id
  ON onto_tasks(parent_task_id);

CREATE INDEX IF NOT EXISTS idx_onto_tasks_date_range
  ON onto_tasks(start_at, due_at);

COMMIT;
```

```sql
-- Migration: Add high-priority columns to onto_projects
BEGIN;

ALTER TABLE onto_projects
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS executive_summary text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_onto_projects_slug
  ON onto_projects(slug) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onto_projects_tags
  ON onto_projects USING GIN(tags);

COMMIT;
```

---

## Related Documentation

- `/apps/web/docs/technical/database/schema.md` - Database schema documentation
- `/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md` - System architecture
- `/packages/shared-types/src/database.schema.ts` - TypeScript schema definitions
