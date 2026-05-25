<!-- apps/web/src/lib/components/admin/chat/TimelineRawPayloadToggle.svelte -->
<script lang="ts">
	import { ChevronDown, ChevronRight } from 'lucide-svelte';
	import { prettyJson } from '$lib/services/admin/chat-session-audit-formatters';

	let {
		eventId,
		rawPayload,
		expandedEventIds,
		toggleEventExpansion
	}: {
		eventId: string;
		rawPayload: unknown;
		expandedEventIds: Set<string>;
		toggleEventExpansion: (eventId: string) => void;
	} = $props();
</script>

<div class="mt-2">
	<button
		type="button"
		onclick={() => toggleEventExpansion(eventId)}
		class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
	>
		{#if expandedEventIds.has(eventId)}
			<ChevronDown class="h-3 w-3" />
			Hide Raw Payload
		{:else}
			<ChevronRight class="h-3 w-3" />
			Show Raw Payload
		{/if}
	</button>
	{#if expandedEventIds.has(eventId)}
		<pre
			class="mt-2 bg-card border border-border rounded-lg p-3 text-xs text-foreground whitespace-pre-wrap break-words overflow-x-auto">{prettyJson(
				rawPayload
			)}</pre>
	{/if}
</div>
