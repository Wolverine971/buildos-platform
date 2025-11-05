---
title: 'CRUD Patterns - Quick Reference Guide'
date: 2025-11-04
status: 'completed'
focus: 'ontology_entity_management'
---

# CRUD Patterns - Quick Reference Guide

## File Locations Reference

### Core Components

| Pattern            | Location                                                              | Purpose                     |
| ------------------ | --------------------------------------------------------------------- | --------------------------- |
| Create Modal       | `/apps/web/src/lib/components/ontology/OutputCreateModal.svelte`      | Template-based creation     |
| Edit Modal         | `/apps/web/src/lib/components/project/ProjectEditModal.svelte`        | Complex multi-field editing |
| Delete Modal       | `/apps/web/src/lib/components/project/DeleteConfirmationModal.svelte` | Deletion confirmation       |
| Confirmation Modal | `/apps/web/src/lib/components/ui/ConfirmationModal.svelte`            | Reusable confirmation       |
| Form Modal         | `/apps/web/src/lib/components/ui/FormModal.svelte`                    | Generic form wrapper        |
| List with Actions  | `/apps/web/src/lib/components/project/TasksList.svelte`               | Complex filtering/sorting   |

### API Endpoints

| Operation      | Location                                                  | HTTP Method |
| -------------- | --------------------------------------------------------- | ----------- |
| Create Output  | `/apps/web/src/routes/api/onto/outputs/create/+server.ts` | POST        |
| Get Output     | `/apps/web/src/routes/api/onto/outputs/[id]/+server.ts`   | GET         |
| Update Output  | `/apps/web/src/routes/api/onto/outputs/[id]/+server.ts`   | PATCH       |
| Get Project    | `/apps/web/src/routes/api/projects/[id]/+server.ts`       | GET         |
| Update Project | `/apps/web/src/routes/api/projects/[id]/+server.ts`       | PUT         |
| Delete Project | `/apps/web/src/routes/api/projects/[id]/+server.ts`       | DELETE      |

### Services & Utilities

| Type                 | Location                                         | Purpose                      |
| -------------------- | ------------------------------------------------ | ---------------------------- |
| API Response Wrapper | `/apps/web/src/lib/utils/api-response.ts`        | Standard API response format |
| Project Service      | `/apps/web/src/lib/services/projectService.ts`   | CRUD operations with caching |
| Base API Service     | `/apps/web/src/lib/services/base/api-service.ts` | Generic HTTP methods         |
| Toast Service        | `$lib/stores/toast.store`                        | User notifications           |

---

## Quick Code Snippets

### 1. CREATE - Modal Component

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let templates = $state<any[]>([]);
	let selectedTemplate = $state<any>(null);
	let entityName = $state('');
	let isLoading = $state(false);
	let isCreating = $state(false);
	let error = $state<string | null>(null);

	onMount(async () => {
		await loadTemplates();
	});

	async function loadTemplates() {
		isLoading = true;
		error = null;
		try {
			const response = await fetch('/api/onto/templates');
			const data = await response.json();
			templates = data.data?.templates || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load templates';
		} finally {
			isLoading = false;
		}
	}

	async function handleCreate() {
		if (!selectedTemplate || !entityName.trim()) return;

		isCreating = true;
		error = null;
		try {
			const response = await fetch('/api/onto/outputs/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					project_id: projectId,
					type_key: selectedTemplate.type_key,
					name: entityName.trim(),
					state_key: 'draft'
				})
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Creation failed');
			}

			const result = await response.json();
			onCreated(result.data.output.id);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Creation failed';
		} finally {
			isCreating = false;
		}
	}
</script>
```

### 2. CREATE - API Endpoint

```typescript
// POST /api/onto/outputs/create
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = await request.json();
		const { project_id, type_key, name, state_key, props } = body;

		if (!project_id || !type_key || !name) {
			return ApiResponse.badRequest('Missing required fields');
		}

		const supabase = locals.supabase;

		// SECURITY: Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', project_id)
			.maybeSingle();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId || project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission');
		}

		// Create entity
		const { data: output, error: createError } = await supabase
			.from('onto_outputs')
			.insert({
				project_id,
				name,
				type_key,
				state_key: state_key || 'draft',
				props: props || {},
				created_by: actorId
			})
			.select('*')
			.single();

		if (createError) {
			return ApiResponse.databaseError(createError);
		}

		return ApiResponse.success({ output });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
```

### 3. READ - Get with Caching

```typescript
// Service method with caching
async getOutput(outputId: string): Promise<ServiceResponse<Output>> {
  const cacheKey = `output:${outputId}`;

  const cached = this.cache.get(cacheKey);
  if (cached) {
    return { success: true, data: cached };
  }

  const result = await this.get<Output>(`/onto/outputs/${outputId}`);

  if (result.success && result.data) {
    this.cache.set(cacheKey, result.data);
  }

  return result;
}
```

### 4. UPDATE - Modal Component

```svelte
<script lang="ts">
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import { toastService } from '$lib/stores/toast.store';

	let isOpen = $state(false);
	let entity = $state<any>(null);
	let nameValue = $state('');
	let descriptionValue = $state('');

	$: if (entity && isOpen) {
		nameValue = entity.name || '';
		descriptionValue = entity.description || '';
	}

	async function handleSubmit(formData: any) {
		if (!nameValue.trim()) {
			throw new Error('Name is required');
		}

		const response = await fetch(`/api/onto/outputs/${entity.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: nameValue.trim(),
				description: descriptionValue.trim()
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error || 'Update failed');
		}

		const result = await response.json();
		entity = result.data.output;

		toastService.add({
			type: 'success',
			message: 'Entity updated successfully'
		});
	}
</script>

<FormModal
	{isOpen}
	title={`Edit ${entity?.name}`}
	submitText="Save Changes"
	loadingText="Saving..."
	initialData={entity || {}}
	{onSubmit}
	onClose={() => (isOpen = false)}
>
	<div slot="form-fields" class="space-y-4">
		<div>
			<label for="name" class="block text-sm font-medium mb-1">Name</label>
			<TextInput id="name" bind:value={nameValue} placeholder="Entity name" />
		</div>
		<div>
			<label for="desc" class="block text-sm font-medium mb-1">Description</label>
			<TextInput id="desc" bind:value={descriptionValue} placeholder="Entity description" />
		</div>
	</div>
</FormModal>
```

### 5. UPDATE - API Endpoint

```typescript
// PATCH /api/onto/outputs/[id]
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const supabase = locals.supabase;
		const body = await request.json();
		const { id } = params;

		// Verify ownership
		const { data: output } = await supabase
			.from('onto_outputs')
			.select('id, project_id')
			.eq('id', id)
			.maybeSingle();

		if (!output) {
			return ApiResponse.notFound('Output not found');
		}

		const { data: project } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', output.project_id)
			.maybeSingle();

		const { data: actorId } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden();
		}

		// Update
		const { data: updated, error } = await supabase
			.from('onto_outputs')
			.update({
				...body,
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.select('*')
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ output: updated });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
```

### 6. DELETE - Modal Component

```svelte
<script lang="ts">
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	let isOpen = $state(false);
	let entityName = $state('');
	let relatedCount = $state(0);
	let isDeleting = $state(false);

	async function handleDelete() {
		isDeleting = true;
		try {
			const response = await fetch(`/api/onto/outputs/${entityId}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Deletion failed');
			}

			toastService.add({
				type: 'success',
				message: 'Entity deleted successfully'
			});

			isOpen = false;
			onDeleted?.();
		} catch (err) {
			toastService.add({
				type: 'error',
				message: 'Failed to delete entity'
			});
		} finally {
			isDeleting = false;
		}
	}
</script>

<ConfirmationModal
	{isOpen}
	title="Delete {entityName}?"
	confirmText="Delete"
	confirmVariant="danger"
	icon="danger"
	loading={isDeleting}
	on:confirm={handleDelete}
	on:cancel={() => (isOpen = false)}
>
	<p slot="content" class="text-sm text-gray-600 dark:text-gray-400">
		Are you sure? This action cannot be undone.
	</p>

	{#if relatedCount > 0}
		<div slot="details" class="mt-4">
			<p class="font-semibold text-sm mb-2">This will also delete:</p>
			<ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
				<li>{relatedCount} related item(s)</li>
			</ul>
		</div>
	{/if}
</ConfirmationModal>
```

### 7. DELETE - API Endpoint

```typescript
// DELETE /api/onto/outputs/[id]
export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const supabase = locals.supabase;
		const { id } = params;

		// Verify ownership
		const { data: output } = await supabase
			.from('onto_outputs')
			.select('project_id')
			.eq('id', id)
			.maybeSingle();

		if (!output) {
			return ApiResponse.notFound('Output not found');
		}

		const { data: project } = await supabase
			.from('onto_projects')
			.select('created_by')
			.eq('id', output.project_id)
			.maybeSingle();

		const { data: actorId } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden();
		}

		// Cascade delete - delete related first
		await supabase
			.from('onto_edges')
			.delete()
			.or(
				`and(eq(src_kind,"output"),eq(src_id,${id})),and(eq(dst_kind,"output"),eq(dst_id,${id}))`
			);

		// Then delete entity
		const { error } = await supabase.from('onto_outputs').delete().eq('id', id);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ message: 'Deleted successfully' });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
```

### 8. LIST with Actions

```svelte
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';

	let entities = $state<any[]>([]);
	let selectedIds = $state(new Set<string>());
	let filterStatus = $state('all');
	let sortField = $state('created_at');
	let sortDirection = $state('asc');

	let filteredEntities = $derived(
		entities
			.filter((e) => filterStatus === 'all' || e.status === filterStatus)
			.sort((a, b) => {
				const aVal = a[sortField];
				const bVal = b[sortField];
				const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
				return sortDirection === 'asc' ? cmp : -cmp;
			})
	);

	async function handleEdit(entity: any) {
		// Open edit modal
	}

	async function handleDelete(entityId: string) {
		const response = await fetch(`/api/onto/outputs/${entityId}`, {
			method: 'DELETE'
		});
		if (response.ok) {
			entities = entities.filter((e) => e.id !== entityId);
		}
	}

	function toggleSelect(id: string) {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
		} else {
			selectedIds.add(id);
		}
	}
</script>

<div class="space-y-4">
	<!-- Filters -->
	<div class="flex gap-2">
		<select bind:value={filterStatus} class="px-3 py-1 rounded border">
			<option value="all">All</option>
			<option value="draft">Draft</option>
			<option value="active">Active</option>
		</select>
	</div>

	<!-- List -->
	<div class="space-y-2">
		{#each filteredEntities as entity}
			<div
				class="flex items-center gap-2 p-4 border rounded hover:bg-gray-50 dark:hover:bg-gray-800"
			>
				<input
					type="checkbox"
					checked={selectedIds.has(entity.id)}
					onchange={() => toggleSelect(entity.id)}
				/>
				<div class="flex-1">
					<h3 class="font-semibold">{entity.name}</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">{entity.description}</p>
				</div>
				<div class="flex gap-2">
					<Button variant="ghost" size="sm" onclick={() => handleEdit(entity)}>
						Edit
					</Button>
					<Button variant="danger" size="sm" onclick={() => handleDelete(entity.id)}>
						Delete
					</Button>
				</div>
			</div>
		{/each}
	</div>

	<!-- Bulk actions -->
	{#if selectedIds.size > 0}
		<div class="flex gap-2 p-4 bg-blue-50 dark:bg-blue-900/20 rounded">
			<span>{selectedIds.size} selected</span>
			<Button variant="danger" size="sm">Delete Selected</Button>
		</div>
	{/if}
</div>
```

### 9. Error Handling Pattern

```typescript
// In API endpoints
export const PUT: RequestHandler = async ({ request, params, locals }) => {
	try {
		// 1. Authentication
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		// 2. Input validation
		const body = await request.json();
		if (!body.required_field) {
			return ApiResponse.badRequest('required_field is required');
		}

		// 3. Authorization
		const supabase = locals.supabase;
		const { data: resource } = await supabase
			.from('table')
			.select('owner_id')
			.eq('id', params.id)
			.maybeSingle();

		if (!resource) {
			return ApiResponse.notFound('Resource');
		}

		// Check ownership
		const { data: actorId } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (resource.owner_id !== actorId) {
			return ApiResponse.forbidden('You do not have permission');
		}

		// 4. Operation
		const { data, error } = await supabase
			.from('table')
			.update(body)
			.eq('id', params.id)
			.select()
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		// 5. Success
		return ApiResponse.success({ data });
	} catch (err) {
		console.error('Error:', err);
		return ApiResponse.internalError(err);
	}
};
```

### 10. Toast Notifications

```typescript
// In component
import { toastService } from '$lib/stores/toast.store';

// Success
toastService.add({
	type: 'success',
	message: 'Entity created successfully'
});

// Error
toastService.add({
	type: 'error',
	message: 'Failed to create entity'
});

// Info
toastService.add({
	type: 'info',
	message: 'Please note this important information'
});
```

---

## Common Patterns Checklist

- [ ] Use `ApiResponse` wrapper for all API responses
- [ ] Always verify user authentication with `safeGetSession()`
- [ ] Check resource ownership before modifications
- [ ] Use `Svelte 5` runes (`$state`, `$derived`)
- [ ] Support dark mode with `dark:` prefix
- [ ] Make components responsive with `sm:`, `md:`, `lg:` breakpoints
- [ ] Add error handling with try/catch
- [ ] Use `toastService` for user feedback
- [ ] Implement cascade deletion for related entities
- [ ] Use deep cloning in forms to prevent mutations
- [ ] Add keyboard shortcuts (Escape to close modals)
- [ ] Cache read operations with proper invalidation
- [ ] Include loading states during async operations
- [ ] Provide confirmation modals for destructive actions
- [ ] Add proper TypeScript types to everything
