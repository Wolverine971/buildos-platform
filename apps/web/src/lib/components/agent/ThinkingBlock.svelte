<!-- apps/web/src/lib/components/agent/ThinkingBlock.svelte -->
<script lang="ts">
	import { ChevronDown, ChevronRight, Loader, Check, X } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
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

<Card
	variant="elevated"
	class="!p-0 thinking-block border-slate-300 bg-slate-100/95 dark:border-slate-700/60 dark:bg-slate-900/95 shadow-sm"
>
	<!-- Header -->
	<button
		type="button"
		onclick={() => onToggleCollapse(block.id)}
		class="flex w-full items-center justify-between gap-1.5 border-b border-slate-300 bg-slate-200/80 px-2.5 py-1.5 transition-colors hover:bg-slate-200 dark:border-slate-700/60 dark:bg-slate-800/80 dark:hover:bg-slate-800 sm:gap-2 sm:px-3 sm:py-2 focus:outline-none focus:ring-1 focus:ring-purple-500 rounded-t-lg"
		aria-expanded={!block.isCollapsed}
		aria-label={block.isCollapsed
			? 'Expand BuildOS thinking log'
			: 'Collapse BuildOS thinking log'}
	>
		<div class="flex min-w-0 items-center gap-1.5">
			{#if block.isCollapsed}
				<ChevronRight
					class="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400"
					aria-hidden="true"
				/>
			{:else}
				<ChevronDown
					class="h-3 w-3 shrink-0 text-slate-500 dark:text-slate-400"
					aria-hidden="true"
				/>
			{/if}
			<span
				class="truncate font-mono text-[11px] font-medium text-slate-700 dark:text-slate-300 sm:text-xs"
			>
				BuildOS Thinking
			</span>
		</div>
		<div class="flex shrink-0 items-center gap-1.5 text-[10px] sm:gap-2 sm:text-xs">
			<span
				class="hidden font-mono font-medium sm:inline {block.status === 'active'
					? 'text-emerald-600 dark:text-emerald-400'
					: 'text-slate-500 dark:text-slate-400'}"
				role="status"
				aria-live="polite"
			>
				{statusLabel}
			</span>
			<span
				class="font-mono text-slate-600 dark:text-slate-500"
				aria-label={`${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`}
			>
				{activityCount}
			</span>
		</div>
	</button>

	<!-- Activity Log -->
	{#if !block.isCollapsed}
		<CardBody padding="sm">
			<div
				class="thinking-log max-h-48 space-y-0.5 overflow-y-auto bg-white/60 rounded-md font-mono text-[10px] dark:bg-slate-950/60 sm:max-h-64 sm:text-[11px] p-1.5"
				role="log"
				aria-label="BuildOS thinking log"
			>
				{#if block.activities.length === 0}
					<div
						class="flex items-center gap-1.5 py-1.5 text-slate-600 dark:text-slate-500"
						role="status"
						aria-live="polite"
					>
						<span
							class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
							aria-hidden="true"
						></span>
						<span>Waiting for BuildOS activity...</span>
					</div>
				{:else}
					{#each block.activities as activity (activity.id)}
						{@const style = getActivityStyle(activity.activityType)}
						{@const planSteps = getPlanSteps(activity)}
						<div class="py-0.5">
							<div class="flex items-start gap-1.5 leading-tight sm:items-center">
								<!-- Icon -->
								<span
									class="shrink-0 pt-0.5 text-[10px] {style.color} sm:pt-0"
									aria-hidden="true">{style.icon}</span
								>

								<!-- Content -->
								<span
									class="min-w-0 flex-1 break-words text-slate-700 dark:text-slate-300"
									>{activity.content}</span
								>

								<!-- Status indicator (for tool calls) -->
								{#if activity.status === 'pending'}
									<Loader
										class="h-2.5 w-2.5 shrink-0 animate-spin text-slate-500 dark:text-slate-400"
										aria-label="Loading"
									/>
								{:else if activity.status === 'completed'}
									<Check
										class="h-2.5 w-2.5 shrink-0 text-green-600 dark:text-green-400"
										aria-label="Completed"
									/>
								{:else if activity.status === 'failed'}
									<X
										class="h-2.5 w-2.5 shrink-0 text-red-600 dark:text-red-400"
										aria-label="Failed"
									/>
								{/if}
							</div>

							<!-- Plan steps expansion -->
							{#if planSteps && planSteps.length > 0}
								<div
									class="ml-4 mt-0.5 space-y-0.5 text-slate-600 dark:text-slate-400"
								>
									{#each planSteps as step, i}
										<div class="flex gap-1.5 text-[10px] leading-tight">
											<span
												class="w-4 shrink-0 text-right text-slate-500 dark:text-slate-500"
												>{i + 1}.</span
											>
											<span class="min-w-0 flex-1"
												>{step.description ||
													step.name ||
													'Unnamed step'}</span
											>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		</CardBody>
	{/if}
</Card>

<style>
	/* Terminal-style scrollbar - Light Mode */
	.thinking-log {
		scrollbar-width: thin;
		scrollbar-color: rgb(203 213 225) rgb(241 245 249);
	}

	.thinking-log::-webkit-scrollbar {
		width: 4px;
	}

	.thinking-log::-webkit-scrollbar-track {
		background: rgb(241 245 249); /* slate-100 */
	}

	.thinking-log::-webkit-scrollbar-thumb {
		background: rgb(203 213 225); /* slate-300 */
		border-radius: 2px;
	}

	.thinking-log::-webkit-scrollbar-thumb:hover {
		background: rgb(148 163 184); /* slate-400 */
	}

	/* Dark mode adjustments */
	:global(.dark) .thinking-log {
		scrollbar-color: rgb(71 85 105) rgb(15 23 42);
	}

	:global(.dark) .thinking-log::-webkit-scrollbar-track {
		background: rgb(15 23 42); /* slate-950 */
	}

	:global(.dark) .thinking-log::-webkit-scrollbar-thumb {
		background: rgb(71 85 105); /* slate-600 */
	}

	:global(.dark) .thinking-log::-webkit-scrollbar-thumb:hover {
		background: rgb(100 116 139); /* slate-500 */
	}
</style>
