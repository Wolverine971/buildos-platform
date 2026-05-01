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
		MoreHorizontal
	} from 'lucide-svelte';
	import { dev } from '$app/environment';
	import ProjectFocusIndicator from './ProjectFocusIndicator.svelte';
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
		showAdminDebugActions?: boolean;
		adminSessionHref?: string | null;
		onExportAudit?: (() => void) | null;
		isExportingAudit?: boolean;
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
		showAdminDebugActions = false,
		adminSessionHref = null,
		onExportAudit = null,
		isExportingAudit = false
	}: Props = $props();

	let adminMenuOpen = $state(false);

	const isProjectContext = $derived.by(() => selectedContextType === 'project');
	const hasMobileAdminActions = $derived(
		showAdminDebugActions && Boolean(adminSessionHref || onExportAudit)
	);

	// Determine project URL based on context
	const projectUrl = $derived(projectId ? `/projects/${projectId}` : null);

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
					? 'border-red-600/30 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
					: contextUsage.status === 'near_limit'
						? 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
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
			<h2 class="truncate text-sm font-semibold text-foreground">
				{displayContextLabel}
			</h2>
		{:else}
			<!-- BuildOS with accent color -->
			<h2 class="inline-flex items-baseline gap-[0.05em] text-sm font-bold tracking-tight">
				<span class="text-foreground">Build</span>
				<span class="text-accent">OS</span>
				<span class="ml-1 text-sm font-semibold text-foreground">Assistant</span>
			</h2>
		{/if}

		{#if selectedContextType}
			<span class="hidden text-muted-foreground sm:inline">•</span>

			{#if resolvedProjectFocus}
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
			{:else}
				<span class="hidden truncate text-xs text-muted-foreground sm:inline">
					{displayContextSubtitle || 'Ready to assist'}
				</span>
			{/if}
		{:else}
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
						class="micro-label hidden rounded-lg border border-purple-600/30 bg-purple-50 px-2.5 py-1.5 text-purple-700 tx tx-thread tx-weak sm:inline-flex dark:bg-purple-950/30 dark:text-purple-400"
					>
						ONTO
					</span>
				{/if}

				{#if currentActivity && !hasActiveThinkingBlock}
					<span
						class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-400"
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

		{#if showAdminDebugActions && adminSessionHref}
			<a
				href={adminSessionHref}
				target="_blank"
				rel="noopener noreferrer"
				class="hidden h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex sm:h-7"
				style="-webkit-tap-highlight-color: transparent;"
				title="Open this chat session in admin audit logs"
			>
				<ExternalLink class="h-3.5 w-3.5 shrink-0" />
				<span class="hidden sm:inline">Logs</span>
			</a>
		{/if}

		{#if showAdminDebugActions && onExportAudit}
			<button
				type="button"
				onclick={onExportAudit}
				disabled={isExportingAudit}
				class="hidden h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:flex sm:h-7"
				style="-webkit-tap-highlight-color: transparent;"
				title="Export this chat session as markdown"
			>
				{#if isExportingAudit}
					<LoaderCircle class="h-3.5 w-3.5 shrink-0 animate-spin" />
				{:else}
					<Download class="h-3.5 w-3.5 shrink-0" />
				{/if}
				<span class="hidden sm:inline">Export</span>
			</button>
		{/if}

		{#if hasMobileAdminActions}
			<div class="relative sm:hidden">
				<button
					type="button"
					onclick={() => (adminMenuOpen = !adminMenuOpen)}
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					style="-webkit-tap-highlight-color: transparent;"
					aria-label="Open admin actions"
					aria-haspopup="menu"
					aria-expanded={adminMenuOpen}
				>
					<MoreHorizontal class="h-4 w-4" />
				</button>

				{#if adminMenuOpen}
					<div
						class="absolute right-0 top-[calc(100%+0.35rem)] z-50 min-w-36 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-ink tx tx-frame tx-weak"
						role="menu"
					>
						{#if adminSessionHref}
							<a
								href={adminSessionHref}
								target="_blank"
								rel="noopener noreferrer"
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none"
								role="menuitem"
								onclick={() => (adminMenuOpen = false)}
							>
								<ExternalLink class="h-3.5 w-3.5 shrink-0" />
								<span>Logs</span>
							</a>
						{/if}
						{#if onExportAudit}
							<button
								type="button"
								onclick={() => {
									adminMenuOpen = false;
									onExportAudit?.();
								}}
								disabled={isExportingAudit}
								class="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
								role="menuitem"
							>
								{#if isExportingAudit}
									<LoaderCircle class="h-3.5 w-3.5 shrink-0 animate-spin" />
								{:else}
									<Download class="h-3.5 w-3.5 shrink-0" />
								{/if}
								<span>Export</span>
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/if}

		<!-- INKPRINT close button -->
		{#if onClose}
			<button
				type="button"
				onclick={onClose}
				class="flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all touch-manipulation pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-red-400/50 dark:hover:text-red-400"
				style="-webkit-tap-highlight-color: transparent;"
				aria-label="Close modal"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>
