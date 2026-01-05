<!-- docs/testing/daily-brief-notification-refactor-tests.md -->

# Daily Brief Notification Tests (Current)

**Date:** 2026-02-05
**Scope:** Daily brief notification pipeline (event emission → delivery → adapters)

---

## What Should Be Covered

### 1) API: Notification Preferences

**File:** `apps/web/src/routes/api/notification-preferences/+server.ts`

Must verify:

- GET `?daily_brief=true` returns only daily brief fields
- PUT updates preferences and writes `updated_at`
- SMS validation (phone required + verified + not opted out)
- Brief activation required (`user_brief_preferences.is_active = true`)
- Subscription upsert for `brief.completed` and `brief.failed`
- Opt-in gate: `is_active` is true only when any daily brief channel is enabled

**Test file:** `apps/web/src/routes/api/notification-preferences/server.test.ts`

---

### 2) Event Emission

**File:** `apps/worker/src/workers/brief/briefWorker.ts`

Must verify:

- Emits `brief.completed` on success
- Emits `brief.failed` on failure
- Payload includes `brief_id`, `brief_date`, `timezone`, `is_ontology_brief`

---

### 3) RPC: emit_notification_event

**Migration:** `supabase/migrations/20260205_002_emit_notification_event_opt_in.sql`

Must verify:

- Skips users without preferences (fail closed)
- Uses `should_email_daily_brief` / `should_sms_daily_brief` for brief events
- Uses `push_enabled` / `in_app_enabled` for brief events
- Requires subscription with `created_by` or `admin_only=true`
- Writes `event_id` + `event_type` into `queue_jobs.metadata`

---

### 4) Worker + Adapters

**Files:**

- `apps/worker/src/workers/notification/notificationWorker.ts`
- `apps/worker/src/workers/notification/emailAdapter.ts`
- `apps/worker/src/workers/notification/smsAdapter.ts`
- `apps/worker/src/workers/notification/preferenceChecker.ts`

Must verify:

- Preference checks occur before send (fail closed)
- Push quiet hours enforced
- Email for ontology briefs uses `ontology_daily_briefs`
- SMS adapter creates `sms_messages` and queues `send_sms`
- In-app insert includes `delivery_id` + `event_id`

---

## Suggested Manual Verification Steps

1. **Opt-in via API**

```bash
curl -X PUT "https://your-domain.com/api/notification-preferences" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"should_email_daily_brief":true}'
```

2. **Confirm subscription + preferences**

```sql
SELECT * FROM notification_subscriptions
WHERE user_id = 'your-user-id'
  AND event_type IN ('brief.completed','brief.failed');

SELECT * FROM user_notification_preferences
WHERE user_id = 'your-user-id';
```

3. **Trigger brief generation** and validate:

- `notification_events` row exists
- `notification_deliveries` created for opted-in channels
- `queue_jobs.metadata` includes `event_id` + `event_type`

4. **Channel checks**

- Email: `emails` + `email_recipients`
- SMS: `sms_messages`
- In-app: `user_notifications` has `delivery_id` + `event_id`

---

## Gaps to Add (If Missing)

- Unit tests for `emit_notification_event` behavior (SQL or integration)
- Worker test for `brief.failed` emission
- Adapter tests to verify strict preference gating
