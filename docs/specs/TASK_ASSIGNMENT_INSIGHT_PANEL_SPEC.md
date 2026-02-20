<!-- docs/specs/TASK_ASSIGNMENT_INSIGHT_PANEL_SPEC.md -->

# Task Assignment + Insight Panel Ownership Spec

## Status

| Attribute      | Value                                                                                   |
| -------------- | --------------------------------------------------------------------------------------- |
| Status         | Proposed                                                                                |
| Created        | 2026-02-19                                                                              |
| Owner          | Platform                                                                                |
| Scope          | Ontology task assignments, insight panel assignee UX, assignment + mention coordination |
| Companion Spec | `docs/specs/TASK_ASSIGNMENT_AND_MENTION_NOTIFICATION_SPEC.md`                           |

---

## Why this spec exists

The mention/tagging spec is strong, but assignments need their own implementation plan so users can clearly see who owns what, filter by assignee, and avoid notification spam when assignments and mentions happen together.

---

## User requirement synthesis

1. Task ownership must be explicit and visible.
2. A task can have zero, one, or multiple assignees.
3. Insight panels should show assignees directly on task rows.
4. Insight panels should filter tasks by assignee.
5. Assignment notifications and mention notifications should work together cleanly.

---

## Research findings: current `onto_assignments` vs actual runtime

### What exists

- `onto_assignments` table exists with generic shape: `actor_id`, `object_kind`, `object_id`, `role_key`.
    - `supabase/migrations/20250601000001_ontology_system.sql`
    - `packages/shared-types/src/database.schema.ts`

### What does not exist

- No active project/task API flow currently reads or writes `onto_assignments` for task ownership.
- No task modal or project task list currently renders assignees.
- No assignee filter exists in insight panel config.

### Existing architecture decision

- `onto_assignments` is reserved and intentionally not part of project-sharing RLS flow.
    - `docs/architecture/decisions/ADR-004-project-sharing-membership-actors.md`
    - `docs/architecture/AUTHENTICATION_AND_PERMISSIONS.md`

### Conclusion

Do not reuse `onto_assignments` for task ownership. Implement task ownership as a dedicated task-scoped table aligned with current project membership and RLS helpers.

### `onto_assignments` lifecycle decision

- Do not delete `onto_assignments` during initial assignment/mention rollout.
- Mark it as legacy and block new feature work from writing to it.
- Reassess removal only after:
    - `onto_task_assignees` is live in production.
    - assignment + mention flows are stable for at least one full release cycle.
    - an audit confirms no runtime consumers depend on `onto_assignments`.
- If removed later, use a dedicated cleanup migration that also updates dependent SQL/functions/docs.

---

## Product decisions

1. Keep mentions and assignments as separate intents.
2. Keep multi-assignee tasks (cap `10` assignees per task).
3. Show assignees in the task insight panel row metadata.
4. Add assignee filter to task insight panel.
5. Coalesce duplicate pings when assignment + mention happen in the same task update.

---

## Data model

### New table: `onto_task_assignees`

```sql
create table if not exists onto_task_assignees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  task_id uuid not null references onto_tasks(id) on delete cascade,
  assignee_actor_id uuid not null references onto_actors(id) on delete cascade,
  assigned_by_actor_id uuid not null references onto_actors(id) on delete restrict,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (task_id, assignee_actor_id),
  check (source in ('manual', 'agent', 'import'))
);

create index if not exists idx_onto_task_assignees_task
  on onto_task_assignees(task_id);

create index if not exists idx_onto_task_assignees_project_assignee
  on onto_task_assignees(project_id, assignee_actor_id);
```

### RLS policies

- `SELECT`: `current_actor_has_project_access(project_id, 'read')`
- `INSERT/DELETE`: `current_actor_has_project_access(project_id, 'write')`
- `WITH CHECK`: `assigned_by_actor_id = current_actor_id()`
- Service role: full access

---

## API and payload contract

### Task write endpoints

- `POST /api/onto/tasks/create`
    - Accept `assignee_actor_ids?: string[]`
    - Validate all assignees are active project members
    - Upsert into `onto_task_assignees`

- `PATCH /api/onto/tasks/[id]`
    - Accept `assignee_actor_ids?: string[]` with replace semantics
    - Compute add/remove delta
    - Notify added assignees only

### Task read endpoints

- `GET /api/onto/tasks/[id]`
- `GET /api/onto/tasks/[id]/full`
- `GET /api/onto/projects/[id]`
- `GET /api/onto/projects/[id]/full`

Each task returns:

```json
{
	"id": "task_uuid",
	"title": "Draft launch brief",
	"assignees": [
		{
			"actor_id": "actor_uuid",
			"user_id": "user_uuid",
			"name": "Jim",
			"email": "jim@example.com",
			"assigned_at": "2026-02-19T20:11:00.000Z"
		}
	]
}
```

### Member data for assignment UI and mention resolution

- `GET /api/onto/projects/[id]/members` should include `actor.user_id` in actor select payload.

---

## Insight panel changes

### Task row display

- Current task row metadata: `"{state} · {sortValue}"`.
- New task row metadata:
    - No assignee: `"{state} · Unassigned · {sortValue}"`
    - 1 assignee: `"{state} · @Jim · {sortValue}"`
    - 2+ assignees: `"{state} · @Jim +2 · {sortValue}"`

### Assignee filter

Add filter group to task panel config:

- `id`: `assignee_actor_id`
- `multiSelect`: `true`
- options:
    - `__unassigned__`
    - `__me__` (resolved client-side to current actor id)
    - member actor ids

Filter semantics:

- Empty selection => no assignee filtering.
- Any selected actor id => task passes if assigned to any selected actor.
- `__unassigned__` => passes tasks with zero assignees.
- Multiple selected values use OR semantics.

---

## Assignment + mention coordination

### Notification rules

1. Assignment only => send `task.assigned` (type: `task_assigned`).
2. Mention only => send `entity.tagged` (type: `entity_tagged`).
3. Same task update includes both assignment and mention for same recipient:
    - Send only `task.assigned`.
    - Include `data.coalesced_from_mention = true`.
4. Never notify actor who performed the update.
5. Delta-only: unchanged assignees/mentions create no new notification.

### Why coalescing is required

Without coalescing, “assign + @mention” in one save creates duplicate pings for the same action and reduces trust in notification quality.

---

## Agentic chat alignment (phase 2 dependency)

When chat command implies assignment:

- Example: “assign this task to @jim”
- Resolve `@jim` using project members
- Execute the same task PATCH with `assignee_actor_ids`
- Reuse the same notification logic (including coalescing)

---

## Delivery strategy with companion mention spec

Recommended mode: hybrid sequential + parallel.

### Stage A: Shared foundation (sequential)

- Ship data + API primitives that both specs depend on:
    - `onto_task_assignees` schema/RLS.
    - shared member resolution inputs (`actor.user_id`).
    - shared notification utility contracts.

### Stage B: Feature tracks (parallel)

- Track 1 (mentions):
    - plain `@name` authoring, canonical tokenization, entity mention notifications.
- Track 2 (assignments):
    - task assignee CRUD, task assignee visibility, insight panel assignee filters.

### Stage C: Integration hardening (sequential)

- Add assignment+mention notification coalescing.
- Run cross-surface regression tests.
- Launch behind one coordinated feature flag gate.

This keeps velocity high without creating duplicate or conflicting notification behavior.

---

## Implementation plan

### Phase 0: Contract and type prep

- [ ] Add `TaskAssignee` type to `apps/web/src/lib/types/onto.ts`
- [ ] Extend task type shape with optional `assignees`
- [ ] Add shared constants for assignee filter sentinels (`__unassigned__`, `__me__`)

### Phase 1: DB foundation

- [ ] Create migration for `onto_task_assignees`
- [ ] Add indexes + RLS policies
- [ ] Update shared DB type artifacts

### Phase 2: API wiring

- [ ] Update task create/patch endpoints for `assignee_actor_ids`
- [ ] Add assignment delta logic + member validation
- [ ] Add assignee hydration to task read endpoints
- [ ] Add assignee hydration to project endpoints (`/api/onto/projects/[id]`, `/full`)
- [ ] Update members endpoint to include actor `user_id`

### Phase 3: Insight panel UX

- [ ] Add assignee filter group generation for task panel
- [ ] Update task filtering logic for assignee arrays + unassigned sentinel
- [ ] Update task row metadata formatting to show assignees

### Phase 4: Mention coordination

- [ ] Implement notification coalescing (assignment supersedes same-save mention for task recipients)
- [ ] Add event payload flag `coalesced_from_mention`
- [ ] Keep goal/document mention behavior unchanged

### Phase 5: Verification

- [ ] Unit tests: assignment delta + coalescing
- [ ] API tests: create/replace/remove assignments
- [ ] UI tests: assignee render and filtering
- [ ] Regression tests: existing non-assignment task flows

### Phase 6: Legacy cleanup decision

- [ ] Audit `onto_assignments` runtime reads/writes after rollout
- [ ] Decide keep-vs-drop in an ADR addendum
- [ ] If dropping: ship separate migration and dependent function/type/doc updates

---

## Acceptance criteria

1. Task can be assigned to multiple members and persisted.
2. Task insight panel clearly shows assignee info for every task row.
3. Task insight panel can filter by assignee and unassigned.
4. Assignment notifications are delivered for newly added assignees only.
5. Assignment + mention in one task update does not double-notify the same person.

---

## Out of scope for this spec

- Using `onto_assignments` for task ownership.
- Workload balancing / capacity planning UI.
- Org-wide global usernames beyond project membership scope.

---

## Primary implementation references

- `apps/web/src/routes/api/onto/tasks/create/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/members/+server.ts`
- `apps/web/src/routes/projects/[id]/+page.svelte`
- `apps/web/src/lib/components/ontology/insight-panels/insight-panel-config.ts`
- `apps/web/src/lib/components/ontology/EntityListItem.svelte`
- `apps/web/src/routes/api/onto/comments/comment-mentions.ts`
- `apps/web/src/lib/utils/entity-reference-parser.ts`
- `docs/architecture/AUTHENTICATION_AND_PERMISSIONS.md`
- `docs/architecture/decisions/ADR-004-project-sharing-membership-actors.md`
