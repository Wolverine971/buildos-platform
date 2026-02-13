<!-- apps/web/src/lib/components/notifications/types/calendar-analysis/CalendarAnalysisMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import {
		LoaderCircle,
		CheckCircle,
		AlertCircle,
		CalendarCheck,
		CalendarClock
	} from 'lucide-svelte';
	import type { CalendarAnalysisNotification } from '$lib/types/notification.types';

	let { notification }: { notification: CalendarAnalysisNotification } = $props();

	const DEFAULT_RANGE_LABEL = 'Analyzing recent calendar activity';

	let rangeLabel = $derived(
		(() => {
			const { daysBack, daysForward } = notification.data;
			if (typeof daysBack === 'number' && typeof daysForward === 'number') {
				if (daysBack === 0 && daysForward === 0) {
					return "Analyzing today's events";
				}
				const past =
					daysBack > 0 ? `past ${daysBack} day${daysBack === 1 ? '' : 's'}` : null;
				const future =
					daysForward > 0
						? `next ${daysForward} day${daysForward === 1 ? '' : 's'}`
						: null;
				if (past && future) return `${past} · ${future}`;
				return past ?? future ?? DEFAULT_RANGE_LABEL;
			}
			return DEFAULT_RANGE_LABEL;
		})()
	);

	let statusInfo = $derived(
		(() => {
			const { status, data, progress } = notification;
			const suggestions = Array.isArray(data.suggestions) ? data.suggestions.length : 0;
			const events = typeof data.eventCount === 'number' ? data.eventCount : null;
			const baseSubtitle =
				progress?.message && progress.message.trim().length > 0
					? progress.message
					: rangeLabel;

			switch (status) {
				case 'processing':
					return {
						icon: 'processing' as const,
						title: 'Analyzing calendar',
						subtitle: baseSubtitle
					};
				case 'success':
					return {
						icon: 'success' as const,
						title: events
							? `Found ${suggestions} project${suggestions === 1 ? '' : 's'}`
							: `Analysis complete`,
						subtitle:
							events === null
								? `${suggestions} suggestion${suggestions === 1 ? '' : 's'} ready`
								: `${events} event${events === 1 ? '' : 's'} processed`
					};
				case 'error':
					return {
						icon: 'error' as const,
						title: 'Calendar analysis failed',
						subtitle: data.error ?? progress?.message ?? 'Something went wrong'
					};
				case 'warning':
				case 'cancelled':
				case 'idle':
				default:
					return {
						icon: 'pending' as const,
						title: 'Calendar analysis',
						subtitle: baseSubtitle
					};
			}
		})()
	);

	let showSecondaryMeta = $derived(notification.status === 'success');
	let secondaryMeta = $derived(
		(() => {
			if (!showSecondaryMeta) return null;
			const suggestions = Array.isArray(notification.data.suggestions)
				? notification.data.suggestions.length
				: 0;
			const events =
				typeof notification.data.eventCount === 'number'
					? notification.data.eventCount
					: null;

			if (events === null) return `${suggestions} ready to review`;
			return `${suggestions} suggestion${suggestions === 1 ? '' : 's'} · ${events} event${
				events === 1 ? '' : 's'
			}`;
		})()
	);
</script>

<div class="p-4 flex items-center gap-3">
	<div class="flex-shrink-0">
		{#if statusInfo.icon === 'processing'}
			<LoaderCircle class="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
		{:else if statusInfo.icon === 'success'}
			<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
		{:else if statusInfo.icon === 'error'}
			<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400" />
		{:else}
			<CalendarClock class="w-5 h-5 text-blue-500 dark:text-blue-300" />
		{/if}
	</div>

	<div class="flex-1 min-w-0">
		<div class="text-sm font-medium text-foreground truncate">
			{statusInfo.title}
		</div>
		{#if statusInfo.subtitle}
			<div class="text-xs text-muted-foreground truncate">
				{statusInfo.subtitle}
			</div>
		{/if}
		{#if secondaryMeta}
			<div class="text-[11px] uppercase tracking-wide text-blue-500 dark:text-blue-300 mt-1">
				{secondaryMeta}
			</div>
		{/if}
	</div>

	{#if notification.status === 'success'}
		<div class="flex-shrink-0">
			<CalendarCheck class="w-4 h-4 text-blue-500 dark:text-blue-300" />
		</div>
	{/if}
</div>
