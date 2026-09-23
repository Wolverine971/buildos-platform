<!-- apps/web/src/lib/components/ui/Toast.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Toast } from '$lib/stores/toast.store';
	import { toastService } from '$lib/stores/toast.store';
	import {
		X,
		Check,
		AlertTriangle,
		AlertCircle,
		Info,
		FileText,
		ChevronDown,
		ExternalLink
	} from 'lucide-svelte';

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

	// Rich "document updated" toast: clicking it expands the diff in place. An open
	// diff holds the auto-dismiss timer until it is collapsed or dismissed.
	const documentChange = $derived(toast.documentChange ?? null);
	let changeExpanded = $state(false);
	const uid = $props.id();
	const changeDiffId = `toast-change-${uid}`;

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
	const ToastIcon = $derived(documentChange ? FileText : config.Icon);

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
		if (changeExpanded) return;
		isPaused = false;
		toastService.resume(toast.id);
	}

	function toggleDocumentChange() {
		changeExpanded = !changeExpanded;
		if (changeExpanded) pauseTimer();
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
		flex {documentChange ? 'items-start' : 'items-center'} gap-3 p-3
		{toast.dismissible ? 'pr-14 md:pr-12' : ''}
		rounded-lg border
		shadow-ink-strong backdrop-blur-sm
		w-full max-w-[calc(100vw-2rem)]
		{changeExpanded ? 'md:w-[32rem] md:max-w-lg' : 'md:max-w-md'}
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
		<ToastIcon class="w-4 h-4 {config.iconClass}" strokeWidth={2.5} />
	</div>

	<!-- Content -->
	<div class="flex-1 min-w-0">
		{#if documentChange}
			<!-- Document updated: title + GitHub-style line stats; click to see the diff -->
			<button
				type="button"
				class="
					-m-1 w-[calc(100%+0.5rem)] rounded-md p-1 text-left
					hover:bg-muted/60
					focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
				"
				aria-expanded={changeExpanded}
				aria-controls={changeDiffId}
				onclick={toggleDocumentChange}
			>
				<span class="flex min-w-0 items-baseline gap-1.5">
					<span class="truncate text-sm font-semibold leading-snug {config.textClass}">
						{documentChange.title}
					</span>
					<span class="shrink-0 text-sm text-muted-foreground">updated</span>
				</span>
				<span class="mt-0.5 flex items-center gap-2 text-xs">
					<span class="font-mono font-semibold tabular-nums text-success"
						>+{documentChange.linesAdded}</span
					><span class="sr-only"> lines added,</span>
					<span class="font-mono font-semibold tabular-nums text-destructive"
						>&minus;{documentChange.linesRemoved}</span
					><span class="sr-only"> lines removed.</span>
					<span class="ml-auto inline-flex items-center gap-1 font-medium text-accent">
						{changeExpanded ? 'Hide changes' : 'View changes'}
						<ChevronDown
							class="h-3.5 w-3.5 transition-transform motion-reduce:transition-none {changeExpanded
								? 'rotate-180'
								: ''}"
							aria-hidden="true"
						/>
					</span>
				</span>
			</button>

			{#if changeExpanded}
				<div id={changeDiffId} class="mt-2 space-y-2">
					<!-- Loaded on demand: toasts mount app-wide, the diff renderer (jsdiff) should not. -->
					{#await import('./DocumentChangeDiff.svelte') then { default: DocumentChangeDiff }}
						<DocumentChangeDiff
							hunks={documentChange.hunks}
							linesAdded={documentChange.linesAdded}
							linesRemoved={documentChange.linesRemoved}
							truncated={documentChange.hunksTruncated}
							historyHref={documentChange.historyHref}
							maxHeightClass="max-h-[50vh] md:max-h-80"
						/>
					{/await}
					{#if documentChange.documentHref}
						<a
							href={documentChange.documentHref}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-accent underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Open document
							<ExternalLink class="h-3 w-3" aria-hidden="true" />
							<span class="sr-only">(opens in a new tab)</span>
						</a>
					{/if}
				</div>
			{/if}
		{:else}
			<!-- Message -->
			<p class="text-sm font-medium leading-snug {config.textClass}">
				{toast.message}
			</p>
		{/if}

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
				{documentChange ? 'toast-dismiss-top' : ''}
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

	/* Rich toasts grow downward when expanded; keep the close control on the header row. */
	.toast-dismiss-top {
		top: 0.5rem;
		transform: none;
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
