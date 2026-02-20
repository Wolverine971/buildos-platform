<!-- apps/web/docs/features/notifications/notification-audit.md -->

# Notification System Audit (BuildOS)

Date: 2026-02-19  
Auditor: Codex  
Scope: `apps/web`, `apps/worker`, `packages/shared-types`, `supabase/migrations`

## Executive Summary

The notification system is functional and has a solid core pipeline, but it currently runs as multiple overlapping systems:

1. A persistent multi-channel delivery pipeline (`notification_events` -> `notification_deliveries` -> worker adapters).
2. A separate project-activity batching pipeline with its own gating behavior.
3. UI-local notification systems (toasts + stackable notifications + realtime brief broadcasts).
4. A tracked in-app helper path for feature notifications that now writes linked event/delivery artifacts.

The main risks are consistency and trust in delivery state:

- preference writes are split across paths, which can leave channels enabled but subscriptions inactive,
- some webhook security and retry semantics can misclassify or duplicate behavior,
- analytics definitions do not match current status transitions,
- historical mixed in-app write paths required standardization to preserve delivery observability.

## Remediation Progress (2026-02-20)

Priority-0 / high-severity items addressed in code:

- [x] Unified browser preference writes through `/api/notification-preferences` so subscription reconciliation runs on channel toggle updates.
    - Implementation: `apps/web/src/lib/services/notification-preferences.service.ts`
- [x] Enforced Twilio signature requirement outside development mode.
    - Implementation: `apps/web/src/routes/api/webhooks/twilio/status/+server.ts`
- [x] Corrected email webhook preference logic so both `brief.completed` and `brief.failed` use `should_email_daily_brief`.
    - Implementation: `apps/web/src/routes/api/webhooks/send-notification-email/+server.ts`
- [x] Added canonical `event_type` to admin retry metadata (by resolving `notification_events.event_type`).
    - Implementation: `apps/web/src/routes/api/admin/notifications/deliveries/[id]/retry/+server.ts`
- [x] Introduced explicit `cancelled` notification delivery state for preference/quiet-hour suppressions.
    - Implementation: `apps/worker/src/workers/notification/notificationWorker.ts`, `packages/shared-types/src/notification.types.ts`, `supabase/migrations/20260426000006_notification_priority1_fixes.sql`
- [x] Updated analytics SQL to lifecycle-safe denominators and excluded cancelled suppressions from failure KPIs.
    - Implementation: `packages/shared-types/src/functions/get_notification_overview_metrics.sql`, `packages/shared-types/src/functions/get_notification_channel_performance.sql`, `packages/shared-types/src/functions/get_notification_event_performance.sql`, `packages/shared-types/src/functions/get_notification_delivery_timeline.sql`, `supabase/migrations/20260426000006_notification_priority1_fixes.sql`
- [x] Added Twilio retry dedup keys to prevent duplicate resend jobs for repeated callbacks.
    - Implementation: `apps/web/src/routes/api/webhooks/twilio/status/+server.ts`
- [x] Added atomic DB-side SMS daily limit RPC and integrated worker safety checks with fallback.
    - Implementation: `packages/shared-types/src/functions/check_and_increment_sms_daily_limit.sql`, `apps/worker/src/lib/utils/smsPreferenceChecks.ts`, `supabase/migrations/20260426000006_notification_priority1_fixes.sql`
- [x] Aligned project activity batching with `notification_subscriptions` contract.
    - Implementation: `supabase/migrations/20260426000007_notification_priority2_activity_alignment.sql`, `apps/web/src/routes/api/onto/projects/[id]/notification-settings/+server.ts`, `apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts`
- [x] Clarified synthetic activity feed semantics so event-only rows are no longer rendered as delivered notifications.
    - Implementation: `apps/web/src/routes/notifications/+page.server.ts`, `apps/web/src/routes/notifications/+page.svelte`
- [x] Added explicit transformer support for `project.invite.accepted`.
    - Implementation: `packages/shared-types/src/payloadTransformer.ts`, `packages/shared-types/src/notification.types.ts`, `apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts`
- [x] Ensured shared-project activity notifications create in-app deliveries by default once project-level activity notifications are enabled.
    - Implementation: `supabase/migrations/20260426000008_shared_project_activity_default_in_app.sql`, `apps/web/src/lib/components/project/ProjectCollaborationModal.svelte`
- [x] Decommissioned legacy `generate_brief_email` worker processing and cancelled remaining legacy queue jobs.
    - Implementation: `apps/worker/src/worker.ts`, `supabase/migrations/20260426000009_decommission_legacy_brief_email_jobs.sql`
- [x] Stopped emitting raw `project.activity.changed` events from project-log trigger path.
    - Implementation: `supabase/migrations/20260426000010_remove_raw_project_activity_changed_events.sql`
- [x] Removed unused notification subscription activity helper.
    - Implementation: `apps/worker/src/workers/notification/preferenceChecker.ts`
- [x] Added mention notification writes for goal/document create + update flows, aligned with task mention behavior.
    - Implementation: `apps/web/src/routes/api/onto/goals/create/+server.ts`, `apps/web/src/routes/api/onto/goals/[id]/+server.ts`, `apps/web/src/routes/api/onto/documents/create/+server.ts`, `apps/web/src/routes/api/onto/documents/[id]/+server.ts`
- [x] Started phase-2 agentic chat assignment support by resolving `@handle` inputs to assignee actor IDs before task create/update writes.
    - Implementation: `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`, `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
- [x] Added phase-2 entity tag flow (`tag_onto_entity`) with two execution paths: content mention injection (canonical tokens in task/goal/document fields) and explicit ping mode via `POST /api/onto/mentions/ping`.
    - Implementation: `apps/web/src/routes/api/onto/mentions/ping/+server.ts`, `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`, `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
- [x] Standardized remaining direct in-app writers onto tracked notification artifacts (`notification_events` + `notification_deliveries` + linked `user_notifications`) so `/notifications` includes assignment/mention/homework/billing/trial flows consistently.
    - Implementation: `apps/web/src/lib/server/tracked-in-app-notification.service.ts`, `apps/worker/src/lib/utils/trackedInAppNotification.ts`, `apps/web/src/lib/server/task-assignment.service.ts`, `apps/web/src/lib/server/entity-mention-notification.service.ts`, `apps/web/src/routes/api/onto/comments/comment-mentions.ts`, `apps/web/src/lib/services/dunning-service.ts`, `apps/web/src/routes/api/cron/trial-reminders/+server.ts`, `apps/web/src/routes/api/cron/billing-ops-monitoring/+server.ts`, `apps/web/src/routes/api/homework/runs/[id]/cancel/+server.ts`, `apps/worker/src/workers/homework/homeworkWorker.ts`, `supabase/migrations/20260426000011_notification_event_type_expansion_for_tracked_in_app.sql`

Validation run:

- `pnpm --filter @buildos/web test -- src/routes/api/notification-preferences/server.test.ts` passed (14/14).
- `pnpm --filter @buildos/worker typecheck` passed.
- `pnpm --filter @buildos/web test -- src/routes/api/onto/tasks/create/task-create-assignment-mentions.test.ts src/routes/api/onto/tasks/[id]/task-patch-assignment-mentions.test.ts src/routes/api/onto/documents/create/document-create-mentions.test.ts src/routes/api/onto/goals/create/goal-create-mentions.test.ts src/routes/api/onto/mentions/ping/mention-ping.test.ts` passed (6/6).
- `pnpm --filter @buildos/web test -- src/lib/server/billing-ops-monitoring.test.ts src/routes/api/notification-preferences/server.test.ts` passed (17/17).
- `pnpm --filter @buildos/web check` still fails due large unrelated pre-existing type/a11y issues across admin/blog/homework/etc routes.
- `pnpm --filter @buildos/web check` rerun after Priority 2 changes showed no diagnostics in modified notification files (`routes/notifications`, project notification settings API, invite accept API, transformer/types).
- `pnpm --filter @buildos/web check` rerun after tracked in-app migration showed no diagnostics in modified notification files (`task-assignment.service`, `entity-mention-notification.service`, `comment-mentions`, trial/billing/homework notification routes, `routes/notifications`).

## Method

Audit approach:

1. Trace all runtime emitters (`emit_notification_event`, trigger-based inserts, manual event creation).
2. Trace all queue producers/consumers (`add_queue_job`, `claim_pending_jobs`, worker handlers).
3. Trace per-channel adapters and tracking callbacks (push/email/SMS/in-app).
4. Trace user-facing preference write paths and feed rendering.
5. Compare data model intent vs observed runtime behavior.

## Current Architecture

### 1) Standard RPC Notification Pipeline

Primary contract:

1. Callers emit via `emit_notification_event(...)`.
2. Function inserts `notification_events`.
3. Function selects active `notification_subscriptions` and merges with `user_notification_preferences`.
4. Function inserts `notification_deliveries` + `queue_jobs` (`send_notification`).
5. Worker processes queued delivery by channel.
6. Tracking endpoints update lifecycle timestamps/status.

Evidence:

- Subscription + preference gating and queue creation: `packages/shared-types/src/functions/emit_notification_event.sql:50`
- Push queue metadata with `event_type`: `packages/shared-types/src/functions/emit_notification_event.sql:110`
- In-app insert in worker: `apps/worker/src/workers/notification/notificationWorker.ts:429`
- Email adapter: `apps/worker/src/workers/notification/emailAdapter.ts:475`
- SMS adapter and atomic status updates: `packages/shared-types/src/functions/update_sms_status_atomic.sql:1`

### 2) Project Activity Batch Pipeline (Parallel Path)

Current flow:

1. Trigger on `onto_project_logs` queues/upserts `project_notification_batches`.
2. Trigger no longer inserts raw `project.activity.changed` events (batched-only path).
3. Flush job calls `flush_project_activity_notification_batch`.
4. Flush emits `project.activity.batched` and creates deliveries gated by active subscriptions + preferences/project settings.

Evidence:

- Raw event insert removal: `supabase/migrations/20260426000010_remove_raw_project_activity_changed_events.sql:1`
- Subscription-aligned batched event delivery contract: `supabase/migrations/20260426000007_notification_priority2_activity_alignment.sql:1`
- Flush worker: `apps/worker/src/workers/notification/projectActivityBatchWorker.ts:1`

### 3) UI-Local Notification Layers (Non-Persistent)

- Stackable notification store: `apps/web/src/lib/stores/notification.store.ts`
- Toast store: `apps/web/src/lib/stores/toast.store.ts`
- Realtime brief broadcast and toasts: `apps/web/src/lib/services/realtimeBrief.service.ts`

These are useful UX surfaces but are not equivalent to delivery-tracked notifications.

### 4) Tracked In-App Writers (Linked Artifacts)

Remaining in-app feature writers now create linked artifacts through tracked helper services:

- `notification_events` row per notification event
- `notification_deliveries` row (`channel='in_app'`, linked to event)
- `user_notifications` row linked to both event + delivery

Evidence:

- Web helper: `apps/web/src/lib/server/tracked-in-app-notification.service.ts:1`
- Worker helper: `apps/worker/src/lib/utils/trackedInAppNotification.ts:1`
- Migrated feature paths: `apps/web/src/lib/server/task-assignment.service.ts:337`, `apps/web/src/lib/server/entity-mention-notification.service.ts:213`, `apps/web/src/routes/api/onto/comments/comment-mentions.ts:136`, `apps/web/src/lib/services/dunning-service.ts:159`, `apps/web/src/routes/api/cron/trial-reminders/+server.ts:75`, `apps/web/src/routes/api/cron/billing-ops-monitoring/+server.ts:220`, `apps/web/src/routes/api/homework/runs/[id]/cancel/+server.ts:50`, `apps/worker/src/workers/homework/homeworkWorker.ts:124`

## Notification Flow by Channel

### Push

1. Delivery row created for push subscription endpoint.
2. Worker sends Web Push payload.
3. Service worker click posts to click tracking endpoint.

Evidence:

- Worker push send path: `apps/worker/src/workers/notification/notificationWorker.ts:300`
- Service worker click tracking: `apps/web/static/sw.js:52`
- Click API: `apps/web/src/routes/api/notification-tracking/click/[delivery_id]/+server.ts:1`

### Email

1. Worker email adapter creates email records.
2. Worker calls `/api/webhooks/send-notification-email`.
3. Open and click trackers update both email tables and linked notification delivery.

Evidence:

- Email adapter webhook call: `apps/worker/src/workers/notification/emailAdapter.ts:475`
- Webhook sender: `apps/web/src/routes/api/webhooks/send-notification-email/+server.ts:1`
- Open tracker: `apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts:1`
- Click tracker: `apps/web/src/routes/api/email-tracking/[tracking_id]/click/+server.ts:1`

### SMS

1. SMS adapter queues SMS with tracking links.
2. Twilio status webhook updates `sms_messages` + linked delivery via atomic RPC.
3. Short-link redirect updates click/open status on first click.

Evidence:

- Twilio webhook: `apps/web/src/routes/api/webhooks/twilio/status/+server.ts:1`
- Atomic updater: `packages/shared-types/src/functions/update_sms_status_atomic.sql:1`
- Link redirect tracking: `apps/web/src/routes/l/[short_code]/+server.ts:1`
- Tracking link creator: `packages/shared-types/src/functions/create_tracking_link.sql:1`

### In-App

1. Worker channel adapter inserts into `user_notifications` with `delivery_id` + `event_id`.
2. User notifications page joins deliveries/events and appends synthetic rows for project activity batched events without delivery rows, now marked as virtual activity entries (not delivered status).

Evidence:

- In-app adapter insert: `apps/worker/src/workers/notification/notificationWorker.ts:429`
- Feed synthetic rows: `apps/web/src/routes/notifications/+page.server.ts:97`

## Runtime Event Emitter Inventory

Observed production emitters:

- `brief.completed` and `brief.failed` from brief worker: `apps/worker/src/workers/brief/briefWorker.ts:267`, `apps/worker/src/workers/brief/briefWorker.ts:325`
- `project.invite.accepted` from invite accept API: `apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts:158`, `apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts:234`
- `project.activity.batched` from batch flush function: `supabase/migrations/20260424000000_project_activity_notification_batching.sql:149`
- `task.assigned` from task assignment service: `apps/web/src/lib/server/task-assignment.service.ts:337`
- `entity.tagged` from entity mention service: `apps/web/src/lib/server/entity-mention-notification.service.ts:213`
- `comment.mentioned` from comment mention handler: `apps/web/src/routes/api/onto/comments/comment-mentions.ts:136`
- `payment.warning` from dunning service: `apps/web/src/lib/services/dunning-service.ts:159`
- `user.trial_reminder` from trial reminder cron: `apps/web/src/routes/api/cron/trial-reminders/+server.ts:75`
- `billing_ops_anomaly` from billing ops monitoring cron: `apps/web/src/routes/api/cron/billing-ops-monitoring/+server.ts:220`
- `homework.run_completed`, `homework.run_stopped`, `homework.run_failed`, `homework.run_canceled`, `homework.run_updated` from homework worker/API: `apps/worker/src/workers/homework/homeworkWorker.ts:91`, `apps/web/src/routes/api/homework/runs/[id]/cancel/+server.ts:50`

Event types in shared union but not found as regular runtime emitters in product flows (outside admin/test tooling):

- `user.signup`, `user.trial_expired`, `payment.failed`, `error.critical`,
- `brain_dump.processed`, `task.due_soon`, `project.activity.changed`, `project.phase_scheduled`, `calendar.sync_failed`

Evidence:

- Event union: `packages/shared-types/src/notification.types.ts:12`

## Findings

### High Severity

1. **Split preference write paths can break opt-in delivery**
    - Evidence:
        - UI channel toggles call direct service update: `apps/web/src/lib/components/settings/NotificationPreferences.svelte:165`
        - Direct service only upserts `user_notification_preferences`: `apps/web/src/lib/services/notification-preferences.service.ts:68`
        - Subscription upsert is only in API route PUT: `apps/web/src/routes/api/notification-preferences/+server.ts:156`
    - Impact:
        - User can enable push/in-app and still miss `brief.*` notifications if subscriptions are absent/inactive.
    - Recommendation:
        - Route all preference writes through one API/service path that always reconciles subscriptions.
    - Status:
        - Fixed in code on 2026-02-20 (`notificationPreferencesService.update()` now uses `/api/notification-preferences` in browser).

2. **Twilio status webhook validation is fail-open when signature is missing**
    - Evidence:
        - Missing signature logs warning but request continues: `apps/web/src/routes/api/webhooks/twilio/status/+server.ts:153`
    - Impact:
        - Unauthenticated requests can attempt status mutation/retry scheduling if endpoint is reachable.
    - Recommendation:
        - Require valid signature in production; reject missing signature with `401`.
    - Status:
        - Fixed in code on 2026-02-20 (missing signature returns `401` when not in development mode).

3. **`brief.failed` email preference check is inconsistent with worker logic**
    - Evidence:
        - Webhook checks `should_email_daily_brief` only for `brief.completed`: `apps/web/src/routes/api/webhooks/send-notification-email/+server.ts:83`
        - Worker preference checker treats both `brief.completed` and `brief.failed` as daily-brief events: `apps/worker/src/workers/notification/preferenceChecker.ts:88`
    - Impact:
        - `brief.failed` emails can be incorrectly cancelled when `email_enabled=false` and `should_email_daily_brief=true`.
    - Recommendation:
        - Treat both `brief.completed` and `brief.failed` as daily-brief channel checks in webhook guard.
    - Status:
        - Fixed in code on 2026-02-20 (`brief.failed` now follows daily-brief preference gating).

### Medium Severity

1. **Admin retry job omits `event_type` metadata**
    - Evidence:
        - Retry metadata lacks `event_type`: `apps/web/src/routes/api/admin/notifications/deliveries/[id]/retry/+server.ts:53`
        - Worker fallback defaults to `'brief.completed'`: `apps/worker/src/workers/notification/notificationWorker.ts:700`
        - Metadata type expects required `event_type`: `packages/shared-types/src/notification.types.ts:262`
    - Impact:
        - If event lookup/payload enrichment fails, fallback can use wrong event semantics.
    - Recommendation:
        - Always include canonical `event_type` in retry metadata.
    - Status:
        - Fixed in code on 2026-02-20 (retry endpoint now resolves and injects `notification_events.event_type`).

2. **Suppressed deliveries are stored as `failed`**
    - Evidence:
        - Preference cancellation writes `status='failed'`: `apps/worker/src/workers/notification/notificationWorker.ts:741`
        - Quiet-hours suppression writes `status='failed'`: `apps/worker/src/workers/notification/notificationWorker.ts:777`
    - Impact:
        - Operational failures and intentional suppressions are conflated.
    - Recommendation:
        - Add explicit `cancelled` status (or equivalent flag) and update analytics/admin queries.
    - Status:
        - Fixed in code on 2026-02-20 (`status='cancelled'` now used for preference and push quiet-hours suppressions).

3. **Analytics denominators are not lifecycle-consistent**
    - Evidence:
        - Overview metrics denominator uses `status='sent'`: `packages/shared-types/src/functions/get_notification_overview_metrics.sql:23`
        - Channel and event metrics similarly depend on `status='sent'`: `packages/shared-types/src/functions/get_notification_channel_performance.sql:13`, `packages/shared-types/src/functions/get_notification_event_performance.sql:21`
    - Impact:
        - Rates can drift as rows transition to `delivered/opened/clicked/failed`.
    - Recommendation:
        - Recompute metrics from timestamps/final lifecycle states instead of mutable intermediate status.
    - Status:
        - Fixed in code on 2026-02-20 (overview/channel/event/timeline SQL functions now use lifecycle-safe status sets).

4. **Project activity batching bypasses explicit subscription model**
    - Evidence:
        - Batched path reads `user_notification_preferences` directly and creates deliveries without subscription lookup: `supabase/migrations/20260424000000_project_activity_notification_batching.sql:159`
    - Impact:
        - One event family follows a different opt-in contract than `emit_notification_event`.
    - Recommendation:
        - Decide and document a single contract, then enforce it in both pipelines.
    - Status:
        - Fixed in code on 2026-02-20 (`project.activity.batched` now requires an active subscription; batch queueing keeps recipient subscriptions synchronized when project activity notifications are enabled).

5. **Notifications feed synthesizes delivered rows with no delivery record**
    - Evidence:
        - Synthetic rows are created and marked `status='delivered'`: `apps/web/src/routes/notifications/+page.server.ts:97`
    - Impact:
        - Feed can imply delivery happened even when channel delivery was suppressed.
    - Recommendation:
        - Render synthetic activity with explicit virtual status/type (not delivered notification status).
    - Status:
        - Fixed in code on 2026-02-20 (synthetic project activity entries now render with explicit `feed_kind='activity_event'` and neutral activity status, not delivered).

6. **Raw `project.activity.changed` events are emitted for every log but not delivered**
    - Evidence:
        - Historical (pre-fix): trigger inserted event with `target_user_id = NULL`: `supabase/migrations/20260424000000_project_activity_notification_batching.sql:729`
    - Impact:
        - Extra event volume without user-facing value in current flow.
    - Recommendation:
        - Either wire delivery usage for this event or stop writing raw events and keep only batched artifacts.
    - Status:
        - Fixed in code on 2026-02-20 (trigger no longer inserts raw `project.activity.changed`; batching path remains).

7. **Twilio retry queueing does not use dedup keys**
    - Evidence:
        - Retry `add_queue_job` call has no `p_dedup_key`: `apps/web/src/routes/api/webhooks/twilio/status/+server.ts:345`
        - `add_queue_job` supports dedup by key: `packages/shared-types/src/functions/add_queue_job.sql:4`
    - Impact:
        - Duplicate failed callbacks can enqueue duplicate retries.
    - Recommendation:
        - Add deterministic dedup key, e.g. `sms_retry:{message_id}:{retry_attempt}`.
    - Status:
        - Fixed in code on 2026-02-20 (retry jobs now use `sms_retry_{message_id}_{retry_attempt}` dedup key).

8. **SMS daily limit update is not atomic**
    - Evidence:
        - Read-modify-write flow for `daily_sms_count` in application code: `apps/worker/src/lib/utils/smsPreferenceChecks.ts:146`
    - Impact:
        - Concurrent sends can exceed limits.
    - Recommendation:
        - Move increment/reset logic to a transactional SQL RPC with conditional update.
    - Status:
        - Fixed in code on 2026-02-20 (atomic `check_and_increment_sms_daily_limit` RPC; worker utility calls RPC with legacy fallback).

### Low Severity / Design Debt

1. **`project.invite.accepted` lacks transformer case**
    - Evidence:
        - No switch case for invite accepted: `packages/shared-types/src/payloadTransformer.ts:366`
        - Current invite emitter includes explicit title/body, masking issue: `apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts:162`
    - Impact:
        - Future emitters without title/body will fall back poorly.
    - Recommendation:
        - Add transformer for `project.invite.accepted`.
    - Status:
        - Fixed in code on 2026-02-20 (transformer added; invite emit payload also now includes `actor_name`).

2. **Legacy daily-brief email worker path remains registered**
    - Evidence:
        - Historical (pre-fix): worker registered `generate_brief_email`: `apps/worker/src/worker.ts:360`
        - Legacy status called out in worker file: `apps/worker/src/workers/brief/emailWorker.ts:3`
        - Legacy webhook remains for compatibility: `apps/web/src/routes/webhooks/daily-brief-email/+server.ts:1`
    - Impact:
        - Ongoing maintenance and mental overhead.
    - Recommendation:
        - Define decommission plan after queue/data migration validation.
    - Status:
        - Fixed in code on 2026-02-20 (worker no longer registers `generate_brief_email`; remaining pending/retrying legacy jobs are cancelled by migration).

3. **Unused subscription helper**
    - Evidence:
        - Helper exported: `apps/worker/src/workers/notification/preferenceChecker.ts:227`
        - Search found no call sites in application code.
    - Impact:
        - Dead code and confusion about active guardrails.
    - Recommendation:
        - Remove or integrate explicitly into send path.
    - Status:
        - Fixed in code on 2026-02-20 (`checkSubscriptionActive` removed from preference checker).

4. **Mixed in-app write model increases inconsistency**
    - Evidence:
        - Worker in-app delivery path writes linked records: `apps/worker/src/workers/notification/notificationWorker.ts:429`
        - Historical (pre-fix): several feature paths wrote only to `user_notifications` with no event/delivery linkage.
    - Impact:
        - Uneven observability, preference enforcement, and analytics fidelity.
    - Recommendation:
        - Define which classes of in-app notifications must go through delivery pipeline and standardize.
    - Status:
        - Fixed in code on 2026-02-20 (remaining direct writers now create linked `notification_events` + `notification_deliveries` + `user_notifications` via tracked in-app helper services; event-type constraint expanded in migration `20260426000011`).

## Recommended Remediation Plan

### Priority 0 (Immediate)

1. Done (2026-02-20): Unify preference writes and subscription reconciliation into one path.
2. Done (2026-02-20): Enforce strict Twilio signature validation in production.
3. Done (2026-02-20): Fix webhook daily-brief email check for `brief.failed`.
4. Done (2026-02-20): Include `event_type` in admin retry metadata.

### Priority 1

1. Done (2026-02-20): Add explicit `cancelled` delivery status and update analytics queries.
2. Done (2026-02-20): Rework analytics denominators to lifecycle-safe formulas.
3. Done (2026-02-20): Add dedup keys for Twilio-driven SMS retries.
4. Done (2026-02-20): Move SMS rate-limit checks to atomic DB-side operation.

### Priority 2

1. Done (2026-02-20): Project activity batching now honors `notification_subscriptions` and keeps them synchronized for enabled recipients.
2. Done (2026-02-20): Synthetic feed activity rows now use explicit virtual feed semantics (not delivered status).
3. Done (2026-02-20): Added transformer coverage for `project.invite.accepted` and aligned payload fields.
4. Done (2026-02-20): Decommissioned legacy brief email worker job processing and cancelled queued legacy jobs.

## Validation Checklist

1. Toggle push/in-app from profile and verify corresponding `brief.completed`/`brief.failed` subscriptions are activated/deactivated.
2. Confirm Twilio webhook without valid signature returns `401` in production config.
3. Verify `brief.failed` email respects `should_email_daily_brief`.
4. Retry any delivery from admin and verify metadata includes canonical `event_type`.
5. Verify cancelled notifications do not appear in failure KPIs.
6. Verify analytics remain stable when statuses progress from `pending -> sent -> opened/clicked/delivered`.
7. Confirm SMS retries are deduplicated for repeated callback events.
8. Run concurrency test for SMS daily limit and confirm no overrun.
9. Verify project activity notifications only deliver when `project.activity.batched` subscription is active for recipient.
10. Verify invite acceptance and project notification settings PATCH both create/maintain active `project.activity.batched` subscription rows.
11. Verify synthetic project activity entries show as "Activity" (virtual feed rows), not "Delivered".
12. Verify worker no longer registers `generate_brief_email` and that pending/retrying legacy jobs are cancelled after migration `20260426000009`.
13. Verify trigger path no longer inserts raw `project.activity.changed` events for new `onto_project_logs` rows.
14. Verify migrated assignment/mention/comment flows create linked `event_id` + `delivery_id` on `user_notifications` rows and appear in `/notifications`.
15. Verify dunning/trial/billing-ops/homework in-app notifications create `notification_deliveries` rows with `status='delivered'` and `channel='in_app'`.
16. Verify migration `20260426000011` is applied and new event types insert successfully into `notification_events`.
