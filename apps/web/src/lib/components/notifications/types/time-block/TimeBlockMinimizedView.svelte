<!-- apps/web/src/lib/components/notifications/types/time-block/TimeBlockMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { LoaderCircle, CheckCircle, AlertCircle, Clock } from '$lib/icons/lucide';
	import NotificationPreviewContent from '../../NotificationPreviewContent.svelte';
	import { getNotificationPreview } from '../../notification-preview';
	import type { TimeBlockNotification } from '$lib/types/notification.types';

	let { notification }: { notification: TimeBlockNotification } = $props();

	let content = $derived(getNotificationPreview(notification));

	let showProgressBar = $derived(
		notification.status === 'processing' &&
			notification.progress?.type === 'percentage' &&
			typeof notification.progress.percentage === 'number'
	);
	let progressPercentage = $derived.by(() => {
		if (notification.progress?.type !== 'percentage') return 0;
		const percentage = notification.progress.percentage;
		return Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
	});
</script>

<div class="relative">
	{#if showProgressBar}
		<div class="h-1 bg-muted rounded-t-lg">
			<div
				class="h-full bg-accent transition-all duration-300 motion-reduce:transition-none"
				style="width: {progressPercentage}%"
			></div>
		</div>
	{/if}

	<div class="flex items-start gap-3 p-4">
		<div class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
			{#if notification.status === 'processing'}
				<LoaderCircle
					class="h-5 w-5 animate-spin text-info motion-reduce:animate-none"
					aria-hidden="true"
				/>
			{:else if notification.status === 'success'}
				<CheckCircle class="h-5 w-5 text-success" aria-hidden="true" />
			{:else if notification.status === 'warning'}
				<AlertCircle class="h-5 w-5 text-warning" aria-hidden="true" />
			{:else if notification.status === 'error'}
				<AlertCircle class="h-5 w-5 text-destructive" aria-hidden="true" />
			{:else}
				<Clock class="h-5 w-5 text-muted-foreground" aria-hidden="true" />
			{/if}
		</div>

		<div class="min-w-0 flex-1">
			<NotificationPreviewContent {...content} icon={Clock} />
		</div>
	</div>
</div>
