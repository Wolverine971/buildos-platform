<!-- apps/web/src/lib/components/admin/chat/ConversationTurnHeader.svelte -->
<script lang="ts">
	import {
		formatDateTime,
		formatNumber,
		pluralize
	} from '$lib/services/admin/chat-session-audit-formatters';
	import type { ConversationTurn } from '$lib/services/admin/chat-session-audit-types';
	import { statusBadge } from './session-audit-ui';

	let { turn }: { turn: ConversationTurn } = $props();
</script>

<div class="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
	<span class="rounded-full bg-background px-2 py-0.5 text-foreground/80">
		{turn.turnIndex === null ? 'Session' : `Turn ${turn.turnIndex}`}
	</span>
	<span class="rounded-full px-2 py-0.5 {statusBadge(turn.status)}">
		{turn.status}
	</span>
	<span>{formatDateTime(turn.startedAt)}</span>
	{#if turn.toolCalls.length > 0}
		<span class="rounded-full bg-background px-2 py-0.5">
			{formatNumber(turn.toolCalls.length)} tool
			{pluralize(turn.toolCalls.length, 'call')}
		</span>
	{/if}
	{#if turn.llmCalls.length > 0}
		<span class="rounded-full bg-background px-2 py-0.5">
			{formatNumber(turn.llmCalls.length)} LLM
			{pluralize(turn.llmCalls.length, 'call')}
		</span>
	{/if}
	{#if turn.errors > 0}
		<span class="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
			{formatNumber(turn.errors)}
			{pluralize(turn.errors, 'error')}
		</span>
	{/if}
</div>
