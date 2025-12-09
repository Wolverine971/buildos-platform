<!-- apps/web/src/lib/components/ontology/DocumentModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { FileText, Loader, Save, Trash2 } from 'lucide-svelte';

	interface Props {
		projectId: string;
		taskId?: string | null;
		documentId?: string | null;
		isOpen?: boolean;
		typeOptions?: string[];
		onClose?: () => void;
		onSaved?: () => void;
		onDeleted?: () => void;
	}

	let {
		projectId,
		taskId = null,
		documentId = null,
		isOpen = $bindable(false),
		typeOptions = [],
		onClose,
		onSaved,
		onDeleted
	}: Props = $props();

	let loading = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let deleteModalOpen = $state(false);
	let formError = $state<string | null>(null);

	let title = $state('');
	let typeKey = $state('');
	let stateKey = $state('draft');
	let body = $state('');
	let createdAt = $state<string | null>(null);
	let updatedAt = $state<string | null>(null);

	const stateOptions = [
		{ value: 'draft', label: 'Draft' },
		{ value: 'review', label: 'In Review' },
		{ value: 'approved', label: 'Approved' },
		{ value: 'published', label: 'Published' },
		{ value: 'archived', label: 'Archived' }
	];

	const isEditing = $derived(Boolean(documentId));
	const documentFormId = $derived(`document-modal-${documentId ?? 'new'}`);
	const contextBadgeVariant = $derived(taskId ? 'info' : 'success');
	const contextBadgeLabel = $derived(taskId ? 'Task workspace' : 'Project document');
	const lastUpdatedLabel = $derived(formatDate(updatedAt ?? createdAt));
	const titleFieldError = $derived(formError === 'Title is required' ? formError : '');
	const typeFieldError = $derived(formError === 'Type key is required' ? formError : '');
	const globalFormError = $derived.by(() => {
		if (!formError) return null;
		if (formError === 'Title is required' || formError === 'Type key is required') {
			return null;
		}
		return formError;
	});

	let lastLoadedId = $state<string | null>(null);
	const datalistId = `document-type-${Math.random().toString(36).slice(2, 9)}`;

	const docTypeOptions = $derived.by(() => {
		const set = new Set<string>();
		for (const item of typeOptions) {
			if (item) {
				set.add(item);
			}
		}
		if (typeKey) {
			set.add(typeKey);
		}
		return Array.from(set);
	});

	function resetForm() {
		title = '';
		typeKey = typeOptions[0] ?? 'doc.project.note';
		stateKey = 'draft';
		body = '';
		formError = null;
		createdAt = null;
		updatedAt = null;
		lastLoadedId = null;
	}

	async function loadDocument(id: string) {
		try {
			loading = true;
			formError = null;
			const response = await fetch(`/api/onto/documents/${id}`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load document');
			}

			const document = payload?.data?.document;
			if (!document) {
				throw new Error('Document not found');
			}

			title = document.title ?? '';
			typeKey = document.type_key ?? '';
			stateKey = document.state_key ?? 'draft';
			body = (document.props?.body_markdown as string) ?? '';
			createdAt = document.created_at ?? null;
			updatedAt = document.updated_at ?? null;
			lastLoadedId = id;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load document';
			formError = message;
			toastService.error(message);
		} finally {
			loading = false;
		}
	}

	// Watch for modal opening and load/reset form accordingly
	$effect(() => {
		if (!browser) return;
		// Track dependencies explicitly
		const shouldLoad = isOpen;
		const currentDocId = documentId;
		const lastId = lastLoadedId;

		if (!shouldLoad) return;

		if (currentDocId) {
			if (currentDocId !== lastId) {
				loadDocument(currentDocId);
			}
		} else {
			resetForm();
		}
	});

	function closeModal() {
		isOpen = false;
		onClose?.();
	}

	function validateForm(): boolean {
		if (!title.trim()) {
			formError = 'Title is required';
			return false;
		}
		if (!typeKey.trim()) {
			formError = 'Type key is required';
			return false;
		}
		return true;
	}

	async function handleSave(event?: SubmitEvent) {
		event?.preventDefault();
		if (!validateForm()) return;

		try {
			saving = true;
			formError = null;

			const payload = {
				title: title.trim(),
				type_key: typeKey.trim(),
				state_key: stateKey,
				body_markdown: body,
				props: {
					body_markdown: body
				}
			};

			let request: Response;
			if (documentId) {
				request = await fetch(`/api/onto/documents/${documentId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
			} else if (taskId) {
				request = await fetch(`/api/onto/tasks/${taskId}/documents`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						...payload,
						role: 'deliverable'
					})
				});
			} else {
				request = await fetch('/api/onto/documents/create', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						project_id: projectId,
						...payload
					})
				});
			}

			const result = await request.json().catch(() => null);

			if (!request.ok) {
				throw new Error(result?.error || 'Failed to save document');
			}

			toastService.success(documentId ? 'Document updated' : 'Document created');
			onSaved?.();
			closeModal();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to save document';
			formError = message;
			toastService.error(message);
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!documentId) return;
		try {
			deleting = true;
			const response = await fetch(`/api/onto/documents/${documentId}`, {
				method: 'DELETE'
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to delete document');
			}

			toastService.success('Document deleted');
			deleteModalOpen = false;
			onDeleted?.();
			closeModal();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete document';
			toastService.error(message);
		} finally {
			deleting = false;
		}
	}

	function formatDate(value: string | null) {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString();
	}

	function getStateVariant(state: string): 'success' | 'warning' | 'info' | 'error' {
		const normalized = state?.toLowerCase();
		if (['approved', 'published'].includes(normalized)) {
			return 'success';
		}
		if (normalized === 'review') {
			return 'warning';
		}
		if (normalized === 'archived') {
			return 'error';
		}
		return 'info';
	}
</script>

<Modal
	bind:isOpen
	onClose={closeModal}
	size="xl"
	closeOnBackdrop={false}
	closeOnEscape={!saving}
	showCloseButton={false}
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div class="p-1.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
					<FileText class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || (documentId ? 'Document' : 'New Document')}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						{#if createdAt}Created {new Date(createdAt).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}{#if updatedAt && updatedAt !== createdAt}
							· Updated {new Date(updatedAt).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={closeModal}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={saving}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</Button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="overflow-y-auto" style="max-height: 70vh;">
			{#if loading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-6 h-6 animate-spin text-muted-foreground" />
				</div>
			{:else}
				<form id={documentFormId} class="space-y-6 px-4 sm:px-6 py-6" onsubmit={handleSave}>
					<section
						class="rounded border border-border bg-muted/30 p-4 sm:p-5 shadow-ink space-y-2 tx tx-grain tx-weak"
					>
						<div class="flex flex-wrap items-center gap-2">
							<Badge variant={getStateVariant(stateKey)} size="sm" class="capitalize">
								{stateKey.replace('_', ' ')}
							</Badge>
							<Badge variant={contextBadgeVariant} size="sm"
								>{contextBadgeLabel}</Badge
							>
							{#if typeKey}
								<span class="text-xs text-muted-foreground">Type • {typeKey}</span>
							{/if}
						</div>
						<div class="text-xs text-muted-foreground flex flex-wrap gap-4">
							{#if createdAt}
								<span>Created {formatDate(createdAt)}</span>
							{/if}
							{#if lastUpdatedLabel}
								<span>Last updated {lastUpdatedLabel}</span>
							{/if}
						</div>
					</section>

					{#if isEditing}
						<div
							class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-muted-foreground"
						>
							<div>
								<p class="font-semibold text-foreground">Document ID</p>
								<p class="font-mono text-xs text-muted-foreground break-all mt-1">
									{documentId}
								</p>
							</div>
							<div>
								<p class="font-semibold text-foreground">Created</p>
								<p class="mt-1 text-foreground">
									{formatDate(createdAt) ?? '—'}
								</p>
							</div>
							<div>
								<p class="font-semibold text-foreground">Updated</p>
								<p class="mt-1 text-foreground">
									{lastUpdatedLabel ?? '—'}
								</p>
							</div>
						</div>
					{/if}

					<div class="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
						<div class="md:col-span-2">
							<FormField
								label="Document title"
								labelFor="document-title"
								required={true}
								error={titleFieldError}
								uppercase={false}
							>
								<TextInput
									id="document-title"
									bind:value={title}
									required
									placeholder="Document title"
									aria-label="Document title"
									class="text-sm font-medium"
									disabled={saving}
								/>
							</FormField>
						</div>
						<div>
							<FormField label="State" labelFor="document-state" uppercase={false}>
								<div class="flex items-center gap-2">
									<Select
										id="document-state"
										bind:value={stateKey}
										size="sm"
										class="flex-1"
									>
										{#each stateOptions as option}
											<option value={option.value}>{option.label}</option>
										{/each}
									</Select>
									<Badge
										variant={getStateVariant(stateKey)}
										size="sm"
										class="capitalize shrink-0"
									>
										{stateKey.replace('_', ' ')}
									</Badge>
								</div>
							</FormField>
						</div>
					</div>

					<FormField
						label="Document type"
						labelFor="document-type-input"
						uppercase={false}
						error={typeFieldError}
						hint="Use dot notation so agents can understand the document role."
					>
						<input
							id="document-type-input"
							list={datalistId}
							class="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
							bind:value={typeKey}
							placeholder="doc.project.context"
						/>
						<datalist id={datalistId}>
							{#each docTypeOptions as option}
								<option value={option}></option>
							{/each}
						</datalist>
						<div class="flex flex-wrap gap-2 mt-2 text-[11px] font-mono">
							<span class="px-2 py-0.5 rounded bg-accent/10 text-accent">
								doc.project.context
							</span>
							<span class="px-2 py-0.5 rounded bg-accent/10 text-accent">
								doc.task.spec
							</span>
						</div>
					</FormField>

					<section class="pt-4 border-t border-border space-y-3">
						<div
							class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
						>
							<h4 class="text-sm font-semibold text-foreground">Content</h4>
							<p class="text-xs text-muted-foreground">
								Full GitHub-flavored markdown support. Use the toolbar for
								shortcuts.
							</p>
						</div>
						<RichMarkdownEditor
							bind:value={body}
							label="Document content"
							rows={14}
							maxLength={12000}
							helpText="Supports AI summarization, tables, and embeds."
						/>
					</section>

					{#if globalFormError}
						<div
							class="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg"
						>
							<span class="text-sm text-destructive">{globalFormError}</span>
						</div>
					{/if}
				</form>
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-4 p-2 sm:p-4 border-t border-border bg-muted/30 tx tx-grain tx-weak"
		>
			{#if documentId}
				<!-- Danger zone inline on mobile -->
				<div class="flex items-center gap-1.5 sm:gap-2">
					<Trash2 class="w-3 h-3 sm:w-4 sm:h-4 text-red-500 shrink-0" />
					<Button
						type="button"
						variant="danger"
						size="sm"
						onclick={() => (deleteModalOpen = true)}
						class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5"
					>
						Delete
					</Button>
				</div>
			{:else}
				<div></div>
			{/if}
			<div class="flex flex-row items-center gap-2">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onclick={closeModal}
					disabled={saving}
					class="text-xs sm:text-sm px-2 sm:px-4"
				>
					Cancel
				</Button>
				<Button
					type="submit"
					form={documentFormId}
					variant="primary"
					size="sm"
					loading={saving}
					disabled={saving || !title.trim() || !typeKey.trim()}
					class="text-xs sm:text-sm px-2 sm:px-4"
				>
					<Save class="w-3 h-3 sm:w-4 sm:h-4" />
					<span class="hidden sm:inline">{documentId ? 'Save Changes' : 'Create'}</span>
					<span class="sm:hidden">Save</span>
				</Button>
			</div>
		</div>
	{/snippet}
</Modal>

<ConfirmationModal
	isOpen={deleteModalOpen}
	title="Delete document"
	confirmText="Delete document"
	confirmVariant="danger"
	loading={deleting}
	loadingText="Deleting..."
	icon="danger"
	on:confirm={handleDelete}
	on:cancel={() => (deleteModalOpen = false)}
	><p class="text-sm text-gray-600 dark:text-gray-300">
		This action permanently removes the document and its history. Agents will lose access to
		this context.
	</p></ConfirmationModal
>
