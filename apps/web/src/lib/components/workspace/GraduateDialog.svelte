<!-- apps/web/src/lib/components/workspace/GraduateDialog.svelte -->
<!--
	"Start a project from these": the one place loose items become a project. Opened from
	an agent grouping or from items the person selected. They confirm the name (the
	agent's proposal is only a starting point) and which items go in; nothing is created
	until they press Start. The result can be undone from the toast.
-->
<script lang="ts">
	import { CircleCheck, FileText, StickyNote } from '$lib/icons/lucide';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { itemRef, type LooseItem, type WorkspaceSuggestion } from './workspace-model';

	let {
		open,
		suggestion,
		items,
		busy = false,
		error = '',
		onConfirm,
		onClose
	}: {
		open: boolean;
		suggestion: WorkspaceSuggestion | null;
		items: LooseItem[];
		busy?: boolean;
		error?: string;
		onConfirm: (input: { name: string; items: LooseItem[] }) => void;
		onClose: () => void;
	} = $props();

	let name = $state('');
	let chosen = $state<Set<string>>(new Set());
	let seededFor = '';

	// Seed once per opening: the proposal's name and every item checked.
	$effect(() => {
		const key = open ? `${suggestion?.id ?? 'pick'}:${items.map(itemRef).join(',')}` : '';
		if (!open || key === seededFor) return;
		seededFor = key;
		name = suggestion?.proposed_name ?? (items.length === 1 ? items[0]!.title : '');
		chosen = new Set(items.map(itemRef));
	});
	$effect(() => {
		if (!open) seededFor = '';
	});

	const picked = $derived(items.filter((item) => chosen.has(itemRef(item))));
	const canStart = $derived(name.trim().length > 0 && picked.length > 0 && !busy);

	function toggle(item: LooseItem) {
		const key = itemRef(item);
		const next = new Set(chosen);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		chosen = next;
	}

	function submit(event?: SubmitEvent) {
		event?.preventDefault();
		if (!canStart) return;
		onConfirm({ name: name.trim(), items: picked });
	}
</script>

<Modal isOpen={open} {onClose} title="Start a project" size="sm" persistent={busy}>
	<form class="grid gap-4 px-4 pb-2 pt-3 sm:px-5" onsubmit={submit}>
		{#if suggestion?.reason}
			<p
				class="rounded-lg px-3 py-2 text-sm text-muted-foreground wt-ghost tx tx-bloom tx-weak"
			>
				{suggestion.reason}
			</p>
		{/if}
		<label class="grid gap-1.5">
			<span class="micro-label text-muted-foreground">PROJECT NAME</span>
			<input
				class="min-h-11 rounded-lg border border-border bg-card px-3 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm [@media(pointer:fine)]:min-h-9"
				bind:value={name}
				maxlength="120"
				placeholder="What is this effort?"
				disabled={busy}
				data-autofocus
			/>
		</label>
		<fieldset class="grid gap-1">
			<legend class="micro-label mb-1.5 text-muted-foreground">
				MOVES IN · {picked.length} of {items.length}
			</legend>
			<ul class="grid max-h-64 gap-0.5 overflow-y-auto">
				{#each items as item (itemRef(item))}
					<li>
						<label class="row">
							<input
								type="checkbox"
								checked={chosen.has(itemRef(item))}
								disabled={busy}
								onchange={() => toggle(item)}
							/>
							<span class="glyph" aria-hidden="true">
								{#if item.kind === 'task'}<CircleCheck
										class="h-3.5 w-3.5"
									/>{:else if item.kind === 'note'}<StickyNote
										class="h-3.5 w-3.5"
									/>{:else}<FileText class="h-3.5 w-3.5" />{/if}
							</span>
							<span class="truncate text-sm text-foreground">{item.title}</span>
						</label>
					</li>
				{/each}
			</ul>
		</fieldset>
		<p class="text-xs text-muted-foreground">
			The project starts with these items moved in, and its own Start Here doc. You can undo
			it from the next message.
		</p>
		{#if error}
			<p class="text-sm text-destructive" role="alert">{error}</p>
		{/if}
		<button type="submit" class="sr-only" tabindex="-1">Start project</button>
	</form>
	{#snippet footer()}
		<div class="flex justify-end gap-2 px-4 py-3 sm:px-5">
			<Button variant="ghost" size="sm" onclick={onClose} disabled={busy}>Cancel</Button>
			<Button
				variant="primary"
				size="sm"
				loading={busy}
				disabled={!canStart}
				onclick={() => submit()}
			>
				Start project
			</Button>
		</div>
	{/snippet}
</Modal>

<style>
	.row {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
		min-height: 2.5rem;
		padding: 0 0.4rem;
		border-radius: 0.45rem;
		cursor: pointer;
	}
	.row:hover {
		background: hsl(var(--muted) / 0.6);
	}
	.row input {
		width: 1rem;
		height: 1rem;
		accent-color: hsl(var(--accent));
	}
	.glyph {
		color: hsl(var(--muted-foreground));
	}
</style>
