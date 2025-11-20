<!-- apps/web/src/lib/components/agent/AgentChatHeader.svelte -->
<script lang="ts">
	import { ChevronLeft } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProjectFocusIndicator from './ProjectFocusIndicator.svelte';
	import type { ChatContextType, ContextUsageSnapshot } from '@buildos/shared-types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import { formatTokensEstimate } from './agent-chat-formatters';

	interface Props {
		selectedContextType: ChatContextType | null;
		displayContextLabel: string;
		displayContextSubtitle: string;
		contextBadgeClass: string;
		isStreaming: boolean;
		onChangeContext: () => void;
		onClose: () => void;
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
		contextBadgeClass,
		isStreaming,
		onChangeContext,
		onClose,
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
		if (contextUsage.status === 'over_budget') return 'Over budget';
		if (contextUsage.status === 'near_limit') return 'Near limit';
		return 'OK';
	});

	const contextStatusClass = $derived.by(() => {
		if (!contextUsage) return '';
		if (contextUsage.status === 'over_budget') return 'text-rose-600 dark:text-rose-400';
		if (contextUsage.status === 'near_limit') return 'text-amber-600 dark:text-amber-400';
		return 'text-emerald-600 dark:text-emerald-400';
	});
</script>

<!-- ✅ Single column layout with back button on left -->
<div class="flex flex-col gap-1.5">
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0 flex-1 space-y-1">
			<!-- ✅ Simplified title: single heading with context badge -->
			<div class="flex flex-wrap items-center gap-1.5">
				<h2 class="text-base font-semibold text-slate-900 dark:text-white sm:text-lg leading-tight">
					{selectedContextType ? displayContextLabel : 'BuildOS Assistant'}
				</h2>
				{#if selectedContextType}
					<!-- ✅ Ultra-compact context type badge: px-2 py-0.5, text-[10px] -->
					<span
						class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide leading-tight ${contextBadgeClass}`}
					>
						{selectedContextType.replace('_', ' ')}
					</span>
				{/if}
			</div>

			<!-- ✅ Only show subtitle when no context selected -->
			{#if !selectedContextType && displayContextSubtitle}
				<p class="text-xs leading-snug text-slate-500 dark:text-slate-400">
					{displayContextSubtitle}
				</p>
			{/if}
		</div>

		<!-- ✅ Close button in top-right corner -->
		<Button
			variant="ghost"
			size="sm"
			class="rounded-full px-1.5 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
			aria-label="Close chat"
			onclick={onClose}
		>
			✕
		</Button>
	</div>

	<!-- ✅ Back button and focus indicator row -->
	{#if selectedContextType}
		<div class="flex flex-wrap items-center gap-2">
			<!-- ✅ Back button matching ContextSelectionScreen style -->
			<Button
				variant="ghost"
				size="sm"
				onclick={onChangeContext}
				disabled={isStreaming}
				class="disabled:cursor-not-allowed disabled:opacity-70"
			>
				<ChevronLeft class="h-4 w-4" />
				Back
			</Button>

			{#if resolvedProjectFocus}
				<ProjectFocusIndicator focus={resolvedProjectFocus} {onChangeFocus} {onClearFocus} />
			{/if}
		</div>
	{/if}

	<!-- ✅ Status indicators row -->
	{#if ontologyLoaded || agentStateLabel || currentActivity || contextUsage}
		<div
			class="flex flex-wrap items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 sm:gap-1.5"
		>
			{#if ontologyLoaded}
				<!-- ✅ Ultra-compact status badge: px-1.5 py-0.5 -->
				<span
					class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide leading-tight dark:bg-slate-800 dark:text-slate-200"
				>
					Ontology
				</span>
			{/if}
			{#if agentStateLabel}
				<!-- ✅ Ultra-compact state badge -->
				<span
					class="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide leading-tight dark:bg-slate-800 dark:text-slate-200"
				>
					{agentStateLabel}
				</span>
			{/if}
			{#if contextUsage}
				<!-- ✅ Ultra-compact context indicator: px-1.5 py-0.5, h-1.5 w-1.5 dot -->
				<span
					class={`inline-flex items-center gap-1 rounded-full border border-slate-200/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none dark:border-slate-700/60 ${contextStatusClass}`}
					title={`Context ${formatTokensEstimate(contextUsage.estimatedTokens)} / ${formatTokensEstimate(contextUsage.tokenBudget)} (${contextStatusLabel})`}
				>
					<!-- ✅ Tiny status dot: h-1.5 w-1.5 (6px) -->
					<span
						class={`h-1.5 w-1.5 rounded-full ${contextUsage.status === 'over_budget'
							? 'bg-rose-500'
							: contextUsage.status === 'near_limit'
								? 'bg-amber-500'
								: 'bg-emerald-500'}`}
					></span>
					<!-- ✅ Compact token display: font-mono text-[10px] -->
					<span class="font-mono text-[10px]">
						{formatTokensEstimate(contextUsage.estimatedTokens)}/{formatTokensEstimate(contextUsage.tokenBudget)}
					</span>
					{#if contextStatusLabel}
						<!-- ✅ Ultra-compact status label: text-[9px] -->
						<span class="hidden sm:inline text-[9px] font-semibold uppercase tracking-wide">
							{contextStatusLabel}
						</span>
					{/if}
				</span>
			{/if}
			{#if currentActivity}
				<!-- ✅ Compact activity indicator: gap-1, h-1.5 w-1.5 dot -->
				<span class="flex items-center gap-1">
					<span class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
					></span>
					<span class="truncate text-[11px]">{currentActivity}</span>
				</span>
			{/if}
		</div>
	{/if}
</div>
