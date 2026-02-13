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
	<h4 class="text-sm font-medium text-foreground flex items-center space-x-2">
		<Settings class="w-4 h-4" />
		<span>Configure Task Synthesis</span>
	</h4>

	<!-- Consolidation Settings -->
	<div class="space-y-3">
		<div class="flex items-start space-x-3">
			<GitMerge class="w-4 h-4 text-muted-foreground mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<div class="text-sm font-medium text-foreground">Task Consolidation</div>
					<input
						type="checkbox"
						checked={config.consolidation.enabled}
						onchange={() => toggleFeature('consolidation', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.consolidation.enabled}
					<div class="pl-4 space-y-2">
						<div>
							<div class="text-xs text-muted-foreground">
								Consolidation Aggressiveness
							</div>
							<select
								value={config.consolidation.aggressiveness}
								onchange={(e) =>
									updateSetting(
										'consolidation',
										'aggressiveness',
										e.currentTarget.value
									)}
								class="mt-1 block w-full text-sm border-border rounded-md
									bg-card text-foreground
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
								onchange={() => toggleFeature('consolidation', 'preserveDetails')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
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
			<Layers class="w-4 h-4 text-muted-foreground mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<div class="text-sm font-medium text-foreground">Task Sequencing</div>
					<input
						type="checkbox"
						checked={config.sequencing.enabled}
						onchange={() => toggleFeature('sequencing', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.sequencing.enabled}
					<div class="pl-4 space-y-2">
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.sequencing.considerDependencies}
								onchange={() => toggleFeature('sequencing', 'considerDependencies')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
								Consider task dependencies
							</span>
						</label>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.sequencing.optimizeForParallel}
								onchange={() => toggleFeature('sequencing', 'optimizeForParallel')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
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
			<Clock class="w-4 h-4 text-muted-foreground mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<div class="text-sm font-medium text-foreground">Time Estimation</div>
					<input
						type="checkbox"
						checked={config.timeEstimation.enabled}
						onchange={() => toggleFeature('timeEstimation', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.timeEstimation.enabled}
					<div class="pl-4 space-y-2">
						<div>
							<div class="text-xs text-muted-foreground">Confidence Level</div>
							<select
								value={config.timeEstimation.confidenceLevel}
								onchange={(e) =>
									updateSetting(
										'timeEstimation',
										'confidenceLevel',
										e.currentTarget.value
									)}
								class="mt-1 block w-full text-sm border-border rounded-md
									bg-card text-foreground
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
								onchange={() =>
									toggleFeature('timeEstimation', 'includeBufferTime')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
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
			<Search class="w-4 h-4 text-muted-foreground mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<div class="text-sm font-medium text-foreground">Gap Analysis</div>
					<input
						id="gap-analysis-enabled"
						type="checkbox"
						checked={config.gapAnalysis.enabled}
						onchange={() => toggleFeature('gapAnalysis', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.gapAnalysis.enabled}
					<div class="pl-4 space-y-2">
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.gapAnalysis.includePrerequisites}
								onchange={() =>
									toggleFeature('gapAnalysis', 'includePrerequisites')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
								Identify missing prerequisites
							</span>
						</label>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.gapAnalysis.includeFollowUps}
								onchange={() => toggleFeature('gapAnalysis', 'includeFollowUps')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
								Suggest follow-up tasks
							</span>
						</label>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.gapAnalysis.suggestMilestones}
								onchange={() => toggleFeature('gapAnalysis', 'suggestMilestones')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
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
			<Link class="w-4 h-4 text-muted-foreground mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<div class="text-sm font-medium text-foreground">Task Dependencies</div>
					<input
						type="checkbox"
						checked={config.dependencies.enabled}
						onchange={() => toggleFeature('dependencies', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.dependencies.enabled}
					<div class="pl-4 space-y-2">
						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.dependencies.autoDetect}
								onchange={() => toggleFeature('dependencies', 'autoDetect')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
								Auto-detect dependencies from task descriptions
							</span>
						</label>

						<label class="flex items-center space-x-2">
							<input
								type="checkbox"
								checked={config.dependencies.strictMode}
								onchange={() => toggleFeature('dependencies', 'strictMode')}
								class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
							/>
							<span class="text-xs text-muted-foreground">
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
			<Layers class="w-4 h-4 text-muted-foreground mt-1" />
			<div class="flex-1 space-y-2">
				<div class="flex items-center justify-between">
					<div class="text-sm font-medium text-foreground">Task Grouping</div>
					<input
						type="checkbox"
						checked={config.grouping.enabled}
						onchange={() => toggleFeature('grouping', 'enabled')}
						class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
					/>
				</div>

				{#if config.grouping.enabled}
					<div class="pl-4 space-y-2">
						<div>
							<div class="text-xs text-muted-foreground">Grouping Strategy</div>
							<select
								value={config.grouping.strategy}
								onchange={(e) =>
									updateSetting('grouping', 'strategy', e.currentTarget.value)}
								class="mt-1 block w-full text-sm border-border rounded-md
									bg-card text-foreground
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
							<div class="text-xs text-muted-foreground">
								Maximum Group Size: {config.grouping.maxGroupSize}
							</div>
							<input
								type="range"
								min="2"
								max="10"
								value={config.grouping.maxGroupSize}
								oninput={(e) =>
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
