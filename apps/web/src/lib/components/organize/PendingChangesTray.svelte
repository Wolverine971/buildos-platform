<!-- apps/web/src/lib/components/organize/PendingChangesTray.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import type { PlannedChange } from './organize-plan';
	let {
		changes,
		busy = false,
		disabled = false,
		reviewDisabled = false,
		onreview,
		onundo,
		onclear
	}: {
		changes: PlannedChange[];
		busy?: boolean;
		disabled?: boolean;
		reviewDisabled?: boolean;
		onreview: () => void;
		onundo: () => void;
		onclear: () => void;
	} = $props();
</script>

<section
	class="z-30 rounded-xl border border-border bg-card p-3 shadow-ink-strong sm:p-4 {changes.length
		? 'fixed bottom-2 left-3 right-3 mx-auto max-w-7xl'
		: 'mt-4'}"
	aria-label="Pending changes"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-sm font-semibold text-foreground" aria-live="polite">
			{changes.length} pending {changes.length === 1 ? 'move' : 'moves'}
		</h2>
		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="ghost"
				size="sm"
				disabled={!changes.length || disabled || busy}
				onclick={onundo}>Undo last</Button
			>
			<Button
				variant="ghost"
				size="sm"
				disabled={!changes.length || disabled || busy}
				onclick={onclear}>Discard all</Button
			>
			<Button
				size="sm"
				disabled={!changes.length || disabled || busy || reviewDisabled}
				loading={busy}
				onclick={onreview}>Review changes</Button
			>
		</div>
	</div>
	{#if changes.length}
		<ol class="mt-3 max-h-24 space-y-2 overflow-y-auto border-t border-border pt-3">
			{#each changes as change, index (`${index}:${change.move.id}`)}
				<li class="text-sm">
					<p class="font-medium text-foreground">{change.title}</p>
					<p class="text-xs text-muted-foreground">
						{change.source_name} → {change.destination_name}
						{#if change.child_count}
							· {change.child_count} child {change.child_count === 1
								? 'doc moves'
								: 'docs move'} too{/if}
						{#if change.shared_with_count !== null}
							· Shared with {change.shared_with_count} sub-projects{/if}
						{#if change.scheduled}
							· Calendar changes need review{/if}
					</p>
				</li>
			{/each}
		</ol>
	{/if}
	<p class="mt-2 text-xs text-muted-foreground">
		Changes are staged until you review their impact and apply them. Saved moves can be undone
		from History.
	</p>
</section>
