<!-- apps/web/src/lib/components/agent/PlanVisualization.svelte -->
<!-- INKPRINT Design System: Plan visualization with Thread texture -->

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

	// INKPRINT: Get step color classes using semantic tokens where possible
	function getStepColor(status: string) {
		switch (status) {
			case 'completed':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'executing':
				return 'text-accent';
			case 'failed':
				return 'text-red-600 dark:text-red-400';
			default:
				return 'text-muted-foreground';
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
			list_calendar_events: '📆 Calendar',
			get_calendar_event_details: '📆 Event',
			create_calendar_event: '📆 Create',
			update_calendar_event: '📆 Update',
			delete_calendar_event: '📆 Delete',
			get_project_calendar: '📅 Calendar',
			set_project_calendar: '📅 Calendar',
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

	// INKPRINT: Get step type badge color with semantic approach
	function getStepTypeColor(type: string): string {
		const typeColors: Record<string, string> = {
			search: 'border-blue-600/30 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
			create: 'border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
			update: 'border-amber-600/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
			delete: 'border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
			schedule:
				'border-purple-600/30 bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400',
			analyze:
				'border-indigo-600/30 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400'
		};

		// Find matching type
		const typeKey = Object.keys(typeColors).find((key) => type.toLowerCase().includes(key));

		return typeColors[typeKey || ''] || 'border-border bg-muted text-muted-foreground';
	}

	// Format step type for display
	function formatStepType(type: string): string {
		return type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
	}
</script>

<!-- INKPRINT plan visualization container with Thread texture -->
<div
	class="plan-visualization rounded-lg border border-border bg-card p-3 shadow-ink tx tx-thread tx-weak"
>
	<!-- INKPRINT Collapsible Header -->
	<button
		onclick={onToggle}
		class="w-full space-y-2 text-left rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-expanded={!isCollapsed}
		aria-label={isCollapsed ? 'Expand plan details' : 'Collapse plan details'}
	>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<ChevronDown
					class="h-4 w-4 text-muted-foreground transition-transform duration-200 {isCollapsed
						? '-rotate-90'
						: ''}"
					aria-hidden="true"
				/>
				<span class="text-base" aria-hidden="true">📋</span>
				<span class="font-semibold text-foreground">Execution Plan</span>
				<span class="text-xs text-muted-foreground">
					{completedSteps}/{plan.steps.length} steps
				</span>
			</div>

			{#if executingSteps > 0}
				<div class="flex items-center gap-1.5">
					<Loader2 class="h-3 w-3 animate-spin text-accent" aria-label="Executing" />
					<span class="text-xs font-semibold text-accent"> Executing... </span>
				</div>
			{/if}
		</div>

		<!-- INKPRINT Progress Bar -->
		{#if plan.steps.length > 0}
			<div class="mt-2">
				<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full bg-accent transition-all duration-500 ease-out"
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

		<!-- INKPRINT Metadata Pills -->
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#if plan.metadata?.estimatedDuration}
				<span
					class="inline-flex items-center gap-1 rounded-lg border border-purple-600/30 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-950/30 dark:text-purple-400"
				>
					<Clock class="h-3 w-3" aria-hidden="true" />
					~{formatDuration(plan.metadata.estimatedDuration)}
				</span>
			{/if}

			{#if hasDependencies}
				<span
					class="inline-flex items-center gap-1 rounded-lg border border-amber-600/30 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
				>
					<GitBranch class="h-3 w-3" aria-hidden="true" />
					Dependencies
				</span>
			{/if}

			{#if uniqueTools.length > 0}
				<span
					class="inline-flex items-center gap-1 rounded-lg border border-blue-600/30 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
				>
					<Wrench class="h-3 w-3" aria-hidden="true" />
					{uniqueTools.length}
					{uniqueTools.length === 1 ? 'tool' : 'tools'}
				</span>
			{/if}

			{#if hasExecutors}
				<span
					class="inline-flex items-center gap-1 rounded-lg border border-teal-600/30 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-950/30 dark:text-teal-400"
				>
					<Zap class="h-3 w-3" aria-hidden="true" />
					Executors
				</span>
			{/if}
		</div>
	</button>

	<!-- INKPRINT Expandable Step Details -->
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
					<!-- INKPRINT Step Connector Line -->
					{#if i > 0}
						<div
							class="absolute left-3 top-0 -mt-2 h-2 w-0.5 {step.dependsOn?.includes(
								plan.steps[i - 1].stepNumber
							)
								? 'bg-amber-500'
								: 'bg-border'}"
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

					<!-- INKPRINT Step Content -->
					<div
						class="rounded-lg border bg-background p-2 shadow-ink-inner {isActive
							? 'border-accent ring-1 ring-accent/30'
							: 'border-border'} {step.status === 'completed' ? 'opacity-75' : ''}"
					>
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-xs font-semibold text-foreground">
								Step {step.stepNumber}
							</span>
							<span
								class="rounded-lg border px-1.5 py-0.5 text-[10px] font-mono {getStepTypeColor(
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

						<div class="mt-1 text-xs leading-relaxed text-muted-foreground">
							{step.description}
						</div>

						<!-- INKPRINT Tools Required -->
						{#if step.tools && step.tools.length > 0}
							<div
								class="mt-1.5 flex flex-wrap gap-1"
								role="list"
								aria-label="Required tools"
							>
								{#each step.tools as tool}
									<span
										class="inline-block rounded-lg border border-blue-600/30 bg-blue-50 px-2 py-0.5 text-[10px] font-mono text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
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
								class="mt-1 text-[10px] font-medium italic text-amber-600 dark:text-amber-400"
							>
								Depends on: {step.dependsOn.map((d) => `Step ${d}`).join(', ')}
							</div>
						{/if}

						<!-- INKPRINT Error Display with Static texture -->
						{#if step.error}
							<div
								class="mt-1.5 flex items-start gap-1 rounded-lg border border-red-600/30 bg-red-50 p-1.5 text-[10px] text-red-700 tx tx-static tx-weak dark:bg-red-950/20 dark:text-red-400"
								role="alert"
							>
								<AlertCircle class="h-3 w-3 shrink-0 mt-0.5" aria-hidden="true" />
								<span>{step.error}</span>
							</div>
						{/if}

						<!-- INKPRINT Result Preview (if completed) -->
						{#if step.result && step.status === 'completed'}
							<div
								class="mt-1 rounded-lg border border-emerald-600/30 bg-emerald-50 p-1 text-[10px] text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
							>
								✓ {formatResult(step.result)}
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else if !isCollapsed && plan.steps.length === 0}
		<!-- INKPRINT Empty state -->
		<div
			class="mt-3 rounded-lg border border-border bg-muted p-2 text-xs text-muted-foreground"
		>
			No steps defined for this plan
		</div>
	{/if}
</div>

<style>
	/* INKPRINT: Subtle pulse effect for active step */
	@keyframes pulse-ring {
		0%,
		100% {
			box-shadow: 0 0 0 0 hsl(var(--accent) / 0.3);
		}
		50% {
			box-shadow: 0 0 0 3px hsl(var(--accent) / 0.1);
		}
	}

	/* Apply pulse to active steps */
	.plan-visualization :global(.ring-1.ring-accent\/30) {
		animation: pulse-ring 2s ease-in-out infinite;
	}
</style>
