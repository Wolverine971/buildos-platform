<!-- apps/web/src/lib/components/ontology/DocumentModal.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import TagsDisplay from './TagsDisplay.svelte';
	import type { EntityKind, LinkedEntitiesResult } from './linked-entities/linked-entities.types';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import GoalEditModal from './GoalEditModal.svelte';
	import { DOCUMENT_STATES } from '$lib/types/onto';
	import { toastService } from '$lib/stores/toast.store';
	import { FileText, Loader, Save, Trash2, X } from 'lucide-svelte';

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
	let linkedEntities = $state<LinkedEntitiesResult | undefined>(undefined);
	let hasChanges = $state(false);

	let title = $state('');
	let typeKey = $state('');
	let stateKey = $state('draft');
	let description = $state('');
	let body = $state('');
	let createdAt = $state<string | null>(null);
	let updatedAt = $state<string | null>(null);
	let documentProps = $state<Record<string, unknown> | null>(null);

	const stateOptions = DOCUMENT_STATES.map((state) => ({
		value: state,
		label: state.replace('_', ' ')
	}));

	const isEditing = $derived(Boolean(documentId));
	const documentFormId = $derived(`document-modal-${documentId ?? 'new'}`);
	const titleFieldError = $derived(formError === 'Title is required' ? formError : '');
	const typeFieldError = $derived(formError === 'Type key is required' ? formError : '');
	const globalFormError = $derived.by(() => {
		if (!formError) return null;
		if (formError === 'Title is required' || formError === 'Type key is required') {
			return null;
		}
		return formError;
	});
	const hasTags = $derived.by(() => {
		const tags = documentProps?.tags;
		return Array.isArray(tags) && tags.length > 0;
	});

	let lastLoadedId = $state<string | null>(null);
	const datalistId = `document-type-${Math.random().toString(36).slice(2, 9)}`;

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);

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
		typeKey = typeOptions[0] ?? 'document.knowledge.research';
		stateKey = 'draft';
		description = '';
		body = '';
		formError = null;
		createdAt = null;
		updatedAt = null;
		documentProps = null;
		lastLoadedId = null;
	}

	function normalizeDocumentState(state?: string | null): string {
		if (!state) return 'draft';
		const normalized = state
			.trim()
			.toLowerCase()
			.replace(/[\s-]+/g, '_');
		if (!normalized) return 'draft';
		if (normalized === 'review') return 'in_review';
		if (normalized === 'inreview') return 'in_review';
		if (normalized === 'archive') return 'archived';
		if (!DOCUMENT_STATES.includes(normalized as (typeof DOCUMENT_STATES)[number])) {
			return 'draft';
		}
		return normalized;
	}

	async function loadDocument(id: string) {
		try {
			loading = true;
			formError = null;
			// Use /full endpoint for optimized single-request loading
			const response = await fetch(`/api/onto/documents/${id}/full`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load document');
			}

			const document = payload?.data?.document;
			linkedEntities = payload?.data?.linkedEntities;
			if (!document) {
				throw new Error('Document not found');
			}

			title = document.title ?? '';
			typeKey = document.type_key ?? '';
			stateKey = normalizeDocumentState(document.state_key ?? 'draft');
			description = document.description ?? document.props?.description ?? '';
			// Prefer content column, fall back to props.body_markdown for backwards compatibility
			body = (document.content as string) ?? (document.props?.body_markdown as string) ?? '';
			createdAt = document.created_at ?? null;
			updatedAt = document.updated_at ?? null;
			documentProps = document.props ?? null;
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
		if (isEditing && !typeKey.trim()) {
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

			const payload: Record<string, unknown> = {
				title: title.trim(),
				state_key: stateKey,
				description: description.trim() || null,
				// Use content column (API handles backwards compatibility with props.body_markdown)
				content: body
			};

			if (isEditing && typeKey.trim()) {
				payload.type_key = typeKey.trim();
			}

			if (!isEditing) {
				payload.classification_source = 'create_modal';
			}

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

	function getStateVariant(state: string): 'success' | 'warning' | 'info' | 'error' {
		const normalized = state?.toLowerCase();
		if (normalized === 'published') {
			return 'success';
		}
		if (normalized === 'ready') {
			return 'info';
		}
		if (normalized === 'review' || normalized === 'in_review') {
			return 'warning';
		}
		if (normalized === 'archived') {
			return 'error';
		}
		return 'info';
	}

	// Linked entity click handler
	function handleLinkedEntityClick(kind: EntityKind, id: string) {
		switch (kind) {
			case 'task':
				selectedTaskIdForModal = id;
				showTaskModal = true;
				break;
			case 'plan':
				selectedPlanIdForModal = id;
				showPlanModal = true;
				break;
			case 'goal':
				selectedGoalIdForModal = id;
				showGoalModal = true;
				break;
			default:
				console.warn(`Unhandled entity kind: ${kind}`);
		}
	}

	function closeLinkedEntityModals() {
		showTaskModal = false;
		showPlanModal = false;
		showGoalModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedGoalIdForModal = null;
		// Smart refresh: only reload if links were changed
		if (hasChanges && documentId) {
			loadDocument(documentId);
			hasChanges = false;
		}
	}

	function handleLinksChanged() {
		hasChanges = true;
	}
</script>

<Modal
	bind:isOpen
	onClose={closeModal}
	size="xl"
	closeOnBackdrop={false}
	closeOnEscape={!saving}
	showCloseButton={false}
	customClasses="lg:!max-w-5xl xl:!max-w-6xl"
>
	{#snippet header()}
		<!-- Ultra-compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-3 sm:py-2 flex items-center justify-between gap-2"
		>
			<div class="flex items-center gap-2 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0"
				>
					<FileText class="w-5 h-5" />
				</div>
				<span class="text-xs sm:text-sm font-semibold text-foreground truncate">
					{isEditing ? 'Edit Document' : 'New Document'}
				</span>
				{#if isEditing}
					<Badge
						variant={getStateVariant(stateKey)}
						size="sm"
						class="capitalize hidden sm:inline-flex"
					>
						{stateKey.replace('_', ' ')}
					</Badge>
				{/if}
			</div>
			<div class="flex items-center gap-1.5">
				{#if updatedAt}
					<span class="text-[10px] text-muted-foreground hidden md:inline">
						Updated {new Date(updatedAt).toLocaleDateString(undefined, {
							month: 'short',
							day: 'numeric'
						})}
					</span>
				{/if}
				<!-- Close button -->
				<button
					type="button"
					onclick={closeModal}
					disabled={saving}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:bg-card hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="overflow-y-auto flex-1" style="max-height: calc(100vh - 120px);">
			{#if loading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-6 h-6 animate-spin text-muted-foreground" />
				</div>
			{:else}
				<form id={documentFormId} class="h-full" onsubmit={handleSave}>
					<!-- Desktop: Two-column layout | Mobile: Stacked -->
					<div class="flex flex-col lg:flex-row h-full">
						<!-- Left sidebar (metadata) - Desktop: Fixed width | Mobile: Collapsible top section -->
						<div
							class="lg:w-72 xl:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-muted/20"
						>
							<div class="p-3 space-y-3">
								<!-- Title field -->
								<FormField
									label="Title"
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
										class="text-sm"
										disabled={saving}
									/>
								</FormField>

								<!-- Description -->
								<FormField
									label="Description"
									labelFor="document-description"
									uppercase={false}
								>
									<Textarea
										id="document-description"
										bind:value={description}
										placeholder="Short summary"
										rows={2}
										disabled={saving}
										size="sm"
									/>
								</FormField>

								<!-- State & Type - Compact inline on mobile -->
								<div class="grid grid-cols-2 gap-2">
									<FormField
										label="State"
										labelFor="document-state"
										uppercase={false}
									>
										<Select
											id="document-state"
											bind:value={stateKey}
											size="sm"
											class="w-full text-xs"
										>
											{#each stateOptions as option}
												<option value={option.value}>{option.label}</option>
											{/each}
										</Select>
									</FormField>
									{#if isEditing}
										<FormField
											label="Type"
											labelFor="document-type-input"
											uppercase={false}
											error={typeFieldError}
										>
											<input
												id="document-type-input"
												list={datalistId}
												class="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-all"
												bind:value={typeKey}
												placeholder="document.type"
											/>
											<datalist id={datalistId}>
												{#each docTypeOptions as option}
													<option value={option}></option>
												{/each}
											</datalist>
										</FormField>
									{/if}
								</div>

								<!-- Type suggestions - compact -->
								{#if isEditing}
									<div class="flex flex-wrap gap-1 text-[10px] font-mono">
										<button
											type="button"
											class="px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
											onclick={() => (typeKey = 'document.context.project')}
										>
											.context
										</button>
										<button
											type="button"
											class="px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
											onclick={() => (typeKey = 'document.spec.product')}
										>
											.spec
										</button>
										<button
											type="button"
											class="px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
											onclick={() =>
												(typeKey = 'document.knowledge.research')}
										>
											.note
										</button>
									</div>
								{/if}

								<!-- Linked Entities - Desktop sidebar | Mobile: after content -->
								{#if isEditing && documentId}
									<div class="hidden lg:block pt-2 border-t border-border">
										<LinkedEntities
											sourceId={documentId}
											sourceKind="document"
											{projectId}
											initialLinkedEntities={linkedEntities}
											onEntityClick={handleLinkedEntityClick}
											onLinksChanged={handleLinksChanged}
										/>
									</div>
								{/if}

								<!-- Tags Display -->
								{#if isEditing && hasTags}
									<div class="pt-2 border-t border-border">
										<TagsDisplay props={documentProps} />
									</div>
								{/if}

								<!-- Metadata - Compact display -->
								{#if isEditing}
									<div
										class="pt-2 border-t border-border space-y-1 text-[10px] text-muted-foreground"
									>
										<div class="flex items-center justify-between">
											<span>Created</span>
											<span class="font-mono"
												>{createdAt
													? new Date(createdAt).toLocaleDateString()
													: '—'}</span
											>
										</div>
										<div class="flex items-center justify-between">
											<span>Updated</span>
											<span class="font-mono"
												>{updatedAt
													? new Date(updatedAt).toLocaleDateString()
													: '—'}</span
											>
										</div>
										<div class="flex items-start justify-between gap-2">
											<span class="shrink-0">ID</span>
											<span class="font-mono truncate text-right"
												>{documentId}</span
											>
										</div>
									</div>
								{/if}
							</div>
						</div>

						<!-- Right main area (content) - The star of the show -->
						<div class="flex-1 flex flex-col min-w-0">
							<div class="p-3 flex-1 flex flex-col">
								<div class="flex items-center justify-between gap-2 mb-2">
									<h4
										class="text-xs font-semibold text-foreground uppercase tracking-wide"
									>
										Content
									</h4>
									<span class="text-[10px] text-muted-foreground hidden sm:inline"
										>Markdown supported</span
									>
								</div>
								<div class="flex-1 min-h-[300px] lg:min-h-[400px]">
									<RichMarkdownEditor
										bind:value={body}
										label="Document content"
										rows={18}
										maxLength={50000}
										helpText=""
									/>
								</div>
							</div>

							<!-- Mobile: Linked entities and tags at bottom -->
							{#if isEditing && documentId}
								<div
									class="lg:hidden p-3 border-t border-border bg-muted/20 space-y-3"
								>
									<LinkedEntities
										sourceId={documentId}
										sourceKind="document"
										{projectId}
										initialLinkedEntities={linkedEntities}
										onEntityClick={handleLinkedEntityClick}
										onLinksChanged={handleLinksChanged}
									/>
									{#if hasTags}
										<div class="pt-2 border-t border-border">
											<TagsDisplay props={documentProps} />
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					{#if globalFormError}
						<div
							class="mx-3 mb-3 flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg"
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
			class="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-muted/30 tx tx-grain tx-weak"
		>
			{#if documentId}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => (deleteModalOpen = true)}
					class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 py-1 tx tx-grain tx-weak"
				>
					<Trash2 class="w-3.5 h-3.5" />
					<span class="hidden sm:inline ml-1">Delete</span>
				</Button>
			{:else}
				<div></div>
			{/if}
			<div class="flex items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={closeModal}
					disabled={saving}
					class="text-xs px-3 py-1.5 tx tx-grain tx-weak"
				>
					Cancel
				</Button>
				<Button
					type="submit"
					form={documentFormId}
					variant="primary"
					size="sm"
					loading={saving}
					disabled={saving || !title.trim() || (isEditing && !typeKey.trim())}
					class="text-xs px-3 py-1.5 tx tx-grain tx-weak"
				>
					<Save class="w-3.5 h-3.5" />
					<span class="ml-1">{isEditing ? 'Save' : 'Create'}</span>
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
	onconfirm={handleDelete}
	oncancel={() => (deleteModalOpen = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			This action permanently removes the document and its history. Agents will lose access to
			this context.
		</p>
	{/snippet}
</ConfirmationModal>

<!-- Linked Entity Modals -->
{#if showTaskModal && selectedTaskIdForModal}
	<TaskEditModal
		taskId={selectedTaskIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if showPlanModal && selectedPlanIdForModal}
	<PlanEditModal
		planId={selectedPlanIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if showGoalModal && selectedGoalIdForModal}
	<GoalEditModal
		goalId={selectedGoalIdForModal}
		{projectId}
		onClose={closeLinkedEntityModals}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}
