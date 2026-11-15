<!-- apps/web/src/lib/components/workspace/FindResults.svelte -->
<!--
	Workspace search results (tasker 159), the same in the /projects pane and ⌘K: the best
	match on top when one was asked for (a quiet placeholder while it reads), then the
	Workspace, then projects and what's inside them. Word matches never wait for the best
	match. Nothing found offers to save the words as a note.
-->
<script lang="ts">
	import { Sparkles } from '$lib/icons/lucide';
	import FindRow from './FindRow.svelte';
	import type { FindSearch } from './find-search.svelte';
	import {
		findItemKey,
		groupFindResults,
		normalizeFindQuery,
		type FindGroupKey,
		type FindItem,
		type FindLimits
	} from './find-model';

	let {
		search,
		limits,
		activeKey = null,
		expandable = true,
		hideWorkspaceWhere = true,
		onOpen,
		onSaveNote
	}: {
		search: FindSearch;
		limits: FindLimits;
		/** The keyboard-selected row (palette). */
		activeKey?: string | null;
		/** "Show N more" under a group (the pane); the palette shows one screen. */
		expandable?: boolean;
		hideWorkspaceWhere?: boolean;
		onOpen: (item: FindItem) => void;
		/** Nothing found: save the words as a loose note. */
		onSaveNote?: (text: string) => void;
	} = $props();

	// Groups opened with "Show more", for the query they were opened on (a new query starts
	// collapsed).
	let opened = $state<{ query: string; keys: FindGroupKey[] }>({ query: '', keys: [] });
	const isOpen = (key: FindGroupKey) =>
		opened.query === search.resultQuery && opened.keys.includes(key);

	const groups = $derived(groupFindResults(search.items, search.best.items));
	const query = $derived(search.resultQuery || normalizeFindQuery(search.query));
	const settled = $derived(
		!search.loading && search.resultQuery === normalizeFindQuery(search.query)
	);
	const total = $derived(
		groups.best.length +
			groups.workspace.length +
			groups.projects.length +
			groups.inProjects.length
	);
	const bestWaiting = $derived(search.best.status === 'waiting');

	function shown(key: FindGroupKey, list: FindItem[]): FindItem[] {
		return isOpen(key) ? list : list.slice(0, limits[key]);
	}

	function open(key: FindGroupKey) {
		opened = {
			query: search.resultQuery,
			keys: opened.query === search.resultQuery ? [...opened.keys, key] : [key]
		};
	}

	const sections = $derived(
		(
			[
				{ key: 'workspace', label: 'In your Workspace', list: groups.workspace },
				{ key: 'projects', label: 'Projects', list: groups.projects },
				{ key: 'inProjects', label: 'In your projects', list: groups.inProjects }
			] as const
		).filter((section) => section.list.length > 0)
	);
</script>

<div class="results" aria-live="polite" aria-busy={search.loading || bestWaiting}>
	{#if bestWaiting || groups.best.length}
		<section class="best" aria-label="Best match">
			<header class="best-head">
				<Sparkles class="h-3.5 w-3.5" />
				<span class="micro">Best match</span>
				{#if bestWaiting}<span class="hint">Reading what you meant…</span>{/if}
			</header>
			{#if bestWaiting}
				<div class="skeleton" aria-hidden="true"><i></i><i class="short"></i></div>
			{:else}
				<div class="list">
					{#each groups.best.slice(0, limits.best) as item (findItemKey(item))}
						<FindRow
							{item}
							query={search.query}
							active={activeKey === findItemKey(item)}
							{onOpen}
						/>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	{#each sections as section (section.key)}
		<section class="group" aria-label={section.label}>
			<h3 class="group-head">
				<span class="micro">{section.label}</span>
				<span class="count">{section.list.length}</span>
			</h3>
			<div class="list">
				{#each shown(section.key, section.list) as item (findItemKey(item))}
					<FindRow
						{item}
						query={search.query}
						showWhere={!(hideWorkspaceWhere && section.key === 'workspace')}
						active={activeKey === findItemKey(item)}
						{onOpen}
					/>
				{/each}
			</div>
			{#if expandable && !isOpen(section.key) && section.list.length > limits[section.key]}
				<button type="button" class="more" onclick={() => open(section.key)}>
					Show {section.list.length - limits[section.key]} more
				</button>
			{/if}
		</section>
	{/each}

	{#if search.failed && settled}
		<p class="hint">Search didn’t load. Try again in a moment.</p>
	{:else if settled && total === 0 && !bestWaiting}
		<div class="none">
			<p>
				<span class="font-medium text-foreground">Nothing matches “{query}”</span>
				<span class="text-muted-foreground"> in your Workspace or your projects.</span>
			</p>
			{#if onSaveNote}
				<button type="button" class="save" onclick={() => onSaveNote(query)}>
					Save “{query.length > 28 ? `${query.slice(0, 28)}…` : query}” as a note
				</button>
			{/if}
		</div>
	{:else if !settled && total === 0}
		<p class="hint">Searching…</p>
	{/if}
</div>

<style>
	.results {
		display: grid;
		gap: 14px;
		min-width: 0;
	}
	.micro {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.list {
		display: grid;
		overflow: hidden;
		border: 1px solid hsl(var(--border));
		border-radius: 10px;
		background: hsl(var(--card));
	}
	.group {
		display: grid;
		gap: 4px;
	}
	.group-head {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 0 2px;
		color: hsl(var(--muted-foreground));
	}
	.count {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}
	.best {
		overflow: hidden;
		border: 1px solid hsl(var(--accent) / 0.35);
		border-radius: 10px;
		background: hsl(var(--card));
	}
	.best .list {
		border: 0;
		border-top: 1px solid hsl(var(--accent) / 0.35);
		border-radius: 0;
	}
	.best-head {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: hsl(var(--accent) / 0.08);
		color: hsl(var(--accent));
	}
	.hint {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	.best-head .hint {
		margin-left: 2px;
	}
	.skeleton {
		display: flex;
		gap: 10px;
		padding: 14px 10px;
		border-top: 1px solid hsl(var(--accent) / 0.35);
	}
	.skeleton i {
		flex: 1;
		max-width: 240px;
		height: 9px;
		border-radius: 4px;
		background: hsl(var(--muted));
		animation: pulse 1.1s ease-in-out infinite;
	}
	.skeleton i.short {
		max-width: 110px;
	}
	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skeleton i {
			animation: none;
		}
	}
	.more {
		justify-self: start;
		min-height: 36px;
		padding: 0 4px;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--accent));
	}
	.more:focus-visible,
	.save:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.none {
		display: grid;
		gap: 10px;
		justify-items: start;
		padding: 14px;
		border: 1px dashed hsl(var(--border-strong, var(--border)));
		border-radius: 10px;
		font-size: 13px;
	}
	.save {
		min-height: 36px;
		padding: 0 12px;
		border: 1px solid hsl(var(--border-strong, var(--border)));
		border-radius: 8px;
		background: hsl(var(--card));
		font-size: 12px;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
	.save:hover {
		background: hsl(var(--muted));
	}
</style>
