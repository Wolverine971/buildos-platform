<!-- apps/web/src/lib/components/admin/chat/TimelineToolLifecycleDetails.svelte -->
<script lang="ts">
	import {
		formatDuration,
		formatNumber,
		prettyJson
	} from '$lib/services/admin/chat-session-audit-formatters';
	import type { AuditRecord } from '$lib/services/admin/chat-session-audit-types';
	import {
		isTraceToolPayload,
		toolDisplayDuration,
		toolDisplayName,
		toolDisplayTokens
	} from '$lib/services/admin/chat-session-audit-tool-lifecycle';

	let {
		isToolDisplay,
		payload,
		toolSuccess,
		toolArguments,
		toolResult,
		toolError
	}: {
		isToolDisplay: boolean;
		payload: AuditRecord;
		toolSuccess: boolean | null;
		toolArguments: unknown;
		toolResult: unknown;
		toolError: string;
	} = $props();
</script>

{#if isToolDisplay}
	<div class="mt-2 flex flex-wrap items-center gap-1.5">
		{#if isTraceToolPayload(payload)}
			<span
				class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground/70"
			>
				Trace
			</span>
		{/if}
		{#if toolError}
			<span
				class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-destructive/10 text-destructive"
			>
				Error
			</span>
		{/if}
	</div>
	<div class="mt-2 grid grid-cols-2 gap-1.5 text-xs">
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Tool</div>
			<div class="font-semibold text-foreground break-all">
				{toolDisplayName(payload)}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Duration</div>
			<div class="font-semibold text-foreground">
				{formatDuration(toolDisplayDuration(payload))}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Success</div>
			<div
				class="font-semibold {toolSuccess === false
					? 'text-destructive'
					: toolSuccess === true
						? 'text-success'
						: 'text-foreground'}"
			>
				{toolSuccess === null ? '-' : toolSuccess ? 'true' : 'false'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Tool Tokens</div>
			<div class="font-semibold text-foreground">
				{formatNumber(toolDisplayTokens(payload))}
			</div>
		</div>
	</div>
	{#if toolError}
		<div class="mt-2 text-xs text-destructive">
			{toolError}
		</div>
	{/if}
	{#if toolArguments !== undefined}
		<details class="mt-2 rounded border border-border bg-card p-2 text-xs">
			<summary class="cursor-pointer font-medium text-foreground"> Tool Arguments </summary>
			<pre
				class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
					toolArguments
				)}</pre>
		</details>
	{/if}
	{#if toolResult !== undefined}
		<details class="mt-2 rounded border border-border bg-card p-2 text-xs">
			<summary class="cursor-pointer font-medium text-foreground"> Tool Result </summary>
			<pre
				class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
					toolResult
				)}</pre>
		</details>
	{/if}
{/if}
