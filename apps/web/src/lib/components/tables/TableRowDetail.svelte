<!-- apps/web/src/lib/components/tables/TableRowDetail.svelte -->
<!--
	Every field of one row, editable, with where AI-filled values came from.
	A bottom sheet on phones, a dialog on desktop. J/K (or the arrows in the
	header) step through rows without closing.
-->
<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import type {
		TableCellValue,
		TableColumn,
		TableRow,
		TableRowTask,
		TableSchema
	} from '@buildos/shared-agent-ops/tables';
	import { buildRecordHref } from '@buildos/shared-types';
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		AlertCircle,
		Bot,
		CheckCircle2,
		ChevronDown,
		Circle,
		ChevronUp,
		ExternalLink,
		EyeOff,
		ListChecks,
		RefreshCw,
		Sparkles,
		Trash2,
		X
	} from '$lib/icons/lucide';
	import TableColumnTypeIcon from './TableColumnTypeIcon.svelte';
	import TableFieldEditor from './TableFieldEditor.svelte';
	import { formatDate, hostnameOf, safeHref } from './table-cell-format';
	import type { CoerceCell } from './table-grid-model';
	import { orderedVisibleColumns, rowTitle } from './table-view-model';

	let {
		schema,
		row,
		projectId,
		tasks = [],
		readonly = false,
		coerce,
		position = null,
		onEdit,
		onMakeTask,
		onDelete,
		onAskAgain,
		onStep,
		onInvalid,
		onClose
	}: {
		schema: TableSchema;
		row: TableRow;
		projectId: string;
		/** Tasks made from this row. */
		tasks?: TableRowTask[];
		readonly?: boolean;
		coerce: CoerceCell;
		/** "3 of 12" in the current view, for stepping. */
		position?: { index: number; total: number } | null;
		onEdit: (columnId: string, value: TableCellValue) => void;
		onMakeTask: () => void;
		onDelete: () => void;
		onAskAgain: (column: TableColumn) => void;
		onStep?: (delta: 1 | -1) => void;
		onInvalid: (message: string) => void;
		onClose: () => void;
	} = $props();

	const phone = new MediaQuery('max-width: 767px', false);
	let isOpen = $state(true);
	let confirmDelete = $state(false);
	let showHidden = $state(false);

	const visible = $derived(orderedVisibleColumns(schema));
	const hidden = $derived(schema.columns.filter((column) => column.hidden));
	const title = $derived(rowTitle(schema, row));

	function close() {
		isOpen = false;
		onClose();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!onStep) return;
		const target = event.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		if (event.key === 'j' || event.key === 'ArrowDown') {
			event.preventDefault();
			onStep(1);
		} else if (event.key === 'k' || event.key === 'ArrowUp') {
			event.preventDefault();
			onStep(-1);
		}
	}

	function sourceLinks(urls: string[] | undefined) {
		return (urls ?? [])
			.map((url) => ({ url, href: safeHref(url) }))
			.filter((source): source is { url: string; href: string } => !!source.href)
			.slice(0, 3);
	}
</script>

<Modal
	bind:isOpen
	onClose={close}
	size="md"
	variant={phone.current ? 'bottom-sheet' : 'center'}
	ariaLabel={`Row ${row.row_number}: ${title}`}
>
	{#snippet header()}
		<div class="flex items-start gap-3 border-b border-border px-4 pb-3 pt-4 sm:px-5">
			<div class="min-w-0 flex-1">
				<p class="micro-label text-muted-foreground">
					Row r{row.row_number}{#if position}
						· {position.index + 1} of {position.total}{/if}
				</p>
				<h2 class="mt-0.5 truncate text-lg font-semibold text-foreground">{title}</h2>
			</div>
			{#if onStep && position && position.total > 1}
				<div class="flex shrink-0 gap-1">
					<button
						type="button"
						class="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
						aria-label="Previous row (K)"
						disabled={position.index === 0}
						onclick={() => onStep?.(-1)}
					>
						<ChevronUp class="h-4 w-4" />
					</button>
					<button
						type="button"
						class="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
						aria-label="Next row (J)"
						disabled={position.index >= position.total - 1}
						onclick={() => onStep?.(1)}
					>
						<ChevronDown class="h-4 w-4" />
					</button>
				</div>
			{/if}
			<button
				type="button"
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/50 hover:text-destructive"
				aria-label="Close row"
				onclick={close}
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/snippet}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="grid gap-4 px-4 py-4 sm:px-5" onkeydown={handleKeydown}>
		{#if tasks.length}
			<section class="grid gap-1.5" aria-label="Tasks from this row">
				<p class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
					<ListChecks class="h-3.5 w-3.5 text-accent" />
					<span class="text-foreground/90">Tasks</span>
				</p>
				<ul class="grid gap-1">
					{#each tasks as task (task.id)}
						{@const done = task.state_key === 'done'}
						<li>
							<a
								href={buildRecordHref('task', task.id, projectId) ?? undefined}
								class="flex min-h-9 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm hover:border-accent"
							>
								{#if done}
									<CheckCircle2
										class="h-4 w-4 shrink-0 text-accent"
										aria-label="Done"
									/>
								{:else}
									<Circle
										class="h-4 w-4 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
								{/if}
								<span
									class="min-w-0 flex-1 truncate {done
										? 'text-muted-foreground line-through'
										: 'text-foreground'}">{task.title || 'Untitled task'}</span
								>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		{#each [...visible, ...(showHidden ? hidden : [])] as column (column.id)}
			{@const meta = row.cell_meta?.[column.id]}
			<div class="grid gap-1.5">
				<div class="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
					<TableColumnTypeIcon {column} />
					<span class="text-foreground/90">{column.name}</span>
					{#if column.ai}<Sparkles
							class="h-3 w-3 text-accent"
							aria-label="Question column"
						/>{/if}
					{#if column.hidden}<EyeOff class="h-3 w-3" aria-label="Hidden column" />{/if}
				</div>
				{#if column.description}
					<p class="-mt-1 text-xs text-muted-foreground">{column.description}</p>
				{/if}
				<TableFieldEditor
					{column}
					value={row.cells[column.id]}
					{projectId}
					{readonly}
					{coerce}
					onCommit={(value) => onEdit(column.id, value)}
					{onInvalid}
				/>
				{#if meta && meta.by !== 'import'}
					<div
						class="rounded-md border px-2.5 py-2 text-xs {meta.state === 'error'
							? 'border-destructive/30 bg-destructive/5'
							: 'border-accent/25 bg-accent/5'}"
					>
						<p class="flex items-center gap-1.5 font-medium text-foreground">
							{#if meta.state === 'error'}
								<AlertCircle class="h-3.5 w-3.5 text-destructive" />
								Couldn't find an answer{meta.error ? `: ${meta.error}` : ''}
							{:else if meta.state === 'pending'}
								<Sparkles class="h-3.5 w-3.5 text-accent" />
								Looking for an answer…
							{:else if meta.by === 'agent'}
								<Bot class="h-3.5 w-3.5 text-accent" />
								Filled by the agent{meta.confidence
									? ` · ${meta.confidence} confidence`
									: ''}
							{:else}
								<Sparkles class="h-3.5 w-3.5 text-accent" />
								Found by the question column{meta.confidence
									? ` · ${meta.confidence} confidence`
									: ''}
							{/if}
							{#if meta.at}<span
									class="stamp ml-auto text-2xs font-normal text-muted-foreground"
									>{formatDate(meta.at)}</span
								>{/if}
						</p>
						{#if meta.note}
							<p class="mt-1 leading-snug text-muted-foreground">{meta.note}</p>
						{/if}
						{#if sourceLinks(meta.source_urls).length}
							<ul class="mt-1.5 flex flex-wrap gap-1.5">
								{#each sourceLinks(meta.source_urls) as source (source.url)}
									<li>
										<a
											href={source.href}
											target="_blank"
											rel="noopener noreferrer"
											class="inline-flex min-h-8 items-center gap-1 rounded-md border border-border bg-background px-2 font-medium text-foreground hover:border-accent hover:text-accent"
										>
											{hostnameOf(source.url)}
											<ExternalLink class="h-3 w-3" aria-hidden="true" />
										</a>
									</li>
								{/each}
							</ul>
						{/if}
						{#if !readonly && column.ai && meta.state !== 'pending'}
							<button
								type="button"
								class="mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
								onclick={() => onAskAgain(column)}
							>
								<RefreshCw class="h-3 w-3" />
								Ask again
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		{#if hidden.length}
			<button
				type="button"
				class="w-max text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				onclick={() => (showHidden = !showHidden)}
			>
				{showHidden ? 'Hide' : 'Show'}
				{hidden.length} hidden {hidden.length === 1 ? 'column' : 'columns'}
			</button>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3 sm:px-5">
			{#if !readonly}
				<button
					type="button"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-ink pressable hover:border-accent sm:min-h-9"
					onclick={onMakeTask}
				>
					<ListChecks class="h-4 w-4 text-muted-foreground" />
					Make a task
				</button>
				<button
					type="button"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium hover:bg-destructive/10 sm:min-h-9 {confirmDelete
						? 'text-destructive'
						: 'text-muted-foreground'}"
					onclick={() => {
						if (!confirmDelete) {
							confirmDelete = true;
							return;
						}
						onDelete();
					}}
				>
					<Trash2 class="h-4 w-4" />
					{confirmDelete ? 'Delete this row?' : 'Delete'}
				</button>
			{/if}
			<button
				type="button"
				class="ml-auto min-h-11 rounded-lg bg-foreground px-4 text-sm font-semibold text-background tx-button tx-button-ink sm:min-h-9"
				onclick={close}
			>
				Done
			</button>
		</div>
	{/snippet}
</Modal>
