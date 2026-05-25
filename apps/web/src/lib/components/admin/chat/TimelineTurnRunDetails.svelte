<!-- apps/web/src/lib/components/admin/chat/TimelineTurnRunDetails.svelte -->
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

{#if event.type === 'turn_run'}
	<div class="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Lane</div>
			<div class="font-semibold text-foreground break-all">
				{stringValue(payloadField(payload, 'first_lane')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">First Skill</div>
			<div class="font-semibold text-foreground break-all">
				{stringValue(payloadField(payload, 'first_skill_path')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">First Op</div>
			<div class="font-semibold text-foreground break-all">
				{stringValue(payloadField(payload, 'first_canonical_op')) || '-'}
			</div>
		</div>
		<div class="rounded border border-border bg-card px-2 py-1.5">
			<div class="text-foreground/60 font-medium">Validation Failures</div>
			<div class="font-semibold text-foreground">
				{formatNumber(Number(payloadField(payload, 'validation_failure_count') || 0))}
			</div>
		</div>
	</div>
{/if}
