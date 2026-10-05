<!-- apps/web/src/lib/components/tables/NewTableDialog.svelte -->
<!--
	Create a table: blank, pasted from a spreadsheet, or from a CSV file. Pasted
	and uploaded data shows the columns BuildOS inferred (with a type you can
	change) and the first rows before anything is created.

	<NewTableDialog projectId parentId? onCreated={(table) => …} onClose? />
-->
<script lang="ts">
	import type {
		LoadedTable,
		TableColumnInput,
		TableColumnType
	} from '@buildos/shared-agent-ops/tables';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		ClipboardPaste,
		FileSpreadsheet,
		Plus,
		Sheet,
		Table2,
		Upload,
		X
	} from '$lib/icons/lucide';
	import TableColumnTypeIcon from './TableColumnTypeIcon.svelte';
	import { tableClient, type TableClient } from './table-client';
	import { friendlyTableError } from './table-controller.svelte';
	import { COLUMN_TYPE_OPTIONS } from './table-cell-format';
	import {
		buildBlankPayload,
		buildCreatePayload,
		buildImportPreview,
		overrideColumnType,
		titleFromFilename,
		IMPORT_PREVIEW_ROWS
	} from './table-import';

	let {
		projectId,
		parentId = null,
		initialTitle = '',
		initialText = '',
		initialTab = null,
		client = tableClient,
		onCreated,
		onClose
	}: {
		projectId: string;
		parentId?: string | null;
		initialTitle?: string;
		/** Prefill (e.g. "Save as table" from chat): opens on the Paste tab. */
		initialText?: string;
		initialTab?: 'blank' | 'paste' | 'upload' | null;
		client?: TableClient;
		onCreated: (table: LoadedTable) => void;
		onClose?: () => void;
	} = $props();

	type Tab = 'blank' | 'paste' | 'upload';
	let isOpen = $state(true);
	// svelte-ignore state_referenced_locally
	let tab = $state<Tab>(initialTab ?? (initialText ? 'paste' : 'blank'));
	// svelte-ignore state_referenced_locally
	let title = $state(initialTitle);
	// svelte-ignore state_referenced_locally
	let text = $state(initialText);
	let filename = $state<string | null>(null);
	let fileText = $state('');
	let overrides = $state<Record<number, TableColumnType>>({});
	let blankColumns = $state<TableColumnInput[]>([
		{ name: 'Name', type: 'text' },
		{ name: 'Status', type: 'select', options: { choices: [] } },
		{ name: 'Notes', type: 'long_text' }
	]);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let dragOver = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	const sourceText = $derived(tab === 'paste' ? text : tab === 'upload' ? fileText : '');
	const preview = $derived(sourceText.trim() ? buildImportPreview(sourceText) : null);
	const columns = $derived(
		preview
			? preview.columns.map((column, index) =>
					overrides[index] ? overrideColumnType(column, overrides[index]!) : column
				)
			: []
	);
	const canCreate = $derived(
		!busy &&
			(tab === 'blank'
				? blankColumns.some((column) => column.name.trim())
				: !!preview && preview.columns.length > 0)
	);

	function close() {
		isOpen = false;
		onClose?.();
	}

	function setTab(next: Tab) {
		tab = next;
		overrides = {};
		error = null;
	}

	async function readFile(file: File) {
		error = null;
		if (file.size > 8 * 1024 * 1024) {
			error = 'That file is over 8 MB. Split it into smaller files.';
			return;
		}
		fileText = await file.text();
		filename = file.name;
		overrides = {};
		if (!title.trim()) title = titleFromFilename(file.name);
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
		const file = event.dataTransfer?.files?.[0];
		if (file) void readFile(file);
	}

	async function create() {
		if (!canCreate) return;
		busy = true;
		error = null;
		try {
			const payload =
				tab === 'blank'
					? buildBlankPayload({
							projectId,
							parentId,
							title,
							columns: blankColumns
								.filter((column) => column.name.trim())
								.map((column) => ({ ...column, name: column.name.trim() }))
						})
					: buildCreatePayload({
							projectId,
							parentId,
							title:
								title ||
								(filename ? titleFromFilename(filename) : 'Untitled table'),
							text: sourceText,
							preview: preview!,
							columns,
							sourceKind: tab === 'upload' ? 'csv' : 'paste',
							filename: filename ?? undefined
						});
			const { table, warnings } = await client.createTable(payload);
			onCreated(table);
			if (warnings.length) toastService.warning(warnings[0]!);
			close();
		} catch (err) {
			error = friendlyTableError(err, "Couldn't create the table.");
		} finally {
			busy = false;
		}
	}

	const TABS: Array<{ id: Tab; label: string; icon: typeof Table2 }> = [
		{ id: 'blank', label: 'Blank', icon: Table2 },
		{ id: 'paste', label: 'Paste', icon: ClipboardPaste },
		{ id: 'upload', label: 'CSV file', icon: Upload }
	];

	const fieldClass =
		'rounded-md border border-border-strong bg-background px-3 text-base text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30 sm:text-sm';
	const inputClass = `w-full ${fieldClass}`;
</script>

<Modal bind:isOpen onClose={close} title="New table" size="lg">
	<div class="grid gap-4 p-4 sm:p-5">
		<label class="grid gap-1">
			<span class="micro-label text-muted-foreground">Name</span>
			<input
				bind:value={title}
				placeholder="e.g. Job applications"
				class="{inputClass} min-h-11 font-medium sm:min-h-10"
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void create();
					}
				}}
			/>
		</label>

		<div
			class="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
			role="tablist"
			aria-label="Start from"
		>
			{#each TABS as option (option.id)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === option.id}
					class="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md text-sm font-medium {tab ===
					option.id
						? 'bg-card text-foreground shadow-ink'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => setTab(option.id)}
				>
					<option.icon class="h-4 w-4" />
					{option.label}
				</button>
			{/each}
		</div>

		{#if tab === 'blank'}
			<div class="grid gap-2" role="tabpanel">
				<p class="text-sm text-muted-foreground">
					Start with a few columns. You can change all of this later.
				</p>
				<ul class="grid gap-1.5">
					{#each blankColumns as column, index (index)}
						<li class="flex items-center gap-1.5">
							<span
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
							>
								<TableColumnTypeIcon
									column={{ type: column.type ?? 'text' }}
									class="h-4 w-4"
								/>
							</span>
							<input
								bind:value={column.name}
								aria-label={`Column ${index + 1} name`}
								placeholder="Column name"
								class="{fieldClass} min-h-10 min-w-0 flex-1"
							/>
							<select
								bind:value={column.type}
								aria-label={`Column ${index + 1} type`}
								class="{fieldClass} min-h-10 w-36 shrink-0 sm:w-40"
							>
								{#each COLUMN_TYPE_OPTIONS.filter((o) => o.type !== 'link') as option (option.type)}
									<option value={option.type}>{option.label}</option>
								{/each}
							</select>
							<button
								type="button"
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
								aria-label={`Remove column ${column.name || index + 1}`}
								disabled={blankColumns.length === 1}
								onclick={() =>
									(blankColumns = blankColumns.filter((_, i) => i !== index))}
							>
								<X class="h-4 w-4" />
							</button>
						</li>
					{/each}
				</ul>
				<button
					type="button"
					class="inline-flex min-h-9 w-max items-center gap-1.5 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10"
					onclick={() => (blankColumns = [...blankColumns, { name: '', type: 'text' }])}
				>
					<Plus class="h-4 w-4" />
					Add column
				</button>
			</div>
		{:else if tab === 'paste'}
			<div class="grid gap-1.5" role="tabpanel">
				<label
					for="new-table-paste"
					class="flex items-center gap-1.5 text-sm text-muted-foreground"
				>
					<Sheet class="h-4 w-4" />
					Copy the cells in Google Sheets or Excel (headers included), then paste.
				</label>
				<div class="relative tx tx-grid tx-weak rounded-lg">
					<textarea
						id="new-table-paste"
						bind:value={text}
						rows="7"
						placeholder="Company	Role	Status&#10;Northwind	Engineer	Applied"
						class="relative z-10 block w-full resize-y rounded-lg border border-border-strong bg-background px-3 py-2 font-mono text-sm text-foreground shadow-ink-inner outline-none placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30"
						oninput={() => (overrides = {})}
					></textarea>
				</div>
			</div>
		{:else}
			<div role="tabpanel">
				<button
					type="button"
					class="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors {dragOver
						? 'border-accent bg-accent/5'
						: 'border-border hover:border-border-strong'}"
					ondragover={(event) => {
						event.preventDefault();
						dragOver = true;
					}}
					ondragleave={() => (dragOver = false)}
					ondrop={handleDrop}
					onclick={() => fileInput?.click()}
				>
					<FileSpreadsheet class="h-7 w-7 text-muted-foreground" />
					{#if filename}
						<span class="text-sm font-medium text-foreground">{filename}</span>
						<span class="text-xs text-muted-foreground">Choose a different file</span>
					{:else}
						<span class="text-sm font-medium text-foreground"
							>Drop a CSV file here, or choose one</span
						>
						<span class="text-xs text-muted-foreground"
							>CSV or TSV, exported from any spreadsheet</span
						>
					{/if}
				</button>
				<input
					bind:this={fileInput}
					type="file"
					accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
					class="sr-only"
					tabindex="-1"
					onchange={(event) => {
						const file = event.currentTarget.files?.[0];
						if (file) void readFile(file);
						event.currentTarget.value = '';
					}}
				/>
			</div>
		{/if}

		{#if tab !== 'blank' && preview}
			{#each preview.warnings as warning (warning)}
				<p
					class="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
				>
					{warning}
				</p>
			{/each}
			{#if preview.columns.length}
				<section class="grid gap-2" aria-labelledby="new-table-preview">
					<h3 id="new-table-preview" class="text-sm font-medium text-foreground">
						{preview.rowCount.toLocaleString()}
						{preview.rowCount === 1 ? 'row' : 'rows'} ·
						{columns.length}
						{columns.length === 1 ? 'column' : 'columns'}
					</h3>
					<div class="max-h-72 overflow-auto rounded-lg border border-border">
						<table class="w-full min-w-max border-collapse text-sm">
							<thead class="sticky top-0 z-10 bg-card">
								<tr>
									{#each columns as column, index (index)}
										<th
											scope="col"
											class="border-b border-border px-2 py-1.5 text-left align-top"
										>
											<span
												class="block truncate text-xs font-semibold text-foreground"
												>{column.name}</span
											>
											<label
												class="mt-1 flex items-center gap-1 text-muted-foreground"
											>
												<TableColumnTypeIcon
													column={{
														type: column.type ?? 'text',
														options: column.options
													}}
												/>
												<span class="sr-only">Type for {column.name}</span>
												<select
													value={column.type ?? 'text'}
													class="min-h-8 rounded border border-border bg-background px-1 text-xs font-normal text-foreground outline-none focus:border-accent"
													onchange={(event) =>
														(overrides = {
															...overrides,
															[index]: event.currentTarget
																.value as TableColumnType
														})}
												>
													{#each COLUMN_TYPE_OPTIONS.filter((o) => o.type !== 'link') as option (option.type)}
														<option value={option.type}
															>{option.label}</option
														>
													{/each}
												</select>
											</label>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each preview.sample as row, rowIndex (rowIndex)}
									<tr class="border-b border-border/60 last:border-b-0">
										{#each columns as _, index (index)}
											<td
												class="max-w-48 truncate px-2 py-1.5 text-foreground"
												>{row[index] ?? ''}</td
											>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if preview.rowCount > IMPORT_PREVIEW_ROWS}
						<p class="text-xs text-muted-foreground">
							Showing the first {IMPORT_PREVIEW_ROWS}. All {preview.rowCount.toLocaleString()}
							rows will be imported.
						</p>
					{/if}
				</section>
			{/if}
		{/if}

		{#if error}
			<p
				class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground"
				role="alert"
			>
				{error}
			</p>
		{/if}
	</div>

	{#snippet footer()}
		<div class="flex justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
			<button
				type="button"
				class="min-h-11 rounded-lg px-4 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:min-h-9"
				onclick={close}
			>
				Cancel
			</button>
			<button
				type="button"
				class="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground tx-button tx-button-accent disabled:opacity-50 sm:min-h-9"
				disabled={!canCreate}
				onclick={() => void create()}
			>
				{busy ? 'Creating…' : 'Create table'}
			</button>
		</div>
	{/snippet}
</Modal>
