<!-- apps/web/tests/manual/test-sms-click-tracking.md -->

# Manual Test: SMS Click Tracking

**Purpose**: Verify that links in SMS messages are shortened and clicks are tracked correctly.

**Date**: 2025-10-07
**Phase**: Phase 3 - SMS Click Tracking Implementation

---

## Prerequisites

### 1. Database Migration Applied

```bash
# Run the migration
psql $DATABASE_URL -f supabase/migrations/20251007_notification_tracking_links.sql
```

**Verify**:

```sql
-- Check table exists
SELECT table_name FROM information_schema.tables
WHERE table_name = 'notification_tracking_links';

-- Check functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('generate_short_code', 'create_tracking_link');
```

### 2. SMS Preferences Configured

```sql
-- Insert or update your SMS preferences
INSERT INTO user_sms_preferences (user_id, phone_number, phone_verified)
VALUES ('<your-user-id>', '+1234567890', true)
ON CONFLICT (user_id)
DO UPDATE SET phone_number = EXCLUDED.phone_number, phone_verified = true;
```

### 3. Notification Subscription

```sql
-- Create subscription for brief.completed events
INSERT INTO notification_subscriptions (user_id, event_type, is_active)
VALUES ('<your-user-id>', 'brief.completed', true)
ON CONFLICT (user_id, event_type) DO NOTHING;
```

### 4. Worker Deployed

- Worker service must be running (Railway)
- VAPID keys must be configured
- Twilio credentials must be set

---

## Test Steps

### Step 1: Send Test SMS with URL

**Option A: Via Admin Test Endpoint**

```bash
curl -X POST http://localhost:5173/api/admin/notifications/test \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{
    "event_type": "brief.completed",
    "payload": {
      "title": "Your Brief is Ready",
      "body": "View your brief: https://build-os.com/app/briefs/today",
      "task_count": 5,
      "brief_date": "today"
    },
    "recipient_user_ids": ["<your-user-id>"],
    "channels": ["sms"]
  }'
```

**Option B: Via Database Event**

```sql
-- Emit notification event (will trigger SMS)
SELECT dispatch_notification_event(
  'brief.completed'::TEXT,
  'api_action'::TEXT,
  NULL, -- actor_user_id
  '<your-user-id>'::UUID, -- target_user_id
  jsonb_build_object(
    'title', 'Your Brief is Ready',
    'body', 'View it here: https://build-os.com/app/briefs/today',
    'task_count', 5
  ),
  NULL -- metadata
);
```

**Expected Response**:

```json
{
	"success": true,
	"data": {
		"event_id": "uuid-123",
		"deliveries": [
			{
				"id": "delivery-uuid",
				"channel": "sms",
				"status": "pending"
			}
		]
	}
}
```

---

### Step 2: Verify URL Shortening in Database

**Check tracking link was created**:

```sql
SELECT
  id,
  short_code,
  delivery_id,
  destination_url,
  click_count,
  created_at
FROM notification_tracking_links
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result**:

- `short_code`: 6-character alphanumeric (e.g., "a1B2c3")
- `destination_url`: Original URL (https://build-os.com/app/briefs/today)
- `click_count`: 0 (not yet clicked)
- `delivery_id`: Matches delivery from Step 1

**Check SMS message contains shortened URL**:

```sql
SELECT
  id,
  message_content,
  status,
  created_at
FROM sms_messages
ORDER BY created_at DESC
LIMIT 1;
```

**Expected**:

- `message_content` contains: `https://build-os.com/l/abc123` (NOT the full URL)
- Character count is reduced (important for SMS limits)

---

### Step 3: Receive SMS on Phone

**Check your phone for SMS**. It should look like:

```
Your BuildOS brief is ready! 5 tasks planned for today. Open app to view.
https://build-os.com/l/abc123
```

**Verify**:

- ✅ SMS received
- ✅ Contains shortened URL (https://build-os.com/l/...)
- ✅ NOT the full URL
- ✅ Message is under 160 characters

---

### Step 4: Click the Shortened Link

**On your phone, tap the shortened link**.

**Expected behavior**:

1. Browser opens
2. Quick redirect (< 100ms)
3. Lands on destination page (https://build-os.com/app/briefs/today)

---

### Step 5: Verify Click Tracking

**Check tracking link stats**:

```sql
SELECT
  short_code,
  destination_url,
  click_count,
  first_clicked_at,
  last_clicked_at,
  EXTRACT(EPOCH FROM (first_clicked_at - created_at)) as seconds_to_first_click
FROM notification_tracking_links
WHERE short_code = '<short-code-from-sms>';
```

**Expected**:

- `click_count`: 1
- `first_clicked_at`: Timestamp when you clicked
- `last_clicked_at`: Same as first_clicked_at
- `seconds_to_first_click`: Time between SMS sent and clicked

**Check notification delivery**:

```sql
SELECT
  id,
  channel,
  status,
  clicked_at,
  opened_at,
  EXTRACT(EPOCH FROM (clicked_at - sent_at)) as seconds_to_click
FROM notification_deliveries
WHERE id = '<delivery-id-from-step-1>';
```

**Expected**:

- `status`: 'clicked'
- `clicked_at`: Timestamp when link was clicked
- `opened_at`: Same as clicked_at (click implies open for SMS)
- `seconds_to_click`: Time between send and click

---

### Step 6: Test Multiple Clicks

**Click the same link again from your SMS**.

**Verify in database**:

```sql
SELECT
  short_code,
  click_count,
  first_clicked_at,
  last_clicked_at
FROM notification_tracking_links
WHERE short_code = '<short-code>';
```

**Expected**:

- `click_count`: 2 (incremented)
- `first_clicked_at`: Unchanged (still first click time)
- `last_clicked_at`: Updated to most recent click

**Check notification delivery**:

```sql
SELECT clicked_at, status
FROM notification_deliveries
WHERE id = '<delivery-id>';
```

**Expected**:

- `clicked_at`: Unchanged (only first click updates this)
- `status`: Still 'clicked'

---

## Edge Cases to Test

### Test 1: SMS with Multiple URLs

**Send**:

```json
{
	"event_type": "brief.completed",
	"payload": {
		"body": "Your brief: https://build-os.com/app/briefs/today and tasks: https://build-os.com/app/tasks"
	},
	"recipient_user_ids": ["<user-id>"],
	"channels": ["sms"]
}
```

**Verify**:

- Both URLs are shortened
- Each gets unique short code
- Both track clicks independently

```sql
-- Should return 2 rows for same delivery
SELECT short_code, destination_url, click_count
FROM notification_tracking_links
WHERE delivery_id = '<delivery-id>'
ORDER BY created_at;
```

---

### Test 2: SMS Without URLs

**Send**:

```json
{
	"payload": {
		"body": "Your brief is ready! No links here."
	},
	"channels": ["sms"]
}
```

**Verify**:

- SMS sent successfully
- No tracking links created
- Message unchanged

```sql
-- Should return 0 rows
SELECT * FROM notification_tracking_links
WHERE delivery_id = '<delivery-id>';
```

---

### Test 3: Invalid Short Code

**Visit non-existent link**:

```
https://build-os.com/l/invalid
```

**Expected**:

- Redirects to home page (/)
- No error thrown
- Graceful handling

---

### Test 4: Character Savings

**Compare URL lengths**:

```sql
WITH link_stats AS (
  SELECT
    short_code,
    destination_url,
    LENGTH('https://build-os.com/l/' || short_code) as short_length,
    LENGTH(destination_url) as original_length
  FROM notification_tracking_links
  WHERE delivery_id = '<delivery-id>'
)
SELECT
  short_code,
  original_length,
  short_length,
  original_length - short_length as chars_saved,
  ROUND(100.0 * (original_length - short_length) / original_length, 1) as percent_saved
FROM link_stats;
```

**Expected**:

- Significant character savings (especially for long URLs)
- Short URL is always ~35 characters (https://build-os.com/l/abc123)

---

## Success Criteria

All of these should be true:

- [ ] Database migration runs successfully
- [ ] SMS message contains shortened URL (not full URL)
- [ ] Shortened URL format: `https://build-os.com/l/[6-chars]`
- [ ] Clicking link redirects to destination
- [ ] Click updates `notification_tracking_links.click_count`
- [ ] Click updates `notification_deliveries.clicked_at` (first click only)
- [ ] Multiple clicks increment count but don't update delivery
- [ ] Multiple URLs in same SMS are all shortened
- [ ] SMS without URLs doesn't create tracking links
- [ ] Invalid short codes redirect to home (no error)
- [ ] Character count is reduced (important for SMS limits)

---

## Verification SQL Queries

### Get Link Click Statistics

```sql
-- Overall stats
SELECT * FROM get_link_click_stats(NULL, 7);

-- Stats for specific delivery
SELECT * FROM get_link_click_stats('<delivery-id>'::UUID, 7);
```

### Get All Tracking Links for Delivery

```sql
SELECT
  ntl.short_code,
  ntl.destination_url,
  ntl.click_count,
  ntl.first_clicked_at,
  ntl.last_clicked_at,
  nd.channel,
  nd.status,
  nd.clicked_at as delivery_clicked_at
FROM notification_tracking_links ntl
JOIN notification_deliveries nd ON nd.id = ntl.delivery_id
WHERE ntl.delivery_id = '<delivery-id>';
```

### Get Recent SMS with Tracking

```sql
SELECT
  sm.id as sms_id,
  sm.message_content,
  sm.status as sms_status,
  nd.id as delivery_id,
  nd.status as delivery_status,
  nd.clicked_at,
  COUNT(ntl.id) as tracking_links_count,
  SUM(ntl.click_count) as total_clicks
FROM sms_messages sm
JOIN notification_deliveries nd ON nd.id = sm.notification_delivery_id
LEFT JOIN notification_tracking_links ntl ON ntl.delivery_id = nd.id
WHERE sm.created_at > NOW() - INTERVAL '1 hour'
GROUP BY sm.id, sm.message_content, sm.status, nd.id, nd.status, nd.clicked_at
ORDER BY sm.created_at DESC;
```

---

## Troubleshooting

### Issue 1: URLs Not Shortened

**Check worker logs**:

```
[SMSAdapter] Shortened 0 of 1 URLs in message
```

**Cause**: Database function `create_tracking_link` failed

**Fix**:

- Check migration ran: `SELECT * FROM pg_proc WHERE proname = 'create_tracking_link'`
- Check permissions: `GRANT EXECUTE ON FUNCTION create_tracking_link TO service_role`
- Check worker has service role key

### Issue 2: Link Redirects to Home Instead of Destination

**Cause**: Short code not found in database

**Check**:

```sql
SELECT * FROM notification_tracking_links WHERE short_code = '<code>';
```

**Fix**: Verify short code was created when SMS was sent

### Issue 3: Click Not Tracked

**Check endpoint logs**:

- Should see: `[LinkShortener] Tracked first click for delivery ...`

**Check delivery**:

```sql
SELECT clicked_at FROM notification_deliveries WHERE id = '<delivery-id>';
```

**Fix**: Verify redirect endpoint update query succeeded

### Issue 4: SMS Character Limit Exceeded

**Check message length**:

```sql
SELECT
  LENGTH(message_content) as length,
  message_content
FROM sms_messages
ORDER BY created_at DESC
LIMIT 1;
```

**Cause**: Long URLs or message

**Fix**:

- Shorten URL worked? (Check for `https://build-os.com/l/...`)
- Truncate message if needed
- Use SMS templates with shorter text

---

## Cleanup

After testing, clean up test data:

```sql
-- Delete test tracking links (cascades to notification_deliveries via ON DELETE CASCADE)
DELETE FROM notification_tracking_links
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Delete test SMS messages
DELETE FROM sms_messages
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND metadata->>'notification_delivery_id' IS NOT NULL;

-- Delete test events
DELETE FROM notification_events
WHERE event_type = 'brief.completed'
  AND created_at > NOW() - INTERVAL '1 hour'
  AND (metadata->>'test_mode')::boolean = true;
```

---

## Performance Benchmarks

**Redirect Latency**:

- Target: < 50ms for redirect
- Measure: Time from request to landing on destination

**URL Shortening Overhead**:

- Target: < 100ms per URL
- Should not delay SMS delivery significantly

**Database Queries**:

- Lookup by short_code: O(1) with index
- Insert tracking link: O(1) average (may retry on collision)

---

## Next Steps

After SMS click tracking is verified:

1. **Phase 4**: In-app notification tracking
2. **Analytics**: Add click tracking to admin dashboard
3. **Reports**: SMS click-through rate reports
4. **Optimization**: Consider link expiration policy

---

**Success! SMS click tracking is now operational.** 🎉📱
