<!-- apps/web/src/lib/components/ui/Modal.svelte -->
<script lang="ts">
	import { X } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import { onDestroy, tick } from 'svelte';
	import Button from './Button.svelte';
	import { portal } from '$lib/actions/portal';

	let {
		isOpen = false,
		onClose,
		title = '',
		size = 'md',
		showCloseButton = true,
		closeOnBackdrop = true,
		closeOnEscape = true,
		persistent = false,
		customClasses = '',
		ariaLabel = '',
		ariaDescribedBy = ''
	}: {
		isOpen?: boolean;
		onClose: () => void;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		showCloseButton?: boolean;
		closeOnBackdrop?: boolean;
		closeOnEscape?: boolean;
		persistent?: boolean;
		customClasses?: string;
		ariaLabel?: string;
		ariaDescribedBy?: string;
	} = $props();

	const sizeClasses = {
		sm: 'max-w-md',
		md: 'max-w-2xl',
		lg: 'max-w-4xl',
		xl: 'max-w-6xl'
	};

	let modalElement = $state<HTMLDivElement | undefined>(undefined);
	let previousFocusElement = $state<HTMLElement | null>(null);
	let focusTrapCleanup = $state<(() => void) | null>(null);
	let modalId = `modal-${Math.random().toString(36).slice(2, 11)}`;
	let titleId = `${modalId}-title`;
	let contentId = `${modalId}-content`;

	function handleBackdropClick(event: MouseEvent | TouchEvent) {
		if (event.target === event.currentTarget && closeOnBackdrop && !persistent) {
			onClose();
		}
	}

	function handleContainerClick(event: MouseEvent | TouchEvent) {
		// Check if the click was on the container (outside the modal content)
		if (event.target === event.currentTarget && closeOnBackdrop && !persistent) {
			onClose();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && closeOnEscape && !persistent) {
			event.preventDefault();
			onClose();
		}
	}

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

	async function handleModalOpen() {
		await tick();
		trapFocus();
	}

	function handleModalClose() {
		if (focusTrapCleanup) {
			focusTrapCleanup();
			focusTrapCleanup = null;
		}
		restoreFocus();
	}

	$effect(() => {
		if (isOpen) {
			handleModalOpen();
		} else {
			handleModalClose();
		}
	});

	onDestroy(() => {
		if (focusTrapCleanup) {
			focusTrapCleanup();
		}
		restoreFocus();
	});
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div use:portal class="modal-root" transition:fade={{ duration: 150 }} role="presentation">
		<!-- Backdrop -->
		<div
			class="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 backdrop-blur-sm z-[100]"
			on:click={handleBackdropClick}
			on:touchend={handleBackdropClick}
			aria-hidden="true"
		/>

		<!-- Modal Container -->
		<div class="fixed inset-0 z-[100] overflow-y-auto">
			<div
				class="flex min-h-full items-end sm:items-center justify-center p-0 sm:p-4"
				on:click={handleContainerClick}
				on:touchend={handleContainerClick}
			>
				<div
					bind:this={modalElement}
					class="relative w-full {sizeClasses[
						size
					]} bg-white dark:bg-gray-800 rounded-t-lg sm:rounded-lg shadow-xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden {customClasses} flex flex-col animate-modal-slide-up sm:animate-modal-scale mt-6"
					transition:scale={{ duration: 150, start: 0.95 }}
					role="dialog"
					aria-modal="true"
					aria-labelledby={title ? titleId : undefined}
					aria-label={!title && ariaLabel ? ariaLabel : undefined}
					aria-describedby={ariaDescribedBy || undefined}
					tabindex="-1"
					on:click|stopPropagation
				>
					<!-- Header -->
					<slot name="header">
						{#if title || showCloseButton}
							<div
								class="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0"
							>
								{#if title}
									<h2
										id={titleId}
										class="text-lg font-semibold text-gray-900 dark:text-white truncate pr-2"
									>
										{title}
									</h2>
								{:else}
									<div />
								{/if}

								{#if showCloseButton && !persistent}
									<Button
										on:click={onClose}
										variant="ghost"
										size="sm"
										icon={X}
										class="!p-2 flex-shrink-0"
										aria-label="Close dialog"
									/>
								{/if}
							</div>
						{/if}
					</slot>

					<!-- Content -->
					<div id={contentId} class="overflow-y-auto flex-1 min-h-0">
						<slot />
					</div>

					<!-- Footer -->
					<slot name="footer" />
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	@keyframes modal-slide-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	@keyframes modal-scale {
		from {
			transform: scale(0.95);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	:global(.animate-modal-slide-up) {
		animation: modal-slide-up 0.3s ease-out;
	}

	@media (min-width: 640px) {
		:global(.animate-modal-slide-up) {
			animation: none;
		}

		:global(.animate-modal-scale) {
			animation: modal-scale 0.15s ease-out;
		}
	}

	/* Optional grab handle for mobile */
	:global(.modal-grab-handle) {
		width: 36px;
		height: 4px;
		background: rgb(209 213 219);
		border-radius: 2px;
		margin: 0.5rem auto 1rem;
	}

	:global(.dark .modal-grab-handle) {
		background: rgb(75 85 99);
	}

	/* Ensure smooth rendering */
	.modal-root {
		will-change: opacity;
		z-index: 100;
	}
</style>
