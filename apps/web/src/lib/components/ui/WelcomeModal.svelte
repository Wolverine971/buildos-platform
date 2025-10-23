<!-- apps/web/src/lib/components/ui/WelcomeModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Modal from './Modal.svelte';
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

	// Determine if modal should be open (considering dismissal state)
	$: effectiveIsOpen = isOpen && !hasBeenDismissed;

	function handlePrimary() {
		dispatch('primary');
	}

	function handleSecondary() {
		dispatch('secondary');
	}

	function handleDismiss() {
		if (storageKey && typeof localStorage !== 'undefined') {
			localStorage.setItem(storageKey, 'true');
			hasBeenDismissed = true;
		}
		dispatch('dismiss');
	}
</script>

<Modal
	isOpen={effectiveIsOpen}
	onClose={handleDismiss}
	title=""
	size="sm"
	showCloseButton={dismissible && !persistent}
	closeOnBackdrop={dismissible && !persistent}
	closeOnEscape={dismissible && !persistent}
	{persistent}
	customClasses="overflow-hidden"
>
	<!-- Custom header with gradient background -->
	<div slot="header" class="relative">
		<!-- Gradient Background -->
		<div
			class="absolute top-0 left-0 right-0 h-48 bg-gradient-to-br {gradientFrom} {gradientVia} {gradientTo} opacity-10"
		></div>

		<!-- Empty header (no title bar needed for welcome modal) -->
		<div class="h-0"></div>
	</div>

	<!-- Content -->
	<div class="relative p-4 sm:p-6 lg:p-8">
		<!-- Icon Slot -->
		<div class="flex justify-center mb-4 sm:mb-6">
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
		<div class="text-center mb-4 sm:mb-6 lg:mb-8">
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
</Modal>
