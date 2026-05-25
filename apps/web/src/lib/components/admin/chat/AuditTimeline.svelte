<!-- apps/web/src/lib/components/admin/chat/AuditTimeline.svelte -->
<script lang="ts">
	import { formatNumber } from '$lib/services/admin/chat-session-audit-formatters';
	import type {
		AuditTimelineType as TimelineType,
		ChatSessionAuditPayload as SessionDetailPayload,
		PromptEvalScenario,
		TimelineGroup
	} from '$lib/services/admin/chat-session-audit-types';
	import TimelineFilters from './TimelineFilters.svelte';
	import TimelineGroupCard from './TimelineGroupCard.svelte';

	let {
		visibleTimeline,
		replayTimeline,
		visibleTimelineGroups,
		evalScenarios,
		isLoadingEvalScenarios,
		selectedEvalScenarioByTurnId,
		runningEvalByTurnId,
		evalErrorByTurnId,
		showOnlyErrors = $bindable(false),
		timelineSearch = $bindable(''),
		expandedEventIds,
		eventTypeFilters,
		resetTimelineFilters,
		toggleEventType,
		toggleEventExpansion,
		updateSelectedEvalScenario,
		runPromptEval
	}: {
		visibleTimeline: SessionDetailPayload['timeline'];
		replayTimeline: SessionDetailPayload['timeline'];
		visibleTimelineGroups: TimelineGroup[];
		evalScenarios: PromptEvalScenario[];
		isLoadingEvalScenarios: boolean;
		selectedEvalScenarioByTurnId: Record<string, string>;
		runningEvalByTurnId: Record<string, boolean>;
		evalErrorByTurnId: Record<string, string | null>;
		showOnlyErrors: boolean;
		timelineSearch: string;
		expandedEventIds: Set<string>;
		eventTypeFilters: Record<TimelineType, boolean>;
		resetTimelineFilters: () => void;
		toggleEventType: (type: TimelineType) => void;
		toggleEventExpansion: (eventId: string) => void;
		updateSelectedEvalScenario: (turnRunId: string, value: string) => void;
		runPromptEval: (turnRunId: string) => void | Promise<void>;
	} = $props();
</script>

<details class="rounded-lg border border-border bg-background shadow-ink">
	<summary class="cursor-pointer list-none p-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div>
				<div class="text-sm font-semibold text-foreground">Full Audit Timeline</div>
				<div class="text-xs text-muted-foreground">
					{formatNumber(visibleTimeline.length)} of {formatNumber(replayTimeline.length)}
					events across {formatNumber(visibleTimelineGroups.length)}
					sections
				</div>
			</div>
			<div class="text-xs text-muted-foreground">
				Expand for raw events, evals, prompt snapshots, and filters
			</div>
		</div>
	</summary>
	<div class="border-t border-border p-3 space-y-3">
		<TimelineFilters
			{eventTypeFilters}
			bind:showOnlyErrors
			bind:timelineSearch
			{resetTimelineFilters}
			{toggleEventType}
		/>

		{#if visibleTimeline.length === 0}
			<div class="text-sm text-muted-foreground text-center py-8">
				No timeline events match the current filters.
			</div>
		{:else}
			<div class="space-y-3">
				{#each visibleTimelineGroups as group}
					<TimelineGroupCard
						{group}
						{evalScenarios}
						{isLoadingEvalScenarios}
						{selectedEvalScenarioByTurnId}
						{runningEvalByTurnId}
						{evalErrorByTurnId}
						{expandedEventIds}
						{toggleEventExpansion}
						{updateSelectedEvalScenario}
						{runPromptEval}
					/>
				{/each}
			</div>
		{/if}
	</div>
</details>
