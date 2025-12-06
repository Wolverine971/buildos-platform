<!-- apps/web/src/lib/components/ui/WelcomeModal.svelte -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	import type { Snippet } from 'svelte';

	interface Props {
		isOpen?: boolean;
		title?: string;
		subtitle?: string;
		primaryButtonText?: string;
		secondaryButtonText?: string;
		dismissible?: boolean;
		persistent?: boolean;
		gradientFrom?: string;
		gradientVia?: string;
		gradientTo?: string;
		showTimeEstimate?: boolean;
		timeEstimate?: string;
		storageKey?: string;
		onPrimary?: () => void;
		onSecondary?: () => void;
		onDismiss?: () => void;
		icon?: Snippet;
		description?: Snippet;
		features?: Snippet;
		actions?: Snippet;
		primaryIcon?: Snippet;
		footerContent?: Snippet;
	}

	let {
		isOpen = $bindable(false),
		title = 'Welcome!',
		subtitle = '',
		primaryButtonText = 'Get Started',
		secondaryButtonText = 'Maybe Later',
		dismissible = true,
		persistent = false,
		gradientFrom = 'from-primary-500',
		gradientVia = 'via-purple-500',
		gradientTo = 'to-pink-500',
		showTimeEstimate = false,
		timeEstimate = 'Takes about 5 minutes',
		storageKey = '',
		onPrimary,
		onSecondary,
		onDismiss,
		icon,
		description,
		features,
		actions,
		primaryIcon,
		footerContent
	}: Props = $props();

	let hasBeenDismissed = $state(false);
	let effectiveIsOpen = $state(false);

	// Check if modal has been dismissed before and update effective state
	$effect(() => {
		if (storageKey && typeof localStorage !== 'undefined') {
			hasBeenDismissed = localStorage.getItem(storageKey) === 'true';
		}
		effectiveIsOpen = isOpen && !hasBeenDismissed;
	});

	function handlePrimary() {
		onPrimary?.();
	}

	function handleSecondary() {
		onSecondary?.();
	}

	function handleDismiss() {
		if (storageKey && typeof localStorage !== 'undefined') {
			localStorage.setItem(storageKey, 'true');
			hasBeenDismissed = true;
		}
		onDismiss?.();
	}
</script>

<Modal
	bind:isOpen={effectiveIsOpen}
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
	{#snippet header()}
		<div class="relative">
			<!-- Gradient Background -->
			<div
				class="absolute top-0 left-0 right-0 h-48 bg-gradient-to-br {gradientFrom} {gradientVia} {gradientTo} opacity-10"
			></div>

			<!-- Empty header (no title bar needed for welcome modal) -->
			<div class="h-0"></div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Content -->
		<div class="relative p-4 sm:p-6 lg:p-8">
			<!-- Icon Slot -->
			<div class="flex justify-center mb-4 sm:mb-6">
				{@render icon?.()}
				{#if !icon}
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
				{/if}
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
				{@render description?.()}
			</div>

			<!-- Benefits/Features Slot -->
			{@render features?.()}

			<!-- Actions -->
			<div class="space-y-3">
				{@render actions?.()}
				{#if !actions}
					<Button
						onclick={handlePrimary}
						variant="primary"
						size="xl"
						fullWidth={true}
						btnType="container"
						class="bg-gradient-to-r {gradientFrom} {gradientTo} hover:opacity-90 shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
					>
						<span class="flex items-center justify-center space-x-2">
							<span>{primaryButtonText}</span>
							{@render primaryIcon?.()}
						</span>
					</Button>

					{#if secondaryButtonText}
						<Button
							onclick={handleSecondary}
							variant="ghost"
							size="xl"
							fullWidth={true}
							class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
						>
							{secondaryButtonText}
						</Button>
					{/if}
				{/if}
			</div>

			<!-- Time estimate -->
			{#if showTimeEstimate}
				<p class="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">
					{timeEstimate}
				</p>
			{/if}
		</div>
	{/snippet}

	{#snippet footer()}
		<!-- Footer Slot -->
		{@render footerContent?.()}
	{/snippet}
</Modal>
