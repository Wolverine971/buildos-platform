<!-- apps/web/src/lib/components/admin/chat/TimelineLlmCallDetails.svelte -->
<script lang="ts">
	import {
		formatCurrency,
		formatDuration,
		formatNumber
	} from '$lib/services/admin/chat-session-audit-formatters';
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

{#if event.type === 'llm_call'}
	<div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Variant</div>
			<div class="font-semibold text-foreground">
				{stringValue(
					payloadField(payload, 'prompt_variant') ||
						payloadField(payload, 'snapshot_version') ||
						'unknown'
				)}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Model</div>
			<div class="font-semibold text-foreground">
				{stringValue(payloadField(payload, 'model_used')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Provider</div>
			<div class="font-semibold text-foreground">
				{stringValue(payloadField(payload, 'provider')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Tokens</div>
			<div class="font-semibold text-foreground">
				{formatNumber(Number(payloadField(payload, 'total_tokens') || 0))}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Cost</div>
			<div class="font-semibold text-foreground">
				{formatCurrency(Number(payloadField(payload, 'total_cost_usd') || 0))}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Latency</div>
			<div class="font-semibold text-foreground">
				{formatDuration(payloadField(payload, 'response_time_ms'))}
			</div>
		</div>
	</div>
{/if}
