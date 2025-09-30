<!-- apps/web/src/lib/components/project/PhaseGenerationLoadingOverlay.svelte -->
<script lang="ts">
	import { Loader2, Sparkles, CheckCircle } from 'lucide-svelte';
	import { onMount } from 'svelte';

	export let isVisible = false;
	export let isRegeneration = false;

	let currentStep = 0;
	let interval: any;

	const steps = isRegeneration
		? [
				'Clearing existing phases...',
				'Analyzing selected tasks...',
				'Resolving date conflicts...',
				'Creating new phases...',
				'Assigning tasks to phases...',
				'Finalizing timeline...'
			]
		: [
				'Analyzing selected tasks...',
				'Resolving date conflicts...',
				'Creating optimal phases...',
				'Assigning tasks to phases...',
				'Finalizing timeline...'
			];

	$: if (isVisible) {
		startStepAnimation();
	} else {
		stopStepAnimation();
	}

	function startStepAnimation() {
		currentStep = 0;
		interval = setInterval(() => {
			if (currentStep < steps.length - 1) {
				currentStep++;
			}
		}, 2000); // Change step every 2 seconds
	}

	function stopStepAnimation() {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
		currentStep = 0;
	}

	onMount(() => {
		return () => stopStepAnimation();
	});
</script>

{#if isVisible}
	<div
		class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-0"
		role="dialog"
		aria-modal="true"
	>
		<div class="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-8 max-w-md w-full mx-4">
			<!-- Header -->
			<div class="text-center mb-6">
				<div
					class="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4"
				>
					<Sparkles class="w-8 h-8 text-blue-600 dark:text-blue-400" />
				</div>
				<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
					{isRegeneration ? 'Regenerating Phases' : 'Generating Phases'}
				</h3>
				<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
					Please wait while we organize your project...
				</p>
			</div>

			<!-- Progress Steps -->
			<div class="space-y-4">
				{#each steps as step, index}
					<div class="flex items-center gap-3">
						{#if index < currentStep}
							<!-- Completed step -->
							<div
								class="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center"
							>
								<CheckCircle class="w-4 h-4 text-green-600 dark:text-green-400" />
							</div>
							<span class="text-sm text-gray-500 dark:text-gray-400 line-through"
								>{step}</span
							>
						{:else if index === currentStep}
							<!-- Current step -->
							<div
								class="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center"
							>
								<Loader2
									class="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin"
								/>
							</div>
							<span class="text-sm font-medium text-gray-900 dark:text-white"
								>{step}</span
							>
						{:else}
							<!-- Future step -->
							<div
								class="flex-shrink-0 w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-full"
							></div>
							<span class="text-sm text-gray-400 dark:text-gray-500">{step}</span>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Progress Bar -->
			<div class="mt-6">
				<div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
					<span>Progress</span>
					<span>{Math.round(((currentStep + 1) / steps.length) * 100)}%</span>
				</div>
				<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
					<div
						class="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-1000 ease-out"
						style="width: {((currentStep + 1) / steps.length) * 100}%"
					></div>
				</div>
			</div>

			<!-- Footer -->
			<div class="mt-6 text-center">
				<p class="text-xs text-gray-400 dark:text-gray-500">
					This may take a few moments depending on project complexity
				</p>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Enhanced animations */
	:global(.phase-generation-loading) {
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	/* Pulse animation for current step */
	:global(.animate-pulse-subtle) {
		animation: pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

	@keyframes pulseSubtle {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.8;
		}
	}
</style>
