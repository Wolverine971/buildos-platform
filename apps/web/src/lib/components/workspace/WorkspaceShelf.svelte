<!-- apps/web/src/lib/components/workspace/WorkspaceShelf.svelte -->
<!--
	The Workspace's loose items, above the project tiles: newest first, filterable, each
	one draggable onto a project. Above them sit the agent's "this looks like a project"
	groupings. Starting a project from them is always the person's call: the card only
	opens a confirm with the name and items, and nothing moves until they say so.
	Select mode makes the same thing possible from any items the person picks.
-->
<script lang="ts">
	import { Layers, Sparkles, X } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ProjectListSummary } from '$lib/components/projects/project-list';
	import LooseCard from './LooseCard.svelte';
	import {
		filingByItem,
		isLiveSuggestion,
		itemRef,
		liveSuggestionItems,
		matchesLooseFilter,
		type LooseFilter,
		type LooseItem,
		type WorkspaceHome,
		type WorkspaceSuggestion
	} from './workspace-model';

	let {
		home,
		loading = false,
		projectsById,
		query = '',
		freshIds,
		lifted = null,
		busyIds,
		refreshing = false,
		onOpen,
		onMove,
		onFile,
		onDismiss,
		onStartProject,
		onComplete,
		onRefreshSuggestions
	}: {
		home: WorkspaceHome | null;
		loading?: boolean;
		projectsById: ReadonlyMap<string, ProjectListSummary>;
		/** The page's search box: loose items match on title and excerpt too. */
		query?: string;
		freshIds: ReadonlySet<string>;
		lifted?: string | null;
		/** Items (or suggestions) with a request in flight. */
		busyIds: ReadonlySet<string>;
		refreshing?: boolean;
		onOpen: (item: LooseItem) => void;
		onMove: (item: LooseItem, anchor: HTMLElement) => void;
		onFile: (suggestion: WorkspaceSuggestion) => void;
		onDismiss: (suggestion: WorkspaceSuggestion) => void;
		onStartProject: (input: {
			suggestion: WorkspaceSuggestion | null;
			items: LooseItem[];
		}) => void;
		onComplete: (item: LooseItem) => void;
		onRefreshSuggestions: () => void;
	} = $props();

	const PAGE = 12;
	const FILTERS: { value: LooseFilter; label: string }[] = [
		{ value: 'all', label: 'All' },
		{ value: 'notes', label: 'Notes' },
		{ value: 'tasks', label: 'Tasks' },
		{ value: 'docs', label: 'Docs' }
	];

	let filter = $state<LooseFilter>('all');
	let showAll = $state(false);
	let selecting = $state(false);
	let selected = $state<Set<string>>(new Set());

	const items = $derived(home?.items ?? []);
	const byRef = $derived(new Map(items.map((item) => [itemRef(item), item])));
	const live = $derived(
		(home?.suggestions ?? []).filter((suggestion) => isLiveSuggestion(suggestion, byRef))
	);
	const groupings = $derived(live.filter((suggestion) => suggestion.kind === 'graduate'));
	const filings = $derived(
		filingByItem(
			live.filter(
				(suggestion) =>
					suggestion.kind === 'file' &&
					suggestion.target_project_id &&
					projectsById.has(suggestion.target_project_id)
			)
		)
	);

	const needle = $derived(query.trim().toLowerCase());
	const shown = $derived(
		items.filter(
			(item) =>
				matchesLooseFilter(item, filter) &&
				(!needle ||
					item.title.toLowerCase().includes(needle) ||
					(item.excerpt ?? '').toLowerCase().includes(needle))
		)
	);
	const visible = $derived(showAll || needle ? shown : shown.slice(0, PAGE));
	const counts = $derived({
		all: items.length,
		notes: items.filter((item) => item.kind === 'note').length,
		tasks: items.filter((item) => item.kind === 'task').length,
		docs: items.filter((item) => item.kind === 'doc').length
	});

	function toggleSelect(item: LooseItem) {
		const key = itemRef(item);
		const next = new Set(selected);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		selected = next;
	}

	function stopSelecting() {
		selecting = false;
		selected = new Set();
	}

	function startFromSelection() {
		const chosen = items.filter((item) => selected.has(itemRef(item)));
		if (!chosen.length) return;
		onStartProject({ suggestion: null, items: chosen });
		stopSelecting();
	}

	function nameOf(id: string | null): string | null {
		return id ? (projectsById.get(id)?.name ?? null) : null;
	}
</script>

<section class="shelf" aria-label="Loose items in your Workspace">
	{#if groupings.length && !selecting && !needle}
		<div class="groupings" aria-label="Suggested projects">
			{#each groupings as suggestion (suggestion.id)}
				{@const members = liveSuggestionItems(suggestion, byRef)}
				{@const busy = busyIds.has(suggestion.id)}
				<article class="grouping wt-ghost tx tx-bloom tx-weak">
					<p class="micro-label text-accent">
						<Sparkles class="h-3 w-3" /> LOOKS LIKE A PROJECT
					</p>
					<h3 class="name">{suggestion.proposed_name}</h3>
					{#if suggestion.reason}
						<p class="why">{suggestion.reason}</p>
					{/if}
					<ul class="members" aria-label="Items in this group">
						{#each members.slice(0, 4) as member (itemRef(member))}
							<li>
								<button type="button" class="member" onclick={() => onOpen(member)}>
									{member.title}
								</button>
							</li>
						{/each}
						{#if members.length > 4}
							<li class="more">+{members.length - 4} more</li>
						{/if}
					</ul>
					<div class="flex flex-wrap gap-2">
						<Button
							variant="primary"
							size="sm"
							disabled={busy}
							onclick={() => onStartProject({ suggestion, items: members })}
						>
							Start a project
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={busy}
							onclick={() => onDismiss(suggestion)}
						>
							Not now
						</Button>
					</div>
				</article>
			{/each}
		</div>
	{/if}

	<header class="head">
		<h2 class="micro-label text-muted-foreground">
			LOOSE · {loading && !home ? '…' : items.length}
		</h2>
		{#if items.length && !selecting}
			<div class="filters" role="group" aria-label="Show">
				{#each FILTERS as { value, label } (value)}
					<button
						type="button"
						class:on={filter === value}
						aria-pressed={filter === value}
						disabled={value !== 'all' && counts[value] === 0}
						onclick={() => (filter = value)}
					>
						{label}{#if value !== 'all' && counts[value]}<span class="n"
								>{counts[value]}</span
							>{/if}
					</button>
				{/each}
			</div>
		{/if}
		<div class="tools">
			{#if selecting}
				<span class="text-xs text-muted-foreground">{selected.size} selected</span>
				<Button
					variant="primary"
					size="sm"
					icon={Layers}
					disabled={selected.size === 0}
					onclick={startFromSelection}
				>
					Start a project
				</Button>
				<button
					type="button"
					class="tool"
					onclick={stopSelecting}
					aria-label="Stop selecting"
				>
					<X class="h-4 w-4" />
				</button>
			{:else if items.length >= 2}
				{#if items.length >= 3}
					<button
						type="button"
						class="tool text"
						disabled={refreshing}
						onclick={onRefreshSuggestions}
						title="Ask BuildOS to look for groupings and homes"
					>
						<Sparkles class="h-3.5 w-3.5" />
						<span class="hidden sm:inline"
							>{refreshing ? 'Looking…' : 'Suggest homes'}</span
						>
					</button>
				{/if}
				<button type="button" class="tool text" onclick={() => (selecting = true)}>
					Select
				</button>
			{/if}
		</div>
	</header>

	{#if loading && !home}
		<div class="grid-cards" aria-busy="true" aria-label="Loading loose items">
			{#each [0, 1, 2] as index (index)}
				<div
					class="h-28 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
				></div>
			{/each}
		</div>
	{:else if !items.length}
		<p class="empty">
			Nothing loose. Jot a thought above; it waits here until it belongs somewhere.
		</p>
	{:else if !shown.length}
		<p class="empty">No loose items match.</p>
	{:else}
		<div class="grid-cards">
			{#each visible as item (itemRef(item))}
				{@const suggestion = filings.get(itemRef(item)) ?? null}
				<LooseCard
					{item}
					workspaceId={home?.workspaceId ?? ''}
					fresh={freshIds.has(item.id)}
					lifted={lifted === itemRef(item)}
					{selecting}
					selected={selected.has(itemRef(item))}
					filing={suggestion}
					filingName={nameOf(suggestion?.target_project_id ?? null)}
					busy={busyIds.has(item.id) || (suggestion ? busyIds.has(suggestion.id) : false)}
					{onOpen}
					onToggleSelect={toggleSelect}
					{onMove}
					{onFile}
					onKeep={onDismiss}
					{onComplete}
				/>
			{/each}
		</div>
		{#if !showAll && !needle && shown.length > PAGE}
			<button type="button" class="more-btn" onclick={() => (showAll = true)}>
				Show all {shown.length}
			</button>
		{/if}
	{/if}
</section>

<style>
	.shelf {
		display: grid;
		gap: 0.6rem;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}
	.tools {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
	}
	.tool {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.25rem;
		min-width: 2.25rem;
		justify-content: center;
		padding: 0 0.5rem;
		border-radius: 0.4rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	@media (pointer: fine) {
		.tool {
			min-height: 1.75rem;
		}
	}
	.tool:hover:not(:disabled) {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.tool:focus-visible,
	.filters button:focus-visible,
	.member:focus-visible,
	.more-btn:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.filters {
		display: inline-flex;
		border-radius: 0.45rem;
		background: hsl(var(--muted));
		padding: 2px;
	}
	.filters button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.25rem;
		padding: 0 0.6rem;
		border-radius: 0.35rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}
	@media (pointer: fine) {
		.filters button {
			min-height: 1.75rem;
		}
	}
	.filters button.on {
		background: hsl(var(--card));
		color: hsl(var(--foreground));
		box-shadow: var(--shadow-ink);
	}
	.filters button:disabled {
		opacity: 0.45;
	}
	.n {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 10px;
	}
	.grid-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}
	@media (max-width: 639px) {
		.grid-cards {
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		}
	}
	.empty {
		padding: 0.25rem 0 0.25rem;
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
	}
	.more-btn {
		justify-self: start;
		min-height: 2.25rem;
		padding: 0 0.5rem;
		border-radius: 0.4rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--accent));
	}
	.groupings {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 0.6rem;
	}
	.grouping {
		display: grid;
		gap: 0.4rem;
		align-content: start;
		padding: 0.85rem 0.95rem;
		border-radius: 0.8rem;
	}
	.grouping .micro-label {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.name {
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.25;
		color: hsl(var(--foreground));
	}
	.why {
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
	}
	.members {
		display: grid;
		gap: 0.1rem;
		margin: 0.1rem 0 0.25rem;
	}
	.member {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
		font-size: 0.8rem;
		color: hsl(var(--foreground));
		min-height: 1.6rem;
	}
	.member::before {
		content: '· ';
		color: hsl(var(--muted-foreground));
	}
	.member:hover {
		color: hsl(var(--accent));
	}
	.more {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}
</style>
