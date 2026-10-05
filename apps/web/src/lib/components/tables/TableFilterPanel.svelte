<!-- apps/web/src/lib/components/tables/TableFilterPanel.svelte -->
<!--
	Filter + sort builder. Changes apply as you make them; filters use the same
	vocabulary the agent's read tool uses (column · op · value).
-->
<script lang="ts">
	import type {
		TableColumn,
		TableFilter,
		TableFilterOp,
		TableSort
	} from '@buildos/shared-agent-ops/tables';
	import { ArrowDown, ArrowUp, Plus, X } from '$lib/icons/lucide';
	import {
		filterNeedsValue,
		filterOpLabel,
		filterOpsFor,
		normalizeFilterValue
	} from './table-view-model';
	import { toDateInputValue } from './table-cell-format';

	let {
		columns,
		filters,
		match,
		sort,
		onChange,
		onClose
	}: {
		columns: TableColumn[];
		filters: TableFilter[];
		match: 'all' | 'any';
		sort: TableSort[];
		onChange: (next: {
			filters?: TableFilter[];
			match?: 'all' | 'any';
			sort?: TableSort[];
		}) => void;
		onClose: () => void;
	} = $props();

	const filterable = $derived(columns);

	function columnFor(ref: string): TableColumn | undefined {
		return columns.find((column) => column.id === ref) ?? columns.find((c) => c.name === ref);
	}

	function defaultFilterFor(column: TableColumn): TableFilter {
		const op = filterOpsFor(column)[0] ?? 'contains';
		if (column.type === 'checkbox') return { column: column.id, op: 'eq', value: true };
		if (column.type === 'select') {
			const first = column.options?.choices?.[0]?.value;
			return { column: column.id, op, ...(first ? { value: first } : {}) };
		}
		return { column: column.id, op };
	}

	function addFilter() {
		const column = filterable[0];
		if (!column) return;
		onChange({ filters: [...filters, defaultFilterFor(column)] });
	}

	function updateFilter(index: number, patch: Partial<TableFilter>) {
		onChange({
			filters: filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter))
		});
	}

	function changeFilterColumn(index: number, columnId: string) {
		const column = columnFor(columnId);
		if (!column) return;
		onChange({
			filters: filters.map((filter, i) => (i === index ? defaultFilterFor(column) : filter))
		});
	}

	function changeFilterOp(index: number, op: TableFilterOp) {
		const filter = filters[index];
		if (!filter) return;
		updateFilter(index, filterNeedsValue(op) ? { op } : { op, value: undefined });
	}

	function setValue(index: number, column: TableColumn, raw: unknown) {
		updateFilter(index, { value: normalizeFilterValue(column, raw) });
	}

	function removeFilter(index: number) {
		onChange({ filters: filters.filter((_, i) => i !== index) });
	}

	function addSort() {
		const used = new Set(sort.map((entry) => entry.column));
		const column = columns.find((candidate) => !used.has(candidate.id));
		if (!column) return;
		onChange({ sort: [...sort, { column: column.id, direction: 'asc' }] });
	}

	function updateSort(index: number, patch: Partial<TableSort>) {
		onChange({ sort: sort.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
	}

	function removeSort(index: number) {
		onChange({ sort: sort.filter((_, i) => i !== index) });
	}

	function valueText(filter: TableFilter): string {
		const value = filter.value;
		if (
			value === undefined ||
			value === null ||
			Array.isArray(value) ||
			typeof value === 'object'
		)
			return '';
		return String(value);
	}

	const selectClass =
		'min-h-9 min-w-0 rounded-md border border-border-strong bg-background px-2 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm';
</script>

<div class="grid gap-4 p-3.5">
	<section class="grid gap-2" aria-labelledby="table-filter-heading">
		<div class="flex items-center justify-between gap-2">
			<h3 id="table-filter-heading" class="micro-label text-muted-foreground">
				Show rows where
			</h3>
			{#if filters.length > 1}
				<div
					class="flex items-center gap-1 text-xs text-muted-foreground"
					role="radiogroup"
					aria-label="How filters combine"
				>
					{#each [['all', 'all match'], ['any', 'any match']] as [value, label] (value)}
						<button
							type="button"
							role="radio"
							aria-checked={match === value}
							class="min-h-7 rounded-md px-2 font-medium {match === value
								? 'bg-accent/10 text-foreground'
								: 'hover:text-foreground'}"
							onclick={() => onChange({ match: value as 'all' | 'any' })}
						>
							{label}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#each filters as filter, index (index)}
			{@const column = columnFor(filter.column)}
			{#if column}
				<div
					class="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5 rounded-md border border-border bg-background p-2 sm:grid-cols-[8.5rem_8rem_minmax(0,1fr)_auto] sm:border-0 sm:bg-transparent sm:p-0"
				>
					<select
						class="{selectClass} col-span-1"
						aria-label="Filter column"
						value={column.id}
						onchange={(event) => changeFilterColumn(index, event.currentTarget.value)}
					>
						{#each filterable as option (option.id)}
							<option value={option.id}>{option.name}</option>
						{/each}
					</select>
					<button
						type="button"
						class="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:order-last"
						aria-label="Remove filter"
						onclick={() => removeFilter(index)}
					>
						<X class="h-4 w-4" />
					</button>
					<select
						class="{selectClass} col-span-2 sm:col-span-1"
						aria-label="Filter condition"
						value={filter.op}
						onchange={(event) =>
							changeFilterOp(index, event.currentTarget.value as TableFilterOp)}
					>
						{#each filterOpsFor(column) as op (op)}
							<option value={op}>{filterOpLabel(op, column)}</option>
						{/each}
					</select>
					{#if filterNeedsValue(filter.op)}
						<div class="col-span-2 min-w-0 sm:col-span-1">
							{#if column.type === 'select' || column.type === 'multi_select'}
								<select
									class="{selectClass} w-full"
									aria-label="Filter value"
									value={valueText(filter)}
									onchange={(event) =>
										setValue(index, column, event.currentTarget.value)}
								>
									<option value="" disabled>Choose…</option>
									{#each column.options?.choices ?? [] as choice (choice.value)}
										<option value={choice.value}>{choice.value}</option>
									{/each}
								</select>
							{:else if column.type === 'checkbox'}
								<select
									class="{selectClass} w-full"
									aria-label="Filter value"
									value={filter.value === true ? 'true' : 'false'}
									onchange={(event) =>
										setValue(index, column, event.currentTarget.value)}
								>
									<option value="true">Checked</option>
									<option value="false">Not checked</option>
								</select>
							{:else if column.type === 'date'}
								<input
									type="date"
									class="{selectClass} w-full"
									aria-label="Filter date"
									value={toDateInputValue(
										typeof filter.value === 'string' ? filter.value : null
									)}
									oninput={(event) =>
										setValue(index, column, event.currentTarget.value)}
								/>
							{:else}
								<input
									type="text"
									inputmode={column.type === 'number' ? 'decimal' : undefined}
									class="{selectClass} w-full"
									aria-label="Filter value"
									placeholder={column.type === 'number' ? 'Number' : 'Text'}
									value={valueText(filter)}
									oninput={(event) =>
										setValue(index, column, event.currentTarget.value)}
								/>
							{/if}
						</div>
					{:else}
						<span class="hidden sm:block"></span>
					{/if}
				</div>
			{/if}
		{:else}
			<p class="text-sm text-muted-foreground">Every row is showing.</p>
		{/each}

		<button
			type="button"
			class="inline-flex min-h-9 w-max items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10"
			onclick={addFilter}
		>
			<Plus class="h-4 w-4" />
			Add filter
		</button>
	</section>

	<section class="grid gap-2 border-t border-border pt-3" aria-labelledby="table-sort-heading">
		<h3 id="table-sort-heading" class="micro-label text-muted-foreground">Sort by</h3>
		{#each sort as entry, index (entry.column)}
			{@const column = columnFor(entry.column)}
			<div class="flex items-center gap-1.5">
				<select
					class="{selectClass} flex-1"
					aria-label="Sort column"
					value={column?.id ?? entry.column}
					onchange={(event) => updateSort(index, { column: event.currentTarget.value })}
				>
					{#each columns as option (option.id)}
						<option
							value={option.id}
							disabled={option.id !== entry.column &&
								sort.some((s) => s.column === option.id)}
						>
							{option.name}
						</option>
					{/each}
				</select>
				<button
					type="button"
					class="inline-flex min-h-9 items-center gap-1 rounded-md border border-border-strong bg-background px-2.5 text-sm text-foreground hover:border-accent"
					aria-label={entry.direction === 'asc'
						? 'Ascending, switch to descending'
						: 'Descending, switch to ascending'}
					onclick={() =>
						updateSort(index, {
							direction: entry.direction === 'asc' ? 'desc' : 'asc'
						})}
				>
					{#if entry.direction === 'asc'}
						<ArrowUp class="h-3.5 w-3.5" /> A→Z
					{:else}
						<ArrowDown class="h-3.5 w-3.5" /> Z→A
					{/if}
				</button>
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Remove sort"
					onclick={() => removeSort(index)}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">Rows keep their own order.</p>
		{/each}
		{#if sort.length < columns.length}
			<button
				type="button"
				class="inline-flex min-h-9 w-max items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10"
				onclick={addSort}
			>
				<Plus class="h-4 w-4" />
				Add sort
			</button>
		{/if}
	</section>

	{#if filters.length || sort.length}
		<div class="flex justify-between border-t border-border pt-3">
			<button
				type="button"
				class="min-h-9 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={() => onChange({ filters: [], sort: [], match: 'all' })}
			>
				Clear all
			</button>
			<button
				type="button"
				class="min-h-9 rounded-md bg-foreground px-3 text-sm font-semibold text-background pressable"
				onclick={onClose}
			>
				Done
			</button>
		</div>
	{/if}
</div>
