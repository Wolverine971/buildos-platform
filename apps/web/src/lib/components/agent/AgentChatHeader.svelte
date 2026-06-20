<!-- apps/web/src/lib/components/agent/AgentChatHeader.svelte -->
<!-- INKPRINT Design System: Header component with Frame texture -->
<script lang="ts">
	import {
		X,
		ExternalLink,
		ArrowLeft,
		LoaderCircle,
		AlertTriangle,
		Download,
		FileArchive
	} from 'lucide-svelte';
	import { dev } from '$app/environment';
	import ProjectFocusIndicator from './ProjectFocusIndicator.svelte';
	import ChatSessionAuditActions from './ChatSessionAuditActions.svelte';
	import type { ChatContextType, ContextUsageSnapshot } from '@buildos/shared-types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import { formatTokensEstimate } from './agent-chat-formatters';

	interface Props {
		selectedContextType: ChatContextType | null;
		displayContextLabel: string;
		displayContextSubtitle: string;
		isStreaming: boolean;
		showBackButton: boolean;
		onBack: () => void;
		onClose?: () => void;
		projectId?: string;
		resolvedProjectFocus: ProjectFocus | null;
		onChangeFocus: () => void;
		onClearFocus: () => void;
		ontologyLoaded: boolean;
		hasActiveThinkingBlock: boolean;
		currentActivity: string;
		sessionStatusLabel?: string | null;
		contextUsage?: ContextUsageSnapshot | null;
		sessionId?: string | null;
		onExportSteps?: () => void;
		canExportSteps?: boolean;
		exportableStepCount?: number;
		onExportSupportPacket?: () => void;
		canExportSupportPacket?: boolean;
		/** Bumped each time we shift into a (new) project context — triggers the title glimmer. */
		contextShiftPulse?: number;
	}

	let {
		selectedContextType,
		displayContextLabel,
		displayContextSubtitle,
		isStreaming,
		showBackButton,
		onBack,
		onClose,
		projectId,
		resolvedProjectFocus,
		onChangeFocus,
		onClearFocus,
		ontologyLoaded,
		hasActiveThinkingBlock,
		currentActivity,
		sessionStatusLabel = null,
		contextUsage = null,
		sessionId = null,
		onExportSteps,
		canExportSteps = false,
		exportableStepCount = 0,
		onExportSupportPacket,
		canExportSupportPacket = false,
		contextShiftPulse = 0
	}: Props = $props();

	const isProjectContext = $derived.by(() => selectedContextType === 'project');

	// One-shot glimmer when the project context shifts. We key the title on the
	// pulse so the CSS animation re-fires on every transition, and gate it on
	// `glimmer` so it never plays on first mount (pulse starts at 0).
	let glimmer = $state(false);
	let lastPulse = 0;
	let glimmerTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const pulse = contextShiftPulse;
		if (pulse === lastPulse) return;
		lastPulse = pulse;
		if (pulse <= 0) return;
		glimmer = true;
		if (glimmerTimer) clearTimeout(glimmerTimer);
		glimmerTimer = setTimeout(() => {
			glimmer = false;
			glimmerTimer = null;
		}, 1200);
	});

	$effect(() => () => {
		if (glimmerTimer) clearTimeout(glimmerTimer);
	});

	// Determine project URL based on context
	const projectUrl = $derived(projectId ? `/projects/${projectId}` : null);
	const exportStepsTitle = $derived.by(() => {
		if (!canExportSteps) return 'No agent steps to export yet';
		if (exportableStepCount <= 0) return 'Export chat transcript';
		const noun = exportableStepCount === 1 ? 'step' : 'steps';
		return `Export agent steps (${exportableStepCount} ${noun} logged)`;
	});
	const exportSupportPacketTitle = $derived.by(() => {
		if (!canExportSupportPacket) return 'No chat data to export yet';
		return 'Export support packet';
	});

	const contextUsageCounter = $derived.by(() => {
		if (!dev || !contextUsage) {
			return null;
		}

		const estimatedLabel = formatTokensEstimate(contextUsage.estimatedTokens);
		const budgetLabel = formatTokensEstimate(contextUsage.tokenBudget);
		const tokensOverBudget = Math.max(
			contextUsage.estimatedTokens - contextUsage.tokenBudget,
			0
		);

		return {
			label: `${estimatedLabel} / ${budgetLabel} tok`,
			mobileLabel: `${estimatedLabel}/${budgetLabel}`,
			title:
				contextUsage.status === 'over_budget'
					? `${contextUsage.estimatedTokens.toLocaleString()} estimated tokens of ${contextUsage.tokenBudget.toLocaleString()} budget (${tokensOverBudget.toLocaleString()} over budget)`
					: `${contextUsage.estimatedTokens.toLocaleString()} estimated tokens of ${contextUsage.tokenBudget.toLocaleString()} budget (${contextUsage.tokensRemaining.toLocaleString()} left, ${contextUsage.usagePercent}% used)`,
			showWarningIcon: contextUsage.status !== 'ok',
			className:
				contextUsage.status === 'over_budget'
					? 'border-destructive/30 bg-destructive/10 text-destructive'
					: contextUsage.status === 'near_limit'
						? 'border-warning/30 bg-warning/10 text-warning'
						: 'border-border bg-muted text-muted-foreground'
		};
	});
</script>

<!-- INKPRINT compact header: fixed 48px height with Frame texture for structural hierarchy -->
<div class="flex h-12 items-center gap-2 px-3 sm:px-4 tx tx-frame tx-weak">
	<!-- Back button with INKPRINT outline style -->
	{#if showBackButton}
		<button
			type="button"
			class="inline-flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition touch-manipulation pressable hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			style="-webkit-tap-highlight-color: transparent;"
			onclick={onBack}
			disabled={isStreaming}
			aria-label="Go back"
		>
			<ArrowLeft class="h-4 w-4" strokeWidth={2.5} />
		</button>
	{/if}

	<!-- Title & Focus Section -->
	<div class="flex min-w-0 flex-1 items-center gap-2">
		{#if selectedContextType}
			{#key contextShiftPulse}
				<h2
					class="agent-context-title truncate text-sm font-semibold text-foreground"
					class:agent-context-title--glimmer={glimmer}
				>
					{displayContextLabel}
				</h2>
			{/key}
		{:else}
			<!-- BuildOS with accent color -->
			<h2 class="inline-flex items-baseline gap-[0.05em] text-sm font-bold tracking-tight">
				<span class="text-foreground">Build</span>
				<span class="text-accent">OS</span>
				<span class="ml-1 text-sm font-semibold text-foreground">Assistant</span>
			</h2>
		{/if}

		{#if selectedContextType}
			{#if resolvedProjectFocus}
				<span class="hidden text-muted-foreground sm:inline">•</span>
				<!-- Hide project-wide indicator on mobile to give more room for project title -->
				<span
					class={resolvedProjectFocus.focusType === 'project-wide'
						? 'hidden sm:inline-flex'
						: 'inline-flex'}
				>
					<ProjectFocusIndicator
						focus={resolvedProjectFocus}
						{onChangeFocus}
						{onClearFocus}
					/>
				</span>
			{:else if displayContextSubtitle}
				<span class="hidden text-muted-foreground sm:inline">•</span>
				<span class="hidden truncate text-xs text-muted-foreground sm:inline">
					{displayContextSubtitle}
				</span>
			{/if}
		{:else if displayContextSubtitle}
			<span class="hidden text-muted-foreground sm:inline">•</span>
			<span class="hidden truncate text-xs text-muted-foreground sm:inline">
				{displayContextSubtitle}
			</span>
		{/if}
	</div>

	<!-- Right side: Status pills, Project link, Close button -->
	<div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
		<!-- INKPRINT status pills with micro-label styling -->
		<!-- On mobile: show only spinner (when loading) and activity dot to prevent overflow -->
		<!-- On sm+: show full text-based pills -->
		{#if sessionStatusLabel || contextUsageCounter || ontologyLoaded || (currentActivity && !hasActiveThinkingBlock)}
			<div class="flex items-center gap-1.5 sm:gap-2">
				{#if sessionStatusLabel}
					<!-- Mobile: spinner only. sm+: spinner + text -->
					<span
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-1.5 py-1.5 sm:px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground"
						title={sessionStatusLabel}
					>
						<LoaderCircle class="h-3 w-3 animate-spin" />
						<span class="hidden sm:inline">{sessionStatusLabel}</span>
					</span>
				{/if}

				{#if contextUsageCounter}
					<span
						class={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1.5 sm:px-2.5 text-[0.65rem] font-semibold ${contextUsageCounter.className}`}
						title={contextUsageCounter.title}
					>
						{#if contextUsageCounter.showWarningIcon}
							<AlertTriangle class="h-3 w-3" />
						{/if}
						<span class="font-mono sm:hidden">{contextUsageCounter.mobileLabel}</span>
						<span class="hidden font-mono sm:inline">{contextUsageCounter.label}</span>
					</span>
				{/if}

				{#if ontologyLoaded}
					<!-- Hidden on mobile, visible on sm+ -->
					<span
						class="micro-label hidden rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-accent tx tx-thread tx-weak sm:inline-flex"
					>
						ONTO
					</span>
				{/if}

				{#if currentActivity && !hasActiveThinkingBlock}
					<span
						class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-success"
						title={currentActivity}
					></span>
				{/if}
			</div>
		{/if}

		<!-- INKPRINT project link button -->
		{#if isProjectContext && projectUrl}
			<a
				href={projectUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="flex h-9 sm:h-7 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				style="-webkit-tap-highlight-color: transparent;"
				title="Open project in new tab"
			>
				<ExternalLink class="h-3.5 w-3.5 shrink-0" />
				<span class="hidden sm:inline">View</span>
			</a>
		{/if}

		{#if onExportSteps}
			<button
				type="button"
				onclick={onExportSteps}
				disabled={!canExportSteps}
				class="flex h-9 sm:h-7 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
				style="-webkit-tap-highlight-color: transparent;"
				title={exportStepsTitle}
				aria-label={exportStepsTitle}
			>
				<Download class="h-3.5 w-3.5 shrink-0" />
				<span class="hidden sm:inline">Steps</span>
			</button>
		{/if}

		{#if onExportSupportPacket}
			<button
				type="button"
				onclick={onExportSupportPacket}
				disabled={!canExportSupportPacket}
				class="flex h-9 sm:h-7 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
				style="-webkit-tap-highlight-color: transparent;"
				title={exportSupportPacketTitle}
				aria-label={exportSupportPacketTitle}
			>
				<FileArchive class="h-3.5 w-3.5 shrink-0" />
				<span class="hidden sm:inline">Support</span>
			</button>
		{/if}

		<ChatSessionAuditActions {sessionId} />

		<!-- INKPRINT close button -->
		{#if onClose}
			<button
				type="button"
				onclick={onClose}
				class="flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-destructive/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				style="-webkit-tap-highlight-color: transparent;"
				aria-label="Close modal"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>

<style>
	/*
	 * INKPRINT glimmer: when the agent shifts us onto a (new) project, the title
	 * rises into place while a band of accent "ink" sweeps across the letters and
	 * the whole title briefly blooms accent — a small, deliberate "this is your
	 * project now" beat. (No pseudo-element underline: the title is `truncate`, and
	 * `overflow: hidden` would clip anything drawn outside its box. A `filter`
	 * glow renders past the clip, so the bloom is the safe way to add presence.)
	 */
	.agent-context-title--glimmer {
		/*
		 * Mostly-foreground gradient with an accent band at its centre. Sized to
		 * 300% so the painted image always fully covers the title (the band can
		 * sweep fully in and out without ever leaving a glyph unpainted — unpainted
		 * area + text-clip = invisible text).
		 */
		background-image: linear-gradient(
			100deg,
			hsl(var(--foreground)) 0%,
			hsl(var(--foreground)) 34%,
			hsl(var(--accent)) 50%,
			hsl(var(--foreground)) 66%,
			hsl(var(--foreground)) 100%
		);
		background-size: 300% 100%;
		background-repeat: no-repeat;
		/* Resting/end state: window sits on a pure-foreground slice of the gradient. */
		background-position: 0% 0;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		color: transparent;
		transform-origin: left center;
		animation:
			agent-context-pop 0.42s cubic-bezier(0.22, 1, 0.36, 1),
			agent-context-shimmer 1.05s ease-out 0.04s,
			agent-context-glow 1.15s ease-out;
	}

	@keyframes agent-context-pop {
		0% {
			opacity: 0;
			transform: translateY(3px) scale(0.97);
		}
		60% {
			opacity: 1;
		}
		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Accent band travels left→right across the letters, then settles off-frame. */
	@keyframes agent-context-shimmer {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: 0% 0;
		}
	}

	/* The whole title softly blooms accent, then settles (two layers for presence). */
	@keyframes agent-context-glow {
		0% {
			filter: drop-shadow(0 0 0 hsl(var(--accent) / 0));
		}
		45% {
			filter: drop-shadow(0 0 5px hsl(var(--accent) / 0.55))
				drop-shadow(0 0 12px hsl(var(--accent) / 0.3));
		}
		100% {
			filter: drop-shadow(0 0 0 hsl(var(--accent) / 0));
		}
	}

	/* Respect users who prefer reduced motion — keep the moment, drop the movement. */
	@media (prefers-reduced-motion: reduce) {
		.agent-context-title--glimmer {
			background-image: none;
			-webkit-text-fill-color: hsl(var(--foreground));
			color: hsl(var(--foreground));
			filter: none;
			transform: none;
			animation: none;
		}
	}
</style>
