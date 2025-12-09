<!-- docs/architecture/NOTIFICATION_TRACKING_SYSTEM.md -->

# Notification Tracking System Architecture

**Status**: Phase 1 Partially Complete
**Last Updated**: 2025-10-06
**Implementation Approach**: Hybrid (Minimal Fix → Email Click Tracking → Unified API)

## Overview

The BuildOS notification tracking system provides unified analytics across all notification channels (email, SMS, push, in-app). This document describes the current architecture and implementation status.

## Quick Links

- **Research Spec**: [`/thoughts/shared/research/2025-10-06_22-08-35_notification-tracking-system-spec.md`](/thoughts/shared/research/2025-10-06_22-08-35_notification-tracking-system-spec.md)
- **Implementation Assessment**: [`/thoughts/shared/research/2025-10-06_22-45-00_email-tracking-reuse-assessment.md`](/thoughts/shared/research/2025-10-06_22-45-00_email-tracking-reuse-assessment.md)
- **Email System Docs**: [`/apps/web/docs/technical/architecture/email-system.md`](/apps/web/docs/technical/architecture/email-system.md)
- **SMS Design**: [`/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md`](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md)

## ✅ Implementation Status

### Phase 1: Email Tracking (PARTIALLY COMPLETE)

#### ✅ Implemented (2025-10-06)

1. **Email Open Tracking**
    - Existing tracking pixel connected to `notification_deliveries`
    - Opens update both `email_recipients` AND `notification_deliveries`
    - Status set to 'opened'

2. **Email Click Tracking**
    - New click redirect endpoint created
    - All email links automatically rewritten
    - Clicks update both systems
    - Click implies open logic
    - Status set to 'clicked'

3. **TypeScript Fixes**
    - SMS adapter type errors resolved
    - Full compilation verification

#### ⏳ Pending

- User testing and dashboard verification
- Unified tracking API (deferred to Week 2+)

### Phase 2-5: Other Channels (NOT STARTED)

- Push notification click tracking
- SMS click tracking (requires link shortener)
- In-app notification tracking

## Architecture

### Current System (Phase 1)

```
┌─────────────────────────────────────────────────────────┐
│                    Email Channels                       │
├─────────────────────────────────────────────────────────┤
│  Daily Briefs   Admin Emails   Notification Emails      │
│                                                          │
│  emailAdapter.ts      email-service.ts                  │
│  (worker)             (web app)                         │
└────────────┬──────────────────┬─────────────────────────┘
             │                  │
             └────────┬─────────┘
                      │
                      v
         ┌────────────────────────┐
         │   Email with Tracking  │
         │                        │
         │  • Tracking pixel      │
         │  • Rewritten links     │
         │  • template_data       │
         └────────────┬───────────┘
                      │
          ┌───────────┴────────────┐
          │                        │
          v                        v
    User Opens              User Clicks Link
    Email                   in Email
          │                        │
          v                        v
    /api/email-tracking/     /api/email-tracking/
    [tracking_id]            [tracking_id]/click
          │                        │
          └───────────┬────────────┘
                      │
                      v
         ┌────────────────────────┐
         │   Dual Update System   │
         ├────────────────────────┤
         │ 1. email_recipients    │
         │    - opened_at         │
         │    - clicked_at        │
         │    - open_count        │
         │                        │
         │ 2. notification_       │
         │    deliveries          │
         │    - opened_at         │
         │    - clicked_at        │
         │    - status            │
         └────────────┬───────────┘
                      │
                      v
         ┌────────────────────────┐
         │  Analytics Dashboard   │
         │  /admin/notifications  │
         │                        │
         │  • Open rates          │
         │  • Click rates         │
         │  • Channel performance │
         └────────────────────────┘
```

### Future System (Phase 2+)

```
┌──────────────────────────────────────────────────────────┐
│           Notification Channels (All Types)              │
├────────┬────────┬────────┬──────────────────────────────┤
│ Email  │  Push  │  SMS   │  In-App                      │
└────┬───┴───┬────┴───┬────┴───┬──────────────────────────┘
     │       │        │        │
     └───────┴────────┴────────┘
                 │
                 v
   ┌─────────────────────────────┐
   │   Unified Tracking API      │
   │                             │
   │  POST /api/notification-    │
   │       tracking/open/:id     │
   │                             │
   │  POST /api/notification-    │
   │       tracking/click/:id    │
   └──────────────┬──────────────┘
                  │
                  v
   ┌─────────────────────────────┐
   │  notification_deliveries    │
   │  (Single Source of Truth)   │
   └─────────────────────────────┘
```

## Database Schema

### Core Tables

#### `notification_deliveries`

Single source of truth for all notification tracking:

```sql
CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES notification_events(id),
  recipient_user_id UUID REFERENCES users(id),
  channel TEXT NOT NULL, -- 'email', 'sms', 'push', 'in_app'
  channel_identifier TEXT, -- email address, phone, device token, etc.

  -- Status tracking
  status TEXT NOT NULL, -- 'pending', 'sent', 'opened', 'clicked', 'failed'

  -- Timing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,      -- ✅ Now populated for email
  clicked_at TIMESTAMPTZ,     -- ✅ Now populated for email
  failed_at TIMESTAMPTZ,

  -- External references
  external_id TEXT,            -- Links to emails.id, sms_messages.id, etc.
  tracking_id TEXT,            -- For direct tracking lookups

  -- Metadata
  payload JSONB NOT NULL,
  error_message TEXT,
  tracking_metadata JSONB      -- Future: user_agent, IP, etc.
);
```

#### Email-Specific Tables

**`emails`** - Email message records:

```sql
CREATE TABLE emails (
  id UUID PRIMARY KEY,
  tracking_id TEXT UNIQUE,     -- UUID for tracking pixel
  tracking_enabled BOOLEAN,
  template_data JSONB,         -- Contains delivery_id link!
  -- ... other fields
);
```

**`email_recipients`** - Per-recipient tracking:

```sql
CREATE TABLE email_recipients (
  id UUID PRIMARY KEY,
  email_id UUID REFERENCES emails(id),
  opened_at TIMESTAMPTZ,       -- ✅ Updated by tracking pixel
  clicked_at TIMESTAMPTZ,      -- ✅ Updated by click tracking
  open_count INTEGER,
  last_opened_at TIMESTAMPTZ,
  -- ... other fields
);
```

**`email_tracking_events`** - Granular event log:

```sql
CREATE TABLE email_tracking_events (
  id UUID PRIMARY KEY,
  email_id UUID REFERENCES emails(id),
  recipient_id UUID REFERENCES email_recipients(id),
  event_type TEXT NOT NULL,    -- 'sent', 'opened', 'clicked', 'failed'
  event_data JSONB,
  user_agent TEXT,
  ip_address TEXT,
  clicked_url TEXT,            -- For click events
  created_at TIMESTAMPTZ
);
```

### Table Relationships

```
notification_deliveries
├─ external_id → emails.id
└─ (linked via emails.template_data.delivery_id)

emails
├─ tracking_id (for pixel/click tracking)
└─ template_data.delivery_id → notification_deliveries.id

email_recipients
└─ email_id → emails.id

email_tracking_events
├─ email_id → emails.id
└─ recipient_id → email_recipients.id
```

## Email Tracking Implementation

### Open Tracking Flow

1. **Email Generation** (emailAdapter.ts or email-service.ts):

    ```typescript
    const trackingId = crypto.randomUUID();
    const trackingPixel = `<img src="${baseUrl}/api/email-tracking/${trackingId}" width="1" height="1" />`;

    // Store delivery_id in template_data
    template_data: {
      delivery_id: delivery.id,  // Links to notification_deliveries
      event_id: delivery.event_id,
      event_type: delivery.payload.event_type,
    }
    ```

2. **User Opens Email** → Email client loads tracking pixel

3. **Tracking Endpoint** (`/api/email-tracking/[tracking_id]/+server.ts`):

    ```typescript
    // Find email by tracking_id
    const { data: email } = await supabase
    	.from('emails')
    	.select('id, template_data, email_recipients(*)')
    	.eq('tracking_id', tracking_id)
    	.single();

    // Update email_recipients
    await supabase
    	.from('email_recipients')
    	.update({
    		opened_at: recipient.opened_at || now,
    		open_count: (recipient.open_count || 0) + 1,
    		last_opened_at: now
    	})
    	.eq('id', recipient.id);

    // ✅ NEW: Update notification_deliveries
    const deliveryId = email.template_data?.delivery_id;
    if (deliveryId) {
    	await supabase
    		.from('notification_deliveries')
    		.update({
    			opened_at: now,
    			status: 'opened'
    		})
    		.eq('id', deliveryId)
    		.is('opened_at', null); // Only first open
    }

    // Return tracking pixel
    return new Response(transparentPixelBuffer, {
    	headers: { 'Content-Type': 'image/png' }
    });
    ```

### Click Tracking Flow

1. **Link Rewriting** (email-service.ts / emailAdapter.ts):

    ```typescript
    function rewriteLinksForTracking(html: string, trackingId: string): string {
    	return html.replace(
    		/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    		(match, before, url, after) => {
    			// Skip already-tracked or anchor links
    			if (url.startsWith('#') || url.includes('/api/email-tracking/')) {
    				return match;
    			}

    			const encodedUrl = encodeURIComponent(url);
    			const trackingUrl = `${baseUrl}/api/email-tracking/${trackingId}/click?url=${encodedUrl}`;
    			return `<a ${before}href="${trackingUrl}"${after}>`;
    		}
    	);
    }
    ```

2. **User Clicks Link** → Browser requests tracking URL

3. **Click Tracking Endpoint** (`/api/email-tracking/[tracking_id]/click/+server.ts`):

    ```typescript
    const tracking_id = params.tracking_id;
    const destination = url.searchParams.get('url');

    // Find email
    const { data: email } = await supabase
    	.from('emails')
    	.select('id, template_data, email_recipients(*)')
    	.eq('tracking_id', tracking_id)
    	.single();

    // Update email_recipients.clicked_at
    for (const recipient of email.email_recipients) {
    	await supabase
    		.from('email_recipients')
    		.update({ clicked_at: recipient.clicked_at || now })
    		.eq('id', recipient.id);

    	// Log tracking event
    	await supabase.from('email_tracking_events').insert({
    		email_id: email.id,
    		recipient_id: recipient.id,
    		event_type: 'clicked',
    		event_data: { is_first_click: !recipient.clicked_at },
    		clicked_url: destination
    	});
    }

    // ✅ Update notification_deliveries
    const deliveryId = email.template_data?.delivery_id;
    if (deliveryId) {
    	const { data: delivery } = await supabase
    		.from('notification_deliveries')
    		.select('clicked_at, opened_at')
    		.eq('id', deliveryId)
    		.single();

    	const updates: any = { status: 'clicked' };
    	if (!delivery.clicked_at) updates.clicked_at = now;
    	if (!delivery.opened_at) updates.opened_at = now; // Click implies open

    	await supabase.from('notification_deliveries').update(updates).eq('id', deliveryId);
    }

    // Redirect to destination
    throw redirect(302, destination);
    ```

## Analytics Integration

### Admin Dashboard

**Location**: `/admin/notifications`

**RPC Functions** (`20251006_notification_analytics_rpc_functions.sql`):

```sql
-- Channel performance
CREATE FUNCTION get_notification_channel_performance(
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (...) AS $$
BEGIN
  RETURN QUERY
  SELECT
    nd.channel,
    COUNT(*) as total_sent,
    COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL) AS opened,  -- ✅ Now works!
    COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL) AS clicked, -- ✅ Now works!
    ROUND(
      (COUNT(*) FILTER (WHERE nd.opened_at IS NOT NULL)::NUMERIC
       / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS open_rate,
    ROUND(
      (COUNT(*) FILTER (WHERE nd.clicked_at IS NOT NULL)::NUMERIC
       / NULLIF(COUNT(*) FILTER (WHERE nd.status = 'sent')::NUMERIC, 0) * 100),
      2
    ) AS click_rate
  FROM notification_deliveries nd
  WHERE nd.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY nd.channel;
END;
$$ LANGUAGE plpgsql;
```

### Expected Metrics

Once user testing confirms tracking works:

**Email**:

- Open Rate: 15-30% (industry standard)
- Click Rate: 2-10%

**Push** (Phase 2):

- Open Rate: 60-90%
- Click Rate: 10-30%

**SMS** (Phase 3):

- Open Rate: N/A (SMS doesn't support open tracking)
- Click Rate: 10-20% (if contains links)

**In-App** (Phase 4):

- View Rate: >90%
- Click Rate: 20-40%

## Testing

### Manual Testing Checklist

- [ ] Send test notification email
- [ ] Verify tracking pixel loads (check network tab)
- [ ] Verify `email_recipients.opened_at` updated
- [ ] Verify `notification_deliveries.opened_at` updated
- [ ] Click link in email
- [ ] Verify redirect works
- [ ] Verify `email_recipients.clicked_at` updated
- [ ] Verify `notification_deliveries.clicked_at` updated
- [ ] Check admin dashboard shows correct metrics
- [ ] Verify `email_tracking_events` logged correctly

### SQL Verification Queries

```sql
-- Check email and notification tracking sync
SELECT
  e.id as email_id,
  e.tracking_id,
  er.opened_at as email_opened,
  er.clicked_at as email_clicked,
  nd.opened_at as notif_opened,
  nd.clicked_at as notif_clicked,
  nd.status as notif_status
FROM emails e
LEFT JOIN email_recipients er ON er.email_id = e.id
LEFT JOIN notification_deliveries nd ON (e.template_data->>'delivery_id')::uuid = nd.id
WHERE e.tracking_enabled = true
ORDER BY e.created_at DESC
LIMIT 10;

-- Check tracking events
SELECT
  event_type,
  COUNT(*) as count,
  MAX(created_at) as last_event
FROM email_tracking_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY count DESC;

-- Verify notification delivery tracking
SELECT
  channel,
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opened,
  COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked
FROM notification_deliveries
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY channel, status
ORDER BY channel, status;
```

## Implementation Files

### Email Tracking Endpoints

**Open Tracking**:

- `apps/web/src/routes/api/email-tracking/[tracking_id]/+server.ts`

**Click Tracking**:

- `apps/web/src/routes/api/email-tracking/[tracking_id]/click/+server.ts` (NEW)

### Email Services

**Web App**:

- `apps/web/src/lib/services/email-service.ts`
    - `rewriteLinksForTracking()` method
    - `composeHtmlBody()` - adds tracking pixel and rewrites links

**Worker**:

- `apps/worker/src/workers/notification/emailAdapter.ts`
    - `rewriteLinksForTracking()` function
    - `sendEmailNotification()` - creates email with tracking

### Analytics

**RPC Functions**:

- `apps/web/supabase/migrations/20251006_notification_analytics_rpc_functions.sql`

**Frontend Service**:

- `apps/web/src/lib/services/notification-analytics.service.ts`

**API Endpoint**:

- `apps/web/src/routes/api/admin/notifications/analytics/channels/+server.ts`

**Dashboard UI**:

- `apps/web/src/routes/admin/notifications/+page.svelte`

## Future Work

### Phase 2: Push Notifications (Week 2)

- Update service worker with click tracking
- Add `deliveryId` to push notification payload
- Track clicks via unified API
- Test across browsers

### Phase 3: SMS Click Tracking (Week 2-3)

- Build link shortener service
- Create `notification_tracking_links` table
- Implement `/l/:short_code` redirect endpoint
- Update SMS adapter to rewrite URLs

### Phase 4: In-App Tracking (Week 3)

- Add tracking to notification components
- Track view when notification appears
- Track click on user interaction
- Update dashboard

### Phase 5: Unified Tracking API (Week 3-4)

- Create `POST /api/notification-tracking/open/:delivery_id`
- Create `POST /api/notification-tracking/click/:delivery_id`
- Migrate email tracking to use unified API
- Add tests and documentation

### Phase 6: Analytics & Reporting (Week 4)

- Tracking trends over time
- Channel comparison reports
- Event-specific performance
- Data export functionality

## Privacy & Compliance

### What We Track

- ✅ Timestamp of opens/clicks
- ✅ Channel used
- ✅ User agent (optional, for debugging)
- ✅ Event type and metadata

### What We DON'T Track

- ❌ IP addresses (stored only temporarily, not in analytics)
- ❌ Location data
- ❌ Cross-site tracking
- ❌ Third-party cookies

### GDPR Compliance

- User data tied to account (can be deleted)
- No third-party tracking
- Future: Opt-out mechanism in settings
- Data retention: 90 days for raw tracking data, indefinite for aggregated metrics

## References

- **Spec**: [`/thoughts/shared/research/2025-10-06_22-08-35_notification-tracking-system-spec.md`](/thoughts/shared/research/2025-10-06_22-08-35_notification-tracking-system-spec.md)
- **Assessment**: [`/thoughts/shared/research/2025-10-06_22-45-00_email-tracking-reuse-assessment.md`](/thoughts/shared/research/2025-10-06_22-45-00_email-tracking-reuse-assessment.md)
- **Email System**: [`/apps/web/docs/technical/architecture/email-system.md`](/apps/web/docs/technical/architecture/email-system.md)
- **SMS Design**: [`/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md`](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md)
