<!-- apps/web/src/lib/components/admin/chat/TimelineEvalRunDetails.svelte -->
<script lang="ts">
	import { payloadSummaryAssertionCount } from '$lib/services/admin/chat-session-audit-evals';
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

{#if event.type === 'eval_run'}
	<div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Scenario</div>
			<div class="font-semibold text-foreground break-all">
				{stringValue(payloadField(payload, 'scenario_slug')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Status</div>
			<div class="font-semibold text-foreground">
				{stringValue(payloadField(payload, 'status')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Passed</div>
			<div class="font-semibold text-foreground">
				{payloadSummaryAssertionCount(payload, 'passed')}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Failed</div>
			<div class="font-semibold text-foreground">
				{payloadSummaryAssertionCount(payload, 'failed')}
			</div>
		</div>
	</div>
{/if}
