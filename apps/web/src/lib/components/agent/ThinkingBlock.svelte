<!-- apps/web/src/lib/components/agent/ThinkingBlock.svelte -->
<!-- INKPRINT Design System: Thinking block with terminal-like activity log -->
<script lang="ts">
	import { ChevronDown, ChevronRight, Loader, Check, X } from 'lucide-svelte';
	import type { ActivityType, ThinkingBlockMessage } from './agent-chat.types';

	interface Props {
		block: ThinkingBlockMessage;
		onToggleCollapse: (blockId: string) => void;
	}

	let { block, onToggleCollapse }: Props = $props();

	// Expanded state: false = compact (half height), true = full height
	let isExpanded = $state(false);

	function toggleExpand() {
		isExpanded = !isExpanded;
	}

	// Derive if thinking is complete (check for completion phrases in content)
	const isThinkingComplete = $derived.by(() => {
		if (block.status !== 'active') return true;
		// Check for completion phrases in content
		const content = block.content?.toLowerCase() || '';
		return (
			content.includes('ready for your response') ||
			content.includes('complete') ||
			content.includes('waiting on your')
		);
	});

	// Derive header label - changes from "Thinking" to "Thoughts" when complete
	const headerLabel = $derived(isThinkingComplete ? 'BuildOS Thoughts' : 'BuildOS Thinking');

	// Show animated hammer only when actively thinking
	const showAnimatedHammer = $derived(block.status === 'active' && !isThinkingComplete);

	const displayedActivities = $derived(
		block.activities.filter(
			(activity) => activity.activityType === 'tool_call' || activity.metadata?.skillActivity
		)
	);
	const displayedActivityCount = $derived(displayedActivities.length);
	const hasDisplayedActivities = $derived(displayedActivityCount > 0);
	const compactLabel = $derived.by(() => {
		if (block.status === 'error') return 'BuildOS hit an issue';
		if (block.status === 'interrupted' || block.status === 'cancelled')
			return 'BuildOS stopped';
		if (block.status === 'completed') return 'BuildOS thought';
		if (block.agentState === 'waiting_on_user') return 'Waiting on your direction';
		return 'BuildOS is thinking';
	});
	const compactDetail = $derived.by(() => {
		if (block.status === 'completed') return 'No tools needed';
		if (block.status === 'error') return block.content || 'Try again when you are ready';
		if (block.status === 'interrupted' || block.status === 'cancelled') {
			return block.content || 'Stopped';
		}
		return block.content || 'Preparing the next response';
	});
	const activitySummary = $derived(
		`${displayedActivityCount} ${displayedActivityCount === 1 ? 'action' : 'actions'}`
	);

	// INKPRINT activity styles with semantic meanings
	const ACTIVITY_STYLES: Record<ActivityType, { icon: string; color: string; prefix: string }> = {
		tool_call: { icon: '🔧', color: 'text-blue-600 dark:text-blue-400', prefix: 'TOOL' },
		tool_result: { icon: '✓', color: 'text-emerald-600 dark:text-emerald-400', prefix: 'TOOL' },
		state_change: {
			icon: '🟢',
			color: 'text-emerald-600 dark:text-emerald-400',
			prefix: 'STATE'
		},
		context_shift: {
			icon: '🔄',
			color: 'text-amber-600 dark:text-amber-400',
			prefix: 'CONTEXT'
		},
		operation: {
			icon: '⚡',
			color: 'text-sky-600 dark:text-sky-400',
			prefix: 'OP'
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

	function getActivityStyle(type: ActivityType) {
		return ACTIVITY_STYLES[type] || ACTIVITY_STYLES.general;
	}
</script>

<!-- INKPRINT thinking block card with Thread texture -->
<div class="thinking-block-wrap">
	<div
		class="thinking-block overflow-hidden border border-border bg-card shadow-ink tx tx-thread tx-weak"
		class:thinking-block-compact={!hasDisplayedActivities}
		class:thinking-block-with-activity={hasDisplayedActivities}
		class:thinking-block-active={showAnimatedHammer}
		class:thinking-block-complete={block.status === 'completed' && !hasDisplayedActivities}
		class:thinking-block-error={block.status === 'error'}
		role="status"
		aria-live={block.status === 'active' ? 'polite' : 'off'}
	>
		<button
			type="button"
			onclick={() => {
				if (hasDisplayedActivities) onToggleCollapse(block.id);
			}}
			disabled={!hasDisplayedActivities}
			class="thinking-header"
			aria-expanded={hasDisplayedActivities ? !block.isCollapsed : undefined}
			aria-label={hasDisplayedActivities
				? block.isCollapsed
					? 'Expand BuildOS thinking log'
					: 'Collapse BuildOS thinking log'
				: undefined}
		>
			<div class="flex min-w-0 items-center gap-1.5 sm:gap-2">
				{#if hasDisplayedActivities}
					{#if block.isCollapsed}
						<ChevronRight
							class="h-3 w-3 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					{:else}
						<ChevronDown
							class="h-3 w-3 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					{/if}
				{:else}
					<span class="thinking-compact-icon" aria-hidden="true">
						{#if showAnimatedHammer}
							<span class="glowing-hammer">⚒</span>
						{:else if block.status === 'completed'}
							<Check class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
						{:else if block.status === 'error'}
							<X class="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
						{:else}
							<Loader class="h-3.5 w-3.5 animate-spin text-muted-foreground" />
						{/if}
					</span>
				{/if}
				{#if showAnimatedHammer}
					{#if hasDisplayedActivities}
						<span class="glowing-hammer shrink-0" aria-hidden="true">⚒</span>
					{/if}
				{/if}

				<span
					class="min-w-0 truncate font-mono text-[0.72rem] font-semibold tracking-normal text-foreground {hasDisplayedActivities
						? 'uppercase sm:text-xs'
						: ''}"
				>
					{hasDisplayedActivities ? headerLabel : compactLabel}
				</span>

				{#if showAnimatedHammer}
					<span
						class="thinking-dots"
						class:thinking-dots-hidden={hasDisplayedActivities}
						aria-hidden="true"
					>
						<span></span>
						<span></span>
						<span></span>
					</span>
				{:else if !hasDisplayedActivities}
					<span class="thinking-compact-detail truncate">{compactDetail}</span>
				{/if}
			</div>
			<span
				class="activity-count-badge"
				class:activity-count-badge-visible={hasDisplayedActivities}
				aria-hidden={!hasDisplayedActivities}
			>
				{activitySummary}
			</span>
		</button>

		<!-- INKPRINT activity log panel -->
		<div
			class="thinking-body"
			class:thinking-body-open={hasDisplayedActivities && !block.isCollapsed}
			class:thinking-body-expanded={hasDisplayedActivities &&
				!block.isCollapsed &&
				isExpanded}
		>
			<div class="p-2 sm:p-2.5">
				<div
					class="thinking-log thinking-log-height space-y-0.5 overflow-y-auto rounded-md bg-background/55 p-1.5 font-mono text-[0.65rem] shadow-ink-inner sm:text-[11px]"
					class:thinking-log-expanded={isExpanded}
					role="log"
					aria-label="BuildOS thinking log"
				>
					{#each displayedActivities as activity (activity.id)}
						{@const style = getActivityStyle(activity.activityType)}
						<div class="py-0.5">
							<div class="flex items-center gap-1.5 leading-snug">
								<!-- Icon -->
								<span
									class="shrink-0 pt-0.5 text-[0.65rem] {style.color} sm:pt-0"
									aria-hidden="true">{style.icon}</span
								>

								<!-- Content -->
								<span
									class="min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-foreground"
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
					{/each}
				</div>
				<!-- Expand/collapse toggle for the log height -->
				{#if displayedActivityCount > 3}
					<button
						type="button"
						onclick={toggleExpand}
						class="mt-1 w-full text-center text-[0.6rem] font-semibold uppercase tracking-normal text-muted-foreground transition-colors hover:text-foreground"
						aria-label={isExpanded ? 'Show less activity' : 'Show more activity'}
					>
						{isExpanded ? '▲ Show less' : '▼ Show more'}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.thinking-block-wrap {
		display: flex;
		width: 100%;
	}

	.thinking-block {
		width: 100%;
		max-width: 100%;
		border-radius: 0.5rem;
		transition:
			max-width 260ms ease,
			border-radius 260ms ease,
			border-color 180ms ease,
			box-shadow 220ms ease,
			background 220ms ease;
	}

	.thinking-block-compact {
		max-width: min(100%, 28rem);
		border-radius: 999px;
	}

	.thinking-block-with-activity {
		max-width: 100%;
	}

	.thinking-block-active {
		border-color: hsl(var(--accent) / 0.28);
		box-shadow:
			var(--shadow-ink, 0 1px 2px hsl(var(--foreground) / 0.08)),
			0 0 0 3px hsl(var(--accent) / 0.06);
	}

	.thinking-block-complete {
		color: hsl(var(--muted-foreground));
	}

	.thinking-block-error {
		border-color: hsl(var(--destructive) / 0.28);
	}

	.thinking-header {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0);
		background: hsl(var(--card));
		padding: 0.45rem 0.65rem 0.45rem 0.5rem;
		text-align: left;
		transition:
			padding 220ms ease,
			background 180ms ease,
			border-color 180ms ease,
			border-radius 220ms ease;
	}

	.thinking-header:hover:not(:disabled) {
		background: hsl(var(--muted) / 0.8);
	}

	.thinking-header:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.thinking-header:disabled {
		cursor: default;
		opacity: 1;
	}

	.thinking-block-with-activity .thinking-header {
		border-bottom-color: hsl(var(--border));
		border-radius: 0.5rem 0.5rem 0 0;
		background: hsl(var(--muted));
		padding: 0.375rem 0.625rem;
	}

	@media (min-width: 640px) {
		.thinking-block-with-activity .thinking-header {
			padding: 0.5rem 0.75rem;
		}
	}

	.activity-count-badge {
		max-width: 0;
		flex: 0 0 auto;
		overflow: hidden;
		white-space: nowrap;
		border: 0 solid hsl(var(--border));
		border-radius: 999px;
		background: hsl(var(--background) / 0.7);
		padding: 0;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		font-size: 0.62rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		opacity: 0;
		transition:
			max-width 220ms ease,
			opacity 160ms ease,
			padding 220ms ease,
			border-width 220ms ease;
	}

	.activity-count-badge-visible {
		max-width: 7rem;
		border-width: 1px;
		padding: 0.125rem 0.375rem;
		opacity: 1;
	}

	.thinking-compact-icon {
		display: inline-flex;
		height: 1.25rem;
		width: 1.25rem;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: hsl(var(--muted) / 0.78);
	}

	.thinking-block-active .thinking-compact-icon {
		background: hsl(var(--accent) / 0.1);
	}

	.thinking-compact-detail {
		min-width: 0;
		color: hsl(var(--muted-foreground));
		font-size: 0.68rem;
	}

	.thinking-dots {
		display: inline-flex;
		align-items: center;
		gap: 0.16rem;
		padding-right: 0.1rem;
	}

	.thinking-dots span {
		width: 0.2rem;
		height: 0.2rem;
		border-radius: 999px;
		background: hsl(var(--accent));
		animation: thinking-dot 1.15s ease-in-out infinite;
		opacity: 0.35;
	}

	.thinking-dots span:nth-child(2) {
		animation-delay: 0.16s;
	}

	.thinking-dots span:nth-child(3) {
		animation-delay: 0.32s;
	}

	.thinking-dots-hidden {
		max-width: 0;
		overflow: hidden;
		opacity: 0;
	}

	@keyframes thinking-dot {
		0%,
		80%,
		100% {
			transform: translateY(0);
			opacity: 0.35;
		}
		40% {
			transform: translateY(-0.12rem);
			opacity: 0.95;
		}
	}

	.thinking-body {
		max-height: 0;
		overflow: hidden;
		opacity: 0;
		transition:
			max-height 280ms ease,
			opacity 180ms ease;
	}

	.thinking-body-open {
		max-height: 9rem;
		opacity: 1;
	}

	.thinking-body-expanded {
		max-height: 22rem;
	}

	/* Graduated height: starts compact, smooth transition on expand */
	.thinking-log-height {
		max-height: 5.25rem; /* compact default, enough for a few tool calls */
		transition: max-height 0.35s ease-in-out;
	}

	.thinking-log-expanded {
		max-height: 15rem;
	}

	@media (min-width: 640px) {
		.thinking-log-height {
			max-height: 6.5rem;
		}

		.thinking-log-expanded {
			max-height: 18rem;
		}
	}

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

	/* Glowing hammer animation for active thinking state */
	@keyframes pulse-glow {
		0%,
		100% {
			text-shadow:
				0 0 2px currentColor,
				0 0 4px currentColor;
			opacity: 1;
		}
		50% {
			text-shadow:
				0 0 6px currentColor,
				0 0 12px currentColor,
				0 0 18px currentColor;
			opacity: 0.9;
		}
	}

	@keyframes rotate-sway {
		0%,
		100% {
			transform: rotate(-8deg);
		}
		50% {
			transform: rotate(8deg);
		}
	}

	.glowing-hammer {
		animation:
			pulse-glow 2s ease-in-out infinite,
			rotate-sway 3s ease-in-out infinite;
		display: inline-block;
		text-shadow: 0 0 0 currentColor;
		/* Use symbol fonts for bare/terminal-style emoji rendering */
		font-family: 'Segoe UI Symbol', 'Noto Sans Symbols', 'Symbola', monospace, sans-serif;
		font-size: 0.8rem;
		line-height: 1;
		color: hsl(var(--accent));
	}

	:global(.dark) .glowing-hammer {
		color: hsl(var(--accent));
	}

	@media (prefers-reduced-motion: reduce) {
		.glowing-hammer,
		.thinking-dots span {
			animation: none;
		}
	}
</style>
