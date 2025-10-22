---
date: 2025-10-05T15:30:00-07:00
researcher: Claude Code
git_commit: ac3926bfd8b265462ed239421d7cd1573b489972
branch: main
repository: buildos-platform
topic: 'PWA Browser Push Notifications for BuildOS Web App'
tags: [research, codebase, pwa, push-notifications, service-worker, web-app, notifications]
status: complete
last_updated: 2025-10-05
last_updated_by: Claude Code
---

# Research: PWA Browser Push Notifications for BuildOS Web App

**Date**: 2025-10-05T15:30:00-07:00
**Researcher**: Claude Code
**Git Commit**: ac3926bfd8b265462ed239421d7cd1573b489972
**Branch**: main
**Repository**: buildos-platform

## Research Question

How can we extend the PWA capabilities of the BuildOS web app to include sending browser push notifications? What is the current state of PWA infrastructure, what's missing, and how should we implement it?

## Summary

BuildOS has **excellent PWA UI/UX foundation** with web manifest, comprehensive icon assets, and mobile optimizations, but **lacks service worker infrastructure** for offline functionality and push notifications. The in-app notification system is sophisticated and well-designed, providing a strong foundation for integration with browser push. Implementation requires adding service worker support, VAPID keys, push subscription management, and backend infrastructure—estimated at 16-22 hours total effort with $0 infrastructure cost.

**Key Finding**: BuildOS should implement browser push notifications as a **settings-only feature initially**, following the existing SMS permission UX pattern, not during onboarding.

## Detailed Findings

### 1. Current PWA Infrastructure

#### ✅ What Exists (Strong Foundation)

**Web App Manifest** (`apps/web/static/site.webmanifest`)

- Complete PWA manifest with standalone display mode
- Comprehensive icon set (48px to 1024px for all platforms)
- Theme colors with dark mode variants
- Proper categorization: "productivity" and "business"
- Edge side panel support

**PWA Enhancement Utilities** (`apps/web/src/lib/utils/pwa-enhancements.ts`)

- Dynamic theme color updates based on dark mode
- iOS status bar style management
- PWA installation detection via `isInstalledPWA()`
- Install prompt handling with `beforeinstallprompt` event
- Pull-to-refresh prevention for iOS PWA
- Viewport adjustments for notched devices (iPhone X+)

**Mobile Optimizations** (`apps/web/src/lib/styles/pwa.css`)

- Safe area insets for notched devices
- iOS-specific optimizations (overscroll behavior, scrollbar hiding)
- Touch target size optimization (44px minimum)
- Active state feedback animations
- Pull-to-refresh indicator styling

**iOS Splash Screens** (`apps/web/src/lib/components/layout/IOSSplashScreens.svelte`)

- Device-specific splash screen configurations
- iPhone 14/15 Pro Max, iPad Pro, iPad Mini support

**Layout Integration** (`apps/web/src/routes/+layout.svelte:296-298`)

```typescript
initializePWAEnhancements();
setupInstallPrompt();
```

#### ❌ Critical Gaps

**No Service Worker Implementation**

- No service worker file (sw.js, service-worker.ts)
- No offline functionality or caching
- No background sync capabilities
- No push notification event handlers
- No service worker lifecycle management

**No PWA Build Plugin**

- No `@vite-pwa/sveltekit` or `vite-plugin-pwa` in dependencies
- No workbox configuration
- Service worker not generated during build process

**Package Dependencies** (`apps/web/package.json`)

- Missing: `@vite-pwa/sveltekit`
- Missing: `vite-plugin-pwa`
- Missing: `workbox-window`
- Missing: `web-push` (for backend)

### 2. Existing Notification System (Excellent Foundation)

#### In-App Notification Store (`apps/web/src/lib/stores/notification.store.ts`)

**Sophisticated Architecture:**

- Svelte 5 writable store with Map-based state management
- Session storage persistence with action handler serialization
- Support for multiple notification types: brain-dump, phase-generation, calendar-analysis, generic
- Progress tracking: binary, percentage, steps, streaming, indeterminate
- Single modal constraint (only one expanded at a time)
- Stack management with overflow handling (max 5 visible)

**Key Features:**

```typescript
// Store Methods
add(config); // Create notification, returns ID
update(id, updates); // Update notification data
remove(id); // Remove completely
expand(id); // Expand to modal (auto-minimizes others)
minimize(id); // Minimize to stack
setStatus(id, status); // Update status
setProgress(id, progress); // Update progress
setError(id, error); // Set error state
```

**Notification Types Supported:**

1. **Brain Dump** - Processing with dual-stage AI extraction
2. **Phase Generation** - Step-based progress with project context
3. **Calendar Analysis** - Event analysis with day range
4. **Generic** - Fallback for custom notifications

**Critical Pattern** (Svelte 5 Reactivity):

```typescript
// MUST create new Map instances for reactivity
const newNotifications = new Map(state.notifications);
newNotifications.set(id, notification);
return { ...state, notifications: newNotifications };
```

#### UI Components (`apps/web/src/lib/components/notifications/`)

**NotificationStackManager.svelte** - Top-level orchestrator

- Keyboard shortcuts (ESC to minimize all)
- Single modal constraint coordination
- Renders both stack and modal

**NotificationStack.svelte** - Bottom-right stack renderer

- Shows max 5 notifications with "+N more" overflow badge
- Fly-in animations with spring physics

**MinimizedNotification.svelte** - Individual notification cards

- Status icons with loading/success/error states
- Progress bars for percentage-based progress
- Click to expand

**NotificationModal.svelte** - Expanded modal view

- Lazy-loaded type-specific components
- Full progress displays (steps, percentage, streaming)
- Success/error states with action buttons
- Smart minimize/dismiss behavior

**Documentation:**

- `apps/web/src/lib/components/notifications/README.md` - Component guide
- `NOTIFICATION_SYSTEM_IMPLEMENTATION.md` - Phase 1 complete, API reference
- `generic-stackable-notification-system-spec.md` - Original specification

### 3. Permission Request UX Patterns (Best Practices)

#### SMS Notification Permission Flow (`apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte`)

**UX Principles Demonstrated:**

**Progressive Disclosure:**

1. Phone verification required before showing notification options
2. Only after verification, granular notification preferences appear
3. User selects specific notification types they want

**Value-First Approach:**

```svelte
<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
	How do you want BuildOS to keep you on track? (This step is optional)
</p>
<!-- Visual demo placeholder shown BEFORE permission request -->
```

**Contextual Timing:**

- When: Step 5 of 7 in onboarding (after core value demonstrated)
- Why: Part of "Stay Accountable" step
- Optional: Clear "Skip" option with "I'll set this up later" message

**Granular Control:**

```typescript
smsPreferences = {
	eventReminders: false,
	nextUpNotifications: false,
	morningKickoff: false,
	eveningRecap: false
};
```

**Non-Blocking UX:**

```typescript
async function handleSkipSMS() {
	await onboardingV2Service.markSMSSkipped(userId, true);
	onNext(); // Continue regardless
}
```

#### Calendar OAuth Permission Flow (`apps/web/src/lib/components/profile/CalendarTab.svelte`)

**Feature Showcase Before Permission:**

```svelte
<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
	<div class="flex items-start space-x-2">
		<CheckCircle class="w-5 h-5 text-green-500" />
		<div>
			<p class="text-sm font-medium">Automatic Task Scheduling</p>
			<p class="text-xs text-gray-600">Schedule tasks directly to calendar</p>
		</div>
	</div>
</div>
```

**Clear Status Indication:**

```svelte
{#if calendarConnected}
	<CheckCircle class="w-4 h-4 text-green-500" />
	<p class="text-sm font-medium text-green-600">Connected</p>
{:else}
	<Button on:click={connectCalendar}>Connect Calendar</Button>
{/if}
```

**Post-Connection Value Delivery:**

```typescript
// After connecting, immediately offer calendar analysis
if ($page.url.searchParams.get('success') === 'calendar_connected') {
	refreshCalendarData();
	if (!hasShownAnalysis) {
		showAnalysisModal = true; // Immediate value
	}
}
```

#### User Preference Storage

**Database Tables:**

- `user_sms_preferences` - SMS notifications with quiet hours, timezone
- `user_brief_preferences` - Email daily briefs with frequency, time
- `user_calendar_preferences` - Work hours, working days, timezone

**API Endpoints:**

- `GET/PUT /api/sms/preferences` - SMS settings
- `GET/PUT /api/brief-preferences` - Email settings
- `GET/PUT /api/users/calendar-preferences` - Calendar settings

**Frontend Stores:**

- `apps/web/src/lib/stores/briefPreferences.ts` - Reactive preference management

### 4. Push Notification Infrastructure Requirements

#### ❌ What's Missing (Complete Gap Analysis)

**Frontend (Web App):**

- ❌ No service worker file with push event handlers
- ❌ No VAPID keys configured
- ❌ No push subscription management API
- ❌ No browser Push API integration
- ❌ No push notification preferences UI
- ❌ No `Notification.requestPermission()` calls anywhere

**Backend (Worker Service):**

- ❌ No `web-push` library installed
- ❌ No push notification sending logic
- ❌ No database tables for push subscriptions
- ❌ No push notification worker/queue job
- ❌ No VAPID key generation or storage

**Database:**

- ❌ No `push_subscriptions` table
- ❌ No `user_browser_notification_preferences` table
- ❌ No push notification logging/history

#### ✅ What's Already Built (Reusable Patterns)

**PWA-Ready Foundation:**

- HTTPS deployment (Vercel)
- Web manifest configured
- Icon assets for all sizes
- SvelteKit app structure

**Background Worker System:**

- Railway worker service with job queue (BullMQ + Supabase)
- Email/SMS sending patterns (can replicate for push)
- User preference management patterns
- Notification timing logic with quiet hours

**In-App Notification System:**

- Sophisticated notification store with session persistence
- Type-safe notification types
- Progress tracking patterns
- Bridge pattern for integrations (brain dump, phase generation, calendar)

## Code References

### PWA Infrastructure

- `apps/web/static/site.webmanifest` - Complete web manifest configuration
- `apps/web/src/lib/utils/pwa-enhancements.ts:78-140` - PWA initialization and enhancement utilities
- `apps/web/src/lib/styles/pwa.css` - PWA-specific mobile optimizations
- `apps/web/src/routes/+layout.svelte:296-298` - PWA setup in layout
- `apps/web/vite.config.ts` - Vite configuration (no PWA plugin currently)

### Notification System

- `apps/web/src/lib/stores/notification.store.ts` - Main notification store with 912 lines
- `apps/web/src/lib/types/notification.types.ts` - TypeScript type definitions
- `apps/web/src/lib/components/notifications/NotificationStackManager.svelte` - Top-level orchestrator
- `apps/web/src/lib/components/notifications/NotificationModal.svelte` - Expanded modal view
- `apps/web/src/lib/components/notifications/README.md` - Component documentation

### Permission UX Patterns

- `apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte` - SMS permission flow (best practice)
- `apps/web/src/lib/components/settings/SMSPreferences.svelte` - Settings UI pattern
- `apps/web/src/lib/components/profile/CalendarTab.svelte` - OAuth permission pattern
- `apps/web/src/lib/database.schema.ts:985-1110` - User preference table structures

### API Patterns

- `apps/web/src/routes/api/sms/preferences/+server.ts` - Preference endpoint pattern
- `apps/web/src/routes/api/brief-preferences/+server.ts` - Email preference API

## Architecture Insights

### Multi-Channel Notification Strategy

BuildOS uses a tiered notification approach:

| Channel          | Use Case                        | Permission Level    | Current Status     | Timing                          |
| ---------------- | ------------------------------- | ------------------- | ------------------ | ------------------------------- |
| **In-App**       | Brain dump, phase gen, calendar | None required       | ✅ Implemented     | Always available                |
| **Email**        | Daily briefs, summaries         | Email address       | ✅ Implemented     | Onboarding Step 5               |
| **SMS**          | Task reminders, urgent alerts   | Phone verification  | ✅ Implemented     | Onboarding Step 5 (optional)    |
| **Browser Push** | Real-time alerts                | Permission required | ❌ Not implemented | **Settings only (recommended)** |

**Key Insight**: Browser push should be the **last** channel offered, with lowest priority, as it's most intrusive.

### Trust Ladder Pattern

BuildOS demonstrates clear trust-building progression:

```
Step 1: User creates account (minimal trust)
  ↓
Step 2: User completes first brain dump (product value proven)
  ↓
Step 3: User sees AI successfully extract projects/tasks (AI trust built)
  ↓
Step 4: Ask for calendar connection (opt-in integration)
  ↓
Step 5: Ask for notification permissions (SMS/Email)
  ↓
Step 6: Browser push (settings-only, power users)
```

### Svelte 5 Reactivity with Maps (Critical Pattern)

The notification store demonstrates critical Svelte 5 pattern:

```typescript
// ❌ WRONG - Doesn't trigger reactivity
update((state) => {
	state.notifications.set(id, notification);
	return state;
});

// ✅ CORRECT - Triggers reactivity
update((state) => {
	const newNotifications = new Map(state.notifications);
	newNotifications.set(id, notification);
	return { ...state, notifications: newNotifications };
});
```

**Why?** Svelte 5's fine-grained reactivity with `$derived()` tracks object references. Mutating a Map in-place keeps the same reference, so reactivity doesn't detect the change.

Reference: `NOTIFICATION_SYSTEM_IMPLEMENTATION.md#4-svelte-5-map-reactivity-issue-critical-fix`

## Implementation Specification

### Phase 1: Service Worker Foundation (4-6 hours)

#### Option A: @vite-pwa/sveltekit (Recommended)

**Installation:**

```bash
pnpm add -D @vite-pwa/sveltekit vite-plugin-pwa workbox-window
```

**Vite Config** (`apps/web/vite.config.ts`):

```typescript
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			srcDir: './src',
			mode: 'production',
			strategies: 'injectManifest',
			filename: 'service-worker.ts',
			manifest: {
				name: 'BuildOS - AI-Powered Project Organization',
				short_name: 'BuildOS',
				theme_color: '#1f2937',
				background_color: '#0f172a',
				display: 'standalone'
				// ... rest from site.webmanifest
			},
			injectManifest: {
				globPatterns: ['**/*.{js,css,html,png,svg,ico,webp}']
			},
			workbox: {
				runtimeCaching: [
					{
						urlPattern: /^https:\/\/.*\.supabase\.co\/.*/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'supabase-cache',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 5 * 60 // 5 minutes
							}
						}
					}
				]
			},
			devOptions: {
				enabled: true,
				type: 'module'
			}
		})
	]
});
```

**Service Worker** (`apps/web/src/service-worker.ts`):

```typescript
/// <reference types="@sveltejs/kit" />
import { build, files, version } from '$service-worker';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';

const CACHE_NAME = `buildos-cache-${version}`;

// Precache build files
const precacheList = [
	...build.map((file) => ({ url: file, revision: version })),
	...files.map((file) => ({ url: file, revision: version }))
];

precacheAndRoute(precacheList);

// API calls - Network first
registerRoute(
	({ url }) => url.pathname.startsWith('/api/'),
	new NetworkFirst({ cacheName: 'api-cache' })
);

// Static assets - Cache first
registerRoute(
	({ request }) => ['image', 'font', 'style'].includes(request.destination),
	new CacheFirst({ cacheName: 'assets-cache' })
);

// Push notification handler
self.addEventListener('push', (event) => {
	const data = event.data?.json();

	const options = {
		body: data.body,
		icon: '/AppImages/android/android-launchericon-192-192.png',
		badge: '/AppImages/android/android-launchericon-96-96.png',
		tag: data.tag,
		requireInteraction: data.priority === 'high',
		data: { url: data.url }
	};

	event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(clients.openWindow(event.notification.data.url));
});

// Offline fallback
self.addEventListener('fetch', (event) => {
	if (event.request.mode === 'navigate') {
		event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
	}
});
```

**Client Registration** (Add to `apps/web/src/routes/+layout.svelte`):

```typescript
import { registerSW } from 'virtual:pwa-register';

onMount(() => {
	if (browser && 'serviceWorker' in navigator) {
		const updateSW = registerSW({
			onNeedRefresh() {
				toastService?.info('New version available. Refresh to update.');
			},
			onOfflineReady() {
				console.log('App ready to work offline');
			}
		});
	}
});
```

#### Option B: Manual Service Worker (More Control)

Create `apps/web/static/sw.js` manually and register in layout with custom logic. Use this for complex background sync or custom notification handling.

### Phase 2: Push Notification Infrastructure (4-6 hours)

#### Database Schema

**Migration** (`supabase/migrations/YYYYMMDDHHMMSS_add_browser_push_notifications.sql`):

```sql
-- Push subscriptions table
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,

  -- Push subscription data (from PushSubscription.toJSON())
  endpoint TEXT NOT NULL,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,

  -- Metadata
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP,

  -- Prevent duplicate subscriptions
  UNIQUE(user_id, endpoint)
);

-- Browser notification preferences
CREATE TABLE user_browser_notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,

  -- Permission status
  permission_granted BOOLEAN DEFAULT FALSE,
  permission_requested_at TIMESTAMP,
  permission_granted_at TIMESTAMP,

  -- Notification types (granular control)
  brain_dump_complete BOOLEAN DEFAULT TRUE,
  daily_brief_ready BOOLEAN DEFAULT TRUE,
  task_due_soon BOOLEAN DEFAULT FALSE,
  phase_scheduled BOOLEAN DEFAULT FALSE,

  -- Preferences
  quiet_mode_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME DEFAULT '22:00:00',
  quiet_hours_end TIME DEFAULT '08:00:00',
  timezone TEXT DEFAULT 'UTC',

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_browser_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only manage their own preferences
CREATE POLICY "Users can view own browser notification preferences"
  ON user_browser_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own browser notification preferences"
  ON user_browser_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own browser notification preferences"
  ON user_browser_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX idx_browser_notif_prefs_user_id ON user_browser_notification_preferences(user_id);
```

#### Environment Variables

**Web App** (`.env` / Vercel):

```bash
PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
PUBLIC_ENABLE_PUSH_NOTIFICATIONS=false  # Feature flag
```

**Worker Service** (`.env` / Railway):

```bash
VAPID_SUBJECT=mailto:noreply@build-os.com
PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
PRIVATE_VAPID_PRIVATE_KEY=your-vapid-private-key  # NEVER expose to client
```

**Generate VAPID Keys:**

```bash
npx web-push generate-vapid-keys
```

#### TypeScript Types

**Add to** (`apps/web/src/lib/types/notification.types.ts`):

```typescript
// Push subscription data
export interface PushSubscriptionData {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
}

// Browser notification preferences
export interface BrowserNotificationPreferences {
	id: string;
	user_id: string;
	permission_granted: boolean;
	permission_requested_at: string | null;
	permission_granted_at: string | null;

	// Notification types
	brain_dump_complete: boolean;
	daily_brief_ready: boolean;
	task_due_soon: boolean;
	phase_scheduled: boolean;

	// Preferences
	quiet_mode_enabled: boolean;
	quiet_hours_start: string;
	quiet_hours_end: string;
	timezone: string;

	created_at: string;
	updated_at: string;
}
```

#### Frontend Service

**Create** (`apps/web/src/lib/services/browser-notification.service.ts`):

```typescript
import { browser } from '$app/environment';
import { createSupabaseBrowser } from '$lib/supabase';

export class BrowserNotificationService {
	private supabase = browser ? createSupabaseBrowser() : null;

	/**
	 * Check if browser notifications are supported
	 */
	isSupported(): boolean {
		return browser && 'Notification' in window && 'serviceWorker' in navigator;
	}

	/**
	 * Get current permission status
	 */
	getPermissionStatus(): NotificationPermission {
		if (!this.isSupported()) return 'denied';
		return Notification.permission;
	}

	/**
	 * Request notification permission
	 */
	async requestPermission(): Promise<NotificationPermission> {
		if (!this.isSupported()) {
			throw new Error('Browser notifications not supported');
		}

		const permission = await Notification.requestPermission();

		// Update database
		if (this.supabase) {
			await this.supabase.from('user_browser_notification_preferences').upsert({
				permission_granted: permission === 'granted',
				permission_requested_at: new Date().toISOString(),
				permission_granted_at: permission === 'granted' ? new Date().toISOString() : null
			});
		}

		return permission;
	}

	/**
	 * Subscribe to push notifications
	 */
	async subscribe(): Promise<PushSubscription | null> {
		if (!this.isSupported() || Notification.permission !== 'granted') {
			return null;
		}

		const registration = await navigator.serviceWorker.ready;

		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: this.urlBase64ToUint8Array(
				import.meta.env.PUBLIC_VAPID_PUBLIC_KEY
			)
		});

		// Save subscription to database
		await this.saveSubscription(subscription);

		return subscription;
	}

	/**
	 * Unsubscribe from push notifications
	 */
	async unsubscribe(): Promise<void> {
		if (!this.isSupported()) return;

		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();

		if (subscription) {
			await subscription.unsubscribe();
			await this.removeSubscription(subscription);
		}
	}

	/**
	 * Save subscription to database
	 */
	private async saveSubscription(subscription: PushSubscription): Promise<void> {
		if (!this.supabase) return;

		const data = subscription.toJSON();

		await this.supabase.from('push_subscriptions').upsert({
			endpoint: data.endpoint,
			keys_p256dh: data.keys?.p256dh,
			keys_auth: data.keys?.auth,
			user_agent: navigator.userAgent,
			updated_at: new Date().toISOString(),
			last_used_at: new Date().toISOString()
		});
	}

	/**
	 * Remove subscription from database
	 */
	private async removeSubscription(subscription: PushSubscription): Promise<void> {
		if (!this.supabase) return;

		const data = subscription.toJSON();

		await this.supabase.from('push_subscriptions').delete().eq('endpoint', data.endpoint);
	}

	/**
	 * Convert VAPID key to Uint8Array
	 */
	private urlBase64ToUint8Array(base64String: string): Uint8Array {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		const rawData = window.atob(base64);
		const outputArray = new Uint8Array(rawData.length);

		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}

		return outputArray;
	}

	/**
	 * Get user preferences
	 */
	async getPreferences(): Promise<BrowserNotificationPreferences | null> {
		if (!this.supabase) return null;

		const { data } = await this.supabase
			.from('user_browser_notification_preferences')
			.select('*')
			.single();

		return data;
	}

	/**
	 * Update user preferences
	 */
	async updatePreferences(preferences: Partial<BrowserNotificationPreferences>): Promise<void> {
		if (!this.supabase) return;

		await this.supabase.from('user_browser_notification_preferences').upsert({
			...preferences,
			updated_at: new Date().toISOString()
		});
	}
}

export const browserNotificationService = new BrowserNotificationService();
```

#### API Endpoints

**Create** (`apps/web/src/routes/api/browser-notifications/preferences/+server.ts`):

```typescript
import { json } from '@sveltejs/kit';
import { createSupabaseServer } from '$lib/supabase';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const supabase = createSupabaseServer(locals);

	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { data, error } = await supabase
		.from('user_browser_notification_preferences')
		.select('*')
		.eq('user_id', user.id)
		.single();

	if (error && error.code !== 'PGRST116') {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ preferences: data });
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	const supabase = createSupabaseServer(locals);

	const {
		data: { user }
	} = await supabase.auth.getUser();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const preferences = await request.json();

	const { data, error } = await supabase
		.from('user_browser_notification_preferences')
		.upsert({
			user_id: user.id,
			...preferences,
			updated_at: new Date().toISOString()
		})
		.select()
		.single();

	if (error) {
		return json({ error: error.message }, { status: 500 });
	}

	return json({ preferences: data });
};
```

### Phase 3: Settings UI (3-4 hours)

**Create** (`apps/web/src/lib/components/settings/BrowserNotificationPreferences.svelte`):

Follow the exact pattern from `SMSPreferences.svelte`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { browserNotificationService } from '$lib/services/browser-notification.service';
	import { toastService } from '$lib/stores/toast.store';
	import { Bell, BellOff, CheckCircle, AlertCircle } from 'lucide-svelte';
	import type { BrowserNotificationPreferences } from '$lib/types/notification.types';

	let preferences: BrowserNotificationPreferences | null = $state(null);
	let permissionStatus: NotificationPermission = $state('default');
	let loading = $state(false);

	onMount(async () => {
		if (browserNotificationService.isSupported()) {
			permissionStatus = browserNotificationService.getPermissionStatus();
			preferences = await browserNotificationService.getPreferences();
		}
	});

	async function requestPermission() {
		loading = true;
		try {
			const permission = await browserNotificationService.requestPermission();

			if (permission === 'granted') {
				await browserNotificationService.subscribe();
				toastService.success('Browser notifications enabled!');
				permissionStatus = permission;
			} else {
				toastService.error('Permission denied. You can enable this in browser settings.');
			}
		} catch (error) {
			console.error('Failed to request permission:', error);
			toastService.error('Failed to enable notifications');
		} finally {
			loading = false;
		}
	}

	async function updatePreference(key: keyof BrowserNotificationPreferences, value: boolean) {
		try {
			await browserNotificationService.updatePreferences({ [key]: value });
			toastService.success('Preferences updated');
		} catch (error) {
			console.error('Failed to update preferences:', error);
			toastService.error('Failed to update preferences');
		}
	}
</script>

<div class="space-y-6">
	<div class="border-b pb-4">
		<h3 class="text-lg font-semibold">Browser Notifications</h3>
		<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
			Get real-time notifications in your browser
		</p>
	</div>

	<!-- Permission Status -->
	<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				{#if permissionStatus === 'granted'}
					<CheckCircle class="w-5 h-5 text-green-500" />
					<div>
						<p class="font-medium text-green-600 dark:text-green-400">Enabled</p>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Browser notifications are active
						</p>
					</div>
				{:else if permissionStatus === 'denied'}
					<AlertCircle class="w-5 h-5 text-red-500" />
					<div>
						<p class="font-medium text-red-600 dark:text-red-400">Blocked</p>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Enable notifications in your browser settings
						</p>
					</div>
				{:else}
					<Bell class="w-5 h-5 text-gray-500" />
					<div>
						<p class="font-medium">Not Enabled</p>
						<p class="text-sm text-gray-600 dark:text-gray-400">
							Click to enable browser notifications
						</p>
					</div>
				{/if}
			</div>

			{#if permissionStatus !== 'granted'}
				<button
					onclick={requestPermission}
					disabled={loading || permissionStatus === 'denied'}
					class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
				>
					{loading ? 'Requesting...' : 'Enable'}
				</button>
			{/if}
		</div>
	</div>

	<!-- Notification Type Preferences (only show if permission granted) -->
	{#if permissionStatus === 'granted' && preferences}
		<div class="space-y-4">
			<h4 class="font-medium">Notification Types</h4>

			<label class="flex items-start gap-3 cursor-pointer group">
				<input
					type="checkbox"
					checked={preferences.brain_dump_complete}
					onchange={(e) =>
						updatePreference('brain_dump_complete', e.currentTarget.checked)}
					class="mt-1"
				/>
				<div class="flex-1">
					<div class="font-medium flex items-center gap-2">
						<Bell class="w-4 h-4" />
						Brain Dump Complete
					</div>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Get notified when your brain dump has been processed
					</p>
				</div>
			</label>

			<label class="flex items-start gap-3 cursor-pointer group">
				<input
					type="checkbox"
					checked={preferences.daily_brief_ready}
					onchange={(e) => updatePreference('daily_brief_ready', e.currentTarget.checked)}
					class="mt-1"
				/>
				<div class="flex-1">
					<div class="font-medium flex items-center gap-2">
						<Bell class="w-4 h-4" />
						Daily Brief Ready
					</div>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Get notified when your daily brief is ready to view
					</p>
				</div>
			</label>

			<!-- More notification types... -->
		</div>

		<!-- Quiet Hours -->
		<div class="space-y-4">
			<h4 class="font-medium">Quiet Hours</h4>

			<label class="flex items-start gap-3 cursor-pointer">
				<input
					type="checkbox"
					checked={preferences.quiet_mode_enabled}
					onchange={(e) =>
						updatePreference('quiet_mode_enabled', e.currentTarget.checked)}
					class="mt-1"
				/>
				<div class="flex-1">
					<div class="font-medium">Enable Quiet Hours</div>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						Don't send notifications during quiet hours
					</p>
				</div>
			</label>

			{#if preferences.quiet_mode_enabled}
				<div class="grid grid-cols-2 gap-4 pl-8">
					<div>
						<label class="text-sm font-medium">Start Time</label>
						<input
							type="time"
							value={preferences.quiet_hours_start}
							onchange={(e) =>
								updatePreference('quiet_hours_start', e.currentTarget.value)}
							class="mt-1 w-full px-3 py-2 border rounded-lg"
						/>
					</div>
					<div>
						<label class="text-sm font-medium">End Time</label>
						<input
							type="time"
							value={preferences.quiet_hours_end}
							onchange={(e) =>
								updatePreference('quiet_hours_end', e.currentTarget.value)}
							class="mt-1 w-full px-3 py-2 border rounded-lg"
						/>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
```

**Add to settings page** (`apps/web/src/routes/settings/+page.svelte`):

```svelte
<script>
	import BrowserNotificationPreferences from '$lib/components/settings/BrowserNotificationPreferences.svelte';
</script>

<!-- Add to settings tabs -->
<BrowserNotificationPreferences />
```

### Phase 4: Backend Push Sender (4-6 hours)

**Install Dependencies** (`apps/worker`):

```bash
cd apps/worker
pnpm add web-push
pnpm add -D @types/web-push
```

**Create Push Service** (`apps/worker/src/services/push-notification.service.ts`):

```typescript
import webpush from 'web-push';
import { supabase } from './supabase';

// Configure VAPID details
webpush.setVapidDetails(
	process.env.VAPID_SUBJECT!,
	process.env.PUBLIC_VAPID_PUBLIC_KEY!,
	process.env.PRIVATE_VAPID_PRIVATE_KEY!
);

export interface PushNotificationPayload {
	title: string;
	body: string;
	url: string;
	tag?: string;
	priority?: 'normal' | 'high';
}

export class PushNotificationService {
	/**
	 * Send push notification to a user
	 */
	async sendToUser(userId: string, payload: PushNotificationPayload): Promise<void> {
		// Get user preferences
		const { data: prefs } = await supabase
			.from('user_browser_notification_preferences')
			.select('*')
			.eq('user_id', userId)
			.single();

		if (!prefs || !prefs.permission_granted) {
			console.log(`User ${userId} has not granted push permission`);
			return;
		}

		// Check quiet hours
		if (this.isQuietHours(prefs)) {
			console.log(`User ${userId} is in quiet hours, skipping push`);
			return;
		}

		// Get push subscriptions
		const { data: subscriptions } = await supabase
			.from('push_subscriptions')
			.select('*')
			.eq('user_id', userId);

		if (!subscriptions || subscriptions.length === 0) {
			console.log(`No push subscriptions found for user ${userId}`);
			return;
		}

		// Send to all subscriptions
		const results = await Promise.allSettled(
			subscriptions.map((sub) => this.sendToSubscription(sub, payload))
		);

		// Remove failed subscriptions (410 Gone = subscription expired)
		const failedIndexes = results
			.map((result, index) => (result.status === 'rejected' ? index : null))
			.filter((i) => i !== null);

		for (const index of failedIndexes) {
			const sub = subscriptions[index!];
			await supabase.from('push_subscriptions').delete().eq('id', sub.id);
		}
	}

	/**
	 * Send to a specific subscription
	 */
	private async sendToSubscription(
		subscription: any,
		payload: PushNotificationPayload
	): Promise<void> {
		const pushSubscription = {
			endpoint: subscription.endpoint,
			keys: {
				p256dh: subscription.keys_p256dh,
				auth: subscription.keys_auth
			}
		};

		try {
			await webpush.sendNotification(pushSubscription, JSON.stringify(payload), {
				TTL: 60 * 60 * 24, // 24 hours
				urgency: payload.priority === 'high' ? 'high' : 'normal'
			});

			// Update last_used_at
			await supabase
				.from('push_subscriptions')
				.update({ last_used_at: new Date().toISOString() })
				.eq('id', subscription.id);
		} catch (error: any) {
			if (error.statusCode === 410) {
				// Subscription expired, throw to mark for deletion
				throw error;
			}
			console.error('Failed to send push notification:', error);
		}
	}

	/**
	 * Check if current time is within quiet hours
	 */
	private isQuietHours(prefs: any): boolean {
		if (!prefs.quiet_mode_enabled) return false;

		const now = new Date();
		const userTime = new Date(now.toLocaleString('en-US', { timeZone: prefs.timezone }));
		const currentMinutes = userTime.getHours() * 60 + userTime.getMinutes();

		const [startHour, startMin] = prefs.quiet_hours_start.split(':').map(Number);
		const [endHour, endMin] = prefs.quiet_hours_end.split(':').map(Number);

		const startMinutes = startHour * 60 + startMin;
		const endMinutes = endHour * 60 + endMin;

		if (startMinutes < endMinutes) {
			return currentMinutes >= startMinutes && currentMinutes < endMinutes;
		} else {
			// Quiet hours span midnight
			return currentMinutes >= startMinutes || currentMinutes < endMinutes;
		}
	}

	/**
	 * Send brain dump complete notification
	 */
	async sendBrainDumpComplete(userId: string, brainDumpId: string): Promise<void> {
		await this.sendToUser(userId, {
			title: 'Brain Dump Complete',
			body: 'Your brain dump has been processed and tasks have been created',
			url: `/projects`,
			tag: `brain-dump-${brainDumpId}`
		});
	}

	/**
	 * Send daily brief ready notification
	 */
	async sendDailyBriefReady(userId: string, briefId: string): Promise<void> {
		await this.sendToUser(userId, {
			title: 'Daily Brief Ready',
			body: 'Your daily brief is ready to view',
			url: `/briefs/${briefId}`,
			tag: `daily-brief-${briefId}`
		});
	}
}

export const pushNotificationService = new PushNotificationService();
```

**Integrate with Notification Worker** (`apps/worker/src/workers/notificationWorker.ts`):

```typescript
import { pushNotificationService } from '../services/push-notification.service';

async function processNotificationJob(job: any) {
	const { userId, type, data } = job;

	// Get user preferences
	const prefs = await getUserNotificationPreferences(userId);

	// Send via enabled channels
	if (prefs.sms_enabled) {
		await sendSMS(userId, data);
	}

	if (prefs.email_enabled) {
		await sendEmail(userId, data);
	}

	// NEW: Send browser push if enabled
	if (prefs.browser_push_enabled) {
		switch (type) {
			case 'brain_dump_complete':
				await pushNotificationService.sendBrainDumpComplete(userId, data.brainDumpId);
				break;
			case 'daily_brief_ready':
				await pushNotificationService.sendDailyBriefReady(userId, data.briefId);
				break;
		}
	}
}
```

## Implementation Roadmap

### Week 1: Foundation

- [ ] Install `@vite-pwa/sveltekit` and dependencies
- [ ] Configure Vite plugin with manifest
- [ ] Create service worker with push event handlers
- [ ] Test service worker registration
- [ ] Generate VAPID keys and add to environment
- [ ] Test installation flow on iOS/Android

### Week 2: Database & API

- [ ] Create database migration for push subscriptions
- [ ] Create database migration for browser notification preferences
- [ ] Add TypeScript types
- [ ] Create `browser-notification.service.ts`
- [ ] Create API endpoints for preferences
- [ ] Test subscription flow end-to-end

### Week 3: Settings UI

- [ ] Create `BrowserNotificationPreferences.svelte` component
- [ ] Add to settings page
- [ ] Implement permission request flow
- [ ] Test granular preference controls
- [ ] Test quiet hours functionality
- [ ] Add to profile/settings navigation

### Week 4: Backend Integration

- [ ] Install `web-push` in worker service
- [ ] Create `push-notification.service.ts`
- [ ] Integrate with notification worker
- [ ] Add to brain dump complete flow
- [ ] Add to daily brief ready flow
- [ ] Test end-to-end notification delivery

### Week 5: Polish & Testing

- [ ] Test on iOS Safari (PWA installed)
- [ ] Test on Android Chrome (PWA installed)
- [ ] Test on desktop Chrome/Firefox/Safari
- [ ] Test permission denied scenario
- [ ] Test quiet hours
- [ ] Test subscription expiration handling
- [ ] Performance testing
- [ ] Security audit

## Effort Estimates

| Phase       | Description                                       | Hours           |
| ----------- | ------------------------------------------------- | --------------- |
| **Phase 1** | Service worker foundation                         | 4-6             |
| **Phase 2** | Push notification infrastructure (DB, API, types) | 4-6             |
| **Phase 3** | Settings UI                                       | 3-4             |
| **Phase 4** | Backend push sender                               | 4-6             |
| **Testing** | Cross-browser, mobile, edge cases                 | 2-3             |
| **Total**   | Complete implementation                           | **16-22 hours** |

## Cost Analysis

**Infrastructure Cost**: **$0**

- Browser push uses free browser-native push services (no FCM/Firebase needed)
- VAPID keys are free to generate
- Service worker runs in browser (no additional hosting cost)
- Existing Railway worker can handle push sending
- No additional database costs (Supabase included)

## Browser Compatibility

| Browser              | Push Notifications | PWA Install | Notes                       |
| -------------------- | ------------------ | ----------- | --------------------------- |
| **Chrome (Desktop)** | ✅ Yes             | ✅ Yes      | Full support                |
| **Chrome (Android)** | ✅ Yes             | ✅ Yes      | Best mobile experience      |
| **Safari (Desktop)** | ✅ Yes (macOS 13+) | ✅ Yes      | Recent support added        |
| **Safari (iOS)**     | ✅ Yes (iOS 16.4+) | ✅ Yes      | Add to Home Screen required |
| **Firefox**          | ✅ Yes             | ✅ Yes      | Full support                |
| **Edge**             | ✅ Yes             | ✅ Yes      | Chromium-based              |

**Note**: iOS Safari requires PWA to be installed (Add to Home Screen) for push notifications to work.

## Security Considerations

1. **VAPID Keys**: Private key must NEVER be exposed to client
2. **RLS Policies**: Enforce user-only access to subscriptions
3. **Subscription Validation**: Verify endpoint domains
4. **Data Privacy**: Don't send sensitive data in push payloads
5. **Rate Limiting**: Prevent notification spam
6. **Token Refresh**: Handle expired subscriptions gracefully

## Open Questions

1. **Onboarding vs Settings**: Start with settings-only, or add contextual prompts later?
    - **Recommendation**: Settings-only for MVP, evaluate usage before adding prompts

2. **Notification Types**: Which notifications should trigger browser push?
    - **Recommendation**: Start with brain dump complete and daily brief ready

3. **Priority Levels**: Should some notifications be high priority (require interaction)?
    - **Recommendation**: No high priority initially, all notifications should be dismissible

4. **Testing Strategy**: Real device testing vs emulator?
    - **Recommendation**: Real device testing required for iOS, emulator OK for Android

## Related Research

- `NOTIFICATION_SYSTEM_IMPLEMENTATION.md` - Phase 1 in-app notification system complete
- `generic-stackable-notification-system-spec.md` - Original notification system architecture
- `apps/web/docs/features/onboarding/README.md` - Onboarding system overview (permission timing)
- SMS integration docs - Similar permission request pattern

## Next Steps

1. ✅ **Review this research document**
2. Generate VAPID keys: `npx web-push generate-vapid-keys`
3. Add environment variables to Vercel (web) and Railway (worker)
4. Install `@vite-pwa/sveltekit` in web app
5. Create database migration
6. Follow implementation roadmap week by week
7. Test with real users before adding contextual prompts
8. Monitor adoption and iterate on UX

---

**Total Estimated Effort**: 16-22 hours
**Infrastructure Cost**: $0
**Priority**: Medium (nice-to-have enhancement, not critical)
**Recommendation**: Implement as settings-only feature first, evaluate adoption, then add contextual prompts if needed
