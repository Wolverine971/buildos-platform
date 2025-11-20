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
		onChangeContext: () => void;
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
		onChangeContext,
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
	<!-- Back button: Compact, only shown when context selected -->
	{#if selectedContextType}
		
		<button
			type="button"
			class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
			onclick={onChangeContext}
			disabled={isStreaming}
			aria-label="Change context"
		>
			<ArrowLeft class="h-4 w-4" />
		</button>
	{/if}

	<!-- Brain-bolt icon -->
	<img
		src="/brain-bolt.png"
		alt="BuildOS Assistant"
		class="h-7 w-7 shrink-0 rounded-md object-cover"
	/>

	<!-- Title & Focus Section - Always single line -->
	<div class="flex min-w-0 flex-1 items-center gap-2">
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
			<span class="text-slate-400 dark:text-slate-600">•</span>

			{#if resolvedProjectFocus}
				<ProjectFocusIndicator
					focus={resolvedProjectFocus}
					{onChangeFocus}
					{onClearFocus}
				/>
			{:else}
				<span class="truncate text-xs text-slate-600 dark:text-slate-400">
					{displayContextSubtitle || 'Ready to assist'}
				</span>
			{/if}
		{:else}
			<span class="text-slate-400 dark:text-slate-600">•</span>
			<span class="truncate text-xs text-slate-600 dark:text-slate-400">
				{displayContextSubtitle}
			</span>
		{/if}
	</div>

	<!-- Right side: Status pills, Project link, Close button -->
	<div class="flex shrink-0 items-center gap-2">
		<!-- Status pills -->
		{#if ontologyLoaded || contextUsage || (currentActivity && !agentStateLabel)}
			<div class="flex items-center gap-1.5">
				{#if ontologyLoaded}
					<span
						class="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
					>
						ONTO
					</span>
				{/if}

				{#if contextUsage}
					<span
						class={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono ${contextStatusClass}`}
					>
						<span
							class={`h-1 w-1 rounded-full ${
								contextUsage.status === 'over_budget'
									? 'bg-rose-500'
									: contextUsage.status === 'near_limit'
										? 'bg-amber-500'
										: 'bg-emerald-500'
							}`}
						></span>
						<span class="hidden sm:inline">
							{formatTokensEstimate(contextUsage.estimatedTokens)}/
						</span>
						{formatTokensEstimate(contextUsage.tokenBudget)}
						<span class="hidden text-[9px] font-sans sm:inline">
							{contextStatusLabel}
						</span>
					</span>
				{/if}

				{#if currentActivity && !agentStateLabel}
					<span
						class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
						title={currentActivity}
					></span>
				{/if}
			</div>
		{/if}

		<!-- Project link -->
		{#if isProjectContext && projectUrl}
			<a
				href={projectUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
				title="Open project in new tab"
			>
				<ExternalLink class="h-3.5 w-3.5" />
				<span class="hidden sm:inline">View Project</span>
			</a>
		{/if}

		<!-- Close button -->
		{#if onClose}
			<button
				type="button"
				onclick={onClose}
				class="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
				aria-label="Close modal"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>
