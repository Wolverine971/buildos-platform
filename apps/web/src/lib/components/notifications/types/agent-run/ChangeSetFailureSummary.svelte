<!-- apps/web/src/lib/components/notifications/types/agent-run/ChangeSetFailureSummary.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { AlertCircle, LoaderCircle, MessageCircle } from 'lucide-svelte';
	import type { ChangeSet, ProposedChange } from '@buildos/shared-types';

	let {
		changeSet,
		onChat,
		openingChat = false
	}: {
		changeSet: ChangeSet;
		onChat?: () => void | Promise<void>;
		openingChat?: boolean;
	} = $props();

	let failedChanges = $derived(
		changeSet.changes.filter(
			(change) => typeof change.error === 'string' && change.error.trim()
		)
	);

	function labelFor(change: ProposedChange): string {
		const action = change.action
			? `${change.action.charAt(0).toUpperCase()}${change.action.slice(1)}`
			: 'Change';
		return `${action} ${change.entity_type || 'entity'}`;
	}
</script>

{#if failedChanges.length}
	<div class="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-3">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<div
					class="flex items-center gap-1.5 text-xs font-medium text-warning uppercase tracking-wide"
				>
					<AlertCircle class="h-3.5 w-3.5" />
					{failedChanges.length} change{failedChanges.length === 1 ? '' : 's'} need follow-up
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					The commit finished, but these approved changes did not apply.
				</p>
			</div>
			{#if onChat}
				<button
					type="button"
					class="pressable inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent/15 disabled:opacity-50"
					onclick={() => onChat?.()}
					disabled={openingChat}
				>
					{#if openingChat}
						<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
					{:else}
						<MessageCircle class="h-3.5 w-3.5" />
					{/if}
					Chat
				</button>
			{/if}
		</div>

		<div class="space-y-2">
			{#each failedChanges as change (change.id)}
				<div class="rounded-md border border-border bg-card p-2.5">
					<div class="text-xs font-medium text-foreground">{labelFor(change)}</div>
					<p class="mt-1 text-xs text-destructive">{change.error}</p>
				</div>
			{/each}
		</div>
	</div>
{/if}
