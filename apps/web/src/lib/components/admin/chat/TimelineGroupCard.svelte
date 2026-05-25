<!-- apps/web/src/lib/components/admin/chat/TimelineGroupCard.svelte -->
<script lang="ts">
	import {
		formatDateTime,
		formatNumber,
		pluralize
	} from '$lib/services/admin/chat-session-audit-formatters';
	import {
		eventTypeLabel,
		groupRequestPreview
	} from '$lib/services/admin/chat-session-audit-timeline';
	import { toolLifecycleDisplayState } from '$lib/services/admin/chat-session-audit-tool-lifecycle';
	import type {
		PromptEvalScenario,
		TimelineGroup
	} from '$lib/services/admin/chat-session-audit-types';
	import { eventIcon, eventSeverityClasses, statusBadge } from './session-audit-ui';
	import PromptEvalPanel from './PromptEvalPanel.svelte';
	import TimelineEventCard from './TimelineEventCard.svelte';

	let {
		group,
		evalScenarios,
		isLoadingEvalScenarios,
		selectedEvalScenarioByTurnId,
		runningEvalByTurnId,
		evalErrorByTurnId,
		expandedEventIds,
		toggleEventExpansion,
		updateSelectedEvalScenario,
		runPromptEval
	}: {
		group: TimelineGroup;
		evalScenarios: PromptEvalScenario[];
		isLoadingEvalScenarios: boolean;
		selectedEvalScenarioByTurnId: Record<string, string>;
		runningEvalByTurnId: Record<string, boolean>;
		evalErrorByTurnId: Record<string, string | null>;
		expandedEventIds: Set<string>;
		toggleEventExpansion: (eventId: string) => void;
		updateSelectedEvalScenario: (turnRunId: string, value: string) => void;
		runPromptEval: (turnRunId: string) => void | Promise<void>;
	} = $props();

	let run = $derived(group.run);

	function displayedGroupItemCount(group: TimelineGroup): number {
		return group.items.reduce((count, _event, index) => {
			return count + (toolLifecycleDisplayState(group.items, index).hideEvent ? 0 : 1);
		}, 0);
	}
</script>

<details class="rounded-xl border border-border bg-background shadow-ink overflow-hidden">
	<summary class="cursor-pointer list-none p-3">
		<div class="flex flex-wrap items-start justify-between gap-3">
			{#if group.kind === 'turn' && run}
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-1.5">
						<span
							class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground/80"
						>
							Turn {group.turnIndex}
						</span>
						<span
							class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {statusBadge(
								run.status
							)}"
						>
							{run.status}
						</span>
						{#if run.first_lane}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-foreground"
							>
								{run.first_lane}
							</span>
						{/if}
						{#if run.first_canonical_op}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-background border border-border text-foreground/80"
							>
								op={run.first_canonical_op}
							</span>
						{/if}
						{#if run.validation_failure_count > 0}
							<span
								class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300"
							>
								{formatNumber(run.validation_failure_count)}
								validation
							</span>
						{/if}
					</div>
					<div class="mt-2 text-sm font-semibold text-foreground">
						{group.title}
					</div>
					<div class="mt-1 text-sm text-foreground/80 line-clamp-2">
						{groupRequestPreview(group) || '(empty request)'}
					</div>
					<div class="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
						<span class="rounded-full bg-muted px-2 py-0.5">
							{formatNumber(run.tool_call_count)}
							{pluralize(run.tool_call_count, 'tool call')}
						</span>
						<span class="rounded-full bg-muted px-2 py-0.5">
							{formatNumber(run.llm_pass_count)} LLM
							{pluralize(run.llm_pass_count, 'pass', 'passes')}
						</span>
						<span class="rounded-full bg-muted px-2 py-0.5">
							{formatNumber(displayedGroupItemCount(group))} visible
							{pluralize(displayedGroupItemCount(group), 'event')}
						</span>
						{#if group.counts.errors > 0}
							<span
								class="rounded-full bg-red-500/10 px-2 py-0.5 text-red-700 dark:text-red-300"
							>
								{formatNumber(group.counts.errors)}
								{pluralize(group.counts.errors, 'error')}
							</span>
						{/if}
					</div>
				</div>
			{:else}
				{@const headerEvent = group.items[0]}
				{@const HeaderIcon = eventIcon(headerEvent?.type ?? 'session')}
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-1.5">
						<span
							class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium {eventSeverityClasses(
								group.severity
							)}"
						>
							<HeaderIcon class="h-3 w-3" />
							{eventTypeLabel(headerEvent?.type ?? 'session')}
						</span>
					</div>
					<div class="mt-2 text-sm font-semibold text-foreground">
						{group.title}
					</div>
					<div class="mt-1 text-sm text-foreground/75 line-clamp-2">
						{group.summary}
					</div>
				</div>
			{/if}
			<div class="shrink-0 text-right">
				<div class="text-xs text-muted-foreground">
					{formatDateTime(group.timestamp)}
				</div>
			</div>
		</div>
	</summary>

	<div class="border-t border-border bg-card/40 p-3 space-y-3">
		{#if group.kind === 'turn' && run}
			<div
				class="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground"
			>
				<div class="flex flex-wrap gap-x-3 gap-y-1">
					{#if run.first_skill_path}
						<span class="break-all">
							<span class="text-foreground/60">First skill:</span>
							{run.first_skill_path}
						</span>
					{/if}
					{#if run.history_strategy}
						<span>
							<span class="text-foreground/60">History:</span>
							{run.history_strategy} / {formatNumber(run.history_for_model_count)}
						</span>
					{/if}
					{#if run.cache_source}
						<span>
							<span class="text-foreground/60">Cache:</span>
							{run.cache_source} / {formatNumber(run.cache_age_seconds)}s
						</span>
					{/if}
					{#if run.finished_reason}
						<span>
							<span class="text-foreground/60">Reason:</span>
							{run.finished_reason}
						</span>
					{/if}
				</div>
				<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1">
					<span>
						<span class="text-foreground/60">Started:</span>
						{formatDateTime(run.started_at)}
					</span>
					{#if run.finished_at}
						<span>
							<span class="text-foreground/60">Finished:</span>
							{formatDateTime(run.finished_at)}
						</span>
					{/if}
				</div>
			</div>
		{/if}

		{#if group.items.length > 0}
			<div class="relative pl-2">
				<div class="absolute left-[8px] top-0 bottom-0 w-px bg-border"></div>
				<div class="space-y-2">
					{#each group.items as event, eventIndex}
						<TimelineEventCard
							{group}
							{event}
							{eventIndex}
							{expandedEventIds}
							{toggleEventExpansion}
						/>
					{/each}
				</div>
			</div>
		{:else}
			<div class="text-sm text-muted-foreground">
				No visible timeline events inside this section for the current filters.
			</div>
		{/if}

		{#if group.kind === 'turn' && run}
			<PromptEvalPanel
				{run}
				{evalScenarios}
				{isLoadingEvalScenarios}
				{selectedEvalScenarioByTurnId}
				{runningEvalByTurnId}
				{evalErrorByTurnId}
				{updateSelectedEvalScenario}
				{runPromptEval}
			/>
		{/if}
	</div>
</details>
