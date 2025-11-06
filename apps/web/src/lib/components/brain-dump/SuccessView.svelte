<!-- apps/web/src/lib/components/brain-dump/SuccessView.svelte -->
<script lang="ts">
	import { Check, ExternalLink, FileText, Sparkles, ArrowRight, Brain } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import OperationErrorsDisplay from './OperationErrorsDisplay.svelte';

	let {
		successData = {},
		showNavigationOnSuccess = true,
		inModal = false,
		onStartNew,
		onGoToProject,
		onContinueWithAgent,
		onNavigateToHistory
	} = $props<{
		successData?: {
			brainDumpId?: string;
			brainDumpType?: string;
			projectId?: string;
			projectName?: string;
			isNewProject?: boolean;
			operationsCount?: number;
			failedOperations?: number;
			operationErrors?: Array<{
				operationId: string;
				table: string;
				operation: string;
				error: string;
				timestamp?: string;
			}>;
		};
		showNavigationOnSuccess?: boolean;
		inModal?: boolean;
		onStartNew?: () => void;
		onGoToProject?: () => void;
		onContinueWithAgent?: (detail: { projectId: string }) => void;
		onNavigateToHistory?: (detail: { url: string }) => void;
	}>();

	function handleStartNew(e: Event) {
		e.stopPropagation();
		onStartNew?.();
	}

	function handleGoToProject(e: Event) {
		e.stopPropagation();
		onGoToProject?.();
	}

	function handleContinueWithAgent(e: Event) {
		e.stopPropagation();
		onContinueWithAgent?.({ projectId: successData.projectId! });
	}
</script>

<div
	class="h-full flex flex-col bg-gray-50 dark:bg-gray-900 {inModal
		? 'min-h-[400px]'
		: ''} rounded-lg"
>
	<!-- Content positioned at top with responsive padding -->
	<div class="px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 md:pt-8">
		<div class="max-w-md mx-auto">
			<!-- Success Icon - Smaller and tighter -->
			<div
				class="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-emerald-100 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 animate-success-appear"
			>
				<Check
					class="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-emerald-600 dark:text-emerald-400"
				/>
			</div>

			<!-- Success Message - Tighter spacing -->
			<h1
				class="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white text-center mb-1.5 sm:mb-2"
			>
				Brain Dump Complete!
			</h1>

			<!-- Details Card -->
			<div
				class="bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 mb-4 sm:mb-6"
			>
				<div class="space-y-2">
					<!-- Project Info -->
					<div class="flex items-start justify-between">
						<div class="flex-1 w-full">
							<div class="flex items-start justify-between">
								<p
									class="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-0.5 w-full"
								>
									{successData.isNewProject
										? 'New Project Created'
										: 'Project Updated'}
								</p>
								{#if successData.isNewProject}
									<span
										class="px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-medium rounded-full"
									>
										NEW
									</span>
								{/if}
							</div>
							<p
								class="text-sm sm:text-base font-medium text-gray-900 dark:text-white truncate"
							>
								{successData.projectName || 'Untitled Project'}
							</p>
						</div>
					</div>

					<!-- Stats -->
					{#if successData.operationsCount}
						<div class="pt-2 border-t border-gray-100 dark:border-gray-700">
							<div class="flex items-center justify-between text-xs sm:text-sm">
								<span class="text-gray-500 dark:text-gray-400">Items processed</span
								>
								<span class="font-semibold text-gray-900 dark:text-white">
									{successData.operationsCount}
									{#if successData.failedOperations && successData.failedOperations > 0}
										<span
											class="text-amber-600 dark:text-amber-400 text-xs ml-1"
										>
											({successData.failedOperations} failed)
										</span>
									{/if}
								</span>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Operation Errors Display -->
			{#if successData.operationErrors && successData.operationErrors.length > 0}
				<OperationErrorsDisplay
					errors={successData.operationErrors}
					summary={{
						successful:
							(successData.operationsCount || 0) -
							(successData.failedOperations || 0),
						failed: successData.failedOperations || 0
					}}
				/>
			{/if}

			<!-- Primary Actions -->
			<div class="space-y-2 sm:space-y-2.5">
				{#if showNavigationOnSuccess && successData.projectId}
					<Button
						onclick={handleGoToProject}
						class="w-full"
						variant="success"
						size="md"
						btnType="container"
					>
						<ExternalLink class="w-4 h-4 mr-2" />
						<span>View {successData.isNewProject ? 'New ' : ''}Project</span>
						<ArrowRight
							class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform"
						/>
					</Button>
				{:else if showNavigationOnSuccess}
					<!-- Show placeholder when project slug is missing -->
					<div
						class="w-full py-2.5 sm:py-3 bg-gray-300 dark:bg-gray-700
						text-gray-500 dark:text-gray-400 font-medium rounded-lg sm:rounded-xl text-sm sm:text-base
						flex items-center justify-center cursor-not-allowed"
						title="Project information not available"
					>
						<ExternalLink class="w-4 h-4 mr-2 opacity-50" />
						<span>View Project (Not Available)</span>
					</div>
				{/if}

				{#if successData.brainDumpId}
					<Button
						class="w-full mt-2"
						variant="outline"
						size="md"
						btnType="container"
						onclick={() => {
							onNavigateToHistory?.({
								url: `/history?braindump=${successData.brainDumpId}`
							});
						}}
					>
						<FileText class="w-3.5 h-3.5 mr-1.5" />
						<span>View in History</span>
					</Button>
				{/if}
			</div>

			<!-- Divider -->
			<div class="flex items-center my-4 sm:my-6">
				<div class="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
				<span class="px-3 text-xs sm:text-sm text-gray-500 dark:text-gray-400">or</span>
				<div class="flex-1 border-t border-gray-200 dark:border-gray-700"></div>
			</div>

			<!-- Secondary Actions -->
			<div class="space-y-2">
				{#if successData.projectId}
					<Button
						onclick={handleContinueWithAgent}
						variant="outline"
						size="md"
						fullWidth
						class="text-sm sm:text-base bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
					>
						<Brain class="w-4 h-4 mr-2" />
						Continue with AI Agent
					</Button>
				{/if}

				<Button
					onclick={handleStartNew}
					variant="outline"
					size="md"
					fullWidth
					class="text-sm sm:text-base"
				>
					<Sparkles class="w-4 h-4 mr-2" />
					Start New Brain Dump
				</Button>
			</div>

			<!-- Quick Tips -->
			<div
				class="mt-6 sm:mt-8 p-3 sm:p-4 bg-primary-50 dark:bg-primary-900/10 rounded-lg border border-primary-200 dark:border-primary-800"
			>
				<h3
					class="text-xs sm:text-sm font-semibold text-primary-900 dark:text-primary-100 mb-1.5 flex items-center"
				>
					<Sparkles class="w-3.5 h-3.5 mr-1.5 text-primary-600 dark:text-primary-400" />
					Quick Tip
				</h3>
				<p class="text-xs text-primary-800 dark:text-primary-200">
					{#if successData.isNewProject}
						Your new project is ready! Add more tasks, set deadlines, and come back when
						you want to brain dump more.
					{:else}
						Your project is updated! Regularly brain dumping helps keep your projects
						organized and on track.
					{/if}
				</p>
			</div>
		</div>
	</div>

	<!-- Bottom safe area padding for mobile -->
	{#if !inModal}
		<div class="flex-1"></div>
		<div
			class="flex-shrink-0 h-4 sm:h-6"
			style="padding-bottom: env(safe-area-inset-bottom);"
		></div>
	{/if}
</div>

<style>
	@keyframes success-appear {
		0% {
			transform: scale(0) rotate(-180deg);
			opacity: 0;
		}
		50% {
			transform: scale(1.1) rotate(10deg);
		}
		100% {
			transform: scale(1) rotate(0deg);
			opacity: 1;
		}
	}

	.animate-success-appear {
		animation: success-appear 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@media (prefers-reduced-motion: reduce) {
		.animate-success-appear {
			animation: none;
		}
	}
	/* Smooth animations */
	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Apply animation to main content */
	.max-w-md {
		animation: slideIn 0.3s ease-out;
	}

	/* Better focus styles for accessibility */
	button:focus-visible {
		outline: 2px solid transparent;
		outline-offset: 2px;
	}

	/* Ensure clickable areas are large enough on mobile */
	@media (max-width: 640px) {
		a,
		button {
			min-height: 44px;
		}
	}
</style>
