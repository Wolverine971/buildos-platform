<script lang="ts">
	import { Brain, Bot, ListChecks, Sparkles } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';
	import { onboardingV2Service } from '$lib/services/onboarding-v2.service';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		userId: string;
		onNext: () => void;
		onArchetypeSelected?: (archetype: string) => void;
	}

	let { userId, onNext, onArchetypeSelected }: Props = $props();

	let selectedArchetype = $state<string | null>(null);
	let isSaving = $state(false);

	const archetypes = ONBOARDING_V2_CONFIG.archetypes;

	const iconMap = {
		brain: Brain,
		robot: Bot,
		checklist: ListChecks
	};

	function selectArchetype(id: string) {
		selectedArchetype = id;
	}

	async function saveAndContinue() {
		if (!selectedArchetype) {
			toastService.error('Please select how you want to use BuildOS');
			return;
		}

		isSaving = true;

		try {
			await onboardingV2Service.saveArchetype(userId, selectedArchetype);

			// Notify parent component
			if (onArchetypeSelected) {
				onArchetypeSelected(selectedArchetype);
			}

			toastService.success('Profile saved!');
			onNext();
		} catch (error) {
			console.error('Failed to save archetype:', error);
			toastService.error('Failed to save profile. Please try again.');
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="max-w-4xl mx-auto px-4">
	<div class="mb-12 text-center">
		<div class="flex justify-center mb-6">
			<div
				class="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-2xl flex items-center justify-center shadow-lg"
			>
				<Sparkles class="w-8 h-8 text-purple-600 dark:text-purple-400" />
			</div>
		</div>

		<h2 class="text-3xl sm:text-4xl font-bold mb-3 text-gray-900 dark:text-white">
			How do you want to use BuildOS?
		</h2>
		<p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
			Everyone uses BuildOS differently. Choose the profile that fits you best.
		</p>
	</div>

	<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
		{#each archetypes as archetype}
			{@const Icon = iconMap[archetype.icon as keyof typeof iconMap]}
			{@const isSelected = selectedArchetype === archetype.id}

			<button
				onclick={() => selectArchetype(archetype.id)}
				class="group relative p-6 rounded-2xl border-2 transition-all duration-200 text-left
          {isSelected
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
					class="mb-4 w-14 h-14 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/50 dark:to-blue-900/50 flex items-center justify-center
          {isSelected ? 'scale-110' : 'group-hover:scale-105'}
          transition-transform duration-200"
				>
					<Icon class="w-7 h-7 text-purple-600 dark:text-purple-400" />
				</div>

				<!-- Content -->
				<h3
					class="text-xl font-bold mb-2 {isSelected
						? 'text-purple-900 dark:text-purple-100'
						: 'text-gray-900 dark:text-white'}"
				>
					{archetype.title}
				</h3>
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

	<!-- Help text -->
	<div class="text-center text-sm text-gray-500 dark:text-gray-400 mb-8">
		Don't worry — you can change this later in your settings
	</div>

	<!-- Actions -->
	<div class="flex justify-center">
		<Button
			variant="primary"
			size="lg"
			onclick={saveAndContinue}
			disabled={!selectedArchetype || isSaving}
			loading={isSaving}
			class="min-w-[200px]"
		>
			{#if isSaving}
				Saving...
			{:else}
				Continue
			{/if}
		</Button>
	</div>
</div>
