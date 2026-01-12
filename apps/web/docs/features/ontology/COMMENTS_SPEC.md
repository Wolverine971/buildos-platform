<!-- apps/web/docs/features/ontology/COMMENTS_SPEC.md -->

# Ontology Comments Spec

**Last Updated**: 2026-03-28  
**Status**: Implemented  
**Location**: `/apps/web/docs/features/ontology/`

## Progress

- [x] Create database tables, triggers, indexes, and RLS policies
- [x] Implement API routes for comments + read states
- [x] Build comments UI component
- [x] Embed comments sections in ontology entity modals
- [x] Update shared database types and notification payload support

## Implementation Notes

### What Was Added

- Database migration for comment tables + RLS + triggers in
  `supabase/migrations/20260328000000_add_onto_comments.sql`.
- API routes:
    - `POST/GET /api/onto/comments`
    - `PATCH/DELETE /api/onto/comments/:id`
    - `POST /api/onto/comments/read`
- Mention handling (parses `[[user:id|Name]]`, notifies valid project members).
- Comment UI component + recursive thread rendering.
- Comment sections added to ontology entity modals used in `/projects/[id]`.
- Shared types updated for new tables and `user_notifications.data`.

### Files Touched

- `supabase/migrations/20260328000000_add_onto_comments.sql`
- `apps/web/src/routes/api/onto/comments/+server.ts`
- `apps/web/src/routes/api/onto/comments/[id]/+server.ts`
- `apps/web/src/routes/api/onto/comments/read/+server.ts`
- `apps/web/src/routes/api/onto/comments/comment-mentions.ts`
- `apps/web/src/lib/components/ontology/EntityCommentsSection.svelte`
- `apps/web/src/lib/components/ontology/EntityCommentThread.svelte`
- `apps/web/src/lib/components/ontology/TaskEditModal.svelte`
- `apps/web/src/lib/components/ontology/PlanEditModal.svelte`
- `apps/web/src/lib/components/ontology/GoalEditModal.svelte`
- `apps/web/src/lib/components/ontology/RiskEditModal.svelte`
- `apps/web/src/lib/components/ontology/MilestoneEditModal.svelte`
- `apps/web/src/lib/components/ontology/DecisionEditModal.svelte`
- `apps/web/src/lib/components/ontology/EventEditModal.svelte`
- `apps/web/src/lib/components/ontology/OutputEditModal.svelte`
- `apps/web/src/lib/components/ontology/DocumentModal.svelte`
- `apps/web/src/lib/components/ontology/OntologyProjectEditModal.svelte`
- `packages/shared-types/src/database.types.ts`
- `apps/web/docs/features/ontology/COMMENTS_SPEC.md`

### Implementation Details

- **Root/parent handling**: `onto_comments_before_insert` sets `root_id` and enforces
  consistent target context across a thread. Updates are restricted by
  `onto_comments_before_update`.
- **Target validation**: `onto_comment_validate_target` ensures `entity_id` belongs
  to `project_id` for supported entity types (including `metric_point` via
  `onto_metrics` join and `event`).
- **RLS**: read allowed for members/admin or public projects; writes restricted to
  authenticated actors and `created_by = current_actor_id()`.
- **Mentions**: `comment-mentions.ts` parses `[[user:id|Name]]`, filters to project
  members (or all for public projects), creates `user_notifications` with `data`
  payload and inserts rows into `onto_comment_mentions`.
- **UI behavior**:
    - Threads render root + replies; deleted comments show placeholders.
    - Mentions render as `@Display Name` for readability.
    - Read state updates fire after list load (one request per thread).
    - Composer is disabled for unauthenticated viewers.

## Overview

Add a dedicated comment system for ontology entities and projects that:

- Supports threaded replies.
- Stays out of the ontology graph (`onto_edges`).
- Uses markdown-only comment bodies.
- Allows public read access when a project is public.
- Emits mention notifications.
- Tracks unread state per user.

## Goals

- One comment model for all ontology entities and projects.
- Threaded discussions with stable ordering.
- Mentions use existing `[[type:id|text]]` reference format.
- Minimal coupling to the graph system.
- Efficient unread counts and read state updates.

## Non-Goals

- Reactions, attachments, or rich-text beyond markdown.
- Comments as graph nodes or edges.
- Full collaborator permission system (assume existing project access rules).

## Comment Targets

Comments can target any ontology entity plus the project itself.

Default `entity_type` set (extend as needed):

- `project`
- `task`
- `plan`
- `output`
- `document`
- `goal`
- `requirement`
- `milestone`
- `risk`
- `decision`
- `metric`
- `metric_point`
- `source`
- `signal`
- `insight`
- `note` (legacy, optional)

Project comments use:

- `entity_type = 'project'`
- `entity_id = project_id`

## Data Model

### Table: `onto_comments`

Stores comments and threaded replies.

```sql
create table if not exists onto_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  parent_id uuid null references onto_comments(id) on delete cascade,
  root_id uuid not null references onto_comments(id) on delete cascade,

  body text not null,
  body_format text not null default 'markdown',
  metadata jsonb not null default '{}'::jsonb,

  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz null,
  deleted_at timestamptz null
);
```

Key rules:

- `root_id` is the top-level comment for the thread.
- Top-level comment has `parent_id = null` and `root_id = id`.
- Replies must share the same `project_id`, `entity_type`, and `entity_id` as their root.
- Soft delete by setting `deleted_at`; keep row for thread integrity.
- `body_format` is fixed to `markdown` for now.

Recommended constraints and triggers:

- Enforce `root_id` and `parent_id` consistency.
- Enforce `entity_type = 'project'` implies `entity_id = project_id`.
- Maintain `updated_at` and set `edited_at` on body changes.

### Table: `onto_comment_mentions`

Tracks user mentions for notifications.

```sql
create table if not exists onto_comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references onto_comments(id) on delete cascade,
  mentioned_user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  notification_id uuid null references user_notifications(id) on delete set null
);
```

Notes:

- Mentions are derived from the comment body on create (and optionally on edit).
- `mentioned_user_id` is the `users.id` referenced in `[[user:<id>|Name]]`.

### Table: `onto_comment_read_states`

Tracks per-user unread state at the thread level.

```sql
create table if not exists onto_comment_read_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references onto_projects(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  root_id uuid not null references onto_comments(id) on delete cascade,
  actor_id uuid not null,
  last_read_at timestamptz not null default now(),
  last_read_comment_id uuid null references onto_comments(id) on delete set null,
  updated_at timestamptz not null default now(),

  unique (project_id, entity_type, entity_id, root_id, actor_id)
);
```

Unread definition:

- A thread is unread if it has any non-deleted comment with `created_at > last_read_at`
  authored by someone else (`created_by != actor_id`).

## Mentions

### Format

Use the existing entity reference syntax:

```
[[user:<users.id>|Display Name]]
```

The UI should render this as `@Display Name` while preserving the stored token.
Mention parsing reuses `parseEntityReferences()` (`apps/web/src/lib/utils/entity-reference-parser.ts`).

### Notification Behavior

- On comment creation, parse mentions and insert `onto_comment_mentions`.
- For each mentioned user with project access, emit an in-app notification:
    - `user_notifications.type = 'comment_mention'`
    - `user_notifications.title = 'You were mentioned'`
    - `user_notifications.message` includes author name and entity context
    - `user_notifications.data` includes `comment_id`, `project_id`, `entity_type`, `entity_id`, `root_id`
- On edit, reparse and only notify new mentions.

## Unread Tracking

### Read State Updates

Add an API action to mark a thread as read:

- Input: `project_id`, `entity_type`, `entity_id`, `root_id`, optional `last_read_comment_id`
- Behavior: upsert `onto_comment_read_states` with `last_read_at = now()`

### Unread Counts

Aggregate unread threads per project or entity:

```sql
select root_id
from onto_comments c
left join onto_comment_read_states r
  on r.root_id = c.root_id
 and r.actor_id = current_actor_id()
where c.project_id = $project_id
  and c.entity_type = $entity_type
  and c.entity_id = $entity_id
  and c.deleted_at is null
  and c.created_by != current_actor_id()
  and c.created_at > coalesce(r.last_read_at, '1970-01-01')
group by root_id;
```

## API Surface (Proposed)

### Create Comment

`POST /api/onto/comments`

Payload:

```json
{
	"project_id": "uuid",
	"entity_type": "task",
	"entity_id": "uuid",
	"body": "Markdown comment",
	"parent_id": "uuid | null"
}
```

### List Comments

`GET /api/onto/comments?project_id=&entity_type=&entity_id=`

Optional:

- `root_id` to fetch a single thread
- `limit`, `offset`
- `include_deleted` (default false)

### Edit Comment

`PATCH /api/onto/comments/:id`

Payload:

```json
{
	"body": "Updated markdown"
}
```

### Delete Comment (Soft)

`DELETE /api/onto/comments/:id`

### Mark Thread Read

`POST /api/onto/comments/read`

Payload:

```json
{
	"project_id": "uuid",
	"entity_type": "task",
	"entity_id": "uuid",
	"root_id": "uuid",
	"last_read_comment_id": "uuid | null"
}
```

## RLS and Access

### `onto_comments`

- SELECT:
    - Project owners (`created_by = current_actor_id()` via project ownership).
    - Admins (`is_admin()`).
    - Public read if `onto_projects.is_public = true`.
- INSERT:
    - Users who own the project.
    - Require `created_by = current_actor_id()`.
- UPDATE:
    - Author or admin.
    - Only `body`, `edited_at`, `updated_at` are mutable.
- DELETE:
    - Author or admin (soft delete only).

### `onto_comment_mentions`

- SELECT: comment readers (same access as `onto_comments`).
- INSERT: only via service or comment creation path.

### `onto_comment_read_states`

- SELECT/INSERT/UPDATE: only the current actor.
- No public/anon access.

## Indexes

Recommended indexes for performance:

```sql
create index if not exists idx_onto_comments_entity
  on onto_comments(project_id, entity_type, entity_id, created_at desc);

create index if not exists idx_onto_comments_root
  on onto_comments(root_id, created_at asc);

create index if not exists idx_onto_comments_parent
  on onto_comments(parent_id);

create index if not exists idx_onto_comment_mentions_user
  on onto_comment_mentions(mentioned_user_id, created_at desc);

create index if not exists idx_onto_comment_read_states_actor
  on onto_comment_read_states(actor_id, updated_at desc);
```

## Validation

- `body` required, markdown only.
- Max length enforced (suggested: 10k chars).
- `entity_id` must belong to `project_id`.
- Replies must share the same target as their root.

## Public Projects

When `onto_projects.is_public = true`:

- Comments are readable by anonymous users.
- Write access still requires authentication and project access.
- Mentions and unread tracking only apply to authenticated users.

## Future Enhancements

- Comment reactions.
- Attachments or embeds.
- Subscriptions/watchers (notify all thread participants).
- Activity feed integration (`onto_project_logs` entity_type = 'comment').
