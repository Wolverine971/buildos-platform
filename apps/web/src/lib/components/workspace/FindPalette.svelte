<!-- apps/web/src/lib/components/workspace/FindPalette.svelte -->
<!--
	⌘K anywhere (tasker 159, step two): the same search and result rows as the /projects pane,
	in a window. Arrow keys walk the rows, Enter opens one. On /projects a result opens in
	place; anywhere else it goes to /projects?open=kind:id, which opens its card and reader.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Modal from '$lib/components/ui/Modal.svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { Search } from '$lib/icons/lucide';
	import FindResults from './FindResults.svelte';
	import { createFindSearch } from './find-search.svelte';
	import { openFoundInPlace } from './find-bridge';
	import {
		PALETTE_LIMITS,
		findItemKey,
		groupFindResults,
		openParam,
		visibleFindItems,
		type FindItem
	} from './find-model';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const find = createFindSearch();
	let value = $state('');
	let activeIndex = $state(0);
	let listEl = $state<HTMLElement | null>(null);

	const rows = $derived(
		visibleFindItems(groupFindResults(find.items, find.best.items), PALETTE_LIMITS)
	);
	const active = $derived(rows.length ? rows[Math.min(activeIndex, rows.length - 1)] : null);

	function close() {
		open = false;
		value = '';
		find.clear();
		activeIndex = 0;
	}

	function choose(item: FindItem) {
		close();
		if (openFoundInPlace(item)) return;
		void goto(resolve(`/projects?open=${openParam(item)}`));
	}

	async function move(step: number) {
		if (!rows.length) return;
		activeIndex = (Math.min(activeIndex, rows.length - 1) + step + rows.length) % rows.length;
		await tick();
		const key = active ? findItemKey(active) : null;
		if (key)
			listEl
				?.querySelector<HTMLElement>(`[data-find-row="${key}"]`)
				?.scrollIntoView({ block: 'nearest' });
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			void move(1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			void move(-1);
		} else if (event.key === 'Enter' && active) {
			event.preventDefault();
			choose(active);
		}
	}
</script>

<Modal
	isOpen={open}
	onClose={close}
	size="md"
	ariaLabel="Find anything"
	showCloseButton={false}
	customClasses="find-palette"
>
	{#snippet header()}
		<div class="input-row">
			<Search class="h-4 w-4 shrink-0 text-muted-foreground" />
			<input
				type="search"
				data-autofocus
				autocomplete="off"
				spellcheck="false"
				aria-label="Find in your Workspace and projects"
				placeholder="Find a note, task, doc or project"
				bind:value
				oninput={() => {
					activeIndex = 0;
					find.set(value);
				}}
				onkeydown={keydown}
			/>
			<button type="button" class="esc" onclick={close}>Esc</button>
		</div>
	{/snippet}

	<div class="body" bind:this={listEl}>
		{#if find.active}
			<ErrorBoundary area="find-palette">
				<FindResults
					search={find}
					limits={PALETTE_LIMITS}
					expandable={false}
					activeKey={active ? findItemKey(active) : null}
					onOpen={choose}
				/>
			</ErrorBoundary>
		{:else}
			<p class="empty">
				Searches your Workspace and every project you can open, inside notes too. Longer
				descriptions get a best match.
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<p class="keys">
			<span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
			<span><kbd>↵</kbd> open</span>
			<span><kbd>esc</kbd> close</span>
		</p>
	{/snippet}
</Modal>

<style>
	.input-row {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 14px;
		border-bottom: 1px solid hsl(var(--border));
	}
	.input-row input {
		flex: 1;
		min-width: 0;
		min-height: 36px;
		border: 0;
		background: transparent;
		font-size: 16px;
		color: hsl(var(--foreground));
	}
	.input-row input::placeholder {
		color: hsl(var(--muted-foreground));
	}
	/* The row is the field; the global input focus box would draw a second one. */
	.input-row input,
	.input-row input:focus,
	.input-row input:focus-visible {
		outline: none;
		border: 0;
		box-shadow: none;
	}
	.input-row:focus-within {
		box-shadow: inset 0 -2px 0 hsl(var(--accent));
	}
	.input-row input::-webkit-search-cancel-button {
		appearance: none;
	}
	.esc {
		min-height: 32px;
		padding: 0 8px;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.esc:hover {
		color: hsl(var(--foreground));
	}
	.esc:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.body {
		min-height: 120px;
		padding: 12px 14px 14px;
	}
	.empty {
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	.keys {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		width: 100%;
		padding: 8px 14px;
		border-top: 1px solid hsl(var(--border));
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	kbd {
		padding: 0 4px;
		border: 1px solid hsl(var(--border));
		border-bottom-width: 2px;
		border-radius: 4px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
	}
</style>
