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
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		ONBOARDING_V3_CONFIG,
		type OnboardingIntent,
		type OnboardingStakes
	} from '$lib/config/onboarding.config';
	import { toastService } from '$lib/stores/toast.store';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		onNext: () => void;
		onIntentSelected: (intent: OnboardingIntent) => void;
		onStakesSelected: (stakes: OnboardingStakes) => void;
	}

	let { onNext, onIntentSelected, onStakesSelected }: Props = $props();

	let selectedIntent = $state<OnboardingIntent | null>(null);
	let selectedStakes = $state<OnboardingStakes | null>(null);
	let isSaving = $state(false);
	let currentQuestion = $state<'intent' | 'stakes'>('intent');

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
		// Auto-advance to stakes question after a brief pause
		setTimeout(() => {
			currentQuestion = 'stakes';
		}, 300);
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
		<div in:fade={{ duration: 200 }}>
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
						class="group relative text-left p-5 rounded-xl border-2 transition-all duration-200 pressable
							{selectedIntent === intent.id
							? 'border-accent bg-accent/5 shadow-ink-strong'
							: 'border-border bg-card shadow-ink hover:border-accent/50 hover:shadow-ink-strong'}"
						onclick={() => selectIntent(intent.id as OnboardingIntent)}
					>
						<div class="tx tx-frame tx-weak rounded-xl absolute inset-0"></div>
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
		<div in:fly={{ y: 20, duration: 300 }}>
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
						class="group relative w-full text-left p-5 rounded-xl border-2 transition-all duration-200 pressable
							{selectedStakes === stakes.id
							? 'border-accent bg-accent/5 shadow-ink-strong'
							: 'border-border bg-card shadow-ink hover:border-accent/50 hover:shadow-ink-strong'}"
						onclick={() => selectStakes(stakes.id as OnboardingStakes)}
					>
						<div class="tx tx-frame tx-weak rounded-xl absolute inset-0"></div>
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
					class="text-sm text-muted-foreground hover:text-foreground transition-colors"
					onclick={() => (currentQuestion = 'intent')}
				>
					Change my answer
				</button>
			</div>
		</div>
	{/if}

	<!-- Continue button -->
	{#if canContinue}
		<div class="mt-10 text-center" in:fade={{ duration: 200 }}>
			<Button
				variant="primary"
				size="lg"
				onclick={saveAndContinue}
				loading={isSaving}
				disabled={isSaving}
				class="px-10 py-3 text-lg shadow-ink-strong pressable"
			>
				{isSaving ? 'Saving...' : 'Continue'}
			</Button>
		</div>
	{/if}
</div>
