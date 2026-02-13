<!-- apps/web/src/lib/components/phases/BacklogSection.svelte -->
<script lang="ts">
	import { Inbox, ChevronDown, ChevronRight } from 'lucide-svelte';
	import type { TaskWithCalendarEvents } from '$lib/types/project-page.types';
	import { createEventDispatcher } from 'svelte';
	import BacklogTaskItem from './BacklogTaskItem.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { ProjectService } from '$lib/services/projectService';
	import { toastService } from '$lib/stores/toast.store';

	export let backlogTasks: TaskWithCalendarEvents[] = [];
	export let dragOverPhase: string | null = null;
	export let projectId: string;

	const dispatch = createEventDispatcher();
	const projectService = ProjectService.getInstance();

	// Collapsed by default
	let isCollapsed = true;

	function toggleCollapsed() {
		isCollapsed = !isCollapsed;
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		dispatch('taskDragOver', { event, phaseId: null });
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		const relatedTarget = event.relatedTarget as HTMLElement;
		const currentTarget = event.currentTarget as HTMLElement;

		// Only trigger leave if we're actually leaving the backlog section
		if (!currentTarget.contains(relatedTarget)) {
			dispatch('taskDragLeave', { event });
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		// Get the dragged task data from the dataTransfer
		const taskDataString = event.dataTransfer?.getData('application/json');
		if (!taskDataString) {
			console.error('No task data in drag event');
			return;
		}

		try {
			const taskData = JSON.parse(taskDataString);

			// Extract the task ID and phase ID from the task data
			const taskId = taskData.id;
			const fromPhaseId = taskData.phase_id || null;

			// Don't do anything if the task is already in the backlog
			if (!fromPhaseId || fromPhaseId === null) {
				return;
			}

			// Move task to backlog (null phase)
			const result = await projectService.moveTaskToPhase(
				taskId,
				null, // null means backlog
				projectId
			);

			if (result.success) {
				toastService.success('Task moved to backlog');
				dispatch('taskMoved', { taskId, toPhaseId: null });
			} else {
				toastService.error('Failed to move task to backlog');
			}
		} catch (error) {
			console.error('Error handling drop:', error);
			toastService.error('Failed to move task');
		}

		dispatch('taskDrop', { event, phaseId: null });
	}
</script>

<section
	class="backlog-section border border-border rounded-lg overflow-hidden bg-card"
	aria-labelledby="backlog-heading"
	aria-describedby="backlog-description"
>
	<!-- Header -->
	<Button
		variant="ghost"
		size="lg"
		fullWidth
		btnType="container"
		onclick={toggleCollapsed}
		aria-expanded={!isCollapsed}
		aria-controls="backlog-content"
		class="p-4 bg-muted text-left hover:bg-muted min-h-[56px] rounded-none rounded-t-lg justify-start font-normal border-none"
	>
		<div class="flex items-center justify-between gap-3 w-full">
			<div class="flex items-center min-w-0 flex-1 gap-3">
				{#if isCollapsed}
					<ChevronRight
						class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground transition-colors"
						aria-hidden="true"
					/>
				{:else}
					<ChevronDown
						class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground transition-colors"
						aria-hidden="true"
					/>
				{/if}

				<Inbox
					class="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground"
					aria-hidden="true"
				/>

				<div class="flex-1 min-w-0">
					<h3
						id="backlog-heading"
						class="font-semibold text-base sm:text-lg text-foreground truncate"
					>
						Backlog
					</h3>
				</div>
			</div>

			<div class="flex items-center gap-2 flex-shrink-0">
				<span
					id="backlog-description"
					class="text-sm font-medium text-foreground bg-muted px-3 py-1.5 rounded-full"
					aria-label="{backlogTasks.length} tasks in backlog"
				>
					{backlogTasks.length}
				</span>

				<span class="hidden sm:inline text-xs text-muted-foreground ml-1">
					{isCollapsed ? 'Click to expand' : 'Click to collapse'}
				</span>
			</div>
		</div>
	</Button>

	<!-- Content -->
	<div
		id="backlog-content"
		class="content-wrapper {isCollapsed ? 'collapsed' : 'expanded'} {dragOverPhase === null
			? 'drag-over'
			: ''}"
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		ondrop={handleDrop}
		role="application"
		aria-label="Backlog task drop zone"
		aria-describedby="backlog-drop-instructions"
	>
		<div
			class="content-inner border-t border-border bg-card"
		>
			<div class="sr-only" id="backlog-drop-instructions">
				Drop tasks here to move them to the backlog
			</div>

			<div
				class="drag-zone p-4 border-2 border-dashed border-transparent rounded-lg mx-4 mt-4 mb-4 transition-all duration-200"
			>
				<div class="backlog-tasks-grid space-y-2" role="list" aria-label="Backlog tasks">
					{#each backlogTasks as task, index (task.id)}
						<div
							role="listitem"
							class="task-wrapper"
							animate:flip={{ duration: 300, easing: cubicOut }}
						>
							<BacklogTaskItem
								{index}
								{task}
								on:dragStart={(e) =>
									dispatch('taskDragStart', { ...e.detail, phaseId: null })}
								on:editTask={(e) => dispatch('editTask', e.detail)}
								on:deleteTask={(e) => dispatch('deleteTask', e.detail)}
							/>
						</div>
					{:else}
						{#if dragOverPhase === null}
							<div
								class="empty-state text-center py-8 text-blue-600 dark:text-blue-400 animate-pulse"
							>
								<p class="text-sm font-medium">Drop task here to move to backlog</p>
							</div>
						{:else}
							<div
								class="empty-state text-center py-8 text-muted-foreground"
							>
								<p class="text-sm">No tasks in backlog</p>
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	/* Content wrapper animations */
	.content-wrapper {
		overflow: hidden;
		transition: all 0.3s ease;
	}

	.content-wrapper.collapsed {
		max-height: 0;
		opacity: 0;
	}

	.content-wrapper.expanded {
		max-height: 80vh;
		opacity: 1;
	}

	.content-wrapper.drag-over .drag-zone {
		border-color: rgb(59 130 246);
		background-color: rgb(59 130 246 / 0.05);
		transform: scale(1.01);
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.1),
			0 2px 4px -2px rgb(0 0 0 / 0.1);
	}

	:global(.dark) .content-wrapper.drag-over .drag-zone {
		border-color: rgb(96 165 250);
		background-color: rgb(96 165 250 / 0.1);
		box-shadow:
			0 4px 6px -1px rgb(0 0 0 / 0.3),
			0 2px 4px -2px rgb(0 0 0 / 0.3);
	}

	/* Grid layout for backlog tasks */
	.backlog-tasks-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		max-height: 60vh;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	@media (max-width: 640px) {
		.content-wrapper.expanded {
			max-height: 60vh;
		}

		.backlog-tasks-grid {
			max-height: 50vh;
			grid-template-columns: 1fr;
			gap: 0.5rem;
		}
	}

	/* Task wrapper */
	.task-wrapper {
		transition: all 0.2s ease;
	}

	.task-wrapper:hover {
		transform: translateY(-1px);
	}

	.task-wrapper:active {
		transform: scale(0.99);
	}

	/* Responsive improvements */
	@media (max-width: 640px) {
		.task-wrapper:hover {
			transform: none;
		}
	}

	/* Focus states */
	:global(.content-wrapper button:focus-visible) {
		outline: 2px solid rgb(59 130 246);
		outline-offset: 2px;
	}
</style>
