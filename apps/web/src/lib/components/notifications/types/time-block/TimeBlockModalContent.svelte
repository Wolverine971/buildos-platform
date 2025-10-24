<!-- apps/web/src/lib/components/notifications/types/time-block/TimeBlockModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { Loader2, AlertCircle, Calendar, Clock } from 'lucide-svelte';
	import type { TimeBlockNotification } from '$lib/types/notification.types';
	import { format } from 'date-fns';

	let { notification }: { notification: TimeBlockNotification } = $props();

	let formattedDate = $derived(
		notification.data.startTime
			? format(new Date(notification.data.startTime), 'EEEE, MMM d, yyyy')
			: ''
	);

	let formattedTime = $derived(
		notification.data.startTime && notification.data.endTime
			? `${format(new Date(notification.data.startTime), 'h:mm a')} - ${format(
					new Date(notification.data.endTime),
					'h:mm a'
				)}`
			: ''
	);

	let durationText = $derived.by(() => {
		const durationMinutes = notification.data.durationMinutes ?? 0;
		if (!durationMinutes) {
			return '';
		}

		const hours = Math.floor(durationMinutes / 60);
		const minutes = durationMinutes % 60;
		const parts: string[] = [];
		if (hours > 0) {
			parts.push(`${hours}h`);
		}
		if (minutes > 0) {
			parts.push(`${minutes}m`);
		}
		return parts.join(' ') || '0m';
	});

	function handleOpenCalendar() {
		if (typeof window === 'undefined') return;
		const link = notification.data.calendarEventLink;
		if (link) {
			window.open(link, '_blank', 'noopener,noreferrer');
		}
	}
</script>

<div class="p-6 space-y-6">
	<div>
		<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
			{notification.data.blockType === 'project' ? 'Project Time Block' : 'Build Block'}
		</h3>
		{#if formattedDate}
			<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{formattedDate}</p>
		{/if}
	</div>

	<div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
		{#if formattedTime}
			<div class="flex items-center text-sm text-gray-700 dark:text-gray-300">
				<Clock class="w-4 h-4 mr-2" />
				{formattedTime}
				{#if durationText}
					<span class="ml-2 text-gray-500 dark:text-gray-400">({durationText})</span>
				{/if}
			</div>
		{/if}

		{#if notification.data.projectName}
			<div class="text-sm text-gray-700 dark:text-gray-300">
				<span class="font-medium">Project:</span>
				{notification.data.projectName}
			</div>
		{/if}
	</div>

	{#if notification.status === 'processing'}
		<div class="flex items-center text-purple-700 dark:text-purple-300">
			<Loader2 class="w-5 h-5 mr-2 animate-spin" />
			<span class="text-sm">
				{notification.data.suggestionsState?.progress ?? 'Generating AI suggestions...'}
			</span>
		</div>
	{:else if notification.status === 'warning'}
		<div class="flex items-center text-amber-700 dark:text-amber-300">
			<AlertCircle class="w-5 h-5 mr-2" />
			<span class="text-sm">
				AI suggestions unavailable. Your time block was still created successfully.
			</span>
		</div>
	{:else if notification.status === 'success' && notification.data.suggestions?.length}
		<div class="space-y-4">
			<div>
				<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
					AI Suggested Tasks
				</h4>

				<div class="space-y-3">
					{#each notification.data.suggestions as suggestion, index}
						<div
							class="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"
						>
							<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
								{index + 1}. {suggestion.title}
							</div>
							{#if suggestion.reason}
								<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
									{suggestion.reason}
								</div>
							{/if}
							<div
								class="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400"
							>
								{#if suggestion.estimated_minutes}
									<span>{suggestion.estimated_minutes} min</span>
								{/if}
								{#if suggestion.priority}
									<span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
										{suggestion.priority}
									</span>
								{/if}
								{#if suggestion.project_name && notification.data.blockType === 'build'}
									<span class="text-blue-600 dark:text-blue-400">
										{suggestion.project_name}
									</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			{#if notification.data.suggestionsSummary}
				<div
					class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-200"
				>
					{notification.data.suggestionsSummary}
				</div>
			{/if}
		</div>
	{/if}

	{#if notification.data.calendarEventLink}
		<div class="flex gap-2">
			<button
				onclick={handleOpenCalendar}
				class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
			>
				<Calendar class="w-4 h-4" />
				Open in Google Calendar
			</button>
		</div>
	{/if}
</div>
