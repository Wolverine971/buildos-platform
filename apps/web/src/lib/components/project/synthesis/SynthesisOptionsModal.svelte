<!-- apps/web/src/lib/components/project/synthesis/SynthesisOptionsModal.svelte -->
<script lang="ts">
	import {
		X,
		Sparkles,
		Brain,
		ChartBar,
		Users,
		Check,
		ChevronDown,
		ChevronUp,
		Info
	} from 'lucide-svelte';
	import { fade, slide } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';
	import TaskSynthesisConfig from './TaskSynthesisConfig.svelte';
	import type {
		SynthesisOption,
		SynthesisOptions,
		TaskSynthesisConfig as TaskSynthesisConfigType
	} from '$lib/types/synthesis';

	export let isOpen = false;
	export let project: any;
	export let onConfirm: (options: SynthesisOptions) => void;
	export let onClose: () => void;

	let expandedConfigs: Set<string> = new Set();

	// Default task synthesis configuration
	let taskSynthesisConfig: TaskSynthesisConfigType = {
		consolidation: {
			enabled: true,
			aggressiveness: 'moderate',
			preserveDetails: true
		},
		sequencing: {
			enabled: true,
			considerDependencies: true,
			optimizeForParallel: false
		},
		grouping: {
			enabled: true,
			strategy: 'automatic',
			maxGroupSize: 5
		},
		timeEstimation: {
			enabled: true,
			includeBufferTime: true,
			confidenceLevel: 'realistic'
		},
		gapAnalysis: {
			enabled: true,
			includePrerequisites: true,
			includeFollowUps: true,
			suggestMilestones: false
		},
		dependencies: {
			enabled: true,
			autoDetect: true,
			strictMode: false
		}
	};

	let options: SynthesisOption[] = [
		{
			id: 'task_synthesis',
			name: 'Task Synthesis',
			description:
				'Analyze and optimize your tasks through intelligent consolidation and organization',
			detailedDescription: `Task Synthesis performs comprehensive analysis of your project tasks to:

• **Consolidate Duplicates**: Identifies and merges similar or duplicate tasks to reduce redundancy
• **Optimize Sequence**: Arranges tasks in the most logical execution order for maximum efficiency
• **Group Related Work**: Clusters tasks that should be done together for better workflow
• **Adjust Time Estimates**: Refines duration estimates based on task scope and complexity
• **Identify Gaps**: Finds missing prerequisite or follow-up tasks that are critical for success
• **Map Dependencies**: Establishes relationships between interconnected tasks

This analysis helps streamline your project by reducing redundancy, improving workflow, and ensuring all necessary tasks are captured.`,
			enabled: true,
			available: true,
			config: taskSynthesisConfig,
			icon: 'brain'
		},
		{
			id: 'project_analysis',
			name: 'Project Analysis',
			description: 'Assess overall project health, scope, and progress',
			detailedDescription:
				"Coming soon: Get insights into your project's current state, identify risks, and receive recommendations for improvement.",
			enabled: false,
			available: false,
			icon: 'chart'
		},
		{
			id: 'completion_score',
			name: 'Completion Score',
			description: 'Calculate the likelihood of project success',
			detailedDescription:
				"Coming soon: AI-powered scoring that predicts your project's success probability based on current progress and patterns.",
			enabled: false,
			available: false,
			icon: 'target'
		},
		{
			id: 'thought_partner',
			name: 'AI Thought Partner',
			description: 'Get AI-powered research and strategic suggestions',
			detailedDescription:
				'Coming soon: Advanced AI agent that conducts background research and provides strategic recommendations.',
			enabled: false,
			available: false,
			icon: 'users'
		}
	];

	function toggleConfig(optionId: string) {
		if (expandedConfigs.has(optionId)) {
			expandedConfigs.delete(optionId);
		} else {
			expandedConfigs.add(optionId);
		}
		expandedConfigs = new Set(expandedConfigs); // Trigger reactivity
	}

	function toggleOption(option: SynthesisOption) {
		if (option.available) {
			option.enabled = !option.enabled;
			options = [...options]; // Trigger reactivity
		}
	}

	function handleConfirm() {
		const selectedModules = options
			.filter((opt) => opt.enabled && opt.available)
			.map((opt) => opt.id);

		const synthesisOptions: SynthesisOptions = {
			selectedModules,
			config: {
				task_synthesis: taskSynthesisConfig
			}
		};

		onConfirm(synthesisOptions);
		onClose();
	}

	function handleConfigUpdate(newConfig: TaskSynthesisConfigType) {
		taskSynthesisConfig = newConfig;
		// Update the config in options array
		const taskOption = options.find((opt) => opt.id === 'task_synthesis');
		if (taskOption) {
			taskOption.config = newConfig;
			options = [...options];
		}
	}

	$: hasSelectedOptions = options.some((opt) => opt.enabled && opt.available);
	$: selectedCount = options.filter((opt) => opt.enabled && opt.available).length;
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-[100] overflow-y-auto"
		transition:fade={{ duration: 200 }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="synthesis-modal-title"
	>
		<!-- Backdrop -->
		<div
			class="fixed inset-0 bg-gray-900/50 dark:bg-gray-900/70 backdrop-blur-sm"
			onclick={onClose}
			onkeydown={(e) => e.key === 'Escape' && onClose()}
			role="button"
			tabindex="0"
			aria-label="Close modal"
		></div>

		<!-- Modal -->
		<div class="relative min-h-screen flex items-center justify-center p-4">
			<div
				class="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
				transition:fade={{ duration: 200, delay: 50 }}
			>
				<!-- Header -->
				<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-3">
							<div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
								<Sparkles class="w-6 h-6 text-blue-600 dark:text-blue-400" />
							</div>
							<div>
								<h2
									id="synthesis-modal-title"
									class="text-xl font-semibold text-gray-900 dark:text-white"
								>
									Select Synthesis Options
								</h2>
								<p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
									Choose which analyses to run on your project
								</p>
							</div>
						</div>
						<Button
							onclick={onClose}
							class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
							aria-label="Close"
						>
							<X class="w-5 h-5 text-gray-500 dark:text-gray-400" />
						</Button>
					</div>
				</div>

				<!-- Content -->
				<div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
					{#each options as option (option.id)}
						<div
							class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-all duration-200"
							class:opacity-50={!option.available}
							class:cursor-not-allowed={!option.available}
						>
							<!-- Option Header -->
							<div
								class="p-4 {option.enabled && option.available
									? 'bg-blue-50 dark:bg-blue-900/20'
									: 'bg-white dark:bg-gray-800'}"
								class:hover:bg-gray-50={option.available && !option.enabled}
								class:dark:hover:bg-gray-700={option.available && !option.enabled}
							>
								<div class="flex items-start space-x-3">
									<!-- Checkbox -->
									<div class="pt-0.5">
										<Button
											onclick={() => toggleOption(option)}
											disabled={!option.available}
											class="w-5 h-5 rounded border-2 flex items-center justify-center transition-all
												{option.enabled && option.available
												? 'bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500'
												: 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}"
											aria-label={`Toggle ${option.name}`}
										>
											{#if option.enabled && option.available}
												<Check class="w-3 h-3 text-white" />
											{/if}
										</Button>
									</div>

									<!-- Content -->
									<div class="flex-1">
										<div class="flex items-center justify-between">
											<div>
												<h3
													class="font-medium text-gray-900 dark:text-white flex items-center space-x-2"
												>
													<span>{option.name}</span>
													{#if !option.available}
														<span
															class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full"
														>
															Coming Soon
														</span>
													{/if}
												</h3>
												<p
													class="text-sm text-gray-600 dark:text-gray-400 mt-1"
												>
													{option.description}
												</p>
											</div>

											{#if option.available && option.enabled}
												<button
													onclick={() => toggleConfig(option.id)}
													class="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
													aria-label={expandedConfigs.has(option.id)
														? 'Collapse configuration'
														: 'Expand configuration'}
												>
													{#if expandedConfigs.has(option.id)}
														<ChevronUp
															class="w-5 h-5 text-blue-600 dark:text-blue-400"
														/>
													{:else}
														<ChevronDown
															class="w-5 h-5 text-blue-600 dark:text-blue-400"
														/>
													{/if}
												</button>
											{/if}
										</div>

										<!-- Detailed Description -->
										{#if option.available && option.detailedDescription}
											<div
												class="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
											>
												<div class="flex items-start space-x-2">
													<Info
														class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0"
													/>
													<div
														class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line"
													>
														{option.detailedDescription}
													</div>
												</div>
											</div>
										{/if}
									</div>
								</div>
							</div>

							<!-- Configuration Section -->
							{#if option.available && option.enabled && option.id === 'task_synthesis' && expandedConfigs.has(option.id)}
								<div
									class="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/30"
									transition:slide={{ duration: 200 }}
								>
									<TaskSynthesisConfig
										config={taskSynthesisConfig}
										onUpdate={handleConfigUpdate}
									/>
								</div>
							{/if}
						</div>
					{/each}
				</div>

				<!-- Footer -->
				<div
					class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
				>
					<div class="flex items-center justify-between">
						<div class="text-sm text-gray-500 dark:text-gray-400">
							{#if selectedCount > 0}
								{selectedCount}
								{selectedCount === 1 ? 'analysis' : 'analyses'} selected
							{:else}
								Select at least one analysis to continue
							{/if}
						</div>
						<div class="flex items-center space-x-3">
							<Button onclick={onClose} variant="ghost" size="sm">Cancel</Button>
							<Button
								onclick={handleConfirm}
								disabled={!hasSelectedOptions}
								variant="primary"
								size="sm"
							>
								<Sparkles class="w-4 h-4 mr-2" />
								Generate Synthesis
							</Button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Custom scrollbar for the modal content */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgba(156, 163, 175, 0.5);
		border-radius: 3px;
	}

	.dark .overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgba(75, 85, 99, 0.5);
	}
</style>
