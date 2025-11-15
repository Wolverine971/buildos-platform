<!-- apps/web/src/lib/components/agent/ThinkingBlock.svelte -->
<script lang="ts">
	import { ChevronDown, ChevronRight, Loader, Check, X } from 'lucide-svelte';

	// Type definitions (should match parent component)
	type ActivityType =
		| 'tool_call'
		| 'tool_result'
		| 'plan_created'
		| 'plan_review'
		| 'state_change'
		| 'step_start'
		| 'step_complete'
		| 'executor_spawned'
		| 'executor_result'
		| 'context_shift'
		| 'template_request'
		| 'template_status'
		| 'ontology_loaded'
		| 'clarification'
		| 'general';

	interface ActivityEntry {
		id: string;
		content: string;
		timestamp: Date;
		activityType: ActivityType;
		status?: 'pending' | 'completed' | 'failed';
		toolCallId?: string;
		metadata?: Record<string, any>;
	}

	type AgentLoopState = 'thinking' | 'executing_plan' | 'waiting_on_user';

	interface ThinkingBlockMessage {
		id: string;
		type: 'thinking_block';
		activities: ActivityEntry[];
		status: 'active' | 'completed';
		agentState?: AgentLoopState;
		isCollapsed?: boolean;
		content: string;
		timestamp: Date;
	}

	interface Props {
		block: ThinkingBlockMessage;
		onToggleCollapse: (blockId: string) => void;
	}

	let { block, onToggleCollapse }: Props = $props();

	// Derive status label
	const statusLabel = $derived(
		block.status === 'active' && block.content ? block.content : 'Complete'
	);
	const activityCount = $derived(block.activities.length);

	// Icon and color mapping for activity types
	const ACTIVITY_STYLES: Record<ActivityType, { icon: string; color: string; prefix: string }> = {
		tool_call: { icon: '🔧', color: 'text-blue-400 dark:text-blue-300', prefix: 'TOOL' },
		tool_result: { icon: '✓', color: 'text-green-400 dark:text-green-300', prefix: 'TOOL' },
		plan_created: {
			icon: '📋',
			color: 'text-purple-400 dark:text-purple-300',
			prefix: 'PLAN'
		},
		plan_review: { icon: '⚖️', color: 'text-amber-400 dark:text-amber-300', prefix: 'PLAN' },
		state_change: {
			icon: '🟢',
			color: 'text-emerald-400 dark:text-emerald-300',
			prefix: 'STATE'
		},
		step_start: { icon: '➜', color: 'text-orange-400 dark:text-orange-300', prefix: 'STEP' },
		step_complete: {
			icon: '✓',
			color: 'text-green-400 dark:text-green-300',
			prefix: 'STEP'
		},
		executor_spawned: {
			icon: '⚙️',
			color: 'text-teal-400 dark:text-teal-300',
			prefix: 'EXEC'
		},
		executor_result: {
			icon: '✓',
			color: 'text-green-400 dark:text-green-300',
			prefix: 'EXEC'
		},
		context_shift: {
			icon: '🔄',
			color: 'text-yellow-400 dark:text-yellow-300',
			prefix: 'CONTEXT'
		},
		template_request: {
			icon: '📄',
			color: 'text-pink-400 dark:text-pink-300',
			prefix: 'TEMPLATE'
		},
		template_status: {
			icon: '📄',
			color: 'text-pink-400 dark:text-pink-300',
			prefix: 'TEMPLATE'
		},
		ontology_loaded: {
			icon: '📚',
			color: 'text-indigo-400 dark:text-indigo-300',
			prefix: 'ONTO'
		},
		clarification: {
			icon: '❓',
			color: 'text-blue-400 dark:text-blue-300',
			prefix: 'CLARIFY'
		},
		general: { icon: 'ℹ️', color: 'text-slate-400 dark:text-slate-300', prefix: 'INFO' }
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

	// Display plan steps if available in metadata
	function getPlanSteps(activity: ActivityEntry): any[] | null {
		if (activity.activityType === 'plan_created' && activity.metadata?.plan?.steps) {
			return activity.metadata.plan.steps;
		}
		return null;
	}
</script>

<div
	class="thinking-block rounded-xl border border-slate-700/60 bg-slate-900/95 shadow-lg dark:border-slate-600/60 dark:bg-slate-800/95"
>
	<!-- Header -->
	<button
		type="button"
		onclick={() => onToggleCollapse(block.id)}
		class="flex w-full items-center justify-between gap-3 border-b border-slate-700/60 bg-slate-800/80 px-4 py-3 transition hover:bg-slate-800 dark:border-slate-600/60 dark:bg-slate-700/80 dark:hover:bg-slate-700"
	>
		<div class="flex items-center gap-3">
			{#if block.isCollapsed}
				<ChevronRight class="h-4 w-4 text-slate-400" />
			{:else}
				<ChevronDown class="h-4 w-4 text-slate-400" />
			{/if}
			<span class="font-mono text-sm font-semibold text-slate-200 dark:text-slate-100">
				Agent Thinking
			</span>
		</div>
		<div class="flex items-center gap-4 text-xs">
			<span
				class="font-mono font-medium {block.status === 'active'
					? 'text-emerald-400'
					: 'text-slate-400'}"
			>
				Status: {statusLabel}
			</span>
			<span class="font-mono text-slate-500 dark:text-slate-400"
				>{activityCount} {activityCount === 1 ? 'activity' : 'activities'}</span
			>
		</div>
	</button>

	<!-- Activity Log -->
	{#if !block.isCollapsed}
		<div
			class="thinking-log max-h-96 space-y-0.5 overflow-y-auto bg-slate-950/60 p-3 font-mono text-xs dark:bg-slate-900/60"
		>
			{#if block.activities.length === 0}
				<div class="flex items-center gap-2 py-2 text-slate-500 dark:text-slate-400">
					<span class="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500"
					></span>
					<span>Waiting for agent activity...</span>
				</div>
			{:else}
				{#each block.activities as activity (activity.id)}
					{@const style = getActivityStyle(activity.activityType)}
					{@const planSteps = getPlanSteps(activity)}
					<div class="py-0.5">
						<div class="flex items-center gap-2 leading-tight">
							<!-- Icon -->
							<span class="shrink-0 {style.color}">{style.icon}</span>

							<!-- Content -->
							<span class="flex-1 text-slate-300 dark:text-slate-200"
								>{activity.content}</span
							>

							<!-- Status indicator (for tool calls) -->
							{#if activity.status === 'pending'}
								<Loader class="h-3 w-3 shrink-0 animate-spin text-slate-400" />
							{:else if activity.status === 'completed'}
								<Check class="h-3 w-3 shrink-0 text-green-400" />
							{:else if activity.status === 'failed'}
								<X class="h-3 w-3 shrink-0 text-red-400" />
							{/if}
						</div>

						<!-- Plan steps expansion -->
						{#if planSteps && planSteps.length > 0}
							<div class="ml-6 mt-0.5 space-y-0.5 text-slate-400 dark:text-slate-300">
								{#each planSteps as step, i}
									<div class="flex gap-2 text-[11px] leading-snug">
										<span class="w-6 shrink-0 text-right text-slate-500"
											>{i + 1}.</span
										>
										<span class="flex-1"
											>{step.description || step.name || 'Unnamed step'}</span
										>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Terminal-style scrollbar */
	.thinking-log {
		scrollbar-width: thin;
		scrollbar-color: rgb(71 85 105) rgb(15 23 42);
	}

	.thinking-log::-webkit-scrollbar {
		width: 6px;
	}

	.thinking-log::-webkit-scrollbar-track {
		background: rgb(15 23 42);
	}

	.thinking-log::-webkit-scrollbar-thumb {
		background: rgb(71 85 105);
		border-radius: 3px;
	}

	.thinking-log::-webkit-scrollbar-thumb:hover {
		background: rgb(100 116 139);
	}

	/* Dark mode adjustments */
	:global(.dark) .thinking-log::-webkit-scrollbar-track {
		background: rgb(15 23 42);
	}

	:global(.dark) .thinking-log::-webkit-scrollbar-thumb {
		background: rgb(71 85 105);
	}

	:global(.dark) .thinking-log::-webkit-scrollbar-thumb:hover {
		background: rgb(100 116 139);
	}
</style>
