<!-- apps/web/docs/features/notifications/notification-audit.md -->

# Notification Flow Audit (BuildOS)

Date: 2025-10-23

Scope: `apps/web`, `apps/worker`, `supabase/migrations`, `packages/shared-types`

## System Map (Current Flow)

### 1) Event creation + subscription gating

- Events are created via `emit_notification_event` (RPC). Example usage in brief worker: `apps/worker/src/workers/brief/briefWorker.ts`.
- The RPC inserts a row in `notification_events`, then loops `notification_subscriptions` to create `notification_deliveries` and `queue_jobs` for each channel: `supabase/migrations/20260205_002_emit_notification_event_opt_in.sql`.

### 2) Worker delivery processing

- Queue jobs of type `send_notification` are processed by the notification worker: `apps/worker/src/worker.ts`, `apps/worker/src/workers/notification/notificationWorker.ts`.
- The worker loads the delivery, transforms payloads (event payload -> title/body), checks user preferences, then routes to a channel adapter.

### 3) Channel adapters

- Push: web-push with VAPID keys; uses `push_subscriptions` + Service Worker click tracking: `apps/worker/src/workers/notification/notificationWorker.ts`, `apps/web/static/sw.js`.
- Email: creates `emails` + `email_recipients`, then POSTs to web webhook for SMTP send: `apps/worker/src/workers/notification/emailAdapter.ts`, `apps/web/src/routes/api/webhooks/send-notification-email/+server.ts`.
- In-app: inserts into `user_notifications` table: `apps/worker/src/workers/notification/notificationWorker.ts`.
- SMS: adapter wired in notification worker; creates `sms_messages` and queues `send_sms` jobs: `apps/worker/src/workers/notification/notificationWorker.ts`, `apps/worker/src/workers/notification/smsAdapter.ts`, `apps/worker/src/workers/smsWorker.ts`.

### 4) Tracking + analytics

- Push click tracking: `apps/web/static/sw.js`, `apps/web/src/routes/api/notification-tracking/click/[delivery_id]/+server.ts`.
- Email open/click tracking: `apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts`, `apps/web/src/routes/api/email-tracking/[tracking_id]/click/+server.ts`.
- SMS link tracking (short URLs): `apps/web/src/routes/l/[short_code]/+server.ts`.

### 5) User settings in /profile

- Notification tab UI: `apps/web/src/routes/profile/+page.svelte`, `apps/web/src/lib/components/profile/NotificationsTab.svelte`.
- Daily brief email/SMS toggles (should\_\*\_daily_brief): `apps/web/src/lib/components/settings/NotificationPreferences.svelte`, `apps/web/src/lib/stores/notificationPreferences.ts`, `apps/web/src/routes/api/notification-preferences/+server.ts`.
- Push + in-app toggles and quiet hours are saved via `notificationPreferencesService`: `apps/web/src/lib/services/notification-preferences.service.ts`.
- SMS reminders + quiet hours for SMS scheduler: `apps/web/src/lib/components/settings/SMSPreferences.svelte`, `apps/web/src/routes/api/sms/preferences/+server.ts`.

---

## Findings

### High severity

1. **Subscriptions are required but never created by user-facing flows**
    - `emit_notification_event` only delivers to users with rows in `notification_subscriptions`. I could not find any UI or automatic creation logic that inserts these subscriptions.
    - Result: `brief.completed` (and all other events) will silently generate no deliveries unless subscriptions were created manually.
    - Product requirement (per follow-up): users must explicitly opt in for each notification type; no default subscriptions should be created.
    - Evidence: `supabase/migrations/20251016_004_emit_notification_use_defaults.sql`, `apps/worker/src/workers/brief/briefWorker.ts`, `apps/web/src/lib/services/notification-preferences.service.ts` (service exists but not used in UI).
    - Recommendation: create/activate subscriptions only when a user explicitly opts in (e.g., daily brief toggles), and deactivate on opt-out; add UI for event subscriptions if more event types are exposed.
    - Status: Fixed (subscriptions created via `/api/notification-preferences`, defaults opt-in false, auto-subscribe removed).

2. **Daily brief SMS + notification SMS are effectively disconnected**
    - `emit_notification_event` uses `sms_enabled` to queue SMS deliveries, but the notification worker disables SMS sends and returns success without sending. If `sms_enabled` is ever true, deliveries will be marked sent with no outbound SMS.
    - Daily brief SMS toggle writes `should_sms_daily_brief`, but `emit_notification_event` never checks this field; it only checks `sms_enabled`.
    - Result: daily brief SMS likely never sends (no SMS deliveries created), and if SMS deliveries are created, they are never sent.
    - Evidence: `apps/worker/src/workers/notification/notificationWorker.ts`, `apps/worker/src/workers/notification/smsAdapter.ts`, `supabase/migrations/20251016_004_emit_notification_use_defaults.sql`, `apps/web/src/lib/components/settings/NotificationPreferences.svelte`.
    - Recommendation: either wire `smsAdapter` in the worker or stop queuing SMS deliveries; update `emit_notification_event` to respect `should_sms_daily_brief` for `brief.completed`.
    - Status: Fixed (SMS adapter wired; brief events now use `should_sms_daily_brief`).

3. **Ontology briefs are not used in notification emails**
    - `sendEmailNotification` attempts to load brief content from `daily_briefs` for `brief.completed`, but ontology briefs are stored in `ontology_daily_briefs`. This causes fallback to generic template and drops the actual brief content for ontology users.
    - Evidence: `apps/worker/src/workers/notification/emailAdapter.ts`, `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`, `apps/worker/src/workers/brief/briefWorker.ts`.
    - Recommendation: if `is_ontology_brief` is true (already included in payload), fetch from `ontology_daily_briefs` and use the ontology content.
    - Status: Fixed (ontology briefs now pull from `ontology_daily_briefs`).

### Medium severity

4. **`event_type` is missing from queued job metadata in production flow**
    - `emit_notification_event` queues jobs with only `delivery_id`, `channel`, and `correlationId`. The worker expects `event_type` for payload enrichment fallback and logging.
    - If the event fetch fails, `getFallbackPayload` is called with `undefined`, producing unusable fallback payloads.
    - Evidence: `supabase/migrations/20251016_004_emit_notification_use_defaults.sql`, `apps/worker/src/workers/notification/notificationWorker.ts`.
    - Recommendation: include `event_type` in `queue_jobs.metadata` from `emit_notification_event`.
    - Status: Fixed (queue metadata now includes `event_id` + `event_type`).

5. **Default preferences are inconsistent across DB, API, and UI**
    - DB defaults set `push/email/in_app` to true and `should_email_daily_brief` to true: `supabase/migrations/20251016_002_consolidate_notification_preferences.sql`.
    - Client defaults set `should_email_daily_brief` to false: `apps/web/src/lib/services/notification-preferences.service.ts`, `apps/web/src/lib/stores/notificationPreferences.ts`.
    - RPC fallback defaults in `emit_notification_event` are push=false, email=true, in_app=false (and the comment contradicts this): `supabase/migrations/20251016_004_emit_notification_use_defaults.sql`.
    - Result: new users can see preferences off in UI while backend either sends or skips emails/push based on a different default.
    - Recommendation: align defaults across DB, API, UI, and RPC fallback; update the migration comment or the code.
    - Status: Fixed (DB defaults set to false; RPC now fail-closed; UI defaults already false).

6. **Push/in-app toggles are not persisted until “Save”**
    - Push subscription is created immediately, but `push_enabled` and `in_app_enabled` are only persisted on `Save Preferences`. Users can end up with active push subscriptions but DB preferences still disabled, so sends are canceled.
    - Evidence: `apps/web/src/lib/components/settings/NotificationPreferences.svelte`, `apps/web/src/lib/services/notification-preferences.service.ts`.
    - Recommendation: persist push/in-app changes immediately (same behavior as daily brief toggles) or add a clearer “unsaved changes” UI.
    - Status: Fixed (push/in-app toggles now persist immediately).

7. **Quiet hours for notifications are collected but never enforced**
    - `quiet_hours_*` in `user_notification_preferences` are stored, but the notification worker doesn’t enforce them for push/email/in-app.
    - Evidence: `apps/web/src/lib/components/settings/NotificationPreferences.svelte`, `apps/worker/src/workers/notification/notificationWorker.ts`.
    - Recommendation: add quiet-hours logic before sending, or remove the UI fields to avoid false expectations.
    - Status: Partially fixed (push quiet hours enforced; email/in-app still not gated).

8. **Multiple notification systems are running in parallel**
    - There is the DB-driven notification system (events/deliveries), plus realtime broadcasts (`notifyUser`) and UI-only notification store for progress toasts.
    - Result: it’s hard to reason about which “notification” a user sees, and analytics are fragmented.
    - Evidence: `apps/worker/src/workers/shared/queueUtils.ts`, `apps/web/src/lib/stores/notification.store.ts`, `apps/worker/src/workers/notification/notificationWorker.ts`.
    - Recommendation: consolidate or clearly document which system is for what (e.g., “system notifications” vs “local UI toasts”).

### Low severity / Improvements

9. **Event types exist in shared types but are not emitted anywhere**
    - `brain_dump.processed`, `task.due_soon`, `project.phase_scheduled`, `calendar.sync_failed`, `user.signup`, etc. exist in `packages/shared-types`, but I only found a single `emit_notification_event` call for `brief.completed`.
    - Evidence: `packages/shared-types/src/notification.types.ts`, `apps/worker/src/workers/brief/briefWorker.ts`.
    - Recommendation: either remove unused event types or add emitters where those workflows occur.

10. **In-app notifications are not linked to deliveries**
    - `sendInAppNotification` inserts into `user_notifications` without storing `event_id` or `delivery_id`, so it’s not traceable to the delivery lifecycle.
    - Evidence: `apps/worker/src/workers/notification/notificationWorker.ts`.
    - Recommendation: add optional foreign keys or metadata for correlation if you want unified analytics.
    - Status: Fixed (added `delivery_id` + `event_id` columns and inserts).

11. **Ontology vs legacy brief metrics are only partially mapped**
    - For ontology briefs, task counts come from `ontology_project_briefs.metadata` (camelCase), but only `todaysTaskCount` and `thisWeekTaskCount` are mapped; `overdue`/`next7`/`recently_completed` are set to 0.
    - `is_ontology_brief` is included in the payload but is not part of `BriefCompletedEventPayload`.
    - Evidence: `apps/worker/src/workers/brief/briefWorker.ts`, `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`, `packages/shared-types/src/notification.types.ts`.
    - Recommendation: align payload shape with ontology metadata and update shared types accordingly.
    - Status: Fixed (ontology counts + `is_ontology_brief`/`blocked_task_count` aligned).

---

## Fixes Applied (2026-02-05)

- Explicit opt-in enforced for daily briefs: `/api/notification-preferences` now upserts subscriptions for `brief.completed` + `brief.failed`, auto-subscribe trigger removed, and subscriptions with `created_by IS NULL` are deactivated (`supabase/migrations/20260205_001_notification_opt_in_defaults.sql`, `apps/web/src/routes/api/notification-preferences/+server.ts`).
- Preferences now fail closed and use daily brief toggles: `emit_notification_event` skips users without preferences, respects `should_*_daily_brief` for brief events, and queues `event_id` + `event_type` in metadata (`supabase/migrations/20260205_002_emit_notification_event_opt_in.sql`).
- SMS delivery path restored: notification worker now uses `smsAdapter`, which enforces preference checks + quiet hours; daily brief SMS now keyed off `should_sms_daily_brief` (workers + migration above).
- Ontology email content restored: `brief.completed` emails pull `ontology_daily_briefs` and render `executive_summary` / `llm_analysis` when `is_ontology_brief` is true (`apps/worker/src/workers/notification/emailAdapter.ts`).
- Push/in-app persistence + quiet hours: push/in-app toggles persist immediately; push quiet hours enforced in worker (`apps/web/src/lib/components/settings/NotificationPreferences.svelte`, `apps/worker/src/workers/notification/notificationWorker.ts`).
- In-app notifications now link to deliveries/events: new `delivery_id` + `event_id` columns and inserts (`supabase/migrations/20260205_003_user_notifications_linkage.sql`, `apps/worker/src/workers/notification/notificationWorker.ts`).
- Realtime broadcasts renamed for clarity (`notifyUser` → `broadcastUserEvent`, alias retained) to separate UI broadcasts from persistent notifications (`apps/worker/src/workers/shared/queueUtils.ts`).
- Ontology metrics mapping expanded for payloads (blocked + overdue/recent counts) and shared types updated (`apps/worker/src/workers/brief/briefWorker.ts`, `packages/shared-types/src/notification.types.ts`).

---

## Remaining Follow-ups (Decisions / Product Scope)

1. Decide whether realtime broadcasts (`broadcastUserEvent`) should be consolidated with the DB notification system or documented as a separate UX-only layer.
2. Decide whether to add emitters for other event types (`task.due_soon`, `project.phase_scheduled`, etc.) or prune unused types from shared models.
