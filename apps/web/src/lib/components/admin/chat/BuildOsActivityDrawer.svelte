<!-- apps/web/src/lib/components/admin/chat/BuildOsActivityDrawer.svelte -->
<script lang="ts">
	import { formatNumber, pluralize } from '$lib/services/admin/chat-session-audit-formatters';
	import type { ConversationTurn } from '$lib/services/admin/chat-session-audit-types';
	import ConversationToolCallCard from './ConversationToolCallCard.svelte';
	import SupervisorEventCard from './SupervisorEventCard.svelte';

	let { turn }: { turn: ConversationTurn } = $props();
</script>

{#if turn.toolCalls.length > 0 || turn.llmCalls.length > 0 || turn.promptSnapshots.length > 0 || turn.operations.length > 0 || turn.evalRuns.length > 0 || turn.supervisorEvents.length > 0}
	<details
		class="rounded-lg border border-border bg-card shadow-ink tx tx-thread tx-weak sm:ml-10"
	>
		<summary class="cursor-pointer list-none border-b border-border bg-background px-3 py-2">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div class="flex min-w-0 items-center gap-2">
					<span
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-foreground text-[10px] font-semibold uppercase text-background"
					>
						OS
					</span>
					<div class="min-w-0">
						<div class="text-xs font-semibold uppercase tracking-wide text-foreground">
							BuildOS activity
						</div>
						<div class="text-xs text-muted-foreground">
							Supervisor decisions, tools, LLM, prompts, and metadata.
						</div>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
					{#if turn.toolCalls.length > 0}
						<span class="rounded-full bg-muted px-2 py-0.5 text-foreground/80">
							{formatNumber(turn.toolCalls.length)}
							tool
							{pluralize(turn.toolCalls.length, 'call')}
						</span>
					{/if}
					{#if turn.supervisorEvents.length > 0}
						<span class="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
							{formatNumber(turn.supervisorEvents.length)}
							supervisor
						</span>
					{/if}
					{#if turn.llmCalls.length > 0}
						<span class="rounded-full bg-muted px-2 py-0.5 text-foreground/80">
							{formatNumber(turn.llmCalls.length)}
							LLM
						</span>
					{/if}
					{#if turn.promptSnapshots.length > 0}
						<span class="rounded-full bg-muted px-2 py-0.5 text-foreground/80">
							prompt
						</span>
					{/if}
				</div>
			</div>
		</summary>

		<div class="space-y-2 p-3">
			{#if turn.supervisorEvents.length > 0}
				<div class="space-y-2">
					{#each turn.supervisorEvents as event}
						<SupervisorEventCard {event} />
					{/each}
				</div>
			{/if}

			{#if turn.toolCalls.length > 0}
				<div class="space-y-2">
					{#each turn.toolCalls as tool}
						<ConversationToolCallCard {tool} />
					{/each}
				</div>
			{:else}
				<div class="text-xs text-muted-foreground">
					No tool calls recorded for this turn.
				</div>
			{/if}

			{#if turn.llmCalls.length > 0 || turn.promptSnapshots.length > 0 || turn.operations.length > 0 || turn.evalRuns.length > 0}
				<div class="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
					{#if turn.llmCalls.length > 0}
						<span class="rounded-full bg-background px-2 py-0.5">
							{formatNumber(turn.llmCalls.length)}
							LLM calls
						</span>
					{/if}
					{#if turn.promptSnapshots.length > 0}
						<span class="rounded-full bg-background px-2 py-0.5">
							{formatNumber(turn.promptSnapshots.length)}
							prompt snapshots
						</span>
					{/if}
					{#if turn.operations.length > 0}
						<span class="rounded-full bg-background px-2 py-0.5">
							{formatNumber(turn.operations.length)}
							operations
						</span>
					{/if}
					{#if turn.evalRuns.length > 0}
						<span class="rounded-full bg-background px-2 py-0.5">
							{formatNumber(turn.evalRuns.length)}
							evals
						</span>
					{/if}
				</div>
			{/if}
		</div>
	</details>
{/if}
