<!-- apps/web/src/lib/components/onboarding-v3/ProgressIndicatorV3.svelte -->
<script lang="ts">
	import { ArrowLeft, Check } from '$lib/icons/lucide';
	import { ONBOARDING_STEPS, onboardingProgress } from '$lib/utils/onboarding-state';

	interface Props {
		currentStep: number;
		totalSteps: number;
		maxStepReached?: number;
		onStepClick?: (step: number) => void;
		onBack?: () => void;
		disabled?: boolean;
		completed?: boolean;
	}

	let {
		currentStep,
		totalSteps,
		maxStepReached = currentStep,
		onStepClick,
		onBack,
		disabled = false,
		completed = false
	}: Props = $props();

	const stepLabels = ONBOARDING_STEPS;

	const progress = $derived(onboardingProgress(maxStepReached, completed));

	function handleStepClick(index: number) {
		if (!onStepClick || disabled) return;
		if (index > maxStepReached) return;
		if (index === currentStep) return;
		onStepClick(index);
	}
</script>

<div class="max-w-3xl mx-auto flex w-full items-center gap-3">
	{#if currentStep > 0 && onBack}
		<button
			type="button"
			onclick={onBack}
			{disabled}
			class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none disabled:opacity-50 max-[359px]:hidden"
			aria-label="Go back to the previous step"
		>
			<ArrowLeft class="h-4 w-4" />
		</button>
	{/if}
	<div class="relative min-w-0 flex-1">
		<!-- Progress track -->
		<div class="min-w-0">
			<!-- Progress bar -->
			<div
				class="relative h-1 bg-muted rounded-full overflow-hidden"
				role="progressbar"
				aria-label="Setup progress"
				aria-valuenow={progress}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuetext={`${completed ? totalSteps : maxStepReached} of ${totalSteps} steps saved`}
			>
				<div
					class="absolute inset-y-0 left-0 bg-accent rounded-full transition-[width] duration-200 ease-out motion-reduce:transition-none"
					style="width: {progress}%"
				></div>
			</div>

			<!-- Step dots and labels -->
			<div class="mt-2.5 grid grid-cols-4">
				{#each stepLabels as label, i (label)}
					{@const isCompleted = completed || i < maxStepReached}
					{@const isCurrent = i === currentStep}
					{@const isReachable = i <= maxStepReached}
					<button
						type="button"
						class="group flex min-h-11 flex-col items-center gap-1.5 px-1 py-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none
							{isReachable && !isCurrent ? 'cursor-pointer hover:bg-muted/50' : ''}
							{!isReachable ? 'cursor-not-allowed' : ''}"
						disabled={disabled || !isReachable || isCurrent}
						aria-current={isCurrent ? 'step' : undefined}
						aria-label={isReachable
							? `Go to ${label}${isCompleted ? ' (completed)' : ''}`
							: `${label} (locked)`}
						onclick={() => handleStepClick(i)}
					>
						<div
							class="flex items-center justify-center w-5 h-5 rounded-full transition-colors duration-200 motion-reduce:transition-none
								{isCompleted
								? 'bg-accent text-accent-foreground'
								: isCurrent
									? 'bg-accent ring-4 ring-accent/20'
									: 'bg-muted-foreground/30 group-hover:bg-muted-foreground/50'}"
						>
							{#if isCompleted}
								<Check class="w-3 h-3" strokeWidth={3} />
							{/if}
						</div>
						<span
							class="text-2xs sm:text-xs text-center leading-tight transition-colors duration-200 motion-reduce:transition-none
								{isCurrent
								? 'text-foreground font-semibold'
								: isCompleted
									? 'text-foreground font-medium'
									: 'text-muted-foreground'}
								{isReachable && !isCurrent ? 'group-hover:text-foreground' : ''}"
						>
							{label}
						</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
