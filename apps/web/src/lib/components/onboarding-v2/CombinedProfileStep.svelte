<!-- apps/web/src/lib/components/onboarding-v2/CombinedProfileStep.svelte -->
<script lang="ts">
	import { Brain, Bot, ListChecks, Sparkles, Target } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
	import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		userId: string;
		onNext: () => void;
		onArchetypeSelected?: (archetype: string) => void;
		onChallengesSelected?: (challenges: string[]) => void;
	}

	let { userId, onNext, onArchetypeSelected, onChallengesSelected }: Props = $props();

	// State
	let selectedArchetype = $state<string | null>(null);
	let selectedChallenges = $state<Set<string>>(new Set());
	let isSaving = $state(false);

	const archetypes = ONBOARDING_V2_CONFIG.archetypes;
	const challenges = ONBOARDING_V2_CONFIG.challenges;

	const iconMap = {
		brain: Brain,
		robot: Bot,
		checklist: ListChecks
	};

	// Validation
	const canContinue = $derived(selectedArchetype !== null);

	function selectArchetype(id: string) {
		selectedArchetype = id;
	}

	function toggleChallenge(id: string) {
		if (selectedChallenges.has(id)) {
			selectedChallenges.delete(id);
		} else {
			selectedChallenges.add(id);
		}
		selectedChallenges = new Set(selectedChallenges); // Trigger reactivity
	}

	async function saveAndContinue() {
		if (!selectedArchetype) {
			toastService.error('Please select how you want to use BuildOS');
			return;
		}

		isSaving = true;

		try {
			// Save archetype
			await onboardingV2Service.saveArchetype(userId, selectedArchetype);

			// Save challenges if any selected
			if (selectedChallenges.size > 0) {
				const challengesArray = Array.from(selectedChallenges);
				await onboardingV2Service.saveChallenges(userId, challengesArray);

				if (onChallengesSelected) {
					onChallengesSelected(challengesArray);
				}
			}

			// Notify parent
			if (onArchetypeSelected) {
				onArchetypeSelected(selectedArchetype);
			}

			toastService.success('Profile saved!');
			onNext();
		} catch (error) {
			console.error('Failed to save profile:', error);
			toastService.error('Failed to save. Please try again.');
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="max-w-4xl mx-auto px-4">
	<!-- Header -->
	<div class="mb-12 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-2xl flex items-center justify-center shadow-lg"
			>
				<Sparkles class="w-8 h-8 text-purple-600 dark:text-purple-400" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">
			Step 4: Tell Us About Your Workflow
		</h2>
		<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
			Help us personalize BuildOS to work the way you do.
		</p>
	</div>

	<!-- Section 1: Archetype Selection -->
	<div class="mb-12">
		<h3
			class="text-2xl font-bold mb-6 text-gray-900 dark:text-white text-center flex items-center justify-center gap-2"
		>
			<Brain class="w-6 h-6 text-purple-600 dark:text-purple-400" />
			How do you want to use BuildOS?
		</h3>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
			{#each archetypes as archetype}
				{@const Icon = iconMap[archetype.icon as keyof typeof iconMap]}
				{@const isSelected = selectedArchetype === archetype.id}

				<button
					onclick={() => selectArchetype(archetype.id)}
					class="group relative p-6 rounded-2xl border-2 transition-all duration-200 text-left {isSelected
						? 'border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 shadow-lg scale-105'
						: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300 hover:shadow-md'}"
				>
					<!-- Selection indicator -->
					{#if isSelected}
						<div
							class="absolute top-4 right-4 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center"
						>
							<svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
					{/if}

					<!-- Icon -->
					<div
						class="mb-4 w-14 h-14 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/50 dark:to-blue-900/50 flex items-center justify-center {isSelected
							? 'scale-110'
							: 'group-hover:scale-105'} transition-transform duration-200"
					>
						<Icon class="w-7 h-7 text-purple-600 dark:text-purple-400" />
					</div>

					<!-- Content -->
					<h4
						class="text-xl font-bold mb-2 {isSelected
							? 'text-purple-900 dark:text-purple-100'
							: 'text-gray-900 dark:text-white'}"
					>
						{archetype.title}
					</h4>
					<p class="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
						{archetype.description}
					</p>

					<!-- Features -->
					<ul class="space-y-2">
						{#each archetype.features as feature}
							<li class="flex items-start gap-2 text-sm">
								<span class="text-purple-600 dark:text-purple-400 mt-0.5">✓</span>
								<span class="text-gray-700 dark:text-gray-300">{feature}</span>
							</li>
						{/each}
					</ul>
				</button>
			{/each}
		</div>

		<p class="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
			Don't worry — you can change this later in your settings
		</p>
	</div>

	<!-- Divider -->
	<div class="mb-12 flex items-center gap-3">
		<div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
		<Sparkles class="w-5 h-5 text-gray-400" />
		<div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
	</div>

	<!-- Section 2: Challenges Selection -->
	<div class="mb-8">
		<h3
			class="text-2xl font-bold mb-6 text-gray-900 dark:text-white text-center flex items-center justify-center gap-2"
		>
			<Target class="w-6 h-6 text-amber-600 dark:text-amber-400" />
			What challenges are you tackling?
			<span class="text-sm font-normal text-gray-500">(Optional)</span>
		</h3>

		<p class="text-center text-gray-600 dark:text-gray-400 mb-6">
			Select all that apply — this helps BuildOS adapt to your needs
		</p>

		<div class="space-y-3 mb-6">
			{#each challenges as challenge}
				{@const isSelected = selectedChallenges.has(challenge.id)}

				<button
					onclick={() => toggleChallenge(challenge.id)}
					class="w-full p-4 rounded-xl border-2 transition-all duration-200 text-left flex items-start gap-4 {isSelected
						? 'border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 shadow-md'
						: 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-300 hover:shadow-sm'}"
				>
					<!-- Checkbox -->
					<div
						class="flex-shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center {isSelected
							? 'border-amber-500 bg-amber-500'
							: 'border-gray-300 dark:border-gray-600'} transition-colors duration-200"
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
		<div class="text-center text-sm text-gray-600 dark:text-gray-400">
			{selectedChallenges.size} challenge{selectedChallenges.size !== 1 ? 's' : ''} selected
		</div>
	</div>

	<!-- Actions -->
	<div class="flex justify-center mt-8">
		<Button
			variant="primary"
			size="lg"
			onclick={saveAndContinue}
			disabled={!canContinue || isSaving}
			loading={isSaving}
			class="min-w-[200px]"
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
