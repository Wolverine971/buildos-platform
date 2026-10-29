<!-- apps/web/src/lib/components/notifications/types/daily-brief/DailyBriefMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	/**
	 * Minimized card for daily-brief generation (bottom-right stack).
	 * Processing: step message + progress bar. Ready: tap to open. Failed: the
	 * error, until dismissed. The card's own buttons carry the actions — the
	 * wrapper in MinimizedNotification does not expand this type.
	 */
	import {
		AlertTriangle,
		CheckCircle,
		FileText,
		LoaderCircle,
		X,
		XCircle
	} from '$lib/icons/lucide';
	import type { DailyBriefNotification } from '$lib/types/notification.types';

	let { notification }: { notification: DailyBriefNotification } = $props();

	let title = $derived(
		notification.status === 'processing'
			? 'Generating your brief'
			: notification.status === 'success'
				? 'Your brief is ready'
				: notification.status === 'error'
					? 'Brief generation failed'
					: notification.status === 'cancelled'
						? 'Brief generation cancelled'
						: 'Daily brief'
	);

	let percentage = $derived.by(() => {
		const progress = notification.progress;
		if (!progress || !('percentage' in progress) || typeof progress.percentage !== 'number') {
			return null;
		}
		if (!Number.isFinite(progress.percentage)) return null;
		return Math.round(Math.min(100, Math.max(0, progress.percentage)));
	});

	let subtitle = $derived.by(() => {
		if (notification.status === 'processing') {
			const step =
				notification.data.message?.trim() ||
				notification.progress?.message?.trim() ||
				'Starting…';
			return percentage && percentage > 0 ? `${step} · ${percentage}%` : step;
		}
		if (notification.status === 'error') {
			return notification.data.error?.trim() || 'Open briefs to try again.';
		}
		return notification.progress?.message?.trim() || '';
	});

	let openLabel = $derived(subtitle ? `${title}. ${subtitle}` : title);
	let dismissLabel = $derived(
		notification.status === 'processing' ? 'Hide brief progress' : 'Dismiss'
	);

	function handleOpen(event: Event) {
		event.stopPropagation();
		notification.actions?.view?.();
	}

	function handleDismiss(event: Event) {
		event.stopPropagation();
		notification.actions?.dismiss?.();
	}
</script>

<div class="flex items-center gap-2 p-3">
	<!-- Status icon -->
	<div class="flex-shrink-0" aria-hidden="true">
		{#if notification.status === 'processing'}
			<LoaderCircle class="w-5 h-5 text-accent animate-spin motion-reduce:animate-none" />
		{:else if notification.status === 'success'}
			<CheckCircle class="w-5 h-5 text-success" />
		{:else if notification.status === 'error'}
			<AlertTriangle class="w-5 h-5 text-destructive" />
		{:else if notification.status === 'cancelled'}
			<XCircle class="w-5 h-5 text-muted-foreground" />
		{:else}
			<FileText class="w-5 h-5 text-muted-foreground" />
		{/if}
	</div>

	<!-- Open the brief -->
	<button
		type="button"
		onclick={handleOpen}
		class="min-h-11 min-w-0 flex-1 rounded-md px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label={openLabel}
	>
		<span class="flex items-baseline justify-between gap-2">
			<span class="min-w-0 truncate text-sm font-semibold text-foreground">{title}</span>
			<span class="flex-shrink-0 text-xs text-muted-foreground">
				{notification.data.dateLabel}
			</span>
		</span>
		{#if subtitle}
			<span class="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>
		{/if}
		{#if notification.status === 'processing'}
			<span class="mt-2 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
				{#if percentage !== null && percentage > 0}
					<span
						class="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
						style="width: {percentage}%"
					></span>
				{:else}
					<span
						class="block h-full w-1/3 rounded-full bg-accent/60 animate-pulse motion-reduce:animate-none"
					></span>
				{/if}
			</span>
		{/if}
	</button>

	<!-- Hide / dismiss -->
	<button
		type="button"
		onclick={handleDismiss}
		class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
		aria-label={dismissLabel}
		title={dismissLabel}
	>
		<X class="w-3.5 h-3.5" />
	</button>
</div>
