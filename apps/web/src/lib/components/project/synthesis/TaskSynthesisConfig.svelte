<!-- apps/web/src/lib/components/project/synthesis/TaskSynthesisConfig.svelte -->
<script lang="ts">
	import { Settings, Layers, Clock, Link, Search, GitMerge } from 'lucide-svelte';
	import type { TaskSynthesisConfig } from '$lib/types/synthesis';

	export let config: TaskSynthesisConfig;
	export let onUpdate: (config: TaskSynthesisConfig) => void;

	function updateConfig() {
		onUpdate(config);
	}

	function toggleFeature(category: keyof TaskSynthesisConfig, feature: string) {
		config[category][feature] = !config[category][feature];
		config = { ...config }; // Trigger reactivity
		updateConfig();
	}

	function updateSetting(category: keyof TaskSynthesisConfig, setting: string, value: any) {
		config[category][setting] = value;
		config = { ...config }; // Trigger reactivity
		updateConfig();
	}
</script>

<div class="space-y-4">
	<h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center space-x-2">
		<Settings class="w-4 h-4" />
		<span>Configure Task Synthesis</span>
	</h4>

	<!-- Consolidation Settings -->
	<div class="space-y-3">
		<div class="flex items-start space-x-3">
			<GitMerge class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
						Task Consolidation
					</label>
					<input
						type="checkbox"
						checked={config.consolidation.enabled}
						on:change={() => toggleFeature('consolidation', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.consolidation.enabled}
					<div class="pl-4 space-y-2">
						<div>
							<label class="text-xs text-gray-600 dark:text-gray-400">
								Consolidation Aggressiveness
							</label>
							<select
								value={config.consolidation.aggressiveness}
								on:change={(e) =>
									updateSetting(
										'consolidation',
										'aggressiveness',
										e.currentTarget.value
									)}
								class="mt-1 block w-full text-sm border-gray-300 dark:border-gray-600 rounded-md
									bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
									focus:ring-blue-500 focus:border-blue-500"
							>
								<option value="conservative"
									>Conservative - Only exact duplicates</option
								>
								<option value="moderate"
									>Moderate - Similar tasks (>70% overlap)</option
								>
								<option value="aggressive">Aggressive - Any related tasks</option>
							</select>
						</div>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.consolidation.preserveDetails}
								on:change={() => toggleFeature('consolidation', 'preserveDetails')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Preserve all task details when consolidating
							</span>
						</label>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Sequencing Settings -->
	<div class="space-y-3">
		<div class="flex items-start space-x-3">
			<Layers class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
						Task Sequencing
					</label>
					<input
						type="checkbox"
						checked={config.sequencing.enabled}
						on:change={() => toggleFeature('sequencing', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.sequencing.enabled}
					<div class="pl-4 space-y-2">
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.sequencing.considerDependencies}
								on:change={() =>
									toggleFeature('sequencing', 'considerDependencies')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Consider task dependencies
							</span>
						</label>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.sequencing.optimizeForParallel}
								on:change={() => toggleFeature('sequencing', 'optimizeForParallel')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Optimize for parallel execution
							</span>
						</label>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Time Estimation Settings -->
	<div class="space-y-3">
		<div class="flex items-start space-x-3">
			<Clock class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
						Time Estimation
					</label>
					<input
						type="checkbox"
						checked={config.timeEstimation.enabled}
						on:change={() => toggleFeature('timeEstimation', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.timeEstimation.enabled}
					<div class="pl-4 space-y-2">
						<div>
							<label class="text-xs text-gray-600 dark:text-gray-400">
								Confidence Level
							</label>
							<select
								value={config.timeEstimation.confidenceLevel}
								on:change={(e) =>
									updateSetting(
										'timeEstimation',
										'confidenceLevel',
										e.currentTarget.value
									)}
								class="mt-1 block w-full text-sm border-gray-300 dark:border-gray-600 rounded-md
									bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
									focus:ring-blue-500 focus:border-blue-500"
							>
								<option value="optimistic">Optimistic - Best case scenario</option>
								<option value="realistic">Realistic - Balanced estimate</option>
								<option value="conservative"
									>Conservative - Include contingency</option
								>
							</select>
						</div>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.timeEstimation.includeBufferTime}
								on:change={() =>
									toggleFeature('timeEstimation', 'includeBufferTime')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Include buffer time between tasks
							</span>
						</label>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Gap Analysis Settings -->
	<div class="space-y-3">
		<div class="flex items-start space-x-3">
			<Search class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
						Gap Analysis
					</label>
					<input
						type="checkbox"
						checked={config.gapAnalysis.enabled}
						on:change={() => toggleFeature('gapAnalysis', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.gapAnalysis.enabled}
					<div class="pl-4 space-y-2">
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.gapAnalysis.includePrerequisites}
								on:change={() =>
									toggleFeature('gapAnalysis', 'includePrerequisites')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Identify missing prerequisites
							</span>
						</label>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.gapAnalysis.includeFollowUps}
								on:change={() => toggleFeature('gapAnalysis', 'includeFollowUps')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Suggest follow-up tasks
							</span>
						</label>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.gapAnalysis.suggestMilestones}
								on:change={() => toggleFeature('gapAnalysis', 'suggestMilestones')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Suggest project milestones
							</span>
						</label>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Dependencies Settings -->
	<div class="space-y-3">
		<div class="flex items-start space-x-3">
			<Link class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
						Task Dependencies
					</label>
					<input
						type="checkbox"
						checked={config.dependencies.enabled}
						on:change={() => toggleFeature('dependencies', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.dependencies.enabled}
					<div class="pl-4 space-y-2">
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.dependencies.autoDetect}
								on:change={() => toggleFeature('dependencies', 'autoDetect')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Auto-detect dependencies from task descriptions
							</span>
						</label>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.dependencies.strictMode}
								on:change={() => toggleFeature('dependencies', 'strictMode')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-gray-600 dark:text-gray-400">
								Enforce strict dependency chains
							</span>
						</label>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Grouping Settings -->
	<div class="space-y-3">
		<div class="flex items-start space-x-3">
			<Layers class="w-4 h-4 text-gray-400 dark:text-gray-500 mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
						Task Grouping
					</label>
					<input
						type="checkbox"
						checked={config.grouping.enabled}
						on:change={() => toggleFeature('grouping', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.grouping.enabled}
					<div class="pl-4 space-y-2">
						<div>
							<label class="text-xs text-gray-600 dark:text-gray-400">
								Grouping Strategy
							</label>
							<select
								value={config.grouping.strategy}
								on:change={(e) =>
									updateSetting('grouping', 'strategy', e.currentTarget.value)}
								class="mt-1 block w-full text-sm border-gray-300 dark:border-gray-600 rounded-md
									bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
									focus:ring-blue-500 focus:border-blue-500"
							>
								<option value="automatic"
									>Automatic - AI determines best grouping</option
								>
								<option value="theme">By Theme - Similar topics</option>
								<option value="resource">By Resource - Same tools/people</option>
								<option value="timeline">By Timeline - Temporal proximity</option>
							</select>
						</div>

						<div>
							<label class="text-xs text-gray-600 dark:text-gray-400">
								Maximum Group Size: {config.grouping.maxGroupSize}
							</label>
							<input
								type="range"
								min="2"
								max="10"
								value={config.grouping.maxGroupSize}
								on:input={(e) =>
									updateSetting(
										'grouping',
										'maxGroupSize',
										parseInt(e.currentTarget.value)
									)}
								class="mt-1 w-full"
							/>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	input[type='checkbox'] {
		cursor: pointer;
	}

	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	input[type='range']::-webkit-slider-track {
		background: #e5e7eb;
		height: 4px;
		border-radius: 2px;
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		background: #3b82f6;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		margin-top: -6px;
	}

	.dark input[type='range']::-webkit-slider-track {
		background: #4b5563;
	}

	.dark input[type='range']::-webkit-slider-thumb {
		background: #60a5fa;
	}

	select {
		cursor: pointer;
		padding: 0.25rem 0.5rem;
	}
</style>
