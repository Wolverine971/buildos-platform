<!-- apps/web/src/lib/components/notifications/types/time-block/TimeBlockMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { LoaderCircle, CheckCircle, AlertCircle, Clock } from 'lucide-svelte';
	import type { TimeBlockNotification } from '$lib/types/notification.types';

	let { notification }: { notification: TimeBlockNotification } = $props();

	let statusInfo = $derived.by(() => {
		const status = notification.status;
		const data = notification.data ?? {};
		const suggestionsState = data.suggestionsState;

		if (status === 'processing') {
			const message =
				suggestionsState?.status === 'generating'
					? (suggestionsState?.progress ?? 'Analyzing tasks...')
					: 'Starting suggestion generation...';

			return {
				icon: 'processing',
				title: 'Creating time block',
				subtitle: message
			};
		}

		if (status === 'success') {
			const suggestionCount = data.suggestions?.length ?? 0;
			const subtitle =
				suggestionCount > 0
					? `${suggestionCount} suggestion${suggestionCount === 1 ? '' : 's'} ready`
					: 'Time block ready';

			return {
				icon: 'completed',
				title: 'Time block created',
				subtitle
			};
		}

		if (status === 'warning') {
			return {
				icon: 'warning',
				title: 'Time block created',
				subtitle: 'AI suggestions unavailable'
			};
		}

		return {
			icon: 'idle',
			title: 'Time block',
			subtitle: ''
		};
	});

	let showProgressBar = $derived(
		notification.status === 'processing' &&
			notification.progress?.type === 'percentage' &&
			typeof notification.progress.percentage === 'number'
	);
</script>

<div class="relative">
	{#if showProgressBar}
		<div class="h-1 bg-gray-200 dark:bg-gray-700 rounded-t-lg">
			<div
				class="h-full bg-purple-600 transition-all duration-300"
				style="width: {notification.progress?.percentage ?? 0}%"
			></div>
		</div>
	{/if}

	<div class="p-4 flex items-center justify-between">
		<div class="flex-shrink-0 mr-3">
			{#if statusInfo.icon === 'processing'}
				<LoaderCircle class="w-5 h-5 text-purple-600 animate-spin" />
			{:else if statusInfo.icon === 'completed'}
				<CheckCircle class="w-5 h-5 text-green-600" />
			{:else if statusInfo.icon === 'warning'}
				<AlertCircle class="w-5 h-5 text-amber-600" />
			{:else}
				<Clock class="w-5 h-5 text-gray-400" />
			{/if}
		</div>

		<div class="flex-1">
			<div class="text-sm font-medium text-gray-900 dark:text-gray-100">
				{statusInfo.title}
			</div>
			{#if statusInfo.subtitle}
				<div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
					{statusInfo.subtitle}
				</div>
			{/if}
		</div>

		{#if notification.data.projectName}
			<div
				class="ml-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300"
			>
				{notification.data.projectName}
			</div>
		{/if}
	</div>
</div>
