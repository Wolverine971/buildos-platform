<!-- apps/web/src/lib/components/ui/WelcomeModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	import { untrack, type Snippet } from 'svelte';

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

	// One-time, mount-only check for prior dismissal. Avoids the binding loop the
	// previous $effect created (effect re-running re-opened the modal after close).
	const initiallyDismissed = untrack(() =>
		browser && storageKey ? localStorage.getItem(storageKey) === 'true' : false
	);
	let effectiveIsOpen = $state(isOpen && !initiallyDismissed);

	function persistDismissal() {
		if (browser && storageKey) {
			localStorage.setItem(storageKey, 'true');
		}
	}

	// Explicit user dismissal (primary/secondary action) — persist so the modal
	// doesn't reappear next session.
	function handlePrimary() {
		persistDismissal();
		effectiveIsOpen = false;
		onPrimary?.();
	}

	function handleSecondary() {
		persistDismissal();
		effectiveIsOpen = false;
		onSecondary?.();
	}

	// Soft dismissal (backdrop tap, Escape, X button) — close the modal but
	// don't permanently kill it. Accidental taps used to silently mark the
	// welcome modal as never-show-again for this user.
	function handleSoftDismiss() {
		effectiveIsOpen = false;
		onDismiss?.();
	}
</script>

<Modal
	bind:isOpen={effectiveIsOpen}
	onClose={handleSoftDismiss}
	title=""
	size="sm"
	showCloseButton={dismissible && !persistent}
	closeOnBackdrop={dismissible && !persistent}
	closeOnEscape={dismissible && !persistent}
	{persistent}
	customClasses="overflow-hidden"
>
	<!-- Custom header - no gradient, clean Inkprint style -->
	{#snippet header()}
		<div class="h-0"></div>
	{/snippet}

	{#snippet children()}
		<!-- Content -->
		<div class="relative p-4 sm:p-5">
			<!-- Icon Slot -->
			<div class="flex justify-center mb-3 sm:mb-4">
				{@render icon?.()}
				{#if !icon}
					<!-- Inkprint default icon - flat design, no blur/gradients -->
					<div class="bg-accent rounded-full p-3 sm:p-4 shadow-ink tx tx-bloom tx-weak">
						<div class="w-6 h-6 sm:w-8 sm:h-8 bg-accent-foreground rounded-full"></div>
					</div>
				{/if}
			</div>

			<!-- Title & Description -->
			<div class="text-center mb-3 sm:mb-4">
				<h2 class="text-xl font-bold text-foreground mb-2">
					{title}
				</h2>
				{#if subtitle}
					<p class="text-muted-foreground leading-relaxed">
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
						class="bg-accent text-accent-foreground shadow-ink pressable"
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
							class="text-muted-foreground hover:text-foreground"
						>
							{secondaryButtonText}
						</Button>
					{/if}
				{/if}
			</div>

			<!-- Time estimate -->
			{#if showTimeEstimate}
				<p class="text-center text-xs text-muted-foreground mt-4">
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
