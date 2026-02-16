<!-- apps/web/src/lib/components/onboarding-v3/ProgressIndicatorV3.svelte -->
<script lang="ts">
	interface Props {
		currentStep: number;
		totalSteps: number;
	}

	let { currentStep, totalSteps }: Props = $props();

	const stepLabels = ['Intent', 'Brain Dump', 'Notifications', 'Ready'];

	const progress = $derived(Math.round((currentStep / (totalSteps - 1)) * 100));
</script>

<div class="max-w-lg mx-auto px-4 mb-8">
	<!-- Progress bar -->
	<div class="relative h-1 bg-muted rounded-full overflow-hidden">
		<div
			class="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-500 ease-out"
			style="width: {progress}%"
		></div>
	</div>

	<!-- Step dots and labels -->
	<div class="flex justify-between mt-3">
		{#each stepLabels as label, i}
			<div class="flex flex-col items-center">
				<div
					class="w-2.5 h-2.5 rounded-full transition-colors duration-300
						{i < currentStep
						? 'bg-accent'
						: i === currentStep
							? 'bg-accent ring-4 ring-accent/20'
							: 'bg-muted-foreground/30'}"
				></div>
				<span
					class="text-xs mt-1.5 transition-colors duration-300
						{i <= currentStep ? 'text-foreground font-medium' : 'text-muted-foreground'}"
				>
					{label}
				</span>
			</div>
		{/each}
	</div>
</div>
