<!-- apps/web/src/lib/components/admin/chat/ConversationReplay.svelte -->
<script lang="ts">
	import { MessageSquare } from 'lucide-svelte';
	import { formatNumber, pluralize } from '$lib/services/admin/chat-session-audit-formatters';
	import type {
		ChatSessionAuditPayload as SessionDetailPayload,
		ConversationTurn
	} from '$lib/services/admin/chat-session-audit-types';
	import BuildOsActivityDrawer from './BuildOsActivityDrawer.svelte';
	import ConversationMessageBubble from './ConversationMessageBubble.svelte';
	import ConversationTurnHeader from './ConversationTurnHeader.svelte';

	let {
		sessionDetail,
		conversationTurns
	}: {
		sessionDetail: SessionDetailPayload;
		conversationTurns: ConversationTurn[];
	} = $props();
</script>

{#if conversationTurns.length === 0}
	<div
		class="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground"
	>
		<MessageSquare class="h-8 w-8 mx-auto mb-2 opacity-60" />
		No conversation messages were recorded for this session.
	</div>
{:else}
	<section
		class="rounded-lg border border-border bg-muted p-3 shadow-ink"
		aria-label="Conversation replay"
	>
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<div>
				<div class="text-sm font-semibold text-foreground">Chat Replay</div>
				<div class="text-xs text-muted-foreground">
					{formatNumber(conversationTurns.length)}
					{pluralize(conversationTurns.length, 'turn')} ·
					{formatNumber(sessionDetail.metrics.tool_calls)} tool
					{pluralize(sessionDetail.metrics.tool_calls, 'call')} ·
					{formatNumber(sessionDetail.metrics.llm_calls)} LLM
					{pluralize(sessionDetail.metrics.llm_calls, 'call')}
				</div>
			</div>
			<div class="text-xs text-muted-foreground">Tool calls are collapsed by default</div>
		</div>

		<div class="space-y-4">
			{#each conversationTurns as turn}
				<div class="space-y-2">
					<ConversationTurnHeader {turn} />

					{#each turn.userMessages as message}
						<ConversationMessageBubble {message} variant="user" />
					{/each}

					<BuildOsActivityDrawer {turn} />

					{#each turn.assistantMessages as message}
						<ConversationMessageBubble {message} variant="assistant" />
					{/each}

					{#each turn.otherMessages as message}
						<ConversationMessageBubble {message} variant="other" />
					{/each}
				</div>
			{/each}
		</div>
	</section>
{/if}
