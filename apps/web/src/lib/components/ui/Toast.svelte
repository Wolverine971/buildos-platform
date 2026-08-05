<!-- apps/web/src/lib/components/ui/Toast.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Toast } from '$lib/stores/toast.store';
	import { toastService } from '$lib/stores/toast.store';
	import { X, Check, AlertTriangle, AlertCircle, Info } from 'lucide-svelte';

	interface Props {
		toast: Toast;
		ondismiss?: (id: string) => void;
	}

	let { toast, ondismiss }: Props = $props();

	// Swipe gesture state
	let translateX = $state(0);
	let isDragging = $state(false);
	let startX = 0;
	let startY = 0;
	let swipeStartedAt = 0;
	let swipePointerId: number | undefined;
	let swipeAxis: 'pending' | 'horizontal' | undefined;
	let toastElement = $state<HTMLDivElement>();

	let isPaused = $state(false);

	function handleDismiss() {
		if (ondismiss) {
			ondismiss(toast.id);
			return;
		}

		toastService.remove(toast.id);
	}

	// Toast type configuration - Inkprint aligned with semantic textures
	const typeConfig = {
		success: {
			Icon: Check,
			// Grain texture = execution, steady progress - success is work completed
			texture: 'tx tx-grain tx-weak',
			containerClass: 'bg-card border-success/40',
			iconContainerClass: 'bg-success',
			iconClass: 'text-success-foreground',
			textClass: 'text-foreground',
			progressClass: 'bg-success'
		},
		error: {
			Icon: AlertCircle,
			// Static texture = blockers, risk - error is a blocker
			texture: 'tx tx-static tx-weak',
			containerClass: 'bg-card border-destructive/40',
			iconContainerClass: 'bg-destructive',
			iconClass: 'text-destructive-foreground',
			textClass: 'text-foreground',
			progressClass: 'bg-destructive'
		},
		warning: {
			Icon: AlertTriangle,
			// Static texture = blockers, noise, risk - warning is potential risk
			texture: 'tx tx-static tx-weak',
			containerClass: 'bg-card border-warning/40',
			iconContainerClass: 'bg-warning',
			iconClass: 'text-warning-foreground',
			textClass: 'text-foreground',
			progressClass: 'bg-warning'
		},
		info: {
			Icon: Info,
			// Thread texture = relationships, information flow
			texture: 'tx tx-thread tx-weak',
			containerClass: 'bg-card border-info/40',
			iconContainerClass: 'bg-info',
			iconClass: 'text-info-foreground',
			textClass: 'text-foreground',
			progressClass: 'bg-info'
		}
	};

	let config = $derived(typeConfig[toast.type]);

	// Errors and warnings should interrupt screen readers; success/info should not.
	const isAssertive = $derived(toast.type === 'error' || toast.type === 'warning');
	const ariaRole = $derived(isAssertive ? 'alert' : 'status');
	const ariaLive = $derived(isAssertive ? 'assertive' : 'polite');

	// Tracked so the swipe-dismiss animation can be cancelled on unmount.
	let swipeDismissTimeoutId: ReturnType<typeof setTimeout> | undefined;

	onDestroy(() => {
		if (swipeDismissTimeoutId) clearTimeout(swipeDismissTimeoutId);
	});

	function pauseTimer() {
		isPaused = true;
		toastService.pause(toast.id);
	}

	function resumeTimer() {
		isPaused = false;
		toastService.resume(toast.id);
	}

	function resetSwipe({ resume = true } = {}) {
		isDragging = false;
		translateX = 0;
		swipeAxis = undefined;
		swipePointerId = undefined;
		if (resume) resumeTimer();
	}

	function isInteractiveTarget(target: EventTarget | null): boolean {
		return (
			target instanceof Element &&
			Boolean(target.closest('button, a, input, textarea, select, [role="button"]'))
		);
	}

	// Pointer events cover touchscreens without fighting vertical page scrolling.
	function handlePointerDown(event: PointerEvent) {
		if (
			event.pointerType !== 'touch' ||
			!toast.dismissible ||
			isInteractiveTarget(event.target)
		) {
			return;
		}

		startX = event.clientX;
		startY = event.clientY;
		swipeStartedAt = performance.now();
		swipePointerId = event.pointerId;
		swipeAxis = 'pending';
		isDragging = true;
		pauseTimer();
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isDragging || event.pointerId !== swipePointerId) return;

		const deltaX = event.clientX - startX;
		const deltaY = event.clientY - startY;

		if (swipeAxis === 'pending') {
			if (Math.hypot(deltaX, deltaY) < 8) return;
			if (Math.abs(deltaY) >= Math.abs(deltaX)) {
				resetSwipe();
				return;
			}
			swipeAxis = 'horizontal';
			(event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId);
		}

		if (event.cancelable) event.preventDefault();
		translateX = deltaX;
	}

	function handlePointerUp(event: PointerEvent) {
		if (!isDragging || event.pointerId !== swipePointerId) return;

		const target = event.currentTarget as HTMLDivElement;
		if (target.hasPointerCapture?.(event.pointerId)) {
			target.releasePointerCapture(event.pointerId);
		}

		if (swipeAxis !== 'horizontal') {
			resetSwipe();
			return;
		}

		const distance = event.clientX - startX;
		const width = toastElement?.offsetWidth || window.innerWidth;
		const threshold = Math.min(96, Math.max(56, width * 0.25));
		const elapsed = Math.max(1, performance.now() - swipeStartedAt);
		const isQuickFlick = Math.abs(distance) >= 32 && Math.abs(distance) / elapsed >= 0.5;

		if (Math.abs(distance) >= threshold || isQuickFlick) {
			isDragging = false;
			swipeAxis = undefined;
			swipePointerId = undefined;
			translateX = (Math.sign(distance) || 1) * (width + 32);
			swipeDismissTimeoutId = setTimeout(handleDismiss, 150);
			return;
		}

		resetSwipe();
	}

	function handlePointerCancel(event: PointerEvent) {
		if (event.pointerId !== swipePointerId) return;
		resetSwipe();
	}

	// Pause progress and store timeout while the toast is being interacted with.
	function handleMouseEnter() {
		pauseTimer();
	}

	function handleMouseLeave() {
		resumeTimer();
	}
</script>

<div
	bind:this={toastElement}
	class="
		toast-surface relative overflow-hidden
		flex items-center gap-3 p-3
		{toast.dismissible ? 'pr-14 md:pr-12' : ''}
		rounded-lg border
		shadow-ink-strong backdrop-blur-sm
		w-full max-w-[calc(100vw-2rem)] md:max-w-md
		{config.containerClass}
		{config.texture}
		transition-[transform,opacity] duration-150 ease-out
		{isDragging ? 'transition-none' : ''}
	"
	class:toast-surface-swiping={isDragging}
	style:transform={translateX !== 0 ? `translate3d(${translateX}px, 0, 0)` : undefined}
	style:opacity={translateX !== 0
		? Math.max(0, 1 - Math.abs(translateX) / (toastElement?.offsetWidth || 320))
		: undefined}
	role={ariaRole}
	aria-live={ariaLive}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerCancel}
	onmouseenter={handleMouseEnter}
	onmouseleave={handleMouseLeave}
	onfocusin={handleMouseEnter}
	onfocusout={handleMouseLeave}
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
			type="button"
			onclick={(event) => {
				event.stopPropagation();
				handleDismiss();
			}}
			class="
				toast-dismiss absolute right-2 top-1/2 z-10 -translate-y-1/2
				w-9 h-9 md:w-8 md:h-8
				flex items-center justify-center
				rounded-lg
				{config.textClass}
				hover:bg-black/5 dark:hover:bg-card/10
				focus:outline-none focus:ring-2 focus:ring-ring
				transition-colors
				pressable
			"
			aria-label="Dismiss notification"
		>
			<X class="w-4 h-4 md:w-3.5 md:h-3.5" strokeWidth={2} />
		</button>
	{/if}

	<!-- Progress bar (only show if auto-dismissing) -->
	{#if toast.duration && toast.duration > 0}
		<div
			class="
				toast-progress-track absolute bottom-0 left-0 right-0 h-1
				bg-black/5 dark:bg-card/5
			"
		>
			<div
				class="toast-progress
					h-full
					{config.progressClass}
					{isPaused ? 'toast-progress-paused' : ''}
				"
				style="--toast-duration: {toast.duration}ms"
			></div>
		</div>
	{/if}
</div>

<style>
	.toast-surface {
		touch-action: pan-y;
		overscroll-behavior-x: contain;
	}

	/* Promote only while a swipe is actually in progress — an idle toast must not
	   hold a composited layer for its whole lifetime. */
	.toast-surface-swiping {
		will-change: transform, opacity;
	}

	/* Ensure toast content stays above texture */
	.toast-surface > :global(*) {
		z-index: 2;
	}

	/* Inkprint positions direct texture children relatively, so interactive
	   overlays need component-level positioning to stay anchored. */
	.toast-dismiss {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		z-index: 3;
		transform: translateY(-50%);
	}

	.toast-progress-track {
		position: absolute;
		z-index: 2;
	}

	@keyframes toast-progress-shrink {
		from {
			transform: scaleX(1);
		}
		to {
			transform: scaleX(0);
		}
	}

	.toast-progress {
		transform-origin: left center;
		animation: toast-progress-shrink var(--toast-duration) linear forwards;
	}

	.toast-progress-paused {
		animation-play-state: paused;
	}

	/* Respect reduced motion: keep the countdown information but replace the
	   continuous shrink with a handful of discrete steps. */
	@media (prefers-reduced-motion: reduce) {
		.toast-progress {
			animation-timing-function: steps(8, end);
		}

		div {
			transition: none !important;
		}
	}
</style>
