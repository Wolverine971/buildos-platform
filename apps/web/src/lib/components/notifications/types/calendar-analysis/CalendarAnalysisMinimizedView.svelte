<!-- apps/web/src/lib/components/notifications/types/calendar-analysis/CalendarAnalysisMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import {
		LoaderCircle,
		CheckCircle,
		AlertCircle,
		CalendarDays,
		CalendarClock
	} from '$lib/icons/lucide';
	import NotificationPreviewContent from '../../NotificationPreviewContent.svelte';
	import { getNotificationPreview } from '../../notification-preview';
	import type { CalendarAnalysisNotification } from '$lib/types/notification.types';

	let { notification }: { notification: CalendarAnalysisNotification } = $props();

	let content = $derived(getNotificationPreview(notification));
</script>

<div class="p-4 flex items-center gap-3">
	<div class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
		{#if notification.status === 'processing'}
			<LoaderCircle
				class="h-5 w-5 animate-spin text-info motion-reduce:animate-none"
				aria-hidden="true"
			/>
		{:else if notification.status === 'success'}
			<CheckCircle class="h-5 w-5 text-success" aria-hidden="true" />
		{:else if notification.status === 'error'}
			<AlertCircle class="h-5 w-5 text-destructive" aria-hidden="true" />
		{:else}
			<CalendarClock class="h-5 w-5 text-info" aria-hidden="true" />
		{/if}
	</div>

	<div class="flex-1 min-w-0">
		<NotificationPreviewContent {...content} icon={CalendarDays} />
	</div>
</div>
