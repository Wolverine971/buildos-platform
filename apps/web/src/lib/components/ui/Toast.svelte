<!-- apps/web/src/lib/components/ui/Toast.svelte -->
<script lang="ts">
	import type { Toast } from '$lib/stores/toast.store';
	import { toastService } from '$lib/stores/toast.store';
	import { X, Check, AlertTriangle, AlertCircle, Info } from 'lucide-svelte';
	import { onMount } from 'svelte';

	interface Props {
		toast: Toast;
		ondismiss?: (id: string) => void;
	}

	let { toast, ondismiss }: Props = $props();

	// Swipe gesture state
	let translateX = $state(0);
	let isDragging = $state(false);
	let startX = 0;
	let toastElement: HTMLDivElement;

	// Progress state for auto-dismiss countdown
	let progress = $state(100);
	let progressInterval: ReturnType<typeof setInterval> | undefined;
	let isPaused = $state(false);
	let startTime = $state(Date.now());
	let duration = $state(toast.duration || 0);

	function handleDismiss() {
		ondismiss?.(toast.id);
	}

	// Toast type configuration - Inkprint aligned with semantic textures
	const typeConfig = {
		success: {
			Icon: Check,
			// Grain texture = execution, steady progress - success is work completed
			texture: 'tx tx-grain tx-weak',
			containerClass:
				'bg-emerald-50/95 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800',
			iconContainerClass: 'bg-emerald-500 dark:bg-emerald-600',
			iconClass: 'text-white',
			textClass: 'text-emerald-900 dark:text-emerald-100',
			progressClass: 'bg-emerald-500 dark:bg-emerald-400'
		},
		error: {
			Icon: AlertCircle,
			// Static texture = blockers, risk - error is a blocker
			texture: 'tx tx-static tx-weak',
			containerClass: 'bg-red-50/95 dark:bg-red-950/90 border-red-300 dark:border-red-800',
			iconContainerClass: 'bg-red-500 dark:bg-red-600',
			iconClass: 'text-white',
			textClass: 'text-red-900 dark:text-red-100',
			progressClass: 'bg-red-500 dark:bg-red-400'
		},
		warning: {
			Icon: AlertTriangle,
			// Static texture = blockers, noise, risk - warning is potential risk
			texture: 'tx tx-static tx-weak',
			containerClass:
				'bg-amber-50/95 dark:bg-amber-950/90 border-amber-300 dark:border-amber-800',
			iconContainerClass: 'bg-amber-500 dark:bg-amber-600',
			iconClass: 'text-white',
			textClass: 'text-amber-900 dark:text-amber-100',
			progressClass: 'bg-amber-500 dark:bg-amber-400'
		},
		info: {
			Icon: Info,
			// Thread texture = relationships, information flow
			texture: 'tx tx-thread tx-weak',
			containerClass:
				'bg-blue-50/95 dark:bg-blue-950/90 border-blue-300 dark:border-blue-800',
			iconContainerClass: 'bg-blue-500 dark:bg-blue-600',
			iconClass: 'text-white',
			textClass: 'text-blue-900 dark:text-blue-100',
			progressClass: 'bg-blue-500 dark:bg-blue-400'
		}
	};

	let config = $derived(typeConfig[toast.type]);

	// Progress bar countdown (visual only - store handles actual dismissal)
	onMount(() => {
		if (duration > 0) {
			progressInterval = setInterval(() => {
				if (!isPaused) {
					const elapsed = Date.now() - startTime;
					progress = Math.max(0, 100 - (elapsed / duration) * 100);

					if (progress <= 0) {
						clearInterval(progressInterval);
					}
				}
			}, 16); // ~60fps for smooth animation
		}

		return () => {
			if (progressInterval) clearInterval(progressInterval);
		};
	});

	// Touch gesture handlers for swipe-to-dismiss
	function handleTouchStart(e: TouchEvent) {
		startX = e.touches[0].clientX;
		isDragging = true;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		const currentX = e.touches[0].clientX;
		const diff = currentX - startX;
		// Only allow swiping right (positive direction) to dismiss
		translateX = Math.max(0, diff);
	}

	function handleTouchEnd() {
		isDragging = false;
		// Dismiss if swiped more than 100px or 40% of width
		const threshold = Math.min(100, toastElement?.offsetWidth * 0.4 || 100);
		if (translateX > threshold) {
			// Animate out and dismiss
			translateX = 400;
			setTimeout(handleDismiss, 150);
		} else {
			// Snap back
			translateX = 0;
		}
	}

	// Pause progress and store timeout on hover/touch
	function handleMouseEnter() {
		isPaused = true;
		toastService.pause(toast.id);
	}

	function handleMouseLeave() {
		// Update our local state to match remaining time from store
		const state = toastService.getState(toast.id);
		if (state) {
			duration = state.remainingTime;
			startTime = Date.now();
			progress = 100; // Reset progress for remaining duration
		}
		isPaused = false;
		toastService.resume(toast.id);
	}
</script>

<div
	bind:this={toastElement}
	class="
		relative overflow-hidden
		flex items-center gap-3 p-3
		rounded-lg border
		shadow-ink-strong backdrop-blur-sm
		w-full max-w-[calc(100vw-2rem)] sm:max-w-md
		{config.containerClass}
		{config.texture}
		transition-transform duration-150 ease-out
		{isDragging ? '' : 'transition-[transform,opacity]'}
	"
	style="transform: translateX({translateX}px); opacity: {translateX > 0
		? 1 - translateX / 400
		: 1}"
	role="alert"
	aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
	ontouchstart={handleTouchStart}
	ontouchmove={handleTouchMove}
	ontouchend={handleTouchEnd}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
>
	<!-- Icon -->
	<div
		class="
			flex-shrink-0
			w-8 h-8
			flex items-center justify-center
			rounded-full
			{config.iconContainerClass}
		"
	>
		<config.Icon class="w-4 h-4 {config.iconClass}" strokeWidth={2.5} />
	</div>

	<!-- Content -->
	<div class="flex-1 min-w-0">
		<!-- Message -->
		<p class="text-sm font-medium leading-snug {config.textClass}">
			{toast.message}
		</p>

		<!-- Action button if provided -->
		{#if toast.action}
			<button
				onclick={toast.action.onClick}
				class="
					mt-2 text-sm font-semibold underline underline-offset-2
					{config.textClass}
					hover:opacity-80
					focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1
					pressable
				"
			>
				{toast.action.label}
			</button>
		{/if}
	</div>

	<!-- Dismiss button -->
	{#if toast.dismissible}
		<button
			onclick={handleDismiss}
			class="
				flex-shrink-0
				w-8 h-8 sm:w-7 sm:h-7
				flex items-center justify-center
				rounded-lg
				{config.textClass}
				hover:bg-black/5 dark:hover:bg-white/10
				focus:outline-none focus:ring-2 focus:ring-ring
				transition-colors
				pressable
			"
			aria-label="Dismiss notification"
		>
			<X class="w-4 h-4 sm:w-3.5 sm:h-3.5" strokeWidth={2} />
		</button>
	{/if}

	<!-- Progress bar (only show if auto-dismissing) -->
	{#if toast.duration && toast.duration > 0}
		<div
			class="
				absolute bottom-0 left-0 right-0 h-1
				bg-black/5 dark:bg-white/5
			"
		>
			<div
				class="
					h-full
					{config.progressClass}
					{isPaused ? '' : 'transition-[width] duration-100 ease-linear'}
				"
				style="width: {progress}%"
			></div>
		</div>
	{/if}

	<!-- Swipe hint indicator (mobile only) - subtle line on right edge -->
	<div
		class="
			absolute right-1 top-1/2 -translate-y-1/2
			w-1 h-8 rounded-full
			bg-black/10 dark:bg-white/10
			sm:hidden
			{translateX > 0 ? 'opacity-0' : 'opacity-100'}
			transition-opacity
		"
		aria-hidden="true"
	></div>
</div>

<style>
	/* Ensure toast content stays above texture */
	div :global(> *) {
		position: relative;
		z-index: 2;
	}

	/* Respect reduced motion */
	@media (prefers-reduced-motion: reduce) {
		div {
			transition: none !important;
		}
	}
</style>
