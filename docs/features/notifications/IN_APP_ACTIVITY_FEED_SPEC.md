<!-- docs/features/notifications/IN_APP_ACTIVITY_FEED_SPEC.md -->

# In-App Notifications & Activity Feed (Project Sharing)

Status: draft (MVP in-progress)  
Scope: in-app only; uses existing `onto_project_logs` + invite/member events; global + per-project feed; invite acceptance/addition events included.

## Goals

- Show project activity (creates/updates/deletes) and sharing events in a global feed and per-project feed.
- Notify project owners/inviters on invite acceptance; owners on invite events and membership changes.
- Leverage existing logging + notification infra (activity logs, `notification_events`/`notification_deliveries`, notification worker).

## Data Sources

- Activity: `onto_project_logs` (entity_type, entity_id, action, before/after, changed_by(\_actor_id), change_source, created_at).
- Sharing events already logged: `invite_created`, `invite_resent`, `invite_revoked`, `member_role_updated`, `member_removed` (after_data.event).
- Missing log to add: invite acceptance / member added (`event: invite_accepted` and `event: member_added`).
- Notification pipeline: `emit_notification_event` RPC (in-app/push/email/SMS), `notification_events`, `notification_deliveries`, notification worker.

## Event Types (new / reused)

- Sharing: `project.invite.created`, `project.invite.resent`, `project.invite.revoked`, `project.invite.accepted`, `project.member.added`, `project.member.role_updated`, `project.member.removed`.
- Activity: `project.activity.created|updated|deleted` with `{project_id, entity_type, entity_id, entity_name?, change_source, actor, summary}`.

## Recipients

- Invite acceptance: all project owners + inviter (if not owner).
- Invite created/resent/revoked: project owners + inviter.
- Member added/role updated/removed: affected member + owners.
- Activity: all active project members (read+). Self-notify toggle: default OFF (no self-notification).

## Delivery & Read State

- Channel: in-app only (MVP). Use `notification_deliveries.channel = 'in_app'`.
- Dedupe: 10-minute window per `{project_id, entity_type, entity_id, action, actor}` for activity events; no dedupe for invite/member events.
- Retention: deliveries 90 days, events 180 days (MVP defaults; can tune later).
- Read state: per-delivery `status` (unread/read) to be added later; MVP lists latest deliveries.

## API / Queries

- Feed query (MVP): `notification_deliveries` filtered by `recipient_user_id`, joined to `notification_events`, ordered by `created_at desc`, limit 50.
- Future: project filter (`payload.project_id`), unread toggle, mark-read endpoints.
- Generation: emit events from (a) `onto_project_logs` inserts, (b) invite/member endpoints (including acceptance hook).

## UI

- Nav: add “Notifications” entry under Profile & Settings dropdown; route `/notifications`.
- Page `/notifications`: list recent notifications (title/body/event_type, project/entity info, timestamp, status badge). Empty state + error fallback.
- Reuse renderer for project activity later; MVP uses simple list.
- Later: per-project feed entry point and in-product bell badge with unread count.

## Implementation Plan (phased)

1. **Surface feeds (this PR)**: add `/notifications` page querying deliveries; nav link; basic list UI.
2. **Emit events**: wire invite acceptance/member added logs, and `emit_notification_event` calls on activity/log hooks.
3. **Payload transforms**: extend `notification.types` + `payloadTransformer` for new event types (activity + sharing).
4. **Subscriptions bootstrap**: auto-create/enable in-app subscriptions for project members; ensure preferences allow in-app.
5. **Read/unread + filters**: mark-read endpoints, unread badges, project filter, dedupe window in processor.
6. **Per-project feed view**: filtered feed embedded on project page.

## Open Questions

- Do we suppress self-notifications for activity? (Default off; can add toggle.)
- Exact dedupe window acceptable? (Using 10 minutes by default.)
- Retention confirmed? (90/180 day defaults assumed.)
