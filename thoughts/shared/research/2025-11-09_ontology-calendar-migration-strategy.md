---
date: 2025-11-09T10:30:00-08:00
researcher: Claude
repository: buildos-platform
topic: 'Ontology Calendar Migration Strategy'
tags: [research, buildos, ontology, calendar, migration, architecture]
status: complete
path: thoughts/shared/research/2025-11-09_ontology-calendar-migration-strategy.md
---

# Research: Ontology Calendar Migration Strategy

## Executive Summary

After analyzing the BuildOS codebase, I recommend creating a separate `onto_events` table that serves as a flexible event entity within the ontology system, with optional relationships to tasks rather than direct coupling. This approach aligns with the ontology's entity autonomy framework and allows events to exist independently while maintaining optional associations with tasks, projects, and other entities.

## Audit Adjustments (2025-11-10)

- **Schema alignment**: mirror existing `onto_*` patterns (`project_id`, `org_id`, `created_by`, `state_key`, generated facet columns) so RLS, triggers, and shared helpers can be reused without bespoke policies.
- **Ownership metadata**: add `owner_entity_type/owner_entity_id` plus optional `project_id` to make per-project querying fast while still allowing standalone events tied to any ontology entity through edges.
- **Calendar sync isolation**: move provider-specific identifiers to a dedicated `onto_event_sync` table with uniqueness constraints so events can sync with multiple calendars without duplicating fields on the core record.
- **Dual-write + validation gates**: every phase now has explicit exit criteria (unit tests, row counts, sync-diff dashboards) to avoid cutting over to the new table before data parity is proven.
- **Legacy mapping discipline**: require `legacy_task_calendar_event_id`, `legacy_task_id`, and `legacy_project_id` in `props` for every migrated record to make rollback/reporting deterministic.

## Research Question

Should calendar events be migrated to a separate `onto_events` table within the ontology system, and how should the relationship between events and tasks be structured?

## Key Findings

### Finding 1: Two Parallel Systems Currently Exist

**Current State**:
- **Traditional System**: `projects`, `tasks`, `task_calendar_events` (primary user-facing)
- **Ontology System**: `onto_*` tables (23 tables, template-driven, FSM-enabled)
- **No Integration**: These systems operate completely independently

**Calendar Integration Points**:
- `task_calendar_events` bridges traditional tasks to Google Calendar
- `project_calendars` manages calendar connections per project
- Bidirectional sync with organizer/attendee awareness (added 2025-10-12)

### Finding 2: Ontology's Entity Autonomy Principle

**Documentation**: `/apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md`

The ontology system follows an **entity autonomy framework** where:
- Each entity type can exist independently
- Relationships are managed through `onto_edges` table
- Entities have their own lifecycle via FSM states
- Template inheritance provides consistency

**This supports having events as first-class entities** rather than just task attachments.

### Finding 3: Current Event-Task Coupling Issues

**Problems with Current Design**:
1. **Tight Coupling**: Events can only exist if attached to tasks
2. **Limited Flexibility**: Can't represent standalone events (meetings, appointments, deadlines)
3. **Duplication**: Similar event data might be stored multiple times for related tasks
4. **Calendar Sync Complexity**: Must always go through task layer

## Proposed Architecture: onto_events Table

### Table Structure

```sql
CREATE TABLE onto_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant + affinity
  org_id UUID,
  project_id UUID REFERENCES onto_projects(id) ON DELETE CASCADE,

  -- Ownership + typing
  owner_entity_type TEXT NOT NULL CHECK (
    owner_entity_type IN ('project','plan','task','goal','output','actor','standalone')
  ),
  owner_entity_id UUID,
  type_key TEXT NOT NULL,
  state_key TEXT NOT NULL DEFAULT 'scheduled',
  template_id UUID REFERENCES onto_templates(id),
  template_snapshot JSONB NOT NULL,

  -- User-facing fields
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT,
  recurrence JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Calendar + metadata
  external_link TEXT,
  props JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Sync lifecycle
  last_synced_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  sync_error TEXT,
  deleted_at TIMESTAMPTZ,

  -- Facet projections
  facet_context TEXT GENERATED ALWAYS AS (props->'facets'->>'context') STORED,
  facet_scale TEXT GENERATED ALWAYS AS (props->'facets'->>'scale') STORED,
  facet_stage TEXT GENERATED ALWAYS AS (props->'facets'->>'stage') STORED,

  -- Audit
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT owner_requires_id CHECK (
    (owner_entity_type = 'standalone' AND owner_entity_id IS NULL)
    OR (owner_entity_type <> 'standalone' AND owner_entity_id IS NOT NULL)
  ),
  CONSTRAINT valid_time_range CHECK (
    all_day = TRUE OR end_at IS NULL OR end_at > start_at
  )
);

-- Indexes & trigger
CREATE INDEX idx_onto_events_project ON onto_events(project_id);
CREATE INDEX idx_onto_events_org ON onto_events(org_id);
CREATE INDEX idx_onto_events_owner ON onto_events(owner_entity_type, owner_entity_id);
CREATE INDEX idx_onto_events_type_key ON onto_events(type_key);
CREATE INDEX idx_onto_events_state_key ON onto_events(state_key);
CREATE INDEX idx_onto_events_start_at ON onto_events(start_at);
CREATE INDEX idx_onto_events_facets ON onto_events USING GIN ((props->'facets'));
CREATE INDEX idx_onto_events_props_path ON onto_events USING GIN (props jsonb_path_ops);
CREATE INDEX idx_onto_events_sync_status ON onto_events(sync_status);
CREATE INDEX idx_onto_events_active ON onto_events(deleted_at) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_onto_events_updated
  BEFORE UPDATE ON onto_events
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
```

#### Ownership & Relationship Semantics

- `owner_entity_type/owner_entity_id` pins the event to the entity that should answer `SELECT * FROM onto_events WHERE owner = ...` (e.g., the task you scheduled time for). This unlocks simple filters without denormalizing the entire edge graph.
- `project_id` is nullable so we can support cross-project and personal events, but migrations must populate it whenever the owner entity already has a project to satisfy existing dashboards and RLS shortcuts.
- Additional relationships (deadline_for, review_of, milestone_for, etc.) continue to live inside `onto_edges`, keeping the schema consistent with the broader ontology graph.

### Event Templates

Create base event templates following ontology patterns:

```typescript
// Base event template
{
  type_key: "event.base",
  name: "Base Event",
  scope: "event",
  fsm: {
    states: ["scheduled", "in_progress", "completed", "cancelled"],
    initial: "scheduled",
    transitions: [
      { from: "scheduled", to: "in_progress", event: "start" },
      { from: "scheduled", to: "cancelled", event: "cancel" },
      { from: "in_progress", to: "completed", event: "complete" }
    ]
  }
}

// Specific event types
{
  type_key: "event.meeting",
  parent_key: "event.base",
  name: "Meeting",
  props: {
    meeting_type: "enum:standup,planning,review,1on1,all_hands",
    agenda: "string",
    minutes: "string",
    action_items: "array"
  }
}

{
  type_key: "event.deadline",
  parent_key: "event.base",
  name: "Deadline",
  props: {
    deliverable_type: "string",
    completion_criteria: "array"
  }
}

{
  type_key: "event.milestone",
  parent_key: "event.base",
  name: "Milestone",
  props: {
    success_criteria: "array",
    dependencies: "array"
  }
}
```

## Relationship Design: Events ↔ Tasks

### Option 1: Loose Coupling via onto_edges (RECOMMENDED)

Use the existing `onto_edges` table for flexible relationships:

```sql
-- Event linked to task
INSERT INTO onto_edges (
  from_entity_id,    -- onto_events.id
  from_entity_type,  -- 'event'
  to_entity_id,      -- onto_tasks.id
  to_entity_type,    -- 'task'
  edge_type,         -- 'schedules', 'deadline_for', 'blocks', etc.
  metadata           -- Additional relationship data
);
```

**Advantages**:
- Maximum flexibility - events can relate to tasks, projects, goals, etc.
- Supports multiple relationship types (deadline_for, schedules, triggers, blocks)
- Events can exist independently (standalone meetings, appointments)
- Clean separation of concerns

**Example Relationships**:
- `event -[schedules]-> task` - Event represents scheduled work time for task
- `event -[deadline_for]-> task` - Event is the deadline for task completion
- `event -[blocks]-> task` - Event blocks task execution (dependency)
- `event -[milestone_for]-> project` - Event marks project milestone
- `event -[review_of]-> output` - Event is review meeting for output

### Option 2: Optional Direct Reference

Add optional `event_id` to `onto_tasks`:

```sql
ALTER TABLE onto_tasks ADD COLUMN event_id UUID REFERENCES onto_events(id);
```

**Not Recommended** - This creates asymmetric coupling and limits flexibility.

## Migration Strategy

### Phase 1: Foundation (Week 1)

1. **Create onto_events table**
   ```sql
   -- Migration file: create_onto_events_table.sql
   ```

2. **Create event templates**
   ```sql
   -- Insert base templates into onto_templates
   ```

3. **Create event service layer**
   ```typescript
   // /src/lib/services/ontology/event.service.ts
   export class OntoEventService {
     async createEvent(event: CreateEventDto) { }
     async updateEvent(id: string, updates: UpdateEventDto) { }
     async linkToTask(eventId: string, taskId: string, relationType: string) { }
   }
   ```

### Phase 2: Calendar Integration Migration (Week 2)

1. **Update project_calendars to reference onto_projects**
   ```sql
   ALTER TABLE project_calendars
   ADD COLUMN onto_project_id UUID REFERENCES onto_projects(id);

   -- Migrate existing relationships
   UPDATE project_calendars pc
   SET onto_project_id = op.id
   FROM projects p
   JOIN onto_projects op ON op.legacy_id = p.id
   WHERE pc.project_id = p.id;
   ```
   After the backfill passes validation, add a `CHECK ((project_id IS NOT NULL) <> (onto_project_id IS NOT NULL))` to enforce single ownership during the transition, then drop the legacy `project_id` once all consumers use ontology IDs.

2. **Create onto_event_sync bridge table**
  ```sql
  CREATE TABLE onto_event_sync (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES onto_events(id) ON DELETE CASCADE,
    calendar_id UUID NOT NULL REFERENCES project_calendars(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- google, outlook, apple, etc.
    external_event_id TEXT NOT NULL,
    sync_token TEXT,
    sync_status TEXT NOT NULL DEFAULT 'pending',
    sync_error TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (calendar_id, provider, external_event_id)
  );

  CREATE INDEX idx_onto_event_sync_event ON onto_event_sync(event_id);
  CREATE INDEX idx_onto_event_sync_calendar ON onto_event_sync(calendar_id);

  CREATE TRIGGER trg_onto_event_sync_updated
    BEFORE UPDATE ON onto_event_sync
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
  ```
  The sync table keeps provider-specific identifiers out of the core event row so we can attach multiple calendars (personal + shared) to the same ontology event without duplicating event metadata.

3. **Update calendar service**
   ```typescript
   // Support both old and new systems during transition
   class CalendarService {
     async syncEvent(event: OntoEvent | Task) {
       if (isOntoEvent(event)) {
         // New ontology sync
       } else {
         // Legacy task sync
       }
     }
   }
   ```

### Phase 3: Data Migration (Week 3-4)

1. **Migrate existing calendar events**
   ```sql
   WITH base_template AS (
     SELECT id, to_jsonb(tpl.*) AS snapshot
     FROM onto_templates tpl
     WHERE tpl.type_key = 'event.task_work'
     LIMIT 1
   )
   INSERT INTO onto_events (
     org_id,
     project_id,
     owner_entity_type,
     owner_entity_id,
     type_key,
     state_key,
     template_id,
     template_snapshot,
     title,
     description,
     start_at,
     end_at,
     timezone,
     props,
     created_by
   )
   SELECT
     op.org_id,
     ot.project_id,
     'task',
     ot.id,
     'event.task_work',
     'scheduled',
     bt.id,
     bt.snapshot,
     COALESCE(tce.summary, t.title),
     tce.description,
     tce.start_time,
     tce.end_time,
     tce.timezone,
     jsonb_build_object(
       'legacy_task_calendar_event_id', tce.id,
       'legacy_task_id', t.id,
       'legacy_project_id', t.project_id,
       'attendees', tce.attendees,
       'organizer', jsonb_build_object(
         'email', tce.organizer_email,
         'display_name', tce.organizer_display_name,
         'is_self', tce.organizer_self
       )
     ),
     ot.created_by
   FROM task_calendar_events tce
   JOIN tasks t ON t.id = tce.task_id
   JOIN onto_tasks ot ON ot.legacy_id = t.id
   JOIN onto_projects op ON op.id = ot.project_id,
   base_template bt;
   ```

2. **Backfill onto_event_sync**
   ```sql
   INSERT INTO onto_event_sync (
     event_id,
     calendar_id,
     provider,
     external_event_id,
     sync_status,
     sync_error,
     last_synced_at
   )
   SELECT
     oe.id,
     pc.id,
     pc.provider,
     tce.calendar_event_id,
     CASE WHEN tce.sync_error IS NULL THEN 'synced' ELSE 'error' END,
     tce.sync_error,
     tce.last_synced_at
   FROM task_calendar_events tce
   JOIN project_calendars pc ON pc.calendar_id = tce.calendar_id
   JOIN onto_events oe
     ON (oe.props->>'legacy_task_calendar_event_id')::uuid = tce.id;
   ```

3. **Create edge relationships**
   ```sql
   -- Link events to tasks
   INSERT INTO onto_edges (
     from_entity_id,
     from_entity_type,
     to_entity_id,
     to_entity_type,
     edge_type
   )
   SELECT
     oe.id,
     'event',
     ot.id,
     'task',
     'schedules'
   FROM onto_events oe
   JOIN onto_tasks ot ON ot.legacy_id = (oe.props->>'legacy_task_id')::uuid;
   ```

### Phase 4: UI Integration (Week 4-5)

1. **Create event components**
   ```svelte
   <!-- /src/lib/components/ontology/events/ -->
   - EventCreateModal.svelte
   - EventEditModal.svelte
   - EventCalendarView.svelte
   - EventList.svelte
   ```

2. **Update task modals to optionally create/link events**

3. **Add event management to project views**

### Phase 5: Deprecation (Week 6+)

1. **Dual-write period** - Write to both systems
2. **Validation** - Ensure data consistency
3. **Cutover** - Switch reads to new system
4. **Cleanup** - Remove old tables and code

### Phase Exit Criteria & Validation Gates

- **Phase 1 (Foundation)**: `onto_events` + `onto_event_sync` migrations run cleanly in staging, RLS policies mirror `onto_tasks`, and unit tests cover create/update/delete flows plus template snapshot persistence.
- **Phase 2 (Integration)**: Dual-write flag enabled for internal org, sync worker metrics show <1% error rate, and `project_calendars` rows have both legacy + ontology references populated.
- **Phase 3 (Data Migration)**: Row-count parity dashboards comparing `task_calendar_events` vs `onto_events` match within ±0.1%, and backfill scripts emit a reconciliation CSV for manual audit.
- **Phase 4 (UI)**: Feature flag–guarded UI renders both legacy + ontology events identically in Storybook visual tests and Cypress regression suites.
- **Phase 5 (Deprecation)**: 2-week dual-write period completed with zero drift detected by nightly diff jobs before legacy tables are frozen.

## Benefits of This Approach

### 1. **Flexibility**
- Events can exist independently (meetings without tasks)
- Multiple relationship types between entities
- Events can relate to multiple entities (task + project + goal)

### 2. **Clean Architecture**
- Follows ontology's entity autonomy principle
- Consistent with template/FSM patterns
- Uses existing edge system for relationships

### 3. **Better User Experience**
- Create events directly without requiring tasks
- View all events in unified calendar
- Richer event types (meetings, deadlines, milestones)

### 4. **Easier Calendar Sync**
- Direct event ↔ Google Calendar mapping
- No task intermediary required
- Simpler sync logic

### 5. **Future Extensibility**
- Easy to add new event types via templates
- FSM enables workflow automation
- Facets enable powerful filtering

## Implementation Checklist

### Database
- [ ] Create `onto_events` table migration
- [ ] Create event template seeds
- [ ] Add indexes for performance
- [ ] Create RLS policies

### Backend Services
- [ ] Create `OntoEventService`
- [ ] Update `CalendarService` for dual support
- [ ] Create event CRUD endpoints
- [ ] Add event-task relationship endpoints

### Frontend Components
- [ ] Create `EventCreateModal`
- [ ] Create `EventEditModal`
- [ ] Create `EventCalendarView`
- [ ] Update `TaskEditModal` for event linking

### Migration Scripts
- [ ] Script to migrate `task_calendar_events`
- [ ] Script to create edge relationships
- [ ] Script to update `project_calendars`
- [ ] Validation scripts for data integrity

### Testing
- [ ] Unit tests for event service
- [ ] Integration tests for calendar sync
- [ ] E2E tests for event UI
- [ ] Migration validation tests

## Risk Mitigation

### Risk 1: Data Loss During Migration
**Mitigation**:
- Dual-write period
- Comprehensive backup before migration
- Validation scripts at each phase
- Ability to rollback via legacy_id references

### Risk 2: Calendar Sync Disruption
**Mitigation**:
- Maintain backward compatibility during transition
- Test thoroughly with sandbox Google Calendar
- Monitor sync errors closely
- Gradual rollout by user cohort

### Risk 3: User Confusion
**Mitigation**:
- Clear communication about benefits
- Maintain familiar UI patterns
- Provide migration guide
- Keep old views available initially

## Recommendations

1. **Start with onto_events table** - This is the foundation and low-risk
2. **Implement basic CRUD first** - Get the entity working before relationships
3. **Test calendar sync thoroughly** - This is the most complex integration
4. **Use feature flags** - Roll out gradually to users
5. **Keep legacy fields** - Store old IDs for rollback capability

## Related Research

- `/apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md` - Entity autonomy framework
- `/apps/web/docs/features/ontology/DATA_MODELS.md` - Existing ontology schema
- `/thoughts/shared/research/2025-11-04_ontology-template-gaps-analysis.md` - Template patterns

## File References

Critical files for implementation:

- `apps/web/src/lib/services/calendar-service.ts` - Current calendar integration
- `apps/web/src/lib/services/ontology/task.service.ts` - Reference for event service
- `apps/web/src/lib/components/ontology/TaskCreateModal.svelte` - Reference for event UI
- `packages/shared-types/src/database.schema.ts` - Database types
- `apps/web/docs/features/ontology/README.md` - Ontology documentation

---

**Conclusion**: Creating a separate `onto_events` table with loose coupling to tasks via the edges system is the recommended approach. This aligns with the ontology's design principles, provides maximum flexibility, and enables a cleaner calendar integration while supporting the planned migration from the traditional system to the ontology system.
