<!-- apps/web/src/lib/components/pwa/PullToRefresh.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount, type Snippet } from 'svelte';
	import { isInstalledPWA } from '$lib/utils/pwa-enhancements';

	type Props = {
		onRefresh: () => Promise<void> | void;
		disabled?: boolean;
		threshold?: number;
		children?: Snippet;
	};

	let { onRefresh, disabled = false, threshold = 72, children }: Props = $props();

	const MODAL_SELECTOR = '.modal-root, [aria-modal="true"], [role="dialog"]';
	const IGNORE_START_SELECTOR = [
		MODAL_SELECTOR,
		'input',
		'textarea',
		'select',
		'button',
		'a',
		'[contenteditable="true"]',
		'[data-pull-refresh-ignore]'
	].join(', ');
	const MAX_PULL_OFFSET = 72;
	const REFRESH_HOLD_OFFSET = 44;
	const SETTLE_MS = 180;

	let isAvailable = $state(false);
	let isPulling = $state(false);
	let isRefreshing = $state(false);
	let isSettling = $state(false);
	let pullDistance = $state(0);
	let readyToRefresh = $state(false);
	let settleTimer: ReturnType<typeof setTimeout> | null = null;

	let tracking = false;
	let startX = 0;
	let startY = 0;

	const visibleOffset = $derived(isRefreshing ? REFRESH_HOLD_OFFSET : pullDistance);
	const pullProgress = $derived(Math.min(visibleOffset / threshold, 1));
	const indicatorOffset = $derived(Math.min(12, visibleOffset - 36));
	const indicatorScale = $derived(0.72 + pullProgress * 0.28);
	const surfaceTransform = $derived(`translate3d(0, ${visibleOffset}px, 0)`);
	const indicatorStyle = $derived(
		`transform: translate3d(-50%, ${indicatorOffset}px, 0) scale(${indicatorScale}); opacity: ${Math.min(
			1,
			pullProgress * 1.4
		)};`
	);
	const spinnerStyle = $derived(`transform: rotate(${pullProgress * 280}deg);`);

	function startSettling() {
		isSettling = true;
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			isSettling = false;
			settleTimer = null;
		}, SETTLE_MS);
	}

	function isTouchDevice() {
		return (
			window.matchMedia('(pointer: coarse)').matches ||
			'ontouchstart' in window ||
			navigator.maxTouchPoints > 0
		);
	}

	function hasOpenModal() {
		return document.querySelector(MODAL_SELECTOR) !== null;
	}

	function shouldIgnoreStartTarget(target: EventTarget | null) {
		return target instanceof Element && target.closest(IGNORE_START_SELECTOR) !== null;
	}

	function isPageAtTop() {
		return window.scrollY <= 0;
	}

	function resetGesture() {
		tracking = false;
		startX = 0;
		startY = 0;
		isPulling = false;
		pullDistance = 0;
		readyToRefresh = false;
	}

	function easePullDistance(distance: number) {
		return Math.min(distance * 0.42, MAX_PULL_OFFSET);
	}

	function canStartGesture(event: TouchEvent) {
		return (
			isAvailable &&
			!disabled &&
			!isRefreshing &&
			event.touches.length === 1 &&
			isPageAtTop() &&
			!hasOpenModal() &&
			!shouldIgnoreStartTarget(event.target)
		);
	}

	function handleTouchStart(event: TouchEvent) {
		if (!canStartGesture(event)) return;

		const touch = event.touches[0];
		if (!touch) return;

		tracking = true;
		startX = touch.clientX;
		startY = touch.clientY;
		isSettling = false;
		isPulling = false;
		pullDistance = 0;
		readyToRefresh = false;
	}

	function handleTouchMove(event: TouchEvent) {
		if (!tracking || event.touches.length !== 1) return;

		if (disabled || isRefreshing || hasOpenModal() || !isPageAtTop()) {
			resetGesture();
			return;
		}

		const touch = event.touches[0];
		if (!touch) return;

		const deltaX = touch.clientX - startX;
		const deltaY = touch.clientY - startY;

		if (deltaY <= 0) {
			resetGesture();
			return;
		}

		if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 12) {
			resetGesture();
			return;
		}

		if (deltaY < 8) return;

		if (event.cancelable) {
			event.preventDefault();
		}

		isPulling = true;
		pullDistance = easePullDistance(deltaY);
		readyToRefresh = deltaY >= threshold;
	}

	function handleTouchEnd() {
		if (!tracking) return;

		const shouldRefresh = readyToRefresh && !disabled && !hasOpenModal() && !isRefreshing;
		tracking = false;
		startX = 0;
		startY = 0;
		isPulling = false;
		readyToRefresh = false;

		if (shouldRefresh) {
			void triggerRefresh();
			return;
		}

		pullDistance = 0;
		startSettling();
	}

	function handleTouchCancel() {
		resetGesture();
		startSettling();
	}

	async function triggerRefresh() {
		if (isRefreshing || disabled || hasOpenModal()) return;

		isRefreshing = true;
		pullDistance = 0;
		startSettling();
		try {
			await Promise.resolve(onRefresh());
		} catch (error) {
			console.error('[PWA] Pull-to-refresh failed:', error);
		} finally {
			isRefreshing = false;
			resetGesture();
			startSettling();
		}
	}

	onMount(() => {
		if (!browser || !isInstalledPWA() || !isTouchDevice()) return;

		isAvailable = true;
		document.addEventListener('touchstart', handleTouchStart, { passive: true });
		document.addEventListener('touchmove', handleTouchMove, { passive: false });
		document.addEventListener('touchend', handleTouchEnd, { passive: true });
		document.addEventListener('touchcancel', handleTouchCancel, { passive: true });

		return () => {
			if (settleTimer) clearTimeout(settleTimer);
			document.removeEventListener('touchstart', handleTouchStart);
			document.removeEventListener('touchmove', handleTouchMove);
			document.removeEventListener('touchend', handleTouchEnd);
			document.removeEventListener('touchcancel', handleTouchCancel);
		};
	});
</script>

{#if children}
	<div
		class="pwa-pull-to-refresh-surface"
		class:pulling={isPulling}
		class:settling={isSettling || isRefreshing}
		style:transform={surfaceTransform}
	>
		{@render children()}
	</div>
{/if}

{#if isAvailable && (isPulling || isRefreshing)}
	<div
		class="pwa-pull-to-refresh"
		class:active={isPulling || isRefreshing}
		class:ready={readyToRefresh}
		class:refreshing={isRefreshing}
		style={indicatorStyle}
		role="status"
		aria-live="polite"
		aria-label={isRefreshing
			? 'Refreshing'
			: readyToRefresh
				? 'Release to refresh'
				: 'Pull to refresh'}
	>
		<span class="pwa-pull-to-refresh__spinner" style={spinnerStyle} aria-hidden="true"></span>
	</div>
{/if}
