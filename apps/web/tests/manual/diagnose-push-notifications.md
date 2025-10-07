# Push Notification Diagnostic Guide

**Problem**: Calling `/api/admin/notifications/test` returns 200 but no push notification appears on phone

**Date**: 2025-10-06

---

## Understanding the Flow

```
1. Test API called
   ↓
2. emit_notification_event() creates event
   ↓
3. Looks for ACTIVE subscriptions for event_type
   ↓
4. If subscription exists + push_enabled:
   - Creates delivery record
   - Queues notification job
   ↓
5. Worker processes job
   ↓
6. web-push sends to browser
   ↓
7. Service worker displays notification
```

**Key Insight**: The test will silently fail if any of these are missing!

---

## Diagnostic Checklist

### 1. Check if User Has Push Subscription (Browser-Level)

```sql
-- Check push_subscriptions table
SELECT
  id,
  user_id,
  endpoint,
  is_active,
  created_at,
  last_used_at
FROM push_subscriptions
WHERE user_id = '<your-user-id>'  -- Replace with your user ID
ORDER BY created_at DESC;
```

**Expected**: At least 1 row with `is_active = true`

**If NO ROWS**:
- ❌ You haven't subscribed to push notifications in the browser
- **Fix**: Go to Settings → Notifications → Enable "Push Notifications"
- This calls `browserPushService.subscribe()` which saves to database

**If ROW EXISTS but `is_active = false`**:
- ❌ Subscription expired or was manually deactivated
- **Fix**: Re-subscribe in Settings

---

### 2. Check if User Has Notification Subscription (Event-Level)

```sql
-- Check notification_subscriptions table
SELECT
  id,
  user_id,
  event_type,
  is_active,
  admin_only,
  created_at
FROM notification_subscriptions
WHERE user_id = '<your-user-id>'
  AND event_type = '<event-type-from-test>'  -- e.g., 'user.signup', 'brief.completed'
ORDER BY created_at DESC;
```

**Expected**: At least 1 row with `is_active = true` for the event type you're testing

**If NO ROWS**:
- ❌ User is not subscribed to this event type
- **Fix Option 1**: Create subscription manually:
  ```sql
  INSERT INTO notification_subscriptions (user_id, event_type, is_active)
  VALUES ('<your-user-id>', '<event-type>', true);
  ```
- **Fix Option 2**: Use the subscription service:
  ```typescript
  await notificationPreferencesService.subscribe('brief.completed');
  ```

**Common Event Types**:
- `user.signup` (admin-only)
- `brief.completed` (user notifications)
- `brief.failed`
- `task.due_soon`
- etc.

---

### 3. Check User Notification Preferences

```sql
-- Check user_notification_preferences table
SELECT
  user_id,
  event_type,
  push_enabled,
  email_enabled,
  sms_enabled,
  in_app_enabled
FROM user_notification_preferences
WHERE user_id = '<your-user-id>'
  AND event_type = '<event-type-from-test>';
```

**Expected**:
- Row exists with `push_enabled = true`
- OR no row (defaults to push_enabled = true)

**If `push_enabled = false`**:
- ❌ User disabled push for this event type
- **Fix**: Enable in Settings → Notifications

---

### 4. Check if Notification Was Delivered

```sql
-- Check notification_deliveries table
SELECT
  id,
  event_id,
  channel,
  recipient_user_id,
  status,
  sent_at,
  failed_at,
  last_error,
  created_at
FROM notification_deliveries
WHERE event_id = '<event-id-from-test-response>'  -- From API response
ORDER BY created_at DESC;
```

**Status Meanings**:
- `pending` - Queued but not yet sent
- `sent` - Sent via web-push
- `failed` - Send failed (check `last_error`)
- `delivered` - Successfully delivered

**If NO ROWS**:
- ❌ No deliveries created = User has no subscription or push disabled
- **Go back to steps 2 & 3**

**If `status = 'failed'`**:
- Check `last_error` column for reason
- Common errors:
  - "Push subscription expired" - Re-subscribe
  - "VAPID keys not configured" - Check environment variables
  - "Subscription endpoint invalid" - Re-subscribe

---

### 5. Check Queue Jobs

```sql
-- Check queue_jobs table
SELECT
  id,
  job_type,
  status,
  metadata,
  error_message,
  attempts,
  created_at,
  scheduled_for
FROM queue_jobs
WHERE metadata->>'event_id' = '<event-id-from-test>'
  AND job_type = 'send_notification'
ORDER BY created_at DESC;
```

**Status Meanings**:
- `pending` - Waiting to be processed
- `processing` - Currently being sent
- `completed` - Successfully sent
- `failed` - Failed after max retries

**If `status = 'failed'`**:
- Check `error_message` for details
- Check `attempts` - should be ≤ 3

**If `status = 'pending'` for more than 1 minute**:
- ❌ Worker not running or not processing jobs
- Check Railway logs for worker service
- Check worker health: `curl https://<worker-url>/health`

---

### 6. Verify VAPID Keys Configuration

**Web App** (.env):
```bash
PUBLIC_VAPID_PUBLIC_KEY=<your-public-key>
```

**Worker Service** (.env):
```bash
VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
VAPID_SUBJECT=mailto:support@buildos.com
```

**Check if keys match**:
```bash
# In worker logs, look for:
[NotificationWorker] VAPID keys configured ✓

# Or look for warning:
[NotificationWorker] VAPID keys not configured - push notifications will not work
```

**If keys don't match**:
- ❌ Push notifications will fail silently
- **Fix**: Regenerate keys and update both apps:
  ```bash
  npx web-push generate-vapid-keys
  ```

---

### 7. Check Service Worker Registration

**Browser DevTools** → Application → Service Workers

**Expected**:
- Service worker status: **Activated and is running**
- Version: `1.1.0` or higher
- Source: `/sw.js`

**If not activated**:
- Clear browser cache
- Hard refresh (Cmd/Ctrl + Shift + R)
- Check browser console for registration errors

**Test in Browser Console**:
```javascript
// Check if service worker registered
navigator.serviceWorker.ready.then(reg => {
  console.log('Service worker ready:', reg);
});

// Check notification permission
console.log('Notification permission:', Notification.permission);
```

---

### 8. Check Browser Notification Permission

**Required**: `Notification.permission === "granted"`

**Check in Browser Console**:
```javascript
console.log(Notification.permission);
// Should be: "granted"
```

**If "denied"**:
- ❌ User denied permission
- **Fix**:
  1. Go to browser settings
  2. Find site permissions for build-os.com
  3. Enable notifications
  4. Refresh page and try again

**If "default"**:
- ❌ User hasn't been asked yet
- **Fix**: Go to Settings → Notifications → Enable "Push Notifications"

---

## Complete Test Flow

### Setup (One-Time)

1. **Subscribe to Push Notifications**:
   - Go to Settings → Notifications
   - Toggle "Push Notifications" ON
   - Grant browser permission when prompted

2. **Create Notification Subscription**:
   ```sql
   INSERT INTO notification_subscriptions (user_id, event_type, is_active)
   VALUES ('<your-user-id>', 'brief.completed', true);
   ```

3. **Verify Setup**:
   ```sql
   -- Should return at least 1 row
   SELECT * FROM push_subscriptions WHERE user_id = '<your-user-id>' AND is_active = true;

   -- Should return at least 1 row
   SELECT * FROM notification_subscriptions WHERE user_id = '<your-user-id>' AND event_type = 'brief.completed';
   ```

### Send Test Notification

**Request**:
```bash
curl -X POST https://build-os.com/api/admin/notifications/test \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{
    "event_type": "brief.completed",
    "payload": {
      "title": "Test Push Notification",
      "body": "This is a test from the API",
      "action_url": "/app"
    },
    "recipient_user_ids": ["<your-user-id>"],
    "channels": ["push"]
  }'
```

**Response** (success):
```json
{
  "success": true,
  "data": {
    "event_id": "uuid-123",
    "deliveries": [
      {
        "id": "delivery-uuid",
        "channel": "push",
        "recipient_user_id": "your-user-id",
        "status": "pending",
        "last_error": null
      }
    ]
  }
}
```

**If `deliveries` array is empty**:
- ❌ No subscription or push disabled
- Go back to Setup steps 2 & 3

### Verify Delivery

Wait 5-10 seconds, then check:

```sql
-- Should show status = 'sent' or 'delivered'
SELECT status, sent_at, failed_at, last_error
FROM notification_deliveries
WHERE id = '<delivery-id-from-response>';
```

---

## Common Issues & Solutions

### Issue 1: "Deliveries array is empty"
**Cause**: No subscription or push disabled
**Fix**: Create subscription (see Setup step 2)

### Issue 2: "Notification sent but not appearing"
**Cause**: Service worker not registered or permission denied
**Fix**: Check steps 7 & 8

### Issue 3: "Status = 'failed', error = 'Push subscription expired'"
**Cause**: Browser push subscription expired
**Fix**: Re-subscribe in Settings → Notifications

### Issue 4: "Queue job stuck in 'pending'"
**Cause**: Worker not running
**Fix**: Check Railway logs, restart worker if needed

### Issue 5: "VAPID keys mismatch"
**Cause**: Public key in web ≠ private key in worker
**Fix**: Regenerate keys, update both apps, redeploy

---

## Quick Diagnostic SQL

Run this all-in-one query to check setup:

```sql
WITH user_id AS (
  SELECT id FROM users WHERE email = '<your-email>' LIMIT 1
)
SELECT
  'Push Subscription' as check_type,
  CASE
    WHEN ps.id IS NOT NULL AND ps.is_active THEN '✅ Active'
    WHEN ps.id IS NOT NULL THEN '⚠️ Inactive'
    ELSE '❌ Missing'
  END as status,
  ps.endpoint as detail
FROM user_id u
LEFT JOIN push_subscriptions ps ON ps.user_id = u.id AND ps.is_active = true

UNION ALL

SELECT
  'Event Subscription' as check_type,
  CASE
    WHEN ns.id IS NOT NULL AND ns.is_active THEN '✅ Active'
    WHEN ns.id IS NOT NULL THEN '⚠️ Inactive'
    ELSE '❌ Missing'
  END as status,
  ns.event_type as detail
FROM user_id u
LEFT JOIN notification_subscriptions ns ON ns.user_id = u.id AND ns.event_type = 'brief.completed'

UNION ALL

SELECT
  'Push Preference' as check_type,
  CASE
    WHEN np.push_enabled THEN '✅ Enabled'
    WHEN np.push_enabled = false THEN '⚠️ Disabled'
    ELSE '➡️ Default (Enabled)'
  END as status,
  np.event_type as detail
FROM user_id u
LEFT JOIN user_notification_preferences np ON np.user_id = u.id AND np.event_type = 'brief.completed';
```

---

## Success Criteria

All of these should be true:

- [ ] Push subscription exists with `is_active = true`
- [ ] Notification subscription exists for event type with `is_active = true`
- [ ] User preference has `push_enabled = true` (or no preference)
- [ ] VAPID keys configured in both web and worker
- [ ] Service worker registered and activated
- [ ] Browser notification permission granted
- [ ] Test API returns deliveries array with at least 1 item
- [ ] Delivery status changes from `pending` → `sent` within 10 seconds
- [ ] Push notification appears in browser/phone

When all checks pass, push notifications will work! 🎉
