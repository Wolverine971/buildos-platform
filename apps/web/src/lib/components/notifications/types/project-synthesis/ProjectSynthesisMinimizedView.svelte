<!-- apps/web/src/lib/components/notifications/types/project-synthesis/ProjectSynthesisMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { Sparkles, CheckCircle, AlertCircle, LoaderCircle, Lightbulb } from 'lucide-svelte';
	import type {
		ProjectSynthesisNotification,
		StepsProgress
	} from '$lib/types/notification.types';

	let { notification }: { notification: ProjectSynthesisNotification } = $props();

	// Module metadata for display
	const MODULE_METADATA: Record<string, { name: string; shortLabel: string }> = {
		task_synthesis: {
			name: 'Task Synthesis',
			shortLabel: 'Tasks'
		},
		project_analysis: {
			name: 'Project Analysis',
			shortLabel: 'Analysis'
		},
		completion_score: {
			name: 'Completion Score',
			shortLabel: 'Score'
		},
		thought_partner: {
			name: 'Thought Partner',
			shortLabel: 'Insights'
		}
	};

	const stepsProgress = $derived(
		notification.progress?.type === 'steps' ? (notification.progress as StepsProgress) : null
	);

	const currentStepName = $derived(
		stepsProgress?.steps[stepsProgress.currentStep]?.name ?? 'Processing'
	);

	const progressPercentage = $derived(
		stepsProgress
			? Math.round(((stepsProgress.currentStep + 1) / stepsProgress.totalSteps) * 100)
			: 0
	);

	const moduleLabels = $derived(
		notification.data.selectedModules
			.map((m) => MODULE_METADATA[m]?.shortLabel ?? m)
			.join(' • ')
	);

	const result = $derived(notification.data.result);
</script>

<div class="flex items-start gap-3">
	<!-- Icon -->
	<div class="flex-shrink-0 mt-1">
		{#if notification.status === 'success'}
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
			>
				<CheckCircle class="w-5 h-5 text-green-600 dark:text-green-400" />
			</div>
		{:else if notification.status === 'error'}
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
			>
				<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400" />
			</div>
		{:else}
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30"
			>
				<LoaderCircle class="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
			</div>
		{/if}
	</div>

	<!-- Content -->
	<div class="flex-1 min-w-0">
		<!-- Header -->
		<div class="flex items-center gap-2 mb-1">
			<Sparkles class="w-4 h-4 text-purple-500 dark:text-purple-400" />
			<h4 class="font-medium text-sm truncate text-foreground">
				{notification.status === 'success' ? 'Synthesis Complete' : 'Project Synthesis'}
				<span class="text-muted-foreground">—</span>
				<span class="text-foreground">{notification.data.projectName}</span
				>
			</h4>
		</div>

		<!-- Processing state -->
		{#if notification.status === 'processing'}
			<p class="text-xs text-muted-foreground mb-2">
				{currentStepName} • Step {stepsProgress?.currentStep + 1} of {stepsProgress?.totalSteps}
			</p>

			<!-- Progress bar -->
			<div class="w-full bg-muted rounded-full h-1.5 mb-2">
				<div
					class="bg-blue-600 dark:bg-blue-500 h-1.5 rounded-full transition-all duration-300"
					style="width: {progressPercentage}%"
				></div>
			</div>

			<p class="text-xs text-muted-foreground">
				Modules: {moduleLabels}
			</p>

			<!-- Success state -->
		{:else if notification.status === 'success' && result}
			<p class="text-xs text-muted-foreground mb-2">
				Found {result.operationsCount} optimization{result.operationsCount === 1 ? '' : 's'}
				across {notification.data.taskCount} tasks
			</p>

			<div class="flex items-center gap-2 flex-wrap mb-2">
				{#if result.consolidationCount > 0}
					<span
						class="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-xs font-medium"
					>
						{result.consolidationCount} Consolidation{result.consolidationCount === 1
							? ''
							: 's'}
					</span>
				{/if}
				{#if result.newTasksCount > 0}
					<span
						class="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded text-xs font-medium"
					>
						{result.newTasksCount} New
					</span>
				{/if}
				{#if result.deletionsCount > 0}
					<span
						class="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded text-xs font-medium"
					>
						{result.deletionsCount} Deletion{result.deletionsCount === 1 ? '' : 's'}
					</span>
				{/if}
			</div>

			{#if result.insights}
				<div class="flex items-start gap-1.5 mb-2">
					<Lightbulb
						class="w-3.5 h-3.5 text-yellow-500 dark:text-yellow-400 flex-shrink-0 mt-0.5"
					/>
					<p class="text-xs text-muted-foreground italic line-clamp-2">
						{result.insights.substring(0, 100)}{result.insights.length > 100
							? '...'
							: ''}
					</p>
				</div>
			{/if}

			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					notification.actions.reviewResults?.();
				}}
				class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
			>
				Review Results →
			</button>

			<!-- Error state -->
		{:else if notification.status === 'error'}
			<p class="text-xs text-red-600 dark:text-red-400 mb-1">
				{notification.data.error ?? 'Synthesis failed'}
			</p>
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					notification.actions.retry?.();
				}}
				class="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
			>
				Retry Synthesis
			</button>
		{/if}
	</div>
</div>
