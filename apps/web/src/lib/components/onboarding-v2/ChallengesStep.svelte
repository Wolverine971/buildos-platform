<!-- apps/web/src/lib/components/onboarding-v2/ChallengesStep.svelte -->
<script lang="ts">
	import { HelpCircle, Sparkles } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
	import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		userId: string;
		onNext: () => void;
		onChallengesSelected?: (challenges: string[]) => void;
	}

	let { userId, onNext, onChallengesSelected }: Props = $props();

	let selectedChallenges = $state<Set<string>>(new Set());
	let isSaving = $state(false);

	const challenges = ONBOARDING_V2_CONFIG.challenges;

	function toggleChallenge(id: string) {
		if (selectedChallenges.has(id)) {
			selectedChallenges.delete(id);
		} else {
			selectedChallenges.add(id);
		}
		selectedChallenges = new Set(selectedChallenges); // Trigger reactivity
	}

	async function saveAndContinue() {
		if (selectedChallenges.size === 0) {
			toastService.warning('Select at least one challenge to help us personalize BuildOS');
			return;
		}

		isSaving = true;

		try {
			const challengesArray = Array.from(selectedChallenges);
			await onboardingV2Service.saveChallenges(userId, challengesArray);

			// Notify parent component
			if (onChallengesSelected) {
				onChallengesSelected(challengesArray);
			}

			toastService.success('Challenges saved!');
			onNext();
		} catch (error) {
			console.error('Failed to save challenges:', error);
			toastService.error('Failed to save challenges. Please try again.');
		} finally {
			isSaving = false;
		}
	}

	function skipChallenges() {
		// Allow skipping and continue anyway
		onNext();
	}
</script>

<div class="max-w-3xl mx-auto px-4">
	<div class="mb-12 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 rounded-2xl flex items-center justify-center shadow-lg"
			>
				<HelpCircle class="w-8 h-8 text-amber-600 dark:text-amber-400" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">
			What's your biggest productivity challenge?
		</h2>
		<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
			Select all that apply — this helps BuildOS adapt to your needs
		</p>
	</div>

	<div class="space-y-3 mb-8">
		{#each challenges as challenge}
			{@const isSelected = selectedChallenges.has(challenge.id)}

			<button
				onclick={() => toggleChallenge(challenge.id)}
				class="w-full p-4 rounded-xl border-2 transition-all duration-200 text-left flex items-start gap-4
          {isSelected
					? 'border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 shadow-md'
					: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300 hover:shadow-sm'}"
			>
				<!-- Checkbox -->
				<div
					class="flex-shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center
          {isSelected ? 'border-amber-500 bg-amber-500' : 'border-gray-300 dark:border-gray-600'}
          transition-colors duration-200"
				>
					{#if isSelected}
						<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
							<path
								fill-rule="evenodd"
								d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
					{/if}
				</div>

				<!-- Challenge -->
				<div class="flex-1">
					<div class="flex items-center gap-2 mb-1">
						<span class="text-2xl">{challenge.icon}</span>
						<span
							class="font-medium {isSelected
								? 'text-amber-900 dark:text-amber-100'
								: 'text-gray-900 dark:text-white'}"
						>
							{challenge.label}
						</span>
					</div>
				</div>
			</button>
		{/each}
	</div>

	<!-- Selection count -->
	<div class="text-center text-sm text-gray-600 dark:text-gray-400 mb-8">
		{selectedChallenges.size} challenge{selectedChallenges.size !== 1 ? 's' : ''} selected
	</div>

	<!-- Actions -->
	<div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
		<Button
			variant="ghost"
			onclick={skipChallenges}
			disabled={isSaving}
			class="order-2 sm:order-1"
		>
			Skip this step
		</Button>

		<Button
			variant="primary"
			size="lg"
			onclick={saveAndContinue}
			disabled={selectedChallenges.size === 0 || isSaving}
			loading={isSaving}
			class="flex-1 sm:flex-initial min-w-[200px] order-1 sm:order-2"
		>
			{#if isSaving}
				Saving...
			{:else}
				Continue
				<Sparkles class="w-5 h-5 ml-2" />
			{/if}
		</Button>
	</div>
</div>
