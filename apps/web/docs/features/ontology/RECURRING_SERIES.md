<!-- apps/web/docs/features/ontology/RECURRING_SERIES.md -->

# Recurring Task Series

**Last Updated**: November 8, 2025  
**Status**: ✅ Phase 1 shipping  
**Owner**: Ontology Platform Team

## Why we built this

The original ontology tasks treated recurrence as its own template (`task.recurring-task`). That prevented teams from taking an existing quick action, milestone, or deep work item and simply repeating it. The new **Series Master** pattern makes recurrence a _behavior_:

- Any ontology task can become a series master after creation.
- Series metadata lives in `props`, so we avoid schema migrations.
- Instances inherit the master’s template/type information but remain fully editable atomic tasks.

Phase 1 covers “make recurring”, list metadata, and delete a series. Phase 2 will add editing/regeneration and smarter automation.

---

## Architecture Overview

### Data model (props-driven)

All series metadata sits inside `onto_tasks.props`:

```jsonc
// Master task
{
  "series_id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
  "series": {
    "id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
    "role": "master",
    "timezone": "America/Los_Angeles",
    "rrule": "RRULE:FREQ=WEEKLY;COUNT=8",
    "dtstart": "2025-11-12T09:00:00-08:00",
    "regenerate_on_update": false,
    "instance_count": 8,
    "last_generated_at": "2025-11-08T01:03:11.500Z",
    "master_task_id": "task-master-uuid"
  }
}

// Instance task
{
  "series_id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
  "series": {
    "id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
    "role": "instance",
    "index": 2,
    "master_task_id": "task-master-uuid",
    "timezone": "America/Los_Angeles"
  },
  "recurrence": {
    "rrule": "RRULE:FREQ=WEEKLY;COUNT=8",
    "index": 2,
    "occurrence_at": "2025-11-26T17:00:00Z",
    "local_occurrence_at": "2025-11-26T09:00:00-08:00",
    "source_entity_id": "task-master-uuid",
    "source_type_key": "task.quick-action"
  }
}
```

- `series_id` is duplicated at the top level for low-cost filtering and has a dedicated partial index (`idx_onto_tasks_series_id`).
- No new columns were added; everything remains backwards compatible.

### Database helpers

`supabase/migrations/20251108_task_series_functions.sql` ships two RPCs:

| Function             | Purpose                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `task_series_enable` | Wrap the “update master + insert N instances” sequence in a single transaction.                           |
| `task_series_delete` | Delete or detach all instances for a `series_id`, honoring `force` when we want to remove completed work. |

Both functions run as `security invoker` because the REST endpoints already operate behind RLS using `locals.supabase`.

### Service layer

`apps/web/src/lib/services/task-series.service.ts`

- Validates the user-supplied timezone via `Intl.supportedValuesOf` (falls back to `DateTimeFormat`).
- Normalizes RRULE strings (`RRULE:` prefix is optional for callers).
- Builds occurrences with the `rrule` library + `date-fns-tz` so DST transitions stay correct.
- Deep clones task props before stamping `series` metadata to avoid cross-contaminating master/instance records.
- Hard caps generation to 200 instances per request (default 52) to keep payloads sane.

### REST API

| Endpoint                                 | Description                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `POST /api/onto/tasks/:taskId/series`    | Convert a task into a series master and immediately generate instances.  |
| `DELETE /api/onto/task-series/:seriesId` | Remove the master + pending instances, or everything when `?force=true`. |

Request/response shapes are documented in `API_ENDPOINTS.md`. The endpoints respect the same actor/project ownership checks as other ontology routes because they reuse `locals.supabase`.

### UI integration

`TaskEditModal.svelte` now includes:

- A “Make Recurring” button for tasks that are not part of a series.
- A summary card when the task is a master (RRULE, timezone, instance count) with delete actions.
- A read-only notice for instances pointing back to the master.
- `TaskSeriesModal.svelte`, a wizard that collects timezone, start datetime, and RRULE options (frequency/interval/count) before calling the API.

The modal intentionally mirrors the backend RRULE builder so previews stay accurate.

---

## How to use it

1. Open any ontology task (project board → Task Edit Modal).
2. In the **Recurrence** card, choose **Make Recurring**.
3. Pick a timezone, confirm the start date, and choose frequency/interval/count.
4. Submit — the modal calls `POST /api/onto/tasks/:id/series`.
5. The modal refreshes and shows the series metadata; instances appear in task lists like any other task.

### Programmatic usage

```bash
curl -X POST https://app.buildos.com/api/onto/tasks/{taskId}/series \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "timezone": "America/New_York",
    "rrule": "FREQ=DAILY;COUNT=5",
    "start_at": "2025-11-10T13:30:00.000Z"
  }'
```

**Response**

```json
{
  "success": true,
  "data": {
    "series_id": "6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad",
    "master": { "...updated task..." },
    "instances": [{ "...child task..." }],
    "total_instances": 5
  }
}
```

To delete:

```bash
curl -X DELETE "https://app.buildos.com/api/onto/task-series/6671bfe9-0a45-4bb2-aa7a-2e62ac4db4ad?force=true"
```

---

## Testing checklist

- `POST /api/onto/tasks/:id/series` rejects invalid or blank timezones.
- Series master props show `series.role === 'master'` and `series_id` matches.
- Instances inherit `type_key`, `plan_id`, and cloned props but NOT `series_master`.
- DELETE without `force` keeps completed instances and only strips metadata.
- The Task Edit modal refreshes after making recurring and after deleting.
- Daylight saving transitions (e.g., `America/Los_Angeles` on Nov 3) keep the expected local times.

---

## Future phases

1. **Config edits** – `PATCH /api/onto/tasks/:id/series` to change RRULE/timezone and regenerate future instances.
2. **Dynamic generation** – spawn the next occurrence as soon as the current one completes (no large upfront batch).
3. **Analytics** – surface “N of M completed” in the series card and add filters for series masters/instances.

See `thoughts/shared/research/2025-11-07_recurrence-framework-design.md` for the long-form design notes.
