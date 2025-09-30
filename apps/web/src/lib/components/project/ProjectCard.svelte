<!-- apps/web/src/lib/components/project/ProjectCard.svelte -->
<script lang="ts">
	import {
		CheckCircle2,
		Circle,
		Clock,
		Pause,
		AlertCircle,
		Edit3,
		FileText,
		Archive
	} from 'lucide-svelte';
	import { createStatusMapping } from '$lib/utils/componentOptimization';
	import ProjectEditModal from './ProjectEditModal.svelte';
	import { page } from '$app/stores';
	import { invalidate } from '$app/navigation';
	import { createEventDispatcher } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let project: any;
	export let projectBrief: any = null;

	let showEditModal = false;

	const dispatch = createEventDispatcher();

	// Get current page for projects list invalidation (different from project detail page)
	$: currentPage = $page.url.pathname;
	$: isOnProjectsPage = currentPage === '/projects' || currentPage.startsWith('/projects?');

	// Optimized status configuration using static mapping
	const statusMapping = createStatusMapping({
		icons: {
			active: Circle,
			paused: Pause,
			completed: CheckCircle2,
			archived: Archive,
			default: Circle
		},
		colors: {
			active: 'text-green-600 dark:text-green-400',
			paused: 'text-yellow-600 dark:text-yellow-400',
			completed: 'text-blue-600 dark:text-blue-400',
			archived: 'text-gray-500 dark:text-gray-400',
			default: 'text-gray-600 dark:text-gray-400'
		},
		messages: {
			active: 'Active',
			paused: 'Paused',
			completed: 'Completed',
			archived: 'Archived',
			default: 'Unknown'
		}
	});

	// Optimized computed values - memoized
	$: hasTaskStats = project.taskStats?.total > 0;
	$: completionRate = project.taskStats?.completionRate || 0;
	$: hasTags = project.tags && project.tags.length > 0;
	$: visibleTags = hasTags ? project.tags.slice(0, 3) : [];
	$: extraTagsCount = hasTags ? Math.max(0, project.tags.length - 3) : 0;
	$: hasBlockedTasks = hasTaskStats && project.taskStats.blocked > 0;

	function handleEdit(event: Event) {
		event.preventDefault();
		event.stopPropagation();
		showEditModal = true;
	}

	function handleViewBrief(event: Event) {
		event.preventDefault();
		event.stopPropagation();
		if (projectBrief) {
			dispatch('viewBrief', projectBrief);
		}
	}

	async function handleProjectUpdated(event: CustomEvent) {
		// Update the local project data immediately for reactive UI update
		if (event.detail) {
			project = { ...project, ...event.detail };
		}

		// For projects list page, we need a different invalidation strategy
		if (isOnProjectsPage) {
			// Invalidate the projects list data
			const { invalidate } = await import('$app/navigation');
			await invalidate('/projects');
		} else {
			const projectId = `projects:${$page.params.id}`;
			await invalidate(projectId);

			// depends(`projects:${projectId}:context`);
		}
	}

	// Performance optimization: prevent unnecessary re-renders
	$: projectStatusConfig = project.status ? statusMapping.getIcon(project.status) : null;
	$: projectStatusColor = project.status ? statusMapping.getColor(project.status) : '';
	$: projectStatusText = project.status ? statusMapping.getMessage(project.status) : '';
	$: isArchived = project.status === 'archived';
</script>

<a
	href="/projects/{project.id}"
	class={`block p-4 ${isArchived ? 'opacity-90' : ''}`}
	aria-label={isArchived ? 'View archived project' : undefined}
>
	<!-- Header with title, status and edit button -->
	<div class="flex items-start justify-between mb-2">
		<div class="flex-1 min-w-0 pr-2">
			<div class="flex items-center gap-2">
				<h3
					class="text-base font-semibold text-gray-900 dark:text-white truncate"
					data-project-name
					style="--project-name: project-name-{project.id};"
				>
					{project.name || 'Untitled Project'}
				</h3>
				<!-- Edit button inline with title -->
				<Button
					type="button"
					on:click={handleEdit}
					variant="ghost"
					size="sm"
					title="Edit project"
					class="opacity-0 group-hover:opacity-100 transition-opacity"
				>
					<Edit3 class="w-3.5 h-3.5" />
				</Button>
			</div>
		</div>
		<!-- Status indicator -->
		{#if project.status && projectStatusConfig}
			<div class="flex items-center space-x-1 flex-shrink-0">
				<svelte:component this={projectStatusConfig} class="w-4 h-4 {projectStatusColor}" />
				<span class="text-xs font-medium {projectStatusColor} capitalize">
					{projectStatusText}
				</span>
			</div>
		{/if}
	</div>

	{#if isArchived}
		<div
			class="mb-3 flex items-center gap-2 rounded-md border border-dashed border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900/40 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300"
		>
			<Archive class="w-3.5 h-3.5" />
			<span>Archived project — read only</span>
		</div>
	{/if}

	<!-- Description - exactly 2 lines -->
	{#if project.description}
		<p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3 min-h-[2.5rem]">
			{project.description}
		</p>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400 italic mb-3 min-h-[2.5rem]">
			No description
		</p>
	{/if}

	<!-- Progress bar and stats in compact layout -->
	{#if hasTaskStats}
		<div class="space-y-2">
			<!-- Progress bar with percentage -->
			<div class="flex items-center gap-3">
				<div class="flex-1">
					<div class="flex items-center justify-between text-xs mb-1">
						<span class="text-gray-500 dark:text-gray-400">Progress</span>
						<span class="font-medium text-gray-700 dark:text-gray-300">
							{completionRate}%
						</span>
					</div>
					<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
						<div
							class="bg-primary-600 dark:bg-primary-500 h-1.5 rounded-full transition-all duration-300"
							style="width: {completionRate}%"
						/>
					</div>
				</div>
			</div>

			<!-- Task stats in compact row -->
			<div class="flex items-center gap-3 text-xs">
				<div class="flex items-center gap-1">
					<CheckCircle2 class="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
					<span class="text-gray-600 dark:text-gray-400">
						{project.taskStats.completed}
					</span>
				</div>
				<div class="flex items-center gap-1">
					<Clock class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
					<span class="text-gray-600 dark:text-gray-400">
						{project.taskStats.active}
					</span>
				</div>
				{#if hasBlockedTasks}
					<div class="flex items-center gap-1">
						<AlertCircle class="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
						<span class="text-gray-600 dark:text-gray-400">
							{project.taskStats.blocked}
						</span>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<div class="text-xs text-gray-500 dark:text-gray-400 italic">No tasks yet</div>
	{/if}

	<!-- View Brief Button -->
	{#if projectBrief}
		<div class="mt-3 mb-2">
			<Button
				type="button"
				on:click={handleViewBrief}
				variant="outline"
				size="sm"
				class="w-full text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20"
				data-no-pulse
			>
				<FileText class="w-3.5 h-3.5 mr-1.5" />
				View Brief
			</Button>
		</div>
	{/if}

	<!-- Tags in compact layout -->
	{#if hasTags}
		<div class="flex flex-wrap gap-1.5">
			{#each visibleTags as tag}
				<span
					class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
				>
					{tag}
				</span>
			{/each}
			{#if extraTagsCount > 0}
				<span
					class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
				>
					+{extraTagsCount} more
				</span>
			{/if}
		</div>
	{/if}
</a>

<!-- Edit Modal -->
<ProjectEditModal
	bind:isOpen={showEditModal}
	{project}
	on:updated={handleProjectUpdated}
	on:close={() => (showEditModal = false)}
/>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Ensure consistent height for description area */
	.min-h-\[2\.5rem\] {
		min-height: 2.5rem;
	}
</style>
