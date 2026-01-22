<!-- apps/web/src/lib/components/agent/AgentChatHeader.svelte -->
<!-- INKPRINT Design System: Header component with Frame texture -->
<script lang="ts">
	import { X, ExternalLink, ArrowLeft } from 'lucide-svelte';
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
		contextUsage: ContextUsageSnapshot | null;
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
		contextUsage
	}: Props = $props();

	const contextStatusLabel = $derived.by(() => {
		if (!contextUsage) return '';
		if (contextUsage.status === 'over_budget') return 'Over';
		if (contextUsage.status === 'near_limit') return 'Near';
		return 'OK';
	});

	const contextStatusClass = $derived.by(() => {
		if (!contextUsage) return '';
		if (contextUsage.status === 'over_budget') return 'text-red-600 dark:text-red-400';
		if (contextUsage.status === 'near_limit') return 'text-amber-600 dark:text-amber-400';
		return 'text-emerald-600 dark:text-emerald-400';
	});

	const isProjectContext = $derived.by(
		() =>
			selectedContextType === 'project' ||
			selectedContextType === 'project_audit' ||
			selectedContextType === 'project_forecast'
	);

	// Determine project URL based on context
	const projectUrl = $derived(projectId ? `/projects/${projectId}` : null);
</script>

<!-- INKPRINT compact header: fixed 48px height -->
<div class="flex h-12 items-center gap-2 px-3 sm:px-4">
	<!-- Back button with INKPRINT outline style -->
	{#if showBackButton}
		<button
			type="button"
			class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition pressable hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={onBack}
			disabled={isStreaming}
			aria-label="Go back"
		>
			<ArrowLeft class="h-4 w-4" strokeWidth={2.5} />
		</button>
	{/if}

	<!-- Brain-bolt icon -->
	<div class="relative shrink-0">
		<img
			src="/brain-bolt.png"
			alt="BuildOS Assistant"
			class="h-7 w-7 rounded-lg object-cover shadow-ink dark:hidden"
		/>
		<img
			src="/brain-bolt.png"
			alt="BuildOS Assistant"
			class="hidden h-7 w-7 rounded-lg object-cover shadow-ink dark:block"
		/>
	</div>

	<!-- Title & Focus Section -->
	<div class="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
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
	<div class="flex shrink-0 items-center gap-2">
		<!-- INKPRINT status pills with micro-label styling -->
		{#if ontologyLoaded || contextUsage || (currentActivity && !hasActiveThinkingBlock)}
			<div class="flex items-center gap-1.5">
				{#if ontologyLoaded}
					<span
						class="micro-label rounded-lg border border-purple-600/30 bg-purple-50 px-2 py-0.5 text-purple-700 tx tx-thread tx-weak dark:bg-purple-950/30 dark:text-purple-400"
					>
						ONTO
					</span>
				{/if}

				{#if contextUsage}
					<span
						class={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[0.65rem] font-mono uppercase tracking-[0.1em] ${
							contextUsage.status === 'over_budget'
								? 'border-red-600/30 bg-red-50 text-red-700 tx tx-static tx-weak dark:bg-red-950/30 dark:text-red-400'
								: contextUsage.status === 'near_limit'
									? 'border-amber-600/30 bg-amber-50 text-amber-700 tx tx-static tx-weak dark:bg-amber-950/30 dark:text-amber-400'
									: 'border-emerald-600/30 bg-emerald-50 text-emerald-700 tx tx-grain tx-weak dark:bg-emerald-950/30 dark:text-emerald-400'
						}`}
					>
						<span
							class={`h-1 w-1 rounded-full ${
								contextUsage.status === 'over_budget'
									? 'bg-red-600'
									: contextUsage.status === 'near_limit'
										? 'bg-amber-600'
										: 'bg-emerald-600'
							}`}
						></span>
						<span class="hidden sm:inline">
							{formatTokensEstimate(contextUsage.estimatedTokens)}/
						</span>
						{formatTokensEstimate(contextUsage.tokenBudget)}
						<span
							class="hidden text-[9px] font-sans uppercase tracking-wider sm:inline"
						>
							{contextStatusLabel}
						</span>
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
				class="flex h-7 items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				title="Open project in new tab"
			>
				<ExternalLink class="h-3.5 w-3.5 shrink-0" />
				<span class="hidden sm:inline">View</span>
			</a>
		{/if}

		<!-- INKPRINT close button -->
		{#if onClose}
			<button
				type="button"
				onclick={onClose}
				class="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-red-400/50 dark:hover:text-red-400"
				aria-label="Close modal"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>
