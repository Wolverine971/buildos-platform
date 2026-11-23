<!-- apps/web/src/lib/components/knowledge/KnowledgeMergeDialog.svelte -->
<!--
	Merge entries by hand (tasker 167 follow-up). Opened three ways: "Merge N" on ticked rows,
	"Merge…" on an entry's card (pick the other one by searching), and "Review" on a same-name
	group in the duplicates review. Shows what each entry carries (tasks and docs it's on,
	highlighted names, details), suggests which to keep, and lets you untick any that aren't the
	same. Merging can't be undone (duplicate details are dropped), so the button says exactly
	what happens. Mount it only while open (the parent wraps it in {#if}).
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { AlertTriangle, GitMerge, Loader2, Plus, Search } from '$lib/icons/lucide';
	import {
		KIND_ICON,
		KIND_LABEL,
		MERGE_MAX,
		knowledgeAddedLine,
		knowledgeApi,
		type KnowledgeEntitySummary,
		type KnowledgeMergeEntry
	} from './knowledge-client';

	interface Props {
		/** The entries to start with (one from a card, several from the list). */
		ids: string[];
		onClose: () => void;
		onMerged: (result: { kept: string; merged: string[] }) => void;
	}

	let { ids, onClose, onMerged }: Props = $props();

	let entries = $state<KnowledgeMergeEntry[]>([]);
	let keepId = $state<string | null>(null);
	/** Unticked: shown, but left out of this merge. */
	let left = $state<Set<string>>(new Set());
	let loading = $state(true);
	let merging = $state(false);
	let error = $state<string | null>(null);

	let query = $state('');
	let results = $state<KnowledgeEntitySummary[]>([]);
	let searching = $state(false);
	// svelte-ignore state_referenced_locally
	let adding = $state(ids.length < 2);
	let searchEl = $state<HTMLInputElement | null>(null);

	// The modal focuses its close button on open; the search box is what you want to type in.
	$effect(() => {
		if (!searchEl || loading) return;
		const el = searchEl;
		const timer = setTimeout(() => el.focus(), 50);
		return () => clearTimeout(timer);
	});

	const keep = $derived(entries.find((e) => e.id === keepId) ?? null);
	/** Entries that would be folded into the kept one. */
	const folding = $derived(
		entries.filter(
			(e) => e.id !== keepId && !left.has(e.id) && e.mergeable && e.kind === keep?.kind
		)
	);
	const title = $derived(
		entries.length < 2 && keep ? `Merge ${keep.name} with…` : 'Merge entries'
	);

	function plural(n: number, one: string, many = `${one}s`) {
		return `${n} ${n === 1 ? one : many}`;
	}

	function carries(e: KnowledgeMergeEntry) {
		const parts = [
			e.links ? plural(e.links, 'task or doc', 'tasks & docs') : null,
			e.mentions ? plural(e.mentions, 'highlight') : null,
			e.facts ? plural(e.facts, 'detail') : null
		].filter(Boolean);
		return parts.length ? parts.join(' · ') : 'Nothing attached yet';
	}

	/** Why an entry can't be folded into the kept one, if it can't. */
	function blocked(e: KnowledgeMergeEntry): string | null {
		if (e.id === keepId) return null;
		if (keep && e.kind !== keep.kind)
			return `Different kind (${KIND_LABEL[e.kind].one.toLowerCase()})`;
		if (e.is_self) return "That's you";
		if (!e.mergeable) return 'Shared entry: it can only be the one you keep';
		return null;
	}

	async function load(next: string[]) {
		loading = true;
		error = null;
		try {
			const preview = await knowledgeApi.mergePreview(next);
			entries = preview.entries;
			// Keep the user's pick across reloads; otherwise the suggestion.
			if (!keepId || !entries.some((e) => e.id === keepId))
				keepId = preview.suggested_keep ?? entries[0]?.id ?? null;
			if (!entries.length) error = 'Those entries are gone (already merged or deleted).';
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not load those entries';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void load(ids);
	});

	let searchSeq = 0;
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput() {
		clearTimeout(searchTimer);
		const q = query.trim();
		if (!q) {
			results = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			const seq = ++searchSeq;
			searching = true;
			try {
				const found = await knowledgeApi.list({
					q,
					kind: keep?.kind ?? null,
					view: 'all',
					limit: 8
				});
				if (seq !== searchSeq) return;
				results = found.entities.filter((r) => !entries.some((e) => e.id === r.id));
			} catch {
				if (seq === searchSeq) results = [];
			} finally {
				if (seq === searchSeq) searching = false;
			}
		}, 200);
	}

	$effect(() => () => clearTimeout(searchTimer));

	async function add(id: string) {
		query = '';
		results = [];
		adding = false;
		await load([...entries.map((e) => e.id), id]);
	}

	function toggle(id: string) {
		const next = new Set(left);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		left = next;
	}

	async function merge(event: SubmitEvent) {
		event.preventDefault();
		if (!keep || !folding.length || merging) return;
		merging = true;
		error = null;
		try {
			const result = await knowledgeApi.mergeMany(
				keep.id,
				folding.map((e) => e.id)
			);
			if (result.failed.length && result.merged.length)
				error = `Merged ${result.merged.length}; ${plural(result.failed.length, "one couldn't be", "couldn't be")}.`;
			onMerged({ kept: result.kept, merged: result.merged });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not merge those';
		} finally {
			merging = false;
		}
	}
</script>

<Modal isOpen={true} {onClose} {title} size="md">
	<form class="flex flex-col gap-4 p-4 sm:p-5" onsubmit={merge}>
		{#if loading && !entries.length}
			<p class="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
			</p>
		{:else}
			{#if entries.length >= 2}
				<p class="text-sm text-muted-foreground">
					Pick the one to keep. The others fold into it.
				</p>
			{/if}
			<ul class="flex flex-col gap-2" aria-label="Entries to merge">
				{#each entries as entry (entry.id)}
					{@const Icon = KIND_ICON[entry.kind]}
					{@const isKeep = entry.id === keepId}
					{@const why = blocked(entry)}
					{@const out = !isKeep && (left.has(entry.id) || Boolean(why))}
					<li
						class="flex items-start gap-3 rounded-md border p-3 {isKeep
							? 'border-accent bg-accent/5'
							: 'border-border'} {out ? 'opacity-60' : ''}"
					>
						<input
							type="radio"
							name="keep"
							class="mt-1 h-4 w-4 shrink-0 border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							checked={isKeep}
							disabled={entry.is_self}
							aria-label="Keep {entry.name}"
							onchange={() => {
								keepId = entry.id;
								const next = new Set(left);
								next.delete(entry.id);
								left = next;
							}}
						/>
						<div class="min-w-0 flex-1">
							<p
								class="flex items-center gap-1.5 text-sm font-medium text-foreground"
							>
								<Icon
									class="h-4 w-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<span class="truncate">{entry.name}</span>
								{#if isKeep}<span
										class="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent"
										>Keep</span
									>{/if}
							</p>
							{#if entry.summary}
								<p class="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
									{entry.summary}
								</p>
							{/if}
							{#if entry.details?.length}
								<p class="mt-1 text-xs text-foreground">
									{entry.details.join(' · ')}
								</p>
							{/if}
							<p class="mt-1 text-xs text-muted-foreground">
								{carries(entry)} · {knowledgeAddedLine(
									entry.created_at,
									entry.created_via
								)}
							</p>
							{#if why}
								<p class="mt-1 text-xs text-warning">{why}</p>
							{/if}
						</div>
						{#if !isKeep && !why}
							<label
								class="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
							>
								<input
									type="checkbox"
									class="h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									checked={!left.has(entry.id)}
									onchange={() => toggle(entry.id)}
								/>
								Same
							</label>
						{/if}
					</li>
				{/each}
			</ul>

			{#if adding || entries.length < 2}
				<div class="flex flex-col gap-2">
					<label class="relative block">
						<span class="sr-only">Find the other entry</span>
						<Search
							class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<input
							type="search"
							class="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							placeholder={keep
								? `Find the other ${KIND_LABEL[keep.kind].one.toLowerCase()}…`
								: 'Find the other entry…'}
							bind:this={searchEl}
							bind:value={query}
							oninput={onSearchInput}
						/>
					</label>
					{#if searching}
						<p class="text-xs text-muted-foreground">Searching…</p>
					{:else if query.trim() && !results.length}
						<p class="text-xs text-muted-foreground">No other matches.</p>
					{/if}
					{#if results.length}
						<ul
							class="flex flex-col rounded-md border border-border"
							aria-label="Matches"
						>
							{#each results as result (result.id)}
								<li class="border-b border-border last:border-b-0">
									<button
										type="button"
										class="flex w-full min-w-0 flex-col items-start px-3 py-2 text-left pressable hover:bg-muted"
										onclick={() => void add(result.id)}
									>
										<span class="truncate text-sm font-medium text-foreground"
											>{result.name}</span
										>
										{#if result.summary}
											<span class="line-clamp-1 text-xs text-muted-foreground"
												>{result.summary}</span
											>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else if entries.length <= MERGE_MAX}
				<button
					type="button"
					class="inline-flex w-fit items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground"
					onclick={() => (adding = true)}
				>
					<Plus class="h-4 w-4" aria-hidden="true" /> Add another
				</button>
			{/if}

			{#if keep && folding.length}
				<p
					class="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-sm text-foreground"
				>
					<AlertTriangle
						class="mt-0.5 h-4 w-4 shrink-0 text-warning"
						aria-hidden="true"
					/>
					<span>
						{folding.length === 1
							? folding[0]!.name
							: plural(folding.length, 'entry', 'entries')}
						will become part of <span class="font-medium">{keep.name}</span>. Tasks,
						docs, highlights and details move over; other spellings stay searchable.
						This can't be undone.
					</span>
				</p>
			{/if}
		{/if}

		{#if error}
			<p class="text-sm text-destructive" role="alert">{error}</p>
		{/if}

		<div class="flex justify-end gap-2">
			<button
				type="button"
				class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
				onclick={onClose}>Cancel</button
			>
			<button
				type="submit"
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground pressable disabled:opacity-60"
				disabled={!keep || !folding.length || merging || loading}
			>
				{#if merging}
					<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
				{:else}
					<GitMerge class="h-4 w-4" aria-hidden="true" />
				{/if}
				{folding.length ? `Merge ${folding.length + 1} into one` : 'Merge'}
			</button>
		</div>
	</form>
</Modal>
