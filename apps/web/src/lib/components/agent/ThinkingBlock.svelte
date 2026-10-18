<!-- apps/web/src/lib/components/agent/ThinkingBlock.svelte -->
<!-- INKPRINT Design System: Thinking block with terminal-like activity log -->
<script lang="ts">
	import { readAgentChatWorkflowProgress } from './agent-chat-workflow';
	import WorkflowProgressCard from './WorkflowProgressCard.svelte';
	import {
		ChevronDown,
		ChevronRight,
		Loader,
		Check,
		X,
		CircleDot,
		RefreshCw,
		Globe,
		Sparkles,
		Ban,
		CornerUpLeft
	} from 'lucide-svelte';
	import type { ActivityEntry, ThinkingBlockMessage } from './agent-chat.types';
	import type { ToolActivityLine } from './agent-chat-tool-presenter';
	import { WORKER_STOPPING_STATUS } from './agent-chat-worker-status';
	import AgentClientActionCard from './AgentClientActionCard.svelte';
	import { readToolProgressSteps, type ToolProgressStep } from './agent-chat-tool-progress';
	import {
		collectGmailConnectionClientActions,
		type AgentClientActionCompletion
	} from './agent-chat-client-actions';

	interface Props {
		block: ThinkingBlockMessage;
		onToggleCollapse: (blockId: string) => void;
		onClientActionComplete?: (completion: AgentClientActionCompletion) => void | Promise<void>;
	}

	let { block, onToggleCollapse, onClientActionComplete }: Props = $props();

	type StepTone = 'pending' | 'done' | 'failed' | 'awaiting' | 'stopped';

	interface StepRow {
		activity: ActivityEntry;
		tone: StepTone;
		verb: string;
		target?: string;
		quoted: boolean;
		outcome?: string;
		error?: string;
	}

	// Screen-reader prefix for each row's status icon. Awaiting rows already
	// start with "Needs your choice", so they get none.
	const STEP_TONE_LABELS: Record<StepTone, string> = {
		pending: 'In progress',
		done: 'Done',
		failed: 'Failed',
		awaiting: '',
		stopped: 'Stopped'
	};

	// Notes `finalizeThinkingBlock` writes when it has nothing more specific.
	// The headline already says them, so they are never repeated as a detail.
	const GENERIC_FINAL_NOTES = new Set(['Complete', 'Error', 'Interrupted', 'Cancelled']);

	const workflow = $derived.by(() => {
		for (let i = block.activities.length - 1; i >= 0; i--) {
			const value = readAgentChatWorkflowProgress(block.activities[i]?.metadata?.workflow);
			if (value) return value;
		}
		return null;
	});

	// Expanded state: false = compact (half height), true = full height
	let isExpanded = $state(false);

	function toggleExpand() {
		isExpanded = !isExpanded;
	}

	// Status copy arrives from several sources ("Working...", "Thinking…").
	// Print one ellipsis style, and drop it once a step is no longer running.
	function withEllipsis(text: string): string {
		return text.replace(/\s*(?:\.\.\.|…)\s*$/, '…');
	}

	function withoutEllipsis(text: string): string {
		return text.replace(/\s*(?:\.\.\.|…)\s*$/, '');
	}

	// Driven by the explicit loop signals only — never by sniffing copy in
	// `block.content`.
	const isRunning = $derived(block.status === 'active' && block.agentState !== 'waiting_on_user');

	// Stop pressed and the turn has not ended yet: say so wherever the status shows.
	const isStopping = $derived(block.status === 'active' && block.stopRequested === true);

	const displayedActivities = $derived(
		block.activities.filter(
			(activity) =>
				activity.activityType === 'tool_call' ||
				activity.metadata?.skillActivity ||
				activity.metadata?.activityVisibility === 'activity_log'
		)
	);

	function readLine(activity: ActivityEntry): Partial<ToolActivityLine> | null {
		const line = activity.metadata?.line;
		return line && typeof line === 'object' && typeof line.verb === 'string' ? line : null;
	}

	function stepTone(
		activity: ActivityEntry,
		line: Partial<ToolActivityLine> | null,
		isLatest: boolean
	): StepTone {
		if (activity.status === 'failed') return 'failed';
		if (line?.tone === 'awaiting') return 'awaiting';
		if (activity.status === 'completed') return 'done';
		if (activity.status === 'pending') return block.status === 'active' ? 'pending' : 'stopped';
		// Status rows (a review step) carry no status of their own: the newest one
		// is what is running now; anything after it means it finished.
		return isLatest && isRunning ? 'pending' : 'done';
	}

	const steps = $derived.by((): StepRow[] => {
		const lastIndex = displayedActivities.length - 1;
		return displayedActivities.map((activity, index) => {
			const line = readLine(activity);
			const tone = stepTone(activity, line, index === lastIndex);
			const fallback = activity.content ?? '';
			const verb =
				line?.verb ??
				(tone === 'pending' ? withEllipsis(fallback) : withoutEllipsis(fallback));
			const outcome =
				tone === 'done' && typeof activity.metadata?.outcome === 'string'
					? activity.metadata.outcome
					: undefined;
			return {
				activity,
				tone,
				verb,
				...(line?.target ? { target: line.target } : {}),
				quoted: line?.quoted === true,
				...(outcome ? { outcome } : {}),
				...(tone === 'failed' && line?.error ? { error: line.error } : {})
			};
		});
	});
	const stepCount = $derived(steps.length);
	const hasSteps = $derived(stepCount > 0);
	const stepSummary = $derived(`${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`);
	const clientActions = $derived(collectGmailConnectionClientActions(block.activities));

	// ---------------------------------------------------------------------
	// Time: a ticking counter while the turn runs, the total once it ends.
	// ---------------------------------------------------------------------
	function toMs(value: unknown): number | null {
		if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
		if (typeof value === 'string' || typeof value === 'number') {
			const ms = new Date(value).getTime();
			return Number.isFinite(ms) ? ms : null;
		}
		return null;
	}

	function formatSeconds(ms: number): string {
		const total = Math.max(0, Math.round(ms / 1000));
		if (total < 60) return `${total}s`;
		return `${Math.floor(total / 60)}m ${total % 60}s`;
	}

	let now = $state(Date.now());
	$effect(() => {
		if (!isRunning) return;
		now = Date.now();
		const timer = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(timer);
	});

	const startedAtMs = $derived(toMs(block.timestamp));
	// Hidden for the first two seconds so quick replies never flash a "0s".
	const elapsedLabel = $derived(
		isRunning && startedAtMs !== null && now - startedAtMs >= 2000
			? formatSeconds(now - startedAtMs)
			: null
	);
	const durationLabel = $derived.by(() => {
		const endedAtMs = toMs(block.completedAt);
		if (startedAtMs === null || endedAtMs === null || endedAtMs < startedAtMs) return null;
		return formatSeconds(endedAtMs - startedAtMs);
	});

	// ---------------------------------------------------------------------
	// Header copy. While running, the header IS the live status ("Thinking…",
	// "Listing goals…", "Wrapping up…") — one line, no second "thinking".
	// ---------------------------------------------------------------------
	const liveDetail = $derived.by(() => {
		if (isStopping) return WORKER_STOPPING_STATUS;
		for (let i = steps.length - 1; i >= 0; i--) {
			const step = steps[i]!;
			if (step.tone === 'pending') return `${withoutEllipsis(step.verb)}…`;
		}
		const content = (block.content ?? '').trim();
		// A status row ("Checking the requested change…") writes the same text
		// into `block.content`; once a later step finished it, the header must not
		// keep saying it while the model works on the next move.
		const finishedRow = steps.some(
			(step) =>
				step.tone === 'done' &&
				step.activity.activityType !== 'tool_call' &&
				step.activity.content === content
		);
		if (finishedRow) return 'Working…';
		return withEllipsis(content) || 'Thinking…';
	});

	const headline = $derived.by(() => {
		if (block.status === 'error') return 'Hit an issue';
		if (block.status === 'interrupted' || block.status === 'cancelled') return 'Stopped';
		if (block.agentState === 'waiting_on_user') return 'Waiting on your direction';
		if (hasSteps) return durationLabel ? `Worked for ${durationLabel}` : 'Work log';
		return durationLabel ? `Thought for ${durationLabel}` : 'Done';
	});

	const headlineDetail = $derived.by(() => {
		if (block.status === 'completed' && block.agentState !== 'waiting_on_user') return null;
		const content = withoutEllipsis((block.content ?? '').trim());
		if (!content || GENERIC_FINAL_NOTES.has(content)) {
			return block.status === 'error' ? 'Try again when you are ready' : null;
		}
		if (content === headline) return null;
		return content;
	});

	// Live status crossfade: the outgoing line stays stacked under the incoming
	// one just long enough to fade out, so the swap reads as one soft change.
	// Plain closure state: it only records the value this derived already saw.
	let statusHistory: { current: string; previous: string | null } = {
		current: '',
		previous: null
	};
	const liveStatus = $derived.by(() => {
		const next = liveDetail;
		if (next !== statusHistory.current) {
			statusHistory = { current: next, previous: statusHistory.current || null };
		}
		return statusHistory;
	});

	// Sub-steps inside a running tool (web_navigate's live trail): one quiet
	// line per page opened, Jev decision, retry, or backtrack.
	const TRAIL_STYLES: Record<string, { icon: typeof Check; color: string }> = {
		opened: { icon: Globe, color: 'text-muted-foreground' },
		decided: { icon: Sparkles, color: 'text-info' },
		escalating: { icon: RefreshCw, color: 'text-warning' },
		backtracking: { icon: CornerUpLeft, color: 'text-warning' },
		load_failed: { icon: Ban, color: 'text-destructive' },
		decision_failed: { icon: X, color: 'text-destructive' }
	};

	function getTrailStyle(step: ToolProgressStep) {
		if (step.kind === 'finished') {
			return step.data?.outcome === 'found'
				? { icon: Check, color: 'text-success' }
				: { icon: CircleDot, color: 'text-muted-foreground' };
		}
		return TRAIL_STYLES[step.kind] ?? { icon: CircleDot, color: 'text-muted-foreground' };
	}

	// Auto-follow: keep the newest log entry in view while the turn is active —
	// the log is a short scroll box and step #5 onward otherwise appends below
	// the fold. Manual scrolling up pauses following (same rule as the message
	// list); scrolling back to the bottom resumes it.
	let logContainer = $state<HTMLElement | undefined>(undefined);
	let logUserScrolled = $state(false);

	function handleLogScroll() {
		if (!logContainer) return;
		const distanceFromBottom =
			logContainer.scrollHeight - (logContainer.scrollTop + logContainer.clientHeight);
		logUserScrolled = distanceFromBottom > 16;
	}

	$effect(() => {
		if (stepCount === 0) return;
		if (block.status !== 'active') return;
		if (logUserScrolled || !logContainer) return;
		logContainer.scrollTop = logContainer.scrollHeight;
	});
</script>

<!-- INKPRINT thinking block card with Thread texture -->
<div class="thinking-block-wrap">
	{#if workflow}
		<WorkflowProgressCard progress={workflow} status={block.status} />
	{:else}
		<div
			class="thinking-block overflow-hidden border border-border bg-card shadow-ink tx tx-thread tx-weak"
			class:thinking-block-compact={!hasSteps}
			class:thinking-block-with-activity={hasSteps}
			class:thinking-block-active={isRunning}
			class:thinking-block-complete={block.status === 'completed' && !hasSteps}
			class:thinking-block-error={block.status === 'error'}
		>
			<!-- No live region on the container: role="status" is implicitly atomic,
		     so every appended activity re-announced the whole block. The activity
		     list below is a role="log", which announces only new entries. -->
			<button
				type="button"
				onclick={() => {
					if (hasSteps) onToggleCollapse(block.id);
				}}
				disabled={!hasSteps}
				class="thinking-header"
				aria-expanded={hasSteps ? !block.isCollapsed : undefined}
				aria-label={hasSteps
					? block.isCollapsed
						? 'Expand BuildOS thinking log'
						: 'Collapse BuildOS thinking log'
					: undefined}
			>
				<div class="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
					{#if hasSteps}
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
						{#if isRunning}
							<span class="thinking-hammer shrink-0" aria-hidden="true">⚒</span>
						{/if}
					{:else}
						<span class="thinking-compact-icon" aria-hidden="true">
							{#if isRunning}
								<span class="thinking-hammer">⚒</span>
							{:else if block.status === 'completed' && block.agentState !== 'waiting_on_user'}
								<Check class="h-3.5 w-3.5 text-success" />
							{:else if block.status === 'error'}
								<X class="h-3.5 w-3.5 text-destructive" />
							{:else if block.agentState === 'waiting_on_user'}
								<CircleDot class="h-3.5 w-3.5 text-accent" />
							{:else}
								<CircleDot class="h-3.5 w-3.5 text-muted-foreground" />
							{/if}
						</span>
					{/if}

					{#if isRunning}
						<span class="thinking-status" data-testid="thinking-live-status">
							{#key liveStatus.current}
								<span class="thinking-status-text thinking-status-in"
									>{liveStatus.current}</span
								>
							{/key}
							{#if liveStatus.previous !== null}
								{#key liveStatus.previous}
									<span
										class="thinking-status-text thinking-status-out"
										aria-hidden="true">{liveStatus.previous}</span
									>
								{/key}
							{/if}
						</span>
					{:else}
						<span class="thinking-headline">{headline}</span>
						{#if headlineDetail}
							<span class="thinking-compact-detail truncate">{headlineDetail}</span>
						{/if}
					{/if}
				</div>
				{#if elapsedLabel || hasSteps}
					<div class="flex shrink-0 items-center gap-1.5">
						{#if elapsedLabel}
							<span class="thinking-elapsed" aria-hidden="true">{elapsedLabel}</span>
						{/if}
						{#if hasSteps}
							<span class="activity-count-badge">{stepSummary}</span>
						{/if}
					</div>
				{/if}
			</button>

			<!-- INKPRINT activity log panel -->
			<div class="thinking-body" class:thinking-body-open={hasSteps && !block.isCollapsed}>
				<div class="thinking-body-inner">
					<div class="p-2 sm:p-2.5">
						<div
							bind:this={logContainer}
							onscroll={handleLogScroll}
							class="thinking-log thinking-log-height space-y-0.5 overflow-y-auto rounded-md bg-background/55 p-1.5 font-mono text-2xs shadow-ink-inner sm:text-2xs"
							class:thinking-log-expanded={isExpanded}
							role="log"
							aria-label="BuildOS thinking log"
						>
							{#each steps as step (step.activity.id)}
								{@const trail = readToolProgressSteps(
									step.activity.metadata?.progressSteps
								)}
								<div class="py-0.5" data-step-tone={step.tone}>
									<div class="flex items-start gap-1.5 leading-snug">
										<span class="thinking-step-icon" aria-hidden="true">
											{#if step.tone === 'pending'}
												<Loader
													class="h-3 w-3 animate-spin text-muted-foreground"
												/>
											{:else if step.tone === 'failed'}
												<X class="h-3 w-3 text-destructive" />
											{:else if step.tone === 'awaiting'}
												<CircleDot class="h-3 w-3 text-accent" />
											{:else if step.tone === 'stopped'}
												<CircleDot class="h-3 w-3 text-muted-foreground" />
											{:else}
												<Check class="h-3 w-3 text-success" />
											{/if}
										</span>
										{#if STEP_TONE_LABELS[step.tone]}
											<span class="sr-only"
												>{STEP_TONE_LABELS[step.tone]}:</span
											>
										{/if}

										<span
											class="min-w-0 flex-1 break-words [overflow-wrap:anywhere]"
										>
											<span
												class={step.tone === 'failed'
													? 'text-destructive'
													: step.tone === 'stopped'
														? 'text-muted-foreground'
														: 'text-foreground'}>{step.verb}</span
											>{#if step.target}<span
													class="thinking-step-sep"
													aria-hidden="true">{' · '}</span
												><span class="thinking-step-target"
													>{step.quoted
														? `“${step.target}”`
														: step.target}</span
												>{/if}
										</span>

										{#if step.outcome}
											<span class="thinking-step-outcome">{step.outcome}</span
											>
										{/if}
									</div>
									{#if step.error}
										<p class="thinking-step-error">{step.error}</p>
									{/if}
									{#if trail.length > 0}
										<ol class="tool-trail" aria-label="Steps for this action">
											{#each trail as trailStep, trailIndex (trailStep.index)}
												{@const trailStyle = getTrailStyle(trailStep)}
												{@const TrailIcon = trailStyle.icon}
												{@const live =
													step.tone === 'pending' &&
													trailIndex === trail.length - 1}
												<li
													class="tool-trail-step"
													class:tool-trail-step-live={live}
												>
													<TrailIcon
														class="mt-px h-2.5 w-2.5 shrink-0 {trailStyle.color}"
														aria-hidden="true"
													/>
													<span
														class="min-w-0 flex-1 break-words [overflow-wrap:anywhere]"
														>{trailStep.message}</span
													>
													{#if live}
														<Loader
															class="h-2.5 w-2.5 shrink-0 animate-spin text-muted-foreground"
															aria-hidden="true"
														/>
													{/if}
												</li>
											{/each}
										</ol>
									{/if}
								</div>
							{/each}
						</div>
						<!-- Expand/collapse toggle for the log height -->
						{#if stepCount > 3}
							<button
								type="button"
								onclick={toggleExpand}
								class="mt-1 flex w-full items-center justify-center gap-1 text-center micro-label font-semibold text-muted-foreground transition-colors hover:text-foreground"
								aria-label={isExpanded
									? 'Show less activity'
									: 'Show more activity'}
								aria-expanded={isExpanded}
							>
								<!-- Scoped styles can't reach inside the icon component, so the
								     rotating chevron sits in a span this file can style. -->
								<span
									class="thinking-log-chevron"
									class:thinking-log-chevron-expanded={isExpanded}
									aria-hidden="true"
								>
									<ChevronDown class="h-3 w-3" />
								</span>
								{isExpanded ? 'Show less' : 'Show more'}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

{#each clientActions as action (action.actionId)}
	<AgentClientActionCard {action} onComplete={onClientActionComplete} />
{/each}

<style>
	.tool-trail {
		margin: 0.125rem 0 0.25rem 0.3rem;
		padding-left: 0.6rem;
		border-left: 1px solid hsl(var(--border));
		list-style: none;
	}

	.tool-trail-step {
		display: flex;
		align-items: flex-start;
		gap: 0.375rem;
		padding: 0.0625rem 0;
		line-height: 1.35;
		color: hsl(var(--muted-foreground));
		animation: tool-trail-in 180ms ease-out both;
	}

	.tool-trail-step-live {
		color: hsl(var(--foreground));
	}

	@keyframes tool-trail-in {
		from {
			opacity: 0;
			transform: translateY(-2px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tool-trail-step {
			animation: none;
		}
	}

	.thinking-block-wrap {
		display: flex;
		width: 100%;
	}

	.thinking-block {
		width: 100%;
		max-width: 100%;
		border-radius: 0.5rem;
		transition:
			border-color 180ms ease,
			box-shadow 220ms ease,
			background 220ms ease;
	}

	.thinking-block-compact {
		max-width: min(100%, 28rem);
		border-radius: 0.5rem;
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
			background 180ms ease,
			border-color 180ms ease;
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
		flex: 0 0 auto;
		white-space: nowrap;
		border: 1px solid hsl(var(--border));
		border-radius: 999px;
		background: hsl(var(--background) / 0.7);
		padding: 0.125rem 0.375rem;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		font-size: 0.62rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		animation: activity-count-enter 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	@keyframes activity-count-enter {
		from {
			transform: translateX(0.2rem) scale(0.96);
			opacity: 0;
		}
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

	/* Incoming and outgoing status lines share one grid cell (no layout shift);
	   only opacity animates, so the crossfade stays on the compositor. */
	.thinking-status {
		display: inline-grid;
		grid-template-columns: minmax(0, 1fr);
		flex: 0 1 auto;
		min-width: 0;
	}

	.thinking-status-text,
	.thinking-headline {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--foreground));
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		font-size: 0.68rem;
		font-weight: 600;
	}

	.thinking-status-text {
		grid-area: 1 / 1;
	}

	.thinking-headline {
		flex: 0 1 auto;
	}

	.thinking-elapsed {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
			monospace;
		font-size: 0.62rem;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}

	.thinking-step-icon {
		display: inline-flex;
		flex: 0 0 auto;
		height: 1.1em;
		align-items: center;
	}

	.thinking-step-sep,
	.thinking-step-target {
		color: hsl(var(--muted-foreground));
	}

	.thinking-step-outcome {
		flex: 0 0 auto;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}

	.thinking-step-error {
		margin: 0.0625rem 0 0.125rem 1.125rem;
		color: hsl(var(--destructive) / 0.85);
		overflow-wrap: anywhere;
	}

	.thinking-status-in {
		animation: thinking-status-in 180ms ease-out both;
	}

	.thinking-status-out {
		pointer-events: none;
		animation: thinking-status-out 180ms ease-in both;
	}

	@keyframes thinking-status-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes thinking-status-out {
		from {
			opacity: 1;
		}
		to {
			opacity: 0;
		}
	}

	.thinking-body {
		display: grid;
		grid-template-rows: 0fr;
		visibility: hidden;
	}

	.thinking-body-open {
		grid-template-rows: 1fr;
		visibility: visible;
	}

	.thinking-body-inner {
		min-height: 0;
		overflow: hidden;
	}

	/* The scroll clamp changes immediately; motion lives on the disclosure affordance below. */
	.thinking-log-height {
		max-height: 5.25rem; /* compact default, enough for a few tool calls */
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

	.thinking-log-chevron {
		display: inline-flex;
		transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.thinking-log-chevron-expanded {
		transform: rotate(180deg);
	}

	/* INKPRINT Scrollbar Styling - Terminal aesthetic */
	.thinking-log {
		/* Keeps the right-aligned counts ("7 tasks") clear of the scrollbar. */
		scrollbar-gutter: stable;
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

	/* Active-thinking hammer: one opacity + rotate pulse. Both properties are
	   compositor-only; the old infinite shadow glow repainted the glyph every
	   frame for the whole turn. */
	@keyframes thinking-hammer-pulse {
		0%,
		100% {
			opacity: 1;
			transform: rotate(-8deg);
		}
		50% {
			opacity: 0.55;
			transform: rotate(8deg);
		}
	}

	.thinking-hammer {
		animation: thinking-hammer-pulse 2.4s ease-in-out infinite;
		display: inline-block;
		/* Use symbol fonts for bare/terminal-style emoji rendering */
		font-family: 'Segoe UI Symbol', 'Noto Sans Symbols', 'Symbola', monospace, sans-serif;
		font-size: 0.8rem;
		line-height: 1;
		color: hsl(var(--accent));
	}

	@media (prefers-reduced-motion: reduce) {
		.activity-count-badge {
			animation: none;
		}

		.thinking-hammer,
		.thinking-status-in {
			animation: none;
		}

		.thinking-status-out {
			display: none;
		}

		.thinking-log-chevron {
			transition: none;
		}
	}
</style>
