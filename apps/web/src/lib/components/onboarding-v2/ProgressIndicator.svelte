<!-- apps/web/src/lib/components/onboarding-v2/ProgressIndicator.svelte -->
<script lang="ts">
	import { CheckCircle } from 'lucide-svelte';
	import { ONBOARDING_V2_CONFIG } from '$lib/config/onboarding.config';

	let {
		currentStep,
		onStepClick = () => {}
	}: {
		currentStep: number;
		onStepClick?: (stepIndex: number) => void;
	} = $props();

	const steps = Object.values(ONBOARDING_V2_CONFIG.steps).sort((a, b) => a.order - b.order);
	const totalSteps = steps.length;

	const progressPercentage = $derived(Math.round((currentStep / (totalSteps - 1)) * 100));
</script>

<div class="mb-8">
	<!-- Progress bar -->
	<div class="relative mb-6">
		<div class="flex items-center justify-between">
			{#each steps as step, index}
				{@const isCompleted = index < currentStep}
				{@const isCurrent = index === currentStep}

				<div class="relative flex flex-col items-center flex-1">
					<!-- Connector line (not for first step) -->
					{#if index > 0}
						<div
							class="absolute top-4 right-1/2 w-full h-0.5 -translate-y-1/2"
							style="z-index: 0;"
						>
							<div class="w-full h-full bg-gray-200 dark:bg-gray-700">
								<div
									class="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-500"
									style="width: {isCompleted ? '100%' : '0%'}"
								></div>
							</div>
						</div>
					{/if}

					<!-- Step circle -->
					<button
						class="relative z-0 w-8 h-8 rounded-full transition-all duration-300 flex items-center justify-center cursor-pointer
              hover:scale-110 focus:outline-none focus:ring-2 focus:ring-purple-500/50
              {isCompleted
							? 'dither-gradient shadow-lg shadow-green-500/30 hover:shadow-green-500/50'
							: isCurrent
								? 'dither-gradient shadow-lg shadow-purple-500/30 animate-pulse scale-110'
								: 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}"
						onclick={() => onStepClick(index)}
						aria-label="Go to step {index + 1}: {step.title}"
						title="Go to step {index + 1}: {step.title}"
					>
						{#if isCompleted}
							<CheckCircle class="w-5 h-5 text-white" />
						{:else if isCurrent}
							<div class="w-3 h-3 bg-white rounded-full"></div>
						{:else}
							<div class="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
						{/if}
					</button>

					<!-- Step label (only show for current and completed on mobile) -->
					<div class="mt-2 text-center hidden sm:block">
						<p
							class="text-xs font-medium {isCompleted || isCurrent
								? 'text-gray-900 dark:text-white'
								: 'text-gray-400 dark:text-gray-500'}"
						>
							{step.title}
						</p>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Progress text -->
	<div class="text-center">
		<p class="text-sm font-medium text-gray-700 dark:text-gray-300">
			Step {currentStep + 1} of {totalSteps}
		</p>
		<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
			{currentStep} completed · {progressPercentage}% done
		</p>
	</div>
</div>
