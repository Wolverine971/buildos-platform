---
date: 2025-10-06T06:00:00-07:00
researcher: Claude (AI Assistant)
git_commit: 5ccb69ca18cc0c394f285dace332b96308a45ddb
branch: main
repository: buildos-platform
topic: "Admin Notification Dashboard - Analytics & Test Bed Specification"
tags: [research, admin, notifications, analytics, testing, spec]
status: complete
last_updated: 2025-10-06
last_updated_by: Claude (AI Assistant)
---

# Admin Notification Dashboard - Analytics & Test Bed Specification

**Date**: 2025-10-06T06:00:00-07:00
**Researcher**: Claude (AI Assistant)
**Git Commit**: 5ccb69ca18cc0c394f285dace332b96308a45ddb
**Branch**: main
**Repository**: buildos-platform

---

## Executive Summary

This specification details the design and implementation of a comprehensive **Admin Notification Dashboard** for BuildOS, featuring:

1. **Analytics Dashboard** - Real-time metrics for notification delivery, engagement, and channel performance
2. **Test Bed** - Interactive tool for testing notification delivery to specific users

The dashboard leverages BuildOS's existing notification system infrastructure (Phase 1-3 implementation complete) and follows established admin UI patterns.

---

## Research Question

How should we build an admin dashboard that:

1. Provides comprehensive analytics on the notification system's performance
2. Enables admins to test notifications across all channels before production rollout
3. Integrates seamlessly with existing admin UI patterns
4. Surfaces actionable insights for system monitoring and debugging

---

## Current State Analysis

### ✅ Notification System Implementation Status

Based on comprehensive codebase research, the BuildOS notification system has:

**Database Infrastructure (Complete)**

- 5 core tables: `notification_events`, `notification_deliveries`, `notification_subscriptions`, `user_notification_preferences`, `push_subscriptions`
- RPC functions: `emit_notification_event()`, `update_user_notification_preferences()`
- Queue integration with `send_notification` job type

**Event Types (3 of 10 implemented)**

- ✅ `user.signup` - Admin notifications
- ✅ `brief.completed` - User notifications
- ✅ `brief.failed` - User notifications
- ⏳ 7 event types defined but not wired up

**Channel Adapters**

- ✅ Browser Push (VAPID, service worker, full implementation)
- ✅ Email (adapter using existing email infrastructure)
- ✅ In-App (direct database insertion)
- ⚠️ SMS (placeholder only, not implemented)

**Key Files**

- `/apps/web/supabase/migrations/20251006_notification_system_phase1.sql`
- `/apps/web/supabase/migrations/20251006_notification_system_phase3.sql`
- `/apps/worker/src/workers/notification/notificationWorker.ts`
- `/apps/web/src/lib/services/notification-preferences.service.ts`
- `/apps/web/src/lib/services/browser-push.service.ts`

### ✅ Existing Admin System

BuildOS has a mature admin system with:

**Admin Routes**: `/apps/web/src/routes/admin/`

- Main dashboard (`+page.svelte`)
- User management (`users/+page.svelte`)
- Beta program (`beta/+page.svelte`)
- Error logs (`errors/+page.svelte`)
- Feedback (`feedback/+page.svelte`)
- LLM usage (`llm-usage/+page.svelte`)
- Revenue (`revenue/+page.svelte`)
- Subscriptions (`subscriptions/+page.svelte`)

**Admin API**: 35+ endpoints under `/apps/web/src/routes/api/admin/`

- Analytics (11 endpoints)
- User management (4 endpoints)
- Beta program (4 endpoints)
- Email campaigns (9 endpoints)
- Error management (2 endpoints)
- Feedback (2 endpoints)
- LLM usage, revenue, subscriptions

**Protection**:

- Layout guard at `/admin/+layout.server.ts`
- Database flag: `users.is_admin` (boolean)
- API-level checks on all admin endpoints

### 🔍 Gaps Identified

**Missing from Notification System:**

1. ❌ No analytics dashboard or reporting
2. ❌ No notification testing/debugging tools
3. ❌ No delivery monitoring UI
4. ❌ No resend/retry functionality
5. ❌ No admin API endpoints for notifications
6. ❌ No way to view notification logs in UI

**However, tracking data IS being collected:**

- `notification_deliveries` table has `sent_at`, `delivered_at`, `opened_at`, `clicked_at`, `failed_at`
- Retry attempts and error messages tracked
- External IDs for provider tracking
- Full event payload history

---

## Proposed Solution: Admin Notification Dashboard

### Feature Set Overview

```
/admin/notifications/
├── /dashboard          → Analytics & Metrics
├── /test-bed           → Send Test Notifications
├── /logs               → Event & Delivery Logs
└── /preferences        → System-wide notification settings (future)
```

---

## 1. Analytics Dashboard (`/admin/notifications`)

### A. Overview Metrics (Top Cards)

**Layout**: 4-column grid

| Metric                    | Query                                                             | Timeframe     |
| ------------------------- | ----------------------------------------------------------------- | ------------- |
| **Total Sent (24h)**      | `COUNT(*)` from `notification_deliveries` where `status = 'sent'` | Last 24 hours |
| **Delivery Success Rate** | `(sent / total) * 100`                                            | Last 24 hours |
| **Avg Open Rate**         | `(opened / sent) * 100`                                           | Last 7 days   |
| **Avg Click Rate**        | `(clicked / opened) * 100`                                        | Last 7 days   |

**Visual**: Large number with trend indicator (↑ 12% vs previous period)

---

### B. Channel Performance Comparison

**Layout**: Horizontal bar chart or table

| Channel      | Sent  | Delivered | Opened | Clicked | Success Rate | Open Rate | Click Rate |
| ------------ | ----- | --------- | ------ | ------- | ------------ | --------- | ---------- |
| Browser Push | 1,234 | 1,180     | 456    | 89      | 95.6%        | 38.6%     | 19.5%      |
| Email        | 2,567 | 2,489     | 1,234  | 345     | 97.0%        | 49.6%     | 28.0%      |
| In-App       | 3,456 | 3,456     | 2,345  | -       | 100%         | 67.9%     | -          |
| SMS          | 0     | 0         | -      | -       | -            | -         | -          |

**SQL Query**:

```sql
SELECT
  channel,
  COUNT(*) as total_sent,
  COUNT(*) FILTER (WHERE status = 'sent') as delivered,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked,
  ROUND(COUNT(*) FILTER (WHERE status = 'sent')::numeric / COUNT(*) * 100, 2) as success_rate,
  ROUND(COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE status = 'sent'), 0) * 100, 2) as open_rate,
  ROUND(COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE opened_at IS NOT NULL), 0) * 100, 2) as click_rate
FROM notification_deliveries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY channel
ORDER BY total_sent DESC;
```

---

### C. Event Type Breakdown

**Layout**: Table with sortable columns

| Event Type      | Total Events | Deliveries | Subscribers | Avg Delivery Time | Open Rate | Click Rate |
| --------------- | ------------ | ---------- | ----------- | ----------------- | --------- | ---------- |
| brief.completed | 1,234        | 3,702      | 3 channels  | 2.3s              | 45.2%     | 12.3%      |
| user.signup     | 45           | 90         | 2 admins    | 0.8s              | 78.9%     | 56.7%      |
| brief.failed    | 12           | 36         | 3 channels  | 1.2s              | 89.1%     | 67.4%      |

**SQL Query**:

```sql
SELECT
  ne.event_type,
  COUNT(DISTINCT ne.id) as total_events,
  COUNT(nd.id) as total_deliveries,
  COUNT(DISTINCT ns.user_id) as unique_subscribers,
  ROUND(AVG(EXTRACT(EPOCH FROM (nd.sent_at - nd.created_at))), 2) as avg_delivery_time_seconds,
  ROUND(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent'), 0) * 100, 2) as open_rate,
  ROUND(COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::numeric / NULLIF(COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL), 0) * 100, 2) as click_rate
FROM notification_events ne
LEFT JOIN notification_deliveries nd ON nd.event_id = ne.id
LEFT JOIN notification_subscriptions ns ON ns.event_type = ne.event_type
WHERE ne.created_at > NOW() - INTERVAL '30 days'
GROUP BY ne.event_type
ORDER BY total_events DESC;
```

---

### D. Delivery Timeline Chart

**Layout**: Line chart with multiple series

**X-axis**: Time (hourly or daily buckets)
**Y-axis**: Count
**Series**:

- Sent (green)
- Delivered (blue)
- Opened (purple)
- Clicked (orange)
- Failed (red)

**SQL Query**:

```sql
SELECT
  DATE_TRUNC('hour', created_at) as time_bucket,
  COUNT(*) FILTER (WHERE status = 'sent') as sent,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM notification_deliveries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY time_bucket
ORDER BY time_bucket ASC;
```

---

### E. Failed Deliveries Section

**Layout**: Alert-style table (only shown if failures exist)

| Time      | Event Type      | Channel | Recipient          | Error                      | Attempts | Actions              |
| --------- | --------------- | ------- | ------------------ | -------------------------- | -------- | -------------------- |
| 2 min ago | brief.completed | push    | user@example.com   | Subscription expired (410) | 3/3      | Resend, View Details |
| 5 min ago | user.signup     | email   | admin@build-os.com | SMTP timeout               | 2/3      | Retry, View Details  |

**SQL Query**:

```sql
SELECT
  nd.created_at,
  ne.event_type,
  nd.channel,
  u.email as recipient_email,
  nd.last_error,
  nd.attempts,
  nd.max_attempts,
  nd.id as delivery_id,
  ne.id as event_id
FROM notification_deliveries nd
JOIN notification_events ne ON ne.id = nd.event_id
JOIN users u ON u.id = nd.recipient_user_id
WHERE nd.status = 'failed'
  AND nd.created_at > NOW() - INTERVAL '24 hours'
ORDER BY nd.created_at DESC
LIMIT 50;
```

**Actions**:

- **Retry**: Call `POST /api/admin/notifications/deliveries/[id]/retry`
- **Resend**: Call `POST /api/admin/notifications/deliveries/[id]/resend` (creates new delivery)
- **View Details**: Open modal with full error stack trace and payload

---

### F. Subscription Overview

**Layout**: Table showing active subscriptions

| User     | Email               | Event Types                   | Push | Email | SMS | In-App | Last Notification |
| -------- | ------------------- | ----------------------------- | ---- | ----- | --- | ------ | ----------------- |
| DJ Wayne | djwayne35@gmail.com | user.signup, error.critical   | ✓    | ✓     | -   | ✓      | 2 hours ago       |
| User 1   | user1@example.com   | brief.completed, brief.failed | ✓    | ✓     | -   | ✓      | 1 day ago         |

**SQL Query**:

```sql
SELECT
  u.id,
  u.email,
  u.name,
  ARRAY_AGG(DISTINCT ns.event_type) as subscribed_events,
  BOOL_OR(unp.push_enabled) as push_enabled,
  BOOL_OR(unp.email_enabled) as email_enabled,
  BOOL_OR(unp.sms_enabled) as sms_enabled,
  BOOL_OR(unp.in_app_enabled) as in_app_enabled,
  MAX(nd.created_at) as last_notification_sent
FROM users u
JOIN notification_subscriptions ns ON ns.user_id = u.id
LEFT JOIN user_notification_preferences unp ON unp.user_id = u.id AND unp.event_type = ns.event_type
LEFT JOIN notification_deliveries nd ON nd.recipient_user_id = u.id
WHERE ns.is_active = true
GROUP BY u.id, u.email, u.name
ORDER BY last_notification_sent DESC NULLS LAST;
```

---

### G. Controls & Filters

**Timeframe Selector**:

- Last 24 hours
- Last 7 days (default)
- Last 30 days
- Last 90 days
- Custom date range

**Channel Filter**: All, Push, Email, SMS, In-App

**Event Type Filter**: All, or specific event types

**Auto-refresh Toggle**: Refresh every 30s (off by default)

**Export Button**: Export analytics to CSV

---

## 2. Test Bed (`/admin/notifications/test-bed`)

### Purpose

Allow admins to:

1. Test notification delivery across all channels
2. Preview notification appearance before sending to real users
3. Debug delivery issues
4. Validate notification templates and payloads

### A. User Interface Layout

```
┌─────────────────────────────────────────────────────────────┐
│                      NOTIFICATION TEST BED                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Step 1: Select Event Type                                 │
│  ┌───────────────────────────────────────────────────┐    │
│  │ [Dropdown: user.signup ▼]                         │    │
│  │                                                    │    │
│  │ Description: New user signs up for BuildOS        │    │
│  │ Admin Only: Yes                                   │    │
│  │ Default Channels: Push, In-App                    │    │
│  └───────────────────────────────────────────────────┘    │
│                                                             │
│  Step 2: Configure Payload                                 │
│  ┌───────────────────────────────────────────────────┐    │
│  │ [Auto-generated form based on event schema]       │    │
│  │                                                    │    │
│  │ User Email: [test@example.com_______________]     │    │
│  │ Signup Method: [○ email  ○ google_oauth]          │    │
│  │ Referral Source: [organic________________]        │    │
│  │                                                    │    │
│  │ [Use Sample Data] [Clear Form]                    │    │
│  └───────────────────────────────────────────────────┘    │
│                                                             │
│  Step 3: Select Recipients                                 │
│  ┌───────────────────────────────────────────────────┐    │
│  │ Recipient Type: [○ Actual Subscribers             │    │
│  │                  ● Specific Users                 │    │
│  │                  ○ Test Mode (Admin Only)]        │    │
│  │                                                    │    │
│  │ [Search users: ___________________________] 🔍    │    │
│  │                                                    │    │
│  │ Selected Users:                                   │    │
│  │ ┌─────────────────────────────────────────────┐  │    │
│  │ │ ☑ DJ Wayne (djwayne35@gmail.com)      [×]  │  │    │
│  │ │ ☑ David Wayne (dj@build-os.com)       [×]  │  │    │
│  │ └─────────────────────────────────────────────┘  │    │
│  │                                                    │    │
│  │ [Add Current User]                                │    │
│  └───────────────────────────────────────────────────┘    │
│                                                             │
│  Step 4: Select Channels                                   │
│  ┌───────────────────────────────────────────────────┐    │
│  │ ☑ Browser Push                                    │    │
│  │   Subscribers: 2/2 selected users have active     │    │
│  │   push subscriptions                              │    │
│  │                                                    │    │
│  │ ☑ Email                                           │    │
│  │   All selected users have email addresses         │    │
│  │                                                    │    │
│  │ ☐ SMS (Not configured)                            │    │
│  │                                                    │    │
│  │ ☑ In-App                                          │    │
│  │   Will appear in notification bell                │    │
│  └───────────────────────────────────────────────────┘    │
│                                                             │
│  Preview                                                    │
│  ┌───────────────────────────────────────────────────┐    │
│  │ [Browser Push Preview]  [Email Preview]           │    │
│  │ [In-App Preview]                                  │    │
│  └───────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              [Send Test Notification]               │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
│  Recent Test Notifications                                 │
│  ┌───────────────────────────────────────────────────┐    │
│  │ 2 min ago | brief.completed | Push, Email | 2 users│  │
│  │   ✓ Sent successfully to djwayne35@gmail.com      │    │
│  │   ✓ Sent successfully to dj@build-os.com          │    │
│  │                                                    │    │
│  │ 1 hour ago | user.signup | Push | 1 user          │    │
│  │   ✗ Failed: No active push subscription           │    │
│  └───────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

### B. Event Type Selection

**Component**: Dropdown with rich metadata

**Data Source**: Event Registry (from `/packages/shared-types/src/notification.types.ts`)

**Display**:

```typescript
interface EventOption {
  type: EventType;
  label: string; // "User Signup"
  description: string; // From EVENT_REGISTRY
  adminOnly: boolean;
  defaultChannels: NotificationChannel[];
  payloadSchema: ZodSchema;
}
```

**Example Options**:

- User Signup (admin only)
- Brief Completed (user notification)
- Brief Failed (user notification)
- Brain Dump Processed (user notification)
- Task Due Soon (user notification)
- Project Phase Scheduled (user notification)
- Calendar Sync Failed (user notification)
- Trial Expired (admin only)
- Payment Failed (admin only)
- Critical Error (admin only)

---

### C. Payload Configuration

**Dynamic Form Generation**: Based on Zod schema from EVENT_REGISTRY

**Example for `user.signup`**:

```typescript
payloadSchema: z.object({
  user_id: z.string().uuid(),
  user_email: z.string().email(),
  signup_method: z.enum(["email", "google_oauth"]),
  referral_source: z.string().optional(),
});
```

**Rendered Form**:

- `user_id`: Text input (UUID format)
- `user_email`: Email input with validation
- `signup_method`: Radio buttons (Email / Google OAuth)
- `referral_source`: Text input (optional)

**Helpers**:

- **Use Sample Data**: Pre-fill with realistic test data
- **Clear Form**: Reset all fields
- **Validation**: Client-side validation using Zod schema

---

### D. Recipient Selection

**Three Modes**:

1. **Actual Subscribers** (Default behavior)
   - Uses actual subscription data from `notification_subscriptions`
   - Shows count: "3 users are subscribed to this event"
   - Lists subscribers with option to exclude specific users

2. **Specific Users** (Manual selection)
   - Search/filter users from `/api/admin/users`
   - Multi-select with user chips
   - Shows channel availability per user:
     - Push: Active subscription exists
     - Email: Email address verified
     - SMS: Phone number on file
     - In-App: Always available

3. **Test Mode (Admin Only)**
   - Only sends to current admin user
   - Useful for quick testing without bothering other users
   - Bypasses subscription checks

**User Search Component**:

```svelte
<UserSearchInput
  onSelect={(user) => addRecipient(user)}
  placeholder="Search by email or name..."
  excludeAdmins={eventType.adminOnly ? false : true}
/>
```

**Selected Users Display**:

```svelte
{#each selectedUsers as user}
  <div class="user-chip">
    <div class="user-info">
      <span class="name">{user.name || user.email}</span>
      <span class="email">{user.email}</span>
    </div>
    <div class="channel-indicators">
      {#if user.hasPushSubscription}
        <Icon name="bell" class="text-green-600" />
      {/if}
      {#if user.email}
        <Icon name="mail" class="text-blue-600" />
      {/if}
      {#if user.phone}
        <Icon name="phone" class="text-purple-600" />
      {/if}
    </div>
    <button onclick={() => removeRecipient(user.id)}>×</button>
  </div>
{/each}
```

---

### E. Channel Selection

**Checkboxes with Status Indicators**:

**Browser Push**:

- Show count: "2/3 selected users have active push subscriptions"
- Disable if no users have subscriptions
- Link to `/admin/notifications/push-setup` (future)

**Email**:

- Show count: "3/3 selected users have email addresses"
- Always available (all users have emails)

**SMS**:

- Show status: "Not configured" or "X users have phone numbers"
- Disable if Twilio not configured
- **Note**: SMS channel requires implementation - see [SMS Notification Channel Design](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md)

**In-App**:

- Always available
- Show note: "Will appear in notification bell icon"

**Smart Defaults**:

- Pre-select channels from `EVENT_REGISTRY[eventType].defaultChannels`
- Disable channels with 0 available recipients

---

### F. Preview Panes

**Tabs**: Browser Push | Email | In-App | SMS

**Browser Push Preview**:

```
┌─────────────────────────────────────────┐
│  BuildOS                           [×]  │
│  ─────────────────────────────────────  │
│  🔔 New user signup                     │
│                                         │
│  test@example.com just signed up via   │
│  Google OAuth                           │
│                                         │
│  [View in Dashboard]                    │
│                                         │
│  Just now                               │
└─────────────────────────────────────────┘
```

**Email Preview**:

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      /* Gradient header, responsive design */
    </style>
  </head>
  <body>
    <div style="background: linear-gradient(135deg, #6B46C1 0%, #9333EA 100%);">
      <h1>New User Signup</h1>
    </div>
    <div style="padding: 20px;">
      <p>test@example.com just signed up via Google OAuth</p>
      <a href="https://build-os.com/admin/users"> View in Dashboard </a>
    </div>
  </body>
</html>
```

**In-App Preview**:
Shows mockup of notification in the bell icon dropdown

---

### G. Send Test Notification Button

**Behavior**:

1. **Validation**:
   - Payload schema validation (Zod)
   - At least one recipient selected
   - At least one channel selected
   - Channel-recipient compatibility check

2. **Confirmation Modal**:

   ```
   Send Test Notification?

   Event Type: user.signup
   Recipients: 2 users (djwayne35@gmail.com, dj@build-os.com)
   Channels: Browser Push, Email, In-App

   This will send real notifications to the selected users.

   [Cancel]  [Send Test Notification]
   ```

3. **API Call**: `POST /api/admin/notifications/test`

   ```typescript
   {
     event_type: 'user.signup',
     payload: {
       user_id: '...',
       user_email: 'test@example.com',
       signup_method: 'google_oauth'
     },
     recipient_user_ids: ['user-id-1', 'user-id-2'],
     channels: ['push', 'email', 'in_app'],
     test_mode: true  // Flags as test in database
   }
   ```

4. **Real-time Feedback**:
   - Loading spinner while sending
   - Success toast: "Test notification sent to 2 users across 3 channels"
   - Error toast: "Failed to send: [error message]"
   - Delivery status updates in "Recent Test Notifications"

5. **Result Tracking**:
   - Creates records in `notification_events` with `metadata.test_mode = true`
   - Creates records in `notification_deliveries`
   - Adds to "Recent Test Notifications" table

---

### H. Recent Test Notifications

**Table showing last 20 test notifications**:

| Time       | Event Type      | Channels    | Recipients | Status     | Actions           |
| ---------- | --------------- | ----------- | ---------- | ---------- | ----------------- |
| 2 min ago  | user.signup     | Push, Email | 2 users    | ✓ 2/2 sent | View Details      |
| 1 hour ago | brief.completed | Push        | 1 user     | ✗ 0/1 sent | View Error, Retry |

**Click "View Details"**: Opens modal with:

- Full payload (JSON)
- Delivery attempts per channel
- Timestamps (created, sent, delivered, opened, clicked)
- Error messages (if any)
- Link to full event in logs

**Click "Retry"**: Re-attempts failed deliveries only

---

## 3. Event & Delivery Logs (`/admin/notifications/logs`)

### A. Event Log Tab

**Table**: All `notification_events` records

| Time      | Event Type      | Source           | Actor            | Target            | Deliveries | Actions    |
| --------- | --------------- | ---------------- | ---------------- | ----------------- | ---------- | ---------- |
| 2 min ago | user.signup     | database_trigger | user@example.com | -                 | 2          | View Event |
| 5 min ago | brief.completed | worker_job       | -                | user1@example.com | 3          | View Event |

**Filters**:

- Event Type dropdown
- Event Source dropdown
- Date range
- Actor user search
- Target user search
- Test mode only checkbox

**Actions**:

- **View Event**: Modal with full payload and metadata
- **Export**: Export filtered events to CSV

---

### B. Delivery Log Tab

**Table**: All `notification_deliveries` records

| Time      | Event Type      | Channel | Recipient          | Status | Sent | Opened      | Clicked     | Actions |
| --------- | --------------- | ------- | ------------------ | ------ | ---- | ----------- | ----------- | ------- |
| 2 min ago | user.signup     | push    | admin@build-os.com | sent   | ✓    | -           | -           | Resend  |
| 5 min ago | brief.completed | email   | user@example.com   | sent   | ✓    | ✓ 3 min ago | ✓ 2 min ago | View    |

**Filters**:

- Channel dropdown
- Status dropdown
- Event Type dropdown
- Recipient user search
- Date range
- Show failed only checkbox

**Status Badges**:

- `pending` - Gray
- `sent` - Green
- `delivered` - Blue (for channels that support delivery confirmation)
- `failed` - Red
- `bounced` - Orange

**Actions**:

- **Resend**: Creates new delivery record and queues job
- **Retry**: Retries failed delivery (same record, increments attempts)
- **View**: Modal with full delivery details and payload

---

### C. Export Functionality

**Export Options**:

- Format: CSV, JSON
- Scope: Current filter results, All data
- Columns: Configurable (select which fields to include)
- Date range: Specify start and end date

**Generated File**:

```csv
event_id,event_type,created_at,delivery_id,channel,recipient_email,status,sent_at,opened_at,clicked_at
uuid1,user.signup,2025-10-06T12:00:00Z,uuid2,push,admin@build-os.com,sent,2025-10-06T12:00:02Z,,,
```

---

## 4. API Endpoints (New)

### A. Analytics Endpoints

#### `GET /api/admin/notifications/analytics/overview`

**Query Parameters**:

- `timeframe`: '24h' | '7d' | '30d' | '90d' (default: '7d')

**Response**:

```typescript
{
  total_sent: number,
  delivery_success_rate: number,
  avg_open_rate: number,
  avg_click_rate: number,
  trend_vs_previous_period: {
    sent: number,  // percentage change
    success_rate: number,
    open_rate: number,
    click_rate: number
  }
}
```

---

#### `GET /api/admin/notifications/analytics/channels`

**Query Parameters**:

- `timeframe`: '24h' | '7d' | '30d' | '90d' (default: '7d')

**Response**:

```typescript
{
  channels: Array<{
    channel: NotificationChannel;
    total_sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
    success_rate: number;
    open_rate: number;
    click_rate: number;
    avg_delivery_time_ms: number;
  }>;
}
```

---

#### `GET /api/admin/notifications/analytics/events`

**Query Parameters**:

- `timeframe`: '24h' | '7d' | '30d' | '90d' (default: '30d')

**Response**:

```typescript
{
  events: Array<{
    event_type: EventType;
    total_events: number;
    total_deliveries: number;
    unique_subscribers: number;
    avg_delivery_time_seconds: number;
    open_rate: number;
    click_rate: number;
  }>;
}
```

---

#### `GET /api/admin/notifications/analytics/timeline`

**Query Parameters**:

- `timeframe`: '24h' | '7d' | '30d' | '90d' (default: '7d')
- `granularity`: 'hour' | 'day' (auto-selected based on timeframe)

**Response**:

```typescript
{
  timeline: Array<{
    time_bucket: string; // ISO timestamp
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    failed: number;
  }>;
}
```

---

#### `GET /api/admin/notifications/analytics/failures`

**Query Parameters**:

- `timeframe`: '24h' | '7d' | '30d' (default: '24h')
- `limit`: number (default: 50)

**Response**:

```typescript
{
  failures: Array<{
    delivery_id: string;
    event_id: string;
    event_type: EventType;
    channel: NotificationChannel;
    recipient_user_id: string;
    recipient_email: string;
    last_error: string;
    attempts: number;
    max_attempts: number;
    created_at: string;
    failed_at: string;
  }>;
}
```

---

#### `GET /api/admin/notifications/analytics/subscriptions`

**Response**:

```typescript
{
  subscriptions: Array<{
    user_id: string;
    email: string;
    name: string | null;
    subscribed_events: EventType[];
    push_enabled: boolean;
    email_enabled: boolean;
    sms_enabled: boolean;
    in_app_enabled: boolean;
    last_notification_sent: string | null;
  }>;
}
```

---

### B. Test Bed Endpoints

#### `POST /api/admin/notifications/test`

**Request Body**:

```typescript
{
  event_type: EventType,
  payload: Record<string, any>,  // Must match event's payloadSchema
  recipient_user_ids: string[],
  channels: NotificationChannel[],
  test_mode: boolean  // default: true
}
```

**Response**:

```typescript
{
  event_id: string,
  deliveries: Array<{
    delivery_id: string,
    channel: NotificationChannel,
    recipient_user_id: string,
    status: 'pending' | 'queued' | 'failed',
    error?: string
  }>
}
```

**Behavior**:

1. Validates payload against event schema
2. Creates `notification_event` record (with `metadata.test_mode = true`)
3. For each recipient × channel combination:
   - Checks channel availability
   - Creates `notification_deliveries` record
   - Queues `send_notification` job
4. Returns event_id and delivery IDs for tracking

---

#### `GET /api/admin/notifications/test/history`

**Query Parameters**:

- `limit`: number (default: 20)
- `offset`: number (default: 0)

**Response**:

```typescript
{
  tests: Array<{
    event_id: string,
    event_type: EventType,
    created_at: string,
    recipient_count: number,
    channel_count: number,
    channels: NotificationChannel[],
    deliveries: Array<{
      delivery_id: string,
      channel: NotificationChannel,
      recipient_email: string,
      status: NotificationStatus,
      error?: string
    }>
  }>,
  total_count: number
}
```

---

#### `GET /api/admin/notifications/recipients/search`

**Query Parameters**:

- `q`: string (search query for email/name)
- `event_type`: EventType (optional, filter by subscribers)
- `limit`: number (default: 20)

**Response**:

```typescript
{
  users: Array<{
    id: string;
    email: string;
    name: string | null;
    is_admin: boolean;
    has_push_subscription: boolean;
    has_phone: boolean;
    is_subscribed_to_event?: boolean; // if event_type provided
  }>;
}
```

---

### C. Delivery Management Endpoints

#### `POST /api/admin/notifications/deliveries/[id]/retry`

**Purpose**: Retry a failed delivery (increments attempts counter)

**Response**:

```typescript
{
  delivery_id: string,
  status: 'pending' | 'queued',
  attempts: number,
  queued_at: string
}
```

---

#### `POST /api/admin/notifications/deliveries/[id]/resend`

**Purpose**: Create a new delivery record and resend (useful for expired push subscriptions)

**Response**:

```typescript
{
  new_delivery_id: string,
  status: 'pending' | 'queued',
  queued_at: string
}
```

---

### D. Logs Endpoints

#### `GET /api/admin/notifications/events`

**Query Parameters**:

- `event_type`: EventType (optional)
- `event_source`: EventSource (optional)
- `actor_user_id`: string (optional)
- `target_user_id`: string (optional)
- `test_mode_only`: boolean (default: false)
- `start_date`: ISO timestamp (optional)
- `end_date`: ISO timestamp (optional)
- `limit`: number (default: 50)
- `offset`: number (default: 0)

**Response**:

```typescript
{
  events: Array<NotificationEvent>,
  total_count: number
}
```

---

#### `GET /api/admin/notifications/events/[id]`

**Response**:

```typescript
{
  event: NotificationEvent,
  deliveries: Array<NotificationDelivery>
}
```

---

#### `GET /api/admin/notifications/deliveries`

**Query Parameters**:

- `channel`: NotificationChannel (optional)
- `status`: NotificationStatus (optional)
- `event_type`: EventType (optional)
- `recipient_user_id`: string (optional)
- `failed_only`: boolean (default: false)
- `start_date`: ISO timestamp (optional)
- `end_date`: ISO timestamp (optional)
- `limit`: number (default: 50)
- `offset`: number (default: 0)

**Response**:

```typescript
{
  deliveries: Array<NotificationDelivery & {
    event_type: EventType,
    recipient_email: string
  }>,
  total_count: number
}
```

---

#### `GET /api/admin/notifications/deliveries/[id]`

**Response**:

```typescript
{
  delivery: NotificationDelivery,
  event: NotificationEvent,
  recipient: {
    id: string,
    email: string,
    name: string | null
  }
}
```

---

#### `GET /api/admin/notifications/export`

**Query Parameters**:

- Same as `/deliveries` or `/events`
- `format`: 'csv' | 'json' (default: 'csv')
- `include_columns`: string[] (optional, defaults to all)

**Response**: CSV or JSON file download

---

## 5. Services (New)

### A. Notification Analytics Service

**Location**: `/apps/web/src/lib/services/notification-analytics.service.ts`

```typescript
export class NotificationAnalyticsService {
  /**
   * Get overview metrics
   */
  async getOverview(timeframe: Timeframe = "7d"): Promise<AnalyticsOverview> {
    const { data, error } = await fetch(
      `/api/admin/notifications/analytics/overview?timeframe=${timeframe}`,
    ).then((r) => r.json());

    if (error) throw error;
    return data;
  }

  /**
   * Get channel performance metrics
   */
  async getChannelPerformance(
    timeframe: Timeframe = "7d",
  ): Promise<ChannelMetrics[]> {
    const { data, error } = await fetch(
      `/api/admin/notifications/analytics/channels?timeframe=${timeframe}`,
    ).then((r) => r.json());

    if (error) throw error;
    return data.channels;
  }

  /**
   * Get event type breakdown
   */
  async getEventBreakdown(
    timeframe: Timeframe = "30d",
  ): Promise<EventMetrics[]> {
    const { data, error } = await fetch(
      `/api/admin/notifications/analytics/events?timeframe=${timeframe}`,
    ).then((r) => r.json());

    if (error) throw error;
    return data.events;
  }

  /**
   * Get delivery timeline
   */
  async getTimeline(timeframe: Timeframe = "7d"): Promise<TimelineDataPoint[]> {
    const { data, error } = await fetch(
      `/api/admin/notifications/analytics/timeline?timeframe=${timeframe}`,
    ).then((r) => r.json());

    if (error) throw error;
    return data.timeline;
  }

  /**
   * Get recent failures
   */
  async getFailures(
    timeframe: Timeframe = "24h",
    limit: number = 50,
  ): Promise<FailedDelivery[]> {
    const { data, error } = await fetch(
      `/api/admin/notifications/analytics/failures?timeframe=${timeframe}&limit=${limit}`,
    ).then((r) => r.json());

    if (error) throw error;
    return data.failures;
  }

  /**
   * Get active subscriptions
   */
  async getSubscriptions(): Promise<SubscriptionInfo[]> {
    const { data, error } = await fetch(
      "/api/admin/notifications/analytics/subscriptions",
    ).then((r) => r.json());

    if (error) throw error;
    return data.subscriptions;
  }
}

export const notificationAnalyticsService = new NotificationAnalyticsService();
```

---

### B. Notification Test Service

**Location**: `/apps/web/src/lib/services/notification-test.service.ts`

```typescript
export class NotificationTestService {
  /**
   * Send test notification
   */
  async sendTest(options: {
    event_type: EventType;
    payload: Record<string, any>;
    recipient_user_ids: string[];
    channels: NotificationChannel[];
  }): Promise<TestNotificationResult> {
    const response = await fetch("/api/admin/notifications/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...options, test_mode: true }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to send test notification");
    }

    return response.json();
  }

  /**
   * Get test history
   */
  async getHistory(
    limit: number = 20,
    offset: number = 0,
  ): Promise<TestHistoryResult> {
    const response = await fetch(
      `/api/admin/notifications/test/history?limit=${limit}&offset=${offset}`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch test history");
    }

    return response.json();
  }

  /**
   * Search for recipients
   */
  async searchRecipients(
    query: string,
    eventType?: EventType,
  ): Promise<RecipientSearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (eventType) params.append("event_type", eventType);

    const response = await fetch(
      `/api/admin/notifications/recipients/search?${params}`,
    );

    if (!response.ok) {
      throw new Error("Failed to search recipients");
    }

    const data = await response.json();
    return data.users;
  }

  /**
   * Retry failed delivery
   */
  async retryDelivery(deliveryId: string): Promise<void> {
    const response = await fetch(
      `/api/admin/notifications/deliveries/${deliveryId}/retry`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to retry delivery");
    }
  }

  /**
   * Resend notification (new delivery)
   */
  async resendDelivery(deliveryId: string): Promise<void> {
    const response = await fetch(
      `/api/admin/notifications/deliveries/${deliveryId}/resend`,
      {
        method: "POST",
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to resend delivery");
    }
  }
}

export const notificationTestService = new NotificationTestService();
```

---

## 6. Database Considerations

### No new tables required!

All functionality uses existing tables:

- `notification_events`
- `notification_deliveries`
- `notification_subscriptions`
- `user_notification_preferences`
- `push_subscriptions`
- `users`

### New Indexes (Recommended)

```sql
-- Speed up analytics queries
CREATE INDEX idx_notification_deliveries_created_at_status
ON notification_deliveries(created_at DESC, status);

CREATE INDEX idx_notification_deliveries_channel_status
ON notification_deliveries(channel, status);

-- Speed up event log queries
CREATE INDEX idx_notification_events_test_mode
ON notification_events((metadata->>'test_mode'));

-- Speed up failure queries
CREATE INDEX idx_notification_deliveries_failed
ON notification_deliveries(created_at DESC)
WHERE status = 'failed';
```

### Metadata Additions

**For test notifications**, add to `notification_events.metadata`:

```json
{
  "test_mode": true,
  "test_sent_by": "admin-user-id",
  "test_recipients": ["user-id-1", "user-id-2"]
}
```

---

## 7. Component Architecture

### A. Admin Notification Dashboard Page

**Location**: `/apps/web/src/routes/admin/notifications/+page.svelte`

**Structure**:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { notificationAnalyticsService } from '$lib/services/notification-analytics.service';

  // Svelte 5 runes
  let timeframe = $state<Timeframe>('7d');
  let overview = $state<AnalyticsOverview | null>(null);
  let channelMetrics = $state<ChannelMetrics[]>([]);
  let eventMetrics = $state<EventMetrics[]>([]);
  let timeline = $state<TimelineDataPoint[]>([]);
  let failures = $state<FailedDelivery[]>([]);
  let autoRefresh = $state(false);

  // Derived states
  let hasFailures = $derived(failures.length > 0);

  async function loadAnalytics() {
    [overview, channelMetrics, eventMetrics, timeline, failures] = await Promise.all([
      notificationAnalyticsService.getOverview(timeframe),
      notificationAnalyticsService.getChannelPerformance(timeframe),
      notificationAnalyticsService.getEventBreakdown(timeframe),
      notificationAnalyticsService.getTimeline(timeframe),
      notificationAnalyticsService.getFailures('24h')
    ]);
  }

  onMount(() => {
    loadAnalytics();
  });

  $effect(() => {
    // Auto-refresh effect
    if (autoRefresh) {
      const interval = setInterval(loadAnalytics, 30000);
      return () => clearInterval(interval);
    }
  });

  $effect(() => {
    // Reload when timeframe changes
    loadAnalytics();
  });
</script>

<AdminPageHeader
  title="Notification Analytics"
  description="Monitor notification delivery, engagement, and performance across all channels"
/>

<!-- Overview Metrics -->
<div class="grid grid-cols-4 gap-4 mb-6">
  <MetricCard
    title="Total Sent (24h)"
    value={overview?.total_sent}
    trend={overview?.trend_vs_previous_period.sent}
  />
  <MetricCard
    title="Delivery Success Rate"
    value={`${overview?.delivery_success_rate}%`}
    trend={overview?.trend_vs_previous_period.success_rate}
  />
  <MetricCard
    title="Avg Open Rate"
    value={`${overview?.avg_open_rate}%`}
    trend={overview?.trend_vs_previous_period.open_rate}
  />
  <MetricCard
    title="Avg Click Rate"
    value={`${overview?.avg_click_rate}%`}
    trend={overview?.trend_vs_previous_period.click_rate}
  />
</div>

<!-- Controls -->
<div class="flex items-center justify-between mb-6">
  <TimeframeSelector bind:value={timeframe} />
  <div class="flex gap-2">
    <label>
      <input type="checkbox" bind:checked={autoRefresh} />
      Auto-refresh (30s)
    </label>
    <button onclick={loadAnalytics}>Refresh</button>
    <button onclick={exportAnalytics}>Export CSV</button>
  </div>
</div>

<!-- Channel Performance -->
<section class="mb-6">
  <h2>Channel Performance</h2>
  <ChannelPerformanceTable data={channelMetrics} />
</section>

<!-- Timeline Chart -->
<section class="mb-6">
  <h2>Delivery Timeline</h2>
  <DeliveryTimelineChart data={timeline} />
</section>

<!-- Event Type Breakdown -->
<section class="mb-6">
  <h2>Event Type Breakdown</h2>
  <EventBreakdownTable data={eventMetrics} />
</section>

<!-- Failed Deliveries -->
{#if hasFailures}
  <section class="mb-6">
    <h2 class="text-red-600">Failed Deliveries (Last 24h)</h2>
    <FailedDeliveriesTable data={failures} onRetry={retryDelivery} />
  </section>
{/if}

<!-- Subscription Overview -->
<section>
  <h2>Active Subscriptions</h2>
  <SubscriptionOverviewTable />
</section>
```

---

### B. Test Bed Page

**Location**: `/apps/web/src/routes/admin/notifications/test-bed/+page.svelte`

**Structure**:

```svelte
<script lang="ts">
  import { notificationTestService } from '$lib/services/notification-test.service';
  import { EVENT_REGISTRY } from '$lib/constants/notification-events';

  // Svelte 5 runes
  let selectedEventType = $state<EventType>('user.signup');
  let payload = $state<Record<string, any>>({});
  let selectedRecipients = $state<RecipientUser[]>([]);
  let selectedChannels = $state<NotificationChannel[]>(['push', 'email', 'in_app']);
  let recipientMode = $state<'subscribers' | 'specific' | 'test'>('specific');
  let testHistory = $state<TestHistoryItem[]>([]);

  // Derived
  let eventDef = $derived(EVENT_REGISTRY[selectedEventType]);
  let canSend = $derived(
    selectedRecipients.length > 0 &&
    selectedChannels.length > 0 &&
    isValidPayload
  );

  async function sendTestNotification() {
    try {
      const result = await notificationTestService.sendTest({
        event_type: selectedEventType,
        payload,
        recipient_user_ids: selectedRecipients.map(u => u.id),
        channels: selectedChannels
      });

      // Show success toast
      toast.success(`Test notification sent to ${selectedRecipients.length} users`);

      // Refresh history
      loadTestHistory();
    } catch (error) {
      toast.error(error.message);
    }
  }

  onMount(() => {
    loadTestHistory();
  });
</script>

<AdminPageHeader
  title="Notification Test Bed"
  description="Test notification delivery across all channels before production rollout"
/>

<div class="space-y-6">
  <!-- Step 1: Select Event Type -->
  <section>
    <h2>Step 1: Select Event Type</h2>
    <EventTypeSelector bind:value={selectedEventType} />
    <EventTypeInfo event={eventDef} />
  </section>

  <!-- Step 2: Configure Payload -->
  <section>
    <h2>Step 2: Configure Payload</h2>
    <PayloadForm
      schema={eventDef.payloadSchema}
      bind:value={payload}
    />
  </section>

  <!-- Step 3: Select Recipients -->
  <section>
    <h2>Step 3: Select Recipients</h2>
    <RecipientModeSelector bind:value={recipientMode} />

    {#if recipientMode === 'specific'}
      <UserSearchInput
        onSelect={(user) => selectedRecipients = [...selectedRecipients, user]}
        placeholder="Search users..."
      />
      <SelectedUsersList
        users={selectedRecipients}
        onRemove={(userId) => selectedRecipients = selectedRecipients.filter(u => u.id !== userId)}
      />
    {:else if recipientMode === 'subscribers'}
      <SubscribersList eventType={selectedEventType} />
    {:else}
      <p>Test mode: Will send only to you (current admin user)</p>
    {/if}
  </section>

  <!-- Step 4: Select Channels -->
  <section>
    <h2>Step 4: Select Channels</h2>
    <ChannelCheckboxes
      bind:selected={selectedChannels}
      recipients={selectedRecipients}
      defaultChannels={eventDef.defaultChannels}
    />
  </section>

  <!-- Preview -->
  <section>
    <h2>Preview</h2>
    <NotificationPreviewTabs
      eventType={selectedEventType}
      payload={payload}
      channels={selectedChannels}
    />
  </section>

  <!-- Send Button -->
  <div class="flex justify-center">
    <button
      class="btn-primary btn-lg"
      onclick={sendTestNotification}
      disabled={!canSend}
    >
      Send Test Notification
    </button>
  </div>

  <!-- Recent Test Notifications -->
  <section>
    <h2>Recent Test Notifications</h2>
    <TestHistoryTable data={testHistory} onRetry={retryTest} />
  </section>
</div>
```

---

### C. Notification Logs Page

**Location**: `/apps/web/src/routes/admin/notifications/logs/+page.svelte`

**Tabs**:

- Event Log
- Delivery Log

**Features**:

- Advanced filtering
- Pagination
- Export to CSV
- View details modal
- Retry/resend actions

---

## 8. Security Considerations

### A. Admin-Only Access

**All routes protected by**: `/apps/web/src/routes/admin/+layout.server.ts`

```typescript
export const load: LayoutServerLoad = async ({
  locals: { safeGetSession, supabase },
}) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, "/auth/login");

  const { data: dbUser } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!dbUser?.is_admin) throw redirect(303, "/");

  return { user };
};
```

**All API endpoints protected by**:

```typescript
const { user } = await safeGetSession();
if (!user?.is_admin) {
  return ApiResponse.forbidden("Admin access required");
}
```

---

### B. Test Mode Isolation

**Test notifications are flagged**:

```typescript
// In notification_events.metadata
{
  "test_mode": true,
  "test_sent_by": "admin-user-id"
}
```

**Filtering**:

- Analytics can exclude test notifications
- Logs can filter to show only test notifications
- Test history only shows test notifications

---

### C. Rate Limiting

**Prevent abuse of test bed**:

```typescript
// In /api/admin/notifications/test
const MAX_RECIPIENTS_PER_TEST = 20;
const MAX_TESTS_PER_HOUR = 50;

if (recipient_user_ids.length > MAX_RECIPIENTS_PER_TEST) {
  return ApiResponse.badRequest(
    `Maximum ${MAX_RECIPIENTS_PER_TEST} recipients allowed per test`,
  );
}

// Check admin's test count in last hour
const recentTests = await supabase
  .from("notification_events")
  .select("id", { count: "exact" })
  .eq("metadata->>test_sent_by", user.id)
  .gte("created_at", new Date(Date.now() - 3600000).toISOString());

if (recentTests.count >= MAX_TESTS_PER_HOUR) {
  return ApiResponse.badRequest(
    `Rate limit exceeded: ${MAX_TESTS_PER_HOUR} tests per hour`,
  );
}
```

---

### D. Payload Validation

**All payloads validated against Zod schemas**:

```typescript
const eventDef = EVENT_REGISTRY[event_type];
if (!eventDef) {
  return ApiResponse.badRequest(`Unknown event type: ${event_type}`);
}

try {
  eventDef.payloadSchema.parse(payload);
} catch (error) {
  return ApiResponse.badRequest(`Invalid payload: ${error.message}`);
}
```

---

## 9. Implementation Plan

### Phase 1: API Endpoints (Week 1)

**Tasks**:

- [ ] Create `/api/admin/notifications/analytics/` endpoints (6 endpoints)
- [ ] Create `/api/admin/notifications/test` endpoint
- [ ] Create `/api/admin/notifications/test/history` endpoint
- [ ] Create `/api/admin/notifications/recipients/search` endpoint
- [ ] Create `/api/admin/notifications/deliveries/[id]/retry` endpoint
- [ ] Create `/api/admin/notifications/deliveries/[id]/resend` endpoint
- [ ] Create `/api/admin/notifications/events` endpoint
- [ ] Create `/api/admin/notifications/deliveries` endpoint
- [ ] Create `/api/admin/notifications/export` endpoint

**Files**:

```
/apps/web/src/routes/api/admin/notifications/
├── analytics/
│   ├── overview/+server.ts
│   ├── channels/+server.ts
│   ├── events/+server.ts
│   ├── timeline/+server.ts
│   ├── failures/+server.ts
│   └── subscriptions/+server.ts
├── test/
│   ├── +server.ts
│   └── history/+server.ts
├── recipients/
│   └── search/+server.ts
├── deliveries/
│   ├── +server.ts
│   ├── [id]/+server.ts
│   ├── [id]/retry/+server.ts
│   └── [id]/resend/+server.ts
├── events/
│   ├── +server.ts
│   └── [id]/+server.ts
└── export/+server.ts
```

**Success Criteria**:

- All endpoints return correct data
- All endpoints have admin-only protection
- Payload validation works
- Rate limiting enforced

---

### Phase 2: Services (Week 1-2)

**Tasks**:

- [ ] Create `notification-analytics.service.ts`
- [ ] Create `notification-test.service.ts`
- [ ] Add types to `notification.types.ts`
- [ ] Write unit tests for services

**Files**:

```
/apps/web/src/lib/services/
├── notification-analytics.service.ts
└── notification-test.service.ts

/packages/shared-types/src/
└── notification.types.ts (update)
```

**Success Criteria**:

- Services properly typed
- Error handling works
- Unit tests pass

---

### Phase 3: UI Components (Week 2-3)

**Tasks**:

- [ ] Create reusable components:
  - [ ] `MetricCard.svelte`
  - [ ] `TimeframeSelector.svelte`
  - [ ] `ChannelPerformanceTable.svelte`
  - [ ] `DeliveryTimelineChart.svelte` (using Chart.js or similar)
  - [ ] `EventBreakdownTable.svelte`
  - [ ] `FailedDeliveriesTable.svelte`
  - [ ] `SubscriptionOverviewTable.svelte`
  - [ ] `EventTypeSelector.svelte`
  - [ ] `PayloadForm.svelte` (dynamic form based on Zod schema)
  - [ ] `UserSearchInput.svelte`
  - [ ] `SelectedUsersList.svelte`
  - [ ] `ChannelCheckboxes.svelte`
  - [ ] `NotificationPreviewTabs.svelte`
  - [ ] `TestHistoryTable.svelte`

**Files**:

```
/apps/web/src/lib/components/admin/notifications/
├── MetricCard.svelte
├── TimeframeSelector.svelte
├── ChannelPerformanceTable.svelte
├── DeliveryTimelineChart.svelte
├── EventBreakdownTable.svelte
├── FailedDeliveriesTable.svelte
├── SubscriptionOverviewTable.svelte
├── EventTypeSelector.svelte
├── PayloadForm.svelte
├── UserSearchInput.svelte
├── SelectedUsersList.svelte
├── ChannelCheckboxes.svelte
├── NotificationPreviewTabs.svelte
└── TestHistoryTable.svelte
```

**Success Criteria**:

- Components follow BuildOS design system
- Svelte 5 runes syntax used
- Accessible (ARIA labels, keyboard navigation)
- Responsive design

---

### Phase 4: Dashboard Page (Week 3)

**Tasks**:

- [ ] Create `/admin/notifications/+page.svelte`
- [ ] Implement overview metrics
- [ ] Implement channel performance section
- [ ] Implement timeline chart
- [ ] Implement event breakdown section
- [ ] Implement failed deliveries section
- [ ] Implement subscription overview
- [ ] Add filters and controls
- [ ] Add export functionality
- [ ] Add auto-refresh

**File**:

```
/apps/web/src/routes/admin/notifications/+page.svelte
```

**Success Criteria**:

- Page loads analytics data
- All sections render correctly
- Filters work
- Export works
- Auto-refresh works
- Performance is good (< 2s load time)

---

### Phase 5: Test Bed Page (Week 4)

**Tasks**:

- [ ] Create `/admin/notifications/test-bed/+page.svelte`
- [ ] Implement event type selection
- [ ] Implement dynamic payload form
- [ ] Implement recipient selection
- [ ] Implement channel selection
- [ ] Implement notification previews
- [ ] Implement send test notification
- [ ] Implement test history
- [ ] Add error handling and validation
- [ ] Add confirmation modal

**File**:

```
/apps/web/src/routes/admin/notifications/test-bed/+page.svelte
```

**Success Criteria**:

- Can send test notifications
- Payload validation works
- Recipient search works
- Channel availability checks work
- Previews render correctly
- Test history updates in real-time
- Error handling works

---

### Phase 6: Logs Page (Week 5)

**Tasks**:

- [ ] Create `/admin/notifications/logs/+page.svelte`
- [ ] Implement event log tab
- [ ] Implement delivery log tab
- [ ] Add advanced filters
- [ ] Add pagination
- [ ] Add view details modal
- [ ] Add retry/resend actions
- [ ] Add export functionality

**File**:

```
/apps/web/src/routes/admin/notifications/logs/+page.svelte
```

**Success Criteria**:

- Both tabs work
- Filters work correctly
- Pagination works
- Modal shows full details
- Retry/resend actions work
- Export works

---

### Phase 7: Navigation Integration (Week 5)

**Tasks**:

- [ ] Add "Notifications" card to main admin dashboard (`/admin/+page.svelte`)
- [ ] Show notification metrics on main dashboard
- [ ] Add navigation link in admin sidebar (if exists)
- [ ] Add breadcrumbs to notification pages

**Success Criteria**:

- Notifications accessible from main admin dashboard
- Navigation is intuitive
- Breadcrumbs work

---

### Phase 8: Testing & Polish (Week 6)

**Tasks**:

- [ ] Write integration tests
- [ ] Write E2E tests (Playwright)
- [ ] Test with real notification data
- [ ] Performance testing (load time, query speed)
- [ ] Accessibility audit (WAVE, axe DevTools)
- [ ] Mobile responsive testing
- [ ] Browser compatibility testing
- [ ] Security audit
- [ ] Documentation

**Success Criteria**:

- All tests pass
- Performance meets targets
- Accessibility score > 95
- Works on all major browsers
- Mobile-friendly
- Security review passed
- Documentation complete

---

## 10. Testing Strategy

### A. Unit Tests

**Services**:

```typescript
// notification-analytics.service.test.ts
describe("NotificationAnalyticsService", () => {
  test("getOverview returns analytics data", async () => {
    const overview = await notificationAnalyticsService.getOverview("7d");
    expect(overview).toHaveProperty("total_sent");
    expect(overview).toHaveProperty("delivery_success_rate");
  });

  test("getChannelPerformance returns channel metrics", async () => {
    const metrics =
      await notificationAnalyticsService.getChannelPerformance("7d");
    expect(metrics).toBeInstanceOf(Array);
    expect(metrics[0]).toHaveProperty("channel");
    expect(metrics[0]).toHaveProperty("success_rate");
  });
});
```

**Components**:

```typescript
// MetricCard.test.ts
import { render } from "@testing-library/svelte";
import MetricCard from "./MetricCard.svelte";

test("renders metric value", () => {
  const { getByText } = render(MetricCard, {
    title: "Total Sent",
    value: 1234,
    trend: 12.5,
  });

  expect(getByText("1234")).toBeInTheDocument();
  expect(getByText("↑ 12.5%")).toBeInTheDocument();
});
```

---

### B. Integration Tests

**API Endpoints**:

```typescript
// notification-analytics-api.test.ts
describe("GET /api/admin/notifications/analytics/overview", () => {
  test("returns 401 for non-authenticated users", async () => {
    const response = await fetch("/api/admin/notifications/analytics/overview");
    expect(response.status).toBe(401);
  });

  test("returns 403 for non-admin users", async () => {
    const response = await authenticatedFetch(
      "/api/admin/notifications/analytics/overview",
      regularUser,
    );
    expect(response.status).toBe(403);
  });

  test("returns analytics data for admin users", async () => {
    const response = await authenticatedFetch(
      "/api/admin/notifications/analytics/overview",
      adminUser,
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("total_sent");
    expect(data).toHaveProperty("delivery_success_rate");
  });
});
```

---

### C. E2E Tests

**Playwright**:

```typescript
// notification-dashboard.e2e.ts
import { test, expect } from "@playwright/test";

test("admin can view notification analytics", async ({ page }) => {
  // Login as admin
  await page.goto("/auth/login");
  await page.fill('input[type="email"]', "admin@build-os.com");
  await page.fill('input[type="password"]', "password");
  await page.click('button[type="submit"]');

  // Navigate to notifications dashboard
  await page.goto("/admin/notifications");

  // Check overview metrics are visible
  await expect(page.locator("text=Total Sent (24h)")).toBeVisible();
  await expect(page.locator("text=Delivery Success Rate")).toBeVisible();

  // Check chart is rendered
  await expect(page.locator("canvas")).toBeVisible();

  // Check table is rendered
  await expect(page.locator("table")).toBeVisible();
});

test("admin can send test notification", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/notifications/test-bed");

  // Select event type
  await page.selectOption('select[name="event_type"]', "user.signup");

  // Fill payload
  await page.fill('input[name="user_email"]', "test@example.com");
  await page.click('input[value="email"]'); // signup method

  // Select recipient
  await page.fill('input[placeholder="Search users..."]', "admin");
  await page.click("text=admin@build-os.com");

  // Select channels
  await page.check('input[name="channel_push"]');
  await page.check('input[name="channel_email"]');

  // Send test
  await page.click('button:has-text("Send Test Notification")');

  // Confirm modal
  await page.click('button:has-text("Send Test Notification")'); // in modal

  // Check success toast
  await expect(page.locator("text=Test notification sent")).toBeVisible();
});
```

---

## 11. Code References

**Notification System Design Spec**:

- `docs/architecture/EXTENSIBLE-NOTIFICATION-SYSTEM-DESIGN.md`

**Existing Admin Infrastructure**:

- `apps/web/src/routes/admin/+layout.server.ts` - Admin route protection
- `apps/web/src/routes/admin/+page.svelte` - Main admin dashboard
- `apps/web/src/routes/api/admin/analytics/` - Analytics endpoints pattern

**Notification Infrastructure**:

- `apps/web/supabase/migrations/20251006_notification_system_phase1.sql` - Database schema
- `apps/worker/src/workers/notification/notificationWorker.ts` - Delivery worker
- `apps/web/src/lib/services/notification-preferences.service.ts` - Preferences service
- `apps/web/src/lib/services/browser-push.service.ts` - Push service
- `packages/shared-types/src/notification.types.ts` - Type definitions

**Relevant Database Tables**:

- `notification_events` - Event log
- `notification_deliveries` - Delivery tracking
- `notification_subscriptions` - User subscriptions
- `user_notification_preferences` - Channel preferences
- `push_subscriptions` - Push subscriptions
- `users` - User data with `is_admin` flag

---

## Open Questions

1. **Chart Library**: Which charting library should we use?
   - Recommendation: Chart.js (lightweight, good documentation)
   - Alternative: Recharts (React-based, might need adapter for Svelte)

2. **Real-time Updates**: Should analytics auto-update without refresh?
   - Recommendation: Yes, using Supabase Realtime for `notification_deliveries` table
   - Alternative: Polling every 30s (simpler, less real-time)

3. **Export Limits**: Should we limit export size?
   - Recommendation: Yes, max 10,000 records per export
   - Provide date range filtering to narrow results

4. **Notification Previews**: How detailed should previews be?
   - Recommendation: Show exact rendering for push/email, mockup for in-app
   - Use iframes for email previews to isolate styles

5. **Test Mode Flag**: Should test notifications be visually distinct?
   - Recommendation: Yes, add "TEST" badge in notification title
   - Example: "🧪 TEST: New user signup"

---

## Summary

This specification provides a comprehensive blueprint for building an **Admin Notification Dashboard** with:

✅ **Analytics Dashboard** - Real-time metrics, charts, and performance monitoring
✅ **Test Bed** - Interactive notification testing across all channels
✅ **Event Logs** - Comprehensive event and delivery logging
✅ **Delivery Management** - Retry/resend failed notifications
✅ **Security** - Admin-only access with rate limiting
✅ **Extensibility** - Leverages existing infrastructure, no new tables required

**Estimated Timeline**: 6 weeks (1 developer)
**Estimated Effort**: 120-160 hours total development time

**Next Steps**:

1. Review and approve specification
2. Create GitHub issues/tickets for each phase
3. Begin Phase 1 (API Endpoints)
4. Iterate based on feedback

---

## Related Documentation

- [Extensible Notification System Design](/docs/architecture/EXTENSIBLE-NOTIFICATION-SYSTEM-DESIGN.md)
- [SMS Notification Channel Design](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md) ⭐ NEW
- [Admin System Research](/thoughts/shared/research/2025-10-06_05-00-00_admin-routes-research.md)
- [Notification Implementation Status](/thoughts/shared/research/2025-10-06_04-00-00_notification-system-implementation-status.md)
- [User Management Research](/thoughts/shared/research/2025-10-06_05-00-00_user-admin-management-research.md)
- [Web-Worker Architecture](/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md)
- [Queue System Flow](/docs/architecture/diagrams/QUEUE-SYSTEM-FLOW.md)
