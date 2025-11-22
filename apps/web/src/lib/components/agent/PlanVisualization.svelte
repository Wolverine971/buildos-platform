<!-- apps/web/src/lib/components/agent/PlanVisualization.svelte -->
<!--
  PlanVisualization Component

  Enhanced visualization for agent-created plans with:
  - Progress tracking
  - Step dependencies
  - Tool indicators
  - Real-time status updates

  BuildOS Style: High-end Apple-inspired with responsive design and dark mode
-->

<script lang="ts">
	import type { AgentPlan, AgentPlanStep } from '@buildos/shared-types';
	import {
		CheckCircle2,
		Circle,
		Clock,
		AlertCircle,
		Wrench,
		GitBranch,
		Zap,
		ChevronDown,
		Loader2
	} from 'lucide-svelte';

	interface Props {
		plan: AgentPlan;
		currentStep?: number;
		isCollapsed?: boolean;
		onToggle?: () => void;
	}

	let { plan, currentStep, isCollapsed = false, onToggle }: Props = $props();

	// Calculate progress
	const completedSteps = $derived(plan.steps.filter((s) => s.status === 'completed').length);
	const progressPercent = $derived(
		plan.steps.length > 0 ? (completedSteps / plan.steps.length) * 100 : 0
	);

	// Extract unique tools
	const uniqueTools = $derived([...new Set(plan.steps.flatMap((s) => s.tools || []))]);

	// Check for dependencies
	const hasDependencies = $derived(plan.steps.some((s) => s.dependsOn && s.dependsOn.length > 0));

	// Check if any executors are required
	const hasExecutors = $derived(plan.steps.some((s) => s.executorRequired));

	// Count executing steps
	const executingSteps = $derived(plan.steps.filter((s) => s.status === 'executing').length);

	// Helper: Get step icon component
	function getStepIcon(step: AgentPlanStep) {
		switch (step.status) {
			case 'completed':
				return CheckCircle2;
			case 'executing':
				return Loader2;
			case 'failed':
				return AlertCircle;
			default:
				return Circle;
		}
	}

	// Helper: Get step color classes
	function getStepColor(status: string) {
		switch (status) {
			case 'completed':
				return 'text-emerald-500 dark:text-emerald-400';
			case 'executing':
				return 'text-blue-500 dark:text-blue-400';
			case 'failed':
				return 'text-red-500 dark:text-red-400';
			default:
				return 'text-slate-400 dark:text-slate-500';
		}
	}

	// Helper: Format tool names for display
	function formatToolName(tool: string): string {
		const toolNameMap: Record<string, string> = {
			create_onto_task: '📝 Create',
			update_onto_task: '✏️ Update',
			delete_onto_task: '🗑️ Delete',
			search_tasks: '🔍 Search',
			schedule_task: '📅 Schedule',
			get_calendar_events: '📆 Calendar',
			create_onto_plan: '📋 Plan',
			update_onto_plan: '📋 Update',
			create_onto_goal: '🎯 Goal',
			fetch_project_data: '📁 Project'
			// Add more mappings as needed
		};
		return toolNameMap[tool] || tool.replace(/_/g, ' ');
	}

	// Helper: Format duration for display
	function formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		if (minutes > 0) return `${minutes}m`;
		return `${seconds}s`;
	}

	// Helper: Format step result for preview
	function formatResult(result: any): string {
		if (!result) return '';
		if (typeof result === 'string') return result;
		if (result.message) return result.message;
		if (result.success !== undefined) {
			return result.success ? 'Success' : 'Failed';
		}
		if (result.name) return `Created: ${result.name}`;
		if (result.id) return `ID: ${result.id}`;
		return 'Completed';
	}

	// Helper: Get step type badge color
	function getStepTypeColor(type: string): string {
		const typeColors: Record<string, string> = {
			search: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
			create: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
			update: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
			delete: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
			schedule: 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
			analyze: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
		};

		// Find matching type
		const typeKey = Object.keys(typeColors).find((key) => type.toLowerCase().includes(key));

		return (
			typeColors[typeKey || ''] ||
			'bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
		);
	}

	// Format step type for display
	function formatStepType(type: string): string {
		return type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
	}
</script>

<div
	class="plan-visualization rounded-lg border border-purple-200/60 bg-gradient-to-br from-purple-50/50 to-blue-50/50 dither-gradient p-3 shadow-sm dark:border-purple-800/40 dark:from-purple-950/20 dark:to-blue-950/20"
>
	<!-- Collapsible Header -->
	<button
		onclick={onToggle}
		class="w-full space-y-2 text-left focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1 rounded-md"
		aria-expanded={!isCollapsed}
		aria-label={isCollapsed ? 'Expand plan details' : 'Collapse plan details'}
	>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<ChevronDown
					class="h-4 w-4 transition-transform duration-200 {isCollapsed
						? '-rotate-90'
						: ''}"
					aria-hidden="true"
				/>
				<span class="text-base" aria-hidden="true">📋</span>
				<span class="font-semibold text-slate-900 dark:text-white">Execution Plan</span>
				<span class="text-xs text-slate-600 dark:text-slate-400">
					{completedSteps}/{plan.steps.length} steps
				</span>
			</div>

			{#if executingSteps > 0}
				<div class="flex items-center gap-1.5">
					<Loader2 class="h-3 w-3 animate-spin text-blue-500" aria-label="Executing" />
					<span class="text-xs font-medium text-blue-600 dark:text-blue-400">
						Executing...
					</span>
				</div>
			{/if}
		</div>

		<!-- Progress Bar -->
		{#if plan.steps.length > 0}
			<div class="mt-2">
				<div
					class="h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/50"
				>
					<div
						class="h-full rounded-full bg-gradient-to-r from-purple-500 to-blue-500 dither-soft transition-all duration-500 ease-out"
						style="width: {progressPercent}%"
						role="progressbar"
						aria-valuenow={progressPercent}
						aria-valuemin="0"
						aria-valuemax="100"
						aria-label="Plan progress"
					></div>
				</div>
			</div>
		{/if}

		<!-- Metadata Pills -->
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#if plan.metadata?.estimatedDuration}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-purple-700 shadow-sm dark:bg-purple-900/50 dark:text-purple-300"
				>
					<Clock class="h-3 w-3" aria-hidden="true" />
					~{formatDuration(plan.metadata.estimatedDuration)}
				</span>
			{/if}

			{#if hasDependencies}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-orange-700 shadow-sm dark:bg-orange-900/50 dark:text-orange-300"
				>
					<GitBranch class="h-3 w-3" aria-hidden="true" />
					Dependencies
				</span>
			{/if}

			{#if uniqueTools.length > 0}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-blue-700 shadow-sm dark:bg-blue-900/50 dark:text-blue-300"
				>
					<Wrench class="h-3 w-3" aria-hidden="true" />
					{uniqueTools.length}
					{uniqueTools.length === 1 ? 'tool' : 'tools'}
				</span>
			{/if}

			{#if hasExecutors}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-teal-700 shadow-sm dark:bg-teal-900/50 dark:text-teal-300"
				>
					<Zap class="h-3 w-3" aria-hidden="true" />
					Executors
				</span>
			{/if}
		</div>
	</button>

	<!-- Expandable Step Details -->
	{#if !isCollapsed && plan.steps.length > 0}
		<div class="mt-3 space-y-2" role="list" aria-label="Plan steps">
			{#each plan.steps as step, i (step.stepNumber)}
				{@const Icon = getStepIcon(step)}
				{@const isActive = currentStep === step.stepNumber}
				{@const isExecuting = step.status === 'executing'}

				<div
					class="relative pl-7 transition-all duration-300 {isActive
						? 'scale-[1.01]'
						: ''}"
					role="listitem"
					aria-current={isActive ? 'step' : undefined}
				>
					<!-- Step Connector Line -->
					{#if i > 0}
						<div
							class="absolute left-3 top-0 -mt-2 h-2 w-0.5 {step.dependsOn?.includes(
								plan.steps[i - 1].stepNumber
							)
								? 'bg-gradient-to-b from-orange-400 to-purple-400 dither-subtle dark:from-orange-600 dark:to-purple-600'
								: 'bg-gradient-to-b from-purple-300 to-blue-300 dither-subtle dark:from-purple-700 dark:to-blue-700'}"
							aria-hidden="true"
						></div>
					{/if}

					<!-- Step Icon -->
					<div class="absolute left-1 top-2">
						<Icon
							class="h-4 w-4 {getStepColor(step.status)} {isExecuting
								? 'animate-spin'
								: ''}"
							aria-label={step.status}
						/>
					</div>

					<!-- Step Content -->
					<div
						class="rounded-md bg-white/60 p-2 shadow-sm dark:bg-slate-900/60 {isActive
							? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-blue-400 dark:ring-offset-slate-900'
							: ''} {step.status === 'completed' ? 'opacity-75' : ''}"
					>
						<div class="flex flex-wrap items-center gap-2">
							<span
								class="text-xs font-semibold text-purple-900 dark:text-purple-100"
							>
								Step {step.stepNumber}
							</span>
							<span
								class="rounded px-1.5 py-0.5 text-[10px] font-mono {getStepTypeColor(
									step.type
								)}"
							>
								{formatStepType(step.type)}
							</span>
							{#if step.executorRequired}
								<span
									class="text-[10px] text-teal-600 dark:text-teal-400"
									title="Requires executor"
								>
									<Zap class="inline h-3 w-3" aria-hidden="true" />
								</span>
							{/if}
						</div>

						<div
							class="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300"
						>
							{step.description}
						</div>

						<!-- Tools Required -->
						{#if step.tools && step.tools.length > 0}
							<div
								class="mt-1.5 flex flex-wrap gap-1"
								role="list"
								aria-label="Required tools"
							>
								{#each step.tools as tool}
									<span
										class="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-mono text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
										title={tool}
										role="listitem"
									>
										{formatToolName(tool)}
									</span>
								{/each}
							</div>
						{/if}

						<!-- Dependencies -->
						{#if step.dependsOn && step.dependsOn.length > 0}
							<div
								class="mt-1 text-[10px] italic text-orange-600 dark:text-orange-400"
							>
								Depends on: {step.dependsOn.map((d) => `Step ${d}`).join(', ')}
							</div>
						{/if}

						<!-- Error Display -->
						{#if step.error}
							<div
								class="mt-1.5 flex items-start gap-1 rounded bg-red-100 p-1.5 text-[10px] text-red-700 dark:bg-red-900/30 dark:text-red-300"
								role="alert"
							>
								<AlertCircle class="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
								<span>{step.error}</span>
							</div>
						{/if}

						<!-- Result Preview (if completed) -->
						{#if step.result && step.status === 'completed'}
							<div
								class="mt-1 rounded bg-emerald-100 p-1 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
							>
								✓ {formatResult(step.result)}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else if !isCollapsed && plan.steps.length === 0}
		<div
			class="mt-3 rounded-md bg-slate-100 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400"
		>
			No steps defined for this plan
		</div>
	{/if}
</div>

<style>
	/* Shimmer effect for progress bar */
	@keyframes shimmer {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.8;
		}
	}

	/* Pulse effect for active step ring */
	@keyframes pulse-ring {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
		}
		50% {
			box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
		}
	}

	/* Apply animations */
	.plan-visualization :global(.h-full.rounded-full.bg-gradient-to-r) {
		animation: shimmer 2s ease-in-out infinite;
	}

	.plan-visualization :global(.ring-2.ring-blue-500) {
		animation: pulse-ring 2s ease-in-out infinite;
	}
</style>
