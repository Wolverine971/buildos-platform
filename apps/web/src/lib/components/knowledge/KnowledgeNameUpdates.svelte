<!-- apps/web/src/lib/components/knowledge/KnowledgeNameUpdates.svelte -->
<!--
	"Update the name in N places" on a knowledge card (tasker 167). After an entry is renamed, or
	a spelling fix folded "Phil Valeo" into "Phillip Velayo", tasks and docs tagged with it may
	still spell another full name. A quiet line says so; the dialog lists each place with the
	sentence before → after, every editable one ticked. Apply replaces exactly those words through
	the normal task/doc saves (history and versions kept), with one Undo that puts the old words
	back. Never changes text on its own; one-word references ("Phil") are never offered.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Loader2, Pencil } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		entityId: string;
		/** The entry's current name (a rename reloads the list). */
		name: string;
		/** Something changed in tasks/docs (the host may refresh). */
		onApplied?: () => void;
	}

	type Place = {
		mention_id: string;
		record_kind: 'task' | 'document';
		record_id: string;
		record_title: string;
		field: string;
		from: string;
		before: string;
		after: string;
		can_edit: boolean;
	};

	let { entityId, name, onApplied }: Props = $props();

	let places = $state.raw<Place[]>([]);
	let open = $state(false);
	let picked = $state<Record<string, boolean>>({});
	let applying = $state(false);

	$effect(() => {
		const id = entityId;
		void name; // reload after a rename
		places = [];
		const controller = new AbortController();
		void load(id, controller.signal);
		return () => controller.abort();
	});

	async function load(id: string, signal?: AbortSignal) {
		try {
			const response = await fetch(`/api/knowledge/entities/${id}/name-updates`, { signal });
			if (!response.ok) return;
			const body = await response.json();
			places = Array.isArray(body?.data?.places) ? body.data.places : [];
		} catch {
			// Optional: the card works without it.
		}
	}

	const editable = $derived(places.filter((p) => p.can_edit));
	const spellings = $derived([...new Set(places.map((p) => p.from))]);
	const chosen = $derived(editable.filter((p) => picked[p.mention_id]));

	function start() {
		picked = Object.fromEntries(editable.map((p) => [p.mention_id, true]));
		open = true;
	}

	async function send(changes: Array<{ mention_id: string; to: string }>) {
		const response = await fetch('/api/knowledge/name-updates', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ changes })
		});
		const body = await response.json().catch(() => null);
		if (!response.ok) throw new Error(body?.error ?? 'Could not update the names');
		return body.data as {
			applied: Array<{ mention_id: string; from: string; to: string }>;
			skipped: Array<{ mention_id: string; reason: string }>;
		};
	}

	async function apply() {
		if (!chosen.length || applying) return;
		applying = true;
		try {
			const result = await send(chosen.map((p) => ({ mention_id: p.mention_id, to: name })));
			open = false;
			const count = result.applied.length;
			const skipped = result.skipped.length
				? ` (${result.skipped.length} skipped: ${result.skipped[0]!.reason.toLowerCase()})`
				: '';
			if (!count) {
				toastService.info(`Nothing changed${skipped}`);
			} else {
				const undo = result.applied.map((a) => ({ mention_id: a.mention_id, to: a.from }));
				toastService.add({
					type: 'success',
					message: `Updated the name in ${count} place${count === 1 ? '' : 's'}${skipped}`,
					duration: 8000,
					action: {
						label: 'Undo',
						onClick: () => {
							void send(undo)
								.then(() => {
									toastService.success('Put the old names back');
									void load(entityId);
									onApplied?.();
								})
								.catch(() => toastService.error('Could not undo'));
						}
					}
				});
			}
			await load(entityId);
			onApplied?.();
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Could not update the names'
			);
		} finally {
			applying = false;
		}
	}
</script>

{#if places.length}
	<p
		class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground"
	>
		<span class="min-w-0">
			Still written “{spellings.slice(0, 2).join('”, “')}”{spellings.length > 2 ? '…' : ''} in
			{places.length} place{places.length === 1 ? '' : 's'}
		</span>
		{#if editable.length}
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={start}
			>
				<Pencil class="h-3 w-3" aria-hidden="true" /> Update to {name}
			</button>
		{/if}
	</p>
{/if}

{#if open}
	<Modal
		isOpen={true}
		onClose={() => (open = false)}
		title="Update the name in {editable.length} place{editable.length === 1 ? '' : 's'}"
		size="md"
	>
		<form
			class="flex flex-col gap-4 p-4 sm:p-5"
			onsubmit={(event) => {
				event.preventDefault();
				void apply();
			}}
		>
			<p class="text-sm text-muted-foreground">
				Only the tagged words change, to <span class="font-medium text-foreground"
					>{name}</span
				>. Each save keeps the record's history.
			</p>
			<ul class="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
				{#each places as place (place.mention_id)}
					<li>
						<label
							class="flex gap-3 rounded-lg border border-border bg-card p-3 {place.can_edit
								? 'cursor-pointer hover:bg-muted/40'
								: 'opacity-60'}"
						>
							<input
								type="checkbox"
								class="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
								disabled={!place.can_edit}
								bind:checked={picked[place.mention_id]}
							/>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-xs font-medium text-foreground">
									{place.record_kind === 'task' ? 'Task' : 'Doc'} · {place.record_title}
								</span>
								<span
									class="mt-1 block text-xs text-muted-foreground line-through decoration-muted-foreground/50"
									>{place.before}</span
								>
								<span class="mt-0.5 block text-xs text-foreground"
									>{place.after}</span
								>
								{#if !place.can_edit}
									<span class="mt-1 block text-xs text-muted-foreground"
										>You can’t edit this one.</span
									>
								{/if}
							</span>
						</label>
					</li>
				{/each}
			</ul>
			<div class="flex flex-wrap items-center justify-end gap-2">
				<button
					type="button"
					class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
					onclick={() => (open = false)}>Cancel</button
				>
				<button
					type="submit"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground pressable disabled:opacity-60"
					disabled={applying || !chosen.length}
				>
					{#if applying}
						<Loader2
							class="h-4 w-4 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					{/if}
					Update {chosen.length} place{chosen.length === 1 ? '' : 's'}
				</button>
			</div>
		</form>
	</Modal>
{/if}
