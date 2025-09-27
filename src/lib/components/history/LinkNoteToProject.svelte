<!-- src/lib/components/history/LinkNoteToProject.svelte -->
<script lang="ts">
	import { Link2, Loader2, Check, FolderOpen } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { createEventDispatcher, onMount } from 'svelte';
	import { parseApiResponse } from '$lib/utils/api-client-helpers';

	export let noteId: string;
	export let currentProjectId: string | null = null;

	const dispatch = createEventDispatcher();

	let projects: Array<{ id: string; name: string; slug: string }> = [];
	let selectedProjectId: string = '';
	let isLoading = false;
	let isLinking = false;
	let showDropdown = false;

	// Fetch available projects
	async function fetchProjects() {
		isLoading = true;
		try {
			const response = await fetch('/api/projects');
			const result = await parseApiResponse(response);

			if (result.success && result.data) {
				// Filter out the current project if it exists
				projects = result.data.projects
					.filter((p: any) => p.id !== currentProjectId)
					.map((p: any) => ({
						id: p.id,
						name: p.name,
						slug: p.slug
					}))
					.sort((a: any, b: any) => a.name.localeCompare(b.name));
			}
		} catch (error) {
			console.error('Failed to fetch projects:', error);
			toastService.error('Failed to load projects');
		} finally {
			isLoading = false;
		}
	}

	// Link note to selected project
	async function linkToProject() {
		if (!selectedProjectId || isLinking) return;

		isLinking = true;
		try {
			const response = await fetch(`/api/notes/${noteId}/link`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project_id: selectedProjectId })
			});

			const result = await parseApiResponse(response);

			if (result.success) {
				const selectedProject = projects.find((p) => p.id === selectedProjectId);
				toastService.success(`Note linked to ${selectedProject?.name || 'project'}`);

				// Dispatch success event with the linked project info
				dispatch('linked', {
					noteId,
					projectId: selectedProjectId,
					projectName: selectedProject?.name
				});

				// Reset state
				showDropdown = false;
				selectedProjectId = '';
			} else {
				throw new Error(result.error || 'Failed to link note');
			}
		} catch (error) {
			console.error('Failed to link note:', error);
			toastService.error('Failed to link note to project');
		} finally {
			isLinking = false;
		}
	}

	// Toggle dropdown and fetch projects if needed
	function toggleDropdown() {
		showDropdown = !showDropdown;
		if (showDropdown && projects.length === 0) {
			fetchProjects();
		}
	}

	// Handle escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showDropdown) {
			showDropdown = false;
		}
	}

	onMount(() => {
		// Pre-fetch projects if component is mounted
		fetchProjects();
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="relative inline-block">
	{#if !showDropdown}
		<Button
			on:click={toggleDropdown}
			variant="outline"
			size="sm"
			icon={Link2}
			class="hover:bg-blue-50 dark:hover:bg-blue-900/20"
		>
			Link to Project
		</Button>
	{:else}
		<div class="flex items-center gap-2">
			{#if isLoading}
				<div
					class="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md"
				>
					<Loader2 class="w-4 h-4 animate-spin text-gray-500" />
					<span class="text-sm text-gray-500">Loading projects...</span>
				</div>
			{:else if projects.length === 0}
				<div class="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md">
					<span class="text-sm text-gray-500">No projects available</span>
				</div>
			{:else}
				<Select
					bind:value={selectedProjectId}
					size="sm"
					class="min-w-[200px]"
					disabled={isLinking}
				>
					<option value="" disabled>Select a project...</option>
					{#each projects as project}
						<option value={project.id}>
							{project.name}
						</option>
					{/each}
				</Select>

				<Button
					on:click={linkToProject}
					variant="primary"
					size="sm"
					icon={isLinking ? Loader2 : Check}
					disabled={!selectedProjectId || isLinking}
					loading={isLinking}
				>
					Link
				</Button>

				<Button
					on:click={() => {
						showDropdown = false;
						selectedProjectId = '';
					}}
					variant="ghost"
					size="sm"
					class="!p-2"
				>
					Cancel
				</Button>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Animation for dropdown appearance */
	:global(.link-dropdown-enter) {
		animation: slideDown 0.2s ease-out;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
