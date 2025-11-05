<!-- apps/web/src/lib/components/project/BraindumpProjectCard.svelte -->
<script lang="ts">
	import { Brain, CheckSquare, FileText, Clock, CheckCircle2, Trash2 } from 'lucide-svelte';
	import { format, formatDistanceToNow, differenceInHours } from 'date-fns';
	import { createEventDispatcher } from 'svelte';
	import type { BraindumpWithLinks } from '$lib/types/brain-dump';
	import Button from '$lib/components/ui/Button.svelte';

	export let braindump: BraindumpWithLinks;
	export let onClick: (() => void) | undefined = undefined;
	export let onDelete: (() => void) | undefined = undefined;
	export let onTaskClick: ((taskId: string) => void) | undefined = undefined;

	const dispatch = createEventDispatcher();

	function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		onDelete?.();
		dispatch('delete', { braindump });
	}

	function handleTaskClick(e: MouseEvent, taskId: string) {
		e.stopPropagation();
		onTaskClick?.(taskId);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onClick?.();
		}
	}

	// Helper to get time display
	function getTimeDisplay(dateStr: string): string {
		const date = new Date(dateStr);
		const hoursAgo = differenceInHours(new Date(), date);

		if (hoursAgo < 24) {
			return formatDistanceToNow(date, { addSuffix: true });
		}

		return format(date, 'MMM d, yyyy');
	}

	// Helper to truncate content
	function truncateContent(content: string, maxLength: number = 150): string {
		const stripped = content.replace(/[#*_`]/g, '').trim();
		return stripped.length > maxLength ? stripped.substring(0, maxLength) + '...' : stripped;
	}

	// Helper to get status color and icon
	function getStatusInfo(status: string): { color: string; icon: any; label: string } {
		switch (status) {
			case 'processed':
				return {
					color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
					icon: CheckCircle2,
					label: 'Processed'
				};
			case 'processing':
				return {
					color: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
					icon: Clock,
					label: 'Processing'
				};
			case 'pending':
				return {
					color: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
					icon: Clock,
					label: 'Pending'
				};
			default:
				return {
					color: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700',
					icon: Brain,
					label: 'Draft'
				};
		}
	}

	$: statusInfo = getStatusInfo(braindump.status);
	$: timeDisplay = getTimeDisplay(braindump.created_at);
</script>

<div
	class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border-2
         border-purple-200 dark:border-purple-800
         hover:border-purple-300 dark:hover:border-purple-700
         transition-all duration-200 cursor-pointer group hover:shadow-md"
	onclick={onClick}
	onkeydown={handleKeyDown}
	role="button"
	tabindex="0"
	aria-label="Brain dump: {braindump.title || 'Untitled'}"
>
	<!-- Header: Title + Time + Actions -->
	<div class="px-3 py-2 sm:px-4 sm:py-3 border-b border-gray-200 dark:border-gray-700">
		<div class="flex items-start justify-between gap-2">
			<!-- Title -->
			<div class="flex-1 min-w-0">
				<h3
					class="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 truncate"
				>
					{braindump.title || 'Untitled Brain Dump'}
				</h3>
			</div>

			<!-- Time + Actions -->
			<div class="flex items-center gap-2 flex-shrink-0">
				<!-- Creation date -->
				<span class="text-xs text-gray-500 dark:text-gray-400">
					{timeDisplay}
				</span>

				<!-- Delete button (hover reveal) -->
				<Button
					onclick={handleDelete}
					variant="ghost"
					size="sm"
					btnType="container"
					class="p-1.5 min-h-0 min-w-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400
                         hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all duration-200
                         opacity-0 group-hover:opacity-100"
					aria-label="Delete braindump"
					title="Delete braindump"
				>
					<Trash2 class="w-4 h-4" />
				</Button>
			</div>
		</div>
	</div>

	<!-- Content Section -->
	<div class="px-3 py-2 sm:px-4 sm:py-3">
		<!-- Content preview -->
		<div class="mb-3">
			<div class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
				{truncateContent(braindump.content)}
			</div>
		</div>

		<!-- Footer: Linked items + Status -->
		<div class="flex items-start justify-between gap-2">
			<!-- Linked tasks and notes -->
			<div class="flex flex-col gap-2 flex-1 min-w-0">
				{#if braindump.linked_tasks.length > 0}
					<div class="flex flex-wrap items-center gap-1.5">
						<div
							class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400"
						>
							<CheckSquare class="w-3 h-3" />
							<span class="font-medium">
								{braindump.linked_tasks.length} task{braindump.linked_tasks.length >
								1
									? 's'
									: ''}:
							</span>
						</div>

						<!-- Task chips (first 3) -->
						{#each braindump.linked_tasks.slice(0, 3) as task}
							<button
								class="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20
                                     text-blue-700 dark:text-blue-300
                                     hover:bg-blue-100 dark:hover:bg-blue-900/30
                                     transition-colors truncate max-w-[150px]"
								onclick={(e) => handleTaskClick(e, task.id)}
								title={task.title}
								aria-label="View task: {task.title}"
							>
								{task.title}
							</button>
						{/each}

						{#if braindump.linked_tasks.length > 3}
							<span class="text-xs text-gray-500 dark:text-gray-400">
								+{braindump.linked_tasks.length - 3} more
							</span>
						{/if}
					</div>
				{/if}

				{#if braindump.linked_notes.length > 0}
					<div class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
						<FileText class="w-3 h-3" />
						<span>
							{braindump.linked_notes.length} note{braindump.linked_notes.length > 1
								? 's'
								: ''}
						</span>
					</div>
				{/if}

				{#if braindump.linked_tasks.length === 0 && braindump.linked_notes.length === 0}
					<div class="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
						<Brain class="w-3 h-3" />
						<span>No linked items</span>
					</div>
				{/if}
			</div>

			<!-- Status badge -->
			<div class="flex-shrink-0">
				<div
					class="inline-flex items-center px-2 py-1 rounded text-xs font-medium {statusInfo.color}"
				>
					<svelte:component this={statusInfo.icon} class="w-3 h-3 mr-1" />
					<span>{statusInfo.label}</span>
				</div>
			</div>
		</div>
	</div>
</div>
