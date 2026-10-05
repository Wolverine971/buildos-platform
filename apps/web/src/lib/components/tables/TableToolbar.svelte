<!-- apps/web/src/lib/components/tables/TableToolbar.svelte -->
<!--
	Search, filter/sort, hidden columns, grid ↔ board ↔ cards, and the table's
	actions. Narrow hosts (panel, phone) fold the secondary actions into "More".
-->
<script lang="ts">
	import {
		Download,
		EyeOff,
		LayoutGrid,
		ListFilter,
		LoaderCircle,
		MessageSquare,
		MoreHorizontal,
		Plus,
		Rows3,
		Search,
		SquareKanban,
		Table2,
		Undo2,
		X
	} from '$lib/icons/lucide';
	import TablePopover from './TablePopover.svelte';
	import type { WorkspaceMode } from './table-view-model';

	let {
		search = $bindable(''),
		filterCount,
		hiddenCount,
		mode,
		modes,
		canUndo,
		saving,
		readonly,
		wide,
		exportHref,
		exportName,
		canAsk,
		onFilters,
		onHidden,
		onMode,
		onUndo,
		onPasteRows,
		onAsk,
		onAddRow,
		searchInput = $bindable(null)
	}: {
		search?: string;
		filterCount: number;
		hiddenCount: number;
		mode: WorkspaceMode;
		modes: WorkspaceMode[];
		canUndo: boolean;
		saving: boolean;
		readonly: boolean;
		wide: boolean;
		exportHref: string;
		exportName: string;
		canAsk: boolean;
		onFilters: (anchor: HTMLElement) => void;
		onHidden: (anchor: HTMLElement) => void;
		onMode: (mode: WorkspaceMode) => void;
		onUndo: () => void;
		onPasteRows: () => void;
		onAsk: () => void;
		onAddRow: () => void;
		searchInput?: HTMLInputElement | null;
	} = $props();

	let moreOpen = $state(false);
	let moreButton = $state<HTMLButtonElement | null>(null);

	const MODE_META: Record<WorkspaceMode, { label: string; icon: typeof Table2 }> = {
		grid: { label: 'Grid', icon: Table2 },
		board: { label: 'Board', icon: SquareKanban },
		cards: { label: 'Cards', icon: Rows3 }
	};

	const iconButton =
		'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-sm font-medium text-muted-foreground hover:border-border hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40';
</script>

<div class="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Table tools">
	<div class="relative min-w-40 flex-1 sm:max-w-64">
		<Search
			class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
			aria-hidden="true"
		/>
		<input
			bind:this={searchInput}
			bind:value={search}
			type="search"
			placeholder="Search rows"
			aria-label="Search rows"
			class="h-9 w-full rounded-md border border-border-strong bg-background pl-8 pr-8 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
			onkeydown={(event) => {
				if (event.key === 'Escape' && search) {
					event.preventDefault();
					event.stopPropagation();
					search = '';
				}
			}}
		/>
		{#if search}
			<button
				type="button"
				class="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
				aria-label="Clear search"
				onclick={() => (search = '')}
			>
				<X class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>

	<button
		type="button"
		class="{iconButton} {filterCount ? 'border-accent/40 bg-accent/10 text-foreground' : ''}"
		aria-haspopup="dialog"
		onclick={(event) => onFilters(event.currentTarget)}
	>
		<ListFilter class="h-4 w-4" />
		<span class={wide ? '' : 'sr-only'}>Filter{filterCount ? '' : ' & sort'}</span>
		{#if filterCount}<span class="stamp text-2xs">{filterCount}</span>{/if}
	</button>

	{#if hiddenCount}
		<button
			type="button"
			class={iconButton}
			aria-haspopup="dialog"
			onclick={(event) => onHidden(event.currentTarget)}
		>
			<EyeOff class="h-4 w-4" />
			<span class={wide ? '' : 'sr-only'}>{hiddenCount} hidden</span>
			{#if !wide}<span class="stamp text-2xs">{hiddenCount}</span>{/if}
		</button>
	{/if}

	{#if modes.length > 1}
		<div
			class="flex rounded-md border border-border bg-muted p-0.5"
			role="radiogroup"
			aria-label="View"
		>
			{#each modes as option (option)}
				{@const meta = MODE_META[option]}
				<button
					type="button"
					role="radio"
					aria-checked={mode === option}
					class="inline-flex h-8 items-center gap-1.5 rounded px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {mode ===
					option
						? 'bg-card text-foreground shadow-ink'
						: 'text-muted-foreground hover:text-foreground'}"
					title={meta.label}
					onclick={() => onMode(option)}
				>
					<meta.icon class="h-4 w-4" />
					<span class={wide ? '' : 'sr-only'}>{meta.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	<span class="ml-auto flex items-center gap-1.5">
		{#if saving}
			<span class="flex items-center gap-1 text-xs text-muted-foreground" role="status">
				<LoaderCircle class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
				<span class={wide ? '' : 'sr-only'}>Saving</span>
			</span>
		{/if}

		{#if wide}
			{#if !readonly}
				<button
					type="button"
					class={iconButton}
					disabled={!canUndo}
					title="Undo last change (⌘Z)"
					aria-label="Undo last change"
					onclick={onUndo}
				>
					<Undo2 class="h-4 w-4" />
				</button>
				<button
					type="button"
					class={iconButton}
					title="Paste rows from a spreadsheet"
					onclick={onPasteRows}
				>
					<LayoutGrid class="h-4 w-4" />
					Add rows
				</button>
			{/if}
			<a href={exportHref} download={exportName} class={iconButton} title="Download as CSV">
				<Download class="h-4 w-4" />
				<span class="sr-only">Download CSV</span>
			</a>
		{:else}
			<button
				bind:this={moreButton}
				type="button"
				class={iconButton}
				aria-label="More table actions"
				aria-haspopup="menu"
				aria-expanded={moreOpen}
				onclick={() => (moreOpen = !moreOpen)}
			>
				<MoreHorizontal class="h-4 w-4" />
			</button>
		{/if}

		{#if canAsk}
			<button
				type="button"
				class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium text-foreground shadow-ink pressable hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={onAsk}
			>
				<MessageSquare class="h-4 w-4 text-accent" />
				<span class={wide ? '' : 'sr-only'}>Ask about this table</span>
			</button>
		{/if}

		{#if !readonly}
			<button
				type="button"
				class="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground tx-button tx-button-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={onAddRow}
			>
				<Plus class="h-4 w-4" />
				<span class={wide ? '' : 'sr-only'}>Row</span>
			</button>
		{/if}
	</span>
</div>

{#if moreOpen && !wide}
	<TablePopover
		anchor={moreButton}
		label="More table actions"
		width="w-56"
		placement="below-end"
		onClose={() => (moreOpen = false)}
	>
		<div class="grid gap-0.5 p-1.5" role="menu">
			{#if !readonly}
				<button
					type="button"
					role="menuitem"
					class="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-muted disabled:opacity-40 sm:min-h-9"
					disabled={!canUndo}
					onclick={() => {
						moreOpen = false;
						onUndo();
					}}
				>
					<Undo2 class="h-4 w-4 text-muted-foreground" />
					Undo last change
				</button>
				<button
					type="button"
					role="menuitem"
					class="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-muted sm:min-h-9"
					onclick={() => {
						moreOpen = false;
						onPasteRows();
					}}
				>
					<LayoutGrid class="h-4 w-4 text-muted-foreground" />
					Add rows from a spreadsheet
				</button>
			{/if}
			<a
				role="menuitem"
				href={exportHref}
				download={exportName}
				class="flex min-h-11 items-center gap-2 rounded-md px-2.5 text-sm text-foreground hover:bg-muted sm:min-h-9"
				onclick={() => (moreOpen = false)}
			>
				<Download class="h-4 w-4 text-muted-foreground" />
				Download CSV
			</a>
		</div>
	</TablePopover>
{/if}
