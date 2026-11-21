<!-- apps/web/src/lib/components/knowledge/KnowledgeImportDialog.svelte -->
<!--
	Import contacts into the knowledge graph: pick a phone export (.vcf), LinkedIn's
	Connections.csv or ZIP, or a Google Contacts CSV → see what's in it → import. The file is read in the
	browser: the preview needs no upload, and the import sends only the contacts (no photos).
	Nothing is saved until the second step, and the file itself is never stored. Tasker 160.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Check, Loader2, Lock, Upload } from '$lib/icons/lucide';
	import {
		summarizeContactFile,
		type ContactFileSummary
	} from '@buildos/shared-agent-ops/knowledge';
	import { prepareContactImport, type ImportSummary } from './knowledge-client';
	import { readContactExport } from './read-contact-export';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onImported: (summary: ImportSummary) => void;
	}

	let { isOpen, onClose, onImported }: Props = $props();

	const fileTypes = {
		auto: { accept: '.zip,.csv,.vcf', hint: 'LinkedIn ZIP · CSV · vCard (.vcf)' },
		linkedin: { accept: '.zip,.csv', hint: 'LinkedIn ZIP or Connections.csv' },
		phone: { accept: '.vcf', hint: 'vCard (.vcf)' },
		google: { accept: '.csv,.vcf', hint: 'Google CSV or vCard (.vcf)' }
	};
	let source = $state<keyof typeof fileTypes>('auto');
	let fileName = $state('');
	let pendingImport: ReturnType<typeof prepareContactImport> | null = null;
	let readSeq = 0;
	let preview = $state.raw<ContactFileSummary | null>(null);
	let dated = $state(0);
	let saved = $state(0);
	let result = $state<ImportSummary | null>(null);
	let busy = $state<'reading' | 'importing' | null>(null);
	let error = $state<string | null>(null);
	let dragging = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	function reset() {
		readSeq++;
		fileName = '';
		pendingImport = null;
		preview = null;
		saved = 0;
		result = null;
		busy = null;
		error = null;
	}

	function close() {
		if (busy === 'importing') return;
		reset();
		source = 'auto';
		onClose();
	}

	async function pick(next: File | null | undefined) {
		if (!next) return;
		reset();
		const seq = readSeq;
		busy = 'reading';
		try {
			const read = await readContactExport(next);
			if (seq !== readSeq) return;
			if (source === 'linkedin' && read.format !== 'linkedin_csv')
				throw new Error('Choose Connections.csv or the ZIP from your LinkedIn export.');
			fileName = next.name;
			preview = summarizeContactFile(read);
			dated = read.contacts.filter((contact) => contact.connectedOn).length;
			pendingImport = prepareContactImport(
				read,
				/\.zip$/i.test(next.name) ? 'Connections.csv' : next.name,
				preview
			);
		} catch (err) {
			if (seq === readSeq)
				error = err instanceof Error ? err.message : 'Could not read that file';
		} finally {
			if (seq === readSeq) busy = null;
		}
	}

	async function runImport() {
		if (!pendingImport || busy) return;
		busy = 'importing';
		error = null;
		try {
			const summary = await pendingImport((count) => (saved = count));
			onImported(summary);
			if (summary.format === 'linkedin_csv') {
				reset();
				source = 'auto';
				onClose();
			} else {
				result = summary;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'The import stopped';
		} finally {
			busy = null;
		}
	}

	const n = (value: number | undefined) => (value ?? 0).toLocaleString();
</script>

<Modal
	{isOpen}
	onClose={close}
	title="Import contacts"
	size="md"
	closeOnBackdrop={busy !== 'importing'}
>
	<div class="flex flex-col gap-4 p-4 sm:p-5">
		{#if result}
			<div class="flex flex-col gap-3" role="status">
				<p class="flex items-center gap-2 text-base font-semibold text-foreground">
					<Check class="h-5 w-5 text-accent" aria-hidden="true" /> Imported {n(
						result.contacts
					)} contacts
				</p>
				<ul class="flex flex-col gap-1 text-sm text-muted-foreground">
					<li>
						{n(result.people_created)} new people, {n(result.people_matched)} already here
						(updated)
					</li>
					<li>{n(result.orgs)} organizations</li>
					<li>{n(result.facts_added)} details saved</li>
					{#if result.possible_duplicates}
						<li>{n(result.possible_duplicates)} possible duplicates to review</li>
					{/if}
				</ul>
				<div class="flex justify-end">
					<button
						type="button"
						class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground pressable"
						onclick={close}
					>
						See people
					</button>
				</div>
			</div>
		{:else if preview}
			<div class="flex flex-col gap-3">
				<p class="text-sm text-muted-foreground">{preview.format_label} · {fileName}</p>
				<p class="text-base font-semibold text-foreground">
					{n(preview.contacts)} contacts
				</p>
				<ul class="grid grid-cols-3 gap-2 text-center">
					<li class="rounded-md bg-muted/50 px-2 py-2">
						<span class="block text-base font-semibold text-foreground"
							>{n(preview.with_email)}</span
						>
						<span class="text-xs text-muted-foreground">with email</span>
					</li>
					<li class="rounded-md bg-muted/50 px-2 py-2">
						<span class="block text-base font-semibold text-foreground"
							>{n(
								preview.format === 'linkedin_csv' ? dated : preview.with_phone
							)}</span
						>
						<span class="text-xs text-muted-foreground"
							>{preview.format === 'linkedin_csv'
								? 'with connection date'
								: 'with phone'}</span
						>
					</li>
					<li class="rounded-md bg-muted/50 px-2 py-2">
						<span class="block text-base font-semibold text-foreground"
							>{n(preview.with_company)}</span
						>
						<span class="text-xs text-muted-foreground">with company</span>
					</li>
				</ul>
				{#if preview.sample.length}
					<ul
						class="flex flex-col divide-y divide-border rounded-md border border-border text-sm"
					>
						<!-- Contact previews may include identical names and details. -->
						<!-- eslint-disable-next-line svelte/require-each-key -->
						{#each preview.sample as person}
							<li class="flex min-w-0 items-center gap-2 px-3 py-2">
								<span class="truncate font-medium text-foreground"
									>{person.name}</span
								>
								{#if person.detail}<span
										class="truncate text-xs text-muted-foreground"
										>{person.detail}</span
									>{/if}
							</li>
						{/each}
					</ul>
				{/if}
				{#if preview.capped}
					<p class="text-xs text-muted-foreground">
						This import accepts up to {n(preview.contacts)} contacts per file.
					</p>
				{/if}
				{#if preview.skipped}
					<p class="text-xs text-muted-foreground">
						{n(preview.skipped)}
						{preview.skipped === 1 ? 'row has' : 'rows have'} no contact name and will be
						skipped.
					</p>
				{/if}
				<p class="flex items-start gap-1.5 text-xs text-muted-foreground">
					<Lock class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					Contacts are saved to your private knowledge graph. When a contact matches someone
					already there, their details are added to that person.
				</p>
				{#if saved}
					<p class="text-sm text-muted-foreground" role="status">
						{n(saved)} of {n(preview.contacts)} contacts saved
					</p>
				{/if}
				{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
				<div class="flex justify-end gap-2">
					<button
						type="button"
						class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
						disabled={busy === 'importing'}
						onclick={reset}
					>
						Pick another file
					</button>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground pressable disabled:opacity-60"
						disabled={busy === 'importing'}
						onclick={() => void runImport()}
					>
						{#if busy === 'importing'}<Loader2
								class="h-4 w-4 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/> Importing…{:else if error}Retry import{:else}Import {n(
								preview.contacts
							)} contacts{/if}
					</button>
				</div>
			</div>
		{:else}
			<label class="flex flex-col gap-1 text-sm font-medium text-foreground">
				Contact source
				<select
					class="rounded-md border border-border bg-card px-3 py-2 font-normal"
					bind:value={source}
					disabled={busy === 'reading'}
					onchange={() => (error = null)}
				>
					<option value="auto">Detect from file</option>
					<option value="linkedin">LinkedIn connections</option>
					<option value="phone">Phone contacts</option>
					<option value="google">Google Contacts</option>
				</select>
			</label>
			{#if source === 'linkedin'}
				<ol class="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
					<li>
						Open <a
							href="https://www.linkedin.com/mypreferences/d/download-my-data"
							target="_blank"
							rel="noopener noreferrer"
							class="font-medium text-accent underline">Get a copy of your data</a
						> in LinkedIn’s Settings → Data privacy.
					</li>
					<li>Select only <strong>Connections</strong> and request your archive.</li>
					<li>
						Download the ZIP from LinkedIn’s email. It may take a few minutes to a day.
					</li>
					<li>
						Choose the ZIP below, or unzip it and choose <strong>Connections.csv</strong
						>.
					</li>
				</ol>
			{:else if source === 'phone'}
				<p class="text-sm text-muted-foreground">
					On iPhone, open Contacts → Lists, press and hold All Contacts, then tap Export.
					On Android, export your contacts as a vCard (.vcf).
				</p>
			{:else if source === 'google'}
				<p class="text-sm text-muted-foreground">
					In Google Contacts, choose Export, then Google CSV or vCard.
				</p>
			{/if}
			<button
				type="button"
				class="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors {dragging
					? 'border-accent bg-accent/5'
					: 'border-border hover:border-accent/60'}"
				onclick={() => input?.click()}
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(e) => {
					e.preventDefault();
					dragging = false;
					void pick(e.dataTransfer?.files?.[0]);
				}}
				disabled={busy === 'reading'}
			>
				{#if busy === 'reading'}
					<Loader2
						class="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none"
						aria-hidden="true"
					/>
					<span class="text-sm text-muted-foreground">Reading…</span>
				{:else}
					<Upload class="h-6 w-6 text-muted-foreground" aria-hidden="true" />
					<span class="text-sm font-medium text-foreground"
						>Drop a contacts file here, or click to pick one</span
					>
					<span class="text-xs text-muted-foreground">{fileTypes[source].hint}</span>
				{/if}
			</button>
			<input
				bind:this={input}
				type="file"
				accept={fileTypes[source].accept}
				class="hidden"
				onchange={(e) => {
					const next = e.currentTarget.files?.[0];
					e.currentTarget.value = '';
					void pick(next);
				}}
			/>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
		{/if}
	</div>
</Modal>
