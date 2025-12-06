<!-- apps/web/src/lib/components/agent/AgentChatHeader.svelte -->
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
		agentStateLabel: string | null;
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
		agentStateLabel,
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
		if (contextUsage.status === 'over_budget') return 'text-rose-600 dark:text-rose-400';
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
	const projectUrl = $derived.by(() => {
		if (!projectId) return null;
		// Use ontology URL for ontology-focused contexts
		if (
			resolvedProjectFocus &&
			['task', 'goal', 'plan', 'document', 'output'].includes(resolvedProjectFocus.focusType)
		) {
			return `/ontology/projects/${projectId}`;
		}
		// Default to regular project URL
		return `/ontology/projects/${projectId}`;
	});
</script>

<!-- Ultra-compact single-line header: fixed 48px height -->
<div class="flex h-12 items-center gap-2 px-3 sm:px-4">
	<!-- Back button: Compact, always in header when navigation is available -->
	{#if showBackButton}
		<button
			type="button"
			class="inline-flex h-8 w-8 items-center justify-center rounded-sm border-2 border-slate-400 text-slate-700 transition hover:bg-slate-200 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
			onclick={onBack}
			disabled={isStreaming}
			aria-label="Go back"
		>
			<ArrowLeft class="h-4 w-4" strokeWidth={2.5} />
		</button>
	{/if}

	<!-- Brain-bolt icon with pre-dithered images -->
	<div class="relative shrink-0">
		<!-- Light mode: light dither (no hover effect in header) -->
		<img
			src="/brain-bolt.png"
			alt="BuildOS Assistant"
			class="h-7 w-7 rounded-md object-cover dark:hidden"
		/>
		<!-- Dark mode: dark dither (no hover effect in header) -->
		<img
			src="/brain-bolt.png"
			alt="BuildOS Assistant"
			class="hidden h-7 w-7 rounded-md object-cover dark:block"
		/>
	</div>

	<!-- Title & Focus Section - Optimized for mobile density -->
	<div class="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
		{#if selectedContextType}
			<h2 class="truncate text-sm font-semibold text-slate-900 dark:text-white">
				{displayContextLabel}
			</h2>
		{:else}
			<!-- BuildOS with gradient OS -->
			<h2 class="inline-flex items-baseline gap-[0.05em] text-sm font-bold tracking-tight">
				<span class="text-slate-900 dark:text-white">Build</span>
				<span
					class="bg-gradient-to-br from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent"
				>
					OS
				</span>
				<span class="ml-1 text-sm font-semibold text-slate-900 dark:text-white"
					>Assistant</span
				>
			</h2>
		{/if}

		{#if selectedContextType}
			<!-- Separator: Hidden on small screens to save space -->
			<span class="hidden text-slate-400 dark:text-slate-600 sm:inline">•</span>

			{#if resolvedProjectFocus}
				<ProjectFocusIndicator
					focus={resolvedProjectFocus}
					{onChangeFocus}
					{onClearFocus}
				/>
			{:else}
				<!-- Subtitle: Hidden on mobile, shown on desktop -->
				<span class="hidden truncate text-xs text-slate-600 dark:text-slate-400 sm:inline">
					{displayContextSubtitle || 'Ready to assist'}
				</span>
			{/if}
		{:else}
			<!-- No context selected: Hide subtitle on mobile -->
			<span class="hidden text-slate-400 dark:text-slate-600 sm:inline">•</span>
			<span class="hidden truncate text-xs text-slate-600 dark:text-slate-400 sm:inline">
				{displayContextSubtitle}
			</span>
		{/if}
	</div>

	<!-- Right side: Status pills, Project link, Close button -->
	<div class="flex shrink-0 items-center gap-2">
		<!-- Status pills with industrial styling -->
		{#if ontologyLoaded || contextUsage || (currentActivity && !agentStateLabel)}
			<div class="flex items-center gap-1.5">
				{#if ontologyLoaded}
					<span
						class="rounded-sm border border-purple-400 bg-purple-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:border-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
					>
						ONTO
					</span>
				{/if}

				{#if contextUsage}
					<span
						class={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-mono uppercase ${
							contextUsage.status === 'over_budget'
								? 'border-rose-400 bg-rose-100 text-rose-700 dark:border-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
								: contextUsage.status === 'near_limit'
									? 'border-orange-400 bg-orange-100 text-orange-700 dark:border-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
									: 'border-green-400 bg-green-100 text-green-700 dark:border-green-600 dark:bg-green-900/30 dark:text-green-400'
						}`}
					>
						<span
							class={`h-1 w-1 rounded-full ${
								contextUsage.status === 'over_budget'
									? 'bg-rose-500'
									: contextUsage.status === 'near_limit'
										? 'bg-orange-500'
										: 'bg-green-500'
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

				{#if currentActivity && !agentStateLabel}
					<span
						class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 dark:bg-green-400"
						title={currentActivity}
					></span>
				{/if}
			</div>
		{/if}

		<!-- Project link with proper light/dark contrast -->
		{#if isProjectContext && projectUrl}
			<a
				href={projectUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="flex h-7 items-center gap-1 rounded-sm border border-slate-300 bg-slate-50 px-2 text-xs font-semibold uppercase tracking-wider text-slate-700 transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
				title="Open project in new tab"
			>
				<ExternalLink class="h-3.5 w-3.5" />
				<span class="hidden sm:inline">View</span>
			</a>
		{/if}

		<!-- Close button with proper light/dark contrast -->
		{#if onClose}
			<button
				type="button"
				onclick={onClose}
				class="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-slate-50 text-slate-700 transition-all hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-rose-600 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
				aria-label="Close modal"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>
