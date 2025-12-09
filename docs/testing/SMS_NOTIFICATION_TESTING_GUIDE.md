<!-- docs/testing/SMS_NOTIFICATION_TESTING_GUIDE.md -->

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

## Phase 5 Template Testing (New!)

Phase 5 adds database-driven template support with caching and intelligent fallbacks.

### Test 1: Template Rendering

**Test database templates are being used**:

```sql
-- Verify templates exist
SELECT template_key, message_template, is_active
FROM sms_templates
WHERE template_key LIKE 'notif_%';

-- Should return 6 templates:
-- notif_user_signup, notif_brief_completed, notif_brief_failed,
-- notif_task_due_soon, notif_urgent_alert, notif_project_milestone
```

**Trigger notification with template**:

```sql
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'test',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := jsonb_build_object(
    'task_count', 7,
    'brief_date', '2025-10-07',
    'event_type', 'brief.completed'
  )
);
```

**Expected**: SMS message should use template:

```
"Your BuildOS brief is ready! 7 tasks planned for 2025-10-07. Open app to view."
```

**Check Logs**:

```
[SMSAdapter] Rendered template notif_brief_completed: "..."
```

### Test 2: Template Caching

**First request** (cache miss):

```sql
-- Trigger notification
SELECT emit_notification_event(...);
```

**Check logs**: Should show database fetch

```
[SMSAdapter] Template notif_brief_completed fetched from database
```

**Second request** (cache hit):

```sql
-- Trigger same event type again within 5 minutes
SELECT emit_notification_event(...);
```

**Check logs**: No database fetch, using cache

```
[SMSAdapter] Template notif_brief_completed from cache
```

**Verify cache stats** (if you add monitoring endpoint):

```typescript
// In worker
import { getTemplateCacheStats } from './workers/notification/smsAdapter';
console.log(getTemplateCacheStats());
// Output: { size: 1, templates: ['notif_brief_completed'] }
```

### Test 3: Missing Template Fallback

**Disable a template**:

```sql
-- Deactivate template
UPDATE sms_templates
SET is_active = false
WHERE template_key = 'notif_brief_completed';
```

**Clear cache** (in worker code):

```typescript
import { clearTemplateCache } from './workers/notification/smsAdapter';
clearTemplateCache();
```

**Trigger notification**:

```sql
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  ...
);
```

**Expected**: Falls back to hardcoded formatting

```
[SMSAdapter] Template notif_brief_completed not found
[SMSAdapter] Using fallback formatting for event type: brief.completed
```

**Message should still be sent** with hardcoded content

**Cleanup**:

```sql
UPDATE sms_templates
SET is_active = true
WHERE template_key = 'notif_brief_completed';
```

### Test 4: Variable Substitution

**Test with missing variable**:

```sql
SELECT emit_notification_event(
  p_event_type := 'task.due_soon',
  p_event_source := 'test',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := jsonb_build_object(
    'task_name', 'Review pull request',
    -- Intentionally omit 'due_time'
    'event_type', 'task.due_soon'
  )
);
```

**Expected**:

- Warning in logs: `Missing template variable: due_time`
- Message keeps placeholder: `"⏰ Review pull request is due {{due_time}}"`

**With all variables**:

```sql
SELECT emit_notification_event(
  p_event_type := 'task.due_soon',
  p_event_source := 'test',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := jsonb_build_object(
    'task_name', 'Review pull request',
    'due_time', 'in 30 minutes',
    'event_type', 'task.due_soon'
  )
);
```

**Expected**: `"⏰ Review pull request is due in 30 minutes"`

### Test 5: Max Length Enforcement

**Create a long message**:

```sql
-- Update template to have very long content
UPDATE sms_templates
SET
  message_template = 'Your BuildOS brief is ready with lots of extra information! You have {{task_count}} tasks planned for {{brief_date}}. This message is intentionally very long to test truncation behavior.',
  max_length = 100
WHERE template_key = 'notif_brief_completed';
```

**Trigger notification**:

```sql
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_payload := jsonb_build_object('task_count', 5, 'brief_date', 'today', 'event_type', 'brief.completed')
  ...
);
```

**Expected**:

- Log: `[SMSAdapter] Message truncated from 150 to 100 chars`
- Message is exactly 100 chars (97 content + "...")

**Cleanup**:

```sql
-- Restore original template
UPDATE sms_templates
SET
  message_template = 'Your BuildOS brief is ready! {{task_count}} tasks planned for {{brief_date}}. Open app to view.',
  max_length = 160
WHERE template_key = 'notif_brief_completed';
```

### Test 6: Custom Template Creation

**Create a new template**:

```sql
INSERT INTO sms_templates (
  template_key,
  name,
  message_template,
  template_vars,
  description,
  max_length,
  is_active
) VALUES (
  'notif_custom_test',
  'Custom Test Template',
  'Hello {{user_name}}, you have {{notification_count}} new notifications!',
  '{"user_name": "string", "notification_count": "number"}'::jsonb,
  'Test template for development',
  160,
  true
);
```

**Test rendering** (if you expose the adapter for testing):

```typescript
// In test code
const delivery = {
	payload: {
		event_type: 'custom.test',
		user_name: 'Alice',
		notification_count: 3
	}
	// ... other required fields
};

const message = await formatSMSMessage(delivery);
// Expected: "Hello Alice, you have 3 new notifications!"
```

---

## Phase 6 Admin Dashboard Testing (New!)

Phase 6 adds SMS-specific analytics and insights to the admin notification dashboard.

### Test 1: Access Admin Dashboard

1. Log in as an admin user
2. Navigate to **Admin → Notifications**
3. **Expected**: Dashboard loads with all analytics sections
4. **Expected**: SMS Insights card visible between Channel Performance and Event Breakdown

### Test 2: Phone Verification Metrics

**Verify phone statistics display correctly**:

```sql
-- Check actual phone stats in database
SELECT
  COUNT(*) as total_with_phone,
  COUNT(*) FILTER (WHERE phone_verified = true) as verified,
  COUNT(*) FILTER (WHERE opted_out = true) as opted_out
FROM user_sms_preferences
WHERE phone_number IS NOT NULL;
```

**Expected in Dashboard**:

- "Users with Phone" matches total_with_phone
- "Verified" matches verified count with percentage
- "Opted Out" matches opted_out count with percentage

### Test 3: SMS Adoption Metrics

**Verify adoption rate calculation**:

```sql
-- Check SMS enabled users
SELECT COUNT(DISTINCT unp.user_id) as sms_enabled
FROM user_notification_preferences unp
JOIN user_sms_preferences usp ON usp.user_id = unp.user_id
WHERE unp.sms_enabled = true
  AND usp.phone_verified = true;
```

**Expected in Dashboard**:

- "SMS Notifications Enabled" matches count
- Adoption rate = (sms_enabled / verified_phones) \* 100
- Progress bar reflects adoption percentage

### Test 4: Recent Performance (24h)

**Trigger some test SMS**:

```sql
-- Send test SMS notifications
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'test',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com'),
  p_payload := jsonb_build_object('task_count', 5, 'event_type', 'brief.completed')
);
```

**Expected in Dashboard**:

- "Last 24 Hours" shows sent count
- Delivery rate updates after SMS delivered
- Avg delivery time displays in seconds

### Test 5: Intelligent Insights

**Test low adoption warning**:

```sql
-- If < 50% of verified users have SMS enabled
-- Expected: Warning message about promoting SMS in onboarding
```

**Test high opt-out warning**:

```sql
-- If > 10% of verified users opted out
-- Expected: Warning about reviewing message frequency
```

**Test low delivery rate**:

```sql
-- If delivery rate < 90%
-- Expected: Warning about checking phone numbers/carrier issues
```

**Test success state**:

- When adoption >= 70% AND delivery >= 95%
- **Expected**: Green checkmark with success message

### Test 6: Auto-Refresh

1. Enable auto-refresh in dashboard (toggle at top)
2. Send new SMS notification
3. **Expected**: SMS stats update within 30 seconds
4. **Expected**: Sent count increments
5. **Expected**: Delivery rate updates after delivery

### Test 7: API Endpoint Direct Test

```bash
# Test SMS stats API endpoint
curl -X GET "https://your-domain.com/api/admin/notifications/analytics/sms-stats" \
  -H "Authorization: Bearer YOUR_ADMIN_SESSION_TOKEN"

# Expected response:
{
  "data": {
    "total_users_with_phone": 45,
    "users_phone_verified": 38,
    "users_sms_enabled": 22,
    "users_opted_out": 2,
    "phone_verification_rate": 84.44,
    "sms_adoption_rate": 57.89,
    "opt_out_rate": 5.26,
    "total_sms_sent_24h": 15,
    "sms_delivery_rate_24h": 93.33,
    "avg_sms_delivery_time_seconds": 2.45
  }
}
```

### Test 8: Channel Performance Table

**Verify SMS appears in channel table**:

1. Scroll to "Channel Performance" section
2. **Expected**: SMS row with purple badge
3. **Expected**: Metrics displayed (sent, success rate, open rate, click rate, delivery time)
4. **Expected**: SMS data consistent with SMS Insights card

### Test 9: Migration Applied

```sql
-- Verify function exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'get_sms_notification_stats';

-- Expected: One row showing FUNCTION

-- Test function execution
SELECT * FROM get_sms_notification_stats();

-- Expected: Single row with all statistics
```

### Test 10: Error Handling

**Test with no SMS data**:

1. In a fresh database with no SMS messages
2. Navigate to admin dashboard
3. **Expected**: SMS Insights card shows zeros gracefully
4. **Expected**: No crashes or errors
5. **Expected**: Message "No SMS data available" if appropriate

---

## Phase 7: SMS Click Tracking Testing (New!)

**Date Added**: 2025-10-07

Phase 7 implements click tracking for links in SMS messages using a custom link shortener. This allows tracking when users tap links in SMS notifications.

### Overview

SMS click tracking works by:

1. Automatically detecting URLs in SMS message content
2. Replacing them with shortened tracking links (e.g., `https://build-os.com/l/abc123`)
3. Tracking clicks when users visit the short link
4. Redirecting to the original destination
5. Updating analytics in `notification_deliveries` table

### Prerequisites

1. **Apply Migration**:

```bash
cd apps/web
# Apply tracking links migration
psql $DATABASE_URL -f supabase/migrations/20251007_notification_tracking_links.sql
```

2. **Verify Tables**:

```sql
-- Check table exists
SELECT table_name FROM information_schema.tables
WHERE table_name = 'notification_tracking_links';

-- Check functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('generate_short_code', 'create_tracking_link');
```

3. **Rebuild Worker** (if needed):

```bash
cd apps/worker
pnpm build
# Restart worker service
```

### Test 1: URL Shortening in SMS

**Send SMS with URL**:

```sql
-- Trigger SMS with URL in payload
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'test',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com' LIMIT 1),
  p_payload := jsonb_build_object(
    'title', 'Your Brief is Ready',
    'body', 'View your brief: https://build-os.com/app/briefs/today',
    'task_count', 5
  )
);
```

**Verify URL Shortened**:

```sql
-- Check SMS message content
SELECT
  id,
  message_content,
  status,
  created_at
FROM sms_messages
ORDER BY created_at DESC
LIMIT 1;

-- Expected: message_content contains https://build-os.com/l/[6-chars], NOT the full URL
```

**Verify Tracking Link Created**:

```sql
-- Check tracking link was created
SELECT
  short_code,
  delivery_id,
  destination_url,
  click_count,
  created_at
FROM notification_tracking_links
ORDER BY created_at DESC
LIMIT 1;

-- Expected:
-- - short_code: 6 alphanumeric characters (e.g., "a1B2c3")
-- - destination_url: Original URL (https://build-os.com/app/briefs/today)
-- - click_count: 0 (not yet clicked)
```

### Test 2: Click Tracking and Redirect

**On Phone**:

1. Receive SMS message on your phone
2. Tap the shortened link (e.g., `https://build-os.com/l/abc123`)
3. **Expected**: Browser opens and quickly redirects to destination
4. **Expected**: Land on the destination page (e.g., /app/briefs/today)

**Verify Click Tracked**:

```sql
-- Check tracking link stats
SELECT
  short_code,
  destination_url,
  click_count,
  first_clicked_at,
  last_clicked_at
FROM notification_tracking_links
WHERE short_code = '<short-code-from-sms>';

-- Expected:
-- - click_count: 1
-- - first_clicked_at: Timestamp when you clicked
-- - last_clicked_at: Same as first_clicked_at
```

**Verify Delivery Updated**:

```sql
-- Check notification delivery
SELECT
  id,
  channel,
  status,
  clicked_at,
  opened_at
FROM notification_deliveries
WHERE id = (
  SELECT delivery_id FROM notification_tracking_links
  WHERE short_code = '<short-code>'
);

-- Expected:
-- - status: 'clicked'
-- - clicked_at: Timestamp when link was clicked
-- - opened_at: Same as clicked_at (click implies open for SMS)
```

### Test 3: Multiple Clicks

**Repeat the click** from Test 2 (tap the same link again).

**Verify Counts Update**:

```sql
SELECT
  short_code,
  click_count,
  first_clicked_at,
  last_clicked_at,
  EXTRACT(EPOCH FROM (last_clicked_at - first_clicked_at)) as seconds_between_clicks
FROM notification_tracking_links
WHERE short_code = '<short-code>';

-- Expected:
-- - click_count: 2 (incremented)
-- - first_clicked_at: Unchanged (still first click)
-- - last_clicked_at: Updated to second click time
-- - seconds_between_clicks: > 0
```

**Verify Delivery NOT Updated**:

```sql
-- Delivery should only update on FIRST click
SELECT clicked_at
FROM notification_deliveries
WHERE id = (SELECT delivery_id FROM notification_tracking_links WHERE short_code = '<short-code>');

-- Expected: clicked_at UNCHANGED from first click
```

### Test 4: Multiple URLs in Same SMS

**Send SMS with multiple links**:

```sql
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'test',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com' LIMIT 1),
  p_payload := jsonb_build_object(
    'body', 'Your brief: https://build-os.com/app/briefs/today and tasks: https://build-os.com/app/tasks'
  )
);
```

**Verify Both URLs Shortened**:

```sql
-- Should return 2 rows for same delivery
SELECT
  short_code,
  destination_url,
  click_count
FROM notification_tracking_links
WHERE delivery_id = (
  SELECT id FROM notification_deliveries
  WHERE channel = 'sms'
  ORDER BY created_at DESC
  LIMIT 1
)
ORDER BY created_at;

-- Expected:
-- - 2 rows
-- - Different short_codes
-- - Different destination_urls
-- - Both click_count = 0
```

### Test 5: SMS Without URLs

**Send SMS without any links**:

```sql
SELECT emit_notification_event(
  p_event_type := 'brief.completed',
  p_event_source := 'test',
  p_target_user_id := (SELECT id FROM users WHERE email = 'your@email.com' LIMIT 1),
  p_payload := jsonb_build_object(
    'body', 'Your brief is ready! No links here.'
  )
);
```

**Verify No Tracking Links Created**:

```sql
SELECT COUNT(*) as tracking_links_count
FROM notification_tracking_links
WHERE delivery_id = (
  SELECT id FROM notification_deliveries
  WHERE channel = 'sms'
  ORDER BY created_at DESC
  LIMIT 1
);

-- Expected: tracking_links_count = 0
```

### Test 6: Invalid Short Code

**Visit non-existent link**:

In browser, navigate to: `https://build-os.com/l/invalid123`

**Expected**:

- Redirects to home page (/)
- No error page shown
- Graceful handling

### Test 7: Character Savings

**Check URL length reduction**:

```sql
WITH link_stats AS (
  SELECT
    short_code,
    destination_url,
    LENGTH('https://build-os.com/l/' || short_code) as short_length,
    LENGTH(destination_url) as original_length
  FROM notification_tracking_links
  ORDER BY created_at DESC
  LIMIT 5
)
SELECT
  short_code,
  original_length,
  short_length,
  original_length - short_length as chars_saved,
  ROUND(100.0 * (original_length - short_length) / original_length, 1) as percent_saved
FROM link_stats;

-- Expected:
-- - Short URLs always ~35 characters
-- - Significant savings for long URLs (50-70% reduction)
```

### Test 8: Link Analytics

**Get click statistics**:

```sql
-- Overall stats (last 7 days)
SELECT * FROM get_link_click_stats(NULL, 7);

-- Stats for specific delivery
SELECT * FROM get_link_click_stats('<delivery-id>'::UUID, 7);

-- Expected returns:
-- - total_links: Number of tracking links created
-- - total_clicks: Sum of all click_counts
-- - unique_clicked_links: Number of links with click_count > 0
-- - click_through_rate: Percentage of links that were clicked
```

### Test 9: End-to-End Flow

**Complete flow test**:

1. User has verified phone ✅
2. User has SMS enabled for `brief.completed` ✅
3. Trigger notification with URL in message
4. Verify SMS sent with shortened URL
5. Click link on phone
6. Verify redirect works
7. Verify click tracked in database
8. Check admin dashboard shows click rate (if implemented)

### Test 10: Performance

**Measure redirect latency**:

Using browser DevTools or curl:

```bash
# Measure redirect time
time curl -w "@curl-format.txt" -o /dev/null -s "https://build-os.com/l/<short-code>"

# Expected:
# - Redirect time: < 100ms
# - Total time to destination: < 500ms (depending on network)
```

### Test 11: Worker Logs

**Check worker logs for URL shortening**:

Expected log output when SMS is sent:

```
[SMSAdapter] Shortened URL: https://build-os.com/app/briefs/today... → https://build-os.com/l/abc123 (saved 45 chars)
[SMSAdapter] Shortened 1 of 1 URLs in message
```

### Troubleshooting

**URLs Not Shortened**:

- Check migration applied: `SELECT * FROM pg_proc WHERE proname = 'create_tracking_link'`
- Check worker has service role key
- Check worker logs for errors

**Link Redirects to Home Instead of Destination**:

- Verify short code exists: `SELECT * FROM notification_tracking_links WHERE short_code = '<code>'`
- Check RLS policies allow read access

**Click Not Tracked**:

- Check delivery ID: `SELECT clicked_at FROM notification_deliveries WHERE id = '<delivery-id>'`
- Verify redirect endpoint update succeeded
- Check browser console for errors

### Success Criteria

All of the following should pass:

- ✅ SMS messages contain shortened URLs (not full URLs)
- ✅ Shortened URL format: `https://build-os.com/l/[6-chars]`
- ✅ Clicking link redirects to destination
- ✅ Click updates `notification_tracking_links.click_count`
- ✅ Click updates `notification_deliveries.clicked_at` (first click only)
- ✅ Multiple clicks increment count but don't update delivery
- ✅ Multiple URLs in same SMS are all shortened
- ✅ SMS without URLs doesn't create tracking links
- ✅ Invalid short codes redirect to home (no error)
- ✅ Character count reduced (important for SMS limits)

### Related Documentation

- Complete Test Guide: `apps/web/tests/manual/test-sms-click-tracking.md`
- Main Tracking Spec: `thoughts/shared/research/2025-10-06_22-08-35_notification-tracking-system-spec.md`
- SMS Design Doc: `docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md`

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
