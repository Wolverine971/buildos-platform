<!-- apps/web/src/lib/components/admin/chat/TimelineEventCard.svelte -->
<script lang="ts">
	import { formatDateTime } from '$lib/services/admin/chat-session-audit-formatters';
	import { payloadField, stringValue } from '$lib/services/admin/chat-session-audit-payload';
	import {
		isToolCallEmittedEvent,
		isToolDetailTurnEvent,
		toolDisplayArguments,
		toolDisplayError,
		toolDisplayResult,
		toolDisplaySuccess,
		toolLifecycleDisplayState
	} from '$lib/services/admin/chat-session-audit-tool-lifecycle';
	import type {
		ChatSessionAuditPayload as SessionDetailPayload,
		TimelineGroup
	} from '$lib/services/admin/chat-session-audit-types';
	import { eventIcon, eventSeverityClasses, timelineDotClasses } from './session-audit-ui';
	import TimelineEvalRunDetails from './TimelineEvalRunDetails.svelte';
	import TimelineLlmCallDetails from './TimelineLlmCallDetails.svelte';
	import TimelineMessageDetails from './TimelineMessageDetails.svelte';
	import TimelinePromptSnapshotDetails from './TimelinePromptSnapshotDetails.svelte';
	import TimelineRawPayloadToggle from './TimelineRawPayloadToggle.svelte';
	import TimelineToolLifecycleDetails from './TimelineToolLifecycleDetails.svelte';
	import TimelineTurnEventDetails from './TimelineTurnEventDetails.svelte';
	import TimelineTurnRunDetails from './TimelineTurnRunDetails.svelte';

	let {
		group,
		event,
		eventIndex,
		expandedEventIds,
		toggleEventExpansion
	}: {
		group: TimelineGroup;
		event: SessionDetailPayload['timeline'][number];
		eventIndex: number;
		expandedEventIds: Set<string>;
		toggleEventExpansion: (eventId: string) => void;
	} = $props();

	let lifecycleState = $derived(toolLifecycleDisplayState(group.items, eventIndex));
</script>

{#if !lifecycleState.hideEvent}
	{@const EventIcon = eventIcon(lifecycleState.displayIconType)}
	{@const payload = lifecycleState.displayPayload}
	{@const rawPayload = lifecycleState.displayRawPayload}
	{@const isMergedToolLifecycle = isToolCallEmittedEvent(event) && !!lifecycleState.outcomeEvent}
	{@const isToolDisplay = event.type === 'tool_execution' || isMergedToolLifecycle}
	{@const isStandaloneToolTurnEvent = isToolDetailTurnEvent(event) && !isMergedToolLifecycle}
	{@const toolSuccess = isToolDisplay ? toolDisplaySuccess(payload) : null}
	{@const toolArguments = isToolDisplay ? toolDisplayArguments(payload) : undefined}
	{@const toolResult = isToolDisplay ? toolDisplayResult(payload) : undefined}
	{@const toolError = isToolDisplay ? toolDisplayError(payload) : ''}
	{@const turnEventToolSuccess = isStandaloneToolTurnEvent ? toolDisplaySuccess(payload) : null}
	{@const turnEventToolArguments = isStandaloneToolTurnEvent
		? toolDisplayArguments(payload)
		: undefined}
	{@const turnEventToolResult = isStandaloneToolTurnEvent
		? toolDisplayResult(payload)
		: undefined}
	{@const turnEventToolError = isStandaloneToolTurnEvent ? toolDisplayError(payload) : ''}
	{@const turnEventToolResultSource = isStandaloneToolTurnEvent
		? stringValue(payloadField(payload, 'tool_result_source'))
		: ''}
	<div class="relative pl-7">
		<div
			class="absolute left-[2px] top-3.5 h-3 w-3 rounded-full ring-2 ring-card {timelineDotClasses(
				lifecycleState.displaySeverity
			)}"
		></div>
		<div class="rounded-lg border border-border bg-background p-2.5 shadow-ink">
			<div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">
				<div class="flex items-center gap-2">
					<span
						class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium {eventSeverityClasses(
							lifecycleState.displaySeverity
						)}"
					>
						<EventIcon class="h-3 w-3" />
						{lifecycleState.displayBadgeLabel}
					</span>
					{#if event.turn_index}
						<span
							class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-foreground/70"
						>
							Turn {event.turn_index}
						</span>
					{/if}
				</div>
				<span class="text-xs text-muted-foreground">
					{formatDateTime(lifecycleState.displayTimestamp)}
				</span>
			</div>

			<div class="text-sm font-semibold text-foreground">
				{lifecycleState.displayTitle}
			</div>
			<div class="text-sm text-foreground/75 mt-1 whitespace-pre-wrap break-words">
				{lifecycleState.displaySummary}
			</div>

			<TimelineMessageDetails {event} {payload} />

			<TimelineToolLifecycleDetails
				{isToolDisplay}
				{payload}
				{toolSuccess}
				{toolArguments}
				{toolResult}
				{toolError}
			/>

			<TimelineLlmCallDetails {event} {payload} />

			<TimelineTurnRunDetails {event} {payload} />

			<TimelinePromptSnapshotDetails {event} {payload} />

			<TimelineTurnEventDetails
				{event}
				{payload}
				{isMergedToolLifecycle}
				{isStandaloneToolTurnEvent}
				{turnEventToolSuccess}
				{turnEventToolArguments}
				{turnEventToolResult}
				{turnEventToolError}
				{turnEventToolResultSource}
			/>

			<TimelineEvalRunDetails {event} {payload} />

			<TimelineRawPayloadToggle
				eventId={lifecycleState.displayEventId}
				{rawPayload}
				{expandedEventIds}
				{toggleEventExpansion}
			/>
		</div>
	</div>
{/if}
