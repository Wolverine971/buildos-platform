<!-- docs/admin-tools-and-patterns.md -->

# Admin Tools & Manual Trigger Endpoints - Pattern Analysis

## Overview

The BuildOS platform has an extensive admin system with UI dashboard, API endpoints, and manual trigger mechanisms for testing and operations.

---

## 1. ADMIN AUTHENTICATION & AUTHORIZATION PATTERN

### Layout Protection

**File:** `/apps/web/src/routes/admin/+layout.server.ts`

```typescript
// All admin routes protected by layout guard
export const load: LayoutServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	// 1. Check if user is authenticated
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// 2. Check if user has admin role in database
	const { data: dbUser, error } = await supabase
		.from('users')
		.select('is_admin, email, name')
		.eq('id', user.id)
		.single();

	// 3. Redirect non-admin users to home
	if (error || !dbUser?.is_admin) {
		throw redirect(303, '/');
	}

	return { user: { ...dbUser, is_admin: true } };
};
```

**Key Patterns:**

- Two-tier authentication: Session auth + database role check
- Fails safely to home page (not error page) for unauthorized users
- Returns admin user data for use in components

### API Endpoint Admin Check

**Standard pattern across all admin endpoints:**

```typescript
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	// ... rest of logic
};
```

---

## 2. ADMIN DASHBOARD STRUCTURE

### Main Dashboard

**File:** `/apps/web/src/routes/admin/+page.svelte`

Features:

- Real-time analytics dashboard with 12+ metric cards
- Auto-refresh capability with configurable interval (30-second default)
- Multi-timeframe selection (7d, 30d, 90d)
- Data export to CSV
- Navigation cards to different admin sections

**Data Loading Pattern:**

```typescript
// Load multiple analytics endpoints in parallel
const [
	overviewRes,
	visitorOverviewRes,
	dailyVisitorsRes
	// ... 11+ more endpoints
] = await Promise.all([
	fetch('/api/admin/analytics/overview'),
	fetch('/api/admin/analytics/visitor-overview'),
	fetch(`/api/admin/analytics/daily-visitors?timeframe=${selectedTimeframe}`)
	// ...
]);
```

### Admin Navigation Hub

Admin dashboard has navigation cards to 10+ sections:

1. **Users** - User account management
2. **Notifications** - Notification analytics & testing
3. **Beta Program** - Beta member management
4. **Feedback** - User feedback review
5. **LLM Usage** - AI cost & performance metrics
6. **Errors** - System error logs
7. **Subscriptions** - Billing management (if Stripe enabled)
8. **Revenue** - Financial metrics (if Stripe enabled)

---

## 3. MANUAL TRIGGER ENDPOINTS PATTERN

### Test Notification Sender

**File:** `/apps/web/src/routes/api/admin/notifications/test/+server.ts`
**UI:** `/apps/web/src/routes/admin/notifications/test-bed/+page.svelte`

**Purpose:** Test notification delivery with full user context

**Request Structure:**

```typescript
interface TestNotificationRequest {
	event_type: EventType; // e.g., 'brief.completed'
	payload: Record<string, any>; // Event-specific payload
	recipient_user_ids: string[]; // Who receives the notification
	channels: NotificationChannel[]; // 'push', 'sms', 'email'
	test_mode?: boolean; // Default: true
}
```

**Key Features:**

- Rate limiting: 50 tests per hour per admin
- Max 20 recipients per test
- Payload validation and transformation
- Correlation ID tracking for end-to-end debugging
- Deduplication to prevent duplicate test notifications
- Creates notification_events and notification_deliveries records
- Queues jobs using atomic RPC with `add_queue_job`

**Response:**

```typescript
{
  success: true,
  data: {
    event_id: string,
    deliveries: Array<{
      id: string,
      channel: NotificationChannel,
      recipient_user_id: string,
      status: string
    }>
  }
}
```

### Notification Delivery Retry

**File:** `/apps/web/src/routes/api/admin/notifications/deliveries/[id]/retry/+server.ts`

**Purpose:** Manually retry a failed notification delivery

**Logic:**

1. Verify admin role
2. Get delivery record
3. Check if max_attempts exceeded
4. Reset status to 'pending'
5. Queue new job with `add_queue_job` RPC
6. Use dedup_key to prevent duplicate jobs

**Request:** POST `/api/admin/notifications/deliveries/{id}/retry`

### Email Manual Send

**File:** `/apps/web/src/routes/api/admin/emails/send/+server.ts`

**Purpose:** Send email directly from admin interface

**Validation:**

- Requires admin role
- Validates email address (critical security check)
- Requires: to, subject, body

**Features:**

- Email tracking with metadata
- Tracks creator (admin user ID)
- Optional user association

---

## 4. API RESPONSE PATTERN

**File:** `/apps/web/src/lib/utils/api-response.ts`

Standardized response utility used across all admin endpoints:

```typescript
// Success responses
ApiResponse.success(data, message, cacheConfig)
ApiResponse.created(data, message, cacheConfig)

// Error responses
ApiResponse.unauthorized()
ApiResponse.forbidden(message)
ApiResponse.badRequest(message, details)
ApiResponse.notFound(resource)
ApiResponse.databaseError(error)
ApiResponse.internalError(error, message)

// HTTP Status codes included
HttpStatus.OK, CREATED, BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, etc.

// Error codes for client-side handling
ErrorCode.UNAUTHORIZED, FORBIDDEN, INVALID_REQUEST, etc.
```

**Features:**

- Consistent JSON response format
- Optional caching headers with ETag support
- Type-safe error codes
- Safe error details (never expose internal errors)
- Cache control builder with SWR support

---

## 5. CRON/SCHEDULED JOB PATTERN

### Trial Reminder Cron

**File:** `/apps/web/src/routes/api/cron/trial-reminders/+server.ts`

**Security:** Bearer token validation (constant-time comparison)

```typescript
function constantTimeCompare(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	const expectedAuth = `Bearer ${PRIVATE_CRON_SECRET}`;

	if (!authHeader || !constantTimeCompare(authHeader, expectedAuth)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	// ...
};
```

**Pattern:**

- Uses `GET` (not POST) for idempotency
- Constant-time string comparison to prevent timing attacks
- Returns status and counts
- Logs execution to `cron_logs` table

---

## 6. COMPONENT PATTERNS FOR ADMIN UI

### AdminPageHeader Component

**File:** `/apps/web/src/lib/components/admin/AdminPageHeader.svelte`

**Features:**

- Back navigation button (configurable)
- Title with optional icon
- Description text
- Slot for right-side action buttons
- Responsive for mobile/desktop
- Dark mode support

**Usage:**

```svelte
<AdminPageHeader
	title="Admin Dashboard"
	description="System overview and user analytics"
	icon={BarChart3}
	showBack={false}
>
	<div slot="actions">
		<!-- Action buttons here -->
	</div>
</AdminPageHeader>
```

---

## 7. TESTING TOOLS

### Notification Test Bed

**File:** `/apps/web/src/routes/admin/notifications/test-bed/+page.svelte`

**Multi-step interface:**

1. **Step 1:** Search and select user by email/name
2. **Step 2:** Choose notification type with subscription awareness
3. **Step 3:** Select available channels (push, SMS, email)
4. **Step 4:** Configure channel-specific payloads

**Services Used:**

- `notificationTestService` - Send test notifications
- `notificationRealDataService` - Load real event data

**Real Data Loading:**
Users can load real notification data for a specific event type to test with actual payloads.

---

## 8. ADMIN TOOLS INVENTORY

### Analytics Endpoints

- `/api/admin/analytics/overview` - Key metrics
- `/api/admin/analytics/visitor-overview` - Visitor stats
- `/api/admin/analytics/daily-visitors` - Daily visitor trends
- `/api/admin/analytics/daily-signups` - Signup trends
- `/api/admin/analytics/daily-users` - Active user trends
- `/api/admin/analytics/brief-stats` - Brain dump stats
- `/api/admin/analytics/system-metrics` - System health
- `/api/admin/analytics/recent-activity` - User activity log
- `/api/admin/analytics/template-usage` - Template usage stats
- `/api/admin/analytics/comprehensive` - All metrics combined
- `/api/admin/analytics/export` - CSV export

### Notification Management

- `/api/admin/notifications/test` - Send test notifications
- `/api/admin/notifications/deliveries/[id]/retry` - Retry failed delivery
- `/api/admin/notifications/deliveries/[id]/resend` - Resend delivery
- `/api/admin/notifications/nlogs/*` - Notification logging

### User Management

- `/api/admin/users` - User list/search
- `/api/admin/users/[id]/context` - User context data
- `/api/admin/users/[id]/notification-context` - User notification preferences
- `/api/admin/users/[userId]/activity` - User activity log

### Email Tools

- `/api/admin/emails` - Email history
- `/api/admin/emails/send` - Send email manually
- `/api/admin/emails/generate` - Generate email via LLM
- `/api/admin/emails/recipients` - Search email recipients

### Error Management

- `/api/admin/errors` - Error logs
- `/api/admin/errors/[id]/resolve` - Mark error as resolved

### Feedback

- `/api/admin/feedback` - Feedback data
- `/api/admin/feedback/overview` - Feedback summary

### Beta Program

- `/api/admin/beta/overview` - Beta stats
- `/api/admin/beta/members` - Beta members
- `/api/admin/beta/signups` - Beta signups

### Revenue (Stripe)

- `/api/admin/subscriptions/overview` - Subscription stats
- `/api/admin/subscriptions/users` - Subscriber list
- `/api/admin/revenue` - Revenue metrics
- `/api/admin/revenue/export` - Revenue CSV export

---

## 9. SECURITY BEST PRACTICES OBSERVED

1. **Two-tier Auth:** Session check + database role verification
2. **Constant-time Comparison:** Used for secret validation (timing attack prevention)
3. **Rate Limiting:** 50 tests/hour per admin, max 20 recipients per test
4. **Email Validation:** Critical check before sending
5. **Deduplication Keys:** Prevent duplicate job queueing
6. **Safe Error Messages:** Never expose internal errors to client
7. **Correlation IDs:** Track requests end-to-end for debugging
8. **Job Queuing:** Uses atomic RPC with `add_queue_job` for reliability

---

## 10. RECOMMENDED PATTERNS FOR NEW ADMIN TOOL

### Structure for Daily SMS Limit Admin Tool:

```typescript
// File: /apps/web/src/routes/api/admin/sms/trigger-daily-limit-check/+server.ts

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	// 1. Admin auth
	const { user } = await safeGetSession();
	if (!user?.is_admin) return ApiResponse.forbidden('Admin access required');

	// 2. Validate input
	const body = await parseRequestBody(request);
	const { userId, forceCheck = false } = body;

	// 3. Rate limiting (if needed)
	// const rateLimitOk = await checkRateLimit(user.id, 'daily_sms_check');

	// 4. Main logic
	try {
		// Queue job or execute directly
		const { data, error } = await supabase.rpc('add_queue_job', {
			p_user_id: userId || null,
			p_job_type: 'check_daily_sms_limit',
			p_metadata: {
				triggered_by_admin: user.id,
				force_check: forceCheck,
				correlationId: generateCorrelationId()
			},
			p_priority: 10,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `sms_limit_${userId || 'all'}`
		});

		if (error) return ApiResponse.databaseError(error);

		// 5. Return success
		return ApiResponse.success({
			job_id: data,
			message: 'Daily SMS limit check triggered'
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to trigger check');
	}
};
```

### UI Component Pattern:

```svelte
<!-- File: /apps/web/src/routes/admin/sms/+page.svelte -->

<script lang="ts">
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let isLoading = $state(false);
	let selectedUserId = $state<string | null>(null);

	async function triggerDailySmsCheck() {
		isLoading = true;
		try {
			const response = await fetch('/api/admin/sms/trigger-daily-limit-check', {
				method: 'POST',
				body: JSON.stringify({
					userId: selectedUserId,
					forceCheck: true
				})
			});

			if (!response.ok) throw new Error('Failed to trigger check');
			const result = await response.json();
			// Show success message
		} finally {
			isLoading = false;
		}
	}
</script>

<AdminPageHeader
	title="SMS Daily Limit Management"
	description="Manually trigger daily SMS limit checks"
	icon={MessageSquare}
>
	<div slot="actions">
		<Button onClick={triggerDailySmsCheck} disabled={isLoading} loading={isLoading}>
			Trigger Check
		</Button>
	</div>
</AdminPageHeader>
```

---

## Summary of Key Patterns

| Pattern                     | Location                                   | Use Case                 |
| --------------------------- | ------------------------------------------ | ------------------------ |
| **Admin Layout Protection** | `/admin/+layout.server.ts`                 | All admin routes         |
| **API Admin Check**         | All `/api/admin/*` endpoints               | Endpoint protection      |
| **Response Utility**        | `api-response.ts`                          | Consistent API responses |
| **Test Endpoint**           | `/api/admin/notifications/test/+server.ts` | Manual trigger pattern   |
| **Cron Endpoint**           | `/api/cron/trial-reminders/+server.ts`     | Scheduled tasks          |
| **UI Component Header**     | `AdminPageHeader.svelte`                   | Admin pages              |
| **Multi-step Testing UI**   | `test-bed/+page.svelte`                    | Complex admin workflows  |
| **Job Queueing**            | Uses `add_queue_job` RPC                   | Background job execution |
