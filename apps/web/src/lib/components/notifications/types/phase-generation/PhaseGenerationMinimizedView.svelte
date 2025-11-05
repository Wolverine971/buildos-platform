<!-- apps/web/src/lib/components/notifications/types/phase-generation/PhaseGenerationMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { Loader2, CheckCircle, AlertCircle, Sparkles, Repeat2 } from 'lucide-svelte';
	import type { PhaseGenerationNotification, StepsProgress } from '$lib/types/notification.types';

	let { notification } = $props<{ notification: PhaseGenerationNotification }>();

	const STRATEGY_LABELS: Record<
		PhaseGenerationNotification['data']['strategy'],
		{ label: string; description: string }
	> = {
		'phases-only': {
			label: 'Organize tasks into phases',
			description: 'Focus on grouping tasks'
		},
		'schedule-in-phases': {
			label: 'Schedule within phases',
			description: 'Balance workload inside each phase'
		},
		'calendar-optimized': {
			label: 'Optimize around calendar',
			description: 'Respects meetings & availability'
		}
	};

	let stepsProgress = $derived(
		notification.progress?.type === 'steps' ? (notification.progress as StepsProgress) : null
	);

	function resolveActiveStep() {
		if (!stepsProgress) return null;
		const index = Math.min(stepsProgress.currentStep, stepsProgress.steps.length - 1);
		return stepsProgress.steps[index] ?? null;
	}

	let activeStep = $derived(resolveActiveStep());

	let completedStepsCount = $derived(
		stepsProgress ? stepsProgress.steps.filter((step) => step.status === 'completed').length : 0
	);

	let totalSteps = $derived(stepsProgress ? stepsProgress.totalSteps : 0);

	function computeProgressPercent() {
		if (!stepsProgress || totalSteps === 0) {
			return null;
		}
		if (notification.status === 'success') {
			return 100;
		}
		if (notification.status === 'error') {
			return Math.round((completedStepsCount / totalSteps) * 100);
		}
		const activeContribution = activeStep ? 1 : 0;
		return Math.min(
			100,
			Math.round(((completedStepsCount + activeContribution * 0.6) / totalSteps) * 100)
		);
	}

	let progressPercent = $derived(computeProgressPercent());

	let statusIcon = $derived(
		notification.status === 'success'
			? CheckCircle
			: notification.status === 'error'
				? AlertCircle
				: Loader2
	);

	let statusIconClasses = $derived(
		notification.status === 'success'
			? 'text-green-600 dark:text-green-400'
			: notification.status === 'error'
				? 'text-red-600 dark:text-red-400'
				: 'text-blue-600 dark:text-blue-400'
	);

	const strategyMeta = STRATEGY_LABELS[notification.data.strategy];
</script>

<div class="p-4 space-y-3">
	<div class="flex items-start gap-3">
		<div class="flex-shrink-0">
			{@const StatusIcon = statusIcon}
			<StatusIcon
				class={`w-5 h-5 ${
					notification.status === 'processing' ? 'animate-spin' : ''
				} ${statusIconClasses}`}
			/>
		</div>

		<div class="flex-1 min-w-0 space-y-1">
			<div class="flex items-center gap-2">
				<p class="text-sm font-medium text-gray-900 dark:text-white truncate">
					{notification.data.projectName}
				</p>
				{#if notification.data.isRegeneration}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-500/20 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-200"
					>
						<Repeat2 class="h-3 w-3" />
						Regeneration
					</span>
				{/if}
			</div>

			{#if strategyMeta}
				<p
					class="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1"
				>
					<Sparkles class="h-3 w-3 text-amber-500" />
					{strategyMeta.label}
				</p>
			{/if}

			{#if notification.status === 'error' && notification.data.error}
				<p class="text-xs text-red-600 dark:text-red-400 line-clamp-2">
					{notification.data.error}
				</p>
			{:else if activeStep}
				<p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
					{activeStep.message || activeStep.name}
				</p>
			{/if}
		</div>
	</div>

	{#if stepsProgress && totalSteps > 0}
		<div class="space-y-1">
			<div
				class="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-400"
			>
				<span>
					Step {Math.min(stepsProgress.currentStep + 1, totalSteps)} of {totalSteps}
				</span>
				{#if notification.status === 'success'}
					<span class="text-green-600 dark:text-green-400">Completed</span>
				{:else if notification.status === 'error'}
					<span class="text-red-500">Needs attention</span>
				{:else}
					<span class="text-gray-400">
						{Math.max(progressPercent ?? 0, 5)}%
					</span>
				{/if}
			</div>
			<div class="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
				<div
					class="h-full rounded-full transition-all duration-500 {notification.status ===
					'error'
						? 'bg-red-500'
						: 'bg-blue-600 dark:bg-blue-400'}"
					style={`width: ${notification.status === 'success' ? 100 : (progressPercent ?? 10)}%`}
				></div>
			</div>
		</div>
	{/if}

	<div class="flex items-center justify-between text-[11px] text-gray-400">
		<span>
			{notification.data.taskCount}
			&nbsp;task{notification.data.taskCount === 1 ? '' : 's'} selected
		</span>
		<span class="capitalize">{notification.status}</span>
	</div>
</div>
