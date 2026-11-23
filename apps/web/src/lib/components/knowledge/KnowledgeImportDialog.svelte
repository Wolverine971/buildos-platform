<!-- apps/web/src/lib/components/knowledge/KnowledgeImportDialog.svelte -->
<!--
	Import contacts into the knowledge graph: pick a phone export (.vcf), LinkedIn's
	Connections.csv or ZIP, or a Google Contacts CSV → see what's in it → import. The file is read in the
	browser, and only the contacts are ever sent (no photos). For phone and Google files the preview
	also says how the file lines up with who is already here: who lands on an existing card, who
	is new, and who will raise a "same person?" question. Nothing is saved until the second step,
	and the file itself is never stored. A finished import can be undone, here or later from the
	recent imports list. Tasker 160.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Check, Loader2, Lock, Undo2, Upload } from '$lib/icons/lucide';
	import {
		summarizeContactFile,
		type ContactFileSummary,
		type ParsedContactFile
	} from '@buildos/shared-agent-ops/knowledge';
	import {
		knowledgeApi,
		prepareContactImport,
		type ImportMatchPreview,
		type ImportSummary,
		type ImportUndoReceipt,
		type RecentImport
	} from './knowledge-client';
	import { readContactExport } from './read-contact-export';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onImported: (summary: ImportSummary) => void;
		/** An import was undone: lists showing people should reload. */
		onUndone?: () => void;
	}

	let { isOpen, onClose, onImported, onUndone }: Props = $props();

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
	// How the file lines up with who is already here (phone and Google files).
	let matching = $state.raw<ImportMatchPreview | null>(null);
	let matchingBusy = $state(false);
	// Undo: recent imports, the one being confirmed, and what the last undo removed.
	let recent = $state.raw<RecentImport[]>([]);
	let confirmUndo = $state<string | null>(null);
	let undoing = $state(false);
	let undone = $state.raw<ImportUndoReceipt | null>(null);
	let undoError = $state<string | null>(null);

	function reset() {
		readSeq++;
		fileName = '';
		pendingImport = null;
		preview = null;
		matching = null;
		matchingBusy = false;
		saved = 0;
		result = null;
		busy = null;
		error = null;
		confirmUndo = null;
		undoError = null;
	}

	function close() {
		if (busy === 'importing' || undoing) return;
		reset();
		undone = null;
		source = 'auto';
		onClose();
	}

	async function loadRecent() {
		try {
			recent = (await knowledgeApi.recentImports()).imports;
		} catch {
			// The list is a convenience: importing works without it.
		}
	}

	// Opening the dialog is the only signal there is: fetch the list then.
	$effect(() => {
		if (isOpen) void loadRecent();
	});

	async function checkMatches(read: ParsedContactFile, name: string, seq: number) {
		matchingBusy = true;
		try {
			const res = await knowledgeApi.previewContactMatches(read, name);
			if (seq === readSeq && typeof res.will_match === 'number') {
				matching = {
					will_match: res.will_match,
					will_create: res.will_create ?? 0,
					to_review: res.to_review ?? 0,
					review_examples: res.review_examples ?? []
				};
			}
		} catch {
			// The preview still shows what is in the file.
		} finally {
			if (seq === readSeq) matchingBusy = false;
		}
	}

	async function undo(runId: string) {
		if (undoing) return;
		undoing = true;
		undoError = null;
		try {
			const receipt = await knowledgeApi.undoImport(runId);
			reset();
			undone = receipt;
			onUndone?.();
			void loadRecent();
		} catch (err) {
			undoError = err instanceof Error ? err.message : 'Could not undo the import';
		} finally {
			undoing = false;
		}
	}

	async function pick(next: File | null | undefined) {
		if (!next) return;
		reset();
		undone = null;
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
			const uploadName = /\.zip$/i.test(next.name) ? 'Connections.csv' : next.name;
			pendingImport = prepareContactImport(read, uploadName, preview);
			if (read.format !== 'linkedin_csv') void checkMatches(read, uploadName, seq);
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
	const count = (value: number | undefined, one: string, many: string) =>
		`${n(value)} ${(value ?? 0) === 1 ? one : many}`;
	const day = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

{#snippet undoConfirm(runId: string)}
	<div class="flex flex-col gap-2 rounded-md border border-border bg-muted/50 px-3 py-3">
		<p class="text-sm text-foreground">
			Undo this import? The people and organizations it added are removed, and its details
			come off the cards of people who were already here. Anyone you've edited, researched or
			linked to your work since stays.
		</p>
		{#if undoError}<p class="text-sm text-destructive" role="alert">{undoError}</p>{/if}
		<div class="flex justify-end gap-2">
			<button
				type="button"
				class="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
				disabled={undoing}
				onclick={() => {
					confirmUndo = null;
					undoError = null;
				}}
			>
				Keep it
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground pressable disabled:opacity-60"
				disabled={undoing}
				onclick={() => void undo(runId)}
			>
				{#if undoing}<Loader2
						class="h-4 w-4 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/> Undoing…{:else}Undo import{/if}
			</button>
		</div>
	</div>
{/snippet}

<Modal
	{isOpen}
	onClose={close}
	title="Import contacts"
	size="md"
	closeOnBackdrop={busy !== 'importing' && !undoing}
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
					<li>
						{n(result.orgs)} organizations{#if result.companies}, including {count(
								result.companies,
								'business card',
								'business cards'
							)}{/if}
					</li>
					<li>{n(result.facts_added)} details saved</li>
					{#if result.facts_suggested}
						<li>
							{count(result.facts_suggested, 'job detail', 'job details')} saved as
							{result.facts_suggested === 1 ? 'a suggestion' : 'suggestions'}, because
							{result.facts_suggested === 1 ? 'it differs' : 'they differ'} from what was
							already here
						</li>
					{/if}
					{#if result.possible_duplicates}
						<li>
							{n(result.possible_duplicates)} possible duplicates to review ("same person?")
						</li>
					{/if}
				</ul>
				{#if confirmUndo && confirmUndo === result.run_id}
					{@render undoConfirm(confirmUndo)}
				{:else}
					<div class="flex items-center justify-between gap-2">
						{#if result.undoable && result.run_id}
							<button
								type="button"
								class="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
								onclick={() => (confirmUndo = result?.run_id ?? null)}
							>
								<Undo2 class="h-4 w-4" aria-hidden="true" /> Undo import
							</button>
						{:else}
							<span></span>
						{/if}
						<button
							type="button"
							class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground pressable"
							onclick={close}
						>
							See people
						</button>
					</div>
				{/if}
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
				{#if matchingBusy}
					<p class="flex items-center gap-2 text-sm text-muted-foreground" role="status">
						<Loader2
							class="h-4 w-4 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/> Checking against the people you already have…
					</p>
				{:else if matching}
					<div class="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2.5">
						<p class="text-xs font-medium text-muted-foreground">
							Against the people you already have
						</p>
						<ul class="flex flex-col gap-1 text-sm text-foreground">
							<li>
								<span class="font-semibold">{n(matching.will_match)}</span> already here.
								Their details go on the same card.
							</li>
							<li>
								<span class="font-semibold">{n(matching.will_create)}</span>
								{matching.will_create === 1 ? 'new person' : 'new people'}
							</li>
							{#if preview.companies}
								<li>
									<span class="font-semibold">{n(preview.companies)}</span>
									{preview.companies === 1
										? 'business, saved as an organization'
										: 'businesses, saved as organizations'}
								</li>
							{/if}
							{#if matching.to_review}
								<li>
									<span class="font-semibold">{n(matching.to_review)}</span>
									{matching.to_review === 1 ? 'looks' : 'look'} like someone already
									here under a different name. You'll be asked "same person?" and nothing
									merges until you answer.
									{#if matching.review_examples.length}
										<ul
											class="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground"
										>
											<!-- Example pairs may repeat a name. -->
											<!-- eslint-disable-next-line svelte/require-each-key -->
											{#each matching.review_examples as pair}
												<li class="truncate">
													{pair.contact} · {pair.existing}
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/if}
						</ul>
					</div>
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
					already there, their details are added to that person. You can undo the import afterwards.
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
			{#if undone}
				<p class="flex items-start gap-2 text-sm text-foreground" role="status">
					<Check class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
					<span>
						Import undone. Removed {count(undone.people_removed, 'person', 'people')},
						{count(undone.orgs_removed, 'organization', 'organizations')} and
						{count(undone.details_removed, 'detail', 'details')}.
						{#if undone.kept}Kept {count(undone.kept, 'entry', 'entries')} you've used since.{/if}
					</span>
				</p>
			{/if}
			{#if recent.length}
				<div class="flex flex-col gap-1.5">
					<p class="text-xs font-medium text-muted-foreground">Recent imports</p>
					<ul
						class="flex flex-col divide-y divide-border rounded-md border border-border text-sm"
					>
						{#each recent as item (item.id)}
							<li class="flex flex-col gap-2 px-3 py-2">
								<div class="flex min-w-0 items-center gap-2">
									<span class="min-w-0 flex-1 truncate text-foreground">
										{item.file_name ?? item.title}
										<span class="text-xs text-muted-foreground">
											· {count(item.contacts, 'contact', 'contacts')} · {day(
												item.created_at
											)}
										</span>
									</span>
									{#if item.undone}
										<span class="shrink-0 text-xs text-muted-foreground"
											>Undone</span
										>
									{:else if item.can_undo && confirmUndo !== item.id}
										<button
											type="button"
											class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
											onclick={() => {
												undoError = null;
												confirmUndo = item.id;
											}}
										>
											<Undo2 class="h-3.5 w-3.5" aria-hidden="true" /> Undo
										</button>
									{/if}
								</div>
								{#if confirmUndo === item.id}{@render undoConfirm(item.id)}{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}
	</div>
</Modal>
