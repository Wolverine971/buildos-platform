<!-- apps/web/docs/technical/database/CALENDAR_AND_ONTOLOGY_SCHEMA.md -->

# BuildOS Database Schema: Calendar & Ontology System

## Executive Summary

BuildOS has two primary systems for managing entities and their relationships:

1. **Ontology System** - Template-driven, type-safe entity management with FSM state machines (onto\_\* tables)
2. **Traditional Task Management** - Calendar-integrated task tracking with project phases (tasks, projects, project_calendars)

These systems are **NOT currently connected** - they operate independently. The ontology system is newer and more sophisticated, while the traditional system powers the core product features.

---

## ONTOLOGY SYSTEM (onto\_\* Tables)

### Core Concept

The ontology system implements a **template-driven, type-safe architecture** for managing projects, plans, tasks, and outputs. It uses:

- **Finite State Machines (FSM)** for state transitions
- **Faceted metadata** system (3 facets: context, scale, stage)
- **Graph-based relationships** (onto_edges)
- **Template inheritance** for code reuse

### Core Reference Tables

#### 1. `onto_actors` (Humans & AI Agents)

```
id (uuid, pk)
kind (enum: 'human' | 'agent')
name (text)
email (text)
user_id (uuid fk → users)
org_id (uuid)
metadata (jsonb)
created_at (timestamptz)

Constraints:
- Unique user_id (for humans)
- If kind='human' then user_id NOT NULL
- If kind='agent' then user_id IS NULL
```

**Purpose**: Track both human users and AI agents as actors in the system. Enables audit trails and multi-actor workflows.

#### 2. `onto_tools` (Tools Registry)

```
id (uuid, pk)
name (text)
capability_key (text)
config (jsonb)
created_at (timestamptz)
```

**Purpose**: Provenance tracking for tools used in actions/transitions.

---

### Metadata System: Facets

#### `onto_facet_definitions` (Taxonomy)

```
key (text, pk)
name (text)
description (text)
allowed_values (jsonb array)
is_multi_value (boolean)
is_required (boolean)
applies_to (text array) - which entity types
created_at (timestamptz)
```

**Seeded Facets** (3):

| Facet       | Applies To            | Values                                                                                       |
| ----------- | --------------------- | -------------------------------------------------------------------------------------------- |
| **context** | project, plan         | personal, client, commercial, internal, open_source, community, academic, nonprofit, startup |
| **scale**   | project, plan, task   | micro, small, medium, large, epic                                                            |
| **stage**   | project, plan, output | discovery, planning, execution, launch, maintenance, complete                                |

#### `onto_facet_values` (Metadata)

```
id (uuid, pk)
facet_key (text fk)
value (text)
label (text)
description (text)
color (text)
icon (text)
parent_value_id (uuid fk, self-referential)
sort_order (int)
created_at (timestamptz)

Unique: (facet_key, value)
```

**Example**: For facet_key='context', value='startup':

- label: "Startup"
- color: "#ef4444"
- description: "Early-stage venture or startup company"

---

### Templates System

#### `onto_templates` (Schema & FSM Definitions)

```
id (uuid, pk)
scope (text) - 'project'|'plan'|'task'|'output'|'document'|'goal'|'requirement'|'risk'|'milestone'|'metric'
type_key (text, format: "realm.type[.subtype]")
name (text)
status (enum: 'draft'|'active'|'deprecated')

parent_template_id (uuid fk, self-referential)
is_abstract (boolean)

schema (jsonb) - JSON Schema for properties
fsm (jsonb) - Finite State Machine definition
default_props (jsonb) - Default values
default_views (jsonb array) - UI view configs
facet_defaults (jsonb) - Default facet values
metadata (jsonb) - Keywords, realm, etc.

created_by (uuid)
created_at (timestamptz)
updated_at (timestamptz)

Unique: (scope, type_key)
```

**FSM Structure** (in `fsm` column):

```json
{
  "type_key": "writer.book",
  "states": ["planning", "writing", "editing", "published"],
  "transitions": [
    {
      "from": "planning",
      "to": "writing",
      "event": "start_writing",
      "guards": [{"type": "has_property", "path": "props.target_word_count"}],
      "actions": [
        {"type": "spawn_tasks", "titles": [...], "props_template": {...}},
        {"type": "update_facets", "facets": {"stage": "execution"}},
        {"type": "notify", "message": "..."}
      ]
    }
  ]
}
```

**Seeded Templates** (25):

**Project Templates**:

- `writer.book`, `writer.article`
- `coach.client`, `coach.program`
- `developer.app`, `developer.feature`
- `founder.startup`, `founder.product`
- `student.assignment`, `student.project`
- `personal.goal`, `personal.routine`
- `marketer.campaign` (with advanced FSM)

**Plan Templates**:

- `plan.weekly`, `plan.sprint`

**Output Templates**:

- `output.chapter`, `output.design`, `output.workout_plan`

**Document Templates**:

- `doc.brief`, `doc.notes`, `doc.intake`

---

### Core Project Entities

#### `onto_projects` (Top-level Projects)

```
id (uuid, pk)
org_id (uuid)
name (text, not null)
description (text)
type_key (text, not null) - references onto_templates.type_key
also_types (text array) - additional types
state_key (text, default 'draft')
props (jsonb) - custom properties per template

facet_context (generated) - extracted from props.facets.context
facet_scale (generated) - extracted from props.facets.scale
facet_stage (generated) - extracted from props.facets.stage

start_at (timestamptz)
end_at (timestamptz)
context_document_id (uuid fk → onto_documents)

created_by (uuid)
created_at (timestamptz)
updated_at (timestamptz)

Indexes: type_key, state_key, facet_context, facet_scale, facet_stage, props (gin), name (trgm), description (trgm)
```

**Example**:

```json
{
	"id": "proj-123",
	"type_key": "writer.book",
	"name": "My Novel",
	"props": {
		"genre": "science fiction",
		"target_word_count": 80000,
		"facets": {
			"context": "personal",
			"scale": "large",
			"stage": "planning"
		}
	},
	"state_key": "planning"
}
```

#### `onto_plans` (Project Plans/Phases)

```
id (uuid, pk)
project_id (uuid fk, cascade delete)
name (text, not null)
type_key (text, not null)
state_key (text, default 'draft')
props (jsonb)

facet_context (generated)
facet_scale (generated)
facet_stage (generated)

created_by (uuid)
created_at (timestamptz)
updated_at (timestamptz)
```

#### `onto_tasks` (Project Tasks)

> **Schema Reference**: See [TYPE_KEY_TAXONOMY.md](../../features/ontology/TYPE_KEY_TAXONOMY.md#onto_tasks) for task type_key documentation.

```
id (uuid, pk)
project_id (uuid fk, not null, cascade delete)
type_key (text, not null, default 'task.execute')  -- Work mode taxonomy
title (text, not null)
state_key (text, default 'todo')
priority (int, 1-5)
due_at (timestamptz)
props (jsonb)

facet_scale (generated from props.facets.scale)

created_by (uuid)
created_at (timestamptz)
updated_at (timestamptz)

Indexes: project, type_key, state_key, due_at, priority, props (gin), title (trgm)
```

**type_key Format**: `task.{work_mode}[.{specialization}]`

- Work modes: execute (default), create, refine, research, review, coordinate, admin, plan
- Specializations: task.coordinate.meeting, task.coordinate.standup, task.execute.deploy, task.execute.checklist

**Plan Relationships**: Via `onto_edges` table (not direct column)

- `belongs_to_plan` (task → plan)
- `has_task` (plan → task)

#### `onto_goals`, `onto_requirements` (Project Context)

```
onto_goals:
  id, project_id (fk), name, type_key, props, created_by, created_at

onto_requirements:
  id, project_id (fk), text, type_key, props, created_by, created_at
```

#### `onto_outputs` & `onto_output_versions` (Deliverables)

```
onto_outputs:
  id, project_id (fk), name, type_key, state_key, props, facet_stage (gen), created_by, created_at, updated_at

onto_output_versions:
  id, output_id (fk, cascade), number, storage_uri, props, created_by, created_at
  Unique: (output_id, number)
```

#### `onto_documents` & `onto_document_versions` (Context Documents)

```
onto_documents:
  id, project_id (fk), title, type_key, props, created_by, created_at

onto_document_versions:
  id, document_id (fk, cascade), number, storage_uri, embedding (vector), props, created_by, created_at
  Unique: (document_id, number)
```

**Example**: Context document for a project (stored via context_document_id FK in onto_projects).

#### `onto_sources` (External References)

```
id (uuid, pk)
project_id (uuid fk, cascade)
uri (text, not null)
snapshot_uri (text)
captured_at (timestamptz)
props (jsonb)
created_by (uuid)
created_at (timestamptz)
```

#### Supporting Tables: Decisions, Risks, Milestones, Metrics

```
onto_decisions:
  id, project_id (fk), title, decision_at (timestamptz), rationale, props, created_by, created_at

onto_risks:
  id, project_id (fk), title, type_key, probability (0-1), impact ('low'|'medium'|'high'), state_key, props, created_by, created_at

onto_milestones:
  id, project_id (fk), title, type_key, due_at (timestamptz), props, created_by, created_at

onto_metrics:
  id, project_id (fk), name, type_key, unit (text), definition, props, created_by, created_at

onto_metric_points:
  id, metric_id (fk, cascade), ts (timestamptz), numeric_value, props, created_at
```

---

### Relationships & Access Control

#### `onto_edges` (Graph Relationships)

```
id (uuid, pk)
src_kind (text) - entity type
src_id (uuid)
rel (text) - relationship name
dst_kind (text)
dst_id (uuid)
props (jsonb)
created_at (timestamptz)

Indexes: (src_kind, src_id), (dst_kind, dst_id), rel
```

**Example**:

```json
{
	"src_kind": "project",
	"src_id": "proj-123",
	"rel": "depends_on",
	"dst_kind": "project",
	"dst_id": "proj-456"
}
```

#### `onto_assignments` (Role-based Access)

```
id (uuid, pk)
actor_id (uuid fk → onto_actors, cascade)
object_kind (text)
object_id (uuid)
role_key (text)
created_at (timestamptz)

Unique: (actor_id, object_kind, object_id, role_key)
Indexes: actor_id, (object_kind, object_id)
```

#### `onto_permissions` (Access Control Lists)

```
id (uuid, pk)
actor_id (uuid fk)
role_key (text)
object_kind (text)
object_id (uuid)
access (text) - 'read'|'write'|'admin'
created_at (timestamptz)

Indexes: actor_id, role_key, (object_kind, object_id)
```

---

### Signals & Insights

#### `onto_signals` (Event Stream)

```
id (uuid, pk)
project_id (uuid fk, cascade)
ts (timestamptz, default now)
channel (text)
payload (jsonb)
created_at (timestamptz)

Indexes: project_id, ts, channel
```

#### `onto_insights` (Derived Intelligence)

```
id (uuid, pk)
project_id (uuid fk, cascade)
title (text)
derived_from_signal_id (uuid fk, set null)
props (jsonb)
created_at (timestamptz)

Indexes: project_id, derived_from_signal_id
```

---

### Database Helper Functions (RPC)

#### 1. JSON Helpers

```sql
-- Extract JSONB value
onto_jsonb_extract(jsonb, text → path) → jsonb

-- Extract JSONB as text
onto_jsonb_extract_text(jsonb, text → path) → text

-- Check if path has value
onto_jsonb_has_value(jsonb, text → path) → boolean
```

#### 2. FSM Guard Evaluation

```sql
-- Check single guard condition
onto_check_guard(guard: jsonb, entity: jsonb) → boolean
  Types: 'has_property', 'has_facet', 'facet_in', 'all_facets_set', 'type_key_matches'

-- Check all guards pass
onto_guards_pass(guards: jsonb[], entity: jsonb) → boolean
```

#### 3. Project & Transition Queries

```sql
-- Get project with template
get_project_with_template(project_id: uuid)
  → (project jsonb, template jsonb)

-- Get allowed state transitions
get_allowed_transitions(object_kind: text, object_id: uuid)
  → (event text, to_state text, guards jsonb, actions jsonb)

-- Get template catalog
get_template_catalog(scope: text, realm: text, search: text)
  → (id, scope, type_key, name, status, metadata, ...)

-- Validate facet values
validate_facet_values(facets: jsonb, scope: text)
  → (facet_key text, provided_value text, error text)
```

#### 4. Actor Management

```sql
-- Ensure actor exists for user
ensure_actor_for_user(user_id: uuid) → uuid
```

---

### Triggers

```sql
-- Auto-update updated_at on modification
trg_onto_templates_updated
trg_onto_projects_updated
trg_onto_plans_updated
trg_onto_tasks_updated
trg_onto_outputs_updated
```

---

## TRADITIONAL TASK MANAGEMENT SYSTEM

### Core Concept

Separate from ontology, this is the **primary user-facing system** for:

- Creating and managing tasks with calendar integration
- Organizing tasks into projects and phases
- Syncing with Google Calendar
- Time-blocking and scheduling

### Core Tables

#### 1. `projects` (User Projects)

```
id (uuid, pk)
user_id (uuid fk, cascade)
name (text, not null)
slug (text, not null)
description (text)
context (text) - rich context from brain dumps
status (text) - 'planning'|'active'|'completed'

calendar_color_id (text)
calendar_settings (jsonb)
calendar_sync_enabled (boolean)

start_date (timestamptz)
end_date (timestamptz)

source (text) - 'brain_dump'|'manual'
source_metadata (jsonb)

tags (text array)
created_at (timestamptz)
updated_at (timestamptz)
```

#### 2. `project_calendars` (Per-Project Google Calendar)

```
id (uuid, pk)
user_id (uuid fk)
project_id (uuid fk, cascade)

calendar_id (text, not null) - Google Calendar ID
calendar_name (text)

color_id (text) - Google color code
hex_color (text)

is_primary (boolean)
visibility (text)

sync_enabled (boolean)
sync_status (text)
sync_error (text)
last_synced_at (timestamptz)

created_at (timestamptz)
updated_at (timestamptz)

Index: (user_id, project_id)
```

**Purpose**: Each project can have 1+ Google Calendars. Enables per-project calendar sync.

#### 3. `phases` (Task Groupings)

```
id (uuid, pk)
user_id (uuid fk)
project_id (uuid fk, cascade)

name (text, not null)
description (text)
order (int)

start_date (timestamptz)
end_date (timestamptz)

scheduling_method (text) - strategy used

created_at (timestamptz)
updated_at (timestamptz)

Index: (project_id, order)
```

#### 4. `tasks` (Core Task Entity)

```
id (uuid, pk)
user_id (uuid fk)
project_id (uuid fk)
parent_task_id (uuid fk, self-ref, nullable)

title (text, not null)
description (text)
details (text)
task_type (text) - 'once'|'recurring'|'templated'
status (text) - 'todo'|'in_progress'|'completed'
priority (text)

start_date (timestamptz)
completed_at (timestamptz)
deleted_at (timestamptz)

duration_minutes (int)

recurrence_pattern (text) - RRULE
recurrence_ends (timestamptz)
recurrence_end_source (text)

source_calendar_event_id (text) - Google Event ID (optional)
task_steps (text json)
dependencies (text array)
outdated (boolean)

source (text) - 'brain_dump'|'calendar'|'manual'
created_at (timestamptz)
updated_at (timestamptz)

Indexes: (project_id, status), (user_id, status), parent_task_id, source_calendar_event_id
```

#### 5. `phase_tasks` (Task-Phase Relationship)

```
id (uuid, pk)
phase_id (uuid fk, cascade)
task_id (uuid fk, cascade)

order (int)
suggested_start_date (timestamptz)
assignment_reason (text)

created_at (timestamptz)

Unique: (phase_id, task_id)
Index: (phase_id, order)
```

---

### Calendar Integration

#### 6. `task_calendar_events` (Sync Point Between Tasks & Google Calendar)

```
id (uuid, pk)
user_id (uuid fk, cascade)
task_id (uuid fk, cascade)

calendar_id (text, not null) - Google Calendar ID
calendar_event_id (text, not null) - Google Event ID
project_calendar_id (uuid fk → project_calendars, nullable)

event_title (text)
event_start (timestamptz)
event_end (timestamptz)
event_link (text)

organizer_email (text)
organizer_display_name (text)
organizer_self (boolean) - TRUE if user is organizer
attendees (jsonb array) - Attendee list

recurrence_rule (text) - RRULE
recurrence_master_id (text) - Parent recurrence ID
recurrence_instance_date (timestamptz) - Date of this instance
original_start_time (timestamptz) - For exceptions

is_master_event (boolean)
is_exception (boolean)
exception_type (text) - 'thisEvent'|'thisAndFollowing'

sync_status (text) - 'synced'|'pending'|'error'
sync_source (text) - where sync came from
sync_version (int)
sync_error (text)
last_synced_at (timestamptz)

series_update_scope (text) - for series updates

created_at (timestamptz)
updated_at (timestamptz)

Indexes:
  - task_id
  - organizer_self
  - attendees (GIN)
```

**Attendees Structure**:

```json
[
	{
		"email": "attendee@example.com",
		"displayName": "John Doe",
		"organizer": false,
		"self": false,
		"responseStatus": "accepted|declined|tentative|needsAction",
		"comment": "optional message",
		"additionalGuests": 0
	}
]
```

#### 7. `project_calendars` Configuration

See above - manages which calendars sync to which projects.

#### 8. `user_calendar_tokens` (OAuth)

```
id (uuid, pk)
user_id (uuid fk, cascade)

access_token (text) - Google OAuth access token
refresh_token (text)
token_type (text)
scope (text)
expiry_date (timestamp)

google_user_id (text)
google_email (text)

created_at (timestamptz)
updated_at (timestamptz)
```

#### 9. `user_calendar_preferences` (User Settings)

```
id (uuid, pk)
user_id (uuid fk, unique, cascade)

work_start_time (time)
work_end_time (time)
working_days (int array) - 0=Sunday, 6=Saturday
prefer_morning_for_important_tasks (boolean)

min_task_duration_minutes (int)
max_task_duration_minutes (int)
default_task_duration_minutes (int)

exclude_holidays (boolean)
holiday_country_code (text)

created_at (timestamptz)
updated_at (timestamptz)
```

#### 10. `calendar_webhook_channels` (Real-time Sync)

```
id (uuid, pk)
user_id (uuid fk, cascade)

calendar_id (text)
channel_id (text, not null) - Google push notification channel ID
webhook_token (text, not null)
resource_id (text)
sync_token (text)

expiration (int) - Unix timestamp
created_at (timestamptz)
updated_at (timestamptz)

Index: (user_id, calendar_id)
```

**Purpose**: Enables Google Calendar push notifications (webhooks) for real-time sync without polling.

---

### Calendar Analysis System

#### 11. `calendar_analyses` (Analysis Sessions)

```
id (uuid, pk)
user_id (uuid fk, cascade)

status (text) - 'pending'|'processing'|'completed'|'error'

started_at (timestamptz)
completed_at (timestamptz)

date_range_start (timestamptz)
date_range_end (timestamptz)

calendars_analyzed (text array)
events_analyzed (int)
events_excluded (int)
projects_suggested (int)
projects_created (int)
tasks_created (int)

confidence_average (number)
processing_time_ms (int)
total_tokens_used (int)

ai_model (text)
ai_model_version (text)

error_message (text)
user_feedback (text)
user_rating (int)

updated_at (timestamptz)
```

#### 12. `calendar_analysis_events` (Events in Analysis)

```
id (uuid, pk)
analysis_id (uuid fk, cascade)

calendar_id (text)
calendar_event_id (text)
event_title (text)
event_start (timestamptz)
event_end (timestamptz)
event_location (text)
event_description (text)

attendee_count (int)
attendee_emails (text array)
is_organizer (boolean)
is_recurring (boolean)
recurrence_pattern (text)

included_in_analysis (boolean)
exclusion_reason (text)
suggestion_id (uuid fk → calendar_project_suggestions)

created_at (timestamptz)
```

#### 13. `calendar_project_suggestions` (AI Suggestions)

```
id (uuid, pk)
user_id (uuid fk, cascade)
analysis_id (uuid fk, cascade)

suggested_name (text)
suggested_description (text)
suggested_context (text)
suggested_priority (text)
suggested_tasks (jsonb)

calendar_event_ids (text array)
calendar_ids (text array)
event_count (int)

event_patterns (jsonb)
detected_keywords (text array)

confidence_score (number)
ai_reasoning (text)

status (text) - 'suggested'|'accepted'|'rejected'|'created_project'
status_changed_at (timestamptz)
rejection_reason (text)

created_project_id (uuid fk → projects)
tasks_created_count (int)

user_modified_name (text)
user_modified_description (text)
user_modified_context (text)

created_at (timestamptz)
updated_at (timestamptz)
```

#### 14. `calendar_analysis_preferences` (User Settings)

```
id (uuid, pk)
user_id (uuid fk, unique, cascade)

auto_analyze_on_connect (boolean)
analysis_frequency (text)
last_auto_analysis_at (timestamptz)

minimum_confidence_to_show (number)
auto_accept_confidence (number)

included_calendar_ids (text array)
excluded_calendar_ids (text array)
minimum_attendees (int)

exclude_all_day_events (boolean)
exclude_declined_events (boolean)
exclude_tentative_events (boolean)
create_tasks_from_events (boolean)

created_at (timestamptz)
updated_at (timestamptz)
```

---

### Time Blocking

#### 15. `time_blocks` (Calendar Blocks/Focus Time)

```
id (uuid, pk)
user_id (uuid fk, cascade)
project_id (uuid fk, nullable)

block_type (text) - 'focus'|'meeting'|'admin'|'break'
start_time (timestamptz)
end_time (timestamptz)
duration_minutes (int)

calendar_event_id (text, nullable) - linked Google Calendar event
calendar_event_link (text)

sync_status (text)
sync_source (text)
last_synced_at (timestamptz)

ai_suggestions (jsonb)
suggestions_state (jsonb)
suggestions_summary (text)
suggestions_generated_at (timestamptz)
suggestions_model (text)

timezone (text)
created_at (timestamptz)
updated_at (timestamptz)

Index: (user_id, start_time)
```

---

### Recurring Task Support

#### 16. `recurring_task_instances` (Instance Tracking)

```
id (uuid, pk)
user_id (uuid fk)
task_id (uuid fk, cascade)

instance_date (date)
status (text)
completed_at (timestamptz)

calendar_event_id (text, nullable)
notes (text)
skipped (boolean)

created_at (timestamptz)
updated_at (timestamptz)

Index: (task_id, instance_date)
```

#### 17. `recurring_task_migration_log` (Audit Trail)

```
id (uuid, pk)
user_id (uuid fk)
task_id (uuid fk)
project_id (uuid fk, nullable)

migration_type (text)
status (text)

old_calendar_event_id (text)
new_calendar_event_id (text)
old_recurrence_ends (timestamptz)
new_recurrence_ends (timestamptz)

error_message (text)
created_at (timestamptz)
updated_at (timestamptz)
```

---

## RELATIONSHIP MAP: Calendar Events ↔ Tasks & Projects

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Calendar API                       │
│           (External - OAuth Token Required)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓ (Sync via calendar-service.ts)
                         │
        ┌────────────────┴────────────────┐
        ↓                                  ↓
┌──────────────────┐            ┌──────────────────────┐
│ project_calendars│            │calendar_webhook_      │
│                  │            │channels               │
│ - calendar_id    │            │ (Push notifications)  │
│ - sync_enabled   │            └──────────────────────┘
│ - last_synced    │
└────────┬─────────┘
         │
         ↓ (references)
         │
┌────────────────────────────────────────────┐
│   task_calendar_events (PRIMARY SYNC)      │
│                                            │
│ - calendar_event_id (Google)               │
│ - calendar_id (Google)                     │
│ - task_id (BuildOS task)                   │
│ - organizer_self, attendees (new)          │
│                                            │
│ Sync Status: 'synced'|'pending'|'error'    │
│                                            │
└────────┬───────────────────────────────────┘
         │
         ↓ (fk_task_id)
         │
    ┌────────────┐
    │   tasks    │  ← User's actual task entity
    │            │
    │ - title    │
    │ - status   │
    │ - due_date │
    │ - project_id
    └────┬───────┘
         │
         ├──→ phase_tasks → phases (groupings)
         │
         ├──→ projects (parent)
         │
         └──→ project_calendars (calendar config)
```

---

## KEY RELATIONSHIPS & CONNECTIONS

### Task-Calendar Event Relationship

**One Task ↔ Many Calendar Events**:

- A task can have recurring instances (multiple calendar events)
- Use `recurrence_master_id` to track recurring series
- `is_exception` marks individual instance exceptions
- `series_update_scope` controls update scope ('single', 'all', 'future')

### Project Calendar Configuration

**Many Projects ↔ Many Calendars**:

- Each project can have multiple Google Calendars
- Calendar can sync to multiple projects (project_calendar_id in task_calendar_events)
- Each project_calendar record tracks: calendar_id, sync status, last_synced_at

### Organizer & Attendee Tracking

**New Capability** (2025-10-12):

- `organizer_self`: TRUE if user owns event, FALSE if external, NULL if unknown
- `attendees`: JSONB array with response status
- Enables:
    - Don't reschedule external events
    - Notify attendees when rescheduling
    - Track meeting attendance

### Phase Organization

**Task → Phase Relationship**:

- Via `phase_tasks` junction table
- Many tasks per phase
- Tasks ordered within phase
- Each task can only be in ONE phase (but parent_task_id allows nesting)

---

## DATA FLOW: BRAIN DUMP → CALENDAR

```
1. User Brain Dump
   │
   ├─→ AI Processing (dual-stage)
   │   ├─ Context Extraction
   │   └─ Task Extraction
   │
   ├─→ Project Creation (if new)
   │   └─ project_calendars (optional: link Google Calendar)
   │
   ├─→ Phase Generation
   │   └─ Create phases with dates
   │
   ├─→ Task Creation
   │   ├─ tasks (with start_date)
   │   └─ phase_tasks (assign to phase)
   │
   └─→ Calendar Scheduling (Optional)
       ├─ CalendarService.scheduleTask()
       ├─ Create Google Calendar event
       └─ task_calendar_events record (sync point)
           ├─ calendar_event_id
           ├─ task_id
           ├─ organizer_self
           └─ attendees
```

---

## INDEXES FOR PERFORMANCE

### task_calendar_events Indexes

```sql
-- Fast task lookups
CREATE INDEX idx_task_calendar_events_task_id
ON task_calendar_events(task_id);

-- Organizer ownership checks
CREATE INDEX idx_task_calendar_events_organizer_self
ON task_calendar_events(organizer_self);

-- Attendee searches
CREATE INDEX idx_task_calendar_events_attendees
ON task_calendar_events USING GIN(attendees);
```

### NEW: Ontology Alignment Tables (2025-11 Pilot)

To connect legacy scheduling with ontology entities, three new tables land in the Supabase schema:

#### 7. `legacy_entity_mappings`

- Columns: `legacy_table`, `legacy_id`, `onto_table`, `onto_id`, `checksum`, `metadata`, `migrated_at`.
- Guarantees uniqueness per legacy + ontology pair and is the canonical lookup surface for API routes/background jobs.
- Nightly diff jobs compare source table counts with this registry before flipping feature flags.

#### 8. `onto_events`

- Mirrors other `onto_*` tables (`type_key`, `state_key`, `template_*`, `facet_*`, `props`) but models calendar events.
- Ownership is recorded via `owner_entity_type/owner_entity_id` (task, plan, project, goal, output, actor, standalone).
- `project_id` is nullable so events can live outside projects during the transition; migrations populate it whenever an ontology project exists.
- Validates time ranges (all-day vs. start/end) and reuses the shared `set_updated_at()` trigger for auditing.

#### 9. `onto_event_sync`

- Separate table for provider-specific IDs so the core event row stays provider-agnostic.
- Constraints: `UNIQUE(calendar_id, provider, external_event_id)` prevents duplicates when events appear on multiple calendars.
- Tracks sync tokens/status/errors per provider to enable multi-calendar support.

### Dual-write Path (CalendarService)

- `apps/web/src/lib/services/calendar-service.ts#scheduleTask` now:
    1. Upserts the legacy `task_calendar_events` row (same behavior as before).
    2. Looks up ontology IDs via `legacy_entity_mappings`.
    3. Calls `OntoEventService.createEvent` to materialize the `onto_events` record plus props (`legacy_*` ids, attendees, organizer, Google metadata).
- Failures in the ontology write are logged but do **not** block Google Calendar syncs; this lets us enable dual-write per org after migrations complete.
- The new service lives at `apps/web/src/lib/services/ontology/onto-event.service.ts` and centralizes template snapshot handling, owner validation, and filtering helpers.

### Legacy Mapping Sync

- `supabase/migrations/20251122_legacy_mapping_backfill.sql` introduces:
    - `upsert_legacy_entity_mapping` (helper function) and `sync_legacy_mapping_from_props` (generic trigger) to mirror `props.legacy_id` into the mapping table any time an `onto_projects` or `onto_tasks` row changes.
    - A backfill that ingests existing ontology rows plus indexes `project_calendars.onto_project_id`.
    - An automatic update of `project_calendars.onto_project_id` whenever a matching mapping exists so APIs can pivot to ontology IDs without an extra query.
- Migration code that creates ontology entities must continue to set `props.legacy_id`; the trigger takes care of creating/updating the mapping row and keeps `CalendarService` dual-write lookups fast.
- Monitoring jobs can rely exclusively on `legacy_entity_mappings` for parity counts (versus scanning JSON in every `onto_*` table).

### onto\_\* Indexes

```sql
-- Type and state lookups
CREATE INDEX idx_onto_projects_type_key ON onto_projects(type_key);
CREATE INDEX idx_onto_projects_state ON onto_projects(state_key);

-- Full-text search
CREATE INDEX idx_onto_projects_name ON onto_projects USING gin (name gin_trgm_ops);

-- Facet filtering
CREATE INDEX idx_onto_projects_facet_context ON onto_projects(facet_context);
CREATE INDEX idx_onto_projects_facet_scale ON onto_projects(facet_scale);
CREATE INDEX idx_onto_projects_facet_stage ON onto_projects(facet_stage);

-- JSONB queries
CREATE INDEX idx_onto_projects_props ON onto_projects USING gin (props jsonb_path_ops);
```

---

## TRIGGERS

### Auto-Update Timestamps

```sql
-- Automatically set updated_at on modification
trg_onto_templates_updated (onto_templates)
trg_onto_projects_updated (onto_projects)
trg_onto_plans_updated (onto_plans)
trg_onto_tasks_updated (onto_tasks)
trg_onto_outputs_updated (onto_outputs)
```

---

## IMPORTANT NOTES

### 1. Two Separate Systems

The **ontology system** (onto\_\*) and **traditional system** (projects/tasks) are **currently independent**:

- Ontology: Template-driven, FSM-based, newer, more sophisticated
- Traditional: User-facing, calendar-integrated, established feature set

**No edges connect them currently**. They could be bridged in future.

### 2. Calendar Sync Direction

- **Google → BuildOS**: Events synced into `task_calendar_events`
- **BuildOS → Google**: Tasks can be scheduled as Google Calendar events
- **Two-way**: Changes synced bidirectionally (with update_scope control)

### 3. Recurring Event Handling

- Master event tracked with `recurrence_master_id`
- Individual instances have `recurrence_instance_date`
- Exceptions marked with `is_exception` and `exception_type`
- Updates can target: 'single', 'all', or 'future' instances

### 4. User Context Preservation

- `organizer_self` prevents modifying external events
- `attendees` enables notification on changes
- Important for: Phase regeneration, rescheduling, conflict detection

### 5. Faceted Metadata (Ontology Only)

- 3 facets: context, scale, stage
- Applied at: project, plan, task (task only for scale), output (only for stage)
- Searchable via facet-specific indexes
- Enables filtering by context (e.g., "show me all startup projects")

---

## RELATED DOCUMENTATION

- **Calendar Integration**: `/apps/web/docs/features/calendar-integration/`
- **Ontology System**: `/apps/web/docs/features/ontology/`
- **Calendar Service**: `/apps/web/src/lib/services/calendar-service.ts`
- **Ontology Schema**: `/supabase/migrations/20250601000001_ontology_system.sql`
- **Calendar Organizer Fields**: `/supabase/migrations/20251012_add_calendar_event_organizer_fields.sql`
