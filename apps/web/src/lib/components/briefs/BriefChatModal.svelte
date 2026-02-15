<!-- apps/web/src/lib/components/briefs/BriefChatModal.svelte -->
<!--
	BriefChatModal - Two-pane modal for Daily Brief + Agent Chat

	Layout:
	- Desktop (≥768px): Split pane — brief left (flex-1, min 400px), chat right (w-[420px])
	- Mobile (<768px): Bottom-sheet with tabbed view — Brief tab / Chat tab

	Mobile UX:
	- Bottom-sheet slide-up animation with drag handle
	- Swipe-to-dismiss gesture (120px threshold)
	- Safe area insets for iPhone notch/home indicator
	- 44px WCAG AA touch targets on tabs
	- Landscape-optimized compact layout
	- Overscroll containment on all panes

	Design: INKPRINT texture-based design language
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { X, FileText, MessageCircle } from 'lucide-svelte';
	import { portal } from '$lib/actions/portal';
	import { lockBodyScroll, unlockBodyScroll } from '$lib/utils/body-scroll-lock';
	import { renderMarkdown } from '$lib/utils/markdown';
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';
	import type { DailyBrief } from '$lib/types/daily-brief';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';

	interface Props {
		isOpen?: boolean;
		brief: DailyBrief;
		initialChatSessionId?: string | null;
		onClose?: (summary?: DataMutationSummary) => void;
	}

	let { isOpen = false, brief, initialChatSessionId = null, onClose }: Props = $props();

	let activeTab = $state<'brief' | 'chat'>('chat');
	let scrollLockHeld = $state(false);
	let lastSummary = $state<DataMutationSummary | undefined>(undefined);
	let briefChatEntityId = $derived(brief.chat_brief_id || brief.id);

	// Touch gesture state
	let isDragging = $state(false);
	let dragStartY = $state(0);
	let dragTranslateY = $state(0);

	// Auto-detect touch device
	const isTouchDevice = $derived(
		browser &&
			('ontouchstart' in window ||
				navigator.maxTouchPoints > 0 ||
				(navigator as any).msMaxTouchPoints > 0)
	);

	// Tab badge state
	let chatTabHasUnread = $state(false);
	let briefTabHasUpdates = $state(false);

	function handleChatClose(summary?: DataMutationSummary) {
		lastSummary = summary;
		onClose?.(summary);
	}

	function handleBackdropClick(event: MouseEvent | TouchEvent) {
		if (event.target === event.currentTarget) {
			requestClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!isOpen) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			requestClose();
		}
	}

	function requestClose() {
		isOpen = false;
		if (!lastSummary) {
			onClose?.();
		}
	}

	function switchTab(tab: 'brief' | 'chat') {
		activeTab = tab;
		// Clear badge when switching to that tab
		if (tab === 'chat') chatTabHasUnread = false;
		if (tab === 'brief') briefTabHasUpdates = false;
	}

	function formatBriefDate(dateStr: string): string {
		try {
			const date = new Date(dateStr + 'T00:00:00');
			return date.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch {
			return dateStr;
		}
	}

	// Touch gesture handlers (mobile only, downward swipe to dismiss)
	function handleTouchStart(e: TouchEvent) {
		if (!isTouchDevice) return;
		const target = e.target as HTMLElement;
		// Only allow drag from the drag handle area or header
		const isDragHandle = target.closest('.brief-drag-handle');
		if (!isDragHandle) return;

		const touch = e.touches[0];
		if (!touch) return;
		isDragging = true;
		dragStartY = touch.clientY;
		dragTranslateY = 0;
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging) return;
		const currentY = e.touches?.[0]?.clientY;
		if (currentY === undefined) return;
		const deltaY = currentY - dragStartY;
		// Only allow downward drag
		if (deltaY > 0) {
			e.preventDefault();
			dragTranslateY = deltaY;
		}
	}

	function handleTouchEnd() {
		if (!isDragging) return;
		const dismissed = dragTranslateY > 120;
		if (dismissed) {
			requestClose();
		} else {
			dragTranslateY = 0;
		}
		isDragging = false;
		dragStartY = 0;
	}

	// Svelte action: attach non-passive touch listeners for swipe gesture
	function touchGesture(node: HTMLElement) {
		if (!isTouchDevice) return;

		const onStart = (e: TouchEvent) => handleTouchStart(e);
		const onMove = (e: TouchEvent) => handleTouchMove(e);
		const onEnd = () => handleTouchEnd();

		node.addEventListener('touchstart', onStart, { passive: false });
		node.addEventListener('touchmove', onMove, { passive: false });
		node.addEventListener('touchend', onEnd, { passive: false });

		return {
			destroy() {
				node.removeEventListener('touchstart', onStart);
				node.removeEventListener('touchmove', onMove);
				node.removeEventListener('touchend', onEnd);
			}
		};
	}

	$effect(() => {
		if (browser && isOpen && !scrollLockHeld) {
			lockBodyScroll();
			scrollLockHeld = true;
		} else if (browser && !isOpen && scrollLockHeld) {
			unlockBodyScroll();
			scrollLockHeld = false;
		}
	});

	// Reset state when modal opens
	$effect(() => {
		if (isOpen) {
			lastSummary = undefined;
			activeTab = 'chat';
			chatTabHasUnread = false;
			briefTabHasUpdates = false;
			dragTranslateY = 0;
			isDragging = false;
		}
	});

	onDestroy(() => {
		if (browser && scrollLockHeld) {
			unlockBodyScroll();
			scrollLockHeld = false;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div use:portal class="brief-chat-root" transition:fade={{ duration: 100 }} role="presentation">
		<!-- Backdrop -->
		<div
			class="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-[9998]"
			style="touch-action: none;"
			onclick={handleBackdropClick}
			ontouchend={handleBackdropClick}
			aria-hidden="true"
		></div>

		<!-- Modal container -->
		<div class="fixed inset-0 z-[9999] overflow-hidden" style="touch-action: none;">
			<div
				class="flex h-full justify-center
					items-end md:items-center
					p-0 md:p-4"
				role="presentation"
			>
				<!-- Modal content -->
				<div
					use:touchGesture
					class="brief-modal-container w-full max-w-7xl
						bg-card border border-border shadow-ink-strong
						flex flex-col overflow-hidden
						tx tx-frame tx-weak
						rounded-t-2xl md:rounded-lg
						brief-animate-slide-up md:brief-animate-scale"
					style="
						transform: translateY({dragTranslateY}px) translateZ(0);
						transition: {isDragging ? 'none' : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)'};
					"
					role="dialog"
					aria-modal="true"
					aria-label="Brief Chat"
				>
					<!-- Drag handle (mobile only) -->
					<div
						class="brief-drag-handle flex md:hidden items-center justify-center pt-2 pb-1 flex-shrink-0"
						style="touch-action: none; cursor: grab;"
					>
						<div class="w-8 h-1 rounded-full bg-muted-foreground/30"></div>
					</div>

					<!-- Header bar -->
					<div
						class="brief-header flex h-11 md:h-12 items-center justify-between gap-3 px-3 md:px-4
							border-b border-border bg-muted flex-shrink-0"
					>
						<h2 class="text-sm font-semibold text-foreground truncate">
							Daily Brief — {formatBriefDate(brief.brief_date)}
						</h2>
						<button
							type="button"
							onclick={requestClose}
							class="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
								border border-border bg-card text-muted-foreground shadow-ink
								transition-all pressable tx-button
								hover:border-red-600/50 hover:text-red-600
								focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
								dark:hover:border-red-400/50 dark:hover:text-red-400"
							aria-label="Close dialog"
						>
							<X class="h-4 w-4" />
						</button>
					</div>

					<!-- Mobile tab selector -->
					<div
						class="brief-tabs flex md:hidden border-b border-border bg-muted/50 flex-shrink-0"
					>
						<button
							type="button"
							class="brief-tab flex-1 flex items-center justify-center gap-1.5 h-11 text-sm font-semibold transition-colors relative
								{activeTab === 'brief'
								? 'text-foreground border-b-2 border-accent'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => switchTab('brief')}
						>
							<FileText class="h-4 w-4 landscape-only-icon" />
							<span>Brief</span>
							{#if briefTabHasUpdates}
								<span
									class="absolute top-2 right-[calc(50%-24px)] w-2 h-2 rounded-full bg-accent"
								></span>
							{/if}
						</button>
						<button
							type="button"
							class="brief-tab flex-1 flex items-center justify-center gap-1.5 h-11 text-sm font-semibold transition-colors relative
								{activeTab === 'chat'
								? 'text-foreground border-b-2 border-accent'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => switchTab('chat')}
						>
							<MessageCircle class="h-4 w-4 landscape-only-icon" />
							<span>Chat</span>
							{#if chatTabHasUnread}
								<span
									class="absolute top-2 right-[calc(50%-20px)] w-2 h-2 rounded-full bg-accent"
								></span>
							{/if}
						</button>
					</div>

					<!-- Content area: two panes -->
					<div class="flex flex-1 min-h-0 overflow-hidden">
						<!-- Left pane: Brief content -->
						<div
							class="flex-col overflow-y-auto border-r border-border bg-card
								brief-scroll brief-pane
								{activeTab === 'brief' ? 'flex' : 'hidden'} md:flex
								md:flex-1 md:min-w-[400px]"
							style="touch-action: pan-y;"
						>
							<div class="px-3 py-4 md:px-6 md:py-6">
								<div
									class="prose prose-base md:prose-sm dark:prose-invert max-w-none
										prose-headings:font-semibold prose-headings:text-foreground dark:prose-headings:text-white
										prose-p:text-muted-foreground dark:prose-p:text-muted-foreground
										prose-li:text-muted-foreground dark:prose-li:text-muted-foreground
										prose-strong:text-foreground dark:prose-strong:text-muted-foreground
										prose-blockquote:text-muted-foreground dark:prose-blockquote:text-muted-foreground
										prose-blockquote:border-border dark:prose-blockquote:border-gray-600
										prose-code:bg-muted dark:prose-code:bg-gray-800
										prose-code:text-foreground dark:prose-code:text-muted-foreground
										prose-pre:bg-muted dark:prose-pre:bg-gray-800"
								>
									{@html renderMarkdown(brief.summary_content)}
								</div>
							</div>
						</div>

						<!-- Right pane: Chat -->
						<div
							class="flex-col min-h-0 brief-pane
								{activeTab === 'chat' ? 'flex' : 'hidden'} md:flex
								w-full md:w-[340px] lg:w-[420px] md:flex-shrink-0"
							style="touch-action: pan-y;"
						>
							<AgentChatModal
								embedded={true}
								{isOpen}
								contextType="daily_brief"
								entityId={briefChatEntityId}
								{initialChatSessionId}
								onClose={handleChatClose}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ==================== Root & Containment ==================== */

	.brief-chat-root {
		overscroll-behavior: contain;
		z-index: 9999;
		position: relative;
	}

	/* ==================== Modal Container ==================== */

	.brief-modal-container {
		/* GPU acceleration */
		transform: translateZ(0);
		backface-visibility: hidden;
		will-change: transform, opacity;

		/* Disable tap highlight */
		-webkit-tap-highlight-color: transparent;
		-webkit-touch-callout: none;
		touch-action: manipulation;

		/* Mobile: near-full height with safe area subtraction */
		height: calc(100dvh - env(safe-area-inset-top, 0px) - 0.5rem);
	}

	/* Desktop: fixed 90dvh centered */
	@media (min-width: 768px) {
		.brief-modal-container {
			height: 90dvh;
			will-change: auto;
		}
	}

	/* ==================== GPU-Optimized Animations ==================== */

	/* Mobile: slide up from bottom */
	@keyframes brief-slide-up {
		from {
			transform: translateY(100%) translateZ(0);
			opacity: 0;
		}
		to {
			transform: translateY(0) translateZ(0);
			opacity: 1;
		}
	}

	/* Desktop: scale from center */
	@keyframes brief-scale {
		from {
			transform: scale(0.95) translateZ(0);
			opacity: 0;
		}
		to {
			transform: scale(1) translateZ(0);
			opacity: 1;
		}
	}

	:global(.brief-animate-slide-up) {
		animation: brief-slide-up 300ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	:global(.brief-animate-scale) {
		animation: brief-scale 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Desktop overrides slide-up to scale */
	@media (min-width: 768px) {
		:global(.brief-animate-slide-up) {
			animation: brief-scale 200ms cubic-bezier(0.4, 0, 0.2, 1);
		}
	}

	/* ==================== Drag Handle ==================== */

	.brief-drag-handle:active {
		cursor: grabbing;
	}

	.brief-drag-handle:active > div {
		background: hsl(var(--foreground) / 0.5);
		width: 2.5rem;
	}

	/* ==================== Header Safe Area ==================== */

	@supports (padding-top: env(safe-area-inset-top)) {
		/* On iOS, the drag handle area absorbs the safe area top */
		.brief-drag-handle {
			padding-top: max(0.5rem, env(safe-area-inset-top, 0px));
		}
	}

	/* ==================== Tab Styling ==================== */

	.brief-tab {
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
	}

	/* In landscape with short viewport, hide tab text and show icons only */
	@media (orientation: landscape) and (max-height: 500px) {
		.brief-tab span {
			display: none;
		}
		/* :global needed because class is applied on Svelte component props */
		.brief-tab :global(.landscape-only-icon) {
			width: 1.25rem;
			height: 1.25rem;
		}
	}

	/* ==================== Content Panes ==================== */

	.brief-pane {
		overscroll-behavior: contain;
	}

	/* ==================== Brief Scroll Pane ==================== */

	.brief-scroll {
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--muted-foreground) / 0.3) hsl(var(--muted));
	}

	:global(.brief-scroll::-webkit-scrollbar) {
		width: 8px;
	}

	:global(.brief-scroll::-webkit-scrollbar-track) {
		background: hsl(var(--muted));
		border-radius: 0.5rem;
	}

	:global(.brief-scroll::-webkit-scrollbar-thumb) {
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 0.5rem;
	}

	:global(.brief-scroll::-webkit-scrollbar-thumb:hover) {
		background: hsl(var(--muted-foreground) / 0.5);
	}

	/* ==================== iOS Safe Area Support ==================== */

	@supports (-webkit-touch-callout: none) {
		.brief-modal-container {
			/* Account for notch and home indicator */
			max-height: calc(
				100dvh - env(safe-area-inset-top, 0px) -
					max(env(safe-area-inset-bottom, 0px), 0.5rem)
			);
		}
	}

	/* ==================== Landscape Optimization ==================== */

	@media (orientation: landscape) and (max-height: 500px) {
		.brief-modal-container {
			/* Maximize space in landscape */
			height: calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
			border-radius: 0.5rem;
		}

		.brief-header {
			/* Compact header in landscape */
			height: 2.5rem;
		}

		.brief-tabs {
			/* Shorter tabs in landscape */
			height: 2.5rem;
		}

		.brief-tab {
			height: 2.5rem;
		}

		.brief-drag-handle {
			/* Minimal drag handle in landscape */
			padding-top: 0.125rem;
			padding-bottom: 0.125rem;
		}
	}

	/* ==================== Body Scroll Lock ==================== */

	:global(body:has(.brief-chat-root)) {
		overflow: hidden;
	}
</style>
