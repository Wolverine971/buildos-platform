<!-- apps/web/src/lib/components/tables/TableCellEditor.svelte -->
<!--
	Typed in-place editor laid over a grid cell (portaled so the grid's scroll
	container can't clip its dropdown). Enter saves and moves down, Tab saves and
	moves across, Esc cancels, clicking away saves. Choice columns get a
	filterable list that can add a new option.
-->
<script lang="ts" module>
	export type EditorMove = 'down' | 'up' | 'right' | 'left' | 'none';
</script>

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type {
		TableCellValue,
		TableColumn,
		TableSelectChoice
	} from '@buildos/shared-agent-ops/tables';
	import { portal } from '$lib/actions/portal';
	import { Check, Plus, X } from '$lib/icons/lucide';
	import TableChoiceChip from './TableChoiceChip.svelte';
	import { cellEditText, choiceColor, selectValues, toDateInputValue } from './table-cell-format';
	import type { CoerceCell } from './table-grid-model';

	let {
		column,
		value,
		initialText = null,
		rect,
		coerce,
		onCommit,
		onCancel,
		onInvalid
	}: {
		column: TableColumn;
		value: TableCellValue | undefined;
		/** A typed character that started the edit (replaces the cell). */
		initialText?: string | null;
		rect: DOMRect;
		coerce: CoerceCell;
		onCommit: (value: TableCellValue, move: EditorMove, newChoices?: string[]) => void;
		onCancel: () => void;
		onInvalid?: (message: string) => void;
	} = $props();

	const isChoice = $derived(column.type === 'select' || column.type === 'multi_select');
	const isMulti = $derived(column.type === 'multi_select');
	const isLong = $derived(column.type === 'long_text');
	const isDate = $derived(column.type === 'date');

	// The editor is created per edit, so seeding local state from props once is intended.
	// svelte-ignore state_referenced_locally
	let text = $state(
		initialText ??
			(column.type === 'date'
				? toDateInputValue(value)
				: isChoiceType()
					? ''
					: cellEditText(column, value))
	);
	// svelte-ignore state_referenced_locally
	let picked = $state<string[]>(selectValues(value));
	let error = $state<string | null>(null);
	let highlighted = $state(0);
	let root = $state<HTMLDivElement | null>(null);
	let field = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let viewportHeight = $state(800);
	let viewportWidth = $state(1200);
	let done = false;

	function isChoiceType() {
		return column.type === 'select' || column.type === 'multi_select';
	}

	const choices = $derived<TableSelectChoice[]>(column.options?.choices ?? []);
	const filter = $derived(text.trim().toLowerCase());
	const filteredChoices = $derived(
		filter ? choices.filter((choice) => choice.value.toLowerCase().includes(filter)) : choices
	);
	const exactMatch = $derived(
		!!filter && choices.some((choice) => choice.value.toLowerCase() === filter)
	);
	const canAdd = $derived(isChoice && !!filter && !exactMatch);
	type Option =
		| { kind: 'choice'; value: string }
		| { kind: 'add'; value: string }
		| { kind: 'clear' };
	const options = $derived.by<Option[]>(() => {
		const list: Option[] = filteredChoices.map((choice) => ({
			kind: 'choice',
			value: choice.value
		}));
		if (canAdd) list.push({ kind: 'add', value: text.trim() });
		if (!isMulti && selectValues(value).length && !filter) list.push({ kind: 'clear' });
		return list;
	});

	const panelWidth = $derived(Math.max(rect.width, isLong ? 360 : isChoice ? 240 : rect.width));
	const left = $derived(Math.max(8, Math.min(rect.left, viewportWidth - panelWidth - 8)));
	let editorHeight = $state(0);
	// Lift the editor when its dropdown would run off the bottom of the screen.
	const top = $derived(
		rect.top + editorHeight <= viewportHeight - 8
			? rect.top
			: Math.max(8, viewportHeight - editorHeight - 8)
	);

	onMount(() => {
		void tick().then(() => {
			field?.focus({ preventScroll: true });
			if (field && initialText === null && !isChoice && 'select' in field && !isDate) {
				field.select();
			} else if (field && initialText !== null && 'setSelectionRange' in field && !isDate) {
				const end = field.value.length;
				field.setSelectionRange(end, end);
			}
		});
	});

	function sameValue(a: TableCellValue | undefined, b: TableCellValue | undefined): boolean {
		if (Array.isArray(a) || Array.isArray(b)) {
			const left = selectValues(a ?? null);
			const right = selectValues(b ?? null);
			return left.length === right.length && left.every((item, i) => item === right[i]);
		}
		return (a ?? null) === (b ?? null) || (a ?? '') === (b ?? '');
	}

	function finish(next: TableCellValue, move: EditorMove, newChoices?: string[]) {
		if (done) return;
		done = true;
		if (sameValue(next, value) && !newChoices?.length) onCommit(value ?? null, move);
		else onCommit(next, move, newChoices);
	}

	function cancel() {
		if (done) return;
		done = true;
		onCancel();
	}

	function commitText(move: EditorMove): boolean {
		const raw = text;
		if (raw.trim() === '') {
			finish(null, move);
			return true;
		}
		const result = coerce(column, raw);
		if (result.error) {
			error = result.error;
			return false;
		}
		finish(result.value, move);
		return true;
	}

	function newChoicesFor(values: string[]): string[] {
		return values.filter(
			(item) => !choices.some((choice) => choice.value.toLowerCase() === item.toLowerCase())
		);
	}

	function canonical(item: string): string {
		return (
			choices.find((choice) => choice.value.toLowerCase() === item.toLowerCase())?.value ??
			item
		);
	}

	function pick(option: Option, move: EditorMove = 'none') {
		if (option.kind === 'clear') {
			finish(null, move);
			return;
		}
		const item = canonical(option.value.trim());
		if (!item) return;
		if (isMulti) {
			picked = picked.some((p) => p.toLowerCase() === item.toLowerCase())
				? picked.filter((p) => p.toLowerCase() !== item.toLowerCase())
				: [...picked, item];
			text = '';
			highlighted = 0;
			field?.focus();
			return;
		}
		finish(item, move, newChoicesFor([item]));
	}

	function commitMulti(move: EditorMove) {
		finish(picked.length ? picked : null, move, newChoicesFor(picked));
	}

	function moveFor(event: KeyboardEvent): EditorMove {
		if (event.key === 'Tab') return event.shiftKey ? 'left' : 'right';
		return event.shiftKey ? 'up' : 'down';
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			cancel();
			return;
		}
		if (isChoice) {
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				highlighted = Math.min(highlighted + 1, Math.max(0, options.length - 1));
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				highlighted = Math.max(0, highlighted - 1);
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				const option = options[highlighted];
				if (isMulti) {
					if (option && filter) pick(option);
					else commitMulti('down');
				} else if (option) {
					pick(option, 'down');
				} else {
					finish(value ?? null, 'down');
				}
				return;
			}
			if (event.key === 'Tab') {
				event.preventDefault();
				if (isMulti) commitMulti(moveFor(event));
				else finish(value ?? null, moveFor(event));
				return;
			}
			if (event.key === 'Backspace' && isMulti && text === '' && picked.length) {
				event.preventDefault();
				picked = picked.slice(0, -1);
			}
			return;
		}
		if (event.key === 'Enter' && !(isLong && event.shiftKey)) {
			event.preventDefault();
			commitText(isLong ? 'down' : moveFor(event));
			return;
		}
		if (event.key === 'Tab') {
			event.preventDefault();
			commitText(moveFor(event));
		}
	}

	function handleFocusOut(event: FocusEvent) {
		const next = event.relatedTarget as Node | null;
		if (next && root?.contains(next)) return;
		if (done) return;
		if (isChoice) {
			if (isMulti) commitMulti('none');
			else cancel();
			return;
		}
		if (!commitText('none')) {
			const message = error ?? 'That value does not fit this column.';
			cancel();
			onInvalid?.(message);
		}
	}

	$effect(() => {
		// Keep the highlighted option in range as the filter narrows.
		if (highlighted > options.length - 1) highlighted = Math.max(0, options.length - 1);
	});
</script>

<svelte:window bind:innerHeight={viewportHeight} bind:innerWidth={viewportWidth} />

<div
	use:portal
	bind:this={root}
	bind:offsetHeight={editorHeight}
	class="table-cell-editor fixed z-[10001]"
	style:left="{left}px"
	style:top="{top}px"
	style:width="{panelWidth}px"
	role="presentation"
	onfocusout={handleFocusOut}
	onkeydown={handleKeydown}
>
	{#if isLong}
		<textarea
			bind:this={field}
			bind:value={text}
			rows="5"
			aria-label={`Edit ${column.name}`}
			class="block min-h-32 w-full resize-y rounded-md border border-accent bg-background px-2.5 py-2 text-base leading-snug text-foreground shadow-ink-strong outline-none ring-2 ring-ring/30 sm:text-sm"
		></textarea>
		<p class="mt-1 rounded-md bg-card/95 px-2 py-1 text-2xs text-muted-foreground shadow-ink">
			Enter saves · Shift+Enter new line · Esc cancels
		</p>
	{:else if isChoice}
		<div
			class="rounded-md border border-accent bg-background shadow-ink-strong ring-2 ring-ring/30"
			style:min-height="{rect.height}px"
		>
			<div class="flex flex-wrap items-center gap-1 px-2 py-1.5">
				{#if isMulti}
					{#each picked as item (item)}
						<span class="inline-flex items-center gap-0.5">
							<TableChoiceChip label={item} color={choiceColor(column, item)} />
							<button
								type="button"
								class="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
								aria-label={`Remove ${item}`}
								onpointerdown={(event) => event.preventDefault()}
								onclick={() => (picked = picked.filter((p) => p !== item))}
							>
								<X class="h-3 w-3" />
							</button>
						</span>
					{/each}
				{/if}
				<input
					bind:this={field}
					bind:value={text}
					type="text"
					role="combobox"
					aria-expanded="true"
					aria-controls="table-choice-list"
					aria-activedescendant={options.length
						? `table-choice-${highlighted}`
						: undefined}
					aria-label={`Choose ${column.name}`}
					placeholder={isMulti ? 'Find or add options' : 'Find or add an option'}
					class="min-w-24 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
				/>
			</div>
			<ul
				id="table-choice-list"
				role="listbox"
				aria-multiselectable={isMulti}
				class="max-h-60 overflow-y-auto border-t border-border py-1"
			>
				{#each options as option, index (option.kind + (option.kind === 'clear' ? '' : option.value))}
					<!-- Keyboard picks options through the combobox input (aria-activedescendant). -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<li
						id={`table-choice-${index}`}
						role="option"
						aria-selected={option.kind === 'choice' &&
							(isMulti
								? picked.some((p) => p.toLowerCase() === option.value.toLowerCase())
								: selectValues(value)[0]?.toLowerCase() ===
									option.value.toLowerCase())}
						class="mx-1 flex min-h-9 cursor-pointer items-center gap-2 rounded px-2 text-sm {index ===
						highlighted
							? 'bg-accent/10'
							: ''}"
						onpointerdown={(event) => event.preventDefault()}
						onpointerenter={() => (highlighted = index)}
						onclick={() => pick(option)}
					>
						{#if option.kind === 'choice'}
							<span class="flex w-4 justify-center text-accent">
								{#if isMulti ? picked.some((p) => p.toLowerCase() === option.value.toLowerCase()) : selectValues(value)[0]?.toLowerCase() === option.value.toLowerCase()}
									<Check class="h-3.5 w-3.5" />
								{/if}
							</span>
							<TableChoiceChip
								label={option.value}
								color={choiceColor(column, option.value)}
							/>
						{:else if option.kind === 'add'}
							<Plus class="h-3.5 w-3.5 text-muted-foreground" />
							<span class="text-foreground">Add “{option.value}”</span>
						{:else}
							<X class="h-3.5 w-3.5 text-muted-foreground" />
							<span class="text-muted-foreground">Clear</span>
						{/if}
					</li>
				{:else}
					<li class="px-3 py-2 text-xs text-muted-foreground">Type to add an option</li>
				{/each}
			</ul>
			{#if isMulti}
				<div class="flex justify-end border-t border-border px-2 py-1.5">
					<button
						type="button"
						class="min-h-8 rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground pressable"
						onpointerdown={(event) => event.preventDefault()}
						onclick={() => commitMulti('none')}
					>
						Done
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<input
			bind:this={field}
			bind:value={text}
			type={isDate
				? 'date'
				: column.type === 'email'
					? 'email'
					: column.type === 'url'
						? 'url'
						: 'text'}
			inputmode={column.type === 'number' ? 'decimal' : undefined}
			aria-label={`Edit ${column.name}`}
			aria-invalid={error ? 'true' : undefined}
			class="block w-full rounded-md border bg-background px-2 text-base text-foreground shadow-ink-strong outline-none ring-2 sm:text-sm {error
				? 'border-destructive ring-destructive/30'
				: 'border-accent ring-ring/30'} {column.type === 'number'
				? 'stamp text-right'
				: ''}"
			style:height="{Math.max(rect.height, 32)}px"
			oninput={() => (error = null)}
		/>
	{/if}
	{#if error}
		<p
			class="mt-1 rounded-md border border-destructive/30 bg-card px-2 py-1 text-xs text-foreground shadow-ink"
			role="alert"
		>
			{error}
		</p>
	{/if}
</div>
