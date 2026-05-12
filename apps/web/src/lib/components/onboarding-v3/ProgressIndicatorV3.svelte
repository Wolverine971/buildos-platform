<!-- apps/web/src/lib/components/onboarding-v3/ProgressIndicatorV3.svelte -->
<script lang="ts">
	import { ArrowLeft, Check } from 'lucide-svelte';

	interface Props {
		currentStep: number;
		totalSteps: number;
		maxStepReached?: number;
		onStepClick?: (step: number) => void;
		onBack?: () => void;
	}

	let {
		currentStep,
		totalSteps,
		maxStepReached = currentStep,
		onStepClick,
		onBack
	}: Props = $props();

	const stepLabels = ['Intent', 'Project Capture', 'Notifications', 'Ready'];

	const progress = $derived(Math.round((currentStep / (totalSteps - 1)) * 100));

	function handleStepClick(index: number) {
		if (!onStepClick) return;
		if (index > maxStepReached) return;
		if (index === currentStep) return;
		onStepClick(index);
	}
</script>

<div class="max-w-3xl mx-auto w-full">
	<div class="relative flex items-center gap-3 sm:gap-4">
		<!-- Back button (left) -->
		<!-- <div class="shrink-0 w-16 sm:w-20">
			{#if onBack && currentStep > 0}
				<button
					type="button"
					class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1 py-1"
					onclick={onBack}
					aria-label="Go back to previous step"
				>
					<ArrowLeft class="w-4 h-4" />
					<span class="hidden sm:inline">Back</span>
				</button>
			{/if}
		</div> -->

		<!-- Progress track -->
		<div class="flex-1 min-w-0">
			<!-- Progress bar -->
			<div class="relative h-1 bg-muted rounded-full overflow-hidden">
				<div
					class="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-500 ease-out"
					style="width: {progress}%"
				></div>
			</div>

			<!-- Step dots and labels -->
			<div class="flex justify-between mt-2.5">
				{#each stepLabels as label, i}
					{@const isCompleted = i < currentStep}
					{@const isCurrent = i === currentStep}
					{@const isReachable = i <= maxStepReached}
					<button
						type="button"
						class="group flex flex-col items-center gap-1.5 px-1 py-1 -mx-1 -my-1 rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
							{isReachable && !isCurrent ? 'cursor-pointer hover:bg-muted/50' : ''}
							{!isReachable ? 'cursor-not-allowed' : ''}"
						disabled={!isReachable || isCurrent}
						aria-current={isCurrent ? 'step' : undefined}
						aria-label={isReachable
							? `Go to ${label}${isCompleted ? ' (completed)' : ''}`
							: `${label} (locked)`}
						onclick={() => handleStepClick(i)}
					>
						<div
							class="flex items-center justify-center w-5 h-5 rounded-full transition-all duration-300
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
							class="text-[11px] sm:text-xs text-center leading-tight whitespace-nowrap transition-colors duration-300
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

		<!-- Right spacer to balance the back button -->
		<div class="shrink-0 w-16 sm:w-20" aria-hidden="true"></div>
	</div>
</div>
