<!-- apps/web/docs/technical/development/sveltekit-patterns.md -->

# SvelteKit + Supabase Patterns Cheat Sheet

> **Complete guide to SvelteKit patterns** - Load functions, SSR, Supabase authentication, and BuildOS-specific best practices

**Status**: v1.0.0 - Complete reference guide
**Last Updated**: 2025-11-06
**Official Docs**: [svelte.dev/docs/kit](https://svelte.dev/docs/kit) | [supabase.com/docs/guides/auth/server-side/sveltekit](https://supabase.com/docs/guides/auth/server-side/sveltekit)

---

## Table of Contents

1. [Load Functions Overview](#load-functions-overview)
2. [Universal Load Functions](#universal-load-functions)
3. [Server Load Functions](#server-load-functions)
4. [Supabase SSR Authentication](#supabase-ssr-authentication)
5. [API Routes (+server.ts)](#api-routes-serverts)
6. [Form Actions](#form-actions)
7. [Error Handling & Redirects](#error-handling--redirects)
8. [Streaming & Performance](#streaming--performance)
9. [BuildOS-Specific Patterns](#buildos-specific-patterns)
10. [Common Pitfalls](#common-pitfalls)
11. [Best Practices Checklist](#best-practices-checklist)

---

## Load Functions Overview

### What Are Load Functions?

Load functions run before a page renders, providing data to the page component. They enable server-side rendering (SSR) and pre-fetching for optimal performance.

### Two Types of Load Functions

| Aspect            | Universal (`+page.js`)        | Server (`+page.server.js`)                               |
| ----------------- | ----------------------------- | -------------------------------------------------------- |
| **Runs On**       | Server (SSR) + Browser        | Server only                                              |
| **Access To**     | `fetch`, `url`, `params`      | `locals`, `cookies`, `fetch`                             |
| **Return Values** | Any JavaScript values         | Serializable only (JSON, Date, BigInt, Map, Set, RegExp) |
| **Use Cases**     | External APIs, custom classes | Database, private env vars, RLS                          |
| **Supabase**      | ❌ No direct client access    | ✅ Access via `locals.supabase`                          |

### File Structure

```
src/routes/
├── +page.svelte          # Page component
├── +page.ts / +page.js   # Universal load function
├── +page.server.ts       # Server-only load function
├── +layout.svelte        # Layout component
├── +layout.ts            # Universal layout load
├── +layout.server.ts     # Server layout load
└── +server.ts            # API endpoint
```

### Decision Tree: Which Load Function?

```
Need database access or Supabase?
├─ Yes → Use +page.server.ts
└─ No → Need to return non-serializable values?
    ├─ Yes → Use +page.ts (universal)
    └─ No → External API only?
        ├─ Yes → Use +page.ts (universal)
        └─ No → Use +page.server.ts (safer default)
```

---

## Universal Load Functions

### Basic Universal Load (+page.ts)

```typescript
// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch, url }) => {
	// ✅ Runs on server AND client
	// ✅ Can use fetch for external APIs
	// ✅ Can return any JavaScript value

	const response = await fetch(`https://api.example.com/posts/${params.slug}`);
	const post = await response.json();

	return {
		post,
		timestamp: new Date() // Non-serializable, but allowed in universal
	};
};
```

### Accessing Parent Data

```typescript
// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch, parent }) => {
	// ✅ Access parent layout data
	const parentData = await parent();

	// Get user from parent layout
	const { user } = parentData;

	const post = await fetchPost(params.slug);

	return {
		post,
		isAuthor: post.authorId === user?.id
	};
};
```

### When to Use Universal Load

**Use universal load (`+page.ts`) when:**

- Fetching from external APIs
- Need custom classes or non-serializable data
- Want code to run on both server and client
- Don't need database access or sensitive env vars

**Example - External API:**

```typescript
// src/routes/weather/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
	const city = url.searchParams.get('city') ?? 'London';

	// ✅ External API - perfect for universal load
	const response = await fetch(
		`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${PUBLIC_WEATHER_API_KEY}`
	);

	const weather = await response.json();

	return { weather, city };
};
```

---

## Server Load Functions

### Basic Server Load (+page.server.ts)

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	// ✅ Runs ONLY on server
	// ✅ Access Supabase via locals.supabase
	// ✅ Access user session via locals.session

	const supabase = locals.supabase;
	const session = locals.session;

	if (!session) {
		throw error(401, 'Unauthorized');
	}

	// ✅ Query database with RLS
	const { data: projects, error: dbError } = await supabase
		.from('projects')
		.select('*')
		.eq('user_id', session.user.id);

	if (dbError) {
		throw error(500, 'Failed to load projects');
	}

	return {
		projects,
		user: session.user
	};
};
```

### Parallel Data Loading

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.session?.user.id;

	// ✅ Load data in parallel (faster!)
	const [projectsResult, tasksResult, statsResult] = await Promise.all([
		supabase.from('projects').select('*').eq('user_id', userId),
		supabase.from('tasks').select('*').eq('user_id', userId).eq('completed', false),
		supabase.rpc('get_user_stats', { user_id: userId })
	]);

	return {
		projects: projectsResult.data ?? [],
		tasks: tasksResult.data ?? [],
		stats: statsResult.data ?? {}
	};
};
```

### Avoiding Waterfalls

```typescript
// ❌ BAD - Waterfall (slow)
export const load: PageServerLoad = async ({ locals, parent }) => {
	const parentData = await parent(); // Waits for parent first
	const user = await fetchUser(parentData.userId); // Then fetches user
	const posts = await fetchPosts(user.id); // Then fetches posts

	return { user, posts };
};

// ✅ GOOD - Parallel (fast)
export const load: PageServerLoad = async ({ locals, parent }) => {
	// ✅ Call parent() AFTER independent data fetches
	const userPromise = fetchUser(locals.session?.user.id);
	const parentData = await parent();

	const user = await userPromise;
	const posts = await fetchPosts(user.id);

	return { user, posts, ...parentData };
};
```

### Accessing Cookies

```typescript
// src/routes/preferences/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	// ✅ Read cookies
	const theme = cookies.get('theme') ?? 'light';
	const layout = cookies.get('layout') ?? 'grid';

	return {
		preferences: {
			theme,
			layout
		}
	};
};
```

---

## Supabase SSR Authentication

### Setup (`src/hooks.server.ts`)

```typescript
// src/hooks.server.ts
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// ✅ Create Supabase client for this request
	event.locals.supabase = createServerClient(
		process.env.PUBLIC_SUPABASE_URL!,
		process.env.PUBLIC_SUPABASE_ANON_KEY!,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

	// ✅ Safe session getter (validates JWT)
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();

		if (!session) {
			return { session: null, user: null };
		}

		// ✅ Validate JWT by calling getUser()
		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();

		if (error || !user) {
			return { session: null, user: null };
		}

		return { session, user };
	};

	// ✅ Set session in locals
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};
```

### Client-Side Setup (`src/routes/+layout.ts`)

```typescript
// src/routes/+layout.ts
import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends, fetch }) => {
	// ✅ Make load function reactive to auth changes
	depends('supabase:auth');

	const supabase = isBrowser()
		? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY)
		: createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
				cookies: {
					getAll() {
						return data.cookies;
					}
				}
			});

	// ✅ Listen for auth state changes
	const {
		data: { subscription }
	} = supabase.auth.onAuthStateChange((event, session) => {
		if (session?.expires_at !== data.session?.expires_at) {
			// ✅ Invalidate layout when session changes
			invalidateAll();
		}
	});

	return {
		supabase,
		session: data.session
	};
};
```

### Protected Route Pattern

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	// ✅ Check authentication
	if (!locals.session) {
		throw redirect(303, '/login');
	}

	// ✅ User is authenticated, load data
	const supabase = locals.supabase;
	const { data: projects } = await supabase
		.from('projects')
		.select('*')
		.eq('user_id', locals.session.user.id);

	return {
		projects,
		user: locals.user
	};
};
```

### Admin-Only Route Pattern

```typescript
// src/routes/admin/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.session) {
		throw redirect(303, '/login');
	}

	// ✅ Check if user is admin
	const supabase = locals.supabase;
	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', locals.session.user.id)
		.single();

	if (profile?.role !== 'admin') {
		throw error(403, 'Forbidden - Admin access required');
	}

	// Load admin data...
	return { adminData: {} };
};
```

---

## API Routes (+server.ts)

### Basic API Endpoint

```typescript
// src/routes/api/projects/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	// ✅ ALWAYS use ApiResponse wrapper
	// ✅ Access Supabase via locals.supabase

	if (!locals.session) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;
	const { data, error } = await supabase
		.from('projects')
		.select('*')
		.eq('user_id', locals.session.user.id);

	if (error) {
		return ApiResponse.error(error.message, 500);
	}

	return ApiResponse.success(data);
};
```

### POST with Validation

```typescript
// src/routes/api/projects/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { z } from 'zod';

const CreateProjectSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	status: z.enum(['planning', 'active', 'completed']).default('planning')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session) {
		return ApiResponse.error('Unauthorized', 401);
	}

	// ✅ Parse and validate request body
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.error('Invalid JSON', 400);
	}

	const validation = CreateProjectSchema.safeParse(body);
	if (!validation.success) {
		return ApiResponse.error('Validation failed', 400, validation.error.errors);
	}

	const { name, description, status } = validation.data;

	// ✅ Insert into database
	const supabase = locals.supabase;
	const { data, error } = await supabase
		.from('projects')
		.insert({
			name,
			description,
			status,
			user_id: locals.session.user.id
		})
		.select()
		.single();

	if (error) {
		return ApiResponse.error(error.message, 500);
	}

	return ApiResponse.success(data, 201);
};
```

### Admin API with Service Role

```typescript
// src/routes/api/admin/users/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ locals }) => {
	// ✅ Check admin permission
	if (!locals.session) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;
	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', locals.session.user.id)
		.single();

	if (profile?.role !== 'admin') {
		return ApiResponse.error('Forbidden', 403);
	}

	// ✅ Use admin client to bypass RLS
	const adminSupabase = createAdminSupabaseClient();
	const { data, error } = await adminSupabase
		.from('users')
		.select('*')
		.order('created_at', { ascending: false });

	if (error) {
		return ApiResponse.error(error.message, 500);
	}

	return ApiResponse.success(data);
};
```

### Streaming API Response

```typescript
// src/routes/api/generate/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session) {
		return new Response('Unauthorized', { status: 401 });
	}

	const { prompt } = await request.json();

	// ✅ Create ReadableStream for streaming response
	const stream = new ReadableStream({
		async start(controller) {
			try {
				const response = await fetch('https://api.openai.com/v1/chat/completions', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
					},
					body: JSON.stringify({
						model: 'gpt-4',
						messages: [{ role: 'user', content: prompt }],
						stream: true
					})
				});

				const reader = response.body?.getReader();
				if (!reader) throw new Error('No reader');

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
				}

				controller.close();
			} catch (error) {
				controller.error(error);
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
```

---

## Form Actions

### Basic Form Action

```typescript
// src/routes/projects/new/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.session) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const name = formData.get('name')?.toString();
		const description = formData.get('description')?.toString();

		// ✅ Validation
		if (!name || name.length < 3) {
			return fail(400, {
				error: 'Name must be at least 3 characters',
				values: { name, description }
			});
		}

		// ✅ Insert into database
		const supabase = locals.supabase;
		const { data, error } = await supabase
			.from('projects')
			.insert({
				name,
				description,
				user_id: locals.session.user.id
			})
			.select()
			.single();

		if (error) {
			return fail(500, {
				error: 'Failed to create project',
				values: { name, description }
			});
		}

		// ✅ Redirect on success
		throw redirect(303, `/projects/${data.id}`);
	}
};
```

### Using Form Action in Component

```svelte
<!-- src/routes/projects/new/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<form method="POST" action="?/create" use:enhance>
	<div class="form-field">
		<label for="name">Project Name</label>
		<input
			id="name"
			name="name"
			type="text"
			value={form?.values?.name ?? ''}
			aria-invalid={!!form?.error}
		/>
	</div>

	<div class="form-field">
		<label for="description">Description</label>
		<textarea id="description" name="description" value={form?.values?.description ?? ''}
		></textarea>
	</div>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	<button type="submit">Create Project</button>
</form>
```

### Progressive Enhancement with `use:enhance`

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';

	let isLoading = $state(false);

	const handleSubmit: SubmitFunction = ({ formData }) => {
		isLoading = true;

		// ✅ Optionally transform formData before submit
		formData.set('timestamp', new Date().toISOString());

		return async ({ result, update }) => {
			isLoading = false;

			// ✅ Custom handling based on result
			if (result.type === 'success') {
				console.log('Form submitted successfully');
			} else if (result.type === 'failure') {
				console.error('Form submission failed');
			}

			// ✅ Call default update behavior
			await update();
		};
	};
</script>

<form method="POST" use:enhance={handleSubmit}>
	<!-- Form fields -->
	<button type="submit" disabled={isLoading}>
		{isLoading ? 'Submitting...' : 'Submit'}
	</button>
</form>
```

---

## Error Handling & Redirects

### Throwing Errors

```typescript
// src/routes/projects/[id]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const supabase = locals.supabase;

	const { data: project, error: dbError } = await supabase
		.from('projects')
		.select('*')
		.eq('id', params.id)
		.single();

	// ✅ Throw error with status and message
	if (dbError || !project) {
		throw error(404, {
			message: 'Project not found',
			details: `No project with ID ${params.id}`
		});
	}

	// ✅ Authorization check
	if (project.user_id !== locals.session?.user.id) {
		throw error(403, 'You do not have permission to view this project');
	}

	return { project };
};
```

### Custom Error Page

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
	import { page } from '$app/stores';

	let status = $derived($page.status);
	let message = $derived($page.error?.message ?? 'An error occurred');
</script>

<div class="error-page">
	<h1>{status}</h1>
	<p>{message}</p>
	<a href="/">Go Home</a>
</div>
```

### Redirects

```typescript
// src/routes/login/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	// ✅ Redirect if already authenticated
	if (locals.session) {
		throw redirect(303, '/dashboard');
	}

	return {};
};
```

### Redirect After Form Action

```typescript
// src/routes/projects/[id]/edit/+page.server.ts
import type { Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const name = formData.get('name')?.toString();

		if (!name) {
			return fail(400, { error: 'Name is required' });
		}

		const supabase = locals.supabase;
		const { error } = await supabase.from('projects').update({ name }).eq('id', params.id);

		if (error) {
			return fail(500, { error: error.message });
		}

		// ✅ Redirect to project page
		throw redirect(303, `/projects/${params.id}`);
	}
};
```

---

## Streaming & Performance

### Streaming Promises

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const userId = locals.session?.user.id;

	// ✅ Return unawaited promise for streaming
	return {
		// This waits - page won't render until available
		projects: await supabase
			.from('projects')
			.select('*')
			.eq('user_id', userId)
			.then((r) => r.data),

		// These stream - page renders immediately, data fills in later
		recentActivity: supabase
			.from('activity')
			.select('*')
			.eq('user_id', userId)
			.limit(10)
			.then((r) => r.data),

		statistics: supabase.rpc('get_user_statistics', { user_id: userId }).then((r) => r.data)
	};
};
```

### Using Streamed Data in Component

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- Projects render immediately (awaited) -->
<section>
	<h2>Projects</h2>
	{#each data.projects as project}
		<ProjectCard {project} />
	{/each}
</section>

<!-- Recent activity streams in (shows placeholder first) -->
<section>
	<h2>Recent Activity</h2>
	{#await data.recentActivity}
		<LoadingSpinner />
	{:then activity}
		{#each activity as item}
			<ActivityItem {item} />
		{/each}
	{/await}
</section>
```

### Preload Data with `data-sveltekit-preload-data`

```svelte
<!-- Preload link on hover -->
<a href="/projects/123" data-sveltekit-preload-data="hover"> View Project </a>

<!-- Preload immediately when link is visible -->
<a href="/dashboard" data-sveltekit-preload-data="tap"> Dashboard </a>
```

---

## BuildOS-Specific Patterns

### API Response Wrapper (Required)

```typescript
// ✅ ALWAYS use ApiResponse in +server.ts files
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	// Success
	return ApiResponse.success(data, 200);

	// Error
	return ApiResponse.error('Something went wrong', 500);

	// Validation error
	return ApiResponse.error('Invalid input', 400, validationErrors);
};
```

### Supabase Access Patterns

```typescript
// ✅ In API routes - Use locals.supabase
export const GET: RequestHandler = async ({ locals }) => {
	const supabase = locals.supabase; // User's session
	const { data } = await supabase.from('projects').select('*');
	return ApiResponse.success(data);
};

// ✅ In load functions - Use locals.supabase
export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const { data } = await supabase.from('projects').select('*');
	return { projects: data };
};

// ✅ For admin operations - Use admin client
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ request }) => {
	const adminSupabase = createAdminSupabaseClient();
	const { data } = await adminSupabase.from('users').select('*');
	return ApiResponse.success(data);
};
```

### Dark Mode & Responsive Design (Required)

```svelte
<!-- ✅ ALWAYS provide dark mode support -->
<div class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
	<h1 class="text-2xl sm:text-3xl lg:text-4xl">Responsive Heading</h1>

	<!-- ✅ Use BuildOS Card system -->
	<Card variant="elevated">
		<CardHeader variant="gradient">
			<h2>Card Title</h2>
		</CardHeader>
		<CardBody padding="md">
			<p>Card content with responsive padding</p>
		</CardBody>
	</Card>
</div>
```

### BuildOS Card System Integration

```svelte
<script lang="ts">
	import { Card, CardHeader, CardBody, CardFooter } from '$lib/components/ui';

	let { data } = $props();
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 sm:p-6 lg:p-8">
	{#each data.projects as project}
		<Card variant="interactive">
			<CardHeader variant="accent">
				<h3 class="text-lg font-semibold">{project.name}</h3>
			</CardHeader>
			<CardBody padding="md">
				<p class="text-gray-600 dark:text-gray-400">{project.description}</p>
			</CardBody>
			<CardFooter>
				<button class="btn-primary">View Project</button>
			</CardFooter>
		</Card>
	{/each}
</div>
```

---

## Common Pitfalls

### 1. Not Using ApiResponse

```typescript
// ❌ Wrong - Inconsistent response format
export const GET: RequestHandler = async ({ locals }) => {
	const { data } = await locals.supabase.from('projects').select('*');
	return new Response(JSON.stringify(data));
};

// ✅ Correct - Use ApiResponse
export const GET: RequestHandler = async ({ locals }) => {
	const { data, error } = await locals.supabase.from('projects').select('*');

	if (error) {
		return ApiResponse.error(error.message, 500);
	}

	return ApiResponse.success(data);
};
```

### 2. Accessing Supabase Incorrectly

```typescript
// ❌ Wrong - Importing client directly
import { supabase } from '$lib/supabase/client';

export const load: PageServerLoad = async () => {
	const { data } = await supabase.from('projects').select('*');
	return { projects: data };
};

// ✅ Correct - Use locals.supabase
export const load: PageServerLoad = async ({ locals }) => {
	const supabase = locals.supabase;
	const { data } = await supabase.from('projects').select('*');
	return { projects: data };
};
```

### 3. Creating Load Function Waterfalls

```typescript
// ❌ Wrong - Sequential loading (slow)
export const load: PageServerLoad = async ({ locals, parent }) => {
	const parentData = await parent(); // Wait for parent
	const user = await fetchUser(); // Wait for user
	const posts = await fetchPosts(); // Wait for posts

	return { parentData, user, posts };
};

// ✅ Correct - Parallel loading (fast)
export const load: PageServerLoad = async ({ locals, parent }) => {
	const userPromise = fetchUser();
	const postsPromise = fetchPosts();
	const parentData = await parent();

	const [user, posts] = await Promise.all([userPromise, postsPromise]);

	return { parentData, user, posts };
};
```

### 4. Not Handling Errors Properly

```typescript
// ❌ Wrong - Silent failure
export const load: PageServerLoad = async ({ locals }) => {
	const { data } = await locals.supabase.from('projects').select('*');
	return { projects: data }; // data could be null!
};

// ✅ Correct - Proper error handling
export const load: PageServerLoad = async ({ locals }) => {
	const { data, error } = await locals.supabase.from('projects').select('*');

	if (error) {
		throw error(500, error.message);
	}

	return { projects: data ?? [] };
};
```

### 5. Forgetting Dark Mode Support

```svelte
<!-- ❌ Wrong - No dark mode -->
<div class="bg-white text-gray-900">
	<h1 class="text-2xl">Title</h1>
</div>

<!-- ✅ Correct - Dark mode support -->
<div class="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
	<h1 class="text-2xl">Title</h1>
</div>
```

### 6. Not Using Type-Safe Routes

```typescript
// ❌ Wrong - Hardcoded URLs
export const load: PageServerLoad = async ({ fetch }) => {
	const response = await fetch('/api/projects');
	return await response.json();
};

// ✅ Correct - Use generated types
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	const response = await fetch('/api/projects');
	return await response.json();
};
```

---

## Best Practices Checklist

### Load Functions

- ✅ Use `+page.server.ts` for database/Supabase access
- ✅ Use `+page.ts` for external APIs or custom classes
- ✅ Load data in parallel with `Promise.all()`
- ✅ Avoid waterfalls by calling `parent()` strategically
- ✅ Return unawaited promises for streaming
- ❌ Don't create sequential dependencies unnecessarily

### Supabase Access

- ✅ Access via `locals.supabase` in server routes
- ✅ Check `locals.session` for authentication
- ✅ Use admin client only when bypassing RLS is required
- ✅ Handle errors from Supabase queries
- ❌ Don't import Supabase client directly in server code

### API Routes

- ✅ ALWAYS use `ApiResponse` wrapper
- ✅ Validate input with zod or similar
- ✅ Check authentication before processing
- ✅ Return appropriate HTTP status codes
- ❌ Don't expose internal error details to clients

### Form Actions

- ✅ Use progressive enhancement with `use:enhance`
- ✅ Return `fail()` with error details for validation
- ✅ Use `redirect()` on successful submission
- ✅ Preserve form values on error
- ❌ Don't forget to check authentication

### Error Handling

- ✅ Use `throw error(status, message)` for expected errors
- ✅ Use `throw redirect(status, location)` for navigation
- ✅ Provide user-friendly error messages
- ✅ Log errors for debugging
- ❌ Don't expose sensitive information in errors

### UI/Design (BuildOS)

- ✅ Support light and dark modes (REQUIRED)
- ✅ Use responsive design with Tailwind breakpoints
- ✅ Use BuildOS Card system for layouts
- ✅ Follow BuildOS Style Guide
- ❌ Don't forget mobile-first approach

### Performance

- ✅ Stream slow-loading data with unawaited promises
- ✅ Use `data-sveltekit-preload-data` for navigation
- ✅ Minimize load function waterfalls
- ✅ Cache external API responses when appropriate
- ❌ Don't await data that can be streamed

---

## Related Resources

- **Official Docs**: [svelte.dev/docs/kit](https://svelte.dev/docs/kit)
- **Supabase SSR**: [supabase.com/docs/guides/auth/server-side/sveltekit](https://supabase.com/docs/guides/auth/server-side/sveltekit)
- **Svelte 5 Runes**: [svelte5-runes.md](./svelte5-runes.md)
- **BuildOS Style Guide**: [BUILDOS_STYLE_GUIDE.md](../components/BUILDOS_STYLE_GUIDE.md)
- **API Response Util**: `$lib/utils/api-response.ts`

---

**Version**: 1.0.0
**Last Updated**: 2025-11-06
**Maintainer**: BuildOS Platform Team
