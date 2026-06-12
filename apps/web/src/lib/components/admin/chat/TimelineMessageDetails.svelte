<!-- apps/web/src/lib/components/admin/chat/TimelineMessageDetails.svelte -->
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

{#if event.type === 'message'}
	<div
		class="mt-2 rounded-lg border px-2.5 py-2 text-sm whitespace-pre-wrap break-words {stringValue(
			payloadField(payload, 'role')
		) === 'user'
			? 'bg-accent/8 border-accent/20'
			: stringValue(payloadField(payload, 'role')) === 'assistant'
				? 'bg-success/8 border-success/20'
				: 'bg-muted/40 border-border'}"
	>
		<div class="text-xs text-foreground/60 uppercase tracking-wide font-semibold mb-1">
			{stringValue(payloadField(payload, 'role')) || 'message'}
		</div>
		{stringValue(payloadField(payload, 'content')) || '(empty)'}
	</div>
	<div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-foreground/70">
		<span>
			Tokens: {formatNumber(Number(payloadField(payload, 'total_tokens') || 0))}
		</span>
		{#if payloadField(payload, 'error_message')}
			<span class="text-destructive">
				Error:
				{stringValue(payloadField(payload, 'error_message'))}
			</span>
		{/if}
	</div>
{/if}
