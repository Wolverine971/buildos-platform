---
date: 2025-10-07T00:00:00+0000
researcher: Claude (AI Assistant)
git_commit: TBD
branch: main
repository: buildos-platform
topic: 'Phase 3: SMS Click Tracking - Implementation Plan'
tags: [plan, notifications, tracking, sms, link-shortener, phase3]
status: planning
implementation_status: phase_3_not_started
last_updated: 2025-10-07
last_updated_by: Claude (AI Assistant)
related_spec: thoughts/shared/research/2025-10-06_22-08-35_notification-tracking-system-spec.md
path: thoughts/shared/research/2025-10-07_00-00-00_phase3-sms-click-tracking-plan.md
---

# Phase 3: SMS Click Tracking - Implementation Plan

**Date**: 2025-10-07T00:00:00+0000
**Status**: 📋 PLANNING
**Prerequisites**: Phase 2 Complete ✅

---

## Goal

Enable click tracking for links in SMS messages using a custom link shortener.

**Why Custom Link Shortener?**

- Privacy: Full control over tracking data
- Cost: No third-party service fees ($0 vs $29-299/mo)
- Simplicity: Reuses existing tracking API
- Character savings: SMS has 160 character limit

---

## Architecture Overview

```
SMS Message Sent
    ↓
"Your brief is ready! https://build-os.com/app/briefs/today"
    ↓
SMS Adapter rewrites URLs
    ↓
"Your brief is ready! https://build-os.com/l/abc123"
    ↓
User clicks link
    ↓
GET /l/abc123
    ↓
1. Look up short_code in notification_tracking_links
2. Update notification_deliveries.clicked_at
3. Update tracking_links.click_count
4. Redirect to destination URL
    ↓
User lands on https://build-os.com/app/briefs/today
```

---

## Implementation Tasks

### 1. Database Migration

**Create**: `notification_tracking_links` table

```sql
CREATE TABLE IF NOT EXISTS notification_tracking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code TEXT UNIQUE NOT NULL,  -- e.g., 'abc123'
  delivery_id UUID NOT NULL REFERENCES notification_deliveries(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  first_clicked_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ,
  click_count INTEGER DEFAULT 0,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_tracking_links_short_code ON notification_tracking_links(short_code);
CREATE INDEX idx_tracking_links_delivery_id ON notification_tracking_links(delivery_id);
CREATE INDEX idx_tracking_links_created ON notification_tracking_links(created_at DESC);
```

**Helper Functions**:

```sql
-- Generate random 6-character code
CREATE OR REPLACE FUNCTION generate_short_code(length INTEGER DEFAULT 6)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Create tracking link with unique short code
CREATE OR REPLACE FUNCTION create_tracking_link(
  p_delivery_id UUID,
  p_destination_url TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_short_code TEXT;
  v_max_attempts INTEGER := 10;
  v_attempt INTEGER := 0;
BEGIN
  LOOP
    v_short_code := generate_short_code(6);

    BEGIN
      INSERT INTO notification_tracking_links (
        short_code,
        delivery_id,
        destination_url
      ) VALUES (
        v_short_code,
        p_delivery_id,
        p_destination_url
      );

      RETURN v_short_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempt := v_attempt + 1;
      IF v_attempt >= v_max_attempts THEN
        RAISE EXCEPTION 'Failed to generate unique short code after % attempts', v_max_attempts;
      END IF;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

**File**: `apps/web/supabase/migrations/YYYYMMDD_notification_tracking_links.sql`

---

### 2. Link Shortener API Endpoint

**Create**: `apps/web/src/routes/l/[short_code]/+server.ts`

**Purpose**: Redirect short links and track clicks

**Flow**:

1. Look up `short_code` in `notification_tracking_links`
2. Update tracking timestamps and counts
3. Call unified tracking API to update `notification_deliveries`
4. Redirect to destination URL

**Implementation**:

```typescript
// apps/web/src/routes/l/[short_code]/+server.ts
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals: { supabase } }) => {
	const { short_code } = params;

	try {
		// Look up tracking link
		const { data: link, error: linkError } = await supabase
			.from('notification_tracking_links')
			.select('*')
			.eq('short_code', short_code)
			.single();

		if (linkError || !link) {
			// Link not found - redirect to home
			throw redirect(302, '/');
		}

		const now = new Date().toISOString();

		// Update tracking link stats
		await supabase
			.from('notification_tracking_links')
			.update({
				first_clicked_at: link.first_clicked_at || now,
				last_clicked_at: now,
				click_count: (link.click_count || 0) + 1
			})
			.eq('id', link.id);

		// Update notification delivery (via unified tracking API)
		if (link.delivery_id) {
			await supabase
				.from('notification_deliveries')
				.update({
					clicked_at: link.first_clicked_at || now,
					opened_at: link.first_clicked_at || now, // Click implies open for SMS
					status: 'clicked'
				})
				.eq('id', link.delivery_id)
				.is('clicked_at', null); // Only update if not already clicked
		}

		// Redirect to destination
		throw redirect(302, link.destination_url);
	} catch (error) {
		// If it's a redirect, let it through
		if (error instanceof Response && error.status === 302) {
			throw error;
		}

		// Otherwise redirect to home
		console.error('[LinkShortener] Error:', error);
		throw redirect(302, '/');
	}
};
```

---

### 3. Link Shortener Service

**Create**: `apps/web/src/lib/services/link-shortener.service.ts`

**Purpose**: Create tracking links for SMS adapter

```typescript
import { createSupabaseBrowser } from '@buildos/supabase-client';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

class LinkShortenerService {
	private supabase = createSupabaseBrowser(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
	private baseUrl = 'https://build-os.com'; // Or get from env

	/**
	 * Create a shortened tracking link
	 */
	async createTrackingLink(deliveryId: string, destinationUrl: string): Promise<string> {
		// Call database function to create link with unique short code
		const { data: shortCode, error } = await this.supabase.rpc('create_tracking_link', {
			p_delivery_id: deliveryId,
			p_destination_url: destinationUrl
		});

		if (error) {
			console.error('[LinkShortener] Failed to create tracking link:', error);
			throw error;
		}

		return `${this.baseUrl}/l/${shortCode}`;
	}

	/**
	 * Extract and shorten all URLs in text
	 */
	async shortenUrlsInText(text: string, deliveryId: string): Promise<string> {
		// Regex to find URLs
		const urlRegex = /(https?:\/\/[^\s]+)/g;
		const urls = text.match(urlRegex) || [];

		let result = text;

		for (const url of urls) {
			const shortUrl = await this.createTrackingLink(deliveryId, url);
			result = result.replace(url, shortUrl);
		}

		return result;
	}
}

export const linkShortenerService = new LinkShortenerService();
```

---

### 4. Update SMS Adapter

**Modify**: `apps/worker/src/workers/notification/smsAdapter.ts`

**Add URL rewriting before sending SMS**:

```typescript
// In sendSMSNotification function, before sending via Twilio

import { linkShortenerService } from './link-shortener.service';

// Rewrite URLs in message body
let messageBody = delivery.payload.body || delivery.payload.message;

if (messageBody && messageBody.match(/(https?:\/\/[^\s]+)/)) {
	try {
		messageBody = await linkShortenerService.shortenUrlsInText(messageBody, delivery.id);
	} catch (error) {
		console.error('[SMS] Failed to shorten URLs:', error);
		// Continue with original URLs if shortening fails
	}
}

// Send via Twilio with rewritten URLs
await twilioClient.messages.create({
	to: delivery.channel_identifier,
	from: TWILIO_PHONE_NUMBER,
	body: messageBody
});
```

---

### 5. RLS Policies

**Add Row Level Security policies**:

```sql
-- notification_tracking_links: Public read (for redirect), service write
ALTER TABLE notification_tracking_links ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read tracking links (needed for redirect)
CREATE POLICY "Anyone can read tracking links" ON notification_tracking_links
  FOR SELECT
  USING (true);

-- Only service role can create/update tracking links
CREATE POLICY "Service role can manage tracking links" ON notification_tracking_links
  FOR ALL
  USING (auth.role() = 'service_role');
```

---

## Testing Strategy

### Unit Tests

**Link Shortener Service**:

```typescript
describe('LinkShortenerService', () => {
	test('creates unique short codes', async () => {
		const link1 = await service.createTrackingLink(deliveryId, 'https://example.com');
		const link2 = await service.createTrackingLink(deliveryId, 'https://example.com');

		expect(link1).not.toBe(link2);
	});

	test('rewrites URLs in text', async () => {
		const text = 'Check this out: https://build-os.com/app/briefs/today';
		const result = await service.shortenUrlsInText(text, deliveryId);

		expect(result).toMatch(/Check this out: https:\/\/build-os\.com\/l\/[a-zA-Z0-9]{6}/);
	});
});
```

**Redirect Endpoint**:

```typescript
describe('GET /l/[short_code]', () => {
	test('redirects to destination URL', async () => {
		// Create test link
		const { data } = await supabase.rpc('create_tracking_link', {
			p_delivery_id: deliveryId,
			p_destination_url: 'https://example.com'
		});

		// Visit short link
		const response = await fetch(`/l/${data}`);

		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('https://example.com');
	});

	test('updates click counts', async () => {
		const shortCode = 'test123';
		await fetch(`/l/${shortCode}`);

		const { data: link } = await supabase
			.from('notification_tracking_links')
			.select('click_count, first_clicked_at')
			.eq('short_code', shortCode)
			.single();

		expect(link.click_count).toBe(1);
		expect(link.first_clicked_at).toBeTruthy();
	});
});
```

### Manual Testing

1. **Send Test SMS**:

    ```bash
    curl -X POST http://localhost:5173/api/admin/notifications/test \
      -H "Content-Type: application/json" \
      -d '{
        "event_type": "brief.completed",
        "payload": {
          "title": "Your Brief is Ready",
          "body": "View it here: https://build-os.com/app/briefs/today",
          "action_url": "https://build-os.com/app/briefs/today"
        },
        "recipient_user_ids": ["<user-id>"],
        "channels": ["sms"]
      }'
    ```

2. **Check SMS received**:
    - Message should contain `https://build-os.com/l/abc123` (not full URL)
    - Character count should be reduced

3. **Click the link**:
    - Should redirect to full URL
    - Should land on correct page

4. **Verify tracking**:

    ```sql
    -- Check tracking link stats
    SELECT short_code, click_count, first_clicked_at, destination_url
    FROM notification_tracking_links
    ORDER BY created_at DESC
    LIMIT 1;

    -- Check notification delivery
    SELECT clicked_at, opened_at, status
    FROM notification_deliveries
    WHERE id = '<delivery-id>';
    ```

---

## Success Criteria

- [ ] Database migration runs successfully
- [ ] Short codes are unique (6 characters, base62)
- [ ] SMS messages contain shortened URLs
- [ ] Clicking shortened URL redirects correctly
- [ ] Click tracking updates `notification_deliveries`
- [ ] Click count increments in `notification_tracking_links`
- [ ] Character count reduced (important for SMS limits)
- [ ] RLS policies prevent unauthorized access
- [ ] Tests pass
- [ ] Works on iOS and Android

---

## Estimated Effort

- Database migration: 30 mins
- Link shortener endpoint: 1 hour
- Link shortener service: 1 hour
- SMS adapter integration: 1 hour
- Testing & debugging: 1.5 hours
- Documentation: 30 mins

**Total**: ~5-6 hours

---

## Files to Create/Modify

**New Files**:

- `apps/web/supabase/migrations/YYYYMMDD_notification_tracking_links.sql`
- `apps/web/src/routes/l/[short_code]/+server.ts`
- `apps/web/src/lib/services/link-shortener.service.ts`
- `apps/web/tests/manual/test-sms-click-tracking.md`

**Modified Files**:

- `apps/worker/src/workers/notification/smsAdapter.ts`

---

## Next Phase

**Phase 4**: In-App Tracking

- Track when notifications appear in UI
- Track when users click in-app notifications
- Simplest phase (no external services needed)

---

## Questions to Answer

1. **URL character limit**: What's the max URL length we need to support?
2. **Short code collision**: 6 chars = 62^6 = ~57 billion combinations. Sufficient?
3. **Link expiration**: Should tracking links expire? (e.g., 30 days)
4. **Multiple URLs in SMS**: Shorten all or just primary CTA?
5. **Analytics**: Do we need separate analytics for link clicks vs delivery clicks?

---

**Document Status**: Planning Complete
**Ready to Implement**: Yes
**Blockers**: None - Phase 2 complete, all prerequisites met
