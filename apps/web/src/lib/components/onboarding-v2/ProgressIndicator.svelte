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
							<div class="w-full h-full bg-border">
								<div
									class="h-full bg-accent transition-all duration-500"
									style="width: {isCompleted ? '100%' : '0%'}"
								></div>
							</div>
						</div>
					{/if}

					<!-- Step circle -->
					<button
						class="relative z-0 w-8 h-8 rounded-full transition-all duration-300 flex items-center justify-center cursor-pointer pressable
              hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring/50
              {isCompleted
							? 'bg-emerald-600 shadow-ink'
							: isCurrent
								? 'bg-accent shadow-ink animate-pulse scale-110'
								: 'bg-muted hover:bg-muted/80'}"
						onclick={() => onStepClick(index)}
						aria-label="Go to step {index + 1}: {step.title}"
						title="Go to step {index + 1}: {step.title}"
					>
						{#if isCompleted}
							<CheckCircle class="w-5 h-5 text-white" />
						{:else if isCurrent}
							<div class="w-3 h-3 bg-accent-foreground rounded-full"></div>
						{:else}
							<div class="w-2 h-2 bg-muted-foreground/50 rounded-full"></div>
						{/if}
					</button>

					<!-- Step label (only show for current and completed on mobile) -->
					<div class="mt-2 text-center hidden sm:block">
						<p
							class="text-xs font-medium {isCompleted || isCurrent
								? 'text-foreground'
								: 'text-muted-foreground'}"
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
		<p class="text-sm font-medium text-foreground">
			Step {currentStep + 1} of {totalSteps}
		</p>
		<p class="text-xs text-muted-foreground mt-1">
			{currentStep} completed · {progressPercentage}% done
		</p>
	</div>
</div>
