<!-- apps/web/src/lib/components/agent/SpecialistWorkbench.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		createSpecialistWorkbenchDraftV1,
		createSpecialistStarterDraftV1,
		SPECIALIST_STARTERS_V1,
		type SpecialistWorkbenchDraftV1,
		type SpecialistWorkbenchPreviewV1
	} from '@buildos/agentic-chat-runtime/specialists';
	import Button from '$lib/components/ui/Button.svelte';
	import { BookOpen, Check, Download, FileText, Plus, Save, Trash2 } from '$lib/icons/lucide';
	import type {
		WorkbenchData,
		WorkbenchDraftRow,
		WorkbenchVersionSummary
	} from '$lib/types/specialist-workbench';

	type Published = { version: WorkbenchVersionSummary; snapshot: unknown };
	type DraftSelection =
		| { kind: 'saved'; id: string }
		| { kind: 'starter'; id: (typeof SPECIALIST_STARTERS_V1)[number]['id'] };

	let { initial }: { initial: WorkbenchData } = $props();
	// The route keys this editor by its loaded data. Within that editing session,
	// server responses update these copies without replacing unsaved form input.
	const seed = untrack(() => initial);
	const first = seed.drafts[0];
	const initialDraft = first?.draft ?? createSpecialistWorkbenchDraftV1();
	const copyDraft = (value: SpecialistWorkbenchDraftV1): SpecialistWorkbenchDraftV1 =>
		JSON.parse(JSON.stringify(value));
	let drafts = $state.raw(seed.drafts);
	let versions = $state.raw(seed.versions);
	let draft = $state(copyDraft(initialDraft));
	let expertiseText = $state(initialDraft.expertise.join(', '));
	let selectedId = $state(first?.id ?? '');
	let revision = $state(first?.revision ?? 0);
	let savedJson = $state(first ? JSON.stringify(first.draft) : '');
	let previewResult = $state.raw<SpecialistWorkbenchPreviewV1 | null>(null);
	let previewJson = $state('');
	let inspected = $state.raw<Published | null>(null);
	let panel = $state<'preview' | 'versions'>('preview');
	let busy = $state<'save' | 'preview' | 'publish' | 'inspect' | 'upload' | null>(null);
	let error = $state('');
	let notice = $state('');
	let pendingSelection = $state<DraftSelection | null>(null);
	let showStarters = $state(!first);
	let untouchedTemplateJson = $state(first ? '' : JSON.stringify(initialDraft));
	let pendingDraftId = '';

	const payload = $derived({
		...draft,
		expertise: expertiseText
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean)
	});
	const draftJson = $derived(JSON.stringify(payload));
	const dirty = $derived(draftJson !== savedJson);
	const preview = $derived(previewJson === draftJson ? previewResult : null);
	const selectedVersions = $derived(versions.filter((item) => item.draftId === selectedId));
	const canPublish = $derived(!!selectedId && !dirty && !!preview?.canPublish && !busy);
	const passedChecks = $derived(preview?.checks.filter((item) => item.passed).length ?? 0);
	const fieldClass =
		'mt-2 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60';

	function clearNotice() {
		error = '';
		notice = '';
	}

	function loadDraft(selection: DraftSelection) {
		const row =
			selection.kind === 'saved' ? drafts.find((item) => item.id === selection.id) : null;
		draft = copyDraft(
			row?.draft ??
				(selection.kind === 'starter'
					? createSpecialistStarterDraftV1(selection.id)
					: createSpecialistWorkbenchDraftV1())
		);
		expertiseText = draft.expertise.join(', ');
		selectedId = row?.id ?? '';
		pendingDraftId = '';
		revision = row?.revision ?? 0;
		savedJson = row ? JSON.stringify(row.draft) : '';
		untouchedTemplateJson = row ? '' : JSON.stringify(draft);
		previewResult = null;
		previewJson = '';
		inspected = null;
		pendingSelection = null;
		showStarters = false;
		clearNotice();
	}

	function chooseDraft(selection: DraftSelection) {
		if (selection.kind === 'saved' && selection.id === selectedId) return;
		showStarters = false;
		const isUntouchedTemplate = !selectedId && draftJson === untouchedTemplateJson;
		if (dirty && !isUntouchedTemplate) pendingSelection = selection;
		else loadDraft(selection);
	}

	async function request<T>(body: unknown): Promise<T> {
		const response = await fetch('/api/agent/specialists/workbench', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json().catch(() => ({}));
		if (!response.ok) {
			const message =
				typeof result.error === 'string'
					? result.error
					: 'The request could not be completed. Please try again.';
			throw new Error(
				response.status === 409 && message.startsWith('This draft changed')
					? `${message} Your edits are still here. Copy any changes you want to keep before reloading.`
					: message
			);
		}
		return result as T;
	}

	function reportError(cause: unknown) {
		error = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
	}

	async function saveDraft() {
		if (busy) return;
		busy = 'save';
		clearNotice();
		try {
			const result = await request<{ draft: WorkbenchDraftRow }>({
				action: 'save',
				id: selectedId || (pendingDraftId ||= crypto.randomUUID()),
				expectedRevision: revision,
				draft: payload
			});
			const row = result.draft;
			drafts = [row, ...drafts.filter((item) => item.id !== row.id)];
			selectedId = row.id;
			revision = row.revision;
			draft = copyDraft(row.draft);
			expertiseText = draft.expertise.join(', ');
			savedJson = JSON.stringify(row.draft);
			notice = `Draft saved · revision ${row.revision}.`;
			if (pendingSelection !== null) loadDraft(pendingSelection);
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	async function previewDraft() {
		if (busy) return;
		busy = 'preview';
		panel = 'preview';
		clearNotice();
		const checkedJson = draftJson;
		try {
			const result = await request<{ preview: SpecialistWorkbenchPreviewV1 }>({
				action: 'preview',
				draft: payload
			});
			previewResult = result.preview;
			previewJson = checkedJson;
			notice = result.preview.canPublish
				? 'Input and capability checks passed. The resolved prompt is ready to inspect.'
				: 'Preview ready. Resolve the highlighted checks before publishing.';
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	async function publishDraft() {
		if (!canPublish) return;
		busy = 'publish';
		clearNotice();
		try {
			const result = await request<Published>({
				action: 'publish',
				id: selectedId,
				expectedRevision: revision
			});
			versions = [
				result.version,
				...versions.filter(
					(item) =>
						item.draftId !== result.version.draftId ||
						item.version !== result.version.version
				)
			];
			inspected = result;
			panel = 'versions';
			notice = `Version ${result.version.version} saved to your catalog. Live chat agents are unchanged.`;
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	async function inspectVersion(version: WorkbenchVersionSummary) {
		if (busy) return;
		busy = 'inspect';
		clearNotice();
		try {
			const params = new URLSearchParams({
				id: version.draftId,
				version: String(version.version)
			});
			const response = await fetch(`/api/agent/specialists/workbench?${params}`);
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.error || 'Could not load this version.');
			inspected = result as Published;
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	function downloadVersion() {
		if (!inspected) return;
		const contents = JSON.stringify(inspected, null, 2);
		const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${inspected.version.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-v${inspected.version.version}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	function addNote() {
		if (draft.knowledge.length >= 4 || busy) return;
		draft.knowledge.push({ id: crypto.randomUUID(), title: '', text: '' });
		clearNotice();
	}

	async function uploadNote(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || busy || draft.knowledge.length >= 4) return;
		clearNotice();
		if (!/\.(md|txt)$/i.test(file.name) || file.size > 65_536) {
			error = 'Choose a .md or .txt file under 64 KB.';
			return;
		}
		busy = 'upload';
		try {
			const text = await file.text();
			if ([...text].length > 16_000) {
				throw new Error(
					'This note is over 16,000 characters. Shorten the file before uploading it.'
				);
			}
			draft.knowledge.push({
				id: crypto.randomUUID(),
				title: file.name.replace(/\.(md|txt)$/i, '').slice(0, 120),
				text
			});
			notice = `${file.name} added in full. Preview will show the included text and any length limits.`;
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	function addExample() {
		if (draft.examples.length >= 6 || busy) return;
		draft.examples.push({ id: crypto.randomUUID(), question: '', requiresDocumentRead: false });
		clearNotice();
	}

	function formatDate(value: string) {
		return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(
			new Date(value)
		);
	}
</script>

<div class="space-y-5">
	<div
		class="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-ink sm:flex-row sm:items-end sm:justify-between"
	>
		<label
			class="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
		>
			Your specialists
			<select
				class={`${fieldClass} sm:max-w-md`}
				value={selectedId}
				disabled={!!busy}
				onchange={(event) => {
					chooseDraft({ kind: 'saved', id: event.currentTarget.value });
					event.currentTarget.value = selectedId;
				}}
			>
				{#if !selectedId}<option value="">New specialist · {draft.name}</option>{/if}
				{#each drafts as item (item.id)}
					<option value={item.id}>{item.draft.name} · draft {item.revision}</option>
				{/each}
			</select>
		</label>
		<Button
			variant="outline"
			size="sm"
			icon={Plus}
			disabled={!!busy}
			onclick={() => (showStarters = !showStarters)}>New specialist</Button
		>
	</div>

	{#if showStarters}
		<section
			class="rounded-xl border border-border bg-card p-4"
			aria-labelledby="starter-heading"
		>
			<h2 id="starter-heading" class="font-semibold text-foreground">
				Choose a starting point
			</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Start with a focused draft, then make its instructions, tools, and knowledge your
				own.
			</p>
			<div class="mt-4 grid gap-3 md:grid-cols-3">
				{#each SPECIALIST_STARTERS_V1 as starter (starter.id)}
					<button
						type="button"
						disabled={!!busy}
						onclick={() => chooseDraft({ kind: 'starter', id: starter.id })}
						class="rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
					>
						<span class="block text-sm font-semibold text-foreground"
							>{starter.name}</span
						>
						<span class="mt-2 block text-xs leading-relaxed text-muted-foreground"
							>{starter.description}</span
						>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	{#if pendingSelection !== null}
		<div
			class="flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 p-4"
			role="status"
		>
			<p class="min-w-52 flex-1 text-sm text-foreground">
				Save your current edits before switching?
			</p>
			<Button size="sm" disabled={!!busy} onclick={saveDraft}>Save and switch</Button>
			<Button
				size="sm"
				variant="outline"
				disabled={!!busy}
				onclick={() => {
					if (pendingSelection) loadDraft(pendingSelection);
				}}>Discard edits and switch</Button
			>
			<Button
				size="sm"
				variant="ghost"
				disabled={!!busy}
				onclick={() => (pendingSelection = null)}>Keep editing</Button
			>
		</div>
	{/if}

	{#if error}<p
			class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
			role="alert"
		>
			{error}
		</p>{/if}
	<p
		class={notice
			? 'rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground'
			: 'sr-only'}
		role="status"
		aria-live="polite"
	>
		{notice}
	</p>

	<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
		<form
			class="min-w-0 rounded-xl border border-border bg-card shadow-ink"
			onsubmit={(event) => {
				event.preventDefault();
				void saveDraft();
			}}
			oninput={clearNotice}
		>
			<div class="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
				<div>
					<h2 class="font-semibold text-foreground">Define the specialist</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Give it a clear focus, practical instructions, and reference material.
					</p>
				</div>
				<span
					class="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
					>{dirty ? 'Unsaved' : `Draft ${revision}`}</span
				>
			</div>
			<fieldset disabled={!!busy} class="min-w-0 space-y-6 p-5">
				<legend class="sr-only">Specialist definition</legend>
				<div class="space-y-4">
					<label class="block text-sm font-medium text-foreground"
						>Name<input
							class={fieldClass}
							bind:value={draft.name}
							maxlength="80"
							required
							placeholder="Document organizer"
						/></label
					>
					<label class="block text-sm font-medium text-foreground"
						>What is it good at?<textarea
							class={fieldClass}
							bind:value={draft.description}
							maxlength="320"
							rows="2"
							required
							placeholder="A short description for choosing this specialist."
						></textarea></label
					>
					<label class="block text-sm font-medium text-foreground"
						>Areas of expertise<input
							class={fieldClass}
							bind:value={expertiseText}
							placeholder="Document structure, overlap detection, knowledge organization"
							aria-describedby="expertise-help"
						/></label
					>
					<p id="expertise-help" class="!mt-1 text-xs text-muted-foreground">
						Up to 8 comma-separated areas, 60 characters each.
					</p>
					<label class="block text-sm font-medium text-foreground"
						>Instructions<textarea
							class={`${fieldClass} resize-y leading-relaxed`}
							bind:value={draft.instructions}
							maxlength="6000"
							rows="7"
							required
							placeholder="How should this specialist think, work, and present its findings?"
						></textarea></label
					>
					<label class="block text-sm font-medium text-foreground"
						>Default assignment<textarea
							class={`${fieldClass} resize-y leading-relaxed`}
							bind:value={draft.assignment}
							maxlength="2000"
							rows="3"
							required
							placeholder="The specific job this specialist starts with."
						></textarea></label
					>
				</div>

				<section class="border-t border-border pt-5" aria-labelledby="tools-heading">
					<h3 id="tools-heading" class="text-sm font-semibold text-foreground">Tools</h3>
					<label
						class="mt-3 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-3"
					>
						<input
							type="checkbox"
							bind:checked={draft.documentReadEnabled}
							class="mt-1 size-4 accent-[hsl(var(--accent))]"
						/>
						<span
							><span class="block text-sm font-medium text-foreground"
								>Read project documents</span
							><span class="mt-1 block text-xs leading-relaxed text-muted-foreground"
								>Allow one bounded read of up to four project documents when used in
								a supported workflow.</span
							></span
						>
					</label>
				</section>

				<section
					class="space-y-3 border-t border-border pt-5"
					aria-labelledby="knowledge-heading"
				>
					<div class="flex items-center justify-between gap-3">
						<h3
							id="knowledge-heading"
							class="flex items-center gap-2 text-sm font-semibold text-foreground"
						>
							<BookOpen class="size-4 text-muted-foreground" />Reference knowledge
						</h3>
						<span class="text-xs tabular-nums text-muted-foreground"
							>{draft.knowledge.length} / 4 notes</span
						>
					</div>
					<p class="text-xs leading-relaxed text-muted-foreground">
						Paste your methods, standards, or domain notes. Preview includes up to 6,000
						characters per note within a size limit and flags anything that needs
						shortening.
					</p>
					{#each draft.knowledge as note, index (note.id)}
						<div class="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
							<div class="flex items-center justify-between gap-3">
								<p class="text-xs font-medium text-muted-foreground">
									Reference {index + 1}
								</p>
								<Button
									variant="ghost"
									size="sm"
									icon={Trash2}
									aria-label={`Remove reference ${index + 1}`}
									onclick={() => {
										draft.knowledge = draft.knowledge.filter(
											(item) => item.id !== note.id
										);
										clearNotice();
									}}>Remove</Button
								>
							</div>
							<label class="block text-xs font-medium text-foreground"
								>Title<input
									class={fieldClass}
									bind:value={note.title}
									maxlength="120"
									required
									placeholder="Document organization principles"
								/></label
							>
							<label class="block text-xs font-medium text-foreground"
								>Note<textarea
									class={`${fieldClass} resize-y leading-relaxed`}
									bind:value={note.text}
									maxlength="16000"
									rows="5"
									required
									placeholder="Paste the expertise this specialist should carry with it."
								></textarea></label
							>
							<p class="text-right text-xs tabular-nums text-muted-foreground">
								{[...note.text].length.toLocaleString()} characters
							</p>
						</div>
					{/each}
					<div class="flex flex-wrap items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							icon={Plus}
							disabled={draft.knowledge.length >= 4}
							onclick={addNote}>Add note</Button
						>
						<label
							class={[
								'relative inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground focus-within:ring-2 focus-within:ring-ring',
								draft.knowledge.length >= 4
									? 'cursor-not-allowed opacity-50'
									: 'cursor-pointer hover:bg-muted'
							]}
							><FileText class="size-4" />Upload .md or .txt<input
								class="absolute inset-0 w-full cursor-pointer opacity-0"
								type="file"
								accept=".md,.txt,text/plain,text/markdown"
								disabled={draft.knowledge.length >= 4}
								onchange={uploadNote}
								aria-label="Upload a reference note from a Markdown or text file"
							/></label
						>
					</div>
				</section>

				<section
					class="space-y-3 border-t border-border pt-5"
					aria-labelledby="examples-heading"
				>
					<div class="flex items-center justify-between gap-3">
						<h3 id="examples-heading" class="text-sm font-semibold text-foreground">
							Example requests
						</h3>
						<span class="text-xs tabular-nums text-muted-foreground"
							>{draft.examples.length} / 6</span
						>
					</div>
					<p class="text-xs leading-relaxed text-muted-foreground">
						Describe requests this specialist should handle. The free check verifies
						their inputs and required capabilities; it does not generate model
						responses.
					</p>
					{#each draft.examples as example, index (example.id)}
						<div class="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
							<div class="flex items-center justify-between gap-3">
								<label
									for={`example-${example.id}`}
									class="text-xs font-medium text-muted-foreground"
									>Example {index + 1}</label
								><Button
									variant="ghost"
									size="sm"
									icon={Trash2}
									aria-label={`Remove example ${index + 1}`}
									onclick={() => {
										draft.examples = draft.examples.filter(
											(item) => item.id !== example.id
										);
										clearNotice();
									}}>Remove</Button
								>
							</div>
							<textarea
								id={`example-${example.id}`}
								class={`${fieldClass} !mt-0 resize-y`}
								bind:value={example.question}
								maxlength="2000"
								rows="2"
								required
								placeholder="Which documents overlap, and how should we organize them?"
							></textarea>
							<label
								class="flex cursor-pointer items-center gap-2 text-xs text-foreground"
								><input
									type="checkbox"
									bind:checked={example.requiresDocumentRead}
									class="size-4 accent-[hsl(var(--accent))]"
								/>Needs full document text</label
							>
						</div>
					{/each}
					<Button
						variant="outline"
						size="sm"
						icon={Plus}
						disabled={draft.examples.length >= 6}
						onclick={addExample}>Add example</Button
					>
				</section>
			</fieldset>
			<div
				class="flex flex-wrap items-center gap-2 border-t border-border bg-muted/20 px-5 py-4"
			>
				<Button
					type="submit"
					variant="outline"
					size="sm"
					icon={Save}
					loading={busy === 'save'}
					disabled={!!busy || !dirty}>Save draft</Button
				>
				<Button
					size="sm"
					icon={Check}
					loading={busy === 'preview'}
					disabled={!!busy}
					onclick={previewDraft}>Preview & check</Button
				>
				<span class="text-xs text-muted-foreground">Free · no model calls</span>
			</div>
		</form>

		<aside
			class="min-w-0 space-y-4 xl:sticky xl:top-5"
			aria-label="Specialist preview and versions"
		>
			<div class="overflow-hidden rounded-xl border border-border bg-card shadow-ink">
				<div class="flex gap-1 border-b border-border p-2" aria-label="Preview panels">
					<button
						type="button"
						aria-pressed={panel === 'preview'}
						onclick={() => (panel = 'preview')}
						class={[
							'min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							panel === 'preview'
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:bg-muted/50'
						]}>Resolved preview</button
					>
					<button
						type="button"
						aria-pressed={panel === 'versions'}
						onclick={() => (panel = 'versions')}
						class={[
							'min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							panel === 'versions'
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:bg-muted/50'
						]}
						>Versions <span class="ml-1 text-xs tabular-nums"
							>{selectedVersions.length}</span
						></button
					>
				</div>
				<div class="p-5">
					{#if panel === 'preview'}
						{#if preview}
							<div class="space-y-5">
								<div>
									<p
										class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
									>
										Input & capability checks
									</p>
									<h2 class="mt-2 text-lg font-semibold text-foreground">
										{preview.canPublish
											? 'Ready to publish'
											: 'Needs attention'}
									</h2>
									<p class="mt-1 text-sm text-muted-foreground">
										{passedChecks} of {preview.checks.length} checks passed. These
										checks do not measure answer quality.
									</p>
								</div>
								<ul class="space-y-2">
									{#each preview.checks as check (check.id)}<li
											class="rounded-lg border border-border p-3"
										>
											<div class="flex items-start gap-2">
												<span
													class={[
														'mt-0.5 text-xs font-bold',
														check.passed
															? 'text-foreground'
															: 'text-destructive'
													]}>{check.passed ? 'PASS' : 'FIX'}</span
												>
												<div class="min-w-0">
													<p
														class="break-words text-sm font-medium text-foreground"
													>
														{check.question}
													</p>
													<p
														class="mt-1 text-xs leading-relaxed text-muted-foreground"
													>
														{check.detail}
													</p>
												</div>
											</div>
										</li>{/each}
								</ul>
								<div class="border-t border-border pt-4">
									<h3 class="text-sm font-semibold text-foreground">
										Available tools
									</h3>
									<p
										class="mt-2 break-words font-mono text-xs text-muted-foreground"
									>
										{preview.tools.length
											? preview.tools.join(', ')
											: 'No document tools enabled'}
									</p>
								</div>
								<details class="rounded-lg border border-border">
									<summary
										class="cursor-pointer px-3 py-3 text-sm font-medium text-foreground"
										>Resolved system prompt</summary
									>
									<pre
										class="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground">{preview.systemPrompt}</pre>
								</details>
								<div class="space-y-2">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-foreground">
											Included knowledge
										</h3>
										<span class="text-xs tabular-nums text-muted-foreground"
											>{(preview.totalKnowledgeBytes / 1024).toFixed(1)} KB</span
										>
									</div>
									{#each preview.knowledge as note (note.id)}<details
											class="rounded-lg border border-border"
										>
											<summary
												class="cursor-pointer p-3 text-sm text-foreground"
												><span class="font-medium">{note.title}</span><span
													class={[
														'mt-1 block text-xs',
														note.truncated
															? 'font-medium text-destructive'
															: 'text-muted-foreground'
													]}
													>{note.includedCharacters.toLocaleString()} of {note.originalCharacters.toLocaleString()}
													characters included{note.truncated
														? ' · Truncated — shorten this note to publish'
														: ' · Full note'}</span
												></summary
											>
											<div class="space-y-3 border-t border-border p-3">
												<pre
													class="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">{note.text}</pre>
												<p
													class="break-all font-mono text-xs text-muted-foreground"
												>
													Content hash: {note.contentHash}
												</p>
											</div>
										</details>{/each}
									{#if preview.knowledge.length === 0}<p
											class="text-xs text-muted-foreground"
										>
											No reference notes. This specialist uses its
											instructions and the workflow context.
										</p>{/if}
								</div>
								{#if preview.knowledgePrompt}<details
										class="rounded-lg border border-border"
									>
										<summary
											class="cursor-pointer px-3 py-3 text-sm font-medium text-foreground"
											>Resolved knowledge prompt</summary
										>
										<pre
											class="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground">{preview.knowledgePrompt}</pre>
									</details>{/if}
							</div>
						{:else}
							<div class="py-10 text-center">
								<div
									class="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-muted/50"
								>
									<FileText class="size-5 text-muted-foreground" />
								</div>
								<h2 class="mt-4 text-base font-semibold text-foreground">
									{previewResult
										? 'Your draft has changed'
										: 'See exactly what the specialist gets'}
								</h2>
								<p
									class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
								>
									{previewResult
										? 'Run Preview & check again to inspect the current instructions, knowledge, and capabilities.'
										: 'Preview the resolved prompt and reference notes, then check your example requests against the enabled tools.'}
								</p>
								<Button
									class="mt-5"
									variant="outline"
									size="sm"
									disabled={!!busy}
									loading={busy === 'preview'}
									onclick={previewDraft}>Preview & check</Button
								>
								<p class="mt-3 text-xs text-muted-foreground">
									No model responses or usage charges.
								</p>
							</div>
						{/if}
					{:else}
						<div class="space-y-4">
							<div>
								<h2 class="font-semibold text-foreground">Published versions</h2>
								<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
									Each version preserves its instructions, capabilities, and
									included knowledge. Later edits stay in your draft.
								</p>
							</div>
							{#if selectedVersions.length === 0}<p
									class="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"
								>
									No published versions yet. Save this draft and preview its
									inputs to publish the first one.
								</p>{/if}
							{#each selectedVersions as version (version.version)}<button
									type="button"
									disabled={!!busy}
									onclick={() => inspectVersion(version)}
									aria-pressed={inspected?.version.version === version.version}
									class={[
										'block w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
										inspected?.version.version === version.version
											? 'border-accent bg-accent/5'
											: 'border-border hover:bg-muted/50'
									]}
									><span class="flex items-center justify-between gap-3"
										><span class="text-sm font-semibold text-foreground"
											>Version {version.version}</span
										><span class="text-xs text-muted-foreground"
											>{formatDate(version.createdAt)}</span
										></span
									><span class="mt-1 block text-xs text-muted-foreground"
										>{version.name} · from draft {version.draftRevision}</span
									><span
										class="mt-2 block truncate font-mono text-xs text-muted-foreground"
										>{version.snapshotHash}</span
									></button
								>{/each}
							{#if inspected}<div class="space-y-3 border-t border-border pt-4">
									<div class="flex flex-wrap items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-foreground">
											Version {inspected.version.version} snapshot
										</h3>
										<Button
											variant="outline"
											size="sm"
											icon={Download}
											onclick={downloadVersion}>Download JSON</Button
										>
									</div>
									<pre
										class="max-h-[34rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground">{JSON.stringify(
											inspected.snapshot,
											null,
											2
										)}</pre>
								</div>{/if}
						</div>
					{/if}
				</div>
			</div>

			<div class="rounded-xl border border-border bg-card p-5 shadow-ink">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold text-foreground">
							Save a catalog version
						</h2>
						<p class="mt-1 text-xs text-muted-foreground">
							Publishing does not change live chat agents.
						</p>
					</div>
					<Button
						size="sm"
						disabled={!canPublish}
						loading={busy === 'publish'}
						onclick={publishDraft}>Publish version</Button
					>
				</div>
				<p class="mt-3 text-xs leading-relaxed text-muted-foreground">
					{dirty
						? 'Save your current draft before publishing.'
						: !preview
							? 'Preview and check this revision before publishing.'
							: !preview.canPublish
								? 'Resolve the preview checks and shorten any truncated notes first.'
								: 'This revision is ready to preserve as an immutable version.'}
				</p>
			</div>
		</aside>
	</div>
</div>
