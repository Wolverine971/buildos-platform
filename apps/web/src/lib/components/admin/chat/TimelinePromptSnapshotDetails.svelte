<!-- apps/web/src/lib/components/admin/chat/TimelinePromptSnapshotDetails.svelte -->
<script lang="ts">
	import { formatNumber } from '$lib/services/admin/chat-session-audit-formatters';
	import { payloadField, stringValue } from '$lib/services/admin/chat-session-audit-payload';
	import type {
		AuditRecord,
		ChatSessionAuditPayload as SessionDetailPayload
	} from '$lib/services/admin/chat-session-audit-types';

	let {
		event,
		payload
	}: {
		event: SessionDetailPayload['timeline'][number];
		payload: AuditRecord;
	} = $props();
</script>

{#if event.type === 'prompt_snapshot'}
	<div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Approx Tokens</div>
			<div class="font-semibold text-foreground">
				{formatNumber(Number(payloadField(payload, 'approx_prompt_tokens') || 0))}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">System Chars</div>
			<div class="font-semibold text-foreground">
				{formatNumber(Number(payloadField(payload, 'system_prompt_chars') || 0))}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Message Chars</div>
			<div class="font-semibold text-foreground">
				{formatNumber(Number(payloadField(payload, 'message_chars') || 0))}
			</div>
		</div>
	</div>
	{#if payloadField(payload, 'rendered_dump_text')}
		<details class="mt-2 rounded border border-border bg-card p-2 text-xs">
			<summary class="cursor-pointer font-medium text-foreground">
				Rendered Prompt Dump
			</summary>
			<pre
				class="mt-2 whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground">{stringValue(
					payloadField(payload, 'rendered_dump_text')
				)}</pre>
		</details>
	{/if}
{/if}
