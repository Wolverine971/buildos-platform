<!-- src/lib/components/ui/WelcomeModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { X } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';
	import Button from './Button.svelte';

	export let isOpen: boolean = false;
	export let title: string = 'Welcome!';
	export let subtitle: string = '';
	export let primaryButtonText: string = 'Get Started';
	export let secondaryButtonText: string = 'Maybe Later';
	export let dismissible: boolean = true;
	export let persistent: boolean = false; // Prevent dismissal
	export let gradientFrom: string = 'from-primary-500';
	export let gradientVia: string = 'via-purple-500';
	export let gradientTo: string = 'to-pink-500';
	export let showTimeEstimate: boolean = false;
	export let timeEstimate: string = 'Takes about 5 minutes';
	export let storageKey: string = ''; // For localStorage dismissal tracking

	const dispatch = createEventDispatcher<{
		primary: void;
		secondary: void;
		dismiss: void;
	}>();

	let hasBeenDismissed = false;

	// Check if modal has been dismissed before
	$: if (storageKey && typeof localStorage !== 'undefined') {
		hasBeenDismissed = localStorage.getItem(storageKey) === 'true';
	}

	function handlePrimary() {
		dispatch('primary');
		if (typeof document !== 'undefined') {
			document.body.style.overflow = 'unset';
		}
	}

	function handleSecondary() {
		dispatch('secondary');
		if (typeof document !== 'undefined') {
			document.body.style.overflow = 'unset';
		}
	}

	function handleDismiss() {
		if (storageKey && typeof localStorage !== 'undefined') {
			localStorage.setItem(storageKey, 'true');
			hasBeenDismissed = true;
		}
		dispatch('dismiss');
		if (typeof document !== 'undefined') {
			document.body.style.overflow = 'unset';
		}
	}

	// Manage body scroll
	$: if (isOpen && !hasBeenDismissed && typeof document !== 'undefined') {
		document.body.style.overflow = 'hidden';
	} else if (typeof document !== 'undefined') {
		document.body.style.overflow = 'unset';
	}

	// Handle escape key
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && dismissible && !persistent) {
			handleDismiss();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen && !hasBeenDismissed}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
		transition:fade={{ duration: 200 }}
		on:click={dismissible && !persistent ? handleDismiss : undefined}
		role="button"
		tabindex="-1"
	></div>

	<!-- Modal -->
	<div
		class="fixed inset-0 flex items-end sm:items-center justify-center z-[100] pointer-events-none p-0 sm:p-4"
	>
		<div
			class="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto pointer-events-auto relative"
			transition:scale={{ duration: 200, start: 0.95 }}
			on:click={(e) => e.stopPropagation()}
		>
			<!-- Gradient Background -->
			<div
				class="absolute top-0 left-0 right-0 h-48 bg-gradient-to-br {gradientFrom} {gradientVia} {gradientTo} opacity-10"
			></div>

			<!-- Close Button -->
			{#if dismissible && !persistent}
				<Button
					on:click={handleDismiss}
					variant="ghost"
					size="sm"
					class="absolute top-4 right-4 p-2"
					aria-label="Dismiss"
				>
					<X class="w-6 h-6 text-gray-500 dark:text-gray-400" />
				</Button>
			{/if}

			<!-- Content -->
			<div class="relative p-6 sm:p-8">
				<!-- Icon Slot -->
				<div class="flex justify-center mb-6">
					<slot name="icon">
						<div class="relative">
							<div
								class="absolute inset-0 bg-primary-500 rounded-full blur-xl opacity-30"
							></div>
							<div
								class="relative bg-gradient-to-br {gradientFrom} {gradientTo} rounded-full p-4"
							>
								<!-- Default icon placeholder -->
								<div class="w-8 h-8 bg-white rounded-full"></div>
							</div>
						</div>
					</slot>
				</div>

				<!-- Title & Description -->
				<div class="text-center mb-8">
					<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">
						{title}
					</h2>
					{#if subtitle}
						<p class="text-gray-600 dark:text-gray-300 leading-relaxed">
							{subtitle}
						</p>
					{/if}

					<!-- Content Slot for custom description -->
					<slot name="description" />
				</div>

				<!-- Benefits/Features Slot -->
				<slot name="features" />

				<!-- Actions -->
				<div class="space-y-3">
					<slot name="actions">
						<Button
							on:click={handlePrimary}
							variant="primary"
							size="xl"
							fullWidth={true}
							btnType="container"
							class="bg-gradient-to-r {gradientFrom} {gradientTo} hover:opacity-90 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
						>
							<span class="flex items-center justify-center space-x-2">
								<span>{primaryButtonText}</span>
								<slot name="primary-icon" />
							</span>
						</Button>

						{#if secondaryButtonText}
							<Button
								on:click={handleSecondary}
								variant="ghost"
								size="xl"
								fullWidth={true}
								class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
							>
								{secondaryButtonText}
							</Button>
						{/if}
					</slot>
				</div>

				<!-- Time estimate -->
				{#if showTimeEstimate}
					<p class="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
						{timeEstimate}
					</p>
				{/if}

				<!-- Footer Slot -->
				<slot name="footer" />
			</div>
		</div>
	</div>
{/if}
