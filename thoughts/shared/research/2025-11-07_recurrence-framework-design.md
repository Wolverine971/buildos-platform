---
date: 2025-11-07T00:00:00Z
updated: 2025-11-08T00:00:00Z
researcher: Claude (revised by Codex)
repository: buildos-platform
topic: 'Flexible Recurrence Framework - Making ANY Task Type Recurring'
tags: [research, buildos, recurring-tasks, architecture, framework-design, fsm]
status: revised
---

# Research: Flexible Recurrence Framework Design (Timezone-Ready Series Master Plan)

## Why This Revision Exists
- Product asked for timezone-aware recurrence and a more explicit, fully executable plan.
- Earlier draft proved the Series Master concept but glossed over atomicity, query shapes, and real API flows.
- This version is the implementation blueprint senior ICs can follow without reopening the problem space.

## Goals & Non-Goals
| Goals | Non-Goals |
| --- | --- |
| Make any task type recurring post-creation | Rebuild task schema or add new tables in Phase 1 |
| Preserve timezone intent from UI through scheduling | Implement advanced “regenerate past instances” logic (Phase 2) |
| Keep tasks editable/independent once generated | Replace existing `schedule_rrule` action (we reuse it internally) |
| Provide auditable, transactional series creation/deletion flows | Ship dynamic “generate next on completion” (Phase 3) |

## Key Decisions (TL;DR)
1. **Series metadata lives in props but is normalized**: we store a top-level `props.series_id` for fast lookup, plus a `props.series` object with `role`, `index`, `timezone`, etc.
2. **Timezone is first-class**: the API requires a `timezone` (IANA tz database string) and an optional `start_at`. We feed both into `RRule` using `tzid` + `dtstart`, and persist the timezone on master + instance props.
3. **Atomic operations**: master updates + instance inserts run inside a single Postgres function (`rpc('task_series_enable')`) so we never leave a half-created series.
4. **API surface is explicit**: `POST /api/onto/tasks/:id/series` (create), `PATCH /api/onto/tasks/:id/series` (edit config only), `DELETE /api/onto/task-series/:seriesId` (cascade delete via master or admin).
5. **UI flow defers to backend authority**: UI collects recurrence config, shows timezone preview, and trusts API response for rendered tasks (no local RRULE computations besides previews).

---

## Architecture Overview

### Series Entity Model
```
Task (any template, any type)
   ↳ props.series.role === 'master'
   ↳ props.series.id === series UUID (mirrored in props.series_id)
Instances
   ↳ props.series.role === 'instance'
   ↳ props.series.master_task_id === master.id
   ↳ props.series.index === zero-based order
```

### JSON Schema
```json
// Master task additions
"props": {
  "series_id": "6671bfe9-...",
  "series": {
    "id": "6671bfe9-...",
    "role": "master",
    "timezone": "America/Los_Angeles",
    "rrule": "RRULE:FREQ=WEEKLY;COUNT=8",
    "dtstart": "2025-11-12T17:00:00.000-08:00",
    "regenerate_on_update": false,
    "instance_count": 8,
    "last_generated_at": "2025-11-08T01:02:03.000Z"
  }
}

// Instance additions
"props": {
  "series_id": "6671bfe9-...",
  "series": {
    "id": "6671bfe9-...",
    "role": "instance",
    "index": 2,
    "master_task_id": "task-master-uuid",
    "timezone": "America/Los_Angeles"
  },
  "recurrence": {
    "rrule": "RRULE:FREQ=WEEKLY;COUNT=8",
    "occurrence_at": "2025-11-26T01:00:00.000Z",
    "local_occurrence_at": "2025-11-25T17:00:00.000-08:00",
    "source_entity_id": "task-master-uuid",
    "source_type_key": "task.quick-action"
  }
}
```
*We mirror `series_id` to avoid expensive JSON path queries. Existing GIN index on `props` can filter by `series_id`, and we can add a partial index later if query volume warrants it.*

### Timezone & Scheduling Model
1. **Input**: UI collects `timezone`, `frequency` (RRULE builder), optional `count` or `until`, optional override for `start_at`. Default `start_at` is the task’s `due_at` (if undefined, we require the user to pick one).
2. **Computation**:
   - Convert `start_at` to a Luxon `DateTime` in the provided timezone.
   - Build an RRule via object syntax: `new RRule({ dtstart: date.toJSDate(), tzid: timezone, ... })` to ensure daylight saving correctness.
   - Persist `due_at` in UTC as usual, but keep `local_occurrence_at` for UI convenience.
3. **Display**: UI displays times in user locale but can fall back to `props.series.timezone` for clarity (e.g., “Weekly Team Sync · Every Wed · 5 PM PT”).

### Reuse of Existing Logic
- We call into the existing `schedule_rrule` helper for occurrence generation logic, but we wrap it so the master/instance props are stamped according to the schema above.
- FSM action `schedule_rrule` remains available for templates that need “stateless” recurrence, but the new API uses the transactional service.

---

## Sequence: “Make Task Recurring”
1. **User action**: Click *Make Recurring* on any task without `props.series`.
2. **Dialog** collects: frequency preset, custom RRULE builder, timezone (defaults to project timezone), start date/time (defaults to task’s `due_at`), count/`until`, optional `max_instances` cap, and `regenerate_on_update` toggle (default false).
3. **Submit** `POST /api/onto/tasks/:id/series`.
4. **Backend service** `enableTaskSeries`:
   - Loads task (with RLS) and ensures user can edit it.
   - Validates `timezone` using `moment-timezone` or `Intl.supportedValuesOf` polyfill; rejects invalid IANA strings.
   - Opens a Postgres transaction via RPC (SQL function shown later).
   - Updates master props with series metadata, sets `series_id`.
   - Generates occurrences (bounded by `MAX_OCCURRENCES`, default 52 unless user-provided lower cap).
   - Inserts instances (same `type_key`, `plan_id`, `priority`, `props` clone minus master-only nodes, plus recurrence metadata and new IDs).
   - Commits, returns master + limited list of freshly generated instances (paged if >25).
5. **UI refreshes** task detail + series drawer using response payload.

### Update Series Flow (Config Only)
- `PATCH /api/onto/tasks/:id/series` accepts new RRULE/timezone.
- Service updates master config, optionally generates **future** instances only (those with `state_key` still `todo` and `due_at >= now`). Past/complete tasks stay untouched.
- Response returns `modified_instance_ids` for UI diffing.

### Delete Series Flow
- `DELETE /api/onto/task-series/:seriesId` removes master + instances in a transaction. Guard rails:
  1. Hard delete only tasks still `todo` by default.
  2. If completed items exist, we either (a) soft delete master + upcoming, or (b) require `?force=true`. Spec sets default to (a) to avoid losing audit history.

---

## API Surface (Contracts)

### POST `/api/onto/tasks/:taskId/series`
Request:
```json
{
  "timezone": "America/Los_Angeles",
  "rrule": "RRULE:FREQ=WEEKLY;COUNT=8",
  "start_at": "2025-11-12T01:00:00.000Z", // optional, defaults to task.due_at
  "max_instances": 24,
  "regenerate_on_update": false
}
```
Response:
```json
{
  "ok": true,
  "series_id": "6671bfe9-...",
  "master": { /* updated master task */ },
  "instances": [ /* first N new tasks */ ],
  "total_instances": 8
}
```
Errors:
- 400 if task already part of a series or RRULE invalid.
- 409 if instance cap exceeded (`MAX_OCCURRENCES` default 200 to keep payloads sane).

### PATCH `/api/onto/tasks/:taskId/series`
- Body matches POST but all fields optional.
- Service only touches master config + regenerates **future** tasks when `regenerate_on_update=true`.

### DELETE `/api/onto/task-series/:seriesId`
- Query param `force=true` allows deleting completed instances, otherwise we only delete master + pending tasks.
- Returns `{ ok: true, deleted_master: 1, deleted_instances: 6 }`.

---

## Service Layer Pseudo-Code
```typescript
// apps/web/src/lib/services/task-series.service.ts
import { DateTime } from 'luxon';
import { RRule, Options as RRuleOptions } from 'rrule';

const MAX_OCCURRENCES = 200;

export async function enableTaskSeries(taskId: string, input: EnableSeriesInput) {
  const client = createServiceRoleClient();
  const task = await loadTaskForMutation(client, taskId);
  assertCanEdit(task);
  assertNotSeries(task);

  const timezone = validateTimezone(input.timezone);
  const startAt = resolveStart(task, input.start_at, timezone);
  const rule = buildRule({
    rrule: input.rrule,
    timezone,
    startAt,
    max: input.max_instances ?? MAX_OCCURRENCES
  });

  const occurrences = rule.all();
  const seriesId = crypto.randomUUID();

  return await client.rpc('task_series_enable', {
    task_id: taskId,
    series_id: seriesId,
    master_props: buildMasterProps(task.props, {
      seriesId,
      timezone,
      rule,
      startAt,
      regenerate: input.regenerate_on_update ?? false,
      count: occurrences.length
    }),
    instance_rows: occurrences.map((dt, index) =>
      buildInstanceRow(task, {
        seriesId,
        timezone,
        occurrence: dt,
        index
      })
    )
  });
}
```

### SQL Helper (simplified)
```sql
create or replace function task_series_enable(
  task_id uuid,
  series_id uuid,
  master_props jsonb,
  instance_rows jsonb
) returns jsonb
language plpgsql security definer as $$
declare
  master onto_tasks%rowtype;
begin
  update onto_tasks
    set props = master_props,
        updated_at = now()
    where id = task_id
    returning * into master;

  insert into onto_tasks (project_id, plan_id, title, state_key, due_at,
                          priority, props, created_by)
  select (row ->> 'project_id')::uuid,...
  from jsonb_array_elements(instance_rows) as row;

  return jsonb_build_object('master', row_to_json(master),
                            'instances', instance_rows);
end;
$$;
```
*Final SQL will include explicit columns for clarity, run-time validation, and raise exceptions when inserts fail.*

---

## UI / UX Patterns
- **Entry point**: button on task detail and quick actions menu (hidden if task already in a series or is itself an instance).
- **Form**: wizard-style with preview calendar + timezone picker (defaults to user profile timezone, falls back to project timezone, then UTC). The preview uses the same RRULE parser to avoid surprise.
- **Series badges**: tasks with `props.series.role === 'master'` show “Recurring · Weekly (PT)”. Instances show “Part of Weekly Team Sync · #3 of 8”.
- **Management UI**: master task detail includes table of upcoming instances with delete/regenerate actions calling the PATCH/DELETE APIs.

---

## Implementation Plan

### Phase 1 (shipping now)
1. **Backend**
   - Add `task-series.service.ts` with enable/delete/get helpers.
   - Add RPC function for transactional master+instances writes.
   - Implement API routes:
     - `POST /api/onto/tasks/[id]/series`
     - `DELETE /api/onto/task-series/[seriesId]`
   - Update shared types + zod schemas with new props structure.
2. **Frontend**
   - Create recurrence dialog component (RRULE builder + timezone picker).
   - Wire *Make Recurring* button + optimistic UI refresh using API response.
   - Display series badges + upcoming list on task detail.
3. **Testing**
   - Unit: RRULE parsing helper, timezone validator.
   - Integration: API tests covering success, invalid tz, duplicate series, deletion rules.
4. **Docs**
   - Update `/apps/web/docs/features/ontology/README.md` with “Recurring Series” section referencing new props contract.

### Phase 2 (post-MVP)
- `PATCH /api/onto/tasks/:id/series` for config updates and optional regeneration.
- UI for editing frequency + preview of changes.
- Partial regeneration strategy (future-only) and conflict resolution (e.g., manually moved instances).

### Phase 3 (future)
- Dynamic generation on completion (auto-create next occurrence).
- Smart skip/snooze per instance.
- Analytics on completion rate per series.

---

## Risks & Mitigations
| Risk | Mitigation |
| --- | --- |
| Incorrect timezone conversions | Single helper for `resolveStart` + `buildRule`, unit tests with DST boundaries |
| Massive payloads when generating 365 tasks | Enforce `MAX_OCCURRENCES` (200 default) + `max_instances` input |
| Stale props when cloning instances | Deep copy + explicit removal of `series` master data before insert |
| Partial writes due to Supabase JS limitations | Server-side `task_series_enable` + `task_series_delete` RPCs |
| Query performance on series filtering | Mirror `series_id` in props, add partial GIN index `WHERE props ? 'series_id'` if needed |

---

## Next Steps Checklist
1. Finalize RPC contract + shared types.
2. Build recurrence dialog + timezone picker using existing `Select` + `TimezoneSelect` components.
3. Implement `POST /api/onto/tasks/:id/series` and `DELETE /api/onto/task-series/:seriesId` endpoints.
4. Validate with sample project + QA around DST transitions (Mar/Nov).
5. Document admin tooling for cleaning up corrupted series (should be rare once RPC is in place).

This spec supersedes the earlier draft; follow it end-to-end to deliver timezone-aware recurring tasks without schema migrations.
