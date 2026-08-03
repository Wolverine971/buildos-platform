<!-- apps/web/src/lib/components/admin/chat/ConversationToolCallCard.svelte -->
<script lang="ts">
	import { ChevronDown, Code2, Wrench } from '$lib/icons/lucide';
	import { formatDuration, prettyJson } from '$lib/services/admin/chat-session-audit-formatters';
	import {
		metadataEntries,
		metadataValueLabel
	} from '$lib/services/admin/chat-session-audit-payload';
	import {
		buildToolPayloadOverview,
		normalizeToolPayloadValue
	} from '$lib/services/admin/chat-session-audit-tool-presentation';
	import { conversationToolTargetId } from '$lib/services/admin/chat-session-flow-targets';
	import type { ConversationTurn } from '$lib/services/admin/chat-session-audit-types';
	import { eventSeverityClasses } from './session-audit-ui';
	import ToolPayloadPanel from './ToolPayloadPanel.svelte';

	let {
		tool,
		turnId
	}: {
		tool: ConversationTurn['toolCalls'][number];
		turnId: string;
	} = $props();

	let requestValue = $derived(normalizeToolPayloadValue(tool.arguments));
	let responseValue = $derived(normalizeToolPayloadValue(tool.result));
	let requestOverview = $derived(buildToolPayloadOverview(requestValue, 'request'));
	let operationLabel = $derived(tool.canonicalOp || tool.summary);
	let headerSummary = $derived(
		[operationLabel, requestOverview.headline]
			.filter(Boolean)
			.filter((value, index, values) => values.indexOf(value) === index)
			.join(' · ')
	);
</script>

<details
	id={conversationToolTargetId(turnId, tool.id)}
	class="group rounded-lg border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
>
	<summary
		class="cursor-pointer list-none rounded-lg px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
	>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex min-w-0 items-center gap-2">
				<span
					class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border {eventSeverityClasses(
						tool.severity
					)}"
				>
					<Wrench class="h-4 w-4" />
				</span>
				<div class="min-w-0">
					<div class="truncate text-sm font-semibold text-foreground">
						{tool.toolName}
					</div>
					<div class="truncate text-xs text-muted-foreground">
						{headerSummary || 'Tool call'}
					</div>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-1.5 text-2xs font-medium">
				<span
					class="rounded-full px-2 py-0.5 {tool.success === false
						? 'bg-destructive/10 text-destructive'
						: tool.success === true
							? 'bg-success/10 text-success'
							: 'bg-muted text-foreground/70'}"
				>
					{tool.statusLabel}
				</span>
				<span class="rounded-full bg-muted px-2 py-0.5 text-foreground/70">
					{formatDuration(tool.duration)}
				</span>
				<ChevronDown
					class="ml-0.5 h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
				/>
			</div>
		</div>
	</summary>
	<div class="space-y-3 border-t border-border p-3">
		{#if tool.error}
			<div
				class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground"
				role="alert"
			>
				<span class="font-semibold text-destructive">Tool error:</span>
				<span class="break-words">{tool.error}</span>
			</div>
		{/if}

		<div class="grid grid-cols-1 gap-3 xl:grid-cols-2">
			<ToolPayloadPanel
				kind="request"
				value={requestValue}
				emptyLabel="No request payload was recorded for this event."
			/>
			<ToolPayloadPanel
				kind="response"
				value={responseValue}
				emptyLabel={tool.error
					? 'The tool failed before a response payload was recorded.'
					: 'No response payload was recorded for this event.'}
			/>
		</div>

		<details class="group overflow-hidden rounded-md border border-border bg-card text-xs">
			<summary
				class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
			>
				<span class="flex min-w-0 items-center gap-2">
					<Code2 class="h-4 w-4 shrink-0" />
					<span class="font-semibold">Technical details</span>
					<span class="truncate text-2xs">{tool.sourceLabel}</span>
				</span>
				<ChevronDown
					class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
				/>
			</summary>
			<div class="space-y-2 border-t border-border p-3">
				{#if metadataEntries(tool.metadata).length > 0}
					<div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
						{#each metadataEntries(tool.metadata) as [key, value] (key)}
							<div
								class="min-w-0 rounded-md border border-border bg-background px-2.5 py-2"
							>
								<div class="micro-label text-muted-foreground">{key}</div>
								<div class="mt-0.5 break-all font-medium text-foreground">
									{metadataValueLabel(value)}
								</div>
							</div>
						{/each}
					</div>
				{/if}

				{#if tool.linkedToolExecution}
					<details class="overflow-hidden rounded-md border border-border bg-background">
						<summary
							class="min-h-11 cursor-pointer px-3 py-2.5 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
						>
							Linked tool execution
						</summary>
						<pre
							class="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted/40 p-3 text-foreground">{prettyJson(
								tool.linkedToolExecution
							)}</pre>
					</details>
				{/if}
				{#if tool.linkedToolMessage}
					<details class="overflow-hidden rounded-md border border-border bg-background">
						<summary
							class="min-h-11 cursor-pointer px-3 py-2.5 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
						>
							Linked tool message
						</summary>
						<pre
							class="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted/40 p-3 text-foreground">{prettyJson(
								tool.linkedToolMessage
							)}</pre>
					</details>
				{/if}
				<details class="overflow-hidden rounded-md border border-border bg-background">
					<summary
						class="min-h-11 cursor-pointer px-3 py-2.5 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
					>
						Raw event payload
					</summary>
					<pre
						class="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted/40 p-3 text-foreground">{prettyJson(
							tool.rawPayload
						)}</pre>
				</details>
			</div>
		</details>
	</div>
</details>
