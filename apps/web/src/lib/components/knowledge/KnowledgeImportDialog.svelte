<!-- apps/web/src/lib/components/knowledge/KnowledgeImportDialog.svelte -->
<!--
	Import contacts into the knowledge graph: pick a phone export (.vcf), LinkedIn's
	Connections.csv or a Google Contacts CSV → see what's in it → import. Nothing is saved until
	the second step, and the file itself is never stored. Tasker 160.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { Check, Loader2, Lock, Upload } from '$lib/icons/lucide';
	import { knowledgeApi, type ImportSummary } from './knowledge-client';

	interface Props {
		isOpen: boolean;
		onClose: () => void;
		onImported: (summary: ImportSummary) => void;
	}

	let { isOpen, onClose, onImported }: Props = $props();

	let file = $state<File | null>(null);
	let preview = $state<ImportSummary | null>(null);
	let result = $state<ImportSummary | null>(null);
	let busy = $state<'reading' | 'importing' | null>(null);
	let error = $state<string | null>(null);
	let dragging = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	function reset() {
		file = null;
		preview = null;
		result = null;
		busy = null;
		error = null;
	}

	function close() {
		if (busy === 'importing') return;
		reset();
		onClose();
	}

	async function pick(next: File | null | undefined) {
		if (!next) return;
		reset();
		file = next;
		busy = 'reading';
		try {
			preview = await knowledgeApi.importFile(next, true);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not read that file';
			file = null;
		} finally {
			busy = null;
		}
	}

	async function runImport() {
		if (!file) return;
		busy = 'importing';
		error = null;
		try {
			result = await knowledgeApi.importFile(file, false);
			onImported(result);
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
		{:else if preview && file}
			<div class="flex flex-col gap-3">
				<p class="text-sm text-muted-foreground">{preview.format_label} · {file.name}</p>
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
							>{n(preview.with_phone)}</span
						>
						<span class="text-xs text-muted-foreground">with phone</span>
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
						{#each preview.sample as person, i (i)}
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
						Only the first 10,000 contacts are imported at a time.
					</p>
				{/if}
				<p class="flex items-start gap-1.5 text-xs text-muted-foreground">
					<Lock class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					Only you can see these people. Their emails and phone numbers are never shared. Importing
					again updates the same people instead of adding copies.
				</p>
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
							/> Importing…{:else}Import {n(preview.contacts)} contacts{/if}
					</button>
				</div>
			</div>
		{:else}
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
					<span class="text-xs text-muted-foreground"
						>.vcf from your phone · LinkedIn Connections.csv · Google Contacts CSV</span
					>
				{/if}
			</button>
			<input
				bind:this={input}
				type="file"
				accept=".vcf,.csv,text/vcard,text/csv"
				class="hidden"
				onchange={(e) => void pick((e.currentTarget as HTMLInputElement).files?.[0])}
			/>
			{#if error}<p class="text-sm text-destructive" role="alert">{error}</p>{/if}
			<details class="text-sm text-muted-foreground">
				<summary class="cursor-pointer font-medium text-foreground"
					>How to export your contacts</summary
				>
				<dl class="mt-2 flex flex-col gap-2">
					<div>
						<dt class="font-medium text-foreground">iPhone</dt>
						<dd>
							Contacts app → Lists → press and hold All Contacts → Export. Or on
							icloud.com/contacts, select all → Export vCard.
						</dd>
					</div>
					<div>
						<dt class="font-medium text-foreground">Android or Gmail</dt>
						<dd>contacts.google.com → Export → Google CSV or vCard.</dd>
					</div>
					<div>
						<dt class="font-medium text-foreground">LinkedIn</dt>
						<dd>
							Settings → Data privacy → Get a copy of your data → Connections.
							LinkedIn emails you a Connections.csv, usually within 10 minutes.
						</dd>
					</div>
				</dl>
			</details>
		{/if}
	</div>
</Modal>
