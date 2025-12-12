<!-- apps/web/src/lib/components/agent/ThinkingBlock.svelte -->
<!-- INKPRINT Design System: Thinking block with terminal-like activity log -->
<script lang="ts">
	import { ChevronDown, ChevronRight, Loader, Check, X } from 'lucide-svelte';
	import PlanVisualization from './PlanVisualization.svelte';
	import type {
		ActivityEntry,
		ActivityType,
		AgentLoopState,
		ThinkingBlockMessage
	} from './agent-chat.types';

	interface Props {
		block: ThinkingBlockMessage;
		onToggleCollapse: (blockId: string) => void;
	}

	let { block, onToggleCollapse }: Props = $props();

	// Track collapse state for individual plans
	let planCollapseStates = $state<Map<string, boolean>>(new Map());

	// Function to toggle individual plan collapse
	function togglePlanCollapse(activityId: string) {
		const current = planCollapseStates.get(activityId) ?? false;
		planCollapseStates.set(activityId, !current);
		// Force reactivity with new Map
		planCollapseStates = new Map(planCollapseStates);
	}

	// Derive status label
	const statusLabel = $derived(
		block.status === 'active' && block.content ? block.content : 'Complete'
	);
	const activityCount = $derived(block.activities.length);

	// INKPRINT activity styles with semantic meanings
	const ACTIVITY_STYLES: Record<ActivityType, { icon: string; color: string; prefix: string }> = {
		tool_call: { icon: '🔧', color: 'text-blue-600 dark:text-blue-400', prefix: 'TOOL' },
		tool_result: { icon: '✓', color: 'text-emerald-600 dark:text-emerald-400', prefix: 'TOOL' },
		plan_created: {
			icon: '📋',
			color: 'text-purple-600 dark:text-purple-400',
			prefix: 'PLAN'
		},
		plan_review: { icon: '⚖️', color: 'text-amber-600 dark:text-amber-400', prefix: 'PLAN' },
		state_change: {
			icon: '🟢',
			color: 'text-emerald-600 dark:text-emerald-400',
			prefix: 'STATE'
		},
		step_start: { icon: '➜', color: 'text-amber-600 dark:text-amber-400', prefix: 'STEP' },
		step_complete: {
			icon: '✓',
			color: 'text-emerald-600 dark:text-emerald-400',
			prefix: 'STEP'
		},
		executor_spawned: {
			icon: '⚙️',
			color: 'text-teal-600 dark:text-teal-400',
			prefix: 'EXEC'
		},
		executor_result: {
			icon: '✓',
			color: 'text-emerald-600 dark:text-emerald-400',
			prefix: 'EXEC'
		},
		context_shift: {
			icon: '🔄',
			color: 'text-amber-600 dark:text-amber-400',
			prefix: 'CONTEXT'
		},
		ontology_loaded: {
			icon: '📚',
			color: 'text-indigo-600 dark:text-indigo-400',
			prefix: 'ONTO'
		},
		clarification: {
			icon: '❓',
			color: 'text-blue-600 dark:text-blue-400',
			prefix: 'CLARIFY'
		},
		general: { icon: 'ℹ️', color: 'text-muted-foreground', prefix: 'INFO' }
	};

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}

	function getActivityStyle(type: ActivityType) {
		return ACTIVITY_STYLES[type] || ACTIVITY_STYLES.general;
	}
</script>

<!-- INKPRINT thinking block card with Thread texture -->
<div
	class="thinking-block rounded-lg border border-border bg-card shadow-ink tx tx-thread tx-weak overflow-hidden"
>
	<!-- INKPRINT collapsible header -->
	<button
		type="button"
		onclick={() => onToggleCollapse(block.id)}
		class="flex w-full items-center justify-between gap-1.5 border-b border-border bg-muted px-2.5 py-1.5 transition-colors hover:bg-muted/80 sm:gap-2 sm:px-3 sm:py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset rounded-t-lg"
		aria-expanded={!block.isCollapsed}
		aria-label={block.isCollapsed
			? 'Expand BuildOS thinking log'
			: 'Collapse BuildOS thinking log'}
	>
		<div class="flex min-w-0 items-center gap-1.5">
			{#if block.isCollapsed}
				<ChevronRight class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
			{:else}
				<ChevronDown class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
			{/if}
			<span
				class="truncate font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-foreground sm:text-xs"
			>
				BuildOS Thinking
			</span>
		</div>
		<div class="flex shrink-0 items-center gap-1.5 text-[0.65rem] sm:gap-2 sm:text-xs">
			<span
				class="hidden font-mono font-medium sm:inline {block.status === 'active'
					? 'text-emerald-600 dark:text-emerald-400'
					: 'text-muted-foreground'}"
				role="status"
				aria-live="polite"
			>
				{statusLabel}
			</span>
			<span
				class="font-mono text-muted-foreground"
				aria-label={`${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`}
			>
				{activityCount}
			</span>
		</div>
	</button>

	<!-- INKPRINT activity log panel -->
	{#if !block.isCollapsed}
		<div class="p-2 sm:p-3">
			<div
				class="thinking-log max-h-48 space-y-0.5 overflow-y-auto rounded-lg bg-background/50 font-mono text-[0.65rem] shadow-ink-inner p-1.5 sm:max-h-64 sm:text-[11px]"
				role="log"
				aria-label="BuildOS thinking log"
			>
				{#if block.activities.length === 0}
					<div
						class="flex items-center gap-1.5 py-1.5 text-muted-foreground"
						role="status"
						aria-live="polite"
					>
						<span
							class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600"
							aria-hidden="true"
						></span>
						<span>Waiting for BuildOS activity...</span>
					</div>
				{:else}
					{#each block.activities as activity (activity.id)}
						{#if activity.activityType === 'plan_created' && activity.metadata?.plan}
							<!-- Use dedicated plan visualization for plan activities -->
							<div class="py-1">
								<PlanVisualization
									plan={activity.metadata.plan}
									currentStep={activity.metadata.currentStep}
									isCollapsed={planCollapseStates.get(activity.id) ?? false}
									onToggle={() => togglePlanCollapse(activity.id)}
								/>
							</div>
						{:else}
							{@const style = getActivityStyle(activity.activityType)}
							<div class="py-0.5">
								<div class="flex items-start gap-1.5 leading-tight sm:items-center">
									<!-- Icon -->
									<span
										class="shrink-0 pt-0.5 text-[0.65rem] {style.color} sm:pt-0"
										aria-hidden="true">{style.icon}</span
									>

									<!-- Content -->
									<span class="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-foreground"
										>{activity.content}</span
									>

									<!-- Status indicator (for tool calls) -->
									{#if activity.status === 'pending'}
										<Loader
											class="h-2.5 w-2.5 shrink-0 animate-spin text-muted-foreground"
											aria-label="Loading"
										/>
									{:else if activity.status === 'completed'}
										<Check
											class="h-2.5 w-2.5 shrink-0 text-emerald-600 dark:text-emerald-400"
											aria-label="Completed"
										/>
									{:else if activity.status === 'failed'}
										<X
											class="h-2.5 w-2.5 shrink-0 text-red-600 dark:text-red-400"
											aria-label="Failed"
										/>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* INKPRINT Scrollbar Styling - Terminal aesthetic */
	.thinking-log {
		scrollbar-width: thin;
		scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
	}

	.thinking-log::-webkit-scrollbar {
		width: 4px;
	}

	.thinking-log::-webkit-scrollbar-track {
		background: transparent;
	}

	.thinking-log::-webkit-scrollbar-thumb {
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 2px;
	}

	.thinking-log::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground) / 0.5);
	}

	:global(.dark) .thinking-log {
		scrollbar-color: hsl(var(--muted-foreground) / 0.4) transparent;
	}

	:global(.dark) .thinking-log::-webkit-scrollbar-thumb {
		background: hsl(var(--muted-foreground) / 0.4);
	}

	:global(.dark) .thinking-log::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--accent));
	}
</style>
