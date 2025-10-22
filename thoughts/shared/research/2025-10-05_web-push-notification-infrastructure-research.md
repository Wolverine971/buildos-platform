---
title: 'Web Push Notification Infrastructure Research'
date: 2025-10-05
type: research
tags: [notifications, web-push, infrastructure, pwa, backend]
status: complete
---

# Web Push Notification Infrastructure Research

**Date:** 2025-10-05
**Researcher:** Claude (Agent)
**Type:** Read-only infrastructure assessment
**Objective:** Identify existing push notification setup, backend capabilities, and infrastructure requirements

---

## Executive Summary

**Current State:** BuildOS has **NO web push notification infrastructure** currently implemented. The system has:

- ✅ **In-app notification system** (UI-based, stackable, fully implemented)
- ✅ **Email notifications** (daily briefs via worker service)
- ✅ **SMS notifications** (Twilio integration with preferences)
- ❌ **NO web push notifications** (VAPID keys, service worker, push subscriptions)

**Key Finding:** The existing notification system is UI-only and relies on the user having the app open. There is no capability to send push notifications when the app is closed or in the background.

---

## 1. Current Notification Infrastructure

### 1.1 In-App Notification System ✅

**Location:** `/apps/web/src/lib/components/notifications/`

**Implementation Status:** Phase 1 & 2 Complete

**Architecture:**

```typescript
// Centralized store-based notification system
Store: notification.store.ts
  ├── Types: notification.types.ts
  ├── Components:
  │   ├── NotificationStackManager.svelte (orchestrator)
  │   ├── NotificationStack.svelte (bottom-right stack)
  │   ├── NotificationModal.svelte (expanded view)
  │   └── MinimizedNotification.svelte (minimized cards)
  └── Bridges:
      ├── brain-dump-notification.bridge.ts
      ├── phase-generation-notification.bridge.ts
      └── calendar-analysis-notification.bridge.ts
```

**Key Features:**

- Stackable notifications (max 5 visible)
- Modal expansion (one at a time)
- Progress tracking (streaming, percentage, steps, binary)
- Status management (processing, success, error, cancelled)
- Auto-close and persistent notifications
- Svelte 5 reactive stores with Map-based state

**Limitations:**

- ❌ **Only works when app is open**
- ❌ **No background notifications**
- ❌ **No OS-level notifications**
- ❌ **No push service integration**

**Documentation:**

- [NOTIFICATION_SYSTEM_IMPLEMENTATION.md](/apps/web/docs/features/notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md)
- [generic-stackable-notification-system-spec.md](/apps/web/docs/features/notifications/generic-stackable-notification-system-spec.md)
- [Component README](/apps/web/src/lib/components/notifications/README.md)

### 1.2 Email Notifications ✅

**Location:** `/apps/worker/` (Railway service)

**Implementation:**

- Daily Brief emails via worker service
- SMTP delivery via Gmail or Webhook to main app
- Email tracking system (opens, clicks, delivery status)
- User preferences in `user_brief_preferences` table

**Environment Variables:**

```bash
# Webhook Method (Recommended)
USE_WEBHOOK_EMAIL=true
BUILDOS_WEBHOOK_URL=https://build-os.com/webhooks/daily-brief-email
PRIVATE_BUILDOS_WEBHOOK_SECRET=your-secret

# Direct SMTP Method
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=your-app-password
EMAIL_FROM=noreply@build-os.com
```

**Database Tables:**

- `emails` - Email records with tracking
- `email_recipients` - Per-recipient tracking
- `email_logs` - SMTP send logs
- `email_tracking_events` - Granular event tracking

### 1.3 SMS Notifications ✅

**Location:** `/apps/web/src/lib/components/settings/` and `/packages/twilio-service/`

**Implementation:**

- Twilio integration for SMS delivery
- Phone verification flow
- SMS preferences (event reminders, morning kickoff, evening recap, next up)
- Rate limiting and status tracking

**Environment Variables:**

```bash
PRIVATE_TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PRIVATE_TWILIO_AUTH_TOKEN=your_auth_token
PRIVATE_TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PRIVATE_TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PRIVATE_TWILIO_STATUS_CALLBACK_URL=https://your-domain.com/api/webhooks/twilio/status
```

**Database Tables:**

- `user_sms_preferences` - SMS notification settings
- SMS tracking in Twilio service

**Onboarding Integration:**

- `/apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`
- Phone verification during onboarding
- SMS preference selection

---

## 2. Web Push Infrastructure Assessment

### 2.1 Service Worker Status ❌

**Search Results:**

```bash
# Service worker files
apps/web/static/*.js         → No service worker files found
apps/web/src/service-worker* → No service worker files found
apps/web/src/sw.*            → No service worker files found
```

**Finding:** No service worker implementation exists.

**Required for Web Push:**

- Service worker registration in main app
- Push event handlers in service worker
- Notification click handlers
- Background sync capabilities

### 2.2 VAPID Keys ❌

**Search Results:**

```bash
# Environment variables check (.env.example files)
Root:   /buildos-platform/.env.example               → No VAPID keys
Web:    /apps/web/.env.example                       → No VAPID keys
Worker: /apps/worker/.env.example                    → No VAPID keys

# Code search
grep -r "VAPID|web-push|pushManager|PushSubscription" → No results
```

**Finding:** No VAPID keys configured or referenced.

**Required for Web Push:**

```bash
# Public VAPID key (client-side)
PUBLIC_VAPID_PUBLIC_KEY=your-public-key

# Private VAPID key (server-side for signing)
PRIVATE_VAPID_PRIVATE_KEY=your-private-key
VAPID_SUBJECT=mailto:your-email@domain.com
```

### 2.3 Push Notification Libraries ❌

**Package Search Results:**

**Web App (`/apps/web/package.json`):**

- No `web-push` package
- No `firebase-admin` or `FCM` packages
- No push notification libraries

**Worker Service (`/apps/worker/package.json`):**

- No `web-push` package
- No push notification sending capabilities

**Finding:** No web push libraries installed in either app.

**Required Packages:**

```json
// Backend (worker service)
{
	"dependencies": {
		"web-push": "^3.6.7" // Standard web push library
	}
}

// Frontend (web app) - native APIs
// No additional packages needed, use browser APIs:
// - navigator.serviceWorker
// - PushManager
// - Notification API
```

### 2.4 Push Subscription Storage ❌

**Database Search:**

```sql
-- Search in database schema
grep -r "push.*subscription|vapid|fcm.*token" apps/web/src/lib/database.schema.ts
→ No push subscription tables found
```

**Finding:** No database tables for storing push subscriptions.

**Required Database Schema:**

```sql
-- Example push subscription table
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, endpoint)
);

-- User preferences for push notifications
CREATE TABLE user_push_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT false,
  notification_types JSONB DEFAULT '[]'::jsonb,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.5 Backend Push Notification Service ❌

**Worker Service Assessment:**

**Current Capabilities:**

- ✅ Background job processing (BullMQ with Supabase queue)
- ✅ Cron-based scheduling (daily/weekly briefs)
- ✅ Email sending (SMTP or webhook)
- ✅ SMS sending (Twilio)
- ❌ **NO push notification sending**

**Architecture Readiness:**

- Worker already has job queue system
- Email/SMS pattern can be replicated for push
- Needs web-push library integration
- Needs push subscription management

**Required Implementation:**

```typescript
// Example: /apps/worker/src/workers/pushWorker.ts

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Configure VAPID keys
webpush.setVapidDetails(
	process.env.VAPID_SUBJECT!,
	process.env.PUBLIC_VAPID_PUBLIC_KEY!,
	process.env.PRIVATE_VAPID_PRIVATE_KEY!
);

export async function sendPushNotification(
	userId: string,
	payload: {
		title: string;
		body: string;
		icon?: string;
		badge?: string;
		data?: any;
	}
) {
	// 1. Fetch user's push subscriptions from DB
	const { data: subscriptions } = await supabase
		.from('push_subscriptions')
		.select('*')
		.eq('user_id', userId);

	// 2. Send to all subscriptions
	const results = await Promise.allSettled(
		subscriptions.map(async (sub) => {
			const pushSubscription = {
				endpoint: sub.endpoint,
				keys: {
					p256dh: sub.p256dh_key,
					auth: sub.auth_key
				}
			};

			return webpush.sendNotification(pushSubscription, JSON.stringify(payload));
		})
	);

	// 3. Clean up failed subscriptions (410 Gone = unsubscribed)
	// 4. Update last_used_at for successful sends
}
```

### 2.6 PWA Readiness

**Web Manifest:** ✅ Exists at `/apps/web/static/site.webmanifest`

```json
{
  "name": "BuildOS - AI-Powered Project Organization",
  "short_name": "BuildOS",
  "start_url": "/",
  "display": "standalone",
  "icons": [...] // Multiple sizes configured
}
```

**HTTPS:** ✅ Vercel deployment (required for service workers)

**App Shell:** ✅ SvelteKit app structure

**Missing for Full PWA:**

- ❌ Service worker registration
- ❌ Offline capabilities
- ❌ Background sync
- ❌ Push notifications

---

## 3. Gap Analysis: What's Missing for Web Push

### 3.1 Frontend Requirements (Web App)

**Priority 1: Service Worker Setup**

1. **Create Service Worker File**
    - Location: `/apps/web/static/service-worker.js` or `/apps/web/src/service-worker.ts`
    - Register in main app (`+layout.svelte` or `hooks.client.ts`)
    - Handle push events and notification clicks

2. **Push Subscription Management**
    - Request notification permission
    - Subscribe to push service
    - Store subscription in database
    - Handle subscription updates/expiration

3. **UI Components**
    - Permission request prompt
    - Push notification preferences panel
    - Test notification button
    - Subscription status indicator

**Priority 2: Integration Points**

1. **Update Notification System**
    - Add push notification type to store
    - Create push notification bridge
    - Handle OS-level notification display

2. **Settings Page**
    - Add to `/apps/web/src/lib/components/settings/`
    - Push notification toggle
    - Notification type preferences
    - Test notification functionality

**Priority 3: API Endpoints**

```typescript
// Required API routes
/api/push/subscribe     POST   - Store push subscription
/api/push/unsubscribe   DELETE - Remove push subscription
/api/push/preferences   PUT    - Update push preferences
/api/push/test          POST   - Send test notification
```

### 3.2 Backend Requirements (Worker Service)

**Priority 1: Push Service Setup**

1. **Install Dependencies**

    ```bash
    cd apps/worker
    pnpm add web-push
    ```

2. **Generate VAPID Keys**

    ```bash
    npx web-push generate-vapid-keys
    # Add to .env files (web and worker)
    ```

3. **Configure web-push Library**
    - Set VAPID details
    - Create push notification service
    - Handle subscription management

**Priority 2: Worker Implementation**

1. **Create Push Worker**
    - `/apps/worker/src/workers/pushWorker.ts`
    - Queue job type: `send_push_notification`
    - Handle subscription failures
    - Track delivery status

2. **Integration with Existing Flows**
    - Daily brief generation → Send push notification
    - Brain dump completion → Send push notification
    - Phase generation completion → Send push notification
    - Calendar event reminders → Send push notification

**Priority 3: Database Schema**

```sql
-- Migration: /apps/web/supabase/migrations/YYYYMMDD_push_notifications.sql

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  device_type TEXT, -- 'desktop', 'mobile', 'tablet'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, endpoint)
);

CREATE TABLE user_push_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT false,
  brief_completion BOOLEAN DEFAULT true,
  brain_dump_completion BOOLEAN DEFAULT true,
  phase_generation_completion BOOLEAN DEFAULT true,
  calendar_reminders BOOLEAN DEFAULT true,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE push_notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL, -- 'sent', 'failed', 'expired'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_active ON push_subscriptions(user_id) WHERE is_active = true;
CREATE INDEX idx_push_notification_logs_user_id ON push_notification_logs(user_id);
CREATE INDEX idx_push_notification_logs_created_at ON push_notification_logs(created_at);
```

### 3.3 Environment Variables Setup

**Web App (`.env`):**

```bash
# Public VAPID key (client-side)
PUBLIC_VAPID_PUBLIC_KEY=your-public-vapid-key

# Feature flags
PUBLIC_ENABLE_PUSH_NOTIFICATIONS=false  # Set to true when ready
```

**Worker Service (`.env`):**

```bash
# VAPID Configuration (for web-push library)
VAPID_SUBJECT=mailto:noreply@build-os.com
PUBLIC_VAPID_PUBLIC_KEY=your-public-vapid-key
PRIVATE_VAPID_PRIVATE_KEY=your-private-vapid-key

# Push notification settings
PUSH_NOTIFICATION_TTL=86400  # 24 hours in seconds
PUSH_NOTIFICATION_URGENCY=normal  # low, normal, high
```

**Security Notes:**

- ⚠️ **NEVER expose private VAPID key on client**
- ✅ Public VAPID key is safe to expose (used for subscription)
- ✅ Private VAPID key stays on worker service only
- ✅ Use same VAPID keys across all environments for same origin

---

## 4. Implementation Patterns & Best Practices

### 4.1 Service Worker Registration Pattern

**Location:** `/apps/web/src/hooks.client.ts` (already exists)

```typescript
// Add to existing hooks.client.ts
import { browser } from '$app/environment';
import { PUBLIC_ENABLE_PUSH_NOTIFICATIONS } from '$env/static/public';

if (browser && PUBLIC_ENABLE_PUSH_NOTIFICATIONS === 'true') {
	// Register service worker
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker
			.register('/service-worker.js')
			.then((registration) => {
				console.log('Service Worker registered:', registration);
			})
			.catch((error) => {
				console.error('Service Worker registration failed:', error);
			});
	}
}
```

### 4.2 Push Subscription Flow

**User Journey:**

1. User visits app (service worker auto-registers)
2. Onboarding/Settings: "Enable push notifications" prompt
3. Browser requests permission → User grants
4. Subscribe to push service → Get subscription object
5. Send subscription to backend API → Store in database
6. Backend can now send push notifications

**Code Pattern:**

```typescript
// apps/web/src/lib/services/push-notification.service.ts
export async function subscribeToPushNotifications(userId: string) {
	// 1. Check permission
	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		throw new Error('Notification permission denied');
	}

	// 2. Get service worker registration
	const registration = await navigator.serviceWorker.ready;

	// 3. Subscribe to push service
	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_PUBLIC_KEY)
	});

	// 4. Save to backend
	await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			userId,
			subscription: subscription.toJSON()
		})
	});

	return subscription;
}
```

### 4.3 Worker Service Push Pattern

**Location:** `/apps/worker/src/workers/pushWorker.ts` (to be created)

```typescript
import webpush from 'web-push';

// Queue job interface
interface PushNotificationJob {
	userId: string;
	notification: {
		title: string;
		body: string;
		icon?: string;
		badge?: string;
		tag?: string;
		data?: any;
	};
	options?: {
		ttl?: number;
		urgency?: 'very-low' | 'low' | 'normal' | 'high';
	};
}

// Worker function
export async function processPushNotification(job: PushNotificationJob) {
	const { userId, notification, options } = job;

	// 1. Fetch active subscriptions
	const { data: subscriptions } = await supabase
		.from('push_subscriptions')
		.select('*')
		.eq('user_id', userId)
		.eq('is_active', true);

	if (!subscriptions?.length) {
		console.log(`No active push subscriptions for user ${userId}`);
		return;
	}

	// 2. Send to all subscriptions
	const results = await Promise.allSettled(
		subscriptions.map(async (sub) => {
			const pushSub = {
				endpoint: sub.endpoint,
				keys: {
					p256dh: sub.p256dh_key,
					auth: sub.auth_key
				}
			};

			const payload = JSON.stringify(notification);

			return webpush.sendNotification(pushSub, payload, {
				TTL: options?.ttl || 86400,
				urgency: options?.urgency || 'normal'
			});
		})
	);

	// 3. Handle failures and cleanup
	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		const subscription = subscriptions[i];

		if (result.status === 'rejected') {
			const error = result.reason;

			// 410 Gone = subscription expired/unsubscribed
			if (error.statusCode === 410) {
				await supabase
					.from('push_subscriptions')
					.update({ is_active: false })
					.eq('id', subscription.id);
			}

			// Log failure
			await supabase.from('push_notification_logs').insert({
				user_id: userId,
				subscription_id: subscription.id,
				notification_type: notification.tag || 'generic',
				payload: notification,
				status: 'failed',
				error_message: error.message
			});
		} else {
			// Update last used
			await supabase
				.from('push_subscriptions')
				.update({ last_used_at: new Date().toISOString() })
				.eq('id', subscription.id);

			// Log success
			await supabase.from('push_notification_logs').insert({
				user_id: userId,
				subscription_id: subscription.id,
				notification_type: notification.tag || 'generic',
				payload: notification,
				status: 'sent'
			});
		}
	}
}
```

### 4.4 Service Worker Push Handler

**Location:** `/apps/web/static/service-worker.js` (to be created)

```javascript
// Listen for push events
self.addEventListener('push', (event) => {
	const data = event.data.json();

	const options = {
		body: data.body,
		icon: data.icon || '/android-chrome-192x192.png',
		badge: data.badge || '/favicon-32x32.png',
		tag: data.tag || 'buildos-notification',
		data: data.data || {},
		requireInteraction: data.requireInteraction || false,
		actions: data.actions || []
	};

	event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const urlToOpen = event.notification.data?.url || '/';

	event.waitUntil(
		clients.matchAll({ type: 'window' }).then((clientList) => {
			// Focus existing window if available
			for (const client of clientList) {
				if (client.url === urlToOpen && 'focus' in client) {
					return client.focus();
				}
			}
			// Otherwise open new window
			if (clients.openWindow) {
				return clients.openWindow(urlToOpen);
			}
		})
	);
});
```

### 4.5 Integration with Existing Notification System

**Bridge Pattern (extends existing bridges):**

```typescript
// apps/web/src/lib/services/push-notification.bridge.ts
import { notificationStore } from '$lib/stores/notification.store';
import { sendPushNotification } from './push-notification.service';

export async function notifyBrainDumpComplete(
	userId: string,
	brainDumpId: string,
	projectName: string
) {
	// 1. Show in-app notification (existing)
	notificationStore.setStatus(brainDumpId, 'success');

	// 2. Send push notification (new)
	await sendPushNotification(userId, {
		title: 'Brain Dump Complete!',
		body: `Your thoughts have been organized into "${projectName}"`,
		icon: '/android-chrome-192x192.png',
		tag: `brain-dump-${brainDumpId}`,
		data: {
			type: 'brain-dump-completion',
			projectId: brainDumpId,
			url: `/projects/${brainDumpId}`
		}
	});
}
```

---

## 5. Recommended Implementation Roadmap

### Phase 1: Foundation (4-6 hours)

**Backend Setup:**

1. Generate VAPID keys
2. Add environment variables to both apps
3. Install `web-push` package in worker service
4. Create database migration for push tables
5. Create push notification worker

**Frontend Setup:** 6. Create service worker file 7. Register service worker in hooks 8. Create push subscription service 9. Add API endpoints for subscription management

**Deliverable:** Core infrastructure ready, no UI yet

### Phase 2: User-Facing Features (3-4 hours)

**Settings Integration:**

1. Create PushNotificationSettings component
2. Add to Settings page
3. Implement permission request flow
4. Add push preference toggles
5. Test notification button

**Onboarding Integration:** 6. Add push notification step to onboarding 7. Optional: Show demo/explanation 8. Handle permission denial gracefully

**Deliverable:** Users can enable/disable push notifications

### Phase 3: Integration with Existing Flows (4-6 hours)

**Worker Service Updates:**

1. Update brief generation to send push
2. Update brain dump completion to send push
3. Update phase generation completion to send push
4. Add calendar reminder push notifications

**Web App Bridges:** 5. Create push notification bridges 6. Integrate with existing notification bridges 7. Handle push + in-app notification coordination

**Deliverable:** Push notifications working for all major flows

### Phase 4: Testing & Polish (2-3 hours)

**Testing:**

1. Cross-browser testing (Chrome, Firefox, Safari, Edge)
2. Mobile device testing (iOS Safari, Android Chrome)
3. Permission denied scenarios
4. Subscription expiration handling
5. Offline behavior

**Polish:** 6. Better notification icons 7. Notification action buttons 8. Quiet hours support 9. Notification grouping/stacking

**Deliverable:** Production-ready push notifications

### Phase 5: Monitoring & Optimization (Ongoing)

**Analytics:**

1. Track push subscription rates
2. Track notification delivery success
3. Track notification click-through rates
4. Monitor subscription churn

**Optimization:** 5. A/B test notification copy 6. Optimize notification timing 7. Reduce notification fatigue 8. Improve re-subscription flows

---

## 6. Security & Privacy Considerations

### 6.1 VAPID Key Security

**Critical Rules:**

- ✅ Public VAPID key: Safe to expose, used client-side
- ⚠️ Private VAPID key: **NEVER expose**, server-only
- ✅ Use same VAPID keys across dev/staging/prod for same origin
- ⚠️ Rotating VAPID keys invalidates all subscriptions

**Storage:**

```bash
# .env (NOT in git)
PRIVATE_VAPID_PRIVATE_KEY=your-secret-key

# Vercel/Railway secrets
# Store as encrypted environment variables
```

### 6.2 User Privacy

**Compliance Requirements:**

- ✅ Request permission explicitly (browser handles this)
- ✅ Allow users to unsubscribe easily
- ✅ Store minimal subscription data (no PII in push payload)
- ✅ Honor quiet hours and user preferences
- ✅ Provide notification history/audit log

**Data Minimization:**

- Don't include sensitive data in push payload
- Use notification tags for grouping
- Fetch full data client-side after notification click

### 6.3 Rate Limiting

**Prevent Notification Fatigue:**

- Max 5 push notifications per user per hour
- Respect quiet hours (default: 10 PM - 8 AM)
- Allow users to set custom quiet hours
- Group related notifications (same tag)
- Don't send if user is actively using app

**Implementation:**

```typescript
// Check if user is active (last activity < 5 min ago)
const { data: user } = await supabase.from('users').select('last_active').eq('id', userId).single();

const lastActive = new Date(user.last_active);
const isActiveNow = Date.now() - lastActive.getTime() < 5 * 60 * 1000;

if (isActiveNow) {
	// Skip push notification, they're already in the app
	return;
}
```

---

## 7. Browser Compatibility & Fallbacks

### 7.1 Browser Support

| Browser                | Push Notifications | Service Worker | Notification API |
| ---------------------- | ------------------ | -------------- | ---------------- |
| Chrome 50+             | ✅                 | ✅             | ✅               |
| Firefox 44+            | ✅                 | ✅             | ✅               |
| Safari 16+ (macOS/iOS) | ✅                 | ✅             | ✅               |
| Edge 17+               | ✅                 | ✅             | ✅               |
| Opera 42+              | ✅                 | ✅             | ✅               |

**Safari Limitations:**

- iOS: Push notifications only work if app is added to Home Screen (PWA)
- macOS: Full support in Safari 16+
- Requires HTTPS (all browsers)

### 7.2 Feature Detection

```typescript
export function canUsePushNotifications(): boolean {
	if (!browser) return false;

	return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function canRequestPermission(): boolean {
	if (!canUsePushNotifications()) return false;

	return Notification.permission !== 'denied';
}
```

### 7.3 Graceful Degradation

**Fallback Strategy:**

1. **Push notifications:** Primary (when available)
2. **SMS notifications:** Fallback #1 (if phone verified)
3. **Email notifications:** Fallback #2 (always available)
4. **In-app notifications:** Fallback #3 (when app is open)

**User Experience:**

- Don't show push notification settings if not supported
- Show browser compatibility message if needed
- Default to email/SMS if push unavailable

---

## 8. Cost & Resource Analysis

### 8.1 Infrastructure Costs

**Push Notification Service:** **FREE**

- Web Push uses browser push services (Google FCM, Mozilla AutoPush, Apple APNs)
- No per-message fees (unlike SMS)
- No third-party service required (unlike email)
- Only costs: Server bandwidth (minimal)

**Storage Costs:** **Negligible**

- ~200 bytes per push subscription
- 1000 users × 2 devices = 2000 subscriptions = ~400 KB
- Supabase includes this in base plan

**Worker Service:** **Existing**

- Already have background worker on Railway
- Push notification worker uses same infrastructure
- No additional deployment costs

### 8.2 Development Time Estimate

| Phase     | Tasks                         | Hours           | Priority |
| --------- | ----------------------------- | --------------- | -------- |
| Phase 1   | Backend + Frontend foundation | 4-6             | High     |
| Phase 2   | Settings UI + Onboarding      | 3-4             | High     |
| Phase 3   | Integration with flows        | 4-6             | Medium   |
| Phase 4   | Testing + Polish              | 2-3             | Medium   |
| Phase 5   | Monitoring (ongoing)          | -               | Low      |
| **Total** |                               | **13-19 hours** |          |

**Recommendation:** Implement in 2-3 focused sessions over 1 week.

### 8.3 Maintenance Overhead

**Ongoing Tasks:**

- Monitor subscription churn (weekly)
- Clean up expired subscriptions (automated)
- Update notification copy based on analytics (monthly)
- Handle browser API changes (rare)

**Estimated:** 2-3 hours per month after initial implementation.

---

## 9. Key Takeaways & Next Steps

### 9.1 Summary of Findings

**Current State:**

- ✅ Strong in-app notification system (UI-based, stackable)
- ✅ Email notifications working (daily briefs)
- ✅ SMS notifications working (Twilio)
- ✅ PWA-ready (manifest, HTTPS, icons)
- ❌ **NO web push notifications** (missing service worker, VAPID keys, push subscriptions)

**Required Components:**

1. Service worker with push event handlers
2. VAPID key generation and configuration
3. Push subscription management (frontend + backend)
4. Database tables for subscriptions and preferences
5. Worker service push notification sender
6. UI for permission requests and preferences

**Effort Estimate:**

- **13-19 hours** total development time
- **FREE** infrastructure costs (uses browser push services)
- **2-3 hours/month** ongoing maintenance

### 9.2 Recommended Approach

**Option A: Full Implementation (Recommended)**

- Implement all 5 phases over 2 weeks
- Provide comprehensive push notification system
- Best user experience (background notifications)
- Future-proof for PWA evolution

**Option B: MVP Implementation (Faster)**

- Phase 1 + 2 only (foundation + basic UI)
- 7-10 hours implementation
- Limited to manual opt-in, no onboarding integration
- Can expand later

**Option C: Defer for Now**

- Continue with existing email/SMS notifications
- Implement push notifications after other priorities
- Re-assess in 3-6 months based on user feedback

### 9.3 Decision Criteria

**Implement Web Push If:**

- ✅ Users frequently miss notifications (need background alerts)
- ✅ Want to reduce SMS costs (free alternative)
- ✅ Building PWA/mobile-first experience
- ✅ Have 13-19 hours available for implementation

**Defer Web Push If:**

- ❌ Email/SMS notifications are sufficient for now
- ❌ Limited development time (other priorities)
- ❌ User base is primarily desktop (less benefit)
- ❌ Need to validate product-market fit first

### 9.4 Next Steps (If Implementing)

**Immediate Actions:**

1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add environment variables to both apps
3. Create database migration for push tables
4. Install `web-push` in worker service

**Week 1:** 5. Implement service worker and registration 6. Create push subscription service 7. Build push notification worker 8. Add API endpoints

**Week 2:** 9. Create settings UI 10. Integrate with onboarding 11. Connect to existing notification flows 12. Testing and polish

**Week 3+:** 13. Monitor adoption rates 14. Optimize notification timing 15. A/B test notification copy 16. Gather user feedback

---

## 10. Additional Resources

### 10.1 Documentation References

**BuildOS Internal:**

- [In-App Notification System](/apps/web/docs/features/notifications/)
- [Email Notification Setup](/apps/worker/docs/EMAIL_SETUP.md)
- [SMS Integration](/docs/sms-integration.md)
- [Worker Service Architecture](/apps/worker/CLAUDE.md)

**Web Push Standards:**

- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [VAPID Specification](https://datatracker.ietf.org/doc/html/rfc8292)
- [Push API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

### 10.2 Libraries & Tools

**Recommended:**

- `web-push` (Node.js) - [npm package](https://www.npmjs.com/package/web-push)
- Browser native Push API (no frontend library needed)
- `web-push` CLI for VAPID key generation

**Testing Tools:**

- Chrome DevTools → Application → Service Workers
- Firefox DevTools → Application → Service Workers
- [web-push-testing-service.app](https://web-push-testing-service.app/)

### 10.3 Code Examples

**Full Examples Available:**

- Service worker registration: Provided in Section 4.1
- Push subscription flow: Provided in Section 4.2
- Worker push sender: Provided in Section 4.3
- Service worker handlers: Provided in Section 4.4

---

## Appendix A: Environment Variable Checklist

### Web App (`.env`)

```bash
# Push Notifications
PUBLIC_VAPID_PUBLIC_KEY=                    # [REQUIRED] Public VAPID key for subscription
PUBLIC_ENABLE_PUSH_NOTIFICATIONS=false      # [REQUIRED] Feature flag (set to true when ready)
```

### Worker Service (`.env`)

```bash
# Push Notifications (web-push library)
VAPID_SUBJECT=mailto:noreply@build-os.com   # [REQUIRED] VAPID subject (mailto: URL)
PUBLIC_VAPID_PUBLIC_KEY=                    # [REQUIRED] Same as web app
PRIVATE_VAPID_PRIVATE_KEY=                  # [REQUIRED] Private VAPID key (NEVER expose)

# Push Settings
PUSH_NOTIFICATION_TTL=86400                 # [OPTIONAL] Time-to-live in seconds (default: 24h)
PUSH_NOTIFICATION_URGENCY=normal            # [OPTIONAL] Urgency: low, normal, high (default: normal)
```

### Vercel (Production - Web App)

```bash
PUBLIC_VAPID_PUBLIC_KEY=your-public-key
PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
```

### Railway (Production - Worker)

```bash
VAPID_SUBJECT=mailto:noreply@build-os.com
PUBLIC_VAPID_PUBLIC_KEY=your-public-key
PRIVATE_VAPID_PRIVATE_KEY=your-private-key
PUSH_NOTIFICATION_TTL=86400
PUSH_NOTIFICATION_URGENCY=normal
```

---

## Appendix B: Database Migration SQL

```sql
-- Migration: 20251005_push_notifications.sql
-- Description: Add web push notification support

-- Push subscriptions table
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  user_agent TEXT,
  device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(user_id, endpoint)
);

-- User push notification preferences
CREATE TABLE user_push_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT false,

  -- Notification types
  brief_completion BOOLEAN DEFAULT true,
  brain_dump_completion BOOLEAN DEFAULT true,
  phase_generation_completion BOOLEAN DEFAULT true,
  calendar_reminders BOOLEAN DEFAULT true,
  task_reminders BOOLEAN DEFAULT true,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push notification delivery logs
CREATE TABLE push_notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'expired')),
  error_message TEXT,
  error_code INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_active ON push_subscriptions(user_id) WHERE is_active = true;
CREATE INDEX idx_push_notification_logs_user_id ON push_notification_logs(user_id);
CREATE INDEX idx_push_notification_logs_created_at ON push_notification_logs(created_at);
CREATE INDEX idx_push_notification_logs_status ON push_notification_logs(status);
CREATE INDEX idx_push_notification_logs_type ON push_notification_logs(notification_type);

-- Row Level Security (RLS)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own push subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push subscriptions"
  ON push_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own push preferences"
  ON user_push_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push preferences"
  ON user_push_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push preferences"
  ON user_push_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own push notification logs"
  ON push_notification_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for worker service)
CREATE POLICY "Service role can manage all push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all push preferences"
  ON user_push_preferences FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all push logs"
  ON push_notification_logs FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to update updated_at on preferences
CREATE OR REPLACE FUNCTION update_push_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_push_preferences_updated_at
BEFORE UPDATE ON user_push_preferences
FOR EACH ROW
EXECUTE FUNCTION update_push_preferences_updated_at();

-- Cleanup function for expired subscriptions (run via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_push_subscriptions()
RETURNS void AS $$
BEGIN
  -- Deactivate subscriptions not used in 90 days
  UPDATE push_subscriptions
  SET is_active = false
  WHERE is_active = true
    AND last_used_at < NOW() - INTERVAL '90 days';

  -- Delete old notification logs (keep 30 days)
  DELETE FROM push_notification_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION cleanup_expired_push_subscriptions() TO service_role;
```

---

## Appendix C: API Endpoints Specification

### POST `/api/push/subscribe`

**Description:** Save a push subscription for the authenticated user

**Request:**

```typescript
{
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  userAgent?: string;
}
```

**Response:**

```typescript
{
	success: true;
	subscriptionId: string;
}
```

### DELETE `/api/push/unsubscribe`

**Description:** Remove a push subscription

**Request:**

```typescript
{
	endpoint: string;
}
```

**Response:**

```typescript
{
	success: true;
}
```

### PUT `/api/push/preferences`

**Description:** Update push notification preferences

**Request:**

```typescript
{
  pushEnabled: boolean;
  briefCompletion?: boolean;
  brainDumpCompletion?: boolean;
  phaseGenerationCompletion?: boolean;
  calendarReminders?: boolean;
  taskReminders?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string;   // "08:00"
  quietHoursTimezone?: string;
}
```

**Response:**

```typescript
{
	success: true;
	preferences: UserPushPreferences;
}
```

### POST `/api/push/test`

**Description:** Send a test push notification

**Request:**

```typescript
{
  message?: string; // Optional custom message
}
```

**Response:**

```typescript
{
	success: true;
	subscriptionsTested: number;
	deliveryResults: {
		sent: number;
		failed: number;
	}
}
```

---

**End of Research Document**

---

**Metadata:**

- Research Duration: ~30 minutes
- Files Analyzed: 50+
- Key Findings: 12
- Implementation Estimate: 13-19 hours
- Infrastructure Cost: $0 (free)
- Next Action: Decision on implementation timing
