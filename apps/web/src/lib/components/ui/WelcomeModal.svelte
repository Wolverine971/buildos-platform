<!-- apps/web/src/lib/components/ui/WelcomeModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import { X } from 'lucide-svelte';
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	import { tick, untrack, type Snippet } from 'svelte';

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

	// One-time, mount-only check for prior dismissal.
	const initiallyDismissed = untrack(() =>
		browser && storageKey ? localStorage.getItem(storageKey) === 'true' : false
	);
	let effectiveIsOpen = $state(isOpen && !initiallyDismissed);
	let forceClosed = $state(false);
	let closingFromInside = $state(false);
	let lastRequestedOpen = $state(Boolean(isOpen));

	$effect(() => {
		const requestedOpen = Boolean(isOpen);
		if (requestedOpen && !lastRequestedOpen) {
			if (closingFromInside) {
				closingFromInside = false;
			} else {
				forceClosed = false;
			}
		}
		lastRequestedOpen = requestedOpen;

		const shouldOpen = requestedOpen && !initiallyDismissed && !forceClosed;
		if (effectiveIsOpen !== shouldOpen) {
			effectiveIsOpen = shouldOpen;
		}
	});

	function persistDismissal() {
		if (browser && storageKey) {
			localStorage.setItem(storageKey, 'true');
		}
	}

	function closeLocally() {
		forceClosed = true;
		closingFromInside = true;
		isOpen = false;
		effectiveIsOpen = false;

		void tick().then(() => {
			if (!isOpen) {
				closingFromInside = false;
			}
		});
	}

	// Explicit user dismissal (primary/secondary action) — persist so the modal
	// doesn't reappear next session.
	function handlePrimary() {
		persistDismissal();
		closeLocally();
		onPrimary?.();
	}

	function handleSecondary() {
		persistDismissal();
		closeLocally();
		onSecondary?.();
	}

	function handleDismiss() {
		closeLocally();
		onDismiss?.();
	}
</script>

<Modal
	bind:isOpen={effectiveIsOpen}
	onClose={handleDismiss}
	title=""
	size="sm"
	showCloseButton={false}
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
			{#if dismissible && !persistent}
				<button
					type="button"
					onclick={handleDismiss}
					class="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition hover:border-destructive/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Close welcome dialog"
					title="Close welcome dialog"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}

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
