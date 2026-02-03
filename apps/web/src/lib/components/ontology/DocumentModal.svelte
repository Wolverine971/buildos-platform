<!-- apps/web/src/lib/components/ontology/DocumentModal.svelte -->
<!--
	Document Modal - Markdown Document Editing

	Features:
	- Two-column layout: left sidebar (metadata + history) + main content
	- Left sidebar contains collapsible sections:
		- Settings (title, description, state) - always expanded
		- Tags display
		- Metadata (created, updated, ID)
		- Linked Entities - collapsible
		- Version History - collapsible
		- Voice Notes - collapsible
		- Activity Log - collapsible
	- RichMarkdownEditor for Markdown content
	- High information density layout
	- Svelte 5 runes and modern patterns
	- Inkprint design language with semantic textures

	Inkprint Patterns:
	- Header: strip texture (wt-paper) - separation band
	- Footer: grain texture (wt-paper) - action surface
	- Error states: static texture (wt-card) - blocker emphasis
	- Buttons: grain texture + pressable + appropriate weight
	- Metadata: micro-label pattern for compact, scannable info
	- Collapsible sections: pressable toggle buttons with chevron indicators

	Documentation: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
-->
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
	import EntityActivityLog from './EntityActivityLog.svelte';
	import EntityCommentsSection from './EntityCommentsSection.svelte';
	import DocumentVersionHistoryPanel from './DocumentVersionHistoryPanel.svelte';
	import DocumentVersionDiffDrawer from './DocumentVersionDiffDrawer.svelte';
	import DocumentVersionRestoreModal from './DocumentVersionRestoreModal.svelte';
	import DocumentVoiceNotesPanel from './DocumentVoiceNotesPanel.svelte';
	import DocMoveModal from './doc-tree/DocMoveModal.svelte';
	import type { VersionListItem } from './DocumentVersionHistoryPanel.svelte';
	import type { EntityKind, LinkedEntitiesResult } from './linked-entities/linked-entities.types';
	import type { DocStructure, OntoDocument, GetDocTreeResponse } from '$lib/types/onto-api';
	import { findNodeById, enrichTreeNodes } from '$lib/services/ontology/doc-structure.service';
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import GoalEditModal from './GoalEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import { DOCUMENT_STATES } from '$lib/types/onto';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import {
		FileText,
		Loader,
		Save,
		Trash2,
		X,
		ChevronDown,
		ChevronUp,
		ChevronRight,
		Settings2,
		FolderInput,
		FilePlus
	} from 'lucide-svelte';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type { Component } from 'svelte';

	// Lazy-loaded AgentChatModal for better initial load performance

	type LazyComponent = Component<any, any, any> | null;
	let AgentChatModalComponent = $state<LazyComponent>(null);

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default;
		}
		return AgentChatModalComponent;
	}

	interface Props {
		projectId: string;
		taskId?: string | null;
		documentId?: string | null;
		/** Parent document ID when creating a new child document */
		parentDocumentId?: string | null;
		isOpen?: boolean;
		typeOptions?: string[];
		onClose?: () => void;
		onSaved?: () => void;
		onDeleted?: () => void;
		/** Called when user wants to move this document */
		onMoveRequested?: () => void;
		/** Called when user wants to create a child document */
		onCreateChildRequested?: (parentId: string) => void;
	}

	let {
		projectId,
		taskId = null,
		documentId = null,
		parentDocumentId = null,
		isOpen = $bindable(false),
		typeOptions = [],
		onClose,
		onSaved,
		onDeleted,
		onMoveRequested,
		onCreateChildRequested
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

	// Internal document ID state - allows transitioning from create to edit mode after saving
	let internalDocumentId = $state<string | null>(null);

	// Sync internal state from prop when it changes
	$effect(() => {
		internalDocumentId = documentId;
	});

	// Active document ID - prefers internal state (for newly created docs)
	const activeDocumentId = $derived(internalDocumentId);

	const stateOptions = DOCUMENT_STATES.map((state) => ({
		value: state,
		label: state.replace('_', ' ')
	}));

	const isEditing = $derived(Boolean(activeDocumentId));
	const documentFormId = $derived(`document-modal-${documentId ?? 'new'}`);
	const titleFieldError = $derived(formError === 'Title is required' ? formError : '');
	const globalFormError = $derived.by(() => {
		if (!formError) return null;
		if (formError === 'Title is required') {
			return null;
		}
		return formError;
	});
	const hasTags = $derived.by(() => {
		const tags = documentProps?.tags;
		return Array.isArray(tags) && tags.length > 0;
	});

	// Count linked entities for mobile toggle badge
	const linkedCount = $derived.by(() => {
		if (!linkedEntities) return 0;
		return (
			(linkedEntities.tasks?.length ?? 0) +
			(linkedEntities.goals?.length ?? 0) +
			(linkedEntities.plans?.length ?? 0) +
			(linkedEntities.documents?.length ?? 0)
		);
	});

	const tagCount = $derived.by(() => {
		const tags = documentProps?.tags;
		return Array.isArray(tags) ? tags.length : 0;
	});

	let lastLoadedId = $state<string | null>(null);

	// Modal states for linked entity navigation
	let showTaskModal = $state(false);
	let selectedTaskIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let selectedDocumentIdForModal = $state<string | null>(null);
	let showChatModal = $state(false);
	let showMobileMetadata = $state(false);

	// Left panel collapsible sections
	let showLinkedEntities = $state(true);
	let showVersionHistory = $state(false);
	let showVoiceNotes = $state(false);
	let showActivityLog = $state(false);

	// Version history state
	let showDiffDrawer = $state(false);
	let selectedVersionForDiff = $state<VersionListItem | null>(null);
	let diffCompareMode = $state<'previous' | 'current'>('previous');
	let showRestoreModal = $state(false);
	let selectedVersionForRestore = $state<VersionListItem | null>(null);
	let latestVersionNumber = $state(0);
	let versionHistoryPanelRef = $state<{ refresh: () => void } | null>(null);
	let isAdminUser = $state(false);

	// Document tree state for breadcrumb and move functionality
	let docTreeStructure = $state<DocStructure | null>(null);
	let docTreeDocuments = $state<Record<string, OntoDocument>>({});
	let showMoveModal = $state(false);
	let treeLoading = $state(false);
	type VoiceNotesPanelRef = {
		refresh: () => void;
		upsertVoiceNote: (note: VoiceNote) => void;
	};
	let voiceNotesPanelRef = $state<VoiceNotesPanelRef | null>(null);
	let voiceNotesPanelMobileRef = $state<VoiceNotesPanelRef | null>(null);

	// Build focus for chat about this document
	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!activeDocumentId || !projectId) return null;
		return {
			focusType: 'document',
			focusEntityId: activeDocumentId,
			focusEntityName: title || 'Untitled Document',
			projectId: projectId,
			projectName: 'Project' // We don't have project name in this modal
		};
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
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${id}/full`,
				method: 'GET',
				projectId,
				entityType: 'document',
				entityId: id,
				operation: 'document_load'
			});
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
			const wasCreating = !activeDocumentId;

			if (activeDocumentId) {
				request = await fetch(`/api/onto/documents/${activeDocumentId}`, {
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
						// Include parent_id if creating as child of another document
						...(parentDocumentId ? { parent_id: parentDocumentId } : {}),
						...payload
					})
				});
			}

			const result = await request.json().catch(() => null);

			if (!request.ok) {
				throw new Error(result?.error || 'Failed to save document');
			}

			toastService.success(activeDocumentId ? 'Document updated' : 'Document created');
			onSaved?.();

			// If we just created a new document, transition to edit mode
			// by updating internal state and loading the full document
			// API returns { document, version } so ID is at result.data.document.id
			const newDocumentId = result?.data?.document?.id ?? result?.data?.id;
			if (wasCreating && newDocumentId) {
				internalDocumentId = newDocumentId;
				await loadDocument(newDocumentId);
			}
			// Modal stays open - no closeModal() call
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to save document';
			const endpoint = activeDocumentId
				? `/api/onto/documents/${activeDocumentId}`
				: taskId
					? `/api/onto/tasks/${taskId}/documents`
					: '/api/onto/documents/create';
			const method = activeDocumentId ? 'PATCH' : 'POST';
			void logOntologyClientError(error, {
				endpoint,
				method,
				projectId,
				entityType: 'document',
				entityId: activeDocumentId ?? undefined,
				operation: activeDocumentId ? 'document_update' : 'document_create',
				metadata: taskId ? { taskId } : undefined
			});
			formError = message;
			toastService.error(message);
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!activeDocumentId) return;
		try {
			deleting = true;
			const response = await fetch(`/api/onto/documents/${activeDocumentId}`, {
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
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${activeDocumentId}`,
				method: 'DELETE',
				projectId,
				entityType: 'document',
				entityId: activeDocumentId,
				operation: 'document_delete'
			});
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
			case 'document':
				selectedDocumentIdForModal = id;
				showDocumentModal = true;
				break;
			default:
				console.warn(`Unhandled entity kind: ${kind}`);
		}
	}

	function closeLinkedEntityModals() {
		showTaskModal = false;
		showPlanModal = false;
		showGoalModal = false;
		showDocumentModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedGoalIdForModal = null;
		selectedDocumentIdForModal = null;
		// Smart refresh: only reload if links were changed
		if (hasChanges && activeDocumentId) {
			loadDocument(activeDocumentId);
			hasChanges = false;
		}
	}

	function handleLinksChanged() {
		hasChanges = true;
	}

	// Chat about this document handlers
	async function openChatAbout() {
		if (!activeDocumentId || !projectId) return;
		await loadAgentChatModal();
		showChatModal = true;
	}

	function handleChatClose() {
		showChatModal = false;
	}

	// Version history handlers
	function handleDiffRequested(version: VersionListItem, compareMode: 'previous' | 'current') {
		selectedVersionForDiff = version;
		diffCompareMode = compareMode;
		showDiffDrawer = true;
	}

	function handleRestoreRequested(version: VersionListItem, latestVersion: number) {
		selectedVersionForRestore = version;
		latestVersionNumber = latestVersion;
		showRestoreModal = true;
	}

	function handleDiffDrawerClose() {
		showDiffDrawer = false;
		selectedVersionForDiff = null;
	}

	function handleRestoreModalClose() {
		showRestoreModal = false;
		selectedVersionForRestore = null;
	}

	async function handleVersionRestored() {
		showRestoreModal = false;
		selectedVersionForRestore = null;
		// Reload the document to show restored content
		if (activeDocumentId) {
			await loadDocument(activeDocumentId);
		}
		// Refresh version history panel
		versionHistoryPanelRef?.refresh();
		onSaved?.();
	}

	function handleVoiceNoteSegmentSaved(note: VoiceNote) {
		voiceNotesPanelRef?.upsertVoiceNote(note);
		voiceNotesPanelMobileRef?.upsertVoiceNote(note);
	}

	function handleVoiceNoteSegmentError(message: string) {
		if (message) {
			toastService.error(message);
		}
	}

	// Check admin access for restore permission
	// Since we don't have a dedicated access check endpoint, we'll be optimistic
	// and show the restore button. The API will enforce permissions anyway.
	// For a production implementation, add GET /api/onto/projects/{id}/access endpoint
	async function checkAdminAccess() {
		if (!projectId) {
			isAdminUser = false;
			return;
		}
		try {
			// Try to fetch project details - if user can access, they likely have write access
			// The restore endpoint enforces admin access server-side
			const response = await fetch(`/api/onto/projects/${projectId}`);
			if (response.ok) {
				// User has at least read access; show restore button (server will validate)
				// For proper implementation, the project API should return access level
				isAdminUser = true;
			} else {
				isAdminUser = false;
			}
		} catch {
			isAdminUser = false;
		}
	}

	// Check admin access when document loads
	$effect(() => {
		if (activeDocumentId && projectId) {
			checkAdminAccess();
		}
	});

	// Load document tree for breadcrumb and move functionality
	async function loadDocTree() {
		if (!projectId || treeLoading) return;
		try {
			treeLoading = true;
			const response = await fetch(
				`/api/onto/projects/${projectId}/doc-tree?include_content=false`
			);
			const payload = await response.json().catch(() => null);

			if (response.ok && payload?.data) {
				const treeData = payload.data as GetDocTreeResponse;
				docTreeStructure = treeData.structure;
				docTreeDocuments = treeData.documents;
			}
		} catch (error) {
			console.error('[DocumentModal] Failed to load doc tree:', error);
		} finally {
			treeLoading = false;
		}
	}

	// Load tree when editing an existing document
	$effect(() => {
		if (isOpen && activeDocumentId && projectId) {
			loadDocTree();
		}
	});

	// Compute breadcrumb path from document tree
	const breadcrumbPath = $derived.by(() => {
		if (!activeDocumentId || !docTreeStructure?.root) return [];

		const result = findNodeById(docTreeStructure.root, activeDocumentId);
		if (!result) return [];

		// Build path by traversing the enriched tree
		const enriched = enrichTreeNodes(docTreeStructure.root, docTreeDocuments, 0, []);
		const pathIds: string[] = [];

		function findPath(nodes: typeof enriched, targetId: string): boolean {
			for (const node of nodes) {
				if (node.id === targetId) {
					return true;
				}
				if (node.children) {
					if (findPath(node.children, targetId)) {
						pathIds.unshift(node.id);
						return true;
					}
				}
			}
			return false;
		}

		findPath(enriched, activeDocumentId);

		// Convert IDs to titles
		return pathIds.map((id) => ({
			id,
			title: docTreeDocuments[id]?.title || 'Untitled'
		}));
	});

	// Handle move modal
	function openMoveModal() {
		if (onMoveRequested) {
			onMoveRequested();
		} else {
			showMoveModal = true;
		}
	}

	async function handleMove(newParentId: string | null) {
		if (!activeDocumentId || !docTreeStructure) return;

		try {
			// Move document in tree structure
			const response = await fetch(`/api/onto/projects/${projectId}/doc-tree/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: activeDocumentId,
					new_parent_id: newParentId,
					new_position: 0
				})
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to move document');
			}

			toastService.success('Document moved');
			showMoveModal = false;
			// Reload tree to get updated structure
			await loadDocTree();
			onSaved?.();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to move document';
			toastService.error(message);
		}
	}

	// Handle create child
	function handleCreateChild() {
		if (!activeDocumentId) return;

		if (onCreateChildRequested) {
			onCreateChildRequested(activeDocumentId);
		}
	}
</script>

<Modal
	bind:isOpen
	onClose={closeModal}
	size="xl"
	closeOnBackdrop={false}
	closeOnEscape={!saving}
	showCloseButton={false}
	customClasses="lg:!max-w-6xl xl:!max-w-7xl"
>
	{#snippet header()}
		<!-- Compact Inkprint header with strip texture -->
		<div
			class="flex-shrink-0 bg-muted border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak wt-paper"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-accent/10 text-accent shrink-0"
				>
					<FileText class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<!-- Breadcrumb path for nested documents -->
					{#if breadcrumbPath.length > 0}
						<div
							class="flex items-center gap-1 text-xs text-muted-foreground mb-0.5 overflow-hidden"
						>
							{#each breadcrumbPath as crumb, i}
								<span class="truncate max-w-[100px]" title={crumb.title}
									>{crumb.title}</span
								>
								{#if i < breadcrumbPath.length - 1}
									<ChevronRight class="w-3 h-3 shrink-0" />
								{/if}
							{/each}
							<ChevronRight class="w-3 h-3 shrink-0" />
						</div>
					{/if}
					<div class="flex items-center gap-2">
						<h2 class="text-sm font-semibold leading-tight truncate text-foreground">
							{title || (isEditing ? 'Document' : 'New Document')}
						</h2>
						{#if isEditing}
							<Badge
								variant={getStateVariant(stateKey)}
								size="sm"
								class="capitalize hidden sm:inline-flex shrink-0"
							>
								{stateKey.replace('_', ' ')}
							</Badge>
						{/if}
					</div>
					<!-- Use micro-label pattern for metadata -->
					<p class="micro-label text-muted-foreground/70 mt-0.5">
						{#if createdAt}CREATED {new Date(createdAt).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}{#if updatedAt && updatedAt !== createdAt}
							· UPDATED {new Date(updatedAt).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- Chat about this document button -->
				{#if isEditing}
					<button
						type="button"
						onclick={openChatAbout}
						disabled={loading || saving}
						class="flex h-9 w-9 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak wt-paper"
						title="Chat about this document"
					>
						<img
							src="/brain-bolt.png"
							alt="Chat"
							class="w-4 h-4 rounded object-cover"
						/>
					</button>
				{/if}
				<!-- Close button -->
				<button
					type="button"
					onclick={closeModal}
					disabled={saving}
					class="flex h-9 w-9 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak wt-paper"
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
					<!-- Desktop: Two-column layout | Mobile: Content-first with collapsible metadata -->
					<div class="flex flex-col lg:flex-row h-full">
						<!-- Left sidebar (metadata + history + activity) - Desktop only, hidden on mobile -->
						<div
							class="hidden lg:flex lg:flex-col lg:w-80 xl:w-96 flex-shrink-0 lg:border-r border-border bg-muted overflow-y-auto"
						>
							<div class="p-3 space-y-2">
								<!-- Settings Section - Always expanded -->
								<div class="space-y-3">
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

									<!-- State -->
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
								</div>

								<!-- Tags Display -->
								{#if isEditing && hasTags}
									<div class="pt-2 border-t border-border">
										<TagsDisplay props={documentProps} />
									</div>
								{/if}

								<!-- Metadata with micro-labels -->
								{#if isEditing}
									<div class="pt-2 border-t border-border space-y-1">
										<div class="flex items-center justify-between gap-2">
											<span class="micro-label text-muted-foreground/70"
												>CREATED</span
											>
											<span class="text-xs font-mono text-foreground"
												>{createdAt
													? new Date(createdAt).toLocaleDateString()
													: '—'}</span
											>
										</div>
										<div class="flex items-center justify-between gap-2">
											<span class="micro-label text-muted-foreground/70"
												>UPDATED</span
											>
											<span class="text-xs font-mono text-foreground"
												>{updatedAt
													? new Date(updatedAt).toLocaleDateString()
													: '—'}</span
											>
										</div>
										<div class="flex items-start justify-between gap-2">
											<span
												class="micro-label text-muted-foreground/70 shrink-0"
												>ID</span
											>
											<span
												class="text-xs font-mono text-foreground truncate text-right"
												>{activeDocumentId}</span
											>
										</div>
									</div>
								{/if}

								<!-- Collapsible Sections for editing mode -->
								{#if isEditing && activeDocumentId}
									<!-- Linked Entities Section -->
									<div class="pt-2 border-t border-border">
										<button
											type="button"
											onclick={() =>
												(showLinkedEntities = !showLinkedEntities)}
											class="w-full flex items-center justify-between py-1.5 text-left hover:bg-background/50 rounded transition-colors pressable"
										>
											<span class="flex items-center gap-2">
												<span class="micro-label text-foreground"
													>LINKED ENTITIES</span
												>
												{#if linkedCount > 0}
													<span
														class="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 text-[0.6rem] font-semibold bg-accent/20 text-accent rounded-full"
													>
														{linkedCount}
													</span>
												{/if}
											</span>
											{#if showLinkedEntities}
												<ChevronUp class="w-4 h-4 text-muted-foreground" />
											{:else}
												<ChevronDown
													class="w-4 h-4 text-muted-foreground"
												/>
											{/if}
										</button>
										{#if showLinkedEntities}
											<div class="pt-2">
												<LinkedEntities
													sourceId={activeDocumentId}
													sourceKind="document"
													{projectId}
													initialLinkedEntities={linkedEntities}
													onEntityClick={handleLinkedEntityClick}
													onLinksChanged={handleLinksChanged}
												/>
											</div>
										{/if}
									</div>

									<!-- Version History Section -->
									<div class="pt-2 border-t border-border">
										<button
											type="button"
											onclick={() =>
												(showVersionHistory = !showVersionHistory)}
											class="w-full flex items-center justify-between py-1.5 text-left hover:bg-background/50 rounded transition-colors pressable"
										>
											<span class="micro-label text-foreground"
												>VERSION HISTORY</span
											>
											{#if showVersionHistory}
												<ChevronUp class="w-4 h-4 text-muted-foreground" />
											{:else}
												<ChevronDown
													class="w-4 h-4 text-muted-foreground"
												/>
											{/if}
										</button>
										{#if showVersionHistory}
											<div class="pt-2">
												<DocumentVersionHistoryPanel
													bind:this={versionHistoryPanelRef}
													documentId={activeDocumentId}
													{projectId}
													isAdmin={isAdminUser}
													onDiffRequested={handleDiffRequested}
													onRestoreRequested={handleRestoreRequested}
												/>
											</div>
										{/if}
									</div>

									<!-- Voice Notes Section -->
									<div class="pt-2 border-t border-border">
										<button
											type="button"
											onclick={() => (showVoiceNotes = !showVoiceNotes)}
											class="w-full flex items-center justify-between py-1.5 text-left hover:bg-background/50 rounded transition-colors pressable"
										>
											<span class="micro-label text-foreground"
												>VOICE NOTES</span
											>
											{#if showVoiceNotes}
												<ChevronUp class="w-4 h-4 text-muted-foreground" />
											{:else}
												<ChevronDown
													class="w-4 h-4 text-muted-foreground"
												/>
											{/if}
										</button>
										{#if showVoiceNotes}
											<div class="pt-2">
												<DocumentVoiceNotesPanel
													bind:this={voiceNotesPanelRef}
													documentId={activeDocumentId}
													{projectId}
													limit={20}
												/>
											</div>
										{/if}
									</div>

									<!-- Activity Log Section -->
									<div class="pt-2 border-t border-border">
										<button
											type="button"
											onclick={() => (showActivityLog = !showActivityLog)}
											class="w-full flex items-center justify-between py-1.5 text-left hover:bg-background/50 rounded transition-colors pressable"
										>
											<span class="micro-label text-foreground"
												>ACTIVITY LOG</span
											>
											{#if showActivityLog}
												<ChevronUp class="w-4 h-4 text-muted-foreground" />
											{:else}
												<ChevronDown
													class="w-4 h-4 text-muted-foreground"
												/>
											{/if}
										</button>
										{#if showActivityLog}
											<div class="pt-2">
												<EntityActivityLog
													entityType="document"
													entityId={activeDocumentId}
													autoLoad={!loading}
												/>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>

						<!-- Main content area -->
						<div class="flex-1 flex flex-col min-w-0">
							<!-- Mobile: Compact title input at top -->
							<div class="lg:hidden p-3 pb-0">
								<TextInput
									id="document-title-mobile"
									bind:value={title}
									required
									placeholder="Document title..."
									aria-label="Document title"
									class="text-base font-semibold border-none bg-transparent p-0 focus:ring-0"
									disabled={saving}
								/>
							</div>

							<!-- Content editor - the main focus -->
							<div class="p-3 flex-1 flex flex-col min-h-0">
								<div class="flex items-center justify-between gap-2 mb-2 shrink-0">
									<h4 class="micro-label text-foreground">CONTENT</h4>
									<span
										class="micro-label text-muted-foreground/70 hidden sm:inline"
										>MARKDOWN</span
									>
								</div>
								<div class="flex-1 min-h-0">
									<RichMarkdownEditor
										bind:value={body}
										maxLength={50000}
										helpText=""
										fillHeight={true}
										voiceNoteSource="document-modal"
										voiceNoteLinkedEntityType={activeDocumentId
											? 'document'
											: ''}
										voiceNoteLinkedEntityId={activeDocumentId ?? ''}
										onVoiceNoteSegmentSaved={handleVoiceNoteSegmentSaved}
										onVoiceNoteSegmentError={handleVoiceNoteSegmentError}
									/>
								</div>
							</div>

							<!-- Mobile: Collapsible metadata section at bottom -->
							<div
								class="lg:hidden border-t border-border bg-muted tx tx-strip tx-weak wt-paper"
							>
								<!-- Toggle button -->
								<button
									type="button"
									onclick={() => (showMobileMetadata = !showMobileMetadata)}
									class="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors pressable"
								>
									<span class="flex items-center gap-2">
										<Settings2 class="w-4 h-4 text-muted-foreground" />
										<span class="micro-label text-foreground">SETTINGS</span>
										{#if linkedCount > 0 || tagCount > 0}
											<span
												class="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 text-[0.6rem] font-semibold bg-background text-foreground rounded-full"
											>
												{linkedCount + tagCount}
											</span>
										{/if}
									</span>
									{#if showMobileMetadata}
										<ChevronUp class="w-4 h-4 text-muted-foreground" />
									{:else}
										<ChevronDown class="w-4 h-4 text-muted-foreground" />
									{/if}
								</button>

								<!-- Collapsible content -->
								{#if showMobileMetadata}
									<div class="p-3 pt-0 space-y-3 border-t border-border/50">
										<!-- Description -->
										<FormField
											label="Description"
											labelFor="document-description-mobile"
											uppercase={false}
										>
											<Textarea
												id="document-description-mobile"
												bind:value={description}
												placeholder="Short summary"
												rows={2}
												disabled={saving}
												size="sm"
											/>
										</FormField>

										<!-- State -->
										<FormField
											label="State"
											labelFor="document-state-mobile"
											uppercase={false}
										>
											<Select
												id="document-state-mobile"
												bind:value={stateKey}
												size="sm"
												class="w-full text-xs"
											>
												{#each stateOptions as option}
													<option value={option.value}
														>{option.label}</option
													>
												{/each}
											</Select>
										</FormField>

										<!-- Linked Entities -->
										{#if isEditing && activeDocumentId}
											<div class="pt-2 border-t border-border">
												<LinkedEntities
													sourceId={activeDocumentId}
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

										<!-- Version History -->
										{#if isEditing && activeDocumentId}
											<div class="pt-2 border-t border-border">
												<DocumentVersionHistoryPanel
													documentId={activeDocumentId}
													{projectId}
													isAdmin={isAdminUser}
													onDiffRequested={handleDiffRequested}
													onRestoreRequested={handleRestoreRequested}
												/>
											</div>
										{/if}

										<!-- Voice Recordings -->
										{#if isEditing && activeDocumentId}
											<div class="pt-2 border-t border-border">
												<DocumentVoiceNotesPanel
													bind:this={voiceNotesPanelMobileRef}
													documentId={activeDocumentId}
													{projectId}
													limit={10}
												/>
											</div>
										{/if}

										<!-- Activity Log -->
										{#if isEditing && activeDocumentId}
											<div class="pt-2 border-t border-border">
												<EntityActivityLog
													entityType="document"
													entityId={activeDocumentId}
													autoLoad={!loading}
												/>
											</div>
										{/if}

										<!-- Metadata with micro-labels -->
										{#if isEditing}
											<div class="pt-2 border-t border-border space-y-1">
												<div
													class="flex items-center justify-between gap-2"
												>
													<span
														class="micro-label text-muted-foreground/70"
														>CREATED</span
													>
													<span class="text-xs font-mono text-foreground"
														>{createdAt
															? new Date(
																	createdAt
																).toLocaleDateString()
															: '—'}</span
													>
												</div>
												<div
													class="flex items-center justify-between gap-2"
												>
													<span
														class="micro-label text-muted-foreground/70"
														>UPDATED</span
													>
													<span class="text-xs font-mono text-foreground"
														>{updatedAt
															? new Date(
																	updatedAt
																).toLocaleDateString()
															: '—'}</span
													>
												</div>
												<div class="flex items-start justify-between gap-2">
													<span
														class="micro-label text-muted-foreground/70 shrink-0"
														>ID</span
													>
													<span
														class="text-xs font-mono text-foreground truncate text-right"
														>{activeDocumentId}</span
													>
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>

					{#if globalFormError}
						<div
							class="mx-3 mb-3 flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak wt-card"
						>
							<span class="text-sm text-destructive">{globalFormError}</span>
						</div>
					{/if}
				</form>

				{#if activeDocumentId}
					<EntityCommentsSection
						{projectId}
						entityType="document"
						entityId={activeDocumentId}
					/>
				{/if}
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div
			class="flex items-center justify-between gap-2 px-2 py-2 sm:px-4 sm:py-3 border-t border-border bg-muted tx tx-grain tx-weak wt-paper"
		>
			<div class="flex items-center gap-1">
				{#if activeDocumentId}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={() => (deleteModalOpen = true)}
						class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-8 pressable"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span class="hidden sm:inline ml-1">Delete</span>
					</Button>
					<!-- Move to... button -->
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={openMoveModal}
						disabled={saving || treeLoading}
						class="text-xs px-2 h-8 pressable"
						title="Move to another location"
					>
						<FolderInput class="w-3.5 h-3.5" />
						<span class="hidden sm:inline ml-1">Move</span>
					</Button>
					<!-- Create Child button -->
					{#if onCreateChildRequested}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={handleCreateChild}
							disabled={saving}
							class="text-xs px-2 h-8 pressable"
							title="Create child document"
						>
							<FilePlus class="w-3.5 h-3.5" />
							<span class="hidden sm:inline ml-1">Add Child</span>
						</Button>
					{/if}
				{:else}
					<div></div>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={closeModal}
					disabled={saving}
					class="text-xs h-8 pressable"
				>
					Cancel
				</Button>
				<Button
					type="submit"
					form={documentFormId}
					variant="primary"
					size="sm"
					loading={saving}
					disabled={saving || !title.trim()}
					class="text-xs h-8 pressable tx tx-grain tx-weak wt-card"
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

{#if showDocumentModal && selectedDocumentIdForModal}
	<DocumentModal
		{projectId}
		documentId={selectedDocumentIdForModal}
		bind:isOpen={showDocumentModal}
		onClose={closeLinkedEntityModals}
		onSaved={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

<!-- Version Diff Drawer -->
{#if showDiffDrawer && selectedVersionForDiff && activeDocumentId}
	<DocumentVersionDiffDrawer
		bind:isOpen={showDiffDrawer}
		documentId={activeDocumentId}
		{projectId}
		versionNumber={selectedVersionForDiff.number}
		compareMode={diffCompareMode}
		currentDocument={{
			title,
			description,
			content: body,
			state_key: stateKey
		}}
		onClose={handleDiffDrawerClose}
	/>
{/if}

<!-- Version Restore Modal -->
{#if showRestoreModal && selectedVersionForRestore && activeDocumentId}
	<DocumentVersionRestoreModal
		bind:isOpen={showRestoreModal}
		documentId={activeDocumentId}
		{projectId}
		version={{
			number: selectedVersionForRestore.number,
			created_by_name: selectedVersionForRestore.created_by_name,
			created_at: selectedVersionForRestore.created_at,
			window: selectedVersionForRestore.window,
			snapshot_hash: selectedVersionForRestore.snapshot_hash
		}}
		{latestVersionNumber}
		onClose={handleRestoreModalClose}
		onRestored={handleVersionRestored}
	/>
{/if}

<!-- Chat About Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	{@const ChatModal = AgentChatModalComponent}
	<ChatModal isOpen={showChatModal} initialProjectFocus={entityFocus} onClose={handleChatClose} />
{/if}

<!-- Move Document Modal -->
{#if showMoveModal && activeDocumentId && docTreeStructure}
	<DocMoveModal
		bind:isOpen={showMoveModal}
		{projectId}
		documentId={activeDocumentId}
		documentTitle={title || 'Untitled'}
		structure={docTreeStructure}
		documents={docTreeDocuments}
		onClose={() => (showMoveModal = false)}
		onMove={handleMove}
	/>
{/if}
