<!-- apps/web/src/lib/components/tables/TablePasteRowsDialog.svelte -->
<!--
	Add rows to this table by pasting from Google Sheets / Excel or a CSV file.
	Shows where each pasted column will land before anything is written.
-->
<script lang="ts">
	import type { TableSchema } from '@buildos/shared-agent-ops/tables';
	import Modal from '$lib/components/ui/Modal.svelte';
	import { ClipboardPaste, Upload } from '$lib/icons/lucide';
	import {
		buildImportPreview,
		firstLineIsHeader,
		planAppend,
		type AppendPlan
	} from './table-import';

	let {
		schema,
		onImport,
		onClose
	}: {
		schema: TableSchema;
		onImport: (plan: AppendPlan) => Promise<void> | void;
		onClose: () => void;
	} = $props();

	let isOpen = $state(true);
	let text = $state('');
	let headerChoice = $state<boolean | null>(null);
	let addUnknown = $state(true);
	let busy = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	const preview = $derived(text.trim() ? buildImportPreview(text) : null);
	const detectedHeader = $derived(preview ? firstLineIsHeader(schema, preview.headers) : false);
	const hasHeader = $derived(headerChoice ?? detectedHeader);
	const plan = $derived(preview ? planAppend(schema, preview, { hasHeader, addUnknown }) : null);
	const unknownCount = $derived(
		preview && hasHeader
			? preview.headers.filter(
					(header) =>
						!schema.columns.some(
							(c) => c.name.trim().toLowerCase() === header.trim().toLowerCase()
						)
				).length
			: 0
	);

	function close() {
		isOpen = false;
		onClose();
	}

	async function readFile(file: File) {
		text = await file.text();
		headerChoice = null;
	}

	async function submit() {
		if (!plan || !plan.records.length) return;
		busy = true;
		try {
			await onImport(plan);
			close();
		} finally {
			busy = false;
		}
	}
</script>

<Modal bind:isOpen onClose={close} title="Add rows" size="lg">
	<div class="grid gap-4 p-4 sm:p-5">
		<div class="grid gap-1.5">
			<label
				for="table-paste-rows"
				class="flex items-center gap-1.5 text-sm font-medium text-foreground"
			>
				<ClipboardPaste class="h-4 w-4 text-muted-foreground" />
				Paste rows from a spreadsheet
			</label>
			<div class="relative tx tx-grid tx-weak rounded-lg">
				<textarea
					id="table-paste-rows"
					bind:value={text}
					rows="7"
					placeholder="Copy cells in Google Sheets or Excel, then paste here (⌘V)."
					class="relative z-10 block w-full resize-y rounded-lg border border-border-strong bg-background px-3 py-2 font-mono text-sm text-foreground shadow-ink-inner outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/30"
					oninput={() => (headerChoice = null)}
				></textarea>
			</div>
			<div class="flex items-center gap-2 text-xs text-muted-foreground">
				<span>or</span>
				<button
					type="button"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 font-medium text-foreground hover:border-accent"
					onclick={() => fileInput?.click()}
				>
					<Upload class="h-3.5 w-3.5" />
					Choose a CSV file
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
		</div>

		{#if preview && plan}
			{#each preview.warnings as warning (warning)}
				<p
					class="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
				>
					{warning}
				</p>
			{/each}
			<label class="flex min-h-9 items-center gap-2 text-sm text-foreground">
				<input
					type="checkbox"
					checked={hasHeader}
					class="h-4 w-4 rounded border-border-strong text-accent focus:ring-ring"
					onchange={(event) => (headerChoice = event.currentTarget.checked)}
				/>
				The first line is column names
			</label>
			{#if hasHeader && unknownCount > 0}
				<label class="flex min-h-9 items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						bind:checked={addUnknown}
						class="h-4 w-4 rounded border-border-strong text-accent focus:ring-ring"
					/>
					Add {unknownCount} new {unknownCount === 1 ? 'column' : 'columns'} for names this
					table doesn't have
				</label>
			{/if}
			<div class="rounded-lg border border-border bg-card p-3 text-sm">
				<p class="font-medium text-foreground">
					{plan.records.length}
					{plan.records.length === 1 ? 'row' : 'rows'} will be added
				</p>
				{#if plan.mapped.length}
					<p class="mt-1 text-muted-foreground">
						Into: <span class="text-foreground">{plan.mapped.join(', ')}</span>
					</p>
				{/if}
				{#if plan.ignored.length}
					<p class="mt-1 text-muted-foreground">Left out: {plan.ignored.join(', ')}</p>
				{/if}
			</div>
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
				disabled={!plan?.records.length || busy}
				onclick={submit}
			>
				{busy
					? 'Adding…'
					: plan?.records.length
						? `Add ${plan.records.length} rows`
						: 'Add rows'}
			</button>
		</div>
	{/snippet}
</Modal>
