<!-- apps/web/src/lib/components/table-surfaces/TableInsertPicker.svelte -->
<!--
	Pick a table to embed in a document (the editor's "Table" toolbar button),
	or make a new one. Lists the project's tables from the doc tree payload, so
	no rows are loaded. Mount inside {#if open}; it closes through onClose.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Plus, Search, Table2 as Table } from '$lib/icons/lucide';
	import { isTableTypeKey, type LoadedTable } from '@buildos/shared-agent-ops/tables';
	import { formatRowCount, tableRowCountOf } from './table-surface-utils';

	type TableOption = { id: string; title: string; rowCount: number | null; updatedAt: string };

	let {
		projectId,
		parentId = null,
		excludeId = null,
		onPick,
		onClose
	}: {
		projectId: string;
		/** Where a table made here lands in the doc tree (usually the open document). */
		parentId?: string | null;
		/** The document being edited (a table never embeds itself). */
		excludeId?: string | null;
		onPick: (table: { id: string; title: string }) => void;
		onClose: () => void;
	} = $props();

	let isOpen = $state(true);
	let loading = $state(true);
	let loadError = $state('');
	let options = $state<TableOption[]>([]);
	let query = $state('');
	let creating = $state(false);

	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return needle
			? options.filter((option) => option.title.toLowerCase().includes(needle))
			: options;
	});

	$effect(() => {
		const controller = new AbortController();
		loading = true;
		loadError = '';
		fetch(`/api/onto/projects/${projectId}/doc-tree?include_content=false`, {
			signal: controller.signal
		})
			.then(async (response) => {
				const payload = await response.json().catch(() => null);
				if (!response.ok) throw new Error(payload?.error || 'Could not load tables.');
				const data = payload?.data ?? {};
				type TreeDoc = {
					id: string;
					title?: string | null;
					type_key?: string | null;
					state_key?: string | null;
					archived_at?: string | null;
					updated_at?: string | null;
					props?: unknown;
				};
				const docs: TreeDoc[] = [
					...Object.values((data.documents ?? {}) as Record<string, TreeDoc>),
					...((data.unlinked ?? []) as TreeDoc[])
				];
				const byId = new Map<string, TableOption>();
				for (const doc of docs) {
					if (!doc?.id || byId.has(doc.id) || doc.id === excludeId) continue;
					if (
						!isTableTypeKey(doc.type_key) ||
						doc.state_key === 'archived' ||
						doc.archived_at
					)
						continue;
					byId.set(doc.id, {
						id: doc.id,
						title: doc.title || 'Untitled table',
						rowCount: tableRowCountOf(doc),
						updatedAt: doc.updated_at ?? ''
					});
				}
				options = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
			})
			.catch((cause) => {
				if (controller.signal.aborted) return;
				loadError = cause instanceof Error ? cause.message : 'Could not load tables.';
			})
			.finally(() => {
				if (!controller.signal.aborted) loading = false;
			});
		return () => controller.abort();
	});

	function pick(option: { id: string; title: string }) {
		isOpen = false;
		onPick(option);
	}

	function handleCreated(table: LoadedTable) {
		creating = false;
		pick({ id: table.document.id, title: table.document.title });
	}
</script>

<Modal bind:isOpen title="Insert table" size="md" {onClose}>
	{#snippet children()}
		<div class="grid gap-3 p-3">
			<p class="text-xs text-muted-foreground">
				The table shows up in this document as a live preview. Edits to the table show here
				too.
			</p>

			{#if options.length > 8}
				<label class="relative block">
					<span class="sr-only">Search tables</span>
					<Search
						class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						type="search"
						bind:value={query}
						placeholder="Search tables"
						class="h-10 w-full rounded-md border border-border-strong bg-background pl-8 pr-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
					/>
				</label>
			{/if}

			{#if loading}
				<div class="grid gap-1.5" aria-busy="true" aria-label="Loading tables">
					{#each [0, 1, 2] as index (index)}
						<div
							class="h-11 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
						></div>
					{/each}
				</div>
			{:else if loadError}
				<p class="text-sm text-destructive" role="alert">{loadError}</p>
			{:else if filtered.length === 0}
				<p
					class="rounded-md bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground"
				>
					{options.length === 0 ? 'No tables in this project yet.' : 'No tables match.'}
				</p>
			{:else}
				<ul class="grid max-h-80 gap-1 overflow-y-auto" role="list">
					{#each filtered as option (option.id)}
						<li>
							<button
								type="button"
								onclick={() => pick(option)}
								class="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
							>
								<Table class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
								<span class="min-w-0 flex-1 truncate">{option.title}</span>
								{#if option.rowCount !== null}
									<span class="stamp shrink-0 text-xs text-muted-foreground">
										{formatRowCount(option.rowCount)}
									</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="flex justify-end border-t border-border pt-3">
				<button
					type="button"
					onclick={() => (creating = true)}
					class="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-ink transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable"
				>
					<Plus class="h-3.5 w-3.5" /> New table
				</button>
			</div>
		</div>
	{/snippet}
</Modal>

{#if creating}
	{#await import('$lib/components/tables/NewTableDialog.svelte') then { default: NewTableDialog }}
		<NewTableDialog
			{projectId}
			{parentId}
			onCreated={handleCreated}
			onClose={() => (creating = false)}
		/>
	{/await}
{/if}
