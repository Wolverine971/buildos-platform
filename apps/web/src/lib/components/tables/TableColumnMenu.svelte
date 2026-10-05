<!-- apps/web/src/lib/components/tables/TableColumnMenu.svelte -->
<!--
	Everything about one column: name, type, options and their colors,
	description, sort, hide, delete, and "Make this a question column" (a prompt
	that runs once per row, optionally searching the web, then fills the cells
	with sources). Lives inside a TablePopover.
-->
<script lang="ts">
	import {
		TABLE_CHOICE_COLORS,
		type TableChoiceColor,
		type TableColumn,
		type TableColumnChange,
		type TableColumnType,
		type TableNumberFormat,
		type TableSelectChoice
	} from '@buildos/shared-agent-ops/tables';
	import {
		ArrowDown,
		ArrowUp,
		ChevronLeft,
		EyeOff,
		Plus,
		Sparkles,
		Star,
		Trash2,
		X
	} from '$lib/icons/lucide';
	import TableChoiceChip from './TableChoiceChip.svelte';
	import TableColumnTypeIcon from './TableColumnTypeIcon.svelte';
	import { COLUMN_TYPE_OPTIONS, nextChoiceColor } from './table-cell-format';

	let {
		column,
		isPrimary = false,
		rowCount = 0,
		emptyCount = 0,
		readonly = false,
		initialView = 'main',
		aiFillRunning = false,
		onChange,
		onRenameChoice,
		onSort,
		onSetPrimary,
		onFill,
		onClose
	}: {
		column: TableColumn;
		isPrimary?: boolean;
		rowCount?: number;
		emptyCount?: number;
		readonly?: boolean;
		initialView?: 'main' | 'ai';
		aiFillRunning?: boolean;
		onChange: (changes: TableColumnChange[], opts?: { undoToast?: string }) => void;
		onRenameChoice: (from: string, to: string) => void;
		onSort: (direction: 'asc' | 'desc') => void;
		onSetPrimary: () => void;
		onFill: (opts: { onlyEmpty: boolean }) => void;
		onClose: () => void;
	} = $props();

	// The menu mounts per open, so seeding local drafts from the column once is intended.
	// svelte-ignore state_referenced_locally
	let view = $state<'main' | 'ai'>(initialView);
	// svelte-ignore state_referenced_locally
	let name = $state(column.name);
	// svelte-ignore state_referenced_locally
	let description = $state(column.description ?? '');
	// svelte-ignore state_referenced_locally
	let prompt = $state(column.ai?.prompt ?? '');
	// svelte-ignore state_referenced_locally
	let research = $state(column.ai?.research ?? true);
	let newChoice = $state('');
	let confirmDelete = $state(false);
	let colorFor = $state<string | null>(null);

	const choices = $derived<TableSelectChoice[]>(column.options?.choices ?? []);
	const isChoiceColumn = $derived(column.type === 'select' || column.type === 'multi_select');
	const format = $derived<TableNumberFormat>(column.options?.format ?? 'number');

	function commitName() {
		const next = name.trim();
		if (!next || next === column.name) {
			name = column.name;
			return;
		}
		onChange([{ action: 'rename', column: column.id, name: next }]);
	}

	function commitDescription() {
		const next = description.trim();
		if (next === (column.description ?? '')) return;
		onChange([{ action: 'update', column: column.id, description: next }]);
	}

	function retype(type: TableColumnType) {
		if (type === column.type) return;
		const options =
			type === 'select' || type === 'multi_select'
				? { choices }
				: type === 'number'
					? { format: 'number' as TableNumberFormat }
					: undefined;
		onChange([{ action: 'retype', column: column.id, type, ...(options ? { options } : {}) }], {
			undoToast: `${column.name} is now ${COLUMN_TYPE_OPTIONS.find((o) => o.type === type)?.label ?? type}`
		});
	}

	function setFormat(next: TableNumberFormat) {
		if (next === format) return;
		onChange([
			{
				action: 'update',
				column: column.id,
				options: {
					format: next,
					...(next === 'currency' ? { currency: column.options?.currency ?? 'USD' } : {})
				}
			}
		]);
	}

	function setCurrency(code: string) {
		const currency = code.trim().toUpperCase().slice(0, 3);
		if (currency.length !== 3 || currency === column.options?.currency) return;
		onChange([{ action: 'update', column: column.id, options: { currency } }]);
	}

	function saveChoices(next: TableSelectChoice[]) {
		onChange([{ action: 'update', column: column.id, options: { choices: next } }]);
	}

	function addChoice() {
		const value = newChoice.trim();
		if (!value) return;
		if (choices.some((choice) => choice.value.toLowerCase() === value.toLowerCase())) {
			newChoice = '';
			return;
		}
		saveChoices([...choices, { value, color: nextChoiceColor(choices) }]);
		newChoice = '';
	}

	function renameChoice(index: number, value: string) {
		const current = choices[index];
		const next = value.trim();
		if (!current || !next || next === current.value) return;
		if (
			choices.some(
				(choice, i) => i !== index && choice.value.toLowerCase() === next.toLowerCase()
			)
		)
			return;
		onRenameChoice(current.value, next);
	}

	function recolor(index: number, color: TableChoiceColor) {
		saveChoices(choices.map((choice, i) => (i === index ? { ...choice, color } : choice)));
		colorFor = null;
	}

	function removeChoice(index: number) {
		saveChoices(choices.filter((_, i) => i !== index));
	}

	function moveChoice(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= choices.length) return;
		const next = [...choices];
		const [item] = next.splice(index, 1);
		next.splice(target, 0, item!);
		saveChoices(next);
	}

	function hide() {
		onChange([{ action: 'update', column: column.id, hidden: true }], {
			undoToast: `${column.name} hidden`
		});
		onClose();
	}

	function remove() {
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		onChange([{ action: 'delete', column: column.id }], {
			undoToast: `${column.name} deleted`
		});
		onClose();
	}

	function saveQuestion(fill: boolean) {
		const text = prompt.trim();
		if (!text) return;
		const changed = text !== column.ai?.prompt || research !== column.ai?.research;
		if (changed) {
			onChange([
				{
					action: 'update',
					column: column.id,
					ai: { prompt: text, research, updated_at: new Date().toISOString() }
				}
			]);
		}
		if (fill) onFill({ onlyEmpty: true });
		onClose();
	}

	function stopQuestion() {
		onChange([{ action: 'update', column: column.id, ai: null }]);
		view = 'main';
	}

	function onEnter(event: KeyboardEvent, fn: () => void) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			fn();
		}
	}
</script>

{#if view === 'ai'}
	<div class="grid gap-3 p-3.5">
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="-ml-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Back to column options"
				onclick={() => (view = 'main')}
			>
				<ChevronLeft class="h-4 w-4" />
			</button>
			<div class="min-w-0">
				<p class="flex items-center gap-1.5 text-sm font-semibold text-foreground">
					<Sparkles class="h-3.5 w-3.5 text-accent" />
					Question column
				</p>
				<p class="text-xs text-muted-foreground">
					Asks this for every row and fills {column.name}.
				</p>
			</div>
		</div>
		<label class="grid gap-1">
			<span class="micro-label text-muted-foreground">What should it find for each row?</span>
			<textarea
				bind:value={prompt}
				rows="3"
				data-autofocus
				disabled={readonly}
				placeholder="e.g. Who is the hiring manager for this role?"
				class="w-full resize-y rounded-md border border-border-strong bg-background px-2.5 py-2 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm"
				onkeydown={(event) => {
					if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						saveQuestion(true);
					}
				}}
			></textarea>
		</label>
		<label
			class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border border-border bg-background px-2.5 py-2"
		>
			<input
				type="checkbox"
				bind:checked={research}
				disabled={readonly}
				class="mt-0.5 h-4 w-4 rounded border-border-strong text-accent focus:ring-ring"
			/>
			<span class="text-sm text-foreground">
				Search the web for each row
				<span class="block text-xs text-muted-foreground">
					Off: answers only from the row's other columns.
				</span>
			</span>
		</label>
		<p class="text-xs text-muted-foreground">
			Each row is one AI request. Answers come back with sources you can check.
		</p>
		<div class="flex flex-wrap items-center justify-end gap-2">
			{#if column.ai}
				<button
					type="button"
					class="mr-auto min-h-9 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
					disabled={readonly}
					onclick={stopQuestion}
				>
					Stop asking
				</button>
			{/if}
			<button
				type="button"
				class="min-h-9 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:border-accent disabled:opacity-50"
				disabled={readonly || !prompt.trim()}
				onclick={() => saveQuestion(false)}
			>
				Save
			</button>
			<button
				type="button"
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-semibold text-accent-foreground tx-button tx-button-accent disabled:opacity-50"
				disabled={readonly || !prompt.trim() || aiFillRunning || rowCount === 0}
				onclick={() => saveQuestion(true)}
			>
				<Sparkles class="h-3.5 w-3.5" />
				{aiFillRunning
					? 'Filling…'
					: emptyCount > 0
						? `Fill ${emptyCount} empty ${emptyCount === 1 ? 'cell' : 'cells'}`
						: 'Fill'}
			</button>
		</div>
	</div>
{:else}
	<div class="grid gap-3 p-3.5">
		<label class="grid gap-1">
			<span class="micro-label text-muted-foreground">Column name</span>
			<input
				bind:value={name}
				data-autofocus
				disabled={readonly}
				class="min-h-9 w-full rounded-md border border-border-strong bg-background px-2.5 text-base font-medium text-foreground shadow-ink-inner outline-none focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm"
				onblur={commitName}
				onkeydown={(event) => onEnter(event, commitName)}
			/>
		</label>

		<div class="grid gap-1">
			<span class="micro-label text-muted-foreground">Type</span>
			<div class="flex items-center gap-2">
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
				>
					<TableColumnTypeIcon {column} class="h-4 w-4" />
				</span>
				<select
					value={column.type}
					disabled={readonly}
					aria-label="Column type"
					class="min-h-9 flex-1 rounded-md border border-border-strong bg-background px-2 text-base text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm"
					onchange={(event) => retype(event.currentTarget.value as TableColumnType)}
				>
					{#each COLUMN_TYPE_OPTIONS as option (option.type)}
						<option value={option.type}>{option.label}</option>
					{/each}
				</select>
			</div>
			{#if column.type === 'number'}
				<div class="mt-1 flex flex-wrap gap-1" role="radiogroup" aria-label="Number format">
					{#each [['number', 'Number'], ['currency', 'Money'], ['percent', 'Percent'], ['hours', 'Hours']] as [value, label] (value)}
						<button
							type="button"
							role="radio"
							aria-checked={format === value}
							disabled={readonly}
							class="min-h-8 rounded-md border px-2.5 text-xs font-medium {format ===
							value
								? 'border-accent bg-accent/10 text-foreground'
								: 'border-border bg-background text-muted-foreground hover:text-foreground'}"
							onclick={() => setFormat(value as TableNumberFormat)}
						>
							{label}
						</button>
					{/each}
					{#if format === 'currency'}
						<input
							value={column.options?.currency ?? 'USD'}
							maxlength="3"
							disabled={readonly}
							aria-label="Currency code"
							class="stamp min-h-8 w-16 rounded-md border border-border-strong bg-background px-2 text-xs uppercase text-foreground outline-none focus:border-accent"
							onchange={(event) => setCurrency(event.currentTarget.value)}
						/>
					{/if}
				</div>
			{/if}
			{#if column.type !== 'link'}
				<p class="text-2xs text-muted-foreground">
					Changing the type converts existing values. You can undo it.
				</p>
			{/if}
		</div>

		{#if isChoiceColumn}
			<div class="grid gap-1">
				<span class="micro-label text-muted-foreground">Options</span>
				<ul class="grid gap-1">
					{#each choices as choice, index (choice.value)}
						<li class="flex items-center gap-1">
							<button
								type="button"
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-muted"
								aria-label={`Color for ${choice.value}`}
								aria-expanded={colorFor === choice.value}
								disabled={readonly}
								onclick={() =>
									(colorFor = colorFor === choice.value ? null : choice.value)}
							>
								<TableChoiceChip variant="dot" color={choice.color ?? 'gray'} />
							</button>
							<input
								value={choice.value}
								disabled={readonly}
								aria-label={`Rename option ${choice.value}`}
								class="min-h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm text-foreground outline-none hover:border-border focus:border-accent focus:bg-background"
								onchange={(event) => renameChoice(index, event.currentTarget.value)}
							/>
							<button
								type="button"
								class="flex h-8 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
								aria-label={`Move ${choice.value} up`}
								disabled={readonly || index === 0}
								onclick={() => moveChoice(index, -1)}
							>
								<ArrowUp class="h-3 w-3" />
							</button>
							<button
								type="button"
								class="flex h-8 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
								aria-label={`Move ${choice.value} down`}
								disabled={readonly || index === choices.length - 1}
								onclick={() => moveChoice(index, 1)}
							>
								<ArrowDown class="h-3 w-3" />
							</button>
							<button
								type="button"
								class="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive"
								aria-label={`Remove option ${choice.value}`}
								disabled={readonly}
								onclick={() => removeChoice(index)}
							>
								<X class="h-3.5 w-3.5" />
							</button>
						</li>
						{#if colorFor === choice.value}
							<li class="pb-1 pl-9">
								<div
									class="flex flex-wrap gap-1"
									role="radiogroup"
									aria-label={`Colors for ${choice.value}`}
								>
									{#each TABLE_CHOICE_COLORS as color (color)}
										<button
											type="button"
											role="radio"
											aria-checked={(choice.color ?? 'gray') === color}
											aria-label={color}
											class="flex h-8 w-8 items-center justify-center rounded-md border {(choice.color ??
												'gray') === color
												? 'border-accent'
												: 'border-transparent hover:border-border'}"
											onclick={() => recolor(index, color)}
										>
											<TableChoiceChip variant="dot" {color} />
										</button>
									{/each}
								</div>
							</li>
						{/if}
					{/each}
				</ul>
				{#if !readonly}
					<div class="flex items-center gap-1">
						<input
							bind:value={newChoice}
							placeholder="Add an option"
							aria-label="New option"
							class="min-h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-background px-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-accent sm:text-sm"
							onkeydown={(event) => onEnter(event, addChoice)}
						/>
						<button
							type="button"
							class="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-accent hover:text-accent"
							aria-label="Add option"
							onclick={addChoice}
						>
							<Plus class="h-4 w-4" />
						</button>
					</div>
				{/if}
			</div>
		{/if}

		<label class="grid gap-1">
			<span class="micro-label text-muted-foreground">Description</span>
			<textarea
				bind:value={description}
				rows="2"
				disabled={readonly}
				placeholder="What belongs here? The agent reads this too."
				class="w-full resize-y rounded-md border border-border-strong bg-background px-2.5 py-1.5 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm"
				onblur={commitDescription}
			></textarea>
		</label>

		{#if !readonly && column.type !== 'link'}
			<button
				type="button"
				class="flex min-h-11 items-center gap-2.5 rounded-md border border-border bg-background px-2.5 text-left hover:border-accent tx tx-bloom tx-weak"
				onclick={() => (view = 'ai')}
			>
				<Sparkles class="h-4 w-4 shrink-0 text-accent" />
				<span class="min-w-0">
					<span class="block text-sm font-medium text-foreground">
						{column.ai ? 'Edit the question' : 'Make this a question column'}
					</span>
					<span class="block truncate text-xs text-muted-foreground">
						{column.ai
							? column.ai.prompt
							: 'Ask something for every row and fill it with sources'}
					</span>
				</span>
			</button>
			{#if column.ai}
				<div class="flex gap-2">
					<button
						type="button"
						class="min-h-9 flex-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground pressable hover:border-accent disabled:opacity-50"
						disabled={aiFillRunning || emptyCount === 0}
						onclick={() => {
							onFill({ onlyEmpty: true });
							onClose();
						}}
					>
						Fill {emptyCount} empty
					</button>
					<button
						type="button"
						class="min-h-9 flex-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground pressable hover:border-accent disabled:opacity-50"
						disabled={aiFillRunning || rowCount === 0}
						onclick={() => {
							onFill({ onlyEmpty: false });
							onClose();
						}}
					>
						Re-ask all {rowCount}
					</button>
				</div>
			{/if}
		{/if}

		<div class="grid gap-0.5 border-t border-border pt-2">
			<button
				type="button"
				class="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-foreground hover:bg-muted"
				onclick={() => {
					onSort('asc');
					onClose();
				}}
			>
				<ArrowUp class="h-4 w-4 text-muted-foreground" />
				Sort ascending
			</button>
			<button
				type="button"
				class="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-foreground hover:bg-muted"
				onclick={() => {
					onSort('desc');
					onClose();
				}}
			>
				<ArrowDown class="h-4 w-4 text-muted-foreground" />
				Sort descending
			</button>
			{#if !readonly}
				{#if !isPrimary}
					<button
						type="button"
						class="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-foreground hover:bg-muted"
						onclick={() => {
							onSetPrimary();
							onClose();
						}}
					>
						<Star class="h-4 w-4 text-muted-foreground" />
						Use as the row title
					</button>
					<button
						type="button"
						class="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-foreground hover:bg-muted"
						onclick={hide}
					>
						<EyeOff class="h-4 w-4 text-muted-foreground" />
						Hide column
					</button>
				{/if}
				<button
					type="button"
					class="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm hover:bg-destructive/10 {confirmDelete
						? 'font-semibold text-destructive'
						: 'text-foreground'}"
					onclick={remove}
				>
					<Trash2
						class="h-4 w-4 {confirmDelete
							? 'text-destructive'
							: 'text-muted-foreground'}"
					/>
					{confirmDelete ? `Delete ${column.name} and its values?` : 'Delete column'}
				</button>
			{/if}
		</div>
	</div>
{/if}
