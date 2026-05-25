<!-- apps/web/src/lib/components/admin/chat/SupervisorEventCard.svelte -->
<script lang="ts">
	import { ShieldCheck } from 'lucide-svelte';
	import {
		formatDateTime,
		formatNumber,
		prettyJson
	} from '$lib/services/admin/chat-session-audit-formatters';
	import { payloadField, stringValue } from '$lib/services/admin/chat-session-audit-payload';
	import type { ConversationTurn } from '$lib/services/admin/chat-session-audit-types';

	let { event }: { event: ConversationTurn['supervisorEvents'][number] } = $props();
	let payload = $derived(event.payload ?? {});
</script>

<details class="rounded-lg border border-amber-500/20 bg-amber-500/5">
	<summary class="cursor-pointer list-none px-3 py-2">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex min-w-0 items-center gap-2">
				<span
					class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
				>
					<ShieldCheck class="h-3.5 w-3.5" />
				</span>
				<div class="min-w-0">
					<div class="truncate text-sm font-semibold text-foreground">
						{event.title}
					</div>
					<div class="text-xs text-muted-foreground">
						{event.summary || 'Supervisor event recorded'}
					</div>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
				{#if payloadField(payload, 'supervisor_action')}
					<span class="rounded-full bg-background px-2 py-0.5 text-foreground/80">
						{stringValue(payloadField(payload, 'supervisor_action'))}
					</span>
				{/if}
				{#if payloadField(payload, 'supervisor_source')}
					<span class="rounded-full bg-background px-2 py-0.5 text-foreground/70">
						{stringValue(payloadField(payload, 'supervisor_source'))}
					</span>
				{/if}
				{#if payloadField(payload, 'supervisor_trigger')}
					<span class="rounded-full bg-background px-2 py-0.5 text-foreground/70">
						{stringValue(payloadField(payload, 'supervisor_trigger'))}
					</span>
				{/if}
				<span class="rounded-full bg-background px-2 py-0.5 text-foreground/70">
					{formatDateTime(event.timestamp)}
				</span>
			</div>
		</div>
	</summary>
	<div class="border-t border-amber-500/20 p-3 space-y-2">
		<div class="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="font-medium text-foreground/60">Event</div>
				<div class="break-all font-semibold text-foreground">
					{stringValue(payloadField(payload, 'event_type')) || '-'}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="font-medium text-foreground/60">Reason</div>
				<div class="break-all font-semibold text-foreground">
					{stringValue(payloadField(payload, 'supervisor_reason')) || '-'}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="font-medium text-foreground/60">Phase</div>
				<div class="break-all font-semibold text-foreground">
					{stringValue(payloadField(payload, 'phase')) || '-'}
				</div>
			</div>
			<div class="rounded border border-border bg-card px-2 py-1.5">
				<div class="font-medium text-foreground/60">Sequence</div>
				<div class="break-all font-semibold text-foreground">
					{formatNumber(Number(payloadField(payload, 'sequence_index') || 0))}
				</div>
			</div>
		</div>
		{#if payloadField(payload, 'supervisor_question')}
			<div
				class="rounded border border-amber-500/20 bg-background px-2.5 py-2 text-xs text-foreground"
			>
				{stringValue(payloadField(payload, 'supervisor_question'))}
			</div>
		{/if}
		<details class="rounded border border-border bg-card p-2 text-xs">
			<summary class="cursor-pointer font-medium text-foreground">
				Raw Supervisor Payload
			</summary>
			<pre
				class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{prettyJson(
					payload
				)}</pre>
		</details>
	</div>
</details>
