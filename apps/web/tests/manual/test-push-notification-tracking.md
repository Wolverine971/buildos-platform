# Manual Test: Push Notification Click Tracking

**Purpose**: Verify that push notification clicks are properly tracked in the `notification_deliveries` table.

**Date**: 2025-10-06
**Phase**: Phase 2 - Push Notification Tracking Implementation

---

## Prerequisites

1. **VAPID Keys Configured**:
    - `PUBLIC_VAPID_PUBLIC_KEY` set in web app
    - `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set in worker

2. **Service Worker Updated**:
    - Version 1.1.0 deployed
    - Browser cache cleared

3. **User Subscribed to Push**:
    - User has granted push notification permission
    - Active push subscription in `push_subscriptions` table

---

## Test Steps

### 1. Trigger a Test Notification

**Option A: Via Admin Dashboard**

1. Navigate to Admin > Notifications
2. Create a test notification event
3. Select push channel
4. Send to test user

**Option B: Via Database Insert**

```sql
-- Insert test notification event
INSERT INTO notification_events (
  event_type,
  event_source,
  target_user_id,
  payload
) VALUES (
  'test.push_tracking',
  'api_action',
  '<your-user-id>',
  '{"title": "Test Push Notification", "body": "Click me to test tracking!"}'::jsonb
)
RETURNING id;

-- Get the event_id from above, then dispatch notification
SELECT dispatch_notification_event('<event-id>');
```

**Option C: Via API** (if endpoint exists)

```bash
curl -X POST https://build-os.com/api/admin/notifications/send \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "test.push_tracking",
    "user_id": "<user-id>",
    "channels": ["push"],
    "payload": {
      "title": "Test Push Notification",
      "body": "Click me to test tracking!",
      "action_url": "/app"
    }
  }'
```

### 2. Verify Notification Delivery

**Check notification_deliveries table:**

```sql
SELECT
  id,
  channel,
  status,
  sent_at,
  opened_at,
  clicked_at,
  payload->>'title' as title
FROM notification_deliveries
WHERE channel = 'push'
ORDER BY created_at DESC
LIMIT 5;
```

**Expected Result**:

- Status: `sent`
- `sent_at`: Has timestamp
- `opened_at`: NULL (before click)
- `clicked_at`: NULL (before click)

### 3. Click the Push Notification

1. Wait for push notification to appear on device
2. Click the notification
3. Browser should open to the specified URL
4. Check browser console for service worker logs:
    - `[ServiceWorker] Notification clicked...`
    - `[ServiceWorker] Tracking notification click...`
    - `[ServiceWorker] Click tracked successfully`

### 4. Verify Tracking Recorded

**Check notification_deliveries table again:**

```sql
SELECT
  id,
  channel,
  status,
  sent_at,
  opened_at,
  clicked_at,
  tracking_metadata,
  EXTRACT(EPOCH FROM (clicked_at - sent_at)) as seconds_to_click
FROM notification_deliveries
WHERE channel = 'push'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Result**:

- Status: `clicked`
- `sent_at`: Original timestamp
- `opened_at`: Same as `clicked_at` (click implies open for push)
- `clicked_at`: Timestamp when notification was clicked
- `tracking_metadata`: Contains `action`, `user_agent`, `timestamp`
- `seconds_to_click`: Time difference between send and click

### 5. Verify Analytics Dashboard

1. Navigate to Admin > Notifications > Analytics
2. Check push notification metrics
3. Verify:
    - Sent count increased
    - Click rate > 0%
    - Open rate > 0% (same as click rate for push)

**SQL Query for Metrics:**

```sql
SELECT
  channel,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked,
  ROUND(100.0 * COUNT(*) FILTER (WHERE opened_at IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as open_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) / NULLIF(COUNT(*), 0), 2) as click_rate
FROM notification_deliveries
WHERE channel = 'push'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY channel;
```

---

## Edge Cases to Test

### Test 1: Multiple Clicks on Same Notification

**Expected**: Only first click updates `clicked_at`, subsequent clicks don't change timestamp

### Test 2: Notification Without delivery_id

**Expected**: Service worker logs warning but doesn't crash, navigation still works

### Test 3: API Endpoint Down

**Expected**: Service worker catches error, navigation still works, click not tracked

### Test 4: Notification Dismissed (Not Clicked)

**Expected**: No tracking update, `clicked_at` remains NULL

---

## Browser Compatibility Tests

Test in each browser:

- [ ] Chrome Desktop
- [ ] Firefox Desktop
- [ ] Edge Desktop
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS - if push is supported)

---

## Success Criteria

✅ All tests pass if:

1. Push notifications are received
2. Clicking notification updates `notification_deliveries`
3. `clicked_at` and `opened_at` are set correctly
4. Tracking metadata is captured
5. Analytics dashboard shows correct metrics
6. Service worker doesn't throw errors
7. Navigation works correctly after tracking

---

## Troubleshooting

### Service Worker Not Updating

- Clear browser cache
- Unregister old service worker in DevTools > Application > Service Workers
- Hard refresh (Cmd/Ctrl + Shift + R)

### Tracking API Returns 404

- Verify route exists: `/api/notification-tracking/click/[delivery_id]/+server.ts`
- Check SvelteKit build output
- Verify Vercel deployment

### delivery_id Not in Notification Payload

- Check `notificationWorker.ts` line 94
- Verify `delivery.id` is included in push payload
- Check service worker receives `data.delivery_id`

### Database Permission Error

- Verify RLS policies on `notification_deliveries`
- Check service role permissions
- Ensure authenticated user can update their deliveries

---

## Cleanup

After testing, delete test notifications:

```sql
-- Delete test events and deliveries
DELETE FROM notification_deliveries
WHERE event_id IN (
  SELECT id FROM notification_events
  WHERE event_type = 'test.push_tracking'
);

DELETE FROM notification_events
WHERE event_type = 'test.push_tracking';
```
