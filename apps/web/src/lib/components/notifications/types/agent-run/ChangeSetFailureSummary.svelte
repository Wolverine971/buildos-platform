<!-- apps/web/src/lib/components/notifications/types/agent-run/ChangeSetFailureSummary.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { AlertCircle, MessageCircle } from '$lib/icons/lucide';
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
	<div class="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0">
				<div class="micro-label flex items-center gap-1.5 text-warning">
					<AlertCircle class="h-3.5 w-3.5 shrink-0" />
					{failedChanges.length} change{failedChanges.length === 1 ? '' : 's'} need follow-up
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					The commit finished, but these approved changes did not apply.
				</p>
			</div>
			{#if onChat}
				<Button
					variant="accent"
					size="sm"
					icon={MessageCircle}
					onclick={() => onChat?.()}
					disabled={openingChat}
					loading={openingChat}
					class="w-full text-xs sm:w-auto"
				>
					Chat
				</Button>
			{/if}
		</div>

		<div class="space-y-2">
			{#each failedChanges as change (change.id)}
				<div class="rounded-md border border-border bg-card p-2.5">
					<div class="line-clamp-2 break-words text-xs font-medium text-foreground">
						{labelFor(change)}
					</div>
					<p class="mt-1 break-words text-xs text-destructive">{change.error}</p>
				</div>
			{/each}
		</div>
	</div>
{/if}
