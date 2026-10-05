<!-- apps/web/src/lib/components/tables/TableFieldEditor.svelte -->
<!--
	One labeled, always-editable field for the row detail sheet. Keeps a local
	draft while focused and follows the stored value otherwise (so an AI fill
	landing while the sheet is open shows up).
-->
<script lang="ts">
	import type { TableCellValue, TableColumn } from '@buildos/shared-agent-ops/tables';
	import TableCellView from './TableCellView.svelte';
	import TableChoiceChip from './TableChoiceChip.svelte';
	import { cellEditText, choiceColor, selectValues, toDateInputValue } from './table-cell-format';
	import type { CoerceCell } from './table-grid-model';

	let {
		column,
		value,
		projectId,
		readonly = false,
		coerce,
		onCommit,
		onInvalid
	}: {
		column: TableColumn;
		value: TableCellValue | undefined;
		projectId: string;
		readonly?: boolean;
		coerce: CoerceCell;
		onCommit: (value: TableCellValue) => void;
		onInvalid: (message: string) => void;
	} = $props();

	const inputId = $props.id();
	let focused = $state(false);
	let draft = $state('');
	let error = $state<string | null>(null);

	const stored = $derived(
		column.type === 'date' ? toDateInputValue(value) : cellEditText(column, value)
	);
	const shown = $derived(focused ? draft : stored);

	function begin() {
		draft = stored;
		focused = true;
	}

	function commitText() {
		focused = false;
		const raw = draft;
		if (raw === stored) return;
		if (raw.trim() === '') {
			error = null;
			onCommit(null);
			return;
		}
		const result = coerce(column, raw);
		if (result.error) {
			error = result.error;
			onInvalid(result.error);
			return;
		}
		error = null;
		onCommit(result.value);
	}

	function toggleChoice(choice: string) {
		const current = selectValues(value);
		const next = current.includes(choice)
			? current.filter((item) => item !== choice)
			: [...current, choice];
		onCommit(next.length ? next : null);
	}

	const inputClass =
		'w-full rounded-md border border-border-strong bg-background px-2.5 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30 disabled:opacity-60 sm:text-sm';
</script>

{#if column.type === 'link' || (readonly && column.type !== 'long_text')}
	<div id={inputId} class="min-h-9 py-1.5 text-sm">
		<TableCellView {column} {value} {projectId} wrap interactiveLinks />
	</div>
{:else if column.type === 'long_text'}
	<textarea
		id={inputId}
		value={shown}
		rows="4"
		disabled={readonly}
		aria-label={column.name}
		class="{inputClass} resize-y py-2 leading-snug"
		onfocus={begin}
		oninput={(event) => (draft = event.currentTarget.value)}
		onblur={commitText}
	></textarea>
{:else if column.type === 'checkbox'}
	<label class="flex min-h-11 cursor-pointer items-center gap-2.5 sm:min-h-9">
		<input
			id={inputId}
			type="checkbox"
			checked={value === true}
			aria-label={column.name}
			class="h-5 w-5 rounded border-border-strong text-accent focus:ring-ring"
			onchange={(event) => onCommit(event.currentTarget.checked)}
		/>
		<span class="text-sm text-muted-foreground">{value === true ? 'Yes' : 'No'}</span>
	</label>
{:else if column.type === 'select'}
	<select
		id={inputId}
		value={selectValues(value)[0] ?? ''}
		aria-label={column.name}
		class="{inputClass} min-h-11 sm:min-h-9"
		onchange={(event) => onCommit(event.currentTarget.value || null)}
	>
		<option value="">—</option>
		{#each column.options?.choices ?? [] as choice (choice.value)}
			<option value={choice.value}>{choice.value}</option>
		{/each}
		{#each selectValues(value).filter((v) => !(column.options?.choices ?? []).some((c) => c.value === v)) as extra (extra)}
			<option value={extra}>{extra}</option>
		{/each}
	</select>
{:else if column.type === 'multi_select'}
	<div id={inputId} class="flex flex-wrap gap-1.5" role="group" aria-label={column.name}>
		{#each column.options?.choices ?? [] as choice (choice.value)}
			{@const on = selectValues(value).includes(choice.value)}
			<button
				type="button"
				aria-pressed={on}
				class="min-h-9 rounded-full border px-1 transition-colors {on
					? 'border-accent'
					: 'border-transparent opacity-60 hover:opacity-100'}"
				onclick={() => toggleChoice(choice.value)}
			>
				<TableChoiceChip label={choice.value} color={choiceColor(column, choice.value)} />
			</button>
		{:else}
			<span class="text-sm text-muted-foreground"
				>No options yet. Add them from the column menu.</span
			>
		{/each}
	</div>
{:else}
	<input
		id={inputId}
		type={column.type === 'date'
			? 'date'
			: column.type === 'email'
				? 'email'
				: column.type === 'url'
					? 'url'
					: 'text'}
		inputmode={column.type === 'number' ? 'decimal' : undefined}
		value={shown}
		aria-label={column.name}
		aria-invalid={error ? 'true' : undefined}
		class="{inputClass} min-h-11 sm:min-h-9 {column.type === 'number' ? 'stamp' : ''} {error
			? 'border-destructive'
			: ''}"
		onfocus={begin}
		oninput={(event) => {
			draft = event.currentTarget.value;
			error = null;
		}}
		onchange={() => {
			if (column.type === 'date') commitText();
		}}
		onblur={() => {
			if (focused) commitText();
		}}
		onkeydown={(event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				event.currentTarget.blur();
			}
			if (event.key === 'Escape' && focused) {
				event.preventDefault();
				event.stopPropagation();
				draft = stored;
				focused = false;
				event.currentTarget.blur();
			}
		}}
	/>
	{#if error}
		<p class="mt-1 text-xs text-destructive" role="alert">{error}</p>
	{/if}
{/if}
