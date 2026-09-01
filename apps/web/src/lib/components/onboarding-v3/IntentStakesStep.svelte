<!-- apps/web/src/lib/components/onboarding-v3/IntentStakesStep.svelte -->
<script lang="ts">
	import {
		FolderCheck,
		Compass,
		LifeBuoy,
		Telescope,
		Briefcase,
		Heart,
		Coffee
	} from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		ONBOARDING_V3_CONFIG,
		type OnboardingIntent,
		type OnboardingStakes
	} from '$lib/config/onboarding.config';
	import { captureEvent } from '$lib/services/posthog';
	import { toastService } from '$lib/stores/toast.store';
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		onNext: () => void;
		onIntentSelected: (intent: OnboardingIntent) => void;
		onStakesSelected: (stakes: OnboardingStakes) => void;
		defaultIntent?: OnboardingIntent;
		defaultStakes?: OnboardingStakes;
	}

	let { onNext, onIntentSelected, onStakesSelected, defaultIntent, defaultStakes }: Props =
		$props();
	const initialDefaults = untrack(() => ({ defaultIntent, defaultStakes }));

	let selectedIntent = $state<OnboardingIntent | null>(initialDefaults.defaultIntent ?? null);
	let selectedStakes = $state<OnboardingStakes | null>(initialDefaults.defaultStakes ?? null);
	let isSaving = $state(false);
	// If the user already picked an intent (returning from a later step), start
	// them on the stakes question so they don't have to re-traverse.
	let currentQuestion = $state<'intent' | 'stakes'>(
		initialDefaults.defaultIntent ? 'stakes' : 'intent'
	);

	const canContinue = $derived(selectedIntent !== null && selectedStakes !== null);

	const intentIcons: Record<string, typeof FolderCheck> = {
		organize: FolderCheck,
		plan: Compass,
		unstuck: LifeBuoy,
		explore: Telescope
	};

	const stakesIcons: Record<string, typeof Briefcase> = {
		high: Briefcase,
		medium: Heart,
		low: Coffee
	};

	function selectIntent(id: OnboardingIntent) {
		selectedIntent = id;
		captureEvent('intent_selected', { intent: id });
		// Auto-advance to stakes question after a brief pause
		setTimeout(
			() => {
				currentQuestion = 'stakes';
			},
			prefersReducedMotion.current ? 0 : 300
		);
	}

	function fadeIn(duration = 200) {
		return { duration: prefersReducedMotion.current ? 0 : duration };
	}

	function flyIn() {
		return prefersReducedMotion.current ? { y: 0, duration: 0 } : { y: 20, duration: 260 };
	}

	function selectStakes(id: OnboardingStakes) {
		selectedStakes = id;
	}

	async function saveAndContinue() {
		if (!selectedIntent || !selectedStakes) return;

		isSaving = true;
		try {
			const response = await fetch('/api/onboarding', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'save_intent_stakes',
					intent: selectedIntent,
					stakes: selectedStakes
				})
			});

			const result = await response.json();
			if (!response.ok || !result?.success) {
				throw new Error(result?.error?.[0] || 'Failed to save');
			}

			onIntentSelected(selectedIntent);
			onStakesSelected(selectedStakes);
			onNext();
		} catch (error) {
			console.error('Failed to save intent/stakes:', error);
			toastService.error('Failed to save. Please try again.');
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="max-w-2xl mx-auto px-4 py-8 sm:py-16">
	<!-- Intent Question -->
	{#if currentQuestion === 'intent'}
		<div in:fade={fadeIn()}>
			<div class="text-center mb-10">
				<h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-3">
					What brings you to BuildOS?
				</h1>
				<p class="text-lg text-muted-foreground">This helps us set things up for you</p>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				{#each ONBOARDING_V3_CONFIG.intents as intent}
					{@const Icon = intentIcons[intent.id]}
					<button
						class="group relative overflow-hidden rounded-lg border-2 p-5 text-left tx tx-frame tx-weak pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
							{selectedIntent === intent.id
							? 'border-accent bg-accent/5 shadow-ink-strong'
							: 'border-border bg-card shadow-ink hover:border-accent/50 hover:shadow-ink-strong'}"
						onclick={() => selectIntent(intent.id as OnboardingIntent)}
					>
						<div class="relative flex items-start gap-4">
							<div
								class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
									{selectedIntent === intent.id
									? 'bg-accent/15 text-accent'
									: 'bg-muted text-muted-foreground group-hover:text-accent'}"
							>
								<Icon class="w-5 h-5" />
							</div>
							<div>
								<p class="font-semibold text-foreground leading-snug">
									{intent.label}
								</p>
								<p class="text-sm text-muted-foreground mt-1">
									{intent.description}
								</p>
							</div>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Stakes Question -->
	{#if currentQuestion === 'stakes'}
		<div in:fly={flyIn()}>
			<div class="text-center mb-10">
				<h1 class="text-3xl sm:text-4xl font-bold text-foreground mb-3">
					How important is this to you?
				</h1>
				<p class="text-lg text-muted-foreground">This shapes how we work with you</p>
			</div>

			<div class="space-y-3 max-w-lg mx-auto">
				{#each ONBOARDING_V3_CONFIG.stakes as stakes}
					{@const Icon = stakesIcons[stakes.id]}
					<button
						class="group relative w-full overflow-hidden rounded-lg border-2 p-5 text-left tx tx-frame tx-weak pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
							{selectedStakes === stakes.id
							? 'border-accent bg-accent/5 shadow-ink-strong'
							: 'border-border bg-card shadow-ink hover:border-accent/50 hover:shadow-ink-strong'}"
						onclick={() => selectStakes(stakes.id as OnboardingStakes)}
					>
						<div class="relative flex items-center gap-4">
							<div
								class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
									{selectedStakes === stakes.id
									? 'bg-accent/15 text-accent'
									: 'bg-muted text-muted-foreground group-hover:text-accent'}"
							>
								<Icon class="w-5 h-5" />
							</div>
							<div>
								<p class="font-semibold text-foreground">{stakes.label}</p>
								<p class="text-sm text-muted-foreground mt-0.5">
									{stakes.description}
								</p>
							</div>
						</div>
					</button>
				{/each}
			</div>

			<!-- Back button to change intent -->
			<div class="mt-6 text-center">
				<button
					class="inline-flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					onclick={() => (currentQuestion = 'intent')}
				>
					Change my answer
				</button>
			</div>
		</div>
	{/if}

	<!-- Continue button -->
	{#if canContinue}
		<div class="mt-10 text-center" in:fade={fadeIn()}>
			<Button
				variant="primary"
				size="lg"
				onclick={saveAndContinue}
				loading={isSaving}
				disabled={isSaving}
				class="px-10 py-3 text-lg shadow-ink-strong"
			>
				{isSaving ? 'Saving...' : 'Continue'}
			</Button>
		</div>
	{/if}
</div>
