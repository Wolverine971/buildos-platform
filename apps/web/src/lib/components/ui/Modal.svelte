<!-- apps/web/src/lib/components/ui/Modal.svelte -->
<!--
	Enhanced Base Modal Component v2.0

	Mobile-first, gesture-enabled modal with high information density.

	Key Features:
	- Touch gestures (swipe-to-dismiss)
	- GPU-optimized animations (60fps)
	- Enhanced responsive breakpoints (4-tier)
	- Compact, high-density layout
	- Bottom sheet variant for mobile
	- iOS safe area support
	- Scroll lock and overscroll prevention

	Documentation:
	- 📖 Modal Documentation Hub: /apps/web/docs/technical/components/modals/README.md
	- 🚀 Enhancement Spec: /apps/web/docs/technical/components/modals/MODAL_ENHANCEMENT_SPEC.md
	- 🎯 Best Practices: /apps/web/docs/technical/MOBILE_RESPONSIVE_BEST_PRACTICES.md

	Props:
	- isOpen: boolean - Controls visibility (bindable)
	- onClose: () => void - Close callback
	- title?: string - Header title
	- size?: 'sm' | 'md' | 'lg' | 'xl' - Modal width
	- variant?: 'center' | 'bottom-sheet' - Layout variant
	- showCloseButton?: boolean - Show X button (default: true)
	- closeOnBackdrop?: boolean - Click outside to close (default: true)
	- closeOnEscape?: boolean - Escape key to close (default: true)
	- persistent?: boolean - Disable auto-close behaviors (default: false)
	- enableGestures?: boolean - Enable swipe-to-dismiss (default: auto-detect)
	- showDragHandle?: boolean - Show drag handle (default: auto on mobile)
	- dismissThreshold?: number - Pixels to drag before dismiss (default: 120)
	- customClasses?: string - Additional CSS classes
	- ariaLabel?: string - Accessibility label
	- ariaDescribedBy?: string - Accessibility description

	Callbacks:
	- onOpen?: () => void - Called when modal opens
	- onBeforeClose?: () => boolean - Can prevent close (return false)
	- onGestureStart?: () => void - Touch gesture started
	- onGestureEnd?: (dismissed: boolean) => void - Gesture completed

	Slots:
	- header - Custom header content
	- default - Main content (scrollable)
	- footer - Footer actions
-->
<script lang="ts">
	import { X } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { onDestroy, tick } from 'svelte';
	import { browser } from '$app/environment';
	import Button from './Button.svelte';
	import { portal } from '$lib/actions/portal';
	import type { Snippet } from 'svelte';

	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		variant?: 'center' | 'bottom-sheet';
		showCloseButton?: boolean;
		closeOnBackdrop?: boolean;
		closeOnEscape?: boolean;
		persistent?: boolean;
		enableGestures?: boolean;
		showDragHandle?: boolean;
		dismissThreshold?: number;
		customClasses?: string;
		ariaLabel?: string;
		ariaDescribedBy?: string;
		onOpen?: () => void;
		onBeforeClose?: () => boolean;
		onGestureStart?: () => void;
		onGestureEnd?: (dismissed: boolean) => void;
		header?: Snippet;
		children?: Snippet;
		footer?: Snippet;
	}

	// Props - Svelte 5 runes
	let {
		isOpen = $bindable(false),
		onClose,
		title = '',
		size = 'md',
		variant = 'center',
		showCloseButton = true,
		closeOnBackdrop = true,
		closeOnEscape = true,
		persistent = false,
		enableGestures = $bindable(undefined),
		showDragHandle = $bindable(undefined),
		dismissThreshold = 120,
		customClasses = '',
		ariaLabel = '',
		ariaDescribedBy = '',
		onOpen,
		onBeforeClose,
		onGestureStart,
		onGestureEnd,
		header,
		children,
		footer
	}: Props = $props();

	// Enhanced size classes with 4-tier breakpoint system
	const sizeClasses = {
		sm: 'w-full max-w-md xs:max-w-md sm:max-w-md',
		md: 'w-full max-w-full xs:max-w-xl sm:max-w-2xl md:max-w-2xl',
		lg: 'w-full max-w-full xs:max-w-2xl sm:max-w-3xl md:max-w-4xl',
		xl: 'w-full max-w-full xs:max-w-3xl sm:max-w-4xl md:max-w-6xl'
	};

	// Variant-specific classes - Inkprint styling
	const variantClasses = $derived.by(() => {
		if (variant === 'bottom-sheet') {
			return {
				container: 'items-end sm:items-center',
				modal: 'rounded-t-2xl sm:rounded-lg mb-0 sm:mb-4', // Softer radius
				animation: 'animate-modal-slide-up sm:animate-modal-scale'
			};
		}
		// Default: center variant
		return {
			container: 'items-center',
			modal: 'rounded-lg', // Softer radius
			animation: 'animate-modal-scale'
		};
	});

	// Auto-detect touch device
	const isTouchDevice = $derived(
		browser &&
			('ontouchstart' in window ||
				navigator.maxTouchPoints > 0 ||
				(navigator as any).msMaxTouchPoints > 0)
	);

	// Auto-enable gestures on touch devices (unless explicitly disabled)
	const gesturesEnabled = $derived(enableGestures ?? isTouchDevice);

	// Auto-show drag handle on mobile touch devices for bottom-sheet variant
	const shouldShowDragHandle = $derived(
		showDragHandle ?? (isTouchDevice && variant === 'bottom-sheet')
	);

	// State
	let modalElement = $state<HTMLDivElement | undefined>(undefined);
	let previousFocusElement = $state<HTMLElement | null>(null);
	let focusTrapCleanup = $state<(() => void) | null>(null);
	let animationComplete = $state(false);
	let scrollY = $state(0);

	// Touch gesture state
	let isDragging = $state(false);
	let dragStartY = $state(0);
	let dragCurrentY = $state(0);
	let dragTranslateY = $state(0);
	let touchStartTarget = $state<EventTarget | null>(null);

	// IDs for accessibility
	const modalId = `modal-${Math.random().toString(36).slice(2, 11)}`;
	const titleId = `${modalId}-title`;
	const contentId = `${modalId}-content`;

	// ==================== Event Handlers ====================

	function handleBackdropClick(event: MouseEvent | TouchEvent) {
		if (event.target === event.currentTarget && closeOnBackdrop && !persistent) {
			attemptClose();
		}
	}

	function handleModalContentClick(event: MouseEvent) {
		event.stopPropagation();
	}

	function handleModalContentKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape') {
			event.stopPropagation();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && closeOnEscape && !persistent) {
			event.preventDefault();
			attemptClose();
		}
	}

	function attemptClose() {
		// Call onBeforeClose if provided - can prevent closing
		if (onBeforeClose && !onBeforeClose()) {
			return;
		}

		onClose?.();
		isOpen = false;
	}

	// ==================== Touch Gesture Handlers ====================

	function handleTouchStart(e: TouchEvent) {
		if (!gesturesEnabled) return;

		// Check if touch started on scrollable content
		touchStartTarget = e.target;
		const target = e.target as HTMLElement;
		const scrollableParent = target.closest('.modal-content');

		// If scrollable content is at the top, allow gesture
		if (scrollableParent && scrollableParent.scrollTop > 0) {
			return; // Let scroll happen naturally
		}

		isDragging = true;
		dragStartY = e.touches[0].clientY;
		dragCurrentY = dragStartY;
		dragTranslateY = 0;

		onGestureStart?.();
	}

	function handleTouchMove(e: TouchEvent) {
		if (!isDragging || !gesturesEnabled) return;

		const currentY = e?.touches?.[0]?.clientY;
		if (currentY === undefined) return;

		const deltaY = currentY - dragStartY;

		// Only allow downward dragging (dismiss gesture)
		if (deltaY > 0) {
			// Prevent default to stop scroll while dragging modal
			e.preventDefault();
			dragTranslateY = deltaY;
			dragCurrentY = currentY;
		}
	}

	function handleTouchEnd() {
		if (!isDragging || !gesturesEnabled) return;

		const dismissed = dragTranslateY > dismissThreshold;

		onGestureEnd?.(dismissed);

		if (dismissed) {
			attemptClose();
		} else {
			// Snap back with animation
			dragTranslateY = 0;
		}

		isDragging = false;
		dragStartY = 0;
		dragCurrentY = 0;
		touchStartTarget = null;
	}

	// Svelte action to attach non-passive touch listeners
	function touchGesture(node: HTMLElement) {
		if (!gesturesEnabled) return;

		const touchStartHandler = (e: TouchEvent) => handleTouchStart(e);
		const touchMoveHandler = (e: TouchEvent) => handleTouchMove(e);
		const touchEndHandler = (e: TouchEvent) => handleTouchEnd();

		// Attach with { passive: false } to allow preventDefault
		node.addEventListener('touchstart', touchStartHandler, { passive: false });
		node.addEventListener('touchmove', touchMoveHandler, { passive: false });
		node.addEventListener('touchend', touchEndHandler, { passive: false });

		return {
			destroy() {
				node.removeEventListener('touchstart', touchStartHandler);
				node.removeEventListener('touchmove', touchMoveHandler);
				node.removeEventListener('touchend', touchEndHandler);
			}
		};
	}

	// ==================== Focus Management ====================

	async function trapFocus() {
		if (!modalElement) return;

		await tick();

		previousFocusElement = document.activeElement as HTMLElement;

		const focusableElements = modalElement.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);

		const firstFocusable = focusableElements[0];
		const lastFocusable = focusableElements[focusableElements.length - 1];

		if (focusableElements.length === 0) {
			modalElement.focus();
		} else {
			firstFocusable?.focus();
		}

		function handleTabKey(e: KeyboardEvent) {
			if (e.key !== 'Tab' || focusableElements.length === 0) return;

			if (e.shiftKey) {
				if (document.activeElement === firstFocusable) {
					e.preventDefault();
					lastFocusable?.focus();
				}
			} else {
				if (document.activeElement === lastFocusable) {
					e.preventDefault();
					firstFocusable?.focus();
				}
			}
		}

		modalElement.addEventListener('keydown', handleTabKey);
		focusTrapCleanup = () => modalElement?.removeEventListener('keydown', handleTabKey);
	}

	function restoreFocus() {
		if (previousFocusElement?.focus) {
			requestAnimationFrame(() => {
				previousFocusElement?.focus();
			});
		}
	}

	// ==================== Lifecycle Management ====================

	async function handleModalOpen() {
		if (import.meta.env.DEV) {
			console.log('[Modal] Opening:', { title, variant, size });
		}

		await tick();

		// Lock body scroll
		if (browser) {
			scrollY = window.scrollY;
			document.body.style.position = 'fixed';
			document.body.style.top = `-${scrollY}px`;
			document.body.style.width = '100%';
			document.body.style.overflow = 'hidden';
		}

		trapFocus();
		onOpen?.();

		// Set animation complete flag after animation duration
		animationComplete = false;
		setTimeout(() => {
			animationComplete = true;
		}, 350);
	}

	function handleModalClose() {
		if (import.meta.env.DEV) {
			console.log('[Modal] Closing:', { title });
		}

		if (focusTrapCleanup) {
			focusTrapCleanup();
			focusTrapCleanup = null;
		}

		// Restore scroll position
		if (browser) {
			document.body.style.position = '';
			document.body.style.top = '';
			document.body.style.width = '';
			document.body.style.overflow = '';
			window.scrollTo(0, scrollY);
		}

		restoreFocus();
	}

	$effect(() => {
		if (isOpen) {
			handleModalOpen();
		} else {
			handleModalClose();
		}

		return () => {
			// Cleanup on unmount
			if (isOpen) {
				handleModalClose();
			}
		};
	});

	onDestroy(() => {
		if (focusTrapCleanup) {
			focusTrapCleanup();
		}
		if (browser && document.body.style.position === 'fixed') {
			handleModalClose();
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div use:portal class="modal-root" transition:fade={{ duration: 150 }} role="presentation">
		<!-- Backdrop with touch optimization -->
		<div
			class="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-[9998]"
			style="touch-action: none;"
			onclick={handleBackdropClick}
			ontouchend={handleBackdropClick}
			aria-hidden="true"
		></div>

		<!-- Modal Container -->
		<div class="fixed inset-0 z-[9999] overflow-y-auto" style="touch-action: none;">
			<div
				class="flex min-h-full {variantClasses.container} justify-center p-0 sm:p-3"
				role="presentation"
			>
				<!-- Modal Content -->
				<!-- Height strategy:
					 - Portrait: Near full height with safe area padding
					 - Landscape mobile: Reduced margin for more content space
					 - Tablet/Desktop (sm+): 85vh max height
					 - Uses dvh where supported for dynamic viewport height (keyboard handling)
				-->
				<div
					bind:this={modalElement}
					use:touchGesture
					class="relative {sizeClasses[size]}
						bg-card border border-border
						{variantClasses.modal}
						shadow-ink-strong
						max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)]
						landscape:max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-0.5rem)]
						sm:max-h-[85dvh]
						overflow-hidden
						{customClasses}
						flex flex-col
						{variantClasses.animation}
						{animationComplete ? 'animation-complete' : ''}
						modal-container
						tx tx-frame tx-weak ink-frame"
					style="
						transform: translateY({dragTranslateY}px) translateZ(0);
						transition: {isDragging ? 'none' : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)'};
						touch-action: pan-y;
					"
					role="dialog"
					aria-modal="true"
					aria-labelledby={title ? titleId : undefined}
					aria-label={!title && ariaLabel ? ariaLabel : undefined}
					aria-describedby={ariaDescribedBy || undefined}
					tabindex="-1"
					onclick={handleModalContentClick}
					onkeydown={handleModalContentKeydown}
				>
					<!-- Drag Handle (compact, high-density design) -->
					{#if shouldShowDragHandle}
						<div class="drag-handle-wrapper" style="touch-action: none; cursor: grab;">
							<div class="drag-handle"></div>
						</div>
					{/if}

					<!-- Header (compact spacing) -->
					{#if header}
						{@render header()}
					{:else if title || showCloseButton}
						<div
							class="flex items-center justify-between
								px-3 sm:px-4 py-2 sm:py-3
								border-b border-border
								bg-muted/30 tx tx-strip tx-weak
								flex-shrink-0"
						>
							{#if title}
								<h2
									id={titleId}
									class="text-base sm:text-lg font-semibold text-foreground truncate pr-2"
								>
									{title}
								</h2>
							{:else}
								<div></div>
							{/if}

							{#if showCloseButton && !persistent}
								<Button
									onclick={attemptClose}
									variant="ghost"
									size="sm"
									icon={X}
									class="flex-shrink-0 !p-1"
									aria-label="Close dialog"
								/>
							{/if}
						</div>
					{/if}

					<!-- Content (scrollable, compact spacing) -->
					<div
						id={contentId}
						class="modal-content overflow-y-auto flex-1 min-h-0 overscroll-contain"
						style="touch-action: pan-y;"
					>
						{#if children}
							{@render children()}
						{/if}
					</div>

					<!-- Footer (compact spacing with safe area) -->
					{#if footer}
						<div
							class="modal-footer flex-shrink-0"
							style="padding-bottom: max(0.5rem, env(safe-area-inset-bottom, 0px));"
						>
							{@render footer()}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ==================== GPU-Optimized Animations ==================== */

	/* Mobile: Slide up from bottom */
	@keyframes modal-slide-up {
		from {
			transform: translateY(100%) translateZ(0);
			opacity: 0;
		}
		to {
			transform: translateY(0) translateZ(0);
			opacity: 1;
		}
	}

	/* Desktop: Scale from center */
	@keyframes modal-scale {
		from {
			transform: scale(0.95) translateZ(0);
			opacity: 0;
		}
		to {
			transform: scale(1) translateZ(0);
			opacity: 1;
		}
	}

	/* Apply animations with GPU acceleration */
	:global(.animate-modal-slide-up) {
		animation: modal-slide-up 300ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	:global(.animate-modal-scale) {
		animation: modal-scale 200ms cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Desktop switches to scale animation */
	@media (min-width: 640px) {
		:global(.animate-modal-slide-up) {
			animation: modal-scale 200ms cubic-bezier(0.4, 0, 0.2, 1);
		}
	}

	/* ==================== GPU Acceleration & Performance ==================== */

	.modal-container {
		/* Force GPU layer */
		transform: translateZ(0);
		backface-visibility: hidden;

		/* Hint browser about transform/opacity changes */
		will-change: transform, opacity;
	}

	/* Remove will-change after animation completes */
	.modal-container.animation-complete {
		will-change: auto;
	}

	/* ==================== Compact Drag Handle (High Density) ==================== */

	.drag-handle-wrapper {
		/* Minimal touch target: 36px (compact but functional) */
		width: 100%;
		padding: 0.375rem 0; /* 6px top/bottom = 6 + 3 + 6 = ~15px + handle */
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.drag-handle-wrapper:active {
		cursor: grabbing;
	}

	.drag-handle {
		/* Compact visual indicator - Inkprint design */
		width: 32px;
		height: 3px;
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 9999px;
		transition:
			background-color 150ms,
			width 150ms;
	}

	.drag-handle-wrapper:hover .drag-handle {
		background: hsl(var(--muted-foreground) / 0.5);
		width: 40px;
	}

	.drag-handle-wrapper:active .drag-handle {
		background: hsl(var(--foreground) / 0.7);
	}

	/* ==================== Scroll & Overscroll Behavior ==================== */

	.modal-root {
		/* Prevent scroll chaining to body */
		overscroll-behavior: contain;
		z-index: 9999;
		position: relative;
	}

	.modal-content {
		/* Contain scroll within modal content */
		overscroll-behavior: contain;
	}

	/* Lock body scroll when modal is open */
	:global(body:has(.modal-root)) {
		overflow: hidden;
	}

	/* ==================== Touch Target Optimization ==================== */

	/* Disable tap highlight on all modal elements */
	.modal-container,
	.modal-container * {
		-webkit-tap-highlight-color: transparent;
		-webkit-touch-callout: none;
	}

	/* Touch manipulation (disable double-tap zoom) */
	.modal-container {
		touch-action: manipulation;
	}

	/* ==================== Enhanced Breakpoints (xs: 480px) ==================== */

	/* Extra small devices (landscape phones) */
	@media (min-width: 480px) {
		.modal-container {
			/* Add slight margin on landscape phones */
			margin-left: 0.5rem;
			margin-right: 0.5rem;
		}
	}

	/* Small devices (tablets) */
	@media (min-width: 640px) {
		.modal-container {
			margin-left: 1rem;
			margin-right: 1rem;
		}
	}

	/* ==================== iOS Safe Area Support ==================== */

	@supports (-webkit-touch-callout: none) {
		/* iOS-specific fixes */
		.modal-container {
			/* Account for notch and home indicator - use dvh for dynamic viewport */
			max-height: calc(
				100dvh - env(safe-area-inset-top, 0px) -
					max(env(safe-area-inset-bottom, 0px), 1rem) - 1rem
			);
		}

		.modal-footer {
			/* Ensure footer clears home indicator */
			padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
		}
	}

	/* ==================== Landscape Orientation Support ==================== */

	@media (orientation: landscape) and (max-height: 500px) {
		/* Compact layout for landscape mobile devices */
		.modal-container {
			/* Reduce margins in landscape to maximize content area */
			max-height: calc(
				100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 0.5rem
			);
		}

		.drag-handle-wrapper {
			/* Smaller drag handle area in landscape */
			padding: 0.25rem 0;
		}
	}

	/* ==================== Compact Layout Utilities ==================== */

	/* Reduce spacing in modal content for high density */
	.modal-content :global(> *:first-child) {
		margin-top: 0;
	}

	.modal-content :global(> *:last-child) {
		margin-bottom: 0;
	}

	/* ==================== Dark Mode Optimizations ==================== */

	.dark .modal-container {
		/* Use card color from Inkprint tokens */
		background-color: hsl(var(--card));
	}

	/* Use Inkprint shadow in dark mode */
	.dark .modal-container {
		box-shadow: var(--shadow-ink-strong);
	}
</style>
