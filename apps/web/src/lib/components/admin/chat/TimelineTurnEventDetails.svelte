<!-- apps/web/src/lib/components/admin/chat/TimelineTurnEventDetails.svelte -->
<script lang="ts">
	import {
		formatDateTime,
		formatDuration,
		formatNumber,
		prettyJson
	} from '$lib/services/admin/chat-session-audit-formatters';
	import { payloadField, stringValue } from '$lib/services/admin/chat-session-audit-payload';
	import type {
		AuditRecord,
		ChatSessionAuditPayload as SessionDetailPayload
	} from '$lib/services/admin/chat-session-audit-types';
	import {
		toolDisplayDuration,
		toolDisplayName
	} from '$lib/services/admin/chat-session-audit-tool-lifecycle';

	let {
		event,
		payload,
		isMergedToolLifecycle,
		isStandaloneToolTurnEvent,
		turnEventToolSuccess,
		turnEventToolArguments,
		turnEventToolResult,
		turnEventToolError,
		turnEventToolResultSource
	}: {
		event: SessionDetailPayload['timeline'][number];
		payload: AuditRecord;
		isMergedToolLifecycle: boolean;
		isStandaloneToolTurnEvent: boolean;
		turnEventToolSuccess: boolean | null;
		turnEventToolArguments: unknown;
		turnEventToolResult: unknown;
		turnEventToolError: string;
		turnEventToolResultSource: string;
	} = $props();
</script>

{#if event.type === 'turn_event'}
	{#if isMergedToolLifecycle}
		<div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="text-foreground/60 font-medium">Emitted Seq</div>
				<div class="font-semibold text-foreground">
					{formatNumber(Number(payloadField(payload, 'emitted_sequence_index') || 0))}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="text-foreground/60 font-medium">Returned Seq</div>
				<div class="font-semibold text-foreground">
					{formatNumber(Number(payloadField(payload, 'outcome_sequence_index') || 0))}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="text-foreground/60 font-medium">Tool Call ID</div>
				<div class="font-semibold text-foreground break-all">
					{stringValue(payloadField(payload, 'tool_call_id')) || '-'}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="text-foreground/60 font-medium">Result Source</div>
				<div class="font-semibold text-foreground break-all">
					{stringValue(payloadField(payload, 'tool_result_source')) || '-'}
				</div>
			</div>
		</div>
		<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
			<span>
				Started:
				{formatDateTime(stringValue(payloadField(payload, 'emitted_at')))}
			</span>
			{#if payloadField(payload, 'outcome_at')}
				<span>
					Returned:
					{formatDateTime(stringValue(payloadField(payload, 'outcome_at')))}
				</span>
			{/if}
		</div>
	{:else}
		<div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="text-foreground/60 font-medium">Phase</div>
				<div class="font-semibold text-foreground">
					{stringValue(payloadField(payload, 'phase')) || '-'}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="text-foreground/60 font-medium">Sequence</div>
				<div class="font-semibold text-foreground">
					{formatNumber(Number(payloadField(payload, 'sequence_index') || 0))}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="text-foreground/60 font-medium">Event Type</div>
				<div class="font-semibold text-foreground break-all">
					{stringValue(payloadField(payload, 'event_type')) || '-'}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="text-foreground/60 font-medium">Stream Run</div>
				<div class="font-semibold text-foreground break-all">
					{stringValue(payloadField(payload, 'stream_run_id')) || '-'}
				</div>
			</div>
		</div>
		{#if isStandaloneToolTurnEvent && (stringValue(payloadField(payload, 'tool_name')) || turnEventToolArguments !== undefined || turnEventToolResult !== undefined || turnEventToolError)}
			<div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
				<div class="rounded border border-border bg-card px-2 py-1.5">
					<div class="text-foreground/60 font-medium">Tool</div>
					<div class="font-semibold text-foreground break-all">
						{toolDisplayName(payload)}
					</div>
				</div>
				<div class="rounded border border-border bg-card px-2 py-1.5">
					<div class="text-foreground/60 font-medium">Success</div>
					<div
						class="font-semibold {turnEventToolSuccess === false
							? 'text-destructive'
							: turnEventToolSuccess === true
								? 'text-success'
								: 'text-foreground'}"
					>
						{turnEventToolSuccess === null
							? '-'
							: turnEventToolSuccess
								? 'true'
								: 'false'}
					</div>
				</div>
				<div class="rounded border border-border bg-card px-2 py-1.5">
					<div class="text-foreground/60 font-medium">Duration</div>
					<div class="font-semibold text-foreground">
						{formatDuration(toolDisplayDuration(payload))}
					</div>
				</div>
				<div class="rounded border border-border bg-card px-2 py-1.5">
					<div class="text-foreground/60 font-medium">Result Source</div>
					<div class="font-semibold text-foreground break-all">
						{turnEventToolResultSource || '-'}
					</div>
				</div>
			</div>
			{#if turnEventToolError}
				<div class="mt-2 text-xs text-destructive">
					{turnEventToolError}
				</div>
			{/if}
			{#if turnEventToolArguments !== undefined}
				<details class="mt-2 rounded border border-border bg-card p-2 text-xs">
					<summary class="cursor-pointer font-medium text-foreground">
						Tool Arguments
					</summary>
					<pre
						class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
							turnEventToolArguments
						)}</pre>
				</details>
			{/if}
			{#if turnEventToolResult !== undefined}
				<details class="mt-2 rounded border border-border bg-card p-2 text-xs">
					<summary class="cursor-pointer font-medium text-foreground">
						Tool Result
					</summary>
					<pre
						class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
							turnEventToolResult
						)}</pre>
				</details>
			{/if}
		{/if}
	{/if}
{/if}
