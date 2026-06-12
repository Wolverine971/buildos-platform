<!-- apps/web/src/lib/components/admin/chat/ConversationToolCallCard.svelte -->
<script lang="ts">
	import { Wrench } from 'lucide-svelte';
	import { formatDuration, prettyJson } from '$lib/services/admin/chat-session-audit-formatters';
	import {
		metadataEntries,
		metadataValueLabel
	} from '$lib/services/admin/chat-session-audit-payload';
	import type { ConversationTurn } from '$lib/services/admin/chat-session-audit-types';
	import { eventSeverityClasses } from './session-audit-ui';

	let { tool }: { tool: ConversationTurn['toolCalls'][number] } = $props();
</script>

<details class="rounded-lg border border-border bg-background">
	<summary class="cursor-pointer list-none px-3 py-2">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex min-w-0 items-center gap-2">
				<span
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border {eventSeverityClasses(
						tool.severity
					)}"
				>
					<Wrench class="h-3.5 w-3.5" />
				</span>
				<div class="min-w-0">
					<div class="truncate text-sm font-semibold text-foreground">
						{tool.toolName}
					</div>
					<div class="text-xs text-muted-foreground">
						{tool.summary}
					</div>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
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
				<span class="rounded-full bg-muted px-2 py-0.5 text-foreground/70">
					{tool.sourceLabel}
				</span>
			</div>
		</div>
	</summary>
	<div class="border-t border-border p-3 space-y-2">
		<div class="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
			{#each metadataEntries(tool.metadata) as [key, value]}
				<div class="rounded border border-border bg-card px-2 py-1.5">
					<div class="font-medium text-foreground/60">
						{key}
					</div>
					<div class="break-all font-semibold text-foreground">
						{metadataValueLabel(value)}
					</div>
				</div>
			{/each}
		</div>

		{#if tool.error}
			<div
				class="rounded border border-destructive/20 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
			>
				{tool.error}
			</div>
		{/if}

		{#if tool.arguments !== undefined}
			<details class="rounded border border-border bg-card p-2 text-xs">
				<summary class="cursor-pointer font-medium text-foreground"> Arguments </summary>
				<pre
					class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
						tool.arguments
					)}</pre>
			</details>
		{/if}
		{#if tool.result !== undefined}
			<details class="rounded border border-border bg-card p-2 text-xs">
				<summary class="cursor-pointer font-medium text-foreground"> Result </summary>
				<pre
					class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
						tool.result
					)}</pre>
			</details>
		{/if}
		{#if tool.linkedToolExecution}
			<details class="rounded border border-border bg-card p-2 text-xs">
				<summary class="cursor-pointer font-medium text-foreground">
					Linked Tool Execution
				</summary>
				<pre
					class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
						tool.linkedToolExecution
					)}</pre>
			</details>
		{/if}
		{#if tool.linkedToolMessage}
			<details class="rounded border border-border bg-card p-2 text-xs">
				<summary class="cursor-pointer font-medium text-foreground">
					Linked Tool Message
				</summary>
				<pre
					class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
						tool.linkedToolMessage
					)}</pre>
			</details>
		{/if}
		<details class="rounded border border-border bg-card p-2 text-xs">
			<summary class="cursor-pointer font-medium text-foreground"> Raw Tool Payload </summary>
			<pre
				class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
					tool.rawPayload
				)}</pre>
		</details>
	</div>
</details>
