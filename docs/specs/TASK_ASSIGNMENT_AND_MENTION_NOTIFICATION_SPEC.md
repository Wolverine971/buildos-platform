<!-- docs/specs/TASK_ASSIGNMENT_AND_MENTION_NOTIFICATION_SPEC.md -->

# Task Assignment and Entity @Tag Notification Spec

## Status

| Attribute | Value                                                                                      |
| --------- | ------------------------------------------------------------------------------------------ |
| Status    | In progress (phase 1 shipped, phase 2 started)                                             |
| Created   | 2026-02-19                                                                                 |
| Updated   | 2026-02-20                                                                                 |
| Owner     | Platform                                                                                   |
| Scope     | Project collaboration, ontology tasks/goals/documents, notifications, agentic-chat phase 2 |
| Companion | `docs/specs/TASK_ASSIGNMENT_INSIGHT_PANEL_SPEC.md`                                         |

---

## Progress Update (2026-02-20)

### Completed in Phase 1

- [x] Task assignment table + indexes + RLS (`onto_task_assignees`) is live via migration.
- [x] Assignment APIs are wired (`assignee_actor_ids` on task create/update) with member validation and delta sync.
- [x] Assignment + mention notification coalescing is implemented for task writes.
- [x] Mention notifications are implemented for task, goal, and document create/update endpoints.
- [x] Insight panel assignee display + filter plumbing is shipped.
- [x] Regression tests for mention/assignment coordination and assignee filtering are in place.

### Phase 2 progress

- [x] Agentic chat task tools now support `assignee_handles` (for example `@jim`) and resolve handles to `assignee_actor_ids` through project members before task create/update writes.
- [x] Chat tag action flow is now implemented via `tag_onto_entity` (`@handle` or user-ID recipients) with two modes:
    - `content` (default): inject canonical `[[user:<id>|Name]]` mention tokens into task/goal/document text fields and trigger normal mention delta notifications.
    - `ping`: explicit notification-only tagging via `/api/onto/mentions/ping`.
- [x] Manual ping endpoint is now implemented at `POST /api/onto/mentions/ping` for explicit tag notifications without content mutation.

---

## User Requirement Update (2026-02-19)

Target behavior:

- Users can type plain `@dj` / `@jim` style mentions.
- Tagged users receive a notification like: "You were tagged in that document/goal/task."
- Tagging works on task, goal, and document surfaces.
- In agentic chat, `@name` should resolve who the user means.
- Agentic chat can run assignment/tag actions (for example: "assign this task to @jim"), then notify the person through the normal notification flow.

---

## Problem

Project sharing exists, but there is no consistent, plain-`@` tagging model across core entity types, and task ownership is not first-class multi-assignee. This creates coordination gaps:

- Users cannot reliably tag collaborators with short handle-style input.
- Notifications are inconsistent between comments and entity updates.
- Agentic chat can reference people semantically, but there is no explicit phase plan for converting those references into assignment/tag notifications.

---

## Goals

- Allow plain mention input (`@dj`, `@jim`) with member autocomplete.
- Support tagging on task, goal, and document entities.
- Support assigning zero, one, or many collaborators to tasks (max 10).
- Notify users when they are newly assigned or newly tagged.
- Prevent duplicate notifications on unchanged saves.
- Ensure only active project members can be assigned/tagged.
- Define phase 2 agentic-chat behavior for mention resolution and assignment/tag actions.

---

## Non-goals (MVP)

- Global org directory handles across all projects.
- Reworking global notification preferences UX.
- Building workload/capacity planning.
- Replacing comment mention behavior.

---

## External Research Summary (2026-02-19)

- GitHub supports multi-assignee workflows and separate notification reasons for assignment and mention.
    - https://docs.github.com/articles/assigning-issues-and-pull-requests-to-other-github-users
    - https://docs.github.com/en/subscriptions-and-notifications/concepts/about-notifications
- GitHub inbox includes mention-specific filtering, reinforcing mention as first-class signal.
    - https://docs.github.com/en/subscriptions-and-notifications/reference/inbox-filters
- Slack mentions are access-aware and only notify users with valid conversation access.
    - https://slack.com/help/articles/205240127-use-mentions-in-slack-mentions
- Notion notifies both assignment and mention events.
    - https://www.notion.com/help/notification-settings
- ClickUp supports multi-assignee; Linear demonstrates single-assignee tradeoff.
    - https://help.clickup.com/hc/en-us/articles/6309711178647-Multiple-Assignees
    - https://linear.app/docs/issues
- Postgres `UNIQUE` + `ON CONFLICT` gives safe idempotent upserts.
    - https://www.postgresql.org/docs/current/ddl-constraints.html
    - https://www.postgresql.org/docs/current/sql-insert.html
- Supabase RLS and Postgres changes align with permissioned mention/assignment updates.
    - https://supabase.com/docs/guides/database/postgres/row-level-security
    - https://supabase.com/docs/guides/realtime/postgres-changes

### Resulting product decisions

- Use multi-assignee for tasks with cap `10`.
- Treat assignment and tagging as separate notification intents.
- Allow plain `@name` input, but persist canonical user references.
- Restrict assign/tag targets to active project members.

---

## Architecture Decisions

1. Add dedicated task assignment table (`onto_task_assignees`), not `onto_tasks.props` and not `onto_assignments`.
2. Introduce shared mention resolution service for task/goal/document writes.
3. Support plain `@handle` input in UI and agentic chat; resolve to member identity.
4. Persist mentions in canonical token format (`[[user:<user_id>|Display Name]]`) for deterministic parsing and backward compatibility.
5. Phase 2 agentic chat uses same resolution service and same write endpoints to trigger notifications.

### Why not reuse `onto_assignments`

Per existing ADR/auth docs, `onto_assignments` is reserved and not in sharing RLS flow.

- `docs/architecture/decisions/ADR-004-project-sharing-membership-actors.md`
- `docs/architecture/AUTHENTICATION_AND_PERMISSIONS.md`

### `onto_assignments` deletion decision

- Do not drop `onto_assignments` in this delivery phase.
- Treat it as legacy/reserved while assignment and mention systems move to `onto_task_assignees` + entity mention flows.
- Revisit drop only in a post-rollout cleanup phase after usage audit and dependent function/type cleanup.

---

## Mention Input and Resolution Model

### Authoring syntax (user-facing)

- User types `@dj`, `@jim`, `@alice`.
- UI shows project-member autocomplete and disambiguation if needed.
- Selected mention inserts canonical token in stored text:
    - `[[user:<user_id>|Display Name]]`
- Render layer displays canonical mention as `@Display Name`.

### Why canonical storage

- Existing parser already supports `[[user:id|Name]]`.
- Stable identity even if display name changes.
- Works for APIs, agentic chat tooling, and notification dedupe.

### Handle matching rules

Because current schema has no dedicated `username` field in `users`, mention resolution is project-member scoped and derived from:

- `onto_actors.name` normalized forms.
- `onto_actors.email` local-part normalized forms.

Resolution behavior:

- exact normalized match first.
- prefix match second.
- if multiple matches, require explicit user selection (no auto-ping).
- if no match, reject mention tokenization and show validation message.

---

## Entity Coverage (Phase 1)

- `task`: `description`
- `goal`: `description` and `goal` text field
- `document`: `content` / `body_markdown` / `description` (whichever is updated)

Mention extraction rule:

- `new_mentions = mentions(updated_text_fields) - mentions(previous_text_fields) - {actor_user_id}`

Only `new_mentions` generate notifications.

---

## Data Model

### New table: `onto_task_assignees`

```sql
create table if not exists onto_task_assignees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  task_id uuid not null references onto_tasks(id) on delete cascade,
  assignee_actor_id uuid not null references onto_actors(id) on delete cascade,
  assigned_by_actor_id uuid not null references onto_actors(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (task_id, assignee_actor_id)
);

create index if not exists idx_onto_task_assignees_task
  on onto_task_assignees(task_id);

create index if not exists idx_onto_task_assignees_assignee
  on onto_task_assignees(assignee_actor_id, created_at desc);

create index if not exists idx_onto_task_assignees_project_assignee
  on onto_task_assignees(project_id, assignee_actor_id);
```

### RLS shape (`onto_task_assignees`)

- `SELECT`: members with `read` access on project.
- `INSERT/DELETE`: members with `write` access on project.
- `WITH CHECK`: `assigned_by_actor_id = current_actor_id()`.
- Service role full access.

### Response additions

Task payloads include `assignees`:

- `actor_id`
- `user_id`
- `name`
- `email`
- `assigned_at`

---

## API Changes

### Task endpoints

`POST /api/onto/tasks/create`

- add `assignee_actor_ids?: string[]`
- validate assignees are active members
- upsert assignments
- notify newly assigned (excluding actor)

`PATCH /api/onto/tasks/[id]`

- add `assignee_actor_ids?: string[]` (replace semantics)
- compute assignment delta
- notify `added` assignees only
- run mention extraction on changed text fields and notify new tags

`GET /api/onto/tasks/[id]`, `GET /api/onto/tasks/[id]/full`

- include `assignees`

### Goal endpoint

`PATCH /api/onto/goals/[id]`

- run mention extraction on updated text fields (`goal`, `description`)
- notify newly tagged users

### Document endpoint

`PATCH /api/onto/documents/[id]`

- run mention extraction on changed text fields (`content` / `body_markdown` / `description`)
- notify newly tagged users

### Members endpoint support

`GET /api/onto/projects/[id]/members`

- include `actor.user_id` (already available from actor join) for canonical mention tokenization.

---

## Notification Model (Phase 1)

### Types

- `task_assigned`
- `entity_tagged`

### Event type values

- `task.assigned`
- `entity.tagged`

### Insert target

- `user_notifications` direct insert (same reliability model as comment mentions)

### Payload contract

```json
{
	"user_id": "<recipient_user_id>",
	"type": "task_assigned | entity_tagged",
	"title": "Task assigned to you | You were tagged",
	"message": "<actor_name> tagged you in a <entity_type> in <project_name>.",
	"action_url": "/projects/<project_id>",
	"event_type": "task.assigned | entity.tagged",
	"data": {
		"project_id": "<project_id>",
		"entity_type": "task | goal | document",
		"entity_id": "<entity_id>",
		"entity_title": "<entity_title>",
		"task_id": "<task_id_or_null>",
		"actor_user_id": "<actor_user_id>",
		"source": "assignment | field_mention"
	}
}
```

### Deduping

- Never notify initiating user.
- Notify only on delta-add (`new assignees`, `new mentions`).
- No duplicate notification for unchanged saves.

---

## Notifications Feed Integration

Extend `/notifications` feed merge logic to include:

- `comment_mention`
- `task_assigned`
- `entity_tagged`

Presentation:

- show entity-aware copy:
    - "You were tagged in a document"
    - "You were tagged in a goal"
    - "You were tagged in a task"

---

## UI/UX Changes

### Mention UX (task/goal/document editors)

- trigger autocomplete on `@`
- suggest active project members
- disambiguation modal when multiple matches
- insert canonical token, render as `@Name`

### Task assignment UX

- multi-select assignee picker (max 10)
- assignee chips/avatar stack on task surfaces

---

## Agentic Chat Phase 2

### Behavior requirements

1. Mention awareness in chat:
    - Chat parser resolves `@name` to project members for context.
    - No notification for plain conversational mention alone.

2. Assignment action from chat:
    - "assign this task to @jim" resolves member and calls task PATCH with `assignee_actor_ids`.
    - Normal assignment notification flow sends ping.

3. Tag action from chat:
    - "tag @jim on this document/goal/task" either:
        - injects canonical mention token into target text field and saves, or
        - calls dedicated ping endpoint if user asked for manual ping without content edit.

### Optional phase 2 endpoint

`POST /api/onto/mentions/ping`

Input:

- `project_id`
- `entity_type`
- `entity_id`
- `mentioned_user_ids[]`
- `message?`

Use case:

- explicit manual ping without mutating entity content.

---

## Security and Permissions

- Assign/tag actions require project `write` access.
- Mention/assignment recipients must be active project members (or owner).
- Public project read does not grant assign/tag target eligibility.
- All chat-driven actions reuse same permissioned APIs as manual UI.

---

## Rollout Plan

### Phase 1: Shared foundation (sequential) - ✅ complete

- Add `onto_task_assignees` + RLS.
- Add shared mention-resolution helper and member identity payload requirements.
- Define shared notification contracts for assignment/tag events.

### Phase 2: Parallel feature tracks - 🚧 in progress

Track A (mentions):

- Add mention notifications for task/goal/document patch flows.
- Add plain `@` autocomplete in task/goal/document editors.

Track B (assignments):

- Add task assignment API support.
- Add assignment visibility/filtering UX per companion assignment spec.

### Phase 3: Integration and hardening (sequential) - 🚧 in progress

- Extend `/notifications` for new rows and consistent payload rendering.
- Add assignment+mention coalescing to prevent duplicate same-save pings.
- Run cross-feature regression tests.

### Phase 4: Agentic chat assignment/tag actions - 🚧 started

- Add chat-side member resolution for `@name`.
- Route assignment intents to existing task API.
- Route tag intents to content edit or explicit ping endpoint.
- Ensure "chat mention only" does not notify unless action requested.

### Phase 5: Multi-channel event system

- Add event types to notification constraints/types:
    - `task.assigned`
    - `entity.tagged`
- Add payload transformers.
- Optionally emit via `emit_notification_event` for push/email/SMS.

### Phase 6: Legacy cleanup decision

- Audit `onto_assignments` usage.
- Decide keep-vs-drop in follow-up ADR/migration.

---

## Testing Plan

### Unit tests

- handle resolution (`@dj`, `@jim`) exact/prefix/ambiguous/not-found
- mention delta extraction from old/new text
- assignment delta extraction

### API tests

- create task with assignees
- patch task add/remove assignees
- patch goal/document/task with new `@` mentions
- no self-notification
- ambiguous handle rejected unless user disambiguates
- permission denied for invalid recipients or non-members

### DB/RLS tests

- task assignment table permission checks
- member/read/write separation checks

### Regression tests

- existing task/goal/document updates still work without mention input
- existing comment mention flow unchanged

---

## Acceptance Criteria

- User can type plain `@dj`/`@jim` and tag a valid project member.
- Tagging works on document, goal, and task entities.
- Tagged user receives in-app notification with entity-specific wording.
- Task supports multi-assignee and assigned users are notified.
- Agentic chat phase 2 supports "assign/tag @user" action path with same notification guarantees.

---

## Implementation References (local)

- `apps/web/src/routes/api/onto/tasks/create/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/+server.ts`
- `apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts`
- `apps/web/src/routes/api/onto/goals/[id]/+server.ts`
- `apps/web/src/routes/api/onto/documents/[id]/+server.ts`
- `apps/web/src/routes/api/onto/comments/comment-mentions.ts`
- `apps/web/src/lib/utils/entity-reference-parser.ts`
- `apps/web/src/routes/api/onto/projects/[id]/members/+server.ts`
- `apps/web/src/routes/notifications/+page.server.ts`
- `apps/web/src/routes/notifications/+page.svelte`
- `supabase/migrations/20260320000000_project_sharing_membership.sql`
- `supabase/migrations/20260328000000_add_onto_comments.sql`
- `docs/architecture/decisions/ADR-004-project-sharing-membership-actors.md`
