# Shared Project Activity Notifications: Product Spec + Infrastructure Audit

Date: 2026-02-10  
Status: Proposed  
Author: Codex (research + codebase audit)

## 1) Executive Summary

This spec defines how BuildOS should deliver project-activity notifications for shared projects without spamming users.

Core decisions:

- Add a **project-level setting** for activity notifications, default `ON` when a project has more than one active member.
- Add a **member-level override** so each member can opt out per project.
- Send project activity notifications through a **batching/coalescing layer** (default 5-minute window) instead of immediate one-event-per-push.
- Ask for push permission using a **join-time, in-context prompt flow** (soft ask first, browser/system prompt only after a user click).
- Keep daily brief behavior intact, but simplify SMS/push architecture drift and stale notification code paths.

---

## 2) User Requirements (from product request)

- Shared projects should notify members when teammates make updates.
- This must be controllable with project settings.
- Default behavior should be enabled for shared projects.
- Users should not get bombarded; rapid updates should be batched.
- Need best-practice guidance for:
  - batching/frequency control
  - permission/opt-in timing
- Need a full audit of current notification infrastructure and simplification recommendations.

---

## 3) External Research Findings (Best Practices)

## 3.1 Permission prompt timing

Recommendation: do not fire permission prompts at first page load; request in context after user intent.

- Android guidance explicitly recommends waiting before showing notification permission prompts and requesting in context.  
  Source: [Android notification runtime permission](https://developer.android.com/develop/ui/views/notifications/notification-permission)
- Web push guidance recommends a soft ask and warns against prompting on landing because blocked permissions are hard to recover from.  
  Source: [web.dev Permission UX](https://web.dev/articles/push-notifications-permissions-ux)
- MDN guidance: request notifications in response to user gesture; browsers increasingly enforce this.  
  Source: [MDN Notifications API usage](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)
- Apple notification authorization model requires explicit user authorization and checking settings because users can change permissions later.  
  Source: [Apple Local/Remote Notifications guide (archived)](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/SupportingNotificationsinYourApp.html)

## 3.2 Anti-spam, grouping, and batching patterns

- Android recommends updating existing notifications and grouping related notifications to avoid flooding.  
  Sources:  
  - [About notifications](https://developer.android.com/guide/topics/ui/notifiers/notifications.html)  
  - [Create a group of notifications](https://developer.android.com/develop/ui/views/notifications/group)  
  - [Build notification (`setOnlyAlertOnce`, update behavior)](https://developer.android.com/develop/ui/views/notifications/build-notification)
- APNs supports coalescing with `apns-collapse-id` and grouping with payload `thread-id`.  
  Sources:  
  - [APNs communication headers](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingwithAPNs.html)  
  - [APNs payload key reference (`thread-id`)](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/PayloadKeyReference.html)
- FCM supports collapsible semantics and throttles collapsible traffic to protect device battery (includes explicit burst/refill behavior).  
  Sources:  
  - [FCM message types](https://firebase.google.com/docs/cloud-messaging/customize-messages/set-message-type)  
  - [FCM throttling and quotas](https://firebase.google.com/docs/cloud-messaging/throttling-and-quotas)
- Frequency capping is a common operational control; dropped-vs-queued behavior should be explicit in product expectations.  
  Source: [OneSignal frequency capping](https://documentation.onesignal.com/docs/frequency-capping)

## 3.3 Best-practice conclusion for BuildOS

- Use an in-app soft ask at meaningful moments (invite acceptance / first shared-project interaction).
- Ask for browser/system permission only after explicit user click.
- Batch by default with short windows (5 minutes).
- Use collapse/group keys per user+project so multiple updates become one visible push thread.
- Enforce hard caps and quiet hours per user.

---

## 4) Current BuildOS Notification Infrastructure Audit

## 4.1 What is currently in place

Persistent pipeline (good foundation):

- Event + delivery model exists in `notification_events` and `notification_deliveries`.
- Queue-based worker delivery exists via `send_notification` jobs.
- Channel adapters exist for push/email/SMS.

Primary flow references:

- Event dispatch logic and fan-out: `supabase/migrations/20260205_002_emit_notification_event_opt_in.sql`
- Notification worker routing: `apps/worker/src/workers/notification/notificationWorker.ts`
- Notifications page data source: `apps/web/src/routes/notifications/+page.server.ts`

## 4.2 Where user settings/preferences currently live

Current source-of-truth is split:

- Global channel preferences (one row per user): `user_notification_preferences`
  - `packages/shared-types/src/database.schema.ts:2141`
- Event subscription opt-in/out: `notification_subscriptions`
  - `packages/shared-types/src/database.schema.ts:959`
- Push device endpoints/subscriptions: `push_subscriptions`
  - `packages/shared-types/src/database.schema.ts:1643`
- SMS channel state and limits: `user_sms_preferences`
  - `packages/shared-types/src/database.schema.ts:2199`

Important note: there is currently **no project-level notification preference table**.

## 4.3 What appears to be working well

- Explicit opt-in defaults are implemented and fail-closed behavior exists in event emission.
  - `supabase/migrations/20260205_001_notification_opt_in_defaults.sql`
  - `supabase/migrations/20260205_002_emit_notification_event_opt_in.sql`
- Daily brief path is well integrated with the notification event pipeline.
  - `apps/worker/src/workers/brief/briefWorker.ts:324`

## 4.4 Key findings and risks

Severity: High

1. Legacy schema drift in active SQL function:
- `get_notification_active_subscriptions` still joins `user_notification_preferences` on `event_type`, but global prefs no longer have that column.
- File: `packages/shared-types/src/functions/get_notification_active_subscriptions.sql:22`

2. SMS adapter appears to create duplicate `sms_messages` records:
- Adapter inserts directly, then calls `queue_sms_message` which also inserts.
- Files:
  - `apps/worker/src/workers/notification/smsAdapter.ts:724`
  - `packages/shared-types/src/functions/queue_sms_message.sql:22`

3. Some notification paths bypass the standardized event fan-out path:
- Invite acceptance manually inserts event + deliveries as already delivered in-app, bypassing subscription/channel worker logic.
- File: `apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts:167`

Severity: Medium

4. Admin notification context API uses fallback defaults that can conflict with explicit opt-in defaults:
- `push_enabled ?? true`, `email_enabled ?? true`, `in_app_enabled ?? true`
- File: `apps/web/src/routes/api/admin/users/[id]/notification-context/+server.ts:111`

5. Performance migration retains old model checks for `event_type` in `user_notification_preferences`:
- File: `supabase/migrations/20260329000001_performance_indexes_and_functions.sql:65`

6. Mixed notification planes increase mental overhead:
- Persistent notification events/deliveries
- Realtime broadcast utility alias (`notifyUser`) for transient UI events
- Separate stackable/in-app mechanisms
- File: `apps/worker/src/workers/shared/queueUtils.ts:123`

7. Push opt-in UX is settings-only today:
- Browser permission request is tied to profile settings toggle, not join-time project context.
- Files:
  - `apps/web/src/lib/components/settings/NotificationPreferences.svelte:200`
  - `apps/web/src/lib/services/browser-push.service.ts:133`
  - `apps/web/src/routes/invites/[token]/+page.svelte:46`

## 4.5 Audit conclusion

The architecture has a strong core but has iteration residue.  
You can simplify safely by standardizing around one persistent event pipeline and tightening preference ownership boundaries.

---

## 5) Proposed Product + Technical Design

## 5.1 Scope

This spec covers:

- Shared project activity notifications (initially push + in-app).
- Project-level toggle + member-level override.
- Batching and anti-spam behavior.
- Join-time opt-in flow.

It does not change daily brief generation behavior.

## 5.2 New behavior

### Rule A: Project-level setting

- Setting name: `project_activity_notifications_enabled`
- Location: project settings UI.
- Default:
  - `true` when active project member count > 1
  - `false` for solo projects
- Editable by project owner/admin role.

### Rule B: Member-level override

- Each member can choose to mute/unmute activity notifications for that specific project.
- Default for new members: `true` (inherits shared-project default).

### Rule C: Send logic

- Do not notify actor for their own action.
- Only notify active project members with:
  - project setting enabled
  - member override enabled
  - channel permission enabled
  - active device subscription (for push)

### Rule D: Batching

- Default batch window: 5 minutes per `(recipient_user_id, project_id)`.
- If multiple actions occur in window, send one summary push.
- Summary body example:
  - `"Alex updated 4 tasks and added 1 note in Project Atlas"`
- Immediate bypass events (not batched):
  - direct mentions
  - direct assignments
  - explicit high-priority alert types

### Rule E: Frequency controls

- Per user + per project caps:
  - max 1 push per 10 minutes (after batch output)
  - max 6 pushes per hour
  - max 30 pushes per day
- If cap exceeded:
  - keep in-app record
  - suppress push

### Rule F: Collapse/group semantics

- For push providers use project-scoped collapse/group keys:
  - APNs: `apns-collapse-id = project:{projectId}:activity`
  - APNs payload: `thread-id = project:{projectId}`
  - FCM: `collapse_key = project_{projectId}_activity`
  - Web Push payload: `tag = project:{projectId}:activity`

---

## 5.3 Data model proposal

Add project-level defaults and member-level overrides explicitly.

```sql
-- Project-level defaults
create table if not exists project_notification_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique,
  activity_push_enabled boolean not null default true,
  batch_window_minutes integer not null default 5 check (batch_window_minutes between 1 and 30),
  max_push_per_hour integer not null default 6 check (max_push_per_hour between 1 and 60),
  max_push_per_day integer not null default 30 check (max_push_per_day between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Member overrides per project
create table if not exists project_member_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  activity_push_enabled boolean not null default true,
  muted_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, user_id)
);
```

Batch state (choose one approach):

- Option 1 (recommended): persistent aggregate rows:
  - `project_notification_batches` table keyed by `(recipient_user_id, project_id, window_start)`.
- Option 2: queue-only with dedup metadata (less queryable, weaker observability).

Recommended: Option 1 for debuggability and admin support.

---

## 5.4 Event model additions

Add event types:

- `project.activity.changed` (raw per-action event)
- `project.activity.batched` (aggregated notification event used for delivery)

Payload shape for `project.activity.changed`:

```json
{
  "project_id": "uuid",
  "project_name": "string",
  "actor_user_id": "uuid",
  "actor_name": "string",
  "action_type": "task.updated|task.created|doc.updated|comment.added|...",
  "entity_id": "uuid",
  "entity_type": "task|doc|comment|...",
  "occurred_at": "ISO8601"
}
```

Payload shape for `project.activity.batched`:

```json
{
  "project_id": "uuid",
  "project_name": "string",
  "recipient_user_id": "uuid",
  "window_start": "ISO8601",
  "window_end": "ISO8601",
  "total_events": 7,
  "top_actions": {
    "task.updated": 4,
    "comment.added": 2,
    "doc.updated": 1
  },
  "actors": [
    { "user_id": "uuid", "name": "Alex" },
    { "user_id": "uuid", "name": "Maya" }
  ]
}
```

---

## 5.5 Processing flow

1. Project action occurs (task/doc/comment update).
2. Emit `project.activity.changed`.
3. Recipient resolver computes project members minus actor.
4. Preference gate checks:
   - project setting
   - member override
   - user/global channel settings
   - device subscription
5. Aggregator upserts into open 5-minute batch.
6. Scheduler enqueues one deduped flush job per recipient+project window.
7. Flush job creates `project.activity.batched` and downstream `notification_deliveries`.
8. Notification worker sends channel outputs.
9. Metrics + logging recorded.

---

## 6) Opt-in UX Spec (When to Ask)

## 6.1 Join-time flow (recommended default)

Trigger: after invite acceptance and first redirect into project context.

1. Show soft modal:
   - Title: `"Stay updated on {projectName}?"`
   - Text: short explanation of teammate activity updates
   - Controls:
     - Toggle A: `"Project activity notifications"` (default ON)
     - Button B: `"Enable push on this device"` (only shown if browser permission is not granted)
2. Only when user clicks Button B, call `Notification.requestPermission()` (user gesture compliant).
3. If denied:
   - Keep project setting enabled at app level if desired (in-app only), but mark push unavailable.
   - Show one-click help path to browser settings.

## 6.2 Additional entry points

- Project settings panel (`/projects/[id]/settings`).
- Global notification settings (`/profile?tab=notifications`).
- Non-blocking in-app banner if user skipped modal.

## 6.3 Why this timing

This aligns with platform guidance: request notification permissions in context and after demonstrated intent, not on cold landing pages.

---

## 7) Simplification Plan for Existing Infrastructure

## 7.1 Standardize send paths

- Route all persistent notifications through `emit_notification_event` or a dedicated `emit_project_activity_event` wrapper.
- Remove manual event/delivery inserts for normal app events (including invite-accept notifications).

## 7.2 Remove schema drift

- Fix `get_notification_active_subscriptions` join to global prefs model.
- Remove or update migration checks that still assume `user_notification_preferences.event_type`.
- Regenerate shared DB types after SQL cleanup.

## 7.3 Simplify SMS flow

Pick one record-creation owner:

- Preferred: `queue_sms_message` creates `sms_messages`; adapter should not pre-insert.
- Or: adapter inserts once and queue function accepts existing `message_id`.

Do not keep both writes.

Also align SMS template keys with actual event taxonomy; remove orphan keys (`project.milestone`, etc.) unless formally added.

## 7.4 Clarify notification planes

- Keep `notification_events`/`notification_deliveries` as persistent source of truth.
- Keep realtime broadcasts for ephemeral UI only; rename alias to avoid confusion (`notifyUser` -> `broadcastUserEvent` only).

## 7.5 Keep daily brief stable

- No required architecture shift for daily brief; it already uses event emission and channel gating.
- Continue monitoring daily brief separately from project activity rollout.

---

## 8) Rollout Plan

Phase 0: Cleanup + guardrails

- Fix stale SQL/function drift.
- Resolve SMS double-insert path.
- Add tests around preference resolution.

Phase 1: Schema + APIs

- Add project settings and member preference tables.
- Add API endpoints for project-level and member-level toggles.

Phase 2: Join-time UX

- Insert soft ask modal after invite acceptance flow.
- Keep global notification settings untouched initially.

Phase 3: Batching engine

- Implement `project.activity.changed` ingestion and batch flusher.
- Add collapse/group keys across push channels.

Phase 4: Metrics + tuning

- Launch to percentage of shared-project users.
- Tune batch windows/caps from observed engagement and mute rates.

---

## 9) Observability + Success Metrics

Track:

- Opt-in funnel:
  - soft-ask shown rate
  - soft-ask accept rate
  - browser permission grant rate
- Delivery quality:
  - push sent / user / day
  - pushes suppressed by cap
  - pushes collapsed/batched count
- User outcomes:
  - open/click rate on batched notifications
  - project-level mute rate
  - unsubscribe/permission revoke rate
- Reliability:
  - queue lag
  - adapter failure rates
  - batch flush failures

Success target (initial):

- Reduce project-activity push volume per active shared-project user by >= 40% vs immediate-send baseline.
- Maintain or improve push open rate.

---

## 10) Test Plan

- Unit tests:
  - preference resolution across project + member + global settings
  - batch merge logic
  - cap enforcement
- Integration tests:
  - invite acceptance -> modal -> preference persistence -> send behavior
  - multiple events in 5 minutes -> single push + correct summary payload
- Regression tests:
  - daily brief email/SMS/push unaffected
  - notification page rendering still correct

---

## 11) Open Questions (for final product decision)

- Should project activity batching affect email and SMS now, or push-only in v1?
- Should owner/admin be allowed to force-enable project notifications for members, or only suggest defaults?
- Should muted users still receive direct mention notifications for that project?

---

## 12) Codebase References Used in Audit

- `supabase/migrations/20260205_001_notification_opt_in_defaults.sql`
- `supabase/migrations/20260205_002_emit_notification_event_opt_in.sql`
- `supabase/migrations/20260329000001_performance_indexes_and_functions.sql`
- `packages/shared-types/src/database.schema.ts`
- `packages/shared-types/src/functions/get_notification_active_subscriptions.sql`
- `packages/shared-types/src/functions/queue_sms_message.sql`
- `packages/shared-types/src/functions/update_sms_status_atomic.sql`
- `packages/shared-types/src/notification.types.ts`
- `apps/worker/src/workers/notification/notificationWorker.ts`
- `apps/worker/src/workers/notification/preferenceChecker.ts`
- `apps/worker/src/workers/notification/smsAdapter.ts`
- `apps/worker/src/workers/brief/briefWorker.ts`
- `apps/worker/src/workers/smsWorker.ts`
- `apps/worker/src/workers/dailySmsWorker.ts`
- `apps/worker/src/workers/shared/queueUtils.ts`
- `apps/web/src/routes/api/notification-preferences/+server.ts`
- `apps/web/src/routes/api/admin/users/[id]/notification-context/+server.ts`
- `apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts`
- `apps/web/src/routes/invites/[token]/+page.svelte`
- `apps/web/src/lib/components/settings/NotificationPreferences.svelte`
- `apps/web/src/lib/services/browser-push.service.ts`
- `apps/web/src/routes/notifications/+page.server.ts`

