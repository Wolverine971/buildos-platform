# SvelteKit + Supabase Remediation Plan

**Created:** November 6, 2025
**Audit Reference:** [sveltekit-supabase-audit-2025-11.md](./sveltekit-supabase-audit-2025-11.md)

## todo 2

## Overview

This document provides an actionable remediation plan for implementing best practices improvements identified in the BuildOS architecture audit. Tasks are prioritized by security impact, performance benefit, and implementation complexity.

**Overall Status:** 10 tasks, ~48 hours estimated work

---

## Priority Matrix

```
                HIGH IMPACT
                    │
    QUICK WINS      │      MAJOR PROJECTS
    ─────────────────┼─────────────────────
    • Timing attack │  • Root layout refactor
    • Auth listener │  • Form actions
    • API responses │  • Component splitting
    ─────────────────┼─────────────────────
                    │
    LOW PRIORITY    │      NICE TO HAVE
    • Docs          │  • Server streaming
                    │  • Timeout protection
                    │
                LOW EFFORT → HIGH EFFORT
```

---

## 🔴 CRITICAL PRIORITY (Week 1)

### 1. Fix Timing Attack Vulnerability

**Priority:** 🔴 Critical
**Effort:** 30 minutes
**Impact:** Security - Prevents timing attacks on cron secret

**Issue:**
`/api/cron/renew-webhooks/+server.ts` uses non-constant-time string comparison, vulnerable to timing attacks.

**Implementation:**

```typescript
// apps/web/src/routes/api/cron/renew-webhooks/+server.ts

import { timingSafeEqual } from 'crypto';
import { ApiResponse } from '$lib/utils/api-response';

function constantTimeCompare(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	try {
		return timingSafeEqual(Buffer.from(a), Buffer.from(b));
	} catch {
		return false;
	}
}

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	const expectedAuth = `Bearer ${PRIVATE_CRON_SECRET}`;

	// ✅ Use constant-time comparison
	if (!authHeader || !constantTimeCompare(authHeader, expectedAuth)) {
		return ApiResponse.unauthorized();
	}

	// ... rest of handler
};
```

**Testing:**

```bash
# Test with correct secret
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5173/api/cron/renew-webhooks

# Test with wrong secret
curl -H "Authorization: Bearer wrong" http://localhost:5173/api/cron/renew-webhooks
```

**Acceptance Criteria:**

- [ ] All cron endpoints use `constantTimeCompare()`
- [ ] No timing variation between correct/incorrect secrets
- [ ] Tests pass with valid and invalid credentials

---

### 2. Add Auth State Change Listener

**Priority:** 🔴 High
**Effort:** 1 hour
**Impact:** UX - Real-time session updates, immediate logout propagation

**Issue:**
No `onAuthStateChange` listener in main layout. Session refresh events don't trigger UI updates.

**Implementation:**

```typescript
// apps/web/src/routes/+layout.svelte

import { onMount } from 'svelte';
import { goto, invalidate } from '$app/navigation';
import { createSupabaseBrowser } from '$lib/supabase';
import { browser } from '$app/environment';

const supabase = browser ? createSupabaseBrowser() : null;

onMount(() => {
	if (!supabase) return;

	// Subscribe to auth state changes
	const {
		data: { subscription }
	} = supabase.auth.onAuthStateChange(async (event, session) => {
		console.log('[Auth] State changed:', event);

		switch (event) {
			case 'SIGNED_OUT':
				// User signed out - redirect to login
				await goto('/auth/login', { invalidateAll: true });
				break;

			case 'TOKEN_REFRESHED':
				// Token refreshed - update layout data
				await invalidate('app:auth');
				break;

			case 'USER_UPDATED':
				// User profile updated - refresh data
				await invalidate('app:auth');
				break;

			case 'SIGNED_IN':
				// User signed in - might want to redirect
				if (window.location.pathname.startsWith('/auth')) {
					await goto('/', { invalidateAll: true });
				}
				break;
		}
	});

	// Cleanup subscription on unmount
	return () => {
		subscription.unsubscribe();
	};
});
```

**Testing:**

1. Open app in two tabs
2. Log out in one tab
3. Verify other tab redirects to login
4. Test token refresh (wait 1 hour or manually trigger)
5. Update user profile, verify UI updates

**Acceptance Criteria:**

- [ ] Auth state changes trigger UI updates
- [ ] Logout in one tab affects all tabs
- [ ] Token refresh updates session data
- [ ] No console errors during auth events
- [ ] Subscription properly cleaned up on unmount

---

### 3. Standardize API Responses

**Priority:** 🔴 High
**Effort:** 1 hour
**Impact:** Consistency - Uniform error handling across all endpoints

**Issue:**
Some cron endpoints use `json()` instead of `ApiResponse`, breaking consistent error format.

**Files to Update:**

- `apps/web/src/routes/api/cron/trial-reminders/+server.ts`
- `apps/web/src/routes/api/cron/renew-webhooks/+server.ts`
- `apps/web/src/routes/api/cron/dunning/+server.ts`

**Implementation:**

```typescript
// Before
return json({ error: 'Unauthorized' }, { status: 401 });
return json({ success: true, sent });

// After
import { ApiResponse } from '$lib/utils/api-response';

return ApiResponse.unauthorized();
return ApiResponse.success({ sent });
```

**Search and Replace:**

```bash
# Find all instances
grep -r "return json(" apps/web/src/routes/api/cron/

# Replace pattern:
# json({ error: 'X' }, { status: 401 }) → ApiResponse.unauthorized()
# json({ error: 'X' }, { status: 403 }) → ApiResponse.forbidden()
# json({ success: true, ... }) → ApiResponse.success({ ... })
```

**Testing:**

```bash
# Test each cron endpoint
pnpm run test src/routes/api/cron/
```

**Acceptance Criteria:**

- [ ] All API endpoints use `ApiResponse`
- [ ] No direct `json()` calls in API routes
- [ ] Error format consistent across all endpoints
- [ ] Tests pass

---

### 4. Reduce Root Layout Data Loading

**Priority:** 🔴 High
**Effort:** 3 hours
**Impact:** Performance - Faster navigation, especially for public pages

**Issue:**
Root layout loads subscription, trial, and payment data for EVERY page, even public pages.

**Implementation:**

**Step 1: Simplify root layout**

```typescript
// apps/web/src/routes/+layout.server.ts

export const load: LayoutServerLoad = async ({
	locals: { safeGetSession },
	cookies,
	url,
	depends
}) => {
	depends('app:auth');

	const { user } = await safeGetSession();

	// Return only essential data
	return {
		user,
		url: url.origin,
		cookies: cookies.getAll(),
		stripeEnabled: StripeService.isEnabled()
	};
};
```

**Step 2: Create authenticated route group layout**

```typescript
// apps/web/src/routes/(authenticated)/+layout.server.ts

export const load: LayoutServerLoad = async ({ parent, locals: { supabase } }) => {
	const { user } = await parent();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// Load authenticated user data
	const [subscription, trialStatus, paymentWarnings] = await Promise.all([
		checkUserSubscription(supabase, user.id),
		supabase.rpc('get_user_trial_status', { p_user_id: user.id }).single(),
		fetchPaymentWarnings(supabase, user.id)
	]);

	return {
		subscription,
		trialStatus: trialStatus.data,
		paymentWarnings: paymentWarnings || [],
		isReadOnly: trialStatus.data?.is_read_only || false
	};
};
```

**Step 3: Move routes to authenticated group**

```bash
# Restructure routes
apps/web/src/routes/
├── (authenticated)/          # NEW: Authenticated routes group
│   ├── +layout.server.ts    # Loads subscription/trial data
│   ├── +layout.svelte       # Shows trial banner, payment warnings
│   ├── projects/
│   ├── briefs/
│   ├── ontology/
│   └── admin/
├── auth/                    # Public auth pages
├── (marketing)/             # NEW: Public pages group
│   ├── about/
│   ├── pricing/
│   └── terms/
└── +layout.server.ts        # Minimal - just user session
```

**Step 4: Update components**

```svelte
<!-- apps/web/src/routes/(authenticated)/+layout.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import TrialBanner from '$lib/components/trial/TrialBanner.svelte';
	import PaymentWarning from '$lib/components/notifications/PaymentWarning.svelte';

	let { data, children } = $props();
	let { user, subscription, trialStatus, paymentWarnings, isReadOnly } = data;
</script>

{#if user && trialStatus}
	<TrialBanner {user} {trialStatus} />
{/if}

{#if paymentWarnings.length > 0}
	<div class="container mx-auto px-4 mt-4">
		{#each paymentWarnings as warning (warning.id)}
			<PaymentWarning notification={warning} />
		{/each}
	</div>
{/if}

<slot />
```

**Testing:**

```bash
# Measure before
time curl http://localhost:5173/about

# Measure after (should be faster)
time curl http://localhost:5173/about

# Test authenticated pages still work
curl http://localhost:5173/projects
```

**Acceptance Criteria:**

- [ ] Public pages don't load subscription data
- [ ] Authenticated pages load subscription data
- [ ] Navigation to `/about` is 50%+ faster
- [ ] All existing functionality works
- [ ] Trial banner and payment warnings still display

---

## 🟡 HIGH PRIORITY (Week 2)

### 5. Create Shared Auth Layout

**Priority:** 🟡 Medium-High
**Effort:** 1 hour
**Impact:** Maintainability - DRY, consistent auth page styling

**Issue:**
Login, register, and forgot-password pages duplicate 50+ lines of layout code.

**Implementation:**

```svelte
<!-- apps/web/src/routes/auth/+layout.svelte -->
<script lang="ts">
	let { children } = $props();
</script>

<div
	class="flex items-center justify-center min-h-screen min-h-[100dvh] px-4 bg-slate-50 dark:bg-slate-900"
>
	<div class="max-w-md w-full space-y-8 py-12">
		<!-- Shared branding -->
		<div class="text-center">
			<video
				src="/onboarding-assets/animations/brain-bolt-electric.mp4"
				autoplay
				loop
				muted
				playsinline
				class="h-24 w-24 mx-auto mb-4"
			/>
			<a href="/" class="text-2xl font-bold text-blue-600 dark:text-blue-400"> BuildOS </a>
		</div>

		<!-- Page content -->
		<div class="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8">
			{@render children()}
		</div>

		<!-- Shared footer links -->
		<div class="text-center text-sm text-gray-600 dark:text-gray-400">
			<p>
				Need help? <a href="/help" class="text-blue-600 dark:text-blue-400 hover:underline"
					>Contact Support</a
				>
			</p>
		</div>
	</div>
</div>
```

**Step 2: Simplify child pages**

```svelte
<!-- apps/web/src/routes/auth/login/+page.svelte -->
<script lang="ts">
	// Remove all layout code
	// Just keep form logic
</script>

<h2 class="text-3xl font-bold text-center mb-8 text-gray-900 dark:text-white">Welcome back</h2>

<form>
	<!-- Form fields -->
</form>
```

**Diff Preview:**

```diff
<!-- login/+page.svelte -->
- <div class="flex items-center justify-center px-4">
-   <div class="max-w-md w-full space-y-8 py-12">
-     <div class="text-center">
-       <video src="/onboarding-assets/animations/brain-bolt-electric.mp4" />
-       <h2 class="text-3xl font-bold">Welcome back</h2>
-     </div>
-     <form>...</form>
-   </div>
- </div>

+ <h2 class="text-3xl font-bold text-center mb-8">Welcome back</h2>
+ <form>...</form>
```

**Testing:**

1. Visit `/auth/login` - should look the same
2. Visit `/auth/register` - should look the same
3. Visit `/auth/forgot-password` - should look the same
4. Check dark mode toggle
5. Test responsive layout on mobile

**Acceptance Criteria:**

- [ ] Auth pages look identical before/after
- [ ] No code duplication
- [ ] Dark mode works
- [ ] Responsive on all screen sizes
- [ ] All links work

---

### 6. Add Rate Limiting Middleware

**Priority:** 🟡 Medium-High
**Effort:** 4 hours
**Impact:** Security - Prevents API abuse

**Issue:**
Only brain dump endpoints have rate limiting. Other expensive operations unprotected.

**Implementation:**

**Step 1: Create middleware**

```typescript
// apps/web/src/lib/middleware/rate-limit.ts

import { rateLimiter, RATE_LIMITS } from '$lib/services/rate-limiter';
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from '@sveltejs/kit';

export interface RateLimitConfig {
	limit: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS];
	keyFn?: (event: any) => string; // Custom key extraction
	skipAuth?: boolean; // Skip auth check (for public endpoints)
}

export function rateLimitMiddleware(
	handler: RequestHandler,
	config: RateLimitConfig
): RequestHandler {
	return async (event) => {
		const { locals } = event;

		// Get rate limit key (default: user ID)
		let key: string;
		if (config.keyFn) {
			key = config.keyFn(event);
		} else if (config.skipAuth) {
			// Use IP address for public endpoints
			key =
				event.request.headers.get('x-forwarded-for') ||
				event.request.headers.get('x-real-ip') ||
				'unknown';
		} else {
			const { user } = await locals.safeGetSession();
			if (!user) {
				return ApiResponse.unauthorized();
			}
			key = user.id;
		}

		// Check rate limit
		const result = rateLimiter.check(key, config.limit);
		if (!result.allowed) {
			const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
			return ApiResponse.rateLimit(retryAfter);
		}

		// Call handler
		return handler(event);
	};
}
```

**Step 2: Add rate limit response helper**

```typescript
// apps/web/src/lib/utils/api-response.ts

export class ApiResponse {
	// ... existing methods

	static rateLimit(retryAfter: number): Response {
		return json(
			{
				error: 'Rate limit exceeded',
				retryAfter,
				message: `Too many requests. Please try again in ${retryAfter} seconds.`
			},
			{
				status: 429,
				headers: {
					'Retry-After': retryAfter.toString(),
					'X-RateLimit-Remaining': '0'
				}
			}
		);
	}
}
```

**Step 3: Define rate limits**

```typescript
// apps/web/src/lib/services/rate-limiter.ts

export const RATE_LIMITS = {
	// AI operations
	API_AI: { max: 20, window: 60 * 60 * 1000 }, // 20/hour
	API_AI_HEAVY: { max: 5, window: 60 * 60 * 1000 }, // 5/hour

	// Mutations
	API_MUTATION: { max: 100, window: 60 * 1000 }, // 100/min
	API_MUTATION_HEAVY: { max: 30, window: 60 * 1000 }, // 30/min

	// Reads
	API_READ: { max: 300, window: 60 * 1000 }, // 300/min

	// Public endpoints
	PUBLIC_FORM: { max: 5, window: 60 * 1000 } // 5/min
} as const;
```

**Step 4: Apply to endpoints**

```typescript
// apps/web/src/routes/api/projects/+server.ts

import { rateLimitMiddleware } from '$lib/middleware/rate-limit';
import { RATE_LIMITS } from '$lib/services/rate-limiter';

export const POST = rateLimitMiddleware(
	async ({ request, locals }) => {
		// Create project logic
		// ...
		return ApiResponse.success(project);
	},
	{ limit: RATE_LIMITS.API_MUTATION }
);

export const GET = rateLimitMiddleware(
	async ({ locals }) => {
		// List projects logic
		// ...
		return ApiResponse.success(projects);
	},
	{ limit: RATE_LIMITS.API_READ }
);
```

**Endpoints to Update (Priority Order):**

1. **AI Operations** (Heavy)
    - ✅ Already done: `/api/braindumps/stream`
    - `/api/chat/stream`
    - `/api/phases/generate`

2. **Mutations** (Medium)
    - `/api/projects/+server.ts` (POST)
    - `/api/tasks/+server.ts` (POST, PUT, DELETE)
    - `/api/notes/+server.ts` (POST, PUT, DELETE)
    - `/api/feedback/+server.ts` (POST)

3. **Public Forms** (Low)
    - `/api/auth/register/+server.ts`
    - `/api/feedback/+server.ts` (public)

**Testing:**

```typescript
// apps/web/src/lib/middleware/rate-limit.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rateLimitMiddleware } from './rate-limit';

describe('rateLimitMiddleware', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('allows requests under limit', async () => {
		const handler = vi.fn().mockResolvedValue({ status: 200 });
		const middleware = rateLimitMiddleware(handler, {
			limit: { max: 10, window: 60000 }
		});

		const event = mockEvent({ userId: 'user-1' });
		const response = await middleware(event);

		expect(handler).toHaveBeenCalled();
		expect(response.status).toBe(200);
	});

	it('blocks requests over limit', async () => {
		const handler = vi.fn();
		const middleware = rateLimitMiddleware(handler, {
			limit: { max: 1, window: 60000 }
		});

		const event = mockEvent({ userId: 'user-1' });

		// First request - allowed
		await middleware(event);

		// Second request - blocked
		const response = await middleware(event);

		expect(handler).toHaveBeenCalledTimes(1);
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBeDefined();
	});

	it('uses IP for public endpoints', async () => {
		const handler = vi.fn().mockResolvedValue({ status: 200 });
		const middleware = rateLimitMiddleware(handler, {
			limit: { max: 10, window: 60000 },
			skipAuth: true
		});

		const event = mockEvent({
			ip: '127.0.0.1',
			skipAuth: true
		});

		await middleware(event);
		expect(handler).toHaveBeenCalled();
	});
});
```

```bash
pnpm run test src/lib/middleware/rate-limit.test.ts
```

**Acceptance Criteria:**

- [ ] Middleware created and tested
- [ ] Rate limits defined for all endpoint types
- [ ] AI endpoints limited to 20/hour
- [ ] Mutation endpoints limited to 100/min
- [ ] Read endpoints limited to 300/min
- [ ] Public forms limited to 5/min
- [ ] Response includes `Retry-After` header
- [ ] Tests pass

---

### 7. Implement Form Actions for Auth

**Priority:** 🟡 Medium
**Effort:** 6 hours
**Impact:** Standards - Progressive enhancement, works without JS

**Issue:**
All auth mutations use client-side `fetch()` to API routes. No progressive enhancement.

**Implementation:**

**Step 1: Login form action**

```typescript
// apps/web/src/routes/auth/login/+page.server.ts

import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;

		// Validation
		if (!email || !password) {
			return fail(400, {
				error: 'Email and password are required',
				email
			});
		}

		// Authenticate
		const { error } = await locals.supabase.auth.signInWithPassword({
			email,
			password
		});

		if (error) {
			return fail(401, {
				error: error.message,
				email
			});
		}

		// Success - redirect
		throw redirect(303, '/');
	}
};
```

```svelte
<!-- apps/web/src/routes/auth/login/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let isSubmitting = $state(false);
</script>

<h2 class="text-3xl font-bold text-center mb-8">Welcome back</h2>

{#if form?.error}
	<div
		class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4"
	>
		<p class="text-red-800 dark:text-red-200 text-sm">{form.error}</p>
	</div>
{/if}

<form
	method="POST"
	use:enhance={() => {
		isSubmitting = true;
		return async ({ update }) => {
			await update();
			isSubmitting = false;
		};
	}}
>
	<div class="space-y-4">
		<div>
			<label
				for="email"
				class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
			>
				Email
			</label>
			<input
				id="email"
				name="email"
				type="email"
				required
				value={form?.email || ''}
				class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600"
			/>
		</div>

		<div>
			<label
				for="password"
				class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
			>
				Password
			</label>
			<input
				id="password"
				name="password"
				type="password"
				required
				class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600"
			/>
		</div>

		<button
			type="submit"
			disabled={isSubmitting}
			class="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
		>
			{isSubmitting ? 'Signing in...' : 'Sign In'}
		</button>
	</div>
</form>

<p class="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
	Don't have an account?
	<a href="/auth/register" class="text-blue-600 dark:text-blue-400 hover:underline"> Sign up </a>
</p>
```

**Step 2: Register form action**

```typescript
// apps/web/src/routes/auth/register/+page.server.ts

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;
		const password = formData.get('password') as string;
		const name = formData.get('name') as string;

		// Validation
		if (!email || !password || !name) {
			return fail(400, {
				error: 'All fields are required',
				email,
				name
			});
		}

		if (password.length < 8) {
			return fail(400, {
				error: 'Password must be at least 8 characters',
				email,
				name
			});
		}

		// Create account
		const { data, error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: {
				data: { name }
			}
		});

		if (error) {
			return fail(400, {
				error: error.message,
				email,
				name
			});
		}

		// Check if email confirmation required
		if (data.user && !data.session) {
			return {
				success: true,
				message: 'Please check your email to confirm your account'
			};
		}

		// Auto-signed in - redirect
		throw redirect(303, '/');
	}
};
```

**Step 3: Forgot password form action**

```typescript
// apps/web/src/routes/auth/forgot-password/+page.server.ts

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;

		if (!email) {
			return fail(400, {
				error: 'Email is required'
			});
		}

		// Send reset email
		const { error } = await locals.supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/auth/reset-password`
		});

		if (error) {
			return fail(400, {
				error: error.message,
				email
			});
		}

		return {
			success: true,
			message: 'Password reset email sent! Check your inbox.'
		};
	}
};
```

**Testing:**

```bash
# Test without JavaScript
# 1. Open Chrome DevTools
# 2. Disable JavaScript (Cmd+Shift+P > "Disable JavaScript")
# 3. Try to login - should work!
# 4. Try to register - should work!

# Test with JavaScript
# 5. Enable JavaScript
# 6. Test forms again - should have enhanced UX (no full page reload)
```

**Acceptance Criteria:**

- [ ] Login form works without JavaScript
- [ ] Register form works without JavaScript
- [ ] Forgot password form works without JavaScript
- [ ] Forms show validation errors
- [ ] Enhanced UX with JavaScript (use:enhance)
- [ ] Redirect works after successful submission
- [ ] All existing functionality preserved

---

## 🟢 MEDIUM PRIORITY (Week 3)

### 8. Split Large Components

**Priority:** 🟢 Medium
**Effort:** 12 hours
**Impact:** Maintainability - Easier to test, understand, and optimize

**Issue:**
`projects/[id]/+page.svelte` is 1,687 lines. Single component with too many responsibilities.

**Implementation:**

**Step 1: Extract composition functions**

```typescript
// apps/web/src/routes/projects/[id]/_composables/useProjectData.ts

import { writable, derived } from 'svelte/store';
import type { Project, Task, Note } from '$lib/types';

export interface ProjectDataState {
	project: Project | null;
	tasks: Task[];
	notes: Note[];
	isLoading: boolean;
	error: string | null;
}

export function useProjectData(projectId: string) {
	const state = writable<ProjectDataState>({
		project: null,
		tasks: [],
		notes: [],
		isLoading: true,
		error: null
	});

	async function loadProject() {
		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			const [project, tasks, notes] = await Promise.all([
				fetchProject(projectId),
				fetchTasks(projectId),
				fetchNotes(projectId)
			]);

			state.update((s) => ({
				...s,
				project,
				tasks,
				notes,
				isLoading: false
			}));
		} catch (err) {
			state.update((s) => ({
				...s,
				error: err.message,
				isLoading: false
			}));
		}
	}

	async function refreshProject() {
		await loadProject();
	}

	return {
		state,
		loadProject,
		refreshProject
	};
}
```

```typescript
// apps/web/src/routes/projects/[id]/_composables/useProjectHandlers.ts

export function useProjectHandlers(projectData) {
	async function handleTaskCreate(taskData: Partial<Task>) {
		// Create task logic
		await projectData.refreshProject();
	}

	async function handleTaskUpdate(taskId: string, updates: Partial<Task>) {
		// Update task logic
		await projectData.refreshProject();
	}

	async function handleTaskDelete(taskId: string) {
		// Delete task logic
		await projectData.refreshProject();
	}

	return {
		handleTaskCreate,
		handleTaskUpdate,
		handleTaskDelete
	};
}
```

**Step 2: Extract components**

```svelte
<!-- apps/web/src/routes/projects/[id]/_components/ProjectHeader.svelte -->
<script lang="ts">
	import type { Project } from '$lib/types';

	let { project, onEdit, onDelete } = $props<{
		project: Project;
		onEdit: () => void;
		onDelete: () => void;
	}>();
</script>

<div class="flex items-center justify-between mb-6">
	<div>
		<h1 class="text-3xl font-bold text-gray-900 dark:text-white">
			{project.name}
		</h1>
		<p class="text-gray-600 dark:text-gray-400 mt-1">
			{project.description}
		</p>
	</div>

	<div class="flex gap-2">
		<button onclick={onEdit} class="btn btn-secondary"> Edit </button>
		<button onclick={onDelete} class="btn btn-danger"> Delete </button>
	</div>
</div>
```

```svelte
<!-- apps/web/src/routes/projects/[id]/_components/ProjectTabs.svelte -->
<script lang="ts">
	let { activeTab, onTabChange } = $props<{
		activeTab: string;
		onTabChange: (tab: string) => void;
	}>();

	const tabs = [
		{ id: 'tasks', label: 'Tasks', icon: 'CheckSquare' },
		{ id: 'notes', label: 'Notes', icon: 'FileText' },
		{ id: 'calendar', label: 'Calendar', icon: 'Calendar' },
		{ id: 'context', label: 'Context', icon: 'Info' }
	];
</script>

<div class="border-b border-gray-200 dark:border-gray-700">
	<nav class="flex space-x-8">
		{#each tabs as tab}
			<button
				onclick={() => onTabChange(tab.id)}
				class="py-4 px-1 border-b-2 font-medium text-sm {activeTab === tab.id
					? 'border-blue-500 text-blue-600'
					: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
			>
				{tab.label}
			</button>
		{/each}
	</nav>
</div>
```

**Step 3: Simplify main page**

```svelte
<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import ProjectHeader from './_components/ProjectHeader.svelte';
	import ProjectTabs from './_components/ProjectTabs.svelte';
	import TasksList from './_components/TasksList.svelte';
	import NotesList from './_components/NotesList.svelte';
	import { useProjectData } from './_composables/useProjectData';
	import { useProjectHandlers } from './_composables/useProjectHandlers';

	let { data } = $props();

	// Composition functions
	const projectData = useProjectData($page.params.id);
	const handlers = useProjectHandlers(projectData);

	let activeTab = $state('tasks');

	onMount(() => {
		projectData.loadProject();
	});

	$effect(() => {
		// Subscribe to real-time updates
		const unsubscribe = subscribeToProjectUpdates($page.params.id, () => {
			projectData.refreshProject();
		});
		return unsubscribe;
	});
</script>

<div class="max-w-7xl mx-auto">
	{#if $projectData.state.isLoading}
		<ProjectSkeleton />
	{:else if $projectData.state.error}
		<ErrorMessage message={$projectData.state.error} />
	{:else if $projectData.state.project}
		<ProjectHeader
			project={$projectData.state.project}
			onEdit={handlers.handleProjectEdit}
			onDelete={handlers.handleProjectDelete}
		/>

		<ProjectTabs {activeTab} onTabChange={(tab) => (activeTab = tab)} />

		<div class="mt-6">
			{#if activeTab === 'tasks'}
				<TasksList
					tasks={$projectData.state.tasks}
					onCreate={handlers.handleTaskCreate}
					onUpdate={handlers.handleTaskUpdate}
					onDelete={handlers.handleTaskDelete}
				/>
			{:else if activeTab === 'notes'}
				<NotesList
					notes={$projectData.state.notes}
					onCreate={handlers.handleNoteCreate}
					onUpdate={handlers.handleNoteUpdate}
					onDelete={handlers.handleNoteDelete}
				/>
			{/if}
		</div>
	{/if}
</div>
```

**Before/After:**

```
Before:
projects/[id]/+page.svelte (1,687 lines)

After:
projects/[id]/
  +page.svelte (~200 lines)
  _components/
    ProjectHeader.svelte (~80 lines)
    ProjectTabs.svelte (~50 lines)
    TasksList.svelte (~200 lines)
    NotesList.svelte (~150 lines)
    CalendarView.svelte (~180 lines)
    ContextView.svelte (~120 lines)
  _composables/
    useProjectData.ts (~150 lines)
    useProjectHandlers.ts (~120 lines)
    useProjectSync.ts (~80 lines)
```

**Testing:**

```bash
# Test all functionality still works
pnpm run test src/routes/projects/[id]/

# Check bundle size
pnpm run build
pnpm run analyze  # Should see smaller chunks
```

**Acceptance Criteria:**

- [ ] Main page component < 300 lines
- [ ] Each sub-component < 250 lines
- [ ] All functionality preserved
- [ ] Tests pass
- [ ] Bundle size unchanged or smaller
- [ ] No memory leaks

---

### 9. Add Request Timeout Protection

**Priority:** 🟢 Medium
**Effort:** 3 hours
**Impact:** Reliability - Better error handling, prevents hanging requests

**Issue:**
No timeout protection on long-running database queries.

**Implementation:**

```typescript
// apps/web/src/lib/utils/timeout.ts

export class TimeoutError extends Error {
	constructor(message: string = 'Operation timed out') {
		super(message);
		this.name = 'TimeoutError';
	}
}

export async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	errorMessage?: string
): Promise<T> {
	let timeoutId: NodeJS.Timeout;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new TimeoutError(errorMessage || `Operation timed out after ${timeoutMs}ms`));
		}, timeoutMs);
	});

	try {
		const result = await Promise.race([promise, timeoutPromise]);
		clearTimeout(timeoutId!);
		return result;
	} catch (error) {
		clearTimeout(timeoutId!);
		throw error;
	}
}

// Convenience wrapper for Supabase queries
export function withQueryTimeout<T>(
	queryFn: () => Promise<T>,
	timeoutMs: number = 10000
): Promise<T> {
	return withTimeout(queryFn(), timeoutMs, 'Database query timed out');
}
```

**Usage in API routes:**

```typescript
// apps/web/src/routes/api/analytics/comprehensive/+server.ts

import { withQueryTimeout } from '$lib/utils/timeout';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	try {
		// Add timeout to expensive query
		const data = await withQueryTimeout(
			async () => {
				const { data } = await locals.supabase
					.from('brain_dumps')
					.select('*')
					.gte('created_at', startDate)
					.lte('created_at', endDate);
				return data;
			},
			15000 // 15 second timeout
		);

		return ApiResponse.success(data);
	} catch (err) {
		if (err instanceof TimeoutError) {
			return ApiResponse.error('Query took too long. Please try a smaller date range.', 504);
		}
		return ApiResponse.internalError(err, 'Failed to fetch analytics');
	}
};
```

**Add timeout response helper:**

```typescript
// apps/web/src/lib/utils/api-response.ts

export class ApiResponse {
	// ... existing methods

	static timeout(message: string = 'Request timed out'): Response {
		return json(
			{
				error: message,
				code: 'TIMEOUT'
			},
			{ status: 504 }
		);
	}
}
```

**Apply to expensive endpoints:**

1. Admin analytics endpoints (15s timeout)
2. Brain dump processing (30s timeout)
3. Calendar sync operations (20s timeout)
4. Ontology graph queries (10s timeout)

**Testing:**

```typescript
// apps/web/src/lib/utils/timeout.test.ts

import { describe, it, expect, vi } from 'vitest';
import { withTimeout, TimeoutError } from './timeout';

describe('withTimeout', () => {
	it('resolves with result if promise completes in time', async () => {
		const result = await withTimeout(Promise.resolve('success'), 1000);
		expect(result).toBe('success');
	});

	it('rejects with TimeoutError if promise takes too long', async () => {
		await expect(
			withTimeout(new Promise((resolve) => setTimeout(() => resolve('late'), 200)), 100)
		).rejects.toThrow(TimeoutError);
	});

	it('clears timeout on success', async () => {
		const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
		await withTimeout(Promise.resolve('success'), 1000);
		expect(clearTimeoutSpy).toHaveBeenCalled();
	});

	it('clears timeout on error', async () => {
		const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
		await expect(withTimeout(Promise.reject('error'), 1000)).rejects.toThrow();
		expect(clearTimeoutSpy).toHaveBeenCalled();
	});
});
```

**Acceptance Criteria:**

- [ ] Timeout utility created and tested
- [ ] Applied to 10+ expensive endpoints
- [ ] Custom timeout durations per operation
- [ ] Proper error messages to users
- [ ] Tests pass

---

### 10. Implement Server-Side Streaming

**Priority:** 🟢 Low-Medium
**Effort:** 6 hours
**Impact:** Performance - Better perceived performance, faster time-to-interactive

**Issue:**
Server load functions await all promises or return minimal data. No streaming.

**Implementation:**

```typescript
// apps/web/src/routes/projects/[id]/+page.server.ts

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login');

	const projectId = params.id;

	// ✅ Return unwrapped promises - SvelteKit streams them
	return {
		// Critical data - await this
		project: await fetchProject(projectId, user.id),

		// Non-critical data - stream these
		tasks: fetchTasks(projectId),
		notes: fetchNotes(projectId),
		calendar: fetchCalendar(projectId),
		stats: fetchStats(projectId),
		recentActivity: fetchRecentActivity(projectId)
	};
};
```

```svelte
<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<script lang="ts">
	let { data } = $props();
</script>

<div class="max-w-7xl mx-auto">
	<!-- Project header renders immediately (awaited) -->
	<ProjectHeader project={data.project} />

	<!-- Tasks stream in -->
	{#await data.tasks}
		<TasksSkeleton />
	{:then tasks}
		<TasksList {tasks} />
	{:catch error}
		<ErrorMessage message="Failed to load tasks" />
	{/await}

	<!-- Notes stream in -->
	{#await data.notes}
		<NotesSkeleton />
	{:then notes}
		<NotesList {notes} />
	{:catch error}
		<ErrorMessage message="Failed to load notes" />
	{/await}

	<!-- Stats stream in -->
	{#await data.stats}
		<StatsSkeleton />
	{:then stats}
		<StatsDisplay {stats} />
	{:catch error}
		<ErrorMessage message="Failed to load stats" />
	{/await}
</div>
```

**Benefits:**

- Project header renders immediately
- Tasks, notes, stats load in parallel
- Page is interactive sooner
- Better perceived performance

**Testing:**

```typescript
// Test streaming behavior
import { render, waitFor } from '@testing-library/svelte';
import ProjectPage from './+page.svelte';

it('renders project immediately and streams other data', async () => {
	const { getByText, queryByText } = render(ProjectPage, {
		props: {
			data: {
				project: { name: 'Test Project' },
				tasks: new Promise((resolve) => setTimeout(() => resolve([]), 100)),
				notes: new Promise((resolve) => setTimeout(() => resolve([]), 200))
			}
		}
	});

	// Project renders immediately
	expect(getByText('Test Project')).toBeInTheDocument();

	// Skeletons show initially
	expect(queryByText('Loading tasks...')).toBeInTheDocument();

	// Data loads progressively
	await waitFor(() => {
		expect(queryByText('Loading tasks...')).not.toBeInTheDocument();
	});
});
```

**Pages to Update:**

1. Projects list page (stream project stats)
2. Project detail page (stream tasks, notes, calendar)
3. Admin dashboard (stream analytics)
4. Ontology pages (stream templates, entities)

**Acceptance Criteria:**

- [ ] Critical data renders immediately
- [ ] Non-critical data streams in
- [ ] Proper loading skeletons
- [ ] Error boundaries for each stream
- [ ] Improved time-to-interactive
- [ ] Tests pass

---

## Implementation Timeline

### Week 1: Security & Critical Fixes (12 hours)

- [ ] Day 1 (4h): Tasks #1-2 (Timing attack, Auth listener)
- [ ] Day 2 (4h): Task #3 (Standardize API responses)
- [ ] Day 3 (4h): Task #4 (Reduce root layout loading)

### Week 2: Standards & Performance (14 hours)

- [ ] Day 1 (2h): Task #5 (Shared auth layout)
- [ ] Day 2-3 (4h): Task #6 (Rate limiting middleware)
- [ ] Day 4-5 (6h): Task #7 (Form actions for auth)

### Week 3: Maintainability (15 hours)

- [ ] Day 1-2 (12h): Task #8 (Split large components)
- [ ] Day 3 (3h): Task #9 (Request timeout protection)

### Week 4: Optimizations & Testing (7 hours)

- [ ] Day 1-2 (6h): Task #10 (Server-side streaming)
- [ ] Day 3 (1h): Final testing and documentation

**Total: 48 hours over 4 weeks**

---

## Success Metrics

### Security

- [ ] All cron endpoints use constant-time comparison
- [ ] Auth state updates in real-time across tabs
- [ ] Rate limiting protects all mutation endpoints
- [ ] No security vulnerabilities in security scan

### Performance

- [ ] Root layout loads < 100ms
- [ ] Public pages render < 500ms
- [ ] Authenticated pages time-to-interactive < 2s
- [ ] Bundle size unchanged or reduced

### Standards

- [ ] All auth flows work without JavaScript
- [ ] Consistent error handling across all endpoints
- [ ] All components < 500 lines
- [ ] Test coverage > 80%

### Developer Experience

- [ ] Clear code organization
- [ ] Comprehensive documentation
- [ ] Easy to add new features
- [ ] Quick onboarding for new developers

---

## Post-Implementation

### Monitoring

1. Add error tracking (Sentry)
2. Monitor API response times
3. Track rate limit hits
4. Monitor timeout occurrences

### Documentation

1. Update architecture docs
2. Create migration guide
3. Document new patterns
4. Update testing guide

### Team Training

1. Share best practices doc
2. Code review new patterns
3. Update style guide
4. Create video walkthrough

---

_Last Updated: November 6, 2025_
