<!-- apps/web/src/lib/components/pwa/PullToRefresh.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { isInstalledPWA } from '$lib/utils/pwa-enhancements';

	type Props = {
		onRefresh: () => Promise<void> | void;
		disabled?: boolean;
		threshold?: number;
	};

	let { onRefresh, disabled = false, threshold = 80 }: Props = $props();

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

	let isAvailable = $state(false);
	let isPulling = $state(false);
	let isRefreshing = $state(false);
	let pullDistance = $state(0);
	let readyToRefresh = $state(false);

	let tracking = false;
	let startX = 0;
	let startY = 0;

	const indicatorTransform = $derived.by(() => {
		if (isRefreshing || readyToRefresh) {
			return 'translateX(-50%) translateY(0)';
		}

		const visibleOffset = Math.min(pullDistance, 48);
		return `translateX(-50%) translateY(calc(-100% + ${visibleOffset}px))`;
	});

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
		pullDistance = Math.min(deltaY * 0.55, threshold * 1.35);
		readyToRefresh = deltaY >= threshold;
	}

	function handleTouchEnd() {
		if (!tracking) return;

		const shouldRefresh = readyToRefresh && !disabled && !hasOpenModal() && !isRefreshing;
		resetGesture();

		if (shouldRefresh) {
			void triggerRefresh();
		}
	}

	async function triggerRefresh() {
		if (isRefreshing || disabled || hasOpenModal()) return;

		isRefreshing = true;
		try {
			await Promise.resolve(onRefresh());
		} catch (error) {
			console.error('[PWA] Pull-to-refresh failed:', error);
		} finally {
			isRefreshing = false;
			resetGesture();
		}
	}

	onMount(() => {
		if (!browser || !isInstalledPWA() || !isTouchDevice()) return;

		isAvailable = true;
		document.addEventListener('touchstart', handleTouchStart, { passive: true });
		document.addEventListener('touchmove', handleTouchMove, { passive: false });
		document.addEventListener('touchend', handleTouchEnd, { passive: true });
		document.addEventListener('touchcancel', resetGesture, { passive: true });

		return () => {
			document.removeEventListener('touchstart', handleTouchStart);
			document.removeEventListener('touchmove', handleTouchMove);
			document.removeEventListener('touchend', handleTouchEnd);
			document.removeEventListener('touchcancel', resetGesture);
		};
	});
</script>

{#if isAvailable && (isPulling || isRefreshing)}
	<div
		class="pwa-pull-to-refresh"
		class:active={isPulling || isRefreshing}
		class:ready={readyToRefresh}
		class:refreshing={isRefreshing}
		style:transform={indicatorTransform}
		role="status"
		aria-live="polite"
	>
		<span class="pwa-pull-to-refresh__spinner" aria-hidden="true"></span>
		<span>
			{#if isRefreshing}
				Refreshing...
			{:else if readyToRefresh}
				Release to refresh
			{:else}
				Pull to refresh
			{/if}
		</span>
	</div>
{/if}
