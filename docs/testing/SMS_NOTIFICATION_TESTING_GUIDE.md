# SMS Notification Channel Testing Guide

This guide walks through testing the SMS notification integration end-to-end, including Phase 3 UX enhancements.

## Phase 3 UX Testing (New!)

Phase 3 adds UI components for phone verification and SMS notification preferences. Test these flows first:

### Test 1: Notification Preferences with Unverified Phone

1. Navigate to **Settings → Notifications**
2. Look for the SMS Notifications toggle
3. **Expected**: Toggle shows "Phone verification required" warning
4. Click the SMS toggle to enable
5. **Expected**: Phone verification modal opens automatically
6. Enter your phone number and complete verification
7. **Expected**: Modal closes, SMS toggle is now enabled, phone number displayed
8. Click "Save Preferences"
9. **Expected**: Success toast, preferences saved with SMS enabled

### Test 2: Notification Preferences with Verified Phone

1. Navigate to **Settings → Notifications** (with already verified phone)
2. **Expected**: SMS toggle shows verified phone number
3. Toggle SMS on/off
4. **Expected**: Toggle works immediately without modal
5. Save preferences
6. **Expected**: Preferences saved successfully

### Test 3: Onboarding Flow

1. Create a new test account
2. Go through onboarding steps
3. Reach the "Stay Accountable" (notifications) step
4. **Expected**: See phone verification card and email preferences
5. Complete phone verification
6. **Expected**: SMS preference options appear
7. Enable one or more SMS options (e.g., Morning Kickoff)
8. Complete onboarding
9. **Expected**: SMS enabled for `brief.completed` event in notification preferences

### Test 4: API Endpoint

```bash
# Test GET notification preferences
curl -X GET "https://your-domain.com/api/notification-preferences?event_type=brief.completed" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test PUT notification preferences
curl -X PUT "https://your-domain.com/api/notification-preferences" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"brief.completed","sms_enabled":true}'
```

---

## Phase 4 Webhook Testing (New!)

Phase 4 enhances the Twilio webhook handler with comprehensive logging, error categorization, and intelligent retry logic.

### Test 1: Successful SMS Delivery Flow

**Trigger**: Send a test SMS

```sql
-- Trigger test notification
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'test',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := '{"title": "Test Brief", "task_count": 3}'::jsonb
);
```

**Monitor Logs**: Watch for structured logging output:
```
[TwilioWebhook] Received status update
[TwilioWebhook] Processing status update
[TwilioWebhook] SMS message updated successfully
[TwilioWebhook] Updating notification delivery
[TwilioWebhook] Dual-table update completed successfully
[TwilioWebhook] Webhook processed successfully
```

**Verify**: Check processing time is logged

### Test 2: Failed Delivery with Retry

**Simulate**: Use invalid phone number or trigger carrier error

**Expected Logs**:
```
[TwilioWebhook] SMS delivery error detected (error_category: carrier_issue, severity: medium)
[TwilioWebhook] Scheduling retry for failed SMS (delaySeconds: 180, attemptCount: 1)
```

**Verify**:
```sql
-- Check retry was scheduled
SELECT
  metadata->'error_category' as error_category,
  metadata->'retry_attempt' as retry_attempt,
  scheduled_for
FROM queue_jobs
WHERE job_type = 'send_sms'
  AND metadata->>'message_id' = 'YOUR_MESSAGE_ID'
ORDER BY created_at DESC
LIMIT 1;
```

### Test 3: Permanent Failure (No Retry)

**Simulate**: Use clearly invalid number (e.g., +1234)

**Expected Logs**:
```
[TwilioWebhook] SMS delivery error detected (error_category: invalid_number, severity: high)
[TwilioWebhook] Permanent failure - retry not attempted (reason: Error category indicates permanent failure)
```

**Verify**: No retry job created, both tables show failed status

### Test 4: Rate Limiting Handling

**Simulate**: Hit Twilio rate limits (error code 20429)

**Expected Behavior**:
- Error categorized as 'rate_limit' with 'low' severity
- Retry scheduled with 5-minute base delay
- Exponential backoff applied for subsequent retries

### Test 5: Dual-Table Update Verification

**After any status update**:

```sql
-- Verify both tables are in sync
SELECT
  'sms_messages' as table_name,
  sm.id,
  sm.status,
  sm.sent_at,
  sm.delivered_at,
  sm.notification_delivery_id
FROM sms_messages sm
WHERE sm.id = 'YOUR_SMS_MESSAGE_ID'

UNION ALL

SELECT
  'notification_deliveries' as table_name,
  nd.id,
  nd.status,
  nd.sent_at,
  nd.delivered_at,
  nd.external_id
FROM notification_deliveries nd
WHERE nd.id = (
  SELECT notification_delivery_id
  FROM sms_messages
  WHERE id = 'YOUR_SMS_MESSAGE_ID'
);

-- Expected: Both records show same status and timestamps
```

### Test 6: Monitoring & Observability

**Check Logs for Metrics**:
```bash
# In production logs, search for:
grep "Webhook processed successfully" logs.txt | jq '.processingTimeMs'
grep "error_category" logs.txt | jq -r '.errorCategory' | sort | uniq -c
grep "severity: critical" logs.txt
```

**Performance Baseline**:
- Successful webhook: < 100ms processing time
- Failed with retry: < 200ms processing time

---

## Phase 1 & 2 Backend Testing

## Prerequisites

### 1. Apply Migrations

```bash
cd apps/web

# Check if migrations are applied
pnpm supabase db remote commit

# Or apply manually
pnpm supabase migration up
```

Migrations needed:

- `20251006_sms_notification_channel_phase1.sql` - Foreign key, helper function, RPC update
- `20251006_sms_notification_channel_phase2_templates.sql` - SMS templates

### 2. Rebuild Worker

```bash
cd apps/worker
pnpm build
```

### 3. Restart Worker Service

If deployed (Railway/etc):

- Restart the worker service to pick up new code

If running locally:

```bash
cd apps/worker
pnpm dev
```

### 4. Environment Variables

Ensure these are set in worker:

```bash
# Required
PUBLIC_SUPABASE_URL=your_url
PRIVATE_SUPABASE_SERVICE_KEY=your_key
PRIVATE_OPENROUTER_API_KEY=your_key

# Twilio (should already be set)
PRIVATE_TWILIO_ACCOUNT_SID=ACxxx
PRIVATE_TWILIO_AUTH_TOKEN=xxx
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=MGxxx
PRIVATE_TWILIO_VERIFY_SERVICE_SID=VAxxx  # Optional
```

---

## Testing Steps

### Phase 1: Database Verification

Run these SQL queries to verify migrations applied correctly:

```sql
-- ✅ Check foreign key was added
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'sms_messages'
  AND column_name = 'notification_delivery_id';

-- Expected: One row showing UUID, nullable column


-- ✅ Check helper function exists
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'get_user_sms_channel_info';

-- Expected: One row showing FUNCTION


-- ✅ Check SMS templates were added
SELECT
  template_key,
  name,
  is_active
FROM sms_templates
WHERE template_key LIKE 'notif_%';

-- Expected: 6 rows (notif_user_signup, notif_brief_completed, etc.)


-- ✅ Test helper function
SELECT *
FROM get_user_sms_channel_info(auth.uid());

-- Expected: Row showing your phone status
-- has_sms_available = true if you have verified phone
```

---

### Phase 2: Phone Verification (If Not Already Done)

**Option A: Via UI**

1. Navigate to Settings > SMS Preferences
2. Enter your phone number (must be a real number you can receive SMS on)
3. Click "Send Code"
4. Enter the 6-digit code from SMS
5. Verify success message

**Option B: Via SQL (for testing only)**

```sql
-- WARNING: This bypasses security - only for testing!
INSERT INTO user_sms_preferences (
  user_id,
  phone_number,
  phone_verified,
  phone_verified_at
) VALUES (
  (SELECT id FROM users WHERE email = 'your@email.com'),
  '+15551234567',  -- Your phone number in E.164 format
  true,
  NOW()
) ON CONFLICT (user_id)
DO UPDATE SET
  phone_number = EXCLUDED.phone_number,
  phone_verified = true,
  phone_verified_at = NOW();
```

**Verify:**

```sql
SELECT
  phone_number,
  phone_verified,
  phone_verified_at
FROM user_sms_preferences
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');

-- Expected: phone_verified = true
```

---

### Phase 3: Enable SMS Notifications

Enable SMS for a test event:

```sql
-- Enable SMS for brief.completed event
INSERT INTO user_notification_preferences (
  user_id,
  event_type,
  sms_enabled,
  push_enabled,
  email_enabled,
  in_app_enabled
) VALUES (
  (SELECT id FROM users WHERE email = 'your@email.com'),
  'brief.completed',
  true,   -- SMS enabled
  false,  -- Disable push to avoid conflicts
  false,  -- Disable email to avoid conflicts
  true    -- Keep in-app for comparison
) ON CONFLICT (user_id, event_type)
DO UPDATE SET
  sms_enabled = true,
  push_enabled = false,
  email_enabled = false;
```

**Verify:**

```sql
SELECT
  event_type,
  sms_enabled,
  push_enabled,
  email_enabled,
  in_app_enabled
FROM user_notification_preferences
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com')
  AND event_type = 'brief.completed';

-- Expected: sms_enabled = true
```

---

### Phase 4: Trigger Test Notification

Manually emit a test notification:

```sql
-- Emit a brief.completed notification
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'api_action',
  p_actor_user_id := NULL,
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := jsonb_build_object(
    'title', 'Your Brief is Ready',
    'body', 'Your daily brief has been generated',
    'task_count', 5,
    'brief_date', 'today',
    'event_type', 'brief.completed'
  ),
  p_metadata := NULL
);
```

This should return an event ID (UUID).

---

### Phase 5: Verify Data Flow

Check each step of the flow:

#### Step 1: Check notification_events

```sql
SELECT
  id,
  event_type,
  event_source,
  target_user_id,
  payload,
  created_at
FROM notification_events
WHERE event_type = 'brief.completed'
ORDER BY created_at DESC
LIMIT 1;

-- Expected: One row with your event
```

#### Step 2: Check notification_deliveries

```sql
SELECT
  id,
  event_id,
  recipient_user_id,
  channel,
  channel_identifier,  -- Should be your phone number
  status,
  payload,
  created_at
FROM notification_deliveries
WHERE channel = 'sms'
  AND recipient_user_id = (SELECT id FROM users WHERE email = 'your@email.com')
ORDER BY created_at DESC
LIMIT 1;

-- Expected: One row with status = 'pending' or 'sent'
-- channel_identifier should be your phone number
```

#### Step 3: Check queue_jobs

```sql
SELECT
  id,
  job_type,
  status,
  metadata,
  scheduled_for,
  created_at
FROM queue_jobs
WHERE job_type = 'send_notification'
  AND user_id = (SELECT id FROM users WHERE email = 'your@email.com')
ORDER BY created_at DESC
LIMIT 5;

-- Expected: Job with metadata containing delivery_id and channel='sms'
-- Status should be 'pending' or 'processing' or 'completed'
```

#### Step 4: Check sms_messages

```sql
SELECT
  id,
  phone_number,
  message_content,
  status,
  notification_delivery_id,  -- Should link to notification_deliveries
  twilio_sid,
  created_at,
  sent_at,
  delivered_at
FROM sms_messages
WHERE notification_delivery_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;

-- Expected: One row with notification_delivery_id populated
-- message_content should show formatted message
```

#### Step 5: Check send_sms queue job

```sql
SELECT
  id,
  job_type,
  status,
  metadata,
  created_at
FROM queue_jobs
WHERE job_type = 'send_sms'
  AND user_id = (SELECT id FROM users WHERE email = 'your@email.com')
ORDER BY created_at DESC
LIMIT 5;

-- Expected: Job with metadata containing message_id
```

---

### Phase 6: Wait for SMS Delivery

**Timeline:**

- 0-5s: `send_notification` job processed by notification worker
- 5-10s: SMS adapter creates `sms_messages` record
- 10-30s: SMS worker sends via Twilio
- 30-60s: Twilio delivers, webhook updates both tables
- **You receive SMS on your phone!**

**Check your phone** - you should receive:

```
Your BuildOS brief is ready! 5 tasks planned for today. Open app to view.
```

---

### Phase 7: Verify Status Updates

After SMS is delivered (1-2 minutes):

```sql
-- Check notification_deliveries updated
SELECT
  id,
  channel,
  status,           -- Should be 'delivered'
  sent_at,          -- Should have timestamp
  delivered_at,     -- Should have timestamp
  external_id       -- Should link to sms_messages.id
FROM notification_deliveries
WHERE channel = 'sms'
  AND recipient_user_id = (SELECT id FROM users WHERE email = 'your@email.com')
ORDER BY created_at DESC
LIMIT 1;

-- Expected: status = 'delivered', timestamps populated


-- Check sms_messages updated
SELECT
  id,
  status,              -- Should be 'delivered'
  twilio_status,       -- Should be 'delivered'
  twilio_sid,          -- Should have Twilio message SID
  sent_at,
  delivered_at,
  notification_delivery_id
FROM sms_messages
WHERE notification_delivery_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 1;

-- Expected: status = 'delivered', twilio_sid populated
```

---

## Test Scenarios

### Scenario 1: User Without Verified Phone

**Setup:**

```sql
-- Disable phone verification for test
UPDATE user_sms_preferences
SET phone_verified = false
WHERE user_id = (SELECT id FROM users WHERE email = 'test@example.com');
```

**Test:**

```sql
-- Try to emit notification
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'api_action',
  p_target_user_id := (SELECT id FROM users WHERE email = 'test@example.com'),
  p_payload := '{"task_count": 3}'::jsonb
);
```

**Expected Result:**

- No SMS delivery created (silent skip)
- No error logged
- Other channels (in-app) still work

**Verify:**

```sql
SELECT COUNT(*)
FROM notification_deliveries
WHERE channel = 'sms'
  AND recipient_user_id = (SELECT id FROM users WHERE email = 'test@example.com')
  AND created_at > NOW() - INTERVAL '1 minute';

-- Expected: 0 (no SMS delivery created)
```

---

### Scenario 2: User With Opted Out Status

**Setup:**

```sql
-- Simulate user opted out
UPDATE user_sms_preferences
SET
  opted_out = true,
  opted_out_at = NOW()
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
```

**Test:**

```sql
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'api_action',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := '{"task_count": 3}'::jsonb
);
```

**Expected Result:**

- No SMS delivery created
- `get_user_sms_channel_info()` returns `has_sms_available = false`

**Verify:**

```sql
-- Check helper function
SELECT * FROM get_user_sms_channel_info(
  (SELECT id FROM users WHERE email = 'your@email.com')
);

-- Expected: has_sms_available = false, opted_out = true
```

**Cleanup:**

```sql
-- Reset opt-out status
UPDATE user_sms_preferences
SET
  opted_out = false,
  opted_out_at = NULL
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');
```

---

### Scenario 3: Different Event Types

Test each notification template:

```sql
-- Test user.signup (admin notification)
SELECT emit_notification_event(
  p_event_type := 'user.signup',
  p_event_source := 'api_action',
  p_actor_user_id := NULL,
  p_payload := jsonb_build_object(
    'user_email', 'newuser@example.com',
    'signup_method', 'google'
  )
);

-- Expected SMS: "BuildOS: New user newuser@example.com signed up via google"


-- Test task.due_soon
SELECT emit_notification_event(
  p_event_type := 'task.due_soon',
  p_event_source := 'worker_job',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := jsonb_build_object(
    'task_name', 'Write report',
    'due_time', 'in 1 hour'
  )
);

-- Expected SMS: "⏰ Write report is due in 1 hour"


-- Test brief.failed
SELECT emit_notification_event(
  p_event_type := 'brief.failed',
  p_event_source := 'worker_job',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := '{}'::jsonb
);

-- Expected SMS: "Your daily brief failed to generate. Please check the app or contact support."
```

---

## Troubleshooting

### Issue: No SMS delivery created

**Check:**

```sql
-- Is phone verified?
SELECT phone_verified, opted_out
FROM user_sms_preferences
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com');

-- Is SMS enabled for event?
SELECT sms_enabled
FROM user_notification_preferences
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com')
  AND event_type = 'brief.completed';

-- Does subscription exist?
SELECT *
FROM notification_subscriptions
WHERE user_id = (SELECT id FROM users WHERE email = 'your@email.com')
  AND event_type = 'brief.completed'
  AND is_active = true;
```

**Fix:**

- Verify phone: See Phase 2
- Enable SMS: See Phase 3
- Create subscription if missing

---

### Issue: Job stuck in 'pending'

**Check:**

```sql
-- Check job status
SELECT
  id,
  job_type,
  status,
  attempts,
  error_message,
  created_at
FROM queue_jobs
WHERE status = 'pending'
  AND created_at > NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC;
```

**Fix:**

- Ensure worker is running: `pnpm dev` or check Railway logs
- Check worker logs for errors
- Verify environment variables are set

---

### Issue: SMS not received

**Check Twilio:**

```sql
-- Get Twilio SID
SELECT
  twilio_sid,
  twilio_status,
  twilio_error_code,
  twilio_error_message
FROM sms_messages
ORDER BY created_at DESC
LIMIT 1;
```

Then check in Twilio Console:

1. Go to Monitor > Logs > Messaging
2. Search for the `twilio_sid`
3. Check delivery status and error details

**Common Issues:**

- Phone number not SMS-capable (landline)
- Phone number format incorrect (must be E.164: +15551234567)
- Twilio account out of credits
- Phone carrier blocking messages

---

### Issue: Webhook not updating status

**Check:**

```sql
-- Message has twilio_sid but status stuck at 'sent'?
SELECT
  id,
  status,
  twilio_sid,
  twilio_status,
  sent_at,
  delivered_at,
  notification_delivery_id
FROM sms_messages
WHERE twilio_sid IS NOT NULL
  AND status = 'sent'
  AND created_at > NOW() - INTERVAL '5 minutes';
```

**Check webhook endpoint:**

- Verify `PUBLIC_APP_URL` is set correctly
- Check webhook URL in Twilio Console
- Ensure webhook is publicly accessible (not localhost)
- Check web server logs for webhook requests

---

## Quick Success Check

Run this query to see the full pipeline:

```sql
WITH latest_event AS (
  SELECT id FROM notification_events
  WHERE event_type = 'brief.completed'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT
  'Event' as step,
  ne.id::text as id,
  NULL as status,
  ne.created_at::text as timestamp
FROM notification_events ne, latest_event
WHERE ne.id = latest_event.id

UNION ALL

SELECT
  'Delivery' as step,
  nd.id::text,
  nd.status,
  nd.created_at::text
FROM notification_deliveries nd, latest_event
WHERE nd.event_id = latest_event.id
  AND nd.channel = 'sms'

UNION ALL

SELECT
  'SMS Message' as step,
  sm.id::text,
  sm.status,
  sm.created_at::text
FROM sms_messages sm, latest_event
JOIN notification_deliveries nd ON sm.notification_delivery_id = nd.id
WHERE nd.event_id = latest_event.id
  AND nd.channel = 'sms'

ORDER BY timestamp;
```

**Expected Output:**

```
step          | id        | status    | timestamp
--------------+-----------+-----------+------------------
Event         | uuid-xxx  | NULL      | 2025-10-06 20:00:00
Delivery      | uuid-yyy  | delivered | 2025-10-06 20:00:01
SMS Message   | uuid-zzz  | delivered | 2025-10-06 20:00:02
```

All three rows should show up and have 'delivered' status!

---

## Worker Logs to Watch

When testing, watch worker logs for these messages:

```bash
# Notification worker
[NotificationWorker] Processing notification job XXX for delivery YYY (sms)
[SMSAdapter] Formatting SMS for delivery YYY: "Your BuildOS brief is ready!..." to +15551234567
[SMSAdapter] Created SMS message ZZZ for delivery YYY
[SMSAdapter] Queued SMS job (message ID: ZZZ) for delivery YYY

# SMS worker (existing)
[SMSWorker] Processing SMS job for message ZZZ
[SMSWorker] Sent SMS to +15551234567, Twilio SID: SMxxxxxxx

# Webhook
[TwilioWebhook] Updated notification delivery YYY status to delivered
```

---

## Success Criteria ✅

You'll know it's working when:

1. ✅ Migration queries all return expected results
2. ✅ Phone verification works in UI
3. ✅ Event emission creates notification_deliveries record with channel='sms'
4. ✅ SMS adapter creates sms_messages with notification_delivery_id link
5. ✅ SMS worker sends message via Twilio
6. ✅ You receive the SMS on your phone
7. ✅ Webhook updates both tables to 'delivered' status
8. ✅ All queries show 'delivered' status

**End-to-end time:** 30-90 seconds from event emission to SMS received!

---

## Next Steps After Testing

Once basic flow works:

1. **Enable for more events**: user.signup, task.due_soon, etc.
2. **Test failure scenarios**: Invalid phone, Twilio errors, etc.
3. **Monitor metrics**: Delivery rates, latency, failures
4. **Phase 3**: Add phone verification prompts in UI
5. **Production rollout**: Deploy to staging, then production

---

## Need Help?

If something isn't working:

1. Check this guide's troubleshooting section
2. Review worker logs for errors
3. Check Twilio Console for delivery issues
4. Verify all migrations applied: `SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 10`
5. Verify worker has latest code: `git log --oneline | head -5` in worker directory
