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
	import { onDestroy } from 'svelte';
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
	import ImageAssetsPanel from './ImageAssetsPanel.svelte';
	import EntityCollaborationAction from './EntityCollaborationAction.svelte';
	import DocumentVersionHistoryPanel from './DocumentVersionHistoryPanel.svelte';
	import DocumentVersionRestoreModal from './DocumentVersionRestoreModal.svelte';
	import DocumentComparisonView from './DocumentComparisonView.svelte';
	import DocumentVoiceNotesPanel from './DocumentVoiceNotesPanel.svelte';
	import DocMoveModal from './doc-tree/DocMoveModal.svelte';
	import DocDeleteConfirmModal from './doc-tree/DocDeleteConfirmModal.svelte';
	import type { VersionListItem } from './DocumentVersionHistoryPanel.svelte';
	import type { EntityKind, LinkedEntitiesResult } from './linked-entities/linked-entities.types';
	import type { DocStructure, OntoDocument, GetDocTreeResponse } from '$lib/types/onto-api';
	import { findNodeById, enrichTreeNodes } from '$lib/services/ontology/doc-structure.service';
	import { DOCUMENT_STATES } from '$lib/types/onto';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { formatDateForDisplay, formatDateTimeForDisplay } from '$lib/utils/date-utils';
	import { getProseClasses, renderMarkdown } from '$lib/utils/markdown';
	import {
		exportDocumentAsDocx,
		exportDocumentAsHtml,
		exportDocumentAsPdf,
		type DocumentExportFormat,
		type DocumentExportPayload
	} from '$lib/utils/document-export';
	import { buildAbsolutePublicPageUrl, copyTextToClipboard } from '$lib/utils/public-page-url';
	import {
		Archive,
		FileText,
		Loader,
		Save,
		RotateCcw,
		Trash2,
		X,
		Image as ImageIcon,
		ChevronDown,
		ChevronUp,
		ChevronRight,
		Settings2,
		FolderInput,
		FilePlus,
		Check,
		AlertTriangle,
		LoaderCircle,
		MessageSquare,
		Download,
		Globe,
		ExternalLink,
		Link,
		Clock,
		MoreHorizontal
	} from 'lucide-svelte';
	import { handleRovingTabKeydown } from '$lib/components/project/v2/board-a11y';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import {
		loadDocumentModal,
		loadGoalEditModal,
		loadPlanEditModal,
		loadTaskEditModal
	} from '$lib/components/project/project-entity-modal-loader';
	// Lazy-loaded AgentChatModal for better initial load performance

	type LazyComponent =
		| typeof import('$lib/components/agent/AgentChatModal.svelte').default
		| null;
	let AgentChatModalComponent = $state<LazyComponent>(null);
	type TaskEditModalLazy = typeof import('./TaskEditModal.svelte').default | null;
	type PlanEditModalLazy = typeof import('./PlanEditModal.svelte').default | null;
	type GoalEditModalLazy = typeof import('./GoalEditModal.svelte').default | null;
	type DocumentModalLazy = typeof import('./DocumentModal.svelte').default | null;
	let TaskEditModalComponent = $state<TaskEditModalLazy>(null);
	let PlanEditModalComponent = $state<PlanEditModalLazy>(null);
	let GoalEditModalComponent = $state<GoalEditModalLazy>(null);
	let DocumentModalComponent = $state<DocumentModalLazy>(null);

	async function loadAgentChatModal() {
		if (AgentChatModalComponent) return AgentChatModalComponent;
		const mod = await import('$lib/components/agent/AgentChatModal.svelte');
		return mod.default;
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
		onLoaded?: () => void;
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
		onLoaded,
		onMoveRequested,
		onCreateChildRequested
	}: Props = $props();

	let loading = $state(false);
	let saving = $state(false);
	let blockingSave = $state(false);
	let restoring = $state(false);
	let deleting = $state(false);
	let archiveModalOpen = $state(false);
	let permanentDeleteModalOpen = $state(false);
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

	// ============================================
	// Autosave State
	// ============================================
	type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
	let saveStatus = $state<SaveStatus>('idle');
	let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
	let savedFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
	const AUTOSAVE_DEBOUNCE_MS = 2000;
	const INLINE_ASSET_RENDER_REGEX =
		/\/api\/onto\/assets\/([0-9a-fA-F-]{36})\/render(?:\?[^\s)\]]*)?/g;

	type SaveSnapshot = {
		title: string;
		description: string;
		body: string;
		stateKey: string;
	};

	type PublicPageState = {
		id: string;
		slug: string;
		slug_prefix: string | null;
		slug_base: string;
		url_path: string;
		title: string;
		summary: string | null;
		public_status: 'not_public' | 'pending_confirmation' | 'live' | 'unpublished' | 'archived';
		visibility: 'public' | 'unlisted';
		noindex: boolean;
		live_sync_enabled: boolean;
		published_at: string | null;
		last_live_sync_at: string | null;
		last_live_sync_error: string | null;
		is_live_public: boolean;
		is_listed_public: boolean;
		view_count_all: number;
		view_count_30d: number;
	};

	type PublicPagePreview = {
		slug: string;
		slug_prefix: string | null;
		slug_base: string;
		slug_was_deduped: boolean;
		url_path: string;
		title: string;
		summary: string | null;
		content: string;
		visibility: 'public' | 'unlisted';
		noindex: boolean;
		live_sync_enabled: boolean;
	};

	type PublicPageDraft = {
		slug_prefix: string | null;
		slug_base: string;
		title: string;
		summary: string;
		visibility: 'public' | 'unlisted';
		noindex: boolean;
		live_sync_enabled: boolean;
	};

	type PublicPageReviewFinding = {
		code: string;
		category: string;
		severity: 'low' | 'medium' | 'high';
		source: 'text' | 'image';
		message: string;
		recommendation: string;
		excerpt: string | null;
		asset_id: string | null;
		asset_label: string | null;
	};

	type PublicPageReview = {
		id: string;
		source: 'publish_confirm' | 'live_sync' | 'manual_retry';
		status: 'passed' | 'flagged' | 'error';
		policy_version: string;
		summary: string | null;
		reasons: string[];
		text_findings: PublicPageReviewFinding[];
		image_findings: PublicPageReviewFinding[];
		created_at: string;
		admin_decision: 'approved' | 'rejected' | null;
		admin_decision_reason: string | null;
		admin_decision_by: string | null;
		admin_decision_at: string | null;
	};

	// Snapshot of last-saved values to detect actual changes
	let lastSavedSnapshot = $state<SaveSnapshot | null>(null);
	let autosaveQueued = $state(false);

	// Track the server's updated_at for conflict detection
	let serverUpdatedAt = $state<string | null>(null);
	let publicPageState = $state<PublicPageState | null>(null);
	let publicPageLoading = $state(false);
	let publicPageActionLoading = $state(false);
	let showPublicPageConfirmModal = $state(false);
	let publicPagePreview = $state<PublicPagePreview | null>(null);
	let publicPageDraft = $state<PublicPageDraft | null>(null);
	let latestPublicPageReview = $state<PublicPageReview | null>(null);
	let lastSavePublishedLive = $state(false);
	let discardChangesModalOpen = $state(false);
	let pendingDocumentPageNavigation = $state(false);
	let editorIsRecording = $state(false);
	let editorIsTranscribing = $state(false);

	/** Whether content has changed vs. last-saved snapshot */
	const hasUnsavedChanges = $derived.by(() => {
		if (!lastSavedSnapshot || !isEditing) return false;
		return (
			title !== lastSavedSnapshot.title ||
			description !== lastSavedSnapshot.description ||
			body !== lastSavedSnapshot.body ||
			stateKey !== lastSavedSnapshot.stateKey
		);
	});

	function captureSnapshot(snapshot?: SaveSnapshot) {
		const source = snapshot ?? { title, description, body, stateKey };
		lastSavedSnapshot = { ...source };
	}

	function clearAutosaveTimers() {
		if (autosaveTimer) {
			clearTimeout(autosaveTimer);
			autosaveTimer = null;
		}
		if (savedFeedbackTimer) {
			clearTimeout(savedFeedbackTimer);
			savedFeedbackTimer = null;
		}
		autosaveQueued = false;
	}

	function scheduleAutosave() {
		if (autosaveTimer) {
			clearTimeout(autosaveTimer);
		}
		autosaveTimer = setTimeout(() => {
			autosaveTimer = null;
			if (!hasUnsavedChanges || !isEditing || loading) return;
			if (saving) {
				autosaveQueued = true;
				return;
			}
			void handleAutosave();
		}, AUTOSAVE_DEBOUNCE_MS);
	}

	// Watch for content changes and schedule autosave
	$effect(() => {
		if (!browser) return;

		// Read reactive dependencies
		const _title = title;
		const _desc = description;
		const _body = body;
		const _state = stateKey;
		const _editing = isEditing;

		if (!_editing || !lastSavedSnapshot || loading) return;

		// Check if anything actually changed
		const changed =
			_title !== lastSavedSnapshot.title ||
			_desc !== lastSavedSnapshot.description ||
			_body !== lastSavedSnapshot.body ||
			_state !== lastSavedSnapshot.stateKey;

		if (changed) {
			saveStatus = 'dirty';
			scheduleAutosave();
		}
	});

	// Internal document ID state - allows transitioning from create to edit mode after saving
	let internalDocumentId = $state<string | null>(null);

	// Sync internal state from prop when it changes
	$effect(() => {
		internalDocumentId = documentId;
	});

	// Active document ID - prefers internal state (for newly created docs)
	const activeDocumentId = $derived(internalDocumentId);

	const isArchivedDocument = $derived(stateKey === 'archived');
	const stateOptions = $derived.by(() =>
		DOCUMENT_STATES.filter((state) => state !== 'archived' || isArchivedDocument).map(
			(state) => ({
				value: state,
				label: state.replace('_', ' ')
			})
		)
	);

	const isEditing = $derived(Boolean(activeDocumentId));
	const hasDraftContent = $derived.by(
		() => !isEditing && Boolean(title.trim() || description.trim() || body.trim())
	);
	const isCloseBlocked = $derived(
		blockingSave || saveStatus === 'saving' || editorIsRecording || editorIsTranscribing
	);
	const shouldPromptBeforeClose = $derived.by(
		() => !isCloseBlocked && (hasUnsavedChanges || hasDraftContent)
	);
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
	const isLiveDocument = $derived(publicPageState?.is_live_public === true);
	const publicPageUrlPath = $derived.by(() => {
		if (!publicPageState?.slug) return null;
		return publicPageState.url_path || `/p/${publicPageState.slug}`;
	});
	const documentPageUrlPath = $derived.by(() => {
		if (!projectId || !activeDocumentId) return null;
		return `/projects/${projectId}/documents/${activeDocumentId}`;
	});
	const publicPageLastLiveUpdateAt = $derived(
		publicPageState?.last_live_sync_at ?? publicPageState?.published_at ?? null
	);
	const publicPageLastLiveUpdateLabel = $derived.by(() =>
		publicPageLastLiveUpdateAt
			? formatDateTimeForDisplay(publicPageLastLiveUpdateAt) || 'Unknown'
			: null
	);
	const livePageHasUnpublishedChanges = $derived.by(() => {
		if (!isLiveDocument || !updatedAt || !publicPageLastLiveUpdateAt) return false;
		const documentUpdatedMs = new Date(updatedAt).getTime();
		const liveUpdatedMs = new Date(publicPageLastLiveUpdateAt).getTime();
		if (!Number.isFinite(documentUpdatedMs) || !Number.isFinite(liveUpdatedMs)) return false;
		return documentUpdatedMs - liveUpdatedMs > 1000;
	});
	const liveDocumentNeedsAttention = $derived(
		livePageHasUnpublishedChanges ||
			publicPageState?.live_sync_enabled === false ||
			Boolean(publicPageState?.last_live_sync_error)
	);
	const liveDocumentStatusLabel = $derived.by(() => {
		if (publicPageState?.last_live_sync_error) return 'LIVE UPDATE FAILED';
		if (livePageHasUnpublishedChanges) return 'LIVE CHANGES PENDING';
		if (publicPageState?.live_sync_enabled === false) return 'LIVE SYNC PAUSED';
		return 'LIVE DOCUMENT';
	});
	const liveDocumentStatusText = $derived.by(() => {
		if (publicPageState?.last_live_sync_error) {
			return 'The live page may be behind. Review and confirm changes to publish the latest saved version.';
		}
		if (livePageHasUnpublishedChanges) {
			return 'Saved document changes are not live yet. Review and confirm changes to update the public page.';
		}
		if (publicPageState?.live_sync_enabled === false) {
			return 'Saving changes will not update the public page until live sync is enabled or changes are confirmed.';
		}
		return 'This public page is up to date. Manual saves update it after content review.';
	});
	const publicPageDraftUrlPreview = $derived.by(() =>
		getPublicPageDraftUrlPreview(publicPageDraft, publicPagePreview)
	);
	const publicPageSlugBaseHelperText = $derived.by(() => {
		if (!publicPageDraft) return null;
		const normalized = normalizePublicPageSlugBaseInput(publicPageDraft.slug_base, 'page');
		const trimmed = publicPageDraft.slug_base.trim();
		if (!trimmed) {
			return 'Leaving this blank will use `page`.';
		}
		if (normalized !== trimmed.toLowerCase()) {
			return `Will publish as \`${normalized}\`.`;
		}
		return null;
	});
	const hasFlaggedPublicPageReview = $derived(latestPublicPageReview?.status === 'flagged');
	const latestPublicPageReviewReasons = $derived.by(() =>
		Array.isArray(latestPublicPageReview?.reasons)
			? latestPublicPageReview.reasons.slice(0, 3)
			: []
	);
	const latestPublicPageReviewGuidance = $derived.by(() => {
		if (!latestPublicPageReview || latestPublicPageReview.status !== 'flagged') return null;
		if (latestPublicPageReview.admin_decision === 'approved') {
			return 'Admin marked this content okay. Publish again to proceed.';
		}
		if (latestPublicPageReview.admin_decision === 'rejected') {
			return 'Admin marked this content not okay. Update the document and rerun review.';
		}
		return 'Publishing is blocked pending admin review. Ask an admin to mark this content okay.';
	});

	type DocumentLoadContext = {
		requestId: number;
		documentId: string;
		projectId: string;
	};
	type DocumentSession = {
		epoch: number;
		key: string;
		projectId: string;
		taskId: string | null;
		sourceDocumentId: string | null;
		parentDocumentId: string | null;
	};

	let lastLoadedId = $state<string | null>(null);
	let lastLoadedProjectId = $state<string | null>(null);
	let documentLoadController: AbortController | null = null;
	let documentLoadRequestId = 0;
	let documentLoadTargetKey: string | null = null;
	let documentSessionEpoch = 0;
	let documentSessionKey: string | null = null;
	let liveSyncMutationId = 0;

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
	let linkedEntityModalSession = $state.raw<DocumentSession | null>(null);
	let chatModalSession = $state.raw<DocumentSession | null>(null);
	let restoreModalSession = $state.raw<DocumentSession | null>(null);
	let moveModalSession = $state.raw<DocumentSession | null>(null);
	let imageInsertModalSession = $state.raw<DocumentSession | null>(null);
	type MobileTab = 'details' | 'links' | 'media' | 'history' | 'comments' | null;
	let activeMobileTab = $state<MobileTab>(null);
	let showImageInsertModal = $state(false);
	let exportingFormat = $state<DocumentExportFormat | null>(null);
	let showExportMenu = $state(false);
	let exportMenuRef = $state<HTMLDivElement | null>(null);
	let exportButtonRef = $state<HTMLButtonElement | null>(null);
	let exportMenuPos = $state({ top: 0, right: 0 });

	// Left panel collapsible sections
	let showPublicPage = $state(false);
	let showLinkedEntities = $state(true);
	let showImages = $state(false);
	let showVersionHistory = $state(false);
	let showVoiceNotes = $state(false);
	let showActivityLog = $state(false);

	// Comments section (collapsed by default)
	let showComments = $state(false);
	let commentsCount = $state(0);

	type MarkdownEditorRef = {
		insertAtCursor: (markdown: string) => Promise<void>;
		focus?: () => void;
	};
	let markdownEditorRef = $state<MarkdownEditorRef | null>(null);

	// Version history state
	let showRestoreModal = $state(false);
	let selectedVersionForRestore = $state<VersionListItem | null>(null);
	let latestVersionNumber = $state(0);
	let versionHistoryPanelRef = $state<{ refresh: () => void } | null>(null);
	let isAdminUser = $state(false);
	let lastAdminAccessProjectId = $state<string | null>(null);

	// Inline comparison mode state
	let comparisonMode = $state(false);
	let comparisonFromVersion = $state<number | null>(null);
	let comparisonToVersion = $state<number | 'current'>(1);
	let comparisonLatestVersion = $state(1);

	// Document tree state for breadcrumb and move functionality
	let docTreeStructure = $state<DocStructure | null>(null);
	let docTreeDocuments = $state<Record<string, OntoDocument>>({});
	let showMoveModal = $state(false);
	let treeLoading = $state(false);
	let lastDocTreeLoadKey = $state<string | null>(null);
	let lastDocumentViewKey = $state<string | null>(null);
	const activeDocTreeNode = $derived.by(() => {
		if (!activeDocumentId || !docTreeStructure?.root) return null;
		return findNodeById(docTreeStructure.root, activeDocumentId)?.node ?? null;
	});
	const archiveChildCount = $derived(activeDocTreeNode?.children?.length ?? 0);
	const archiveHasChildren = $derived(archiveChildCount > 0);
	type VoiceNotesPanelRef = {
		refresh: () => void;
		upsertVoiceNote: (note: VoiceNote) => void;
	};
	let voiceNotesPanelRef = $state<VoiceNotesPanelRef | null>(null);
	let voiceNotesPanelMobileRef = $state<VoiceNotesPanelRef | null>(null);
	let publicPageStateLoaded = $state(false);

	let cancelCommentsCountLoad = () => {};
	let cancelPublicPageLoad = () => {};
	let cancelDocTreeLoad = () => {};
	let deferredDocumentLoadController: AbortController | null = null;
	let docTreeLoadPromise: Promise<void> | null = null;
	let docTreeLoadPromiseKey: string | null = null;
	let docTreeLoadController: AbortController | null = null;

	function getDocumentSessionKey(): string {
		return [
			isOpen ? 'open' : 'closed',
			projectId,
			taskId ?? '',
			documentId ?? '__new__',
			parentDocumentId ?? ''
		].join(':');
	}

	function captureDocumentSession(): DocumentSession {
		return {
			epoch: documentSessionEpoch,
			key: getDocumentSessionKey(),
			projectId,
			taskId,
			sourceDocumentId: documentId,
			parentDocumentId
		};
	}

	function isCurrentDocumentSession(session: DocumentSession): boolean {
		return (
			isOpen &&
			session.epoch === documentSessionEpoch &&
			session.key === getDocumentSessionKey() &&
			session.projectId === projectId &&
			session.taskId === taskId &&
			session.sourceDocumentId === documentId &&
			session.parentDocumentId === parentDocumentId
		);
	}

	function isCurrentDocumentMutation(
		session: DocumentSession,
		requestedDocumentId: string | null
	): boolean {
		return isCurrentDocumentSession(session) && requestedDocumentId === activeDocumentId;
	}

	function resetDocumentOperationState() {
		clearAutosaveTimers();
		saving = false;
		blockingSave = false;
		restoring = false;
		deleting = false;
		publicPageActionLoading = false;
		autosaveQueued = false;
		archiveModalOpen = false;
		permanentDeleteModalOpen = false;
		formError = null;
		saveStatus = 'idle';
		lastSavePublishedLive = false;
		showTaskModal = false;
		showPlanModal = false;
		showGoalModal = false;
		showDocumentModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedGoalIdForModal = null;
		selectedDocumentIdForModal = null;
		linkedEntityModalSession = null;
		showChatModal = false;
		chatModalSession = null;
		showRestoreModal = false;
		selectedVersionForRestore = null;
		restoreModalSession = null;
		moveModalSession = null;
		imageInsertModalSession = null;
		hasChanges = false;
	}

	function invalidateDocumentSession() {
		documentSessionEpoch += 1;
		liveSyncMutationId += 1;
		resetDocumentOperationState();
	}

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

	function normalizePublicPageSlugBaseInput(
		value: string,
		fallback: string | null = null
	): string {
		const normalized = value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/[\s-]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48)
			.replace(/-+$/g, '');
		if (normalized) return normalized;
		if (fallback) return normalizePublicPageSlugBaseInput(fallback, null);
		return '';
	}

	function getPublicPageDraftFinalSlug(
		draft: PublicPageDraft | null,
		preview: PublicPagePreview | null
	): string | null {
		if (!draft && !preview) return null;
		const slugPrefix = draft?.slug_prefix ?? preview?.slug_prefix ?? null;
		const slugBase = normalizePublicPageSlugBaseInput(
			draft?.slug_base ?? preview?.slug_base ?? '',
			'page'
		);
		if (!slugBase) return null;
		return slugPrefix ? `${slugPrefix}-${slugBase}` : slugBase;
	}

	function getPublicPageDraftUrlPreview(
		draft: PublicPageDraft | null,
		preview: PublicPagePreview | null
	): string | null {
		const draftSlug = getPublicPageDraftFinalSlug(draft, preview);
		if (!draftSlug) return null;
		const slugPrefix = draft?.slug_prefix ?? preview?.slug_prefix ?? null;
		const slugBase = normalizePublicPageSlugBaseInput(
			draft?.slug_base ?? preview?.slug_base ?? '',
			'page'
		);
		const urlPath = slugPrefix ? `/p/${slugPrefix}/${slugBase}` : `/p/${draftSlug}`;
		return `https://build-os.com${urlPath}`;
	}

	function normalizePublicPageState(data: unknown): PublicPageState | null {
		if (!data || typeof data !== 'object') return null;
		const row = data as Record<string, unknown>;
		const slug = typeof row.slug === 'string' ? row.slug : '';
		if (!slug) return null;

		return {
			id: typeof row.id === 'string' ? row.id : '',
			slug,
			slug_prefix:
				typeof row.slug_prefix === 'string' && row.slug_prefix ? row.slug_prefix : null,
			slug_base: typeof row.slug_base === 'string' && row.slug_base ? row.slug_base : slug,
			url_path:
				typeof row.url_path === 'string' && row.url_path
					? row.url_path
					: typeof row.slug_prefix === 'string' &&
						  row.slug_prefix &&
						  typeof row.slug_base === 'string' &&
						  row.slug_base
						? `/p/${row.slug_prefix}/${row.slug_base}`
						: `/p/${slug}`,
			title: typeof row.title === 'string' ? row.title : '',
			summary: typeof row.summary === 'string' ? row.summary : null,
			public_status:
				row.public_status === 'pending_confirmation' ||
				row.public_status === 'live' ||
				row.public_status === 'unpublished' ||
				row.public_status === 'archived'
					? row.public_status
					: 'not_public',
			visibility: row.visibility === 'unlisted' ? 'unlisted' : 'public',
			noindex: row.noindex === true,
			live_sync_enabled: row.live_sync_enabled !== false,
			published_at: typeof row.published_at === 'string' ? row.published_at : null,
			last_live_sync_at:
				typeof row.last_live_sync_at === 'string' ? row.last_live_sync_at : null,
			last_live_sync_error:
				typeof row.last_live_sync_error === 'string' ? row.last_live_sync_error : null,
			is_live_public: row.is_live_public === true,
			is_listed_public: row.is_listed_public === true,
			view_count_all: typeof row.view_count_all === 'number' ? row.view_count_all : 0,
			view_count_30d: typeof row.view_count_30d === 'number' ? row.view_count_30d : 0
		};
	}

	function normalizePublicPagePreview(data: unknown): PublicPagePreview | null {
		if (!data || typeof data !== 'object') return null;
		const row = data as Record<string, unknown>;
		const slug = typeof row.slug === 'string' ? row.slug : '';
		if (!slug) return null;

		return {
			slug,
			slug_prefix:
				typeof row.slug_prefix === 'string' && row.slug_prefix ? row.slug_prefix : null,
			slug_base: typeof row.slug_base === 'string' && row.slug_base ? row.slug_base : slug,
			slug_was_deduped: row.slug_was_deduped === true,
			url_path:
				typeof row.url_path === 'string' && row.url_path
					? row.url_path
					: typeof row.slug_prefix === 'string' &&
						  row.slug_prefix &&
						  typeof row.slug_base === 'string' &&
						  row.slug_base
						? `/p/${row.slug_prefix}/${row.slug_base}`
						: `/p/${slug}`,
			title: typeof row.title === 'string' ? row.title : '',
			summary: typeof row.summary === 'string' ? row.summary : null,
			content: typeof row.content === 'string' ? row.content : '',
			visibility: row.visibility === 'unlisted' ? 'unlisted' : 'public',
			noindex: row.noindex === true,
			live_sync_enabled: row.live_sync_enabled !== false
		};
	}

	function normalizePublicPageReview(data: unknown): PublicPageReview | null {
		if (!data || typeof data !== 'object') return null;
		const row = data as Record<string, unknown>;
		if (typeof row.id !== 'string' || !row.id) return null;

		const normalizeFinding = (value: unknown): PublicPageReviewFinding | null => {
			if (!value || typeof value !== 'object') return null;
			const finding = value as Record<string, unknown>;
			const message = typeof finding.message === 'string' ? finding.message : '';
			const recommendation =
				typeof finding.recommendation === 'string' ? finding.recommendation : '';
			if (!message || !recommendation) return null;
			return {
				code: typeof finding.code === 'string' ? finding.code : 'policy',
				category: typeof finding.category === 'string' ? finding.category : 'other',
				severity:
					finding.severity === 'low' || finding.severity === 'high'
						? finding.severity
						: 'medium',
				source: finding.source === 'image' ? 'image' : 'text',
				message,
				recommendation,
				excerpt: typeof finding.excerpt === 'string' ? finding.excerpt : null,
				asset_id: typeof finding.asset_id === 'string' ? finding.asset_id : null,
				asset_label: typeof finding.asset_label === 'string' ? finding.asset_label : null
			};
		};

		const normalizeFindings = (value: unknown): PublicPageReviewFinding[] =>
			Array.isArray(value)
				? value
						.map((entry) => normalizeFinding(entry))
						.filter((entry): entry is PublicPageReviewFinding => Boolean(entry))
				: [];

		const reasons = Array.isArray(row.reasons)
			? row.reasons
					.map((entry) => (typeof entry === 'string' ? entry : null))
					.filter((entry): entry is string => Boolean(entry && entry.trim()))
			: [];

		return {
			id: row.id,
			source:
				row.source === 'live_sync' || row.source === 'manual_retry'
					? row.source
					: 'publish_confirm',
			status: row.status === 'flagged' || row.status === 'error' ? row.status : 'passed',
			policy_version:
				typeof row.policy_version === 'string' && row.policy_version
					? row.policy_version
					: 'public_page_policy_v1',
			summary: typeof row.summary === 'string' ? row.summary : null,
			reasons,
			text_findings: normalizeFindings(row.text_findings),
			image_findings: normalizeFindings(row.image_findings),
			created_at: typeof row.created_at === 'string' ? row.created_at : '',
			admin_decision:
				row.admin_decision === 'approved' || row.admin_decision === 'rejected'
					? row.admin_decision
					: null,
			admin_decision_reason:
				typeof row.admin_decision_reason === 'string' ? row.admin_decision_reason : null,
			admin_decision_by:
				typeof row.admin_decision_by === 'string' ? row.admin_decision_by : null,
			admin_decision_at:
				typeof row.admin_decision_at === 'string' ? row.admin_decision_at : null
		};
	}

	function updatePublicPageDraft(patch: Partial<PublicPageDraft>) {
		if (!publicPageDraft) return;
		publicPageDraft = {
			...publicPageDraft,
			...patch
		};
	}

	function closePublicPageConfirmModal() {
		if (publicPageActionLoading) return;
		showPublicPageConfirmModal = false;
	}

	function openPublicPageInNewTab() {
		const urlPath = publicPageState?.url_path;
		if (!urlPath || !browser) return;
		window.open(urlPath, '_blank', 'noopener,noreferrer');
	}

	async function handleCopyPublicPageUrl() {
		if (!publicPageState) return;
		const session = captureDocumentSession();
		const absoluteUrl = buildAbsolutePublicPageUrl({
			slug: publicPageState.slug,
			slug_prefix: publicPageState.slug_prefix,
			slug_base: publicPageState.slug_base,
			url_path: publicPageState.url_path
		});
		if (!absoluteUrl) return;
		const ok = await copyTextToClipboard(absoluteUrl);
		if (!isCurrentDocumentSession(session)) return;
		if (ok) {
			toastService.success('Link copied');
		} else {
			toastService.error('Failed to copy link. Select the URL and copy it manually.');
		}
	}

	async function handleCopyDocumentPageUrl() {
		if (!browser || !documentPageUrlPath) return;
		const session = captureDocumentSession();
		const requestedUrl = `${window.location.origin}${documentPageUrlPath}`;
		const ok = await copyTextToClipboard(requestedUrl);
		if (!isCurrentDocumentSession(session)) return;
		if (ok) {
			toastService.success('Document URL copied');
		} else {
			toastService.error('Failed to copy URL');
		}
	}

	function handleOpenDocumentPage() {
		if (!browser || !documentPageUrlPath) return;
		if (blockingSave || saveStatus === 'saving') {
			toastService.warning('Wait for the current save to finish before leaving.');
			return;
		}
		if (editorIsRecording || editorIsTranscribing) {
			toastService.warning('Finish voice capture before leaving this document.');
			return;
		}
		if (shouldPromptBeforeClose) {
			pendingDocumentPageNavigation = true;
			discardChangesModalOpen = true;
			return;
		}
		window.location.href = documentPageUrlPath;
	}

	function clearDeferredDocumentLoads() {
		cancelCommentsCountLoad();
		cancelPublicPageLoad();
		cancelDocTreeLoad();
		deferredDocumentLoadController?.abort();
		docTreeLoadController?.abort();
		cancelCommentsCountLoad = () => {};
		cancelPublicPageLoad = () => {};
		cancelDocTreeLoad = () => {};
		deferredDocumentLoadController = null;
		docTreeLoadController = null;
		docTreeLoadPromise = null;
		docTreeLoadPromiseKey = null;
		treeLoading = false;
	}

	function isAbortError(error: unknown): boolean {
		return error instanceof Error && error.name === 'AbortError';
	}

	function isCurrentDocumentView(context: DocumentLoadContext): boolean {
		return (
			context.requestId === documentLoadRequestId &&
			context.documentId === activeDocumentId &&
			context.projectId === projectId &&
			isOpen
		);
	}

	function isCurrentDocumentLoad(
		context: DocumentLoadContext,
		controller: AbortController
	): boolean {
		return (
			isCurrentDocumentView(context) &&
			documentLoadController === controller &&
			!controller.signal.aborted
		);
	}

	function cancelDocumentLoad() {
		documentLoadRequestId += 1;
		documentLoadController?.abort();
		documentLoadController = null;
		documentLoadTargetKey = null;
		loading = false;
		clearDeferredDocumentLoads();
	}

	function scheduleDeferredDocumentLoad(task: () => void, fallbackDelayMs: number): () => void {
		if (!browser) return () => {};

		const idleWindow = window as Window & {
			requestIdleCallback?: (
				callback: IdleRequestCallback,
				options?: IdleRequestOptions
			) => number;
			cancelIdleCallback?: (handle: number) => void;
		};
		if (typeof idleWindow.requestIdleCallback === 'function') {
			const handle = idleWindow.requestIdleCallback?.(() => task(), {
				timeout: Math.max(1000, fallbackDelayMs * 4)
			});
			return () => {
				if (handle !== undefined) {
					idleWindow.cancelIdleCallback?.(handle);
				}
			};
		}

		const timeoutId = globalThis.setTimeout(task, fallbackDelayMs);
		return () => globalThis.clearTimeout(timeoutId);
	}

	function formatDate(dateString: string | null | undefined): string {
		return formatDateForDisplay(dateString) || 'Unknown date';
	}

	function resetDocumentPanels() {
		activeMobileTab = null;
		showPublicPage = false;
		showImages = false;
		showVersionHistory = false;
		showVoiceNotes = false;
		showActivityLog = false;
		showComments = false;
		showMoveModal = false;
		showImageInsertModal = false;
		showExportMenu = false;
		comparisonMode = false;
	}

	function resetDocumentAncillaryState() {
		clearDeferredDocumentLoads();
		resetDocumentPanels();
		commentsCount = 0;
		publicPageState = null;
		publicPageLoading = false;
		publicPageStateLoaded = false;
		publicPageActionLoading = false;
		showPublicPageConfirmModal = false;
		publicPagePreview = null;
		publicPageDraft = null;
		latestPublicPageReview = null;
		isAdminUser = false;
		lastAdminAccessProjectId = null;
		lastDocTreeLoadKey = null;
	}

	async function loadCommentsCount(context: DocumentLoadContext, signal: AbortSignal) {
		try {
			const params = new URLSearchParams({
				project_id: context.projectId,
				entity_type: 'document',
				entity_id: context.documentId,
				include_deleted: 'true',
				count_only: 'true'
			});
			const response = await fetch(`/api/onto/comments?${params.toString()}`, { signal });
			const payload = await response.json().catch(() => null);

			if (!isCurrentDocumentView(context) || signal.aborted) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load comment count');
			}

			commentsCount = Number(payload?.data?.count ?? 0);
		} catch (error) {
			if (isAbortError(error) || !isCurrentDocumentView(context) || signal.aborted) return;
			void logOntologyClientError(error, {
				endpoint: '/api/onto/comments',
				method: 'GET',
				projectId: context.projectId,
				entityType: 'document',
				entityId: context.documentId,
				operation: 'document_comments_count_load'
			});
		}
	}

	function queueDeferredDocumentLoads(context: DocumentLoadContext) {
		clearDeferredDocumentLoads();
		const controller = new AbortController();
		deferredDocumentLoadController = controller;

		cancelCommentsCountLoad = scheduleDeferredDocumentLoad(() => {
			if (!isCurrentDocumentView(context) || controller.signal.aborted) return;
			void loadCommentsCount(context, controller.signal);
		}, 120);

		cancelPublicPageLoad = scheduleDeferredDocumentLoad(() => {
			if (!isCurrentDocumentView(context) || controller.signal.aborted) return;
			void loadPublicPageState(context, controller.signal);
		}, 220);

		cancelDocTreeLoad = scheduleDeferredDocumentLoad(() => {
			if (!isCurrentDocumentView(context) || controller.signal.aborted) return;
			void loadDocTree(context, controller.signal);
		}, 360);
	}

	async function loadPublicPageState(context: DocumentLoadContext, signal: AbortSignal) {
		try {
			publicPageLoading = true;
			publicPageStateLoaded = false;
			const response = await fetch(`/api/onto/documents/${context.documentId}/public-page`, {
				signal
			});
			const payload = await response.json().catch(() => null);
			if (!isCurrentDocumentView(context) || signal.aborted) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load public page state');
			}
			publicPageState = normalizePublicPageState(payload?.data?.publicPage);
			latestPublicPageReview = normalizePublicPageReview(payload?.data?.latestReview);
			// Auto-expand the publish panel only when the page is live or has a
			// non-default status; drafts keep it collapsed so it doesn't outweigh
			// the editor's primary sections (hierarchy fix, Hyperplexed T2-5).
			showPublicPage =
				publicPageState?.is_live_public === true ||
				(publicPageState != null && publicPageState.public_status !== 'not_public');
		} catch (error) {
			if (isAbortError(error) || !isCurrentDocumentView(context) || signal.aborted) return;
			publicPageState = null;
			latestPublicPageReview = null;
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${context.documentId}/public-page`,
				method: 'GET',
				projectId: context.projectId,
				entityType: 'document',
				entityId: context.documentId,
				operation: 'document_public_page_state_load'
			});
		} finally {
			if (!isCurrentDocumentView(context) || signal.aborted) return;
			publicPageLoading = false;
			publicPageStateLoaded = true;
		}
	}

	async function handleMakeDocumentPublic() {
		if (!activeDocumentId || blockingSave || loading) return;
		if (!validateForm()) return;
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;

		if (hasUnsavedChanges) {
			const saved = await performSave({
				silent: true,
				forceVersion: true,
				blockingUi: true
			});
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			if (!saved) {
				toastService.error('Save failed. Resolve issues before publishing.');
				return;
			}
		}
		if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
		const requestedTitle = title.trim();
		const requestedDescription = description.trim();
		const requestedPublicPageState = publicPageState;

		try {
			publicPageActionLoading = true;
			const response = await fetch(
				`/api/onto/documents/${requestedDocumentId}/public-page/prepare`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						slug_base: requestedPublicPageState?.slug_base ?? requestedTitle,
						title: requestedTitle || null,
						summary: requestedDescription || null,
						visibility: requestedPublicPageState?.visibility ?? 'public',
						noindex: requestedPublicPageState?.noindex ?? false,
						live_sync_enabled: requestedPublicPageState?.live_sync_enabled ?? true
					})
				}
			);
			const payload = await response.json().catch(() => null);
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to prepare public page');
			}

			const preview = normalizePublicPagePreview(payload?.data?.preview);
			if (!preview) {
				throw new Error('Failed to build public page preview');
			}

			publicPagePreview = preview;
			publicPageDraft = {
				slug_prefix: preview.slug_prefix,
				slug_base: preview.slug_base,
				title: preview.title,
				summary: preview.summary ?? '',
				visibility: preview.visibility,
				noindex: preview.noindex,
				live_sync_enabled: preview.live_sync_enabled
			};
			showPublicPageConfirmModal = true;
		} catch (error) {
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			const message =
				error instanceof Error ? error.message : 'Failed to prepare public page';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${requestedDocumentId}/public-page/prepare`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'document',
				entityId: requestedDocumentId,
				operation: 'document_public_page_prepare'
			});
			toastService.error(message);
		} finally {
			if (isCurrentDocumentMutation(session, requestedDocumentId)) {
				publicPageActionLoading = false;
			}
		}
	}

	async function handleConfirmPublicPage() {
		if (!activeDocumentId || !publicPageDraft) return;
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		const requestedDraft = { ...publicPageDraft };
		const slugBase = requestedDraft.slug_base.trim();

		try {
			publicPageActionLoading = true;
			const response = await fetch(
				`/api/onto/documents/${requestedDocumentId}/public-page/confirm`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						slug_base: slugBase || null,
						title: requestedDraft.title.trim() || null,
						summary: requestedDraft.summary.trim() || null,
						visibility: requestedDraft.visibility,
						noindex: requestedDraft.noindex,
						live_sync_enabled: requestedDraft.live_sync_enabled
					})
				}
			);
			const payload = await response.json().catch(() => null);
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			const review = normalizePublicPageReview(
				payload?.data?.review ?? payload?.details?.review
			);
			if (review) {
				latestPublicPageReview = review;
			}
			if (!response.ok) {
				const suggestedSlugBase =
					typeof payload?.details?.suggested_slug_base === 'string'
						? payload.details.suggested_slug_base
						: null;
				const suggestedSlug =
					typeof payload?.details?.suggested_slug === 'string'
						? payload.details.suggested_slug
						: null;
				if (response.status === 422 && review?.status === 'flagged') {
					if (review.admin_decision === 'rejected') {
						toastService.error(
							'Publishing blocked: admin marked this content not okay. Update it and try again.'
						);
					} else {
						toastService.error(
							'Publishing blocked pending admin review. Ask an admin to mark the flagged content okay or update the document.'
						);
					}
					return;
				}
				if (response.status === 409 && suggestedSlugBase) {
					publicPageDraft = {
						...requestedDraft,
						slug_base: suggestedSlugBase
					};
					if (publicPagePreview && suggestedSlug) {
						publicPagePreview = {
							...publicPagePreview,
							slug: suggestedSlug,
							slug_base: suggestedSlugBase,
							slug_was_deduped: true,
							url_path:
								requestedDraft.slug_prefix && suggestedSlugBase
									? `/p/${requestedDraft.slug_prefix}/${suggestedSlugBase}`
									: `/p/${suggestedSlug}`
						};
					}
					toastService.error(
						'That public URL is already taken. A suggested alternative has been loaded.'
					);
					return;
				}
				throw new Error(payload?.error || 'Failed to publish public page');
			}

			const confirmed = normalizePublicPageState(payload?.data?.publicPage);
			if (!confirmed) {
				throw new Error('Failed to read updated public page state');
			}
			publicPageState = confirmed;
			showPublicPageConfirmModal = false;
			toastService.success('Document is now public');
			onSaved?.();
		} catch (error) {
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			const message =
				error instanceof Error ? error.message : 'Failed to publish public page';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${requestedDocumentId}/public-page/confirm`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'document',
				entityId: requestedDocumentId,
				operation: 'document_public_page_confirm'
			});
			toastService.error(message);
		} finally {
			if (isCurrentDocumentMutation(session, requestedDocumentId)) {
				publicPageActionLoading = false;
			}
		}
	}

	async function handleLiveSyncToggle(nextEnabled: boolean) {
		if (!activeDocumentId || !publicPageState) return;

		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		const mutationId = ++liveSyncMutationId;
		const previousState = publicPageState;
		publicPageState = {
			...publicPageState,
			live_sync_enabled: nextEnabled
		};

		try {
			const response = await fetch(
				`/api/onto/documents/${requestedDocumentId}/public-page/live-sync`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						live_sync_enabled: nextEnabled
					})
				}
			);
			const payload = await response.json().catch(() => null);
			if (
				!isCurrentDocumentMutation(session, requestedDocumentId) ||
				mutationId !== liveSyncMutationId
			) {
				return;
			}
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update live sync');
			}

			const updated = normalizePublicPageState(payload?.data?.publicPage);
			if (updated) {
				publicPageState = updated;
			}
			toastService.success(nextEnabled ? 'Live sync enabled' : 'Live sync paused');
		} catch (error) {
			if (
				!isCurrentDocumentMutation(session, requestedDocumentId) ||
				mutationId !== liveSyncMutationId
			) {
				return;
			}
			publicPageState = previousState;
			const message = error instanceof Error ? error.message : 'Failed to update live sync';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${requestedDocumentId}/public-page/live-sync`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'document',
				entityId: requestedDocumentId,
				operation: 'document_public_page_live_sync_toggle'
			});
			toastService.error(message);
		}
	}

	async function handleUnpublishPublicPage() {
		if (!activeDocumentId || !publicPageState) return;
		if (publicPageActionLoading) return;
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		const confirmed =
			typeof window !== 'undefined'
				? window.confirm(
						'Unpublish this page? The public link will return 404. You can republish at the same URL any time.'
					)
				: true;
		if (!confirmed) return;

		try {
			publicPageActionLoading = true;
			const response = await fetch(
				`/api/onto/documents/${requestedDocumentId}/public-page/unpublish`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				}
			);
			const payload = await response.json().catch(() => null);
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to unpublish public page');
			}
			const updated = normalizePublicPageState(payload?.data?.publicPage);
			if (updated) {
				publicPageState = updated;
			} else {
				publicPageState = null;
			}
			toastService.success('Unpublished. The link will now 404.');
			onSaved?.();
		} catch (error) {
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			const message =
				error instanceof Error ? error.message : 'Failed to unpublish public page';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${requestedDocumentId}/public-page/unpublish`,
				method: 'POST',
				projectId: session.projectId,
				entityType: 'document',
				entityId: requestedDocumentId,
				operation: 'document_public_page_unpublish'
			});
			toastService.error(message);
		} finally {
			if (isCurrentDocumentMutation(session, requestedDocumentId)) {
				publicPageActionLoading = false;
			}
		}
	}

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
		lastLoadedProjectId = null;
		// Reset autosave state
		lastSavedSnapshot = null;
		serverUpdatedAt = null;
		saveStatus = 'idle';
		lastSavePublishedLive = false;
		clearAutosaveTimers();
		resetDocumentAncillaryState();
		discardChangesModalOpen = false;
		pendingDocumentPageNavigation = false;
		editorIsRecording = false;
		editorIsTranscribing = false;
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
		documentLoadRequestId += 1;
		const context: DocumentLoadContext = {
			requestId: documentLoadRequestId,
			documentId: id,
			projectId
		};
		documentLoadController?.abort();
		clearDeferredDocumentLoads();
		const controller = new AbortController();
		documentLoadController = controller;
		documentLoadTargetKey = `${context.projectId}:${context.documentId}`;

		try {
			loading = true;
			formError = null;
			linkedEntities = undefined;
			const response = await fetch(
				`/api/onto/documents/${context.documentId}/full?include_linked=false`,
				{ signal: controller.signal }
			);
			const payload = await response.json().catch(() => null);

			if (!isCurrentDocumentLoad(context, controller)) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load document');
			}

			const document = payload?.data?.document;
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
			lastLoadedId = context.documentId;
			lastLoadedProjectId = context.projectId;

			// Track server state for autosave and conflict detection
			serverUpdatedAt = document.updated_at ?? null;
			captureSnapshot();
			saveStatus = 'idle';
			lastSavePublishedLive = false;
			queueDeferredDocumentLoads(context);
		} catch (error) {
			if (isAbortError(error) || !isCurrentDocumentLoad(context, controller)) return;
			const message = error instanceof Error ? error.message : 'Failed to load document';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${context.documentId}/full?include_linked=false`,
				method: 'GET',
				projectId: context.projectId,
				entityType: 'document',
				entityId: context.documentId,
				operation: 'document_load'
			});
			formError = message;
			toastService.error(message);
			publicPageState = null;
			latestPublicPageReview = null;
		} finally {
			if (isCurrentDocumentLoad(context, controller)) {
				loading = false;
				documentLoadController = null;
				documentLoadTargetKey = null;
				onLoaded?.();
			}
		}
	}

	function handleLinkedEntitiesLoaded(value: LinkedEntitiesResult) {
		linkedEntities = value;
	}

	$effect(() => {
		const nextSessionKey = getDocumentSessionKey();
		if (nextSessionKey === documentSessionKey) return;
		documentSessionKey = nextSessionKey;
		invalidateDocumentSession();
	});

	// Watch for modal opening and load/reset form accordingly
	// IMPORTANT: Use activeDocumentId (internal state) not documentId (prop) to avoid
	// race condition where setting lastLoadedId triggers this effect to re-run,
	// but documentId prop is still null, causing resetForm() to clear just-loaded data.
	$effect(() => {
		// Track dependencies explicitly - use activeDocumentId to include internal state
		const shouldLoad = isOpen;
		const currentDocId = activeDocumentId;
		const currentProjectId = projectId;
		const lastId = lastLoadedId;
		const lastProjectId = lastLoadedProjectId;

		if (!shouldLoad) {
			cancelDocumentLoad();
			return;
		}

		if (currentDocId) {
			const currentLoadKey = `${currentProjectId}:${currentDocId}`;
			const needsLoad = currentDocId !== lastId || currentProjectId !== lastProjectId;
			if (needsLoad && currentLoadKey !== documentLoadTargetKey) {
				void loadDocument(currentDocId);
			}
		} else {
			cancelDocumentLoad();
			resetForm();
		}
	});

	$effect(() => {
		if (!isOpen) {
			lastDocumentViewKey = null;
			clearDeferredDocumentLoads();
			return;
		}

		const nextKey = `${projectId}:${activeDocumentId ?? '__new__'}`;
		if (lastDocumentViewKey === nextKey) return;
		lastDocumentViewKey = nextKey;
		resetDocumentAncillaryState();
	});

	function closeModal() {
		invalidateDocumentSession();
		clearAutosaveTimers();
		cancelDocumentLoad();
		resetDocumentPanels();
		showPublicPageConfirmModal = false;
		discardChangesModalOpen = false;
		pendingDocumentPageNavigation = false;
		isOpen = false;
		onClose?.();
	}

	onDestroy(() => {
		documentSessionEpoch += 1;
		liveSyncMutationId += 1;
		clearAutosaveTimers();
		cancelDocumentLoad();
	});

	function handleModalBeforeClose(): boolean {
		if (blockingSave || saveStatus === 'saving') {
			toastService.warning('Wait for the current save to finish before closing.');
			return false;
		}

		if (editorIsRecording || editorIsTranscribing) {
			toastService.warning('Finish voice capture before closing this document.');
			return false;
		}

		if (shouldPromptBeforeClose) {
			discardChangesModalOpen = true;
			return false;
		}

		return true;
	}

	function requestClose() {
		if (!handleModalBeforeClose()) return;
		closeModal();
	}

	function handleDiscardChangesConfirm() {
		const nextPath = pendingDocumentPageNavigation ? documentPageUrlPath : null;
		pendingDocumentPageNavigation = false;
		closeModal();
		if (browser && nextPath) {
			window.location.href = nextPath;
		}
	}

	function handleDiscardChangesCancel() {
		pendingDocumentPageNavigation = false;
		discardChangesModalOpen = false;
	}

	function validateForm(): boolean {
		if (!title.trim()) {
			formError = 'Title is required';
			return false;
		}
		return true;
	}

	function extractInlineAssetIds(markdown: string): string[] {
		if (!markdown) return [];
		const ids = new Set<string>();
		const regex = new RegExp(INLINE_ASSET_RENDER_REGEX);
		for (const match of markdown.matchAll(regex)) {
			const id = match[1]?.toLowerCase();
			if (id) ids.add(id);
		}
		return [...ids];
	}

	async function syncInlineImageLinks(
		requestedProjectId: string,
		documentId: string,
		markdown: string
	): Promise<void> {
		const desiredIds = new Set(extractInlineAssetIds(markdown));
		const listParams = new URLSearchParams({
			project_id: requestedProjectId,
			entity_kind: 'document',
			entity_id: documentId,
			role: 'inline',
			limit: '200'
		});

		const listResponse = await fetch(`/api/onto/assets?${listParams.toString()}`);
		const listPayload = await listResponse.json().catch(() => null);
		if (!listResponse.ok) {
			throw new Error(listPayload?.error || 'Failed to load inline image links');
		}

		const currentAssets = Array.isArray(listPayload?.data?.assets)
			? (listPayload.data.assets as Array<{ id?: string }>)
			: [];
		const currentIds = new Set(
			currentAssets
				.map((asset) => (asset.id ? asset.id.toLowerCase() : ''))
				.filter((id) => id.length > 0)
		);

		const toLink = [...desiredIds].filter((id) => !currentIds.has(id));
		const toUnlink = [...currentIds].filter((id) => !desiredIds.has(id));

		await Promise.all(
			toLink.map(async (assetId) => {
				const response = await fetch(`/api/onto/assets/${assetId}/links`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						entity_kind: 'document',
						entity_id: documentId,
						role: 'inline'
					})
				});
				const payload = await response.json().catch(() => null);
				if (!response.ok) {
					throw new Error(payload?.error || `Failed to attach inline image ${assetId}`);
				}
			})
		);

		await Promise.all(
			toUnlink.map(async (assetId) => {
				const params = new URLSearchParams({
					entity_kind: 'document',
					entity_id: documentId,
					role: 'inline'
				});
				const response = await fetch(
					`/api/onto/assets/${assetId}/links?${params.toString()}`,
					{
						method: 'DELETE'
					}
				);
				const payload = await response.json().catch(() => null);
				if (!response.ok) {
					throw new Error(payload?.error || `Failed to detach inline image ${assetId}`);
				}
			})
		);
	}

	/** Internal save logic shared by autosave and manual save */
	async function performSave(
		options: { silent?: boolean; forceVersion?: boolean; blockingUi?: boolean } = {}
	): Promise<boolean> {
		const { silent = false, forceVersion = false, blockingUi = false } = options;
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		const wasCreating = !requestedDocumentId;
		const isSaveSessionCurrent = () =>
			isCurrentDocumentSession(session) &&
			(wasCreating || requestedDocumentId === activeDocumentId);
		if (!isSaveSessionCurrent()) return false;
		if (saving) {
			if (isEditing && hasUnsavedChanges) {
				autosaveQueued = true;
			}
			return false;
		}
		const snapshotAtRequest: SaveSnapshot = {
			title,
			description,
			body,
			stateKey
		};
		const requestedTypeKey = typeKey.trim();
		const expectedUpdatedAt = serverUpdatedAt;
		const requestedPublicPageState = publicPageState;

		try {
			saving = true;
			blockingSave = blockingUi;
			saveStatus = 'saving';
			formError = null;

			const payload: Record<string, unknown> = {
				title: snapshotAtRequest.title.trim(),
				state_key: snapshotAtRequest.stateKey,
				description: snapshotAtRequest.description.trim() || null,
				content: snapshotAtRequest.body
			};
			const requestLiveSync =
				!wasCreating &&
				!silent &&
				requestedPublicPageState?.is_live_public === true &&
				requestedPublicPageState.live_sync_enabled === true;
			if (forceVersion) {
				payload.force_version = true;
			}
			if (requestLiveSync) {
				payload.sync_public_page = true;
			}

			// Include expected_updated_at for conflict detection (editing existing docs only)
			if (requestedDocumentId && expectedUpdatedAt) {
				payload.expected_updated_at = expectedUpdatedAt;
			}

			if (requestedDocumentId && requestedTypeKey) {
				payload.type_key = requestedTypeKey;
			}

			if (wasCreating) {
				payload.classification_source = 'create_modal';
			}

			let request: Response;

			if (requestedDocumentId) {
				request = await fetch(`/api/onto/documents/${requestedDocumentId}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
			} else if (session.taskId) {
				request = await fetch(`/api/onto/tasks/${session.taskId}/documents`, {
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
						project_id: session.projectId,
						...(session.parentDocumentId
							? { parent_id: session.parentDocumentId }
							: {}),
						...payload
					})
				});
			}

			const result = await request.json().catch(() => null);
			if (!isSaveSessionCurrent()) return false;

			if (request.status === 409) {
				// Conflict detected - server version is newer
				saveStatus = 'conflict';
				formError = null;
				lastSavePublishedLive = false;
				return false;
			}

			if (!request.ok) {
				throw new Error(result?.error || 'Failed to save document');
			}

			// Update server timestamp from response
			const updatedDoc = result?.data?.document;
			const newDocumentId = result?.data?.document?.id ?? result?.data?.id ?? null;
			const persistedDocumentId = updatedDoc?.id ?? requestedDocumentId ?? newDocumentId;
			if (updatedDoc?.updated_at) {
				serverUpdatedAt = updatedDoc.updated_at;
				updatedAt = updatedDoc.updated_at;
			}

			const syncResult =
				result?.data?.publicPageSync && typeof result.data.publicPageSync === 'object'
					? (result.data.publicPageSync as Record<string, unknown>)
					: null;
			const syncedPublicPageState = normalizePublicPageState(syncResult?.page);
			if (syncedPublicPageState) {
				publicPageState = syncedPublicPageState;
			}
			const syncReview = normalizePublicPageReview(syncResult?.review);
			if (syncReview) {
				latestPublicPageReview = syncReview;
			}
			const liveSyncSynced = syncResult?.synced === true;
			const liveSyncBlocked = syncResult?.blocked === true;
			const liveSyncError =
				typeof syncResult?.error === 'string' && syncResult.error.trim()
					? syncResult.error.trim()
					: null;

			// Fire-and-forget: sync inline image links in the background
			if (persistedDocumentId) {
				void syncInlineImageLinks(
					session.projectId,
					persistedDocumentId,
					snapshotAtRequest.body
				).catch((syncError) => {
					void logOntologyClientError(syncError, {
						endpoint: '/api/onto/assets',
						method: 'POST',
						projectId: session.projectId,
						entityType: 'document',
						entityId: persistedDocumentId,
						operation: 'document_inline_image_sync',
						metadata: {
							inlineAssetIds: extractInlineAssetIds(snapshotAtRequest.body),
							documentId: persistedDocumentId
						}
					});
					if (!silent && isSaveSessionCurrent()) {
						toastService.warning(
							'Document saved, but inline image links could not be fully synced'
						);
					}
				});
			}

			// Capture snapshot of what we just saved
			captureSnapshot(snapshotAtRequest);

			// Show saved status briefly, then return to idle
			lastSavePublishedLive = liveSyncSynced;
			saveStatus = 'saved';
			if (savedFeedbackTimer) clearTimeout(savedFeedbackTimer);
			savedFeedbackTimer = setTimeout(() => {
				if (isSaveSessionCurrent() && saveStatus === 'saved') {
					saveStatus = 'idle';
				}
			}, 2000);

			if (!silent) {
				toastService.success(
					wasCreating
						? 'Document created'
						: liveSyncSynced
							? 'Document updated and live page updated'
							: 'Document updated'
				);
				if (requestLiveSync && liveSyncBlocked) {
					toastService.warning(
						'The document was saved, but the live page update is blocked by content review.'
					);
				} else if (requestLiveSync && liveSyncError) {
					toastService.warning(
						'The document was saved, but the live page was not updated. Review and confirm changes from the live document panel.'
					);
				}
				onSaved?.();
			}

			// If we just created a new document, transition to edit mode
			if (wasCreating && newDocumentId) {
				internalDocumentId = newDocumentId;
				await loadDocument(newDocumentId);
				if (!isSaveSessionCurrent()) return false;
			}

			return true;
		} catch (error) {
			if (!isSaveSessionCurrent()) return false;
			const message = error instanceof Error ? error.message : 'Failed to save document';
			const endpoint = requestedDocumentId
				? `/api/onto/documents/${requestedDocumentId}`
				: session.taskId
					? `/api/onto/tasks/${session.taskId}/documents`
					: '/api/onto/documents/create';
			const method = requestedDocumentId ? 'PATCH' : 'POST';
			void logOntologyClientError(error, {
				endpoint,
				method,
				projectId: session.projectId,
				entityType: 'document',
				entityId: requestedDocumentId ?? undefined,
				operation: requestedDocumentId ? 'document_update' : 'document_create',
				metadata: session.taskId ? { taskId: session.taskId } : undefined
			});
			formError = message;
			saveStatus = 'error';
			lastSavePublishedLive = false;
			if (!silent) {
				toastService.error(message);
			}
			return false;
		} finally {
			if (isSaveSessionCurrent()) {
				saving = false;
				blockingSave = false;
				if (autosaveQueued) {
					autosaveQueued = false;
					if (
						saveStatus !== 'conflict' &&
						saveStatus !== 'error' &&
						isEditing &&
						hasUnsavedChanges &&
						!loading &&
						title.trim()
					) {
						void handleAutosave();
					}
				}
			}
		}
	}

	async function handleAutosave() {
		if (!isEditing || !hasUnsavedChanges || saving || loading) return;
		if (!title.trim()) return; // Don't autosave without a title
		await performSave({ silent: true });
	}

	async function handleSave(event?: SubmitEvent) {
		event?.preventDefault();
		if (autosaveTimer) {
			clearTimeout(autosaveTimer);
			autosaveTimer = null;
		}
		if (!validateForm()) return;
		await performSave({ silent: false, forceVersion: true, blockingUi: true });
	}

	/** Reload the document from server (used for conflict resolution) */
	async function handleConflictReload() {
		if (!activeDocumentId) return;
		saveStatus = 'idle';
		formError = null;
		await loadDocument(activeDocumentId);
	}

	/** Force-overwrite the server version (used for conflict resolution) */
	async function handleConflictOverwrite() {
		// Clear serverUpdatedAt so the next save won't include conflict check
		serverUpdatedAt = null;
		saveStatus = 'dirty';
		await performSave({ silent: false, forceVersion: true, blockingUi: true });
	}

	type ArchiveMode = 'archive_children' | 'promote_children' | 'unlink_children';

	async function handleArchive(mode: ArchiveMode) {
		if (!activeDocumentId) return;
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		try {
			const response = await fetch(`/api/onto/documents/${requestedDocumentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'archive',
					archive_children_mode: mode
				})
			});
			const payload = await response.json().catch(() => null);
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to archive document');
			}

			stateKey = 'archived';
			toastService.success('Document archived');
			archiveModalOpen = false;
			onSaved?.();
			closeModal();
		} catch (error) {
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			const message = error instanceof Error ? error.message : 'Failed to archive document';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${requestedDocumentId}`,
				method: 'PATCH',
				projectId: session.projectId,
				entityType: 'document',
				entityId: requestedDocumentId,
				operation: 'document_archive'
			});
			toastService.error(message);
			throw error;
		}
	}

	async function handleRestore() {
		if (!activeDocumentId) return;
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		try {
			restoring = true;
			const response = await fetch(`/api/onto/documents/${requestedDocumentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'restore'
				})
			});
			const payload = await response.json().catch(() => null);
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to restore document');
			}

			toastService.success('Document restored');
			onSaved?.();
			closeModal();
		} catch (error) {
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			const message = error instanceof Error ? error.message : 'Failed to restore document';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${requestedDocumentId}`,
				method: 'PATCH',
				projectId: session.projectId,
				entityType: 'document',
				entityId: requestedDocumentId,
				operation: 'document_restore'
			});
			toastService.error(message);
		} finally {
			if (isCurrentDocumentMutation(session, requestedDocumentId)) {
				restoring = false;
			}
		}
	}

	async function handleDelete() {
		if (!activeDocumentId) return;
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		try {
			deleting = true;
			const response = await fetch(`/api/onto/documents/${requestedDocumentId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ permanent: true })
			});
			const payload = await response.json().catch(() => null);
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to permanently delete document');
			}

			toastService.success('Document permanently deleted');
			permanentDeleteModalOpen = false;
			onDeleted?.();
			closeModal();
		} catch (error) {
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			const message =
				error instanceof Error ? error.message : 'Failed to permanently delete document';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${requestedDocumentId}`,
				method: 'DELETE',
				projectId: session.projectId,
				entityType: 'document',
				entityId: requestedDocumentId,
				operation: 'document_delete_permanent'
			});
			toastService.error(message);
		} finally {
			if (isCurrentDocumentMutation(session, requestedDocumentId)) {
				deleting = false;
			}
		}
	}

	function buildExportPayload(): DocumentExportPayload {
		return {
			title: title.trim() || 'Untitled Document',
			description: description.trim() || null,
			markdown: body || '',
			stateKey,
			updatedAt
		};
	}

	async function handleExport(format: DocumentExportFormat) {
		if (exportingFormat) return;

		try {
			showExportMenu = false;
			exportingFormat = format;
			const payload = buildExportPayload();

			if (format === 'docx') {
				exportDocumentAsDocx(payload);
				toastService.success('DOCX export downloaded');
				return;
			}

			if (format === 'html') {
				exportDocumentAsHtml(payload);
				toastService.success('HTML export downloaded');
				return;
			}

			const opened = exportDocumentAsPdf(payload);
			if (!opened) {
				throw new Error('Popup blocked. Allow popups and try PDF export again.');
			}
			toastService.success('Print opened. Choose "Save as PDF" in your browser.');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to export document';
			void logOntologyClientError(error, {
				endpoint: '/document/export',
				method: 'CLIENT',
				projectId,
				entityType: 'document',
				entityId: activeDocumentId ?? undefined,
				operation: 'document_export',
				metadata: { format }
			});
			toastService.error(message);
		} finally {
			exportingFormat = null;
		}
	}

	function handleExportMenuWindowClick(event: MouseEvent) {
		if (!showExportMenu) return;
		if (!exportMenuRef) return;
		if (exportMenuRef.contains(event.target as Node)) return;
		showExportMenu = false;
	}

	function handleExportMenuWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showExportMenu) {
			showExportMenu = false;
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
	async function handleLinkedEntityClick(kind: EntityKind, id: string) {
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		if (!requestedDocumentId) return;
		switch (kind) {
			case 'task': {
				const component = (await loadTaskEditModal()).default;
				if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
				selectedTaskIdForModal = id;
				TaskEditModalComponent = component;
				linkedEntityModalSession = session;
				showTaskModal = true;
				break;
			}
			case 'plan': {
				const component = (await loadPlanEditModal()).default;
				if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
				selectedPlanIdForModal = id;
				PlanEditModalComponent = component;
				linkedEntityModalSession = session;
				showPlanModal = true;
				break;
			}
			case 'goal': {
				const component = (await loadGoalEditModal()).default;
				if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
				selectedGoalIdForModal = id;
				GoalEditModalComponent = component;
				linkedEntityModalSession = session;
				showGoalModal = true;
				break;
			}
			case 'document': {
				const component = (await loadDocumentModal()).default;
				if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
				selectedDocumentIdForModal = id;
				DocumentModalComponent = component;
				linkedEntityModalSession = session;
				showDocumentModal = true;
				break;
			}
			default:
				console.warn(`Unhandled entity kind: ${kind}`);
		}
	}

	function closeLinkedEntityModals(session: DocumentSession | null) {
		if (!session || !isCurrentDocumentSession(session)) return;
		showTaskModal = false;
		showPlanModal = false;
		showGoalModal = false;
		showDocumentModal = false;
		selectedTaskIdForModal = null;
		selectedPlanIdForModal = null;
		selectedGoalIdForModal = null;
		selectedDocumentIdForModal = null;
		linkedEntityModalSession = null;
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
		const session = captureDocumentSession();
		const requestedDocumentId = activeDocumentId;
		const component = await loadAgentChatModal();
		if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
		AgentChatModalComponent = component;
		chatModalSession = session;
		showChatModal = true;
	}

	function handleChatClose(session: DocumentSession | null) {
		if (!session || !isCurrentDocumentSession(session)) return;
		showChatModal = false;
		chatModalSession = null;
	}

	// Version history handlers
	function handleRestoreRequested(version: VersionListItem, latestVersion: number) {
		restoreModalSession = captureDocumentSession();
		selectedVersionForRestore = version;
		latestVersionNumber = latestVersion;
		showRestoreModal = true;
	}

	function handleRestoreModalClose(session: DocumentSession | null) {
		if (!session || !isCurrentDocumentSession(session)) return;
		showRestoreModal = false;
		selectedVersionForRestore = null;
		restoreModalSession = null;
	}

	async function handleVersionRestored(session: DocumentSession | null) {
		if (!session || !isCurrentDocumentSession(session) || !activeDocumentId) return;
		const requestedDocumentId = activeDocumentId;
		showRestoreModal = false;
		selectedVersionForRestore = null;
		restoreModalSession = null;
		// Reload the document to show restored content
		await loadDocument(requestedDocumentId);
		if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
		// Refresh version history panel
		versionHistoryPanelRef?.refresh();
		onSaved?.();
	}

	// Inline comparison mode handlers
	function handleEnterComparison(versionNumber: number, latestVersion: number) {
		comparisonLatestVersion = latestVersion;
		comparisonFromVersion = versionNumber > 1 ? versionNumber - 1 : null;
		comparisonToVersion = versionNumber;
		comparisonMode = true;
	}

	function handleComparisonNavigate(fromVersion: number | null, toVersion: number | 'current') {
		comparisonFromVersion = fromVersion;
		comparisonToVersion = toVersion;
	}

	function handleExitComparison() {
		comparisonMode = false;
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

	function handleCommentsCountChange(count: number) {
		commentsCount = count;
	}

	function toggleVersionHistory() {
		const nextOpen = !showVersionHistory;
		showVersionHistory = nextOpen;
		if (nextOpen) {
			void ensureAdminAccessChecked();
		}
	}

	function toggleDesktopComments() {
		showComments = !showComments;
	}

	function toggleMobileTab(tab: Exclude<MobileTab, null>) {
		const nextTab = activeMobileTab === tab ? null : tab;
		activeMobileTab = nextTab;
		if (nextTab === 'history') {
			void ensureAdminAccessChecked();
		}
	}

	// Data-driven mobile tab list so the tab bar has one source of truth and can
	// carry proper tablist/roving-tabindex a11y (Hyperplexed T2-3).
	type MobileTabDef = {
		id: Exclude<MobileTab, null>;
		label: string;
		icon: typeof Settings2;
		badge: number;
	};
	const mobileTabs = $derived.by((): MobileTabDef[] => {
		const tabs: MobileTabDef[] = [
			{ id: 'details', label: 'Details', icon: Settings2, badge: 0 }
		];
		if (isEditing && activeDocumentId) {
			tabs.push({ id: 'links', label: 'Links', icon: Link, badge: linkedCount + tagCount });
			tabs.push({ id: 'media', label: 'Media', icon: ImageIcon, badge: 0 });
			tabs.push({ id: 'history', label: 'History', icon: Clock, badge: 0 });
			tabs.push({
				id: 'comments',
				label: 'Comments',
				icon: MessageSquare,
				badge: commentsCount
			});
		}
		return tabs;
	});
	let mobileTabButtons = $state<(HTMLButtonElement | null)[]>([]);

	function selectMobileTab(index: number) {
		const tab = mobileTabs[index];
		if (!tab) return;
		activeMobileTab = tab.id;
		if (tab.id === 'history') {
			void ensureAdminAccessChecked();
		}
	}

	function handleMobileTabKeydown(event: KeyboardEvent, index: number) {
		handleRovingTabKeydown(event, index, mobileTabs.length, selectMobileTab, (target) =>
			mobileTabButtons[target]?.focus()
		);
	}

	// Check admin access for restore permission
	// Since we don't have a dedicated access check endpoint, we'll be optimistic
	// and show the restore button. The API will enforce permissions anyway.
	// For a production implementation, add GET /api/onto/projects/{id}/access endpoint
	async function checkAdminAccess(session: DocumentSession, requestedProjectId: string) {
		if (!requestedProjectId) {
			if (!isCurrentDocumentSession(session)) return;
			isAdminUser = false;
			return;
		}
		try {
			// Try to fetch project details - if user can access, they likely have write access
			// The restore endpoint enforces admin access server-side
			const response = await fetch(`/api/onto/projects/${requestedProjectId}`);
			if (!isCurrentDocumentSession(session)) return;
			if (response.ok) {
				// User has at least read access; show restore button (server will validate)
				// For proper implementation, the project API should return access level
				isAdminUser = true;
			} else {
				isAdminUser = false;
			}
		} catch {
			if (!isCurrentDocumentSession(session)) return;
			isAdminUser = false;
		}
	}

	async function ensureAdminAccessChecked() {
		if (!projectId) {
			isAdminUser = false;
			lastAdminAccessProjectId = null;
			return;
		}
		if (lastAdminAccessProjectId === projectId) return;
		const session = captureDocumentSession();
		const requestedProjectId = projectId;
		lastAdminAccessProjectId = requestedProjectId;
		await checkAdminAccess(session, requestedProjectId);
	}

	// Load document tree for breadcrumb and move functionality
	async function loadDocTree(context?: DocumentLoadContext, parentSignal?: AbortSignal) {
		const requestedProjectId = context?.projectId ?? projectId;
		const requestedDocumentId = context?.documentId ?? activeDocumentId;
		if (!requestedProjectId || !requestedDocumentId) return;

		const requestContext: DocumentLoadContext = context ?? {
			requestId: documentLoadRequestId,
			documentId: requestedDocumentId,
			projectId: requestedProjectId
		};
		if (!isCurrentDocumentView(requestContext) || parentSignal?.aborted) return;

		const loadKey = `${requestedProjectId}:${requestedDocumentId}`;
		const promiseKey = `${loadKey}:${requestContext.requestId}`;
		if (lastDocTreeLoadKey === loadKey && docTreeStructure) return;
		if (docTreeLoadPromise && docTreeLoadPromiseKey === promiseKey) {
			await docTreeLoadPromise;
			return;
		}

		docTreeLoadController?.abort();
		const controller = new AbortController();
		docTreeLoadController = controller;
		const abortFromParent = () => controller.abort();
		parentSignal?.addEventListener('abort', abortFromParent, { once: true });

		const requestPromise = (async () => {
			try {
				treeLoading = true;
				const response = await fetch(
					`/api/onto/projects/${requestedProjectId}/doc-tree?include_content=false`,
					{ signal: controller.signal }
				);
				const payload = await response.json().catch(() => null);

				if (
					response.ok &&
					payload?.data &&
					isCurrentDocumentView(requestContext) &&
					!controller.signal.aborted
				) {
					const treeData = payload.data as GetDocTreeResponse;
					docTreeStructure = treeData.structure;
					docTreeDocuments = treeData.documents;
					lastDocTreeLoadKey = loadKey;
				}
			} catch (error) {
				if (
					!isAbortError(error) &&
					isCurrentDocumentView(requestContext) &&
					!controller.signal.aborted
				) {
					console.error('[DocumentModal] Failed to load doc tree:', error);
				}
			} finally {
				parentSignal?.removeEventListener('abort', abortFromParent);
			}
		})();
		docTreeLoadPromise = requestPromise;
		docTreeLoadPromiseKey = promiseKey;

		try {
			await requestPromise;
		} finally {
			if (docTreeLoadPromise === requestPromise) {
				treeLoading = false;
				docTreeLoadPromise = null;
				docTreeLoadPromiseKey = null;
				if (docTreeLoadController === controller) {
					docTreeLoadController = null;
				}
			}
		}
	}

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
	async function openMoveModal() {
		if (onMoveRequested) {
			onMoveRequested();
		} else {
			if (!activeDocumentId) return;
			const session = captureDocumentSession();
			const requestedDocumentId = activeDocumentId;
			if (!docTreeStructure) {
				await loadDocTree();
				if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
				if (!docTreeStructure) {
					toastService.error('Failed to load document tree');
					return;
				}
			}
			moveModalSession = session;
			showMoveModal = true;
		}
	}

	async function handleMove(newParentId: string | null, session: DocumentSession | null) {
		if (!session || !activeDocumentId || !docTreeStructure) return;
		const requestedDocumentId = activeDocumentId;
		if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;

		try {
			// Move document in tree structure
			const response = await fetch(`/api/onto/projects/${session.projectId}/doc-tree/move`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					document_id: requestedDocumentId,
					new_parent_id: newParentId,
					new_position: 0
				})
			});

			const payload = await response.json().catch(() => null);
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to move document');
			}

			toastService.success('Document moved');
			showMoveModal = false;
			moveModalSession = null;
			// Reload tree to get updated structure
			lastDocTreeLoadKey = null;
			await loadDocTree();
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			onSaved?.();
		} catch (error) {
			if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
			const message = error instanceof Error ? error.message : 'Failed to move document';
			toastService.error(message);
		}
	}

	function closeMoveModal(session: DocumentSession | null) {
		if (!session || !isCurrentDocumentSession(session)) return;
		showMoveModal = false;
		moveModalSession = null;
	}

	// Handle create child
	function handleCreateChild() {
		if (!activeDocumentId) return;

		if (onCreateChildRequested) {
			onCreateChildRequested(activeDocumentId);
		}
	}

	type InsertableAsset = {
		id: string;
		alt_text?: string | null;
		caption?: string | null;
		original_filename?: string | null;
	};

	function toMarkdownAltText(asset: InsertableAsset): string {
		const raw =
			asset.alt_text?.trim() ||
			asset.caption?.trim() ||
			asset.original_filename?.trim() ||
			'image';

		return raw.replace(/\r?\n/g, ' ').replace(/\[/g, '\\[').replace(/\]/g, '\\]').slice(0, 120);
	}

	function openImageInsertModal() {
		imageInsertModalSession = captureDocumentSession();
		showImageInsertModal = true;
	}

	function closeImageInsertModal(session: DocumentSession | null) {
		if (!session || !isCurrentDocumentSession(session)) return;
		showImageInsertModal = false;
		imageInsertModalSession = null;
	}

	async function handleInsertImageAsset(asset: InsertableAsset, session: DocumentSession | null) {
		if (!session || !activeDocumentId || !isCurrentDocumentSession(session)) return;
		const requestedDocumentId = activeDocumentId;
		const editor = markdownEditorRef;
		const alt = toMarkdownAltText(asset);
		const markdown = `![${alt}](/api/onto/assets/${asset.id}/render)`;
		await editor?.insertAtCursor(markdown);
		if (!isCurrentDocumentMutation(session, requestedDocumentId)) return;
		showImageInsertModal = false;
		imageInsertModalSession = null;
	}
</script>

<svelte:window onclick={handleExportMenuWindowClick} onkeydown={handleExportMenuWindowKeydown} />

<!--
	Shared snippets — rendered in both the desktop sidebar and the mobile Details
	tab so the publish panel, metadata, move button, and save status live in one
	place instead of being duplicated markup that must be hand-synced.
-->
{#snippet saveStatusIndicator()}
	{#if isEditing}
		<span class="inline-flex items-center gap-1">
			{#if saveStatus === 'saving'}
				<LoaderCircle class="w-2.5 h-2.5 animate-spin text-muted-foreground" />
				<span class="text-muted-foreground">SAVING</span>
			{:else if saveStatus === 'saved'}
				<Check class="w-2.5 h-2.5 text-success" />
				<span class="text-success">{lastSavePublishedLive ? 'LIVE UPDATED' : 'SAVED'}</span>
			{:else if saveStatus === 'error'}
				<AlertTriangle class="w-2.5 h-2.5 text-destructive" />
				<span class="text-destructive">SAVE FAILED</span>
			{:else if saveStatus === 'conflict'}
				<AlertTriangle class="w-2.5 h-2.5 text-warning" />
				<span class="text-warning">CONFLICT</span>
			{:else if saveStatus === 'dirty'}
				<span class="w-1.5 h-1.5 rounded-full bg-warning shrink-0"></span>
				<span class="text-muted-foreground/50">UNSAVED</span>
			{/if}
		</span>
	{/if}
{/snippet}

{#snippet metadataBlock()}
	<dl class="space-y-1">
		<div class="flex items-center justify-between gap-2">
			<dt class="micro-label text-muted-foreground/70">CREATED</dt>
			<dd class="text-xs font-mono text-foreground">
				{createdAt ? new Date(createdAt).toLocaleDateString() : '—'}
			</dd>
		</div>
		<div class="flex items-center justify-between gap-2">
			<dt class="micro-label text-muted-foreground/70">UPDATED</dt>
			<dd class="text-xs font-mono text-foreground">
				{updatedAt ? new Date(updatedAt).toLocaleDateString() : '—'}
			</dd>
		</div>
		<div class="flex items-start justify-between gap-2">
			<dt class="micro-label text-muted-foreground/70 shrink-0">ID</dt>
			<dd class="text-xs font-mono text-foreground truncate text-right">
				{activeDocumentId}
			</dd>
		</div>
	</dl>
{/snippet}

{#snippet moveButton()}
	<Button
		type="button"
		variant="ghost"
		size="sm"
		onclick={openMoveModal}
		disabled={blockingSave || treeLoading}
		class="w-full text-xs justify-start px-2 h-8 pressable"
		title="Move to another location"
	>
		<FolderInput class="w-3.5 h-3.5" />
		<span class="ml-1">Move to...</span>
	</Button>
{/snippet}

{#snippet publicPagePanel()}
	{#if !publicPageStateLoaded || publicPageLoading}
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<LoaderCircle class="w-3.5 h-3.5 animate-spin" />
			<span>Loading public page state...</span>
		</div>
	{:else if isLiveDocument && publicPageState}
		<div
			class="rounded-md border px-2 py-2 space-y-1.5 tx tx-grain tx-weak wt-paper {liveDocumentNeedsAttention
				? 'border-warning/40 bg-warning/5'
				: 'border-success/40 bg-success/5'}"
		>
			<div class="flex items-start gap-2">
				<Globe
					class="w-3.5 h-3.5 mt-0.5 shrink-0 {liveDocumentNeedsAttention
						? 'text-warning'
						: 'text-success'}"
				/>
				<div class="min-w-0">
					<p
						class="micro-label {liveDocumentNeedsAttention
							? 'text-warning'
							: 'text-success'}"
					>
						{liveDocumentStatusLabel}
					</p>
					<p class="text-xs leading-snug text-muted-foreground">
						{liveDocumentStatusText}
					</p>
				</div>
			</div>
			<div class="text-xs font-mono text-foreground truncate">
				{publicPageUrlPath}
			</div>
			{#if publicPageLastLiveUpdateLabel}
				<div class="flex items-center gap-1 text-xs text-muted-foreground">
					<Clock class="w-3 h-3 shrink-0" />
					<span>Live updated {publicPageLastLiveUpdateLabel}</span>
				</div>
			{/if}
			{#if publicPageState.view_count_all > 0}
				<div
					class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
				>
					<span>
						{publicPageState.view_count_all.toLocaleString()}
						{publicPageState.view_count_all === 1 ? 'view' : 'views'}
					</span>
					{#if publicPageState.view_count_30d > 0}
						<span class="text-muted-foreground/50">·</span>
						<span>{publicPageState.view_count_30d.toLocaleString()} in 30d</span>
					{/if}
				</div>
			{/if}
			<div class="grid grid-cols-2 gap-1.5">
				<button
					type="button"
					onclick={handleCopyPublicPageUrl}
					aria-label="Copy public page link"
					class="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors pressable hover:bg-muted"
				>
					<Link class="w-3 h-3" />
					Copy link
				</button>
				<button
					type="button"
					onclick={openPublicPageInNewTab}
					aria-label="Open public page in new tab"
					class="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors pressable hover:bg-muted"
				>
					Open
					<ExternalLink class="w-3 h-3" />
				</button>
				<button
					type="button"
					onclick={handleMakeDocumentPublic}
					class="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors pressable hover:bg-accent/10"
				>
					{livePageHasUnpublishedChanges ? 'Review changes' : 'Edit settings'}
				</button>
				<button
					type="button"
					onclick={handleUnpublishPublicPage}
					disabled={publicPageActionLoading}
					aria-label="Unpublish public page"
					class="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors pressable disabled:opacity-50"
				>
					Unpublish
				</button>
			</div>
			<label class="flex items-center justify-between gap-2 text-xs text-muted-foreground">
				<span>Live sync on save</span>
				<input
					type="checkbox"
					checked={publicPageState.live_sync_enabled}
					onchange={(event) =>
						handleLiveSyncToggle((event.currentTarget as HTMLInputElement).checked)}
					class="h-3.5 w-3.5 rounded border-border"
				/>
			</label>
			{#if publicPageState.last_live_sync_error}
				<p class="text-xs text-warning leading-snug">
					Last live sync error: {publicPageState.last_live_sync_error}
				</p>
			{/if}
		</div>
	{:else}
		<div class="space-y-1.5">
			{#if publicPageState?.public_status === 'unpublished'}
				<p class="text-xs text-muted-foreground leading-snug">
					Previously published at <span class="font-mono text-foreground"
						>{publicPageUrlPath}</span
					>. Republish to make it live again at the same URL.
				</p>
			{:else if publicPageState?.public_status === 'pending_confirmation'}
				<p class="text-xs text-warning leading-snug">
					Publish in progress — awaiting review. Try again in a moment.
				</p>
			{/if}
			<Button
				type="button"
				variant="outline"
				size="sm"
				onclick={handleMakeDocumentPublic}
				disabled={blockingSave || publicPageActionLoading || isArchivedDocument}
				class="w-full text-xs justify-center"
			>
				<Globe class="w-3.5 h-3.5" />
				<span class="ml-1">
					{#if publicPageState?.public_status === 'unpublished'}
						Republish
					{:else if publicPageState}
						Update Public Page
					{:else}
						Share publicly
					{/if}
				</span>
			</Button>
			{#if publicPageState?.public_status && publicPageState.public_status !== 'not_public' && publicPageState.public_status !== 'unpublished' && publicPageState.public_status !== 'pending_confirmation'}
				<p class="text-xs text-muted-foreground">
					Status: {publicPageState.public_status.replace('_', ' ')}
				</p>
			{/if}
		</div>
	{/if}

	{#if hasFlaggedPublicPageReview && latestPublicPageReview}
		<div
			class="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 space-y-1 tx tx-grain tx-weak wt-paper"
		>
			<p class="micro-label text-destructive">CONTENT REVIEW FLAGGED</p>
			{#if latestPublicPageReview.summary}
				<p class="text-xs text-destructive leading-snug">
					{latestPublicPageReview.summary}
				</p>
			{/if}
			{#if latestPublicPageReviewReasons.length > 0}
				<ul class="space-y-0.5 text-xs text-destructive list-disc pl-4">
					{#each latestPublicPageReviewReasons as reason (reason)}
						<li>{reason}</li>
					{/each}
				</ul>
			{/if}
			{#if latestPublicPageReview.admin_decision}
				<p class="text-xs text-destructive leading-snug">
					Admin decision:
					{latestPublicPageReview.admin_decision === 'approved'
						? 'OK to publish'
						: 'Not okay'}
					{#if latestPublicPageReview.admin_decision_at}
						({formatDate(latestPublicPageReview.admin_decision_at)})
					{/if}
				</p>
			{/if}
			{#if latestPublicPageReview.admin_decision_reason}
				<p class="text-xs text-destructive leading-snug">
					{latestPublicPageReview.admin_decision_reason}
				</p>
			{/if}
			{#if latestPublicPageReviewGuidance}
				<p class="text-xs text-destructive leading-snug">
					{latestPublicPageReviewGuidance}
				</p>
			{/if}
		</div>
	{:else if latestPublicPageReview?.status === 'passed'}
		<p class="text-xs text-muted-foreground">Last content review passed.</p>
	{/if}
{/snippet}

<Modal
	bind:isOpen
	onClose={closeModal}
	onBeforeClose={handleModalBeforeClose}
	size="xl"
	closeOnBackdrop={false}
	closeOnEscape={!blockingSave}
	enableGestures={false}
	showCloseButton={false}
	customClasses="lg:!max-w-6xl xl:!max-w-7xl document-modal-container !max-h-[calc(100dvh-var(--keyboard-height,0px))] !h-[calc(100dvh-var(--keyboard-height,0px))] sm:!h-auto sm:!max-h-[95dvh] !rounded-none sm:!rounded-lg"
>
	{#snippet header()}
		<!-- Compact Inkprint header with strip texture -->
		<div
			class="document-modal-header flex-shrink-0 bg-muted border-b border-border px-2 py-1.5 sm:px-3 sm:py-2 flex items-center justify-between gap-2 tx tx-strip tx-weak wt-paper"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent shrink-0"
				>
					<FileText class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<!-- Breadcrumb path for nested documents -->
					{#if breadcrumbPath.length > 0}
						<div
							class="flex items-center gap-1 text-xs text-muted-foreground mb-0.5 overflow-hidden"
						>
							{#each breadcrumbPath as crumb, i (crumb.id)}
								<span
									class="truncate max-w-[100px] sm:max-w-none"
									title={crumb.title}>{crumb.title}</span
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
					<!-- Use micro-label pattern for metadata + save status (desktop only, mobile shows in content area) -->
					<p
						class="micro-label text-muted-foreground/70 mt-0.5 hidden lg:flex items-center gap-1.5 flex-wrap"
					>
						<span>
							{#if createdAt}CREATED {new Date(createdAt).toLocaleDateString(
									undefined,
									{
										month: 'short',
										day: 'numeric'
									}
								)}{/if}{#if updatedAt && updatedAt !== createdAt}
								· UPDATED {new Date(updatedAt).toLocaleDateString(undefined, {
									month: 'short',
									day: 'numeric'
								})}{/if}
						</span>
						{@render saveStatusIndicator()}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- More actions: copy URL / open page / export — consolidated so the
					 header stays uncrowded, especially on mobile (Hyperplexed T2-2) -->
				<div class="relative" bind:this={exportMenuRef}>
					<button
						bind:this={exportButtonRef}
						type="button"
						onclick={(event) => {
							event.stopPropagation();
							if (!showExportMenu && exportButtonRef) {
								const rect = exportButtonRef.getBoundingClientRect();
								exportMenuPos = {
									top: rect.bottom + 4,
									right: window.innerWidth - rect.right
								};
							}
							showExportMenu = !showExportMenu;
						}}
						disabled={blockingSave || loading || exportingFormat !== null}
						class="flex h-9 w-9 items-center justify-center rounded-md bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak wt-paper"
						title="More actions"
						aria-label="More actions"
						aria-haspopup="menu"
						aria-expanded={showExportMenu}
					>
						<MoreHorizontal class="w-4 h-4" />
					</button>

					{#if showExportMenu}
						<div
							class="fixed z-[10000] w-48 overflow-hidden rounded-lg border border-border bg-card shadow-ink-strong tx tx-frame tx-weak"
							style="top: {exportMenuPos.top}px; right: {exportMenuPos.right}px;"
							role="menu"
							tabindex="-1"
							onclick={(event) => event.stopPropagation()}
							onkeydown={(event) => {
								if (event.key === 'Escape') {
									showExportMenu = false;
								}
							}}
						>
							{#if isEditing && activeDocumentId}
								<button
									type="button"
									onclick={() => {
										showExportMenu = false;
										handleCopyDocumentPageUrl();
									}}
									disabled={blockingSave || loading}
									class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
									role="menuitem"
								>
									<Link class="w-3.5 h-3.5 shrink-0" />
									Copy document URL
								</button>
								<button
									type="button"
									onclick={() => {
										showExportMenu = false;
										handleOpenDocumentPage();
									}}
									disabled={blockingSave || loading}
									class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
									role="menuitem"
								>
									<ExternalLink class="w-3.5 h-3.5 shrink-0" />
									Open document page
								</button>
								<div class="my-1 border-t border-border/60"></div>
							{/if}
							<button
								type="button"
								onclick={() => handleExport('docx')}
								disabled={exportingFormat !== null}
								class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								role="menuitem"
							>
								<Download class="w-3.5 h-3.5 shrink-0" />
								Export as DOCX
							</button>
							<button
								type="button"
								onclick={() => handleExport('html')}
								disabled={exportingFormat !== null}
								class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								role="menuitem"
							>
								<Download class="w-3.5 h-3.5 shrink-0" />
								Export as HTML
							</button>
							<button
								type="button"
								onclick={() => handleExport('pdf')}
								disabled={exportingFormat !== null}
								class="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								role="menuitem"
							>
								<Download class="w-3.5 h-3.5 shrink-0" />
								Export as PDF
							</button>
						</div>
					{/if}
				</div>
				<!-- Chat about this document button -->
				{#if isEditing}
					<button
						type="button"
						onclick={openChatAbout}
						disabled={loading || blockingSave}
						class="flex h-9 w-9 items-center justify-center rounded-md bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak wt-paper"
						title="Chat about this document"
					>
						<img
							src="/brain-bolt.webp"
							alt="Chat"
							class="w-6 h-6 rounded object-cover"
						/>
					</button>
				{/if}
				<!-- Close button -->
				<button
					type="button"
					onclick={requestClose}
					disabled={isCloseBlocked}
					class="flex h-9 w-9 items-center justify-center rounded-md bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-destructive/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak wt-paper"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="flex-1 flex flex-col min-h-0">
			{#if loading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-6 h-6 animate-spin text-muted-foreground" />
				</div>
			{:else}
				<form
					id={documentFormId}
					class="flex-1 flex flex-col min-h-0"
					onsubmit={handleSave}
				>
					<!-- Desktop: Two-column layout (sidebar on the right) | Mobile: content-first with collapsible metadata -->
					<div class="flex flex-col lg:flex-row-reverse flex-1 min-h-0">
						<!-- Right sidebar (metadata + history + activity) - Desktop only, hidden on mobile -->
						<div
							class="hidden lg:flex lg:flex-col lg:w-64 xl:w-72 flex-shrink-0 lg:border-l border-border bg-muted overflow-y-auto tx tx-frame tx-weak"
						>
							<div class="p-3 space-y-3">
								<!-- Settings: Title / Description / State -->
								<div class="space-y-2">
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
											disabled={blockingSave}
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
											disabled={blockingSave}
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
											disabled={blockingSave || isArchivedDocument}
										>
											{#each stateOptions as option (option.value)}
												<option value={option.value}>{option.label}</option>
											{/each}
										</Select>
									</FormField>
								</div>

								{#if isEditing && activeDocumentId}
									<EntityCollaborationAction
										{projectId}
										entityType="document"
										entityId={activeDocumentId}
										entityTitle={title || 'Document'}
										disabled={blockingSave || isArchivedDocument}
									/>
								{/if}

								<!-- Tags + Metadata strip -->
								{#if isEditing}
									<div class="pt-3 border-t border-border space-y-2">
										{#if hasTags}
											<TagsDisplay props={documentProps} />
										{/if}
										{@render metadataBlock()}
									</div>
								{/if}

								<!-- Public Page (collapsible; auto-expands when live) -->
								{#if isEditing && activeDocumentId}
									<div class="pt-3 border-t border-border">
										<button
											type="button"
											onclick={() => (showPublicPage = !showPublicPage)}
											class="w-full flex items-center justify-between px-2 py-1.5 -mx-2 text-left rounded-md hover:bg-card hover:shadow-ink transition-all pressable group"
										>
											<span class="flex items-center gap-2">
												<span class="micro-label text-foreground"
													>PUBLIC PAGE</span
												>
												{#if isLiveDocument}
													<span
														class="inline-flex items-center gap-1 rounded-full px-1.5 h-4 text-[0.6rem] font-semibold {liveDocumentNeedsAttention
															? 'bg-warning/20 text-warning'
															: 'bg-success/20 text-success'}"
													>
														<span
															class="w-1 h-1 rounded-full {liveDocumentNeedsAttention
																? 'bg-warning'
																: 'bg-success'}"
														></span>
														{liveDocumentNeedsAttention
															? 'ATTENTION'
															: 'LIVE'}
													</span>
												{:else if publicPageState?.public_status === 'unpublished'}
													<span
														class="inline-flex items-center rounded-full px-1.5 h-4 text-[0.6rem] font-semibold bg-muted text-muted-foreground"
														>UNPUBLISHED</span
													>
												{/if}
											</span>
											{#if showPublicPage}
												<ChevronUp
													class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
												/>
											{:else}
												<ChevronDown
													class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
												/>
											{/if}
										</button>
										{#if showPublicPage}
											<div class="pt-2 pb-1 space-y-2">
												{@render publicPagePanel()}
											</div>
										{/if}
									</div>
								{/if}

								<!-- Collapsible group: Linked Entities / Images / Version History / Voice Notes / Activity Log -->
								{#if isEditing && activeDocumentId}
									<div class="pt-3 border-t border-border">
										<div class="divide-y divide-border/50">
											<!-- Linked Entities -->
											<div class="py-0.5">
												<button
													type="button"
													onclick={() =>
														(showLinkedEntities = !showLinkedEntities)}
													class="w-full flex items-center justify-between px-2 py-1.5 -mx-2 text-left rounded-md hover:bg-card hover:shadow-ink transition-all pressable group"
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
														<ChevronUp
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{:else}
														<ChevronDown
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{/if}
												</button>
												{#if showLinkedEntities}
													<div class="pt-2 pb-1">
														<LinkedEntities
															sourceId={activeDocumentId}
															sourceKind="document"
															{projectId}
															initialLinkedEntities={linkedEntities}
															onLoaded={handleLinkedEntitiesLoaded}
															onEntityClick={handleLinkedEntityClick}
															onLinksChanged={handleLinksChanged}
														/>
													</div>
												{/if}
											</div>

											<!-- Images -->
											<div class="py-0.5">
												<button
													type="button"
													onclick={() => (showImages = !showImages)}
													class="w-full flex items-center justify-between px-2 py-1.5 -mx-2 text-left rounded-md hover:bg-card hover:shadow-ink transition-all pressable group"
												>
													<span class="micro-label text-foreground"
														>IMAGES</span
													>
													{#if showImages}
														<ChevronUp
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{:else}
														<ChevronDown
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{/if}
												</button>
												{#if showImages}
													<div class="pt-2 pb-1">
														<ImageAssetsPanel
															{projectId}
															entityKind="document"
															entityId={activeDocumentId}
															showTitle={false}
															compact={true}
															onChanged={() => onSaved?.()}
														/>
													</div>
												{/if}
											</div>

											<!-- Version History -->
											<div class="py-0.5">
												<button
													type="button"
													onclick={toggleVersionHistory}
													class="w-full flex items-center justify-between px-2 py-1.5 -mx-2 text-left rounded-md hover:bg-card hover:shadow-ink transition-all pressable group"
												>
													<span class="micro-label text-foreground"
														>VERSION HISTORY</span
													>
													{#if showVersionHistory}
														<ChevronUp
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{:else}
														<ChevronDown
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{/if}
												</button>
												{#if showVersionHistory}
													<div class="pt-2 pb-1">
														<DocumentVersionHistoryPanel
															bind:this={versionHistoryPanelRef}
															documentId={activeDocumentId}
															{projectId}
															isAdmin={isAdminUser}
															onRestoreRequested={handleRestoreRequested}
															onCompareRequested={handleEnterComparison}
														/>
													</div>
												{/if}
											</div>

											<!-- Voice Notes -->
											<div class="py-0.5">
												<button
													type="button"
													onclick={() =>
														(showVoiceNotes = !showVoiceNotes)}
													class="w-full flex items-center justify-between px-2 py-1.5 -mx-2 text-left rounded-md hover:bg-card hover:shadow-ink transition-all pressable group"
												>
													<span class="micro-label text-foreground"
														>VOICE NOTES</span
													>
													{#if showVoiceNotes}
														<ChevronUp
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{:else}
														<ChevronDown
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{/if}
												</button>
												{#if showVoiceNotes}
													<div class="pt-2 pb-1">
														<DocumentVoiceNotesPanel
															bind:this={voiceNotesPanelRef}
															documentId={activeDocumentId}
															{projectId}
															limit={20}
														/>
													</div>
												{/if}
											</div>

											<!-- Activity Log -->
											<div class="py-0.5">
												<button
													type="button"
													onclick={() =>
														(showActivityLog = !showActivityLog)}
													class="w-full flex items-center justify-between px-2 py-1.5 -mx-2 text-left rounded-md hover:bg-card hover:shadow-ink transition-all pressable group"
												>
													<span class="micro-label text-foreground"
														>ACTIVITY LOG</span
													>
													{#if showActivityLog}
														<ChevronUp
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{:else}
														<ChevronDown
															class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
														/>
													{/if}
												</button>
												{#if showActivityLog}
													<div class="pt-2 pb-1">
														<EntityActivityLog
															entityType="document"
															entityId={activeDocumentId}
															autoLoad={!loading}
															embedded={true}
														/>
													</div>
												{/if}
											</div>
										</div>
									</div>

									<!-- Move to... button -->
									{#if !isArchivedDocument}
										<div class="pt-3 border-t border-border">
											{@render moveButton()}
										</div>
									{/if}
								{/if}
							</div>
						</div>

						<!-- Main content area -->
						<div class="flex-1 flex flex-col min-w-0 min-h-0">
							{#if comparisonMode && activeDocumentId}
								<!-- Comparison view replaces the editor -->
								<DocumentComparisonView
									documentId={activeDocumentId}
									{projectId}
									fromVersionNumber={comparisonFromVersion}
									toVersionNumber={comparisonToVersion}
									currentDocument={{
										title,
										description,
										content: body,
										state_key: stateKey
									}}
									latestVersionNumber={comparisonLatestVersion}
									onExit={handleExitComparison}
									onNavigate={handleComparisonNavigate}
								/>
							{:else}
								<!-- Content editor - the main focus -->
								<div class="px-3 pt-1.5 pb-1 flex-1 flex flex-col min-h-0">
									<div class="lg:hidden mb-1.5 shrink-0 space-y-1">
										<label
											for="document-title-mobile-inline"
											class="micro-label text-muted-foreground/70"
										>
											TITLE
										</label>
										<TextInput
											id="document-title-mobile-inline"
											bind:value={title}
											required
											placeholder="Document title"
											aria-label="Document title"
											class="text-base font-semibold"
											disabled={blockingSave}
										/>
										{#if titleFieldError}
											<p class="text-xs text-destructive">
												{titleFieldError}
											</p>
										{/if}
									</div>
									<div
										class="flex items-center justify-between gap-2 mb-1.5 shrink-0"
									>
										<h4 class="micro-label text-foreground">CONTENT</h4>
										<!-- Mobile/tablet: date + save status next to content label -->
										<p
											class="micro-label text-muted-foreground/70 lg:hidden flex items-center gap-1.5"
										>
											{#if updatedAt && updatedAt !== createdAt}
												<span
													>UPDATED {new Date(
														updatedAt
													).toLocaleDateString(undefined, {
														month: 'short',
														day: 'numeric'
													})}</span
												>
											{:else if createdAt}
												<span
													>CREATED {new Date(
														createdAt
													).toLocaleDateString(undefined, {
														month: 'short',
														day: 'numeric'
													})}</span
												>
											{/if}
											{@render saveStatusIndicator()}
										</p>
									</div>
									<div class="flex-1 min-h-0 flex flex-col">
										<RichMarkdownEditor
											bind:this={markdownEditorRef}
											bind:value={body}
											onSave={handleSave}
											maxLength={50000}
											helpText=""
											fillHeight={true}
											bind:isRecording={editorIsRecording}
											bind:isTranscribing={editorIsTranscribing}
											onInsertImageRequested={openImageInsertModal}
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
							{/if}

							<!-- Mobile: Tabbed bottom panel -->
							<div
								class="lg:hidden flex-shrink-0 border-t border-border bg-muted tx tx-strip tx-weak wt-paper"
							>
								<!-- Tab bar - always visible; a scroll-edge fade signals the
									 tabs run past the viewport (Hyperplexed T2-3) -->
								<div class="relative">
									<div
										role="tablist"
										aria-label="Document panels"
										class="flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-hide"
									>
										{#each mobileTabs as tab, i (tab.id)}
											{@const Icon = tab.icon}
											<button
												bind:this={mobileTabButtons[i]}
												type="button"
												role="tab"
												id={`mobile-doc-tab-${tab.id}`}
												aria-selected={activeMobileTab === tab.id}
												tabindex={activeMobileTab === tab.id ||
												(activeMobileTab === null && i === 0)
													? 0
													: -1}
												onclick={() => toggleMobileTab(tab.id)}
												onkeydown={(event) =>
													handleMobileTabKeydown(event, i)}
												class="inline-flex min-h-[36px] items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all pressable {activeMobileTab ===
												tab.id
													? 'bg-card shadow-ink text-foreground'
													: 'text-muted-foreground hover:text-foreground hover:bg-card/50'}"
											>
												<Icon class="w-3.5 h-3.5 shrink-0" />
												{tab.label}
												{#if tab.badge > 0}
													<span
														class="inline-flex items-center justify-center min-w-[1rem] h-3.5 px-1 text-[0.55rem] font-bold bg-accent/20 text-accent rounded-full"
													>
														{tab.badge}
													</span>
												{/if}
											</button>
										{/each}
									</div>
									<div
										aria-hidden="true"
										class="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-muted to-transparent"
									></div>
								</div>

								<!-- Tab content panel -->
								{#if activeMobileTab}
									<div
										role="tabpanel"
										aria-labelledby={`mobile-doc-tab-${activeMobileTab}`}
										class="max-h-[40vh] overflow-y-auto border-t border-border/50 p-2.5 space-y-2 tx tx-frame tx-weak"
									>
										<!-- Details tab content -->
										{#if activeMobileTab === 'details'}
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
													disabled={blockingSave}
													size="sm"
												/>
											</FormField>

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
													disabled={blockingSave || isArchivedDocument}
												>
													{#each stateOptions as option (option.value)}
														<option value={option.value}
															>{option.label}</option
														>
													{/each}
												</Select>
											</FormField>

											{#if isEditing && activeDocumentId}
												<EntityCollaborationAction
													{projectId}
													entityType="document"
													entityId={activeDocumentId}
													entityTitle={title || 'Document'}
													disabled={blockingSave || isArchivedDocument}
												/>
											{/if}

											{#if isEditing && activeDocumentId}
												<div class="pt-2 border-t border-border space-y-2">
													{@render publicPagePanel()}
												</div>
											{/if}

											{#if isEditing}
												<div class="pt-2 border-t border-border">
													{@render metadataBlock()}
												</div>

												<!-- Move to... button -->
												{#if !isArchivedDocument}
													<div class="pt-2 border-t border-border">
														{@render moveButton()}
													</div>
												{/if}
											{/if}

											<!-- Links tab content -->
										{:else if activeMobileTab === 'links'}
											{#if isEditing && activeDocumentId}
												<LinkedEntities
													sourceId={activeDocumentId}
													sourceKind="document"
													{projectId}
													initialLinkedEntities={linkedEntities}
													onLoaded={handleLinkedEntitiesLoaded}
													onEntityClick={handleLinkedEntityClick}
													onLinksChanged={handleLinksChanged}
												/>
											{/if}

											{#if isEditing && hasTags}
												<div class="pt-2 border-t border-border">
													<TagsDisplay props={documentProps} />
												</div>
											{/if}

											<!-- Media tab content -->
										{:else if activeMobileTab === 'media'}
											{#if isEditing && activeDocumentId}
												<ImageAssetsPanel
													{projectId}
													entityKind="document"
													entityId={activeDocumentId}
													title="Images"
													compact={true}
													onChanged={() => onSaved?.()}
												/>

												<div class="pt-2 border-t border-border">
													<DocumentVoiceNotesPanel
														bind:this={voiceNotesPanelMobileRef}
														documentId={activeDocumentId}
														{projectId}
														limit={10}
													/>
												</div>
											{/if}

											<!-- History tab content -->
										{:else if activeMobileTab === 'history'}
											{#if isEditing && activeDocumentId}
												<DocumentVersionHistoryPanel
													documentId={activeDocumentId}
													{projectId}
													isAdmin={isAdminUser}
													onRestoreRequested={handleRestoreRequested}
													onCompareRequested={handleEnterComparison}
												/>

												<div class="pt-2 border-t border-border">
													<EntityActivityLog
														entityType="document"
														entityId={activeDocumentId}
														autoLoad={!loading}
													/>
												</div>
											{/if}

											<!-- Comments tab content -->
										{:else if activeMobileTab === 'comments'}
											{#if activeDocumentId}
												<EntityCommentsSection
													{projectId}
													entityType="document"
													entityId={activeDocumentId}
													onCountChange={handleCommentsCountChange}
												/>
											{/if}
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>

					{#if saveStatus === 'conflict'}
						<div
							class="mx-3 mb-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg tx tx-static tx-weak"
						>
							<div class="flex items-center gap-2 flex-1 min-w-0">
								<AlertTriangle class="w-4 h-4 text-warning shrink-0" />
								<span class="text-sm text-warning">
									This document was modified by someone else.
								</span>
							</div>
							<div class="flex items-center gap-2 shrink-0">
								<button
									type="button"
									onclick={handleConflictReload}
									class="text-xs font-medium px-2.5 py-1 rounded-md bg-warning/15 text-warning hover:bg-warning/25 transition-colors pressable"
								>
									Reload latest
								</button>
								<button
									type="button"
									onclick={handleConflictOverwrite}
									class="text-xs font-medium px-2.5 py-1 rounded-md bg-card border border-border text-foreground hover:bg-muted transition-colors pressable"
								>
									Overwrite
								</button>
							</div>
						</div>
					{/if}

					{#if globalFormError}
						<div
							class="mx-3 mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 tx tx-static tx-weak wt-card"
						>
							<span class="text-sm text-destructive">{globalFormError}</span>
						</div>
					{/if}
				</form>

				{#if activeDocumentId}
					<!-- Comments section: visible on desktop, hidden on mobile (handled by tab bar) -->
					<div class="hidden lg:block flex-shrink-0 border-t border-border">
						<!-- Collapsible comments toggle -->
						<button
							type="button"
							onclick={toggleDesktopComments}
							class="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors pressable group"
						>
							<span class="flex items-center gap-2">
								<MessageSquare
									class="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors"
								/>
								<span class="micro-label text-foreground">COMMENTS</span>
								{#if commentsCount > 0}
									<span
										class="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 text-[0.6rem] font-semibold bg-accent/20 text-accent rounded-full"
									>
										{commentsCount}
									</span>
								{/if}
							</span>
							{#if showComments}
								<ChevronDown
									class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
								/>
							{:else}
								<ChevronRight
									class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors"
								/>
							{/if}
						</button>
						{#if showComments}
							<div
								class="max-h-[25vh] overflow-hidden transition-[max-height] duration-200"
							>
								<div class="overflow-y-auto" style:max-height="25vh">
									<EntityCommentsSection
										{projectId}
										entityType="document"
										entityId={activeDocumentId}
										onCountChange={handleCommentsCountChange}
									/>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div
			class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-t border-border bg-muted/50 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 flex-wrap">
				{#if activeDocumentId}
					{#if isArchivedDocument}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={handleRestore}
							disabled={restoring || blockingSave}
							class="text-xs px-2 h-8 pressable"
						>
							<RotateCcw class="w-3.5 h-3.5" />
							<span class="hidden sm:inline ml-1">Restore</span>
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => (permanentDeleteModalOpen = true)}
							class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-8 pressable"
						>
							<Trash2 class="w-3.5 h-3.5" />
							<span class="hidden sm:inline ml-1">Delete Permanently</span>
						</Button>
					{:else}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => (archiveModalOpen = true)}
							class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-8 pressable"
						>
							<Archive class="w-3.5 h-3.5" />
							<span class="hidden sm:inline ml-1">Archive</span>
						</Button>
						<!-- Create Child button -->
						{#if onCreateChildRequested}
							<div class="w-px h-5 bg-border mx-0.5" aria-hidden="true"></div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onclick={handleCreateChild}
								disabled={blockingSave}
								class="text-xs px-2 h-8 pressable"
								title="Create child document"
							>
								<FilePlus class="w-3.5 h-3.5" />
								<span class="hidden sm:inline ml-1">Add Child</span>
							</Button>
						{/if}
					{/if}
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={requestClose}
					disabled={isCloseBlocked}
					class="hidden sm:inline-flex text-xs h-8 pressable"
				>
					Cancel
				</Button>
				<Button
					type="submit"
					form={documentFormId}
					variant="primary"
					size="sm"
					loading={blockingSave}
					disabled={saving || !title.trim() || isArchivedDocument}
					class="text-xs h-8 pressable tx tx-grain tx-weak wt-card"
				>
					<Save class="w-3.5 h-3.5" />
					<span class="ml-1">{isEditing ? 'Save' : 'Create'}</span>
				</Button>
			</div>
		</div>
	{/snippet}
</Modal>

{#if activeDocumentId}
	<DocDeleteConfirmModal
		isOpen={archiveModalOpen}
		documentTitle={title || 'Untitled'}
		hasChildren={archiveHasChildren}
		childCount={archiveChildCount}
		onClose={() => (archiveModalOpen = false)}
		onDelete={handleArchive}
	/>
{/if}

<ConfirmationModal
	isOpen={permanentDeleteModalOpen}
	title="Delete archived document"
	confirmText="Delete permanently"
	confirmVariant="danger"
	loading={deleting}
	loadingText="Deleting..."
	icon="danger"
	onconfirm={handleDelete}
	oncancel={() => (permanentDeleteModalOpen = false)}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			This permanently removes the archived document and its version history. This cannot be
			undone.
		</p>
	{/snippet}
</ConfirmationModal>

<ConfirmationModal
	isOpen={discardChangesModalOpen}
	title="Discard changes?"
	confirmText="Discard changes"
	confirmVariant="danger"
	onconfirm={handleDiscardChangesConfirm}
	oncancel={handleDiscardChangesCancel}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			{#if isEditing}
				You have unsaved document changes. Closing now will discard them.
			{:else}
				This draft has not been created yet. Closing now will discard it.
			{/if}
		</p>
	{/snippet}
</ConfirmationModal>

{#if activeDocumentId}
	{@const modalSession = imageInsertModalSession}
	<Modal
		bind:isOpen={showImageInsertModal}
		title="Insert Image"
		size="lg"
		onClose={() => closeImageInsertModal(modalSession)}
	>
		{#snippet children()}
			<div class="p-3">
				<p class="text-xs text-muted-foreground mb-2">
					Choose a project image or upload a new one. It will be inserted as inline
					markdown.
				</p>
				<ImageAssetsPanel
					{projectId}
					entityKind="document"
					entityId={activeDocumentId}
					showTitle={false}
					pickerMode={true}
					filterScope="project"
					linkRole="inline"
					selectLabel="Insert"
					onSelectAsset={(asset) => handleInsertImageAsset(asset, modalSession)}
				/>
			</div>
		{/snippet}
	</Modal>
{/if}

{#if activeDocumentId && publicPageDraft && publicPagePreview}
	{@const draft = publicPageDraft}
	{@const preview = publicPagePreview}
	<Modal
		bind:isOpen={showPublicPageConfirmModal}
		size="xl"
		title={publicPageState ? 'Update Public Page' : 'Confirm Public Page'}
		onClose={closePublicPageConfirmModal}
		closeOnEscape={!publicPageActionLoading}
		closeOnBackdrop={!publicPageActionLoading}
	>
		{#snippet children()}
			<div class="p-3 space-y-3">
				<p class="text-xs text-muted-foreground">
					Review this preview, then confirm to publish. A content review will run on
					publish.
				</p>
				{#if hasFlaggedPublicPageReview && latestPublicPageReview}
					<div
						class="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 space-y-1 tx tx-grain tx-weak wt-paper"
					>
						<p class="micro-label text-destructive">LAST REVIEW WAS FLAGGED</p>
						{#if latestPublicPageReview.summary}
							<p class="text-xs text-destructive leading-snug">
								{latestPublicPageReview.summary}
							</p>
						{/if}
						{#if latestPublicPageReviewReasons.length > 0}
							<ul class="space-y-0.5 text-xs text-destructive list-disc pl-4">
								{#each latestPublicPageReviewReasons as reason (reason)}
									<li>{reason}</li>
								{/each}
							</ul>
						{/if}
						{#if latestPublicPageReview.admin_decision}
							<p class="text-xs text-destructive leading-snug">
								Admin decision:
								{latestPublicPageReview.admin_decision === 'approved'
									? 'OK to publish'
									: 'Not okay'}
								{#if latestPublicPageReview.admin_decision_at}
									({formatDate(latestPublicPageReview.admin_decision_at)})
								{/if}
							</p>
						{/if}
						{#if latestPublicPageReview.admin_decision_reason}
							<p class="text-xs text-destructive leading-snug">
								{latestPublicPageReview.admin_decision_reason}
							</p>
						{/if}
						{#if latestPublicPageReviewGuidance}
							<p class="text-xs text-destructive leading-snug">
								{latestPublicPageReviewGuidance}
							</p>
						{/if}
					</div>
				{/if}

				<div class="grid gap-2 sm:grid-cols-2">
					<FormField
						label="Public URL"
						labelFor="public-page-slug-base"
						uppercase={false}
					>
						<div class="space-y-2">
							<div class="flex items-center gap-2">
								<span class="text-xs text-muted-foreground shrink-0">/p/</span>
								{#if draft.slug_prefix}
									<span
										class="inline-flex items-center rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono text-foreground"
									>
										{draft.slug_prefix}
									</span>
									<span class="text-xs text-muted-foreground shrink-0">-</span>
								{/if}
								<TextInput
									id="public-page-slug-base"
									value={draft.slug_base}
									oninput={(event) =>
										updatePublicPageDraft({
											slug_base: (event.currentTarget as HTMLInputElement)
												.value
										})}
									placeholder="page"
									disabled={publicPageActionLoading}
								/>
							</div>
							<p class="text-xs text-muted-foreground">
								The prefix is frozen from the publishing account name.
							</p>
							{#if publicPageSlugBaseHelperText}
								<p class="text-xs text-muted-foreground">
									{publicPageSlugBaseHelperText}
								</p>
							{/if}
							{#if preview.slug_was_deduped}
								<p class="text-xs text-muted-foreground">
									This page already needed a unique suffix, so the next available
									URL was suggested.
								</p>
							{/if}
						</div>
					</FormField>

					<FormField label="Public title" labelFor="public-page-title" uppercase={false}>
						<TextInput
							id="public-page-title"
							value={draft.title}
							oninput={(event) =>
								updatePublicPageDraft({
									title: (event.currentTarget as HTMLInputElement).value
								})}
							placeholder="Public page title"
							disabled={publicPageActionLoading}
						/>
					</FormField>

					<div class="sm:col-span-2">
						<FormField label="Summary" labelFor="public-page-summary" uppercase={false}>
							<Textarea
								id="public-page-summary"
								value={draft.summary}
								oninput={(event) =>
									updatePublicPageDraft({
										summary: (event.currentTarget as HTMLTextAreaElement).value
									})}
								rows={2}
								placeholder="Short summary for the public page"
								disabled={publicPageActionLoading}
								size="sm"
							/>
						</FormField>
					</div>

					<FormField
						label="Visibility"
						labelFor="public-page-visibility"
						uppercase={false}
					>
						<Select
							id="public-page-visibility"
							value={draft.visibility}
							onchange={(value) =>
								updatePublicPageDraft({
									visibility: value as PublicPageDraft['visibility']
								})}
							size="sm"
							class="w-full text-xs"
							disabled={publicPageActionLoading}
						>
							<option value="public">Public</option>
							<option value="unlisted">Unlisted</option>
						</Select>
					</FormField>

					<div class="space-y-1.5 self-end pb-0.5">
						<label class="flex items-center gap-2 text-xs text-foreground">
							<input
								type="checkbox"
								checked={draft.noindex}
								onchange={(event) =>
									updatePublicPageDraft({
										noindex: (event.currentTarget as HTMLInputElement).checked
									})}
								class="h-3.5 w-3.5 rounded border-border"
								disabled={publicPageActionLoading}
							/>
							<span>Hide from search engines (`noindex`)</span>
						</label>
						<label class="flex items-center gap-2 text-xs text-foreground">
							<input
								type="checkbox"
								checked={draft.live_sync_enabled}
								onchange={(event) =>
									updatePublicPageDraft({
										live_sync_enabled: (event.currentTarget as HTMLInputElement)
											.checked
									})}
								class="h-3.5 w-3.5 rounded border-border"
								disabled={publicPageActionLoading}
							/>
							<span>Enable live sync on document save</span>
						</label>
					</div>
				</div>

				<div class="rounded-lg border border-border overflow-hidden">
					<div
						class="px-3 py-2 border-b border-border bg-muted/60 flex items-center justify-between gap-2"
					>
						<span class="micro-label text-foreground">PUBLIC PREVIEW</span>
						<span class="text-xs text-muted-foreground truncate">
							{publicPageDraftUrlPreview ??
								(preview.slug_prefix && preview.slug_base
									? `https://build-os.com/p/${preview.slug_prefix}/${preview.slug_base}`
									: `https://build-os.com/p/${preview.slug}`)}
						</span>
					</div>
					<div class="p-3 max-h-[50vh] overflow-y-auto space-y-2">
						<div>
							<h3 class="text-lg font-semibold text-foreground">
								{draft.title.trim() || preview.title}
							</h3>
							{#if draft.summary.trim()}
								<p class="mt-1 text-sm text-muted-foreground">
									{draft.summary.trim()}
								</p>
							{/if}
						</div>
						<article class={getProseClasses('base')}>
							{@html renderMarkdown(preview.content)}
						</article>
					</div>
				</div>
			</div>
		{/snippet}
		{#snippet footer()}
			<div
				class="px-3 sm:px-4 py-3 border-t border-border bg-muted/50 flex justify-end gap-2"
			>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={closePublicPageConfirmModal}
					disabled={publicPageActionLoading}
					class="text-xs"
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="primary"
					size="sm"
					onclick={handleConfirmPublicPage}
					loading={publicPageActionLoading}
					disabled={publicPageActionLoading}
					class="text-xs"
				>
					{publicPageState ? 'Confirm Changes' : 'Confirm and Publish'}
				</Button>
			</div>
		{/snippet}
	</Modal>
{/if}

<!-- Linked Entity Modals -->
{#if showTaskModal && selectedTaskIdForModal && TaskEditModalComponent}
	{@const TaskModal = TaskEditModalComponent}
	{@const modalSession = linkedEntityModalSession}
	<TaskModal
		taskId={selectedTaskIdForModal}
		{projectId}
		onClose={() => closeLinkedEntityModals(modalSession)}
		onUpdated={() => closeLinkedEntityModals(modalSession)}
		onDeleted={() => closeLinkedEntityModals(modalSession)}
	/>
{/if}

{#if showPlanModal && selectedPlanIdForModal && PlanEditModalComponent}
	{@const PlanModal = PlanEditModalComponent}
	{@const modalSession = linkedEntityModalSession}
	<PlanModal
		planId={selectedPlanIdForModal}
		{projectId}
		onClose={() => closeLinkedEntityModals(modalSession)}
		onUpdated={() => closeLinkedEntityModals(modalSession)}
		onDeleted={() => closeLinkedEntityModals(modalSession)}
	/>
{/if}

{#if showGoalModal && selectedGoalIdForModal && GoalEditModalComponent}
	{@const GoalModal = GoalEditModalComponent}
	{@const modalSession = linkedEntityModalSession}
	<GoalModal
		goalId={selectedGoalIdForModal}
		{projectId}
		onClose={() => closeLinkedEntityModals(modalSession)}
		onUpdated={() => closeLinkedEntityModals(modalSession)}
		onDeleted={() => closeLinkedEntityModals(modalSession)}
	/>
{/if}

{#if showDocumentModal && selectedDocumentIdForModal && DocumentModalComponent}
	{@const NestedDocumentModal = DocumentModalComponent}
	{@const modalSession = linkedEntityModalSession}
	<NestedDocumentModal
		{projectId}
		documentId={selectedDocumentIdForModal}
		bind:isOpen={showDocumentModal}
		onClose={() => closeLinkedEntityModals(modalSession)}
		onSaved={() => closeLinkedEntityModals(modalSession)}
		onDeleted={() => closeLinkedEntityModals(modalSession)}
	/>
{/if}

<!-- Version Restore Modal -->
{#if showRestoreModal && selectedVersionForRestore && activeDocumentId}
	{@const modalSession = restoreModalSession}
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
		onClose={() => handleRestoreModalClose(modalSession)}
		onRestored={() => handleVersionRestored(modalSession)}
	/>
{/if}

<!-- Chat About Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	{@const ChatModal = AgentChatModalComponent}
	{@const modalSession = chatModalSession}
	<ChatModal
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={() => handleChatClose(modalSession)}
	/>
{/if}

<!-- Move Document Modal -->
{#if showMoveModal && activeDocumentId && docTreeStructure}
	{@const modalSession = moveModalSession}
	<DocMoveModal
		bind:isOpen={showMoveModal}
		{projectId}
		documentId={activeDocumentId}
		documentTitle={title || 'Untitled'}
		structure={docTreeStructure}
		documents={docTreeDocuments}
		onClose={() => closeMoveModal(modalSession)}
		onMove={(newParentId) => handleMove(newParentId, modalSession)}
	/>
{/if}

<style>
	/*
	 * Force the Modal's modal-content slot to be a flex container
	 * so the document editor fills available height and scrolls internally.
	 * This keeps the voice record button always visible at the bottom of the editor.
	 */
	:global(.document-modal-container .modal-content) {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		flex: 1;
		min-height: 0;
	}

	/* Mobile: allow modal-content to scroll as a fallback so content is
	   always accessible, even if the nested flex fill-height chain breaks. */
	@media (max-width: 1023px) {
		:global(.document-modal-container .modal-content) {
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}
	}

	@media (max-width: 639px) {
		:global(.document-modal-container .document-modal-header) {
			padding-top: max(0.375rem, env(safe-area-inset-top, 0px));
		}
	}
</style>
