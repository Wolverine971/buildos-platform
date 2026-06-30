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
		FileArchive,
		MoreHorizontal,
		CheckCircle2,
		CircleSlash
	} from 'lucide-svelte';
	import { cubicOut } from 'svelte/easing';
	import { dev } from '$app/environment';
	import ProjectFocusIndicator from './ProjectFocusIndicator.svelte';
	import ChatSessionAuditActions from './ChatSessionAuditActions.svelte';
	import type { ChatContextType, ContextUsageSnapshot } from '@buildos/shared-types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type { AgentChatHeaderAction } from './agent-chat.types';
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
		headerActions?: AgentChatHeaderAction[];
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
		headerActions = [],
		contextShiftPulse = 0
	}: Props = $props();

	const isProjectContext = $derived.by(() => selectedContextType === 'project');

	// Mobile overflow menu — folds the secondary header actions (View / Steps /
	// Support) behind a single "..." control so the mobile header stays clean.
	let mobileMenuOpen = $state(false);
	let mobileMenuButton = $state<HTMLButtonElement | null>(null);
	let mobileMenuEl = $state<HTMLDivElement | null>(null);

	function closeMobileMenu(returnFocus = false) {
		mobileMenuOpen = false;
		if (returnFocus) mobileMenuButton?.focus();
	}

	// All interactive rows inside the menu, in DOM order — covers the conditional
	// export rows and any admin audit rows rendered by ChatSessionAuditActions.
	function mobileMenuItems(): HTMLElement[] {
		if (!mobileMenuEl) return [];
		return Array.from(
			mobileMenuEl.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
		);
	}

	// Roving arrow-key nav + Escape, per the WAI-ARIA menu pattern. Escape is kept
	// from bubbling so it closes the menu without also closing the surrounding modal.
	function handleMobileMenuKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeMobileMenu(true);
			return;
		}
		const items = mobileMenuItems();
		if (!items.length) return;
		const current = items.indexOf(document.activeElement as HTMLElement);
		let next: number;
		switch (event.key) {
			case 'ArrowDown':
				next = current < 0 ? 0 : (current + 1) % items.length;
				break;
			case 'ArrowUp':
				next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = items.length - 1;
				break;
			default:
				return;
		}
		event.preventDefault();
		items[next]?.focus();
	}

	// When the menu opens, drop focus onto its first item so keyboard users land
	// inside it; closing is handled by Escape (focus returns to the trigger).
	$effect(() => {
		if (mobileMenuOpen && mobileMenuEl) {
			mobileMenuItems()[0]?.focus();
		}
	});

	// Horizontal collapse for the back button: when it's removed (e.g. once a chat
	// is underway) it shrinks its width + the parent gap to nothing instead of
	// snapping away, so the title slides left into the reclaimed space.
	function collapseX(node: HTMLElement, { duration = 220 } = {}) {
		const width = node.offsetWidth;
		const gap = 8; // parent uses gap-2 (0.5rem)
		return {
			duration,
			easing: cubicOut,
			css: (t: number) => `
				width: ${t * width}px;
				margin-right: ${(t - 1) * gap}px;
				opacity: ${t};
				transform: scale(${0.9 + 0.1 * t});
			`
		};
	}

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

	// Whether the mobile "..." menu has anything to show (its admin audit rows are
	// gated inside ChatSessionAuditActions, so they don't count here).
	const hasMobileOverflowItems = $derived(
		Boolean(
			headerActions.length ||
				(isProjectContext && projectUrl) ||
				onExportSteps ||
				onExportSupportPacket
		)
	);

	function headerActionClass(action: AgentChatHeaderAction): string {
		if (action.intent === 'primary') {
			return 'border-success/40 bg-success/10 text-success hover:border-success hover:bg-success/15 hover:text-success';
		}
		if (action.intent === 'danger') {
			return 'border-destructive/30 bg-destructive/10 text-destructive hover:border-destructive hover:bg-destructive/15 hover:text-destructive';
		}
		return 'border-border bg-card text-muted-foreground hover:border-accent hover:text-accent';
	}

	function headerMenuActionClass(action: AgentChatHeaderAction): string {
		if (action.intent === 'primary') {
			return 'text-success hover:bg-success/10 hover:text-success focus-visible:bg-success/10 focus-visible:text-success';
		}
		if (action.intent === 'danger') {
			return 'text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive';
		}
		return 'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground';
	}

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
	<!-- Back button with INKPRINT outline style. Collapses away (width + gap) once
	     the chat is underway so it never lingers as dead space. -->
	{#if showBackButton}
		<div class="shrink-0 overflow-hidden" out:collapseX>
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
		</div>
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
						class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-1.5 py-1.5 sm:px-2.5 micro-label font-semibold text-muted-foreground"
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

		<!-- Secondary actions: full buttons on sm+, folded into the mobile "..." menu below -->
		{#each headerActions as action (action.id)}
			<button
				type="button"
				onclick={() => void action.onClick()}
				disabled={action.disabled || action.loading}
				class={`hidden sm:flex h-7 items-center justify-center gap-2 rounded-lg border px-2.5 micro-label font-semibold shadow-ink transition-all touch-manipulation pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${headerActionClass(action)}`}
				style="-webkit-tap-highlight-color: transparent;"
				title={action.title ?? action.label}
				aria-label={action.title ?? action.label}
			>
				{#if action.loading}
					<LoaderCircle class="h-3.5 w-3.5 shrink-0 animate-spin" />
				{:else if action.intent === 'danger'}
					<CircleSlash class="h-3.5 w-3.5 shrink-0" />
				{:else}
					<CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
				{/if}
				<span>{action.label}</span>
			</button>
		{/each}

		<!-- INKPRINT project link button -->
		{#if isProjectContext && projectUrl}
			<a
				href={projectUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="hidden sm:flex h-7 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 micro-label font-semibold text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				style="-webkit-tap-highlight-color: transparent;"
				title="Open project in new tab"
			>
				<ExternalLink class="h-3.5 w-3.5 shrink-0" />
				<span>View</span>
			</a>
		{/if}

		{#if onExportSteps}
			<button
				type="button"
				onclick={onExportSteps}
				disabled={!canExportSteps}
				class="hidden sm:flex h-7 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 micro-label font-semibold text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
				style="-webkit-tap-highlight-color: transparent;"
				title={exportStepsTitle}
				aria-label={exportStepsTitle}
			>
				<Download class="h-3.5 w-3.5 shrink-0" />
				<span>Steps</span>
			</button>
		{/if}

		{#if onExportSupportPacket}
			<button
				type="button"
				onclick={onExportSupportPacket}
				disabled={!canExportSupportPacket}
				class="hidden sm:flex h-7 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 micro-label font-semibold text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-muted-foreground"
				style="-webkit-tap-highlight-color: transparent;"
				title={exportSupportPacketTitle}
				aria-label={exportSupportPacketTitle}
			>
				<FileArchive class="h-3.5 w-3.5 shrink-0" />
				<span>Support</span>
			</button>
		{/if}

		<!-- Admin audit actions: desktop row only here (its mobile rows live in the unified menu) -->
		<ChatSessionAuditActions {sessionId} variant="desktop" />

		<!-- Mobile-only unified overflow menu -->
		{#if hasMobileOverflowItems || sessionId}
			<div class="relative sm:hidden">
				<button
					bind:this={mobileMenuButton}
					type="button"
					onclick={() => (mobileMenuOpen ? closeMobileMenu() : (mobileMenuOpen = true))}
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					style="-webkit-tap-highlight-color: transparent;"
					aria-label="More actions"
					aria-haspopup="menu"
					aria-expanded={mobileMenuOpen}
				>
					<MoreHorizontal class="h-4 w-4" />
				</button>

				{#if mobileMenuOpen}
					<!-- Click-away backdrop -->
					<button
						type="button"
						class="fixed inset-0 z-40 cursor-default"
						aria-label="Close actions menu"
						tabindex="-1"
						onclick={() => closeMobileMenu()}
					></button>
					<div
						bind:this={mobileMenuEl}
						class="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-ink tx tx-frame tx-weak"
						role="menu"
						tabindex="-1"
						onkeydown={handleMobileMenuKeydown}
					>
						{#if isProjectContext && projectUrl}
							<a
								href={projectUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="flex w-full items-center gap-2 px-3 py-2 text-left micro-label font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
								role="menuitem"
								onclick={() => (mobileMenuOpen = false)}
							>
								<ExternalLink class="h-3.5 w-3.5 shrink-0" />
								<span>View project</span>
							</a>
						{/if}

						{#each headerActions as action (action.id)}
							<button
								type="button"
								onclick={() => {
									mobileMenuOpen = false;
									void action.onClick();
								}}
								disabled={action.disabled || action.loading}
								class={`flex w-full items-center gap-2 px-3 py-2 text-left micro-label font-semibold transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${headerMenuActionClass(action)}`}
								role="menuitem"
								title={action.title ?? action.label}
							>
								{#if action.loading}
									<LoaderCircle class="h-3.5 w-3.5 shrink-0 animate-spin" />
								{:else if action.intent === 'danger'}
									<CircleSlash class="h-3.5 w-3.5 shrink-0" />
								{:else}
									<CheckCircle2 class="h-3.5 w-3.5 shrink-0" />
								{/if}
								<span>{action.label}</span>
							</button>
						{/each}

						{#if onExportSteps}
							<button
								type="button"
								onclick={() => {
									mobileMenuOpen = false;
									onExportSteps?.();
								}}
								disabled={!canExportSteps}
								class="flex w-full items-center gap-2 px-3 py-2 text-left micro-label font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								role="menuitem"
								title={exportStepsTitle}
							>
								<Download class="h-3.5 w-3.5 shrink-0" />
								<span>Export steps</span>
							</button>
						{/if}

						{#if onExportSupportPacket}
							<button
								type="button"
								onclick={() => {
									mobileMenuOpen = false;
									onExportSupportPacket?.();
								}}
								disabled={!canExportSupportPacket}
								class="flex w-full items-center gap-2 px-3 py-2 text-left micro-label font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								role="menuitem"
								title={exportSupportPacketTitle}
							>
								<FileArchive class="h-3.5 w-3.5 shrink-0" />
								<span>Export support packet</span>
							</button>
						{/if}

						<!-- Admin audit rows (render nothing for non-admins) -->
						<ChatSessionAuditActions
							{sessionId}
							variant="menu"
							onItemClick={() => (mobileMenuOpen = false)}
						/>
					</div>
				{/if}
			</div>
		{/if}

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
