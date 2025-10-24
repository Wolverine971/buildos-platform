<!-- apps/web/src/lib/components/brain-dump/ProcessingModal.svelte -->
<script lang="ts">
	import { LoaderCircle, Zap, Brain, FileText, CircleCheck, X } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import DualProcessingResults from './DualProcessingResults.svelte';
	import { fade } from 'svelte/transition';
	import { onDestroy, createEventDispatcher } from 'svelte';

	const dispatch = createEventDispatcher();

	export let isOpen: boolean = false;
	export let processingType: 'dual' | 'single' = 'single';
	export let dualProcessingComponent: DualProcessingResults | undefined = undefined;
	export let contextResult: any = null;
	export let tasksResult: any = null;
	export let isShortBraindump: boolean = false;

	let title = 'Processing Brain Dump';

	// Cancellation state
	let showCancelButton = false;
	let cancelButtonTimer: NodeJS.Timeout | null = null;
	let processingStartTime = 0;

	$: subtitle =
		processingType === 'dual'
			? 'Analyzing your content for context and actionable items'
			: 'Analyzing and organizing your content';

	// Processing steps for single processing animation
	let processingSteps = [
		{
			title: 'Reading Content',
			description: "Capturing everything you've shared",
			completed: false,
			active: false
		},
		{
			title: 'Identifying Context',
			description: 'Finding patterns and connections in your thoughts',
			completed: false,
			active: false
		},
		{
			title: 'Extracting Items',
			description: 'Converting ideas into actionable tasks and notes',
			completed: false,
			active: false
		},
		{
			title: 'Organizing Results',
			description: 'Preparing your personalized action plan',
			completed: false,
			active: false
		}
	];

	let stepInterval: NodeJS.Timeout;
	let currentStep = 0;

	// Rotating tips to show during processing
	let tips = [
		'Voice recording captures your thoughts hands-free',
		'Longer brain dumps get more thorough dual processing',
		'You can brain dump from any page using the modal',
		'Tasks are automatically scheduled based on your calendar preferences',
		'Brain dumps can include context from your existing projects'
	];

	let currentTipIndex = 0;
	let tipInterval: NodeJS.Timeout;

	function startStepAnimation() {
		currentStep = 0;
		updateSteps();

		stepInterval = setInterval(() => {
			currentStep++;
			if (currentStep >= processingSteps.length) {
				clearInterval(stepInterval);
				return;
			}
			updateSteps();
		}, 1500);
	}

	function updateSteps() {
		processingSteps = processingSteps.map((step, index) => ({
			...step,
			completed: index < currentStep,
			active: index === currentStep
		}));
	}

	function stopStepAnimation() {
		if (stepInterval) {
			clearInterval(stepInterval);
		}
		// Reset steps
		processingSteps = processingSteps.map((step) => ({
			...step,
			completed: false,
			active: false
		}));
		currentStep = 0;
	}

	function startTipRotation() {
		currentTipIndex = 0;
		tipInterval = setInterval(() => {
			currentTipIndex = (currentTipIndex + 1) % tips.length;
		}, 3000); // Rotate tips every 3 seconds
	}

	function stopTipRotation() {
		if (tipInterval) {
			clearInterval(tipInterval);
		}
		currentTipIndex = 0;
	}

	// Cancellation timer functions
	function startCancelButtonTimer() {
		processingStartTime = Date.now();
		showCancelButton = false;

		// Show cancel button after 15 seconds
		cancelButtonTimer = setTimeout(() => {
			showCancelButton = true;
		}, 15000);
	}

	function stopCancelButtonTimer() {
		if (cancelButtonTimer) {
			clearTimeout(cancelButtonTimer);
			cancelButtonTimer = null;
		}
		showCancelButton = false;
		processingStartTime = 0;
	}

	function handleCancel() {
		dispatch('cancel');
	}

	// Consolidated timer management - single reactive block to prevent race conditions
	$: {
		if (isOpen) {
			// Always start common features when modal is open
			startTipRotation();
			startCancelButtonTimer();

			// Start step animation only for single processing
			if (processingType === 'single') {
				startStepAnimation();
			} else {
				stopStepAnimation();
			}
		} else {
			// Stop everything when modal is closed
			stopStepAnimation();
			stopTipRotation();
			stopCancelButtonTimer();
		}
	}

	onDestroy(() => {
		stopStepAnimation();
		stopTipRotation();
		stopCancelButtonTimer();
	});
</script>

<Modal
	{isOpen}
	title=""
	size={processingType === 'dual' ? 'lg' : 'md'}
	onClose={showCancelButton ? handleCancel : () => {}}
	showCloseButton={showCancelButton}
	closeOnBackdrop={true}
	closeOnEscape={true}
	persistent={false}
>
	<!-- Custom Header -->
	<div
		slot="header"
		class="text-center py-4 sm:py-6 px-4 sm:px-6 border-b border-gray-200 dark:border-gray-700"
	>
		<div class="flex justify-center mb-4">
			{#if processingType === 'dual'}
				<div class="relative">
					<Brain class="w-12 h-12 text-primary-600 dark:text-primary-400" />
					<Zap class="w-6 h-6 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
				</div>
			{:else}
				<div class="relative">
					<FileText class="w-12 h-12 text-primary-600 dark:text-primary-400" />
					<div class="absolute inset-0 flex items-center justify-center">
						<LoaderCircle
							class="w-16 h-16 text-primary-600/20 dark:text-primary-400/20 animate-spin"
						/>
					</div>
				</div>
			{/if}
		</div>
		<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
			{title}
		</h2>
		<p class="text-sm text-gray-500 dark:text-gray-400">
			{subtitle}
		</p>
	</div>

	<!-- Content -->
	<div class="px-4 sm:px-6 py-4">
		{#if processingType === 'dual'}
			<!-- Dual Processing Content -->
			<div class="space-y-4">
				<div class="text-center mb-4 sm:mb-6">
					<p class="text-sm text-gray-600 dark:text-gray-300">
						Your brain dump is being analyzed in two ways: understanding the big picture
						context and extracting specific tasks and actions. This comprehensive
						approach ensures nothing important is missed.
					</p>
				</div>

				<DualProcessingResults
					bind:this={dualProcessingComponent}
					{contextResult}
					{tasksResult}
					isProcessing={true}
					inModal={true}
					showContextPanel={!isShortBraindump}
					{isShortBraindump}
				/>

				<!-- Rotating Tips for Dual Processing -->
				<div class="text-center mt-4">
					<p class="text-xs text-gray-500 dark:text-gray-400 italic">
						💡 Tip: {tips[currentTipIndex]}
					</p>
				</div>
			</div>
		{:else}
			<!-- Single Processing Content -->
			<div class="space-y-6">
				<!-- Animated Processing Steps -->
				<div class="space-y-4">
					{#each processingSteps as step, index}
						<div
							class="flex items-start gap-4"
							in:fade={{ delay: index * 200, duration: 300 }}
						>
							<div class="flex-shrink-0">
								{#if step.completed}
									<div
										class="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center"
									>
										<CircleCheck
											class="w-5 h-5 text-emerald-600 dark:text-emerald-400"
										/>
									</div>
								{:else if step.active}
									<div
										class="w-8 h-8 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center"
									>
										<LoaderCircle
											class="w-5 h-5 text-primary-600 dark:text-primary-400 animate-spin"
										/>
									</div>
								{:else}
									<div
										class="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center"
									>
										<div
											class="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full"
										></div>
									</div>
								{/if}
							</div>
							<div class="flex-1">
								<h4 class="text-sm font-medium text-gray-900 dark:text-white">
									{step.title}
								</h4>
								<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
									{step.description}
								</p>
							</div>
						</div>
					{/each}
				</div>

				<!-- Animated Brain Dump Visual -->
				<div class="flex justify-center py-4">
					<div class="relative">
						<span class="text-4xl glowing-hammer">⚒</span>
						<div class="absolute inset-0 flex items-center justify-center">
							<!-- <div
								class="w-16 h-16 border-2 border-primary-500/30 dark:border-primary-400/30 rounded-full animate-ping"
							></div> -->
						</div>
					</div>
				</div>

				<!-- Progress Message -->
				<div class="text-center">
					<p class="text-sm text-gray-600 dark:text-gray-300 animate-pulse">
						Turning your thoughts into organized, actionable next steps...
					</p>
				</div>

				<!-- Rotating Tips -->
				<div class="text-center mt-4">
					<p class="text-xs text-gray-500 dark:text-gray-400 italic">
						💡 Tip: {tips[currentTipIndex]}
					</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Footer info -->
	<div
		slot="footer"
		class="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700"
	>
		<p class="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">
			{#if processingType === 'dual'}
				Processing longer content thoroughly - this ensures accurate task extraction and
				context understanding
			{:else}
				Quick processing for focused content - typically completes in 5-15 seconds
			{/if}
		</p>

		{#if showCancelButton}
			<div class="flex justify-center" in:fade={{ duration: 200 }}>
				<Button
					variant="ghost"
					size="sm"
					on:click={handleCancel}
					class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
				>
					Cancel Processing
				</Button>
			</div>
		{/if}
	</div>
</Modal>

<style>
	/* Reuse the glowing hammer animation from main CSS */
	/* Enhanced glowing hammer with smooth transitions */
	.glowing-hammer {
		animation:
			pulse-glow 2s ease-in-out infinite,
			rotate-sway 3s ease-in-out infinite;
		display: inline-block; /* required for transforms */
		text-shadow: 0 0 0 currentColor;
		font-family: 'Segoe UI Symbol', 'Noto Sans Symbols', 'Symbola', sans-serif;
		transition: filter var(--transition-normal) var(--ease-out);
	}

	/* Define light mode by default */
	.glowing-hammer {
		filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.8));
	}

	@media (prefers-color-scheme: dark) {
		.glowing-hammer {
			filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
		}
	}

	@keyframes pulse-glow {
		0%,
		100% {
			transform: scale(1) rotate(0deg);
			filter: drop-shadow(0 0 6px rgba(0, 0, 0, 0.6));
		}
		50% {
			transform: scale(1.03) rotate(0deg);
			filter: drop-shadow(0 0 12px rgba(0, 0, 0, 0.8))
				drop-shadow(0 0 18px rgba(0, 0, 0, 0.4));
		}
	}

	/* Dark mode overrides within keyframes */
	@media (prefers-color-scheme: dark) {
		@keyframes pulse-glow {
			0%,
			100% {
				transform: scale(1) rotate(0deg);
				filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
			}
			50% {
				transform: scale(1.05) rotate(0deg);
				filter: drop-shadow(0 0 16px rgba(255, 255, 255, 1))
					drop-shadow(0 0 24px rgba(255, 255, 255, 0.6));
			}
		}
	}

	@keyframes rotate-sway {
		0%,
		100% {
			transform: rotate(-5deg);
		}
		50% {
			transform: rotate(5deg);
		}
	}
</style>
