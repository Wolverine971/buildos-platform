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
	import ImageAssetsPanel from './ImageAssetsPanel.svelte';
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
	import TaskEditModal from './TaskEditModal.svelte';
	import PlanEditModal from './PlanEditModal.svelte';
	import GoalEditModal from './GoalEditModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import { DOCUMENT_STATES } from '$lib/types/onto';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { getProseClasses, renderMarkdown } from '$lib/utils/markdown';
	import {
		exportDocumentAsDocx,
		exportDocumentAsHtml,
		exportDocumentAsPdf,
		type DocumentExportFormat,
		type DocumentExportPayload
	} from '$lib/utils/document-export';
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
		Clock
	} from 'lucide-svelte';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import { untrack, type Component } from 'svelte';

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
	let blockingSave = $state(false);
	let archiving = $state(false);
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
		last_live_sync_at: string | null;
		last_live_sync_error: string | null;
		is_live_public: boolean;
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
	const publicPageAbsoluteUrl = $derived.by(() =>
		publicPageUrlPath ? `https://build-os.com${publicPageUrlPath}` : null
	);
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
	type MobileTab = 'details' | 'links' | 'media' | 'history' | 'comments' | null;
	let activeMobileTab = $state<MobileTab>(null);
	let showImageInsertModal = $state(false);
	let exportingFormat = $state<DocumentExportFormat | null>(null);
	let showExportMenu = $state(false);
	let exportMenuRef = $state<HTMLDivElement | null>(null);
	let exportButtonRef = $state<HTMLButtonElement | null>(null);
	let exportMenuPos = $state({ top: 0, right: 0 });

	// Left panel collapsible sections
	let showLinkedEntities = $state(true);
	let showImages = $state(true);
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
			last_live_sync_at:
				typeof row.last_live_sync_at === 'string' ? row.last_live_sync_at : null,
			last_live_sync_error:
				typeof row.last_live_sync_error === 'string' ? row.last_live_sync_error : null,
			is_live_public: row.is_live_public === true
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

	async function loadPublicPageState(documentId: string) {
		try {
			publicPageLoading = true;
			const response = await fetch(`/api/onto/documents/${documentId}/public-page`);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to load public page state');
			}
			publicPageState = normalizePublicPageState(payload?.data?.publicPage);
			latestPublicPageReview = normalizePublicPageReview(payload?.data?.latestReview);
		} catch (error) {
			publicPageState = null;
			latestPublicPageReview = null;
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${documentId}/public-page`,
				method: 'GET',
				projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'document_public_page_state_load'
			});
		} finally {
			publicPageLoading = false;
		}
	}

	async function handleMakeDocumentPublic() {
		if (!activeDocumentId || blockingSave || loading) return;
		if (!validateForm()) return;

		if (hasUnsavedChanges) {
			const saved = await performSave({
				silent: true,
				forceVersion: true,
				blockingUi: true
			});
			if (!saved) {
				toastService.error('Save failed. Resolve issues before publishing.');
				return;
			}
		}

		try {
			publicPageActionLoading = true;
			const response = await fetch(
				`/api/onto/documents/${activeDocumentId}/public-page/prepare`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						slug_base: publicPageState?.slug_base ?? title.trim(),
						title: title.trim() || null,
						summary: description.trim() || null,
						visibility: publicPageState?.visibility ?? 'public',
						noindex: publicPageState?.noindex ?? false,
						live_sync_enabled: publicPageState?.live_sync_enabled ?? true
					})
				}
			);
			const payload = await response.json().catch(() => null);
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
			const message =
				error instanceof Error ? error.message : 'Failed to prepare public page';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${activeDocumentId}/public-page/prepare`,
				method: 'POST',
				projectId,
				entityType: 'document',
				entityId: activeDocumentId,
				operation: 'document_public_page_prepare'
			});
			toastService.error(message);
		} finally {
			publicPageActionLoading = false;
		}
	}

	async function handleConfirmPublicPage() {
		if (!activeDocumentId || !publicPageDraft) return;
		const slugBase = publicPageDraft.slug_base.trim();

		try {
			publicPageActionLoading = true;
			const response = await fetch(
				`/api/onto/documents/${activeDocumentId}/public-page/confirm`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						slug_base: slugBase || null,
						title: publicPageDraft.title.trim() || null,
						summary: publicPageDraft.summary.trim() || null,
						visibility: publicPageDraft.visibility,
						noindex: publicPageDraft.noindex,
						live_sync_enabled: publicPageDraft.live_sync_enabled
					})
				}
			);
			const payload = await response.json().catch(() => null);
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
						...publicPageDraft,
						slug_base: suggestedSlugBase
					};
					if (publicPagePreview && suggestedSlug) {
						publicPagePreview = {
							...publicPagePreview,
							slug: suggestedSlug,
							slug_base: suggestedSlugBase,
							slug_was_deduped: true,
							url_path:
								publicPageDraft?.slug_prefix && suggestedSlugBase
									? `/p/${publicPageDraft.slug_prefix}/${suggestedSlugBase}`
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
			const message =
				error instanceof Error ? error.message : 'Failed to publish public page';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${activeDocumentId}/public-page/confirm`,
				method: 'POST',
				projectId,
				entityType: 'document',
				entityId: activeDocumentId,
				operation: 'document_public_page_confirm'
			});
			toastService.error(message);
		} finally {
			publicPageActionLoading = false;
		}
	}

	async function handleLiveSyncToggle(nextEnabled: boolean) {
		if (!activeDocumentId || !publicPageState) return;

		const previousState = publicPageState;
		publicPageState = {
			...publicPageState,
			live_sync_enabled: nextEnabled
		};

		try {
			const response = await fetch(
				`/api/onto/documents/${activeDocumentId}/public-page/live-sync`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						live_sync_enabled: nextEnabled
					})
				}
			);
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to update live sync');
			}

			const updated = normalizePublicPageState(payload?.data?.publicPage);
			if (updated) {
				publicPageState = updated;
			}
			toastService.success(nextEnabled ? 'Live sync enabled' : 'Live sync paused');
		} catch (error) {
			publicPageState = previousState;
			const message = error instanceof Error ? error.message : 'Failed to update live sync';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${activeDocumentId}/public-page/live-sync`,
				method: 'POST',
				projectId,
				entityType: 'document',
				entityId: activeDocumentId,
				operation: 'document_public_page_live_sync_toggle'
			});
			toastService.error(message);
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
		// Reset autosave state
		lastSavedSnapshot = null;
		serverUpdatedAt = null;
		saveStatus = 'idle';
		lastSavePublishedLive = false;
		clearAutosaveTimers();
		// Reset comments panel
		showComments = false;
		commentsCount = 0;
		showImageInsertModal = false;
		publicPageState = null;
		publicPageLoading = false;
		publicPageActionLoading = false;
		showPublicPageConfirmModal = false;
		publicPagePreview = null;
		publicPageDraft = null;
		latestPublicPageReview = null;
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

			// Track server state for autosave and conflict detection
			serverUpdatedAt = document.updated_at ?? null;
			captureSnapshot();
			saveStatus = 'idle';
			lastSavePublishedLive = false;
			void loadPublicPageState(id);
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
			publicPageState = null;
			latestPublicPageReview = null;
		} finally {
			loading = false;
		}
	}

	// Watch for modal opening and load/reset form accordingly
	// IMPORTANT: Use activeDocumentId (internal state) not documentId (prop) to avoid
	// race condition where setting lastLoadedId triggers this effect to re-run,
	// but documentId prop is still null, causing resetForm() to clear just-loaded data.
	$effect(() => {
		if (!browser) return;
		// Track dependencies explicitly - use activeDocumentId to include internal state
		const shouldLoad = isOpen;
		const currentDocId = activeDocumentId;
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
		clearAutosaveTimers();
		showImageInsertModal = false;
		showPublicPageConfirmModal = false;
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

	async function syncInlineImageLinks(documentId: string, markdown: string): Promise<void> {
		const desiredIds = new Set(extractInlineAssetIds(markdown));
		const listParams = new URLSearchParams({
			project_id: projectId,
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
			if (forceVersion) {
				payload.force_version = true;
			}

			// Include expected_updated_at for conflict detection (editing existing docs only)
			if (activeDocumentId && serverUpdatedAt) {
				payload.expected_updated_at = serverUpdatedAt;
			}

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
						...(parentDocumentId ? { parent_id: parentDocumentId } : {}),
						...payload
					})
				});
			}

			const result = await request.json().catch(() => null);

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
			const persistedDocumentId = updatedDoc?.id ?? activeDocumentId ?? newDocumentId;
			if (updatedDoc?.updated_at) {
				serverUpdatedAt = updatedDoc.updated_at;
				updatedAt = updatedDoc.updated_at;
			}

			// Fire-and-forget: sync inline image links in the background
			if (persistedDocumentId) {
				void syncInlineImageLinks(persistedDocumentId, snapshotAtRequest.body).catch(
					(syncError) => {
						void logOntologyClientError(syncError, {
							endpoint: '/api/onto/assets',
							method: 'POST',
							projectId,
							entityType: 'document',
							entityId: persistedDocumentId,
							operation: 'document_inline_image_sync',
							metadata: {
								inlineAssetIds: extractInlineAssetIds(snapshotAtRequest.body),
								documentId: persistedDocumentId
							}
						});
						if (!silent) {
							toastService.warning(
								'Document saved, but inline image links could not be fully synced'
							);
						}
					}
				);
			}

			// Capture snapshot of what we just saved
			captureSnapshot(snapshotAtRequest);

			// Show saved status briefly, then return to idle
			lastSavePublishedLive = false;
			saveStatus = 'saved';
			if (savedFeedbackTimer) clearTimeout(savedFeedbackTimer);
			savedFeedbackTimer = setTimeout(() => {
				if (saveStatus === 'saved') {
					saveStatus = 'idle';
				}
			}, 2000);

			if (!silent) {
				toastService.success(wasCreating ? 'Document created' : 'Document updated');
				onSaved?.();
			}

			// If we just created a new document, transition to edit mode
			if (wasCreating && newDocumentId) {
				internalDocumentId = newDocumentId;
				await loadDocument(newDocumentId);
			}

			return true;
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
			saveStatus = 'error';
			lastSavePublishedLive = false;
			if (!silent) {
				toastService.error(message);
			}
			return false;
		} finally {
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
		try {
			archiving = true;
			const response = await fetch(`/api/onto/documents/${activeDocumentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'archive',
					archive_children_mode: mode
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to archive document');
			}

			stateKey = 'archived';
			toastService.success('Document archived');
			archiveModalOpen = false;
			onSaved?.();
			closeModal();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to archive document';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${activeDocumentId}`,
				method: 'PATCH',
				projectId,
				entityType: 'document',
				entityId: activeDocumentId,
				operation: 'document_archive'
			});
			toastService.error(message);
			throw error;
		} finally {
			archiving = false;
		}
	}

	async function handleRestore() {
		if (!activeDocumentId) return;
		try {
			restoring = true;
			const response = await fetch(`/api/onto/documents/${activeDocumentId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'restore'
				})
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to restore document');
			}

			toastService.success('Document restored');
			onSaved?.();
			closeModal();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to restore document';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${activeDocumentId}`,
				method: 'PATCH',
				projectId,
				entityType: 'document',
				entityId: activeDocumentId,
				operation: 'document_restore'
			});
			toastService.error(message);
		} finally {
			restoring = false;
		}
	}

	async function handleDelete() {
		if (!activeDocumentId) return;
		try {
			deleting = true;
			const response = await fetch(`/api/onto/documents/${activeDocumentId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ permanent: true })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to permanently delete document');
			}

			toastService.success('Document permanently deleted');
			permanentDeleteModalOpen = false;
			onDeleted?.();
			closeModal();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to permanently delete document';
			void logOntologyClientError(error, {
				endpoint: `/api/onto/documents/${activeDocumentId}`,
				method: 'DELETE',
				projectId,
				entityType: 'document',
				entityId: activeDocumentId,
				operation: 'document_delete_permanent'
			});
			toastService.error(message);
		} finally {
			deleting = false;
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
	function handleRestoreRequested(version: VersionListItem, latestVersion: number) {
		selectedVersionForRestore = version;
		latestVersionNumber = latestVersion;
		showRestoreModal = true;
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
		if (!isOpen || !activeDocumentId || !projectId) {
			lastDocTreeLoadKey = null;
			return;
		}

		const loadKey = `${projectId}:${activeDocumentId}`;
		if (lastDocTreeLoadKey === loadKey) return;
		lastDocTreeLoadKey = loadKey;

		// Avoid tracking treeLoading reads inside loadDocTree, which can cause effect churn.
		untrack(() => {
			void loadDocTree();
		});
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

	async function handleInsertImageAsset(asset: InsertableAsset) {
		const alt = toMarkdownAltText(asset);
		const markdown = `![${alt}](/api/onto/assets/${asset.id}/render)`;
		await markdownEditorRef?.insertAtCursor(markdown);
		showImageInsertModal = false;
	}
</script>

<svelte:window onclick={handleExportMenuWindowClick} onkeydown={handleExportMenuWindowKeydown} />

<Modal
	bind:isOpen
	onClose={closeModal}
	size="xl"
	closeOnBackdrop={false}
	closeOnEscape={!blockingSave}
	showCloseButton={false}
	customClasses="lg:!max-w-6xl xl:!max-w-7xl document-modal-container !max-h-[100dvh] !h-[100dvh] sm:!h-auto sm:!max-h-[95dvh] !rounded-none sm:!rounded-lg"
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
						{#if isEditing}
							<span class="inline-flex items-center gap-1">
								{#if saveStatus === 'saving'}
									<LoaderCircle
										class="w-2.5 h-2.5 animate-spin text-muted-foreground"
									/>
									<span class="text-muted-foreground">SAVING</span>
								{:else if saveStatus === 'saved'}
									<Check class="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
									<span class="text-green-600 dark:text-green-400"
										>{lastSavePublishedLive ? 'LIVE UPDATED' : 'SAVED'}</span
									>
								{:else if saveStatus === 'error'}
									<AlertTriangle class="w-2.5 h-2.5 text-destructive" />
									<span class="text-destructive">SAVE FAILED</span>
								{:else if saveStatus === 'conflict'}
									<AlertTriangle class="w-2.5 h-2.5 text-amber-500" />
									<span class="text-amber-500">CONFLICT</span>
								{:else if saveStatus === 'dirty'}
									<span class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
									></span>
									<span class="text-muted-foreground/50">UNSAVED</span>
								{/if}
							</span>
						{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- Export button -->
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
						class="flex h-9 w-9 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak wt-paper"
						title="Export document"
						aria-haspopup="menu"
						aria-expanded={showExportMenu}
					>
						<Download class="w-4 h-4" />
					</button>

					{#if showExportMenu}
						<div
							class="fixed z-[10000] w-40 overflow-hidden rounded-lg border border-border bg-card shadow-ink-strong tx tx-frame tx-weak"
							style="top: {exportMenuPos.top}px; right: {exportMenuPos.right}px;"
							role="menu"
							onclick={(event) => event.stopPropagation()}
							onkeydown={(event) => {
								if (event.key === 'Escape') {
									showExportMenu = false;
								}
							}}
						>
							<button
								type="button"
								onclick={() => handleExport('docx')}
								disabled={exportingFormat !== null}
								class="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								role="menuitem"
							>
								Export as DOCX
							</button>
							<button
								type="button"
								onclick={() => handleExport('html')}
								disabled={exportingFormat !== null}
								class="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								role="menuitem"
							>
								Export as HTML
							</button>
							<button
								type="button"
								onclick={() => handleExport('pdf')}
								disabled={exportingFormat !== null}
								class="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
								role="menuitem"
							>
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
						class="flex h-9 w-9 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak wt-paper"
						title="Chat about this document"
					>
						<img
							src="/brain-bolt.png"
							alt="Chat"
							class="w-6 h-6 rounded object-cover"
						/>
					</button>
				{/if}
				<!-- Close button -->
				<button
					type="button"
					onclick={closeModal}
					disabled={blockingSave}
					class="flex h-9 w-9 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak wt-paper"
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
					<!-- Desktop: Two-column layout | Mobile: Content-first with collapsible metadata -->
					<div class="flex flex-col lg:flex-row flex-1 min-h-0">
						<!-- Left sidebar (metadata + history + activity) - Desktop only, hidden on mobile -->
						<div
							class="hidden lg:flex lg:flex-col lg:w-60 xl:w-76 flex-shrink-0 lg:border-r border-border bg-muted overflow-y-auto tx tx-frame tx-weak"
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
											{#each stateOptions as option}
												<option value={option.value}>{option.label}</option>
											{/each}
										</Select>
									</FormField>
								</div>

								<!-- Public Page -->
								{#if isEditing && activeDocumentId}
									<div class="pt-2 border-t border-border space-y-2">
										{#if publicPageLoading}
											<div
												class="flex items-center gap-2 text-xs text-muted-foreground"
											>
												<LoaderCircle class="w-3.5 h-3.5 animate-spin" />
												<span>Loading public page state...</span>
											</div>
										{:else if isLiveDocument && publicPageState}
											<div
												class="rounded-md border border-emerald-300/70 bg-emerald-50/70 px-2.5 py-2 space-y-2 tx tx-grain tx-weak wt-paper"
											>
												<div class="flex items-start gap-2">
													<Globe
														class="w-3.5 h-3.5 text-emerald-700 mt-0.5"
													/>
													<div class="min-w-0">
														<p class="micro-label text-emerald-900">
															LIVE DOCUMENT
														</p>
														<p
															class="text-[11px] leading-snug text-emerald-800"
														>
															This document is live. Saving updates
															publishes immediately.
														</p>
													</div>
												</div>
												<div
													class="flex items-center justify-between gap-2"
												>
													<span
														class="text-[11px] text-emerald-900 font-mono truncate"
													>
														{publicPageUrlPath}
													</span>
													<div class="flex items-center gap-2 shrink-0">
														<button
															type="button"
															onclick={handleMakeDocumentPublic}
															class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-900 hover:text-emerald-700 transition-colors pressable"
														>
															Edit Public Settings
														</button>
														<button
															type="button"
															onclick={openPublicPageInNewTab}
															class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-900 hover:text-emerald-700 transition-colors pressable"
														>
															Open
															<ExternalLink class="w-3 h-3" />
														</button>
													</div>
												</div>
												<label
													class="flex items-center justify-between gap-2 text-[11px] text-emerald-900"
												>
													<span>Live sync on save</span>
													<input
														type="checkbox"
														checked={publicPageState.live_sync_enabled}
														onchange={(event) =>
															handleLiveSyncToggle(
																(
																	event.currentTarget as HTMLInputElement
																).checked
															)}
														class="h-3.5 w-3.5 rounded border-border"
													/>
												</label>
												{#if publicPageState.last_live_sync_error}
													<p
														class="text-[11px] text-amber-700 leading-snug"
													>
														Last live sync error: {publicPageState.last_live_sync_error}
													</p>
												{/if}
											</div>
										{:else}
											<div class="space-y-1">
												<Button
													type="button"
													variant="outline"
													size="sm"
													onclick={handleMakeDocumentPublic}
													disabled={blockingSave ||
														publicPageActionLoading ||
														isArchivedDocument}
													class="w-full text-xs justify-center"
												>
													<Globe class="w-3.5 h-3.5" />
													<span class="ml-1">
														{publicPageState
															? 'Update Public Page'
															: 'Make This Document Public'}
													</span>
												</Button>
												{#if publicPageState?.public_status && publicPageState.public_status !== 'not_public'}
													<p class="text-[11px] text-muted-foreground">
														Status: {publicPageState.public_status.replace(
															'_',
															' '
														)}
													</p>
												{/if}
											</div>
										{/if}

										{#if hasFlaggedPublicPageReview && latestPublicPageReview}
											<div
												class="rounded-md border border-red-300/70 bg-red-50/70 px-2.5 py-2 space-y-1.5 tx tx-grain tx-weak wt-paper"
											>
												<p class="micro-label text-red-900">
													CONTENT REVIEW FLAGGED
												</p>
												{#if latestPublicPageReview.summary}
													<p
														class="text-[11px] text-red-800 leading-snug"
													>
														{latestPublicPageReview.summary}
													</p>
												{/if}
												{#if latestPublicPageReviewReasons.length > 0}
													<ul
														class="space-y-0.5 text-[11px] text-red-800 list-disc pl-4"
													>
														{#each latestPublicPageReviewReasons as reason}
															<li>{reason}</li>
														{/each}
													</ul>
												{/if}
												{#if latestPublicPageReview.admin_decision}
													<p
														class="text-[11px] text-red-800 leading-snug"
													>
														Admin decision:
														{latestPublicPageReview.admin_decision ===
														'approved'
															? 'OK to publish'
															: 'Not okay'}
														{#if latestPublicPageReview.admin_decision_at}
															({formatDate(
																latestPublicPageReview.admin_decision_at
															)})
														{/if}
													</p>
												{/if}
												{#if latestPublicPageReview.admin_decision_reason}
													<p
														class="text-[11px] text-red-800 leading-snug"
													>
														{latestPublicPageReview.admin_decision_reason}
													</p>
												{/if}
												{#if latestPublicPageReviewGuidance}
													<p
														class="text-[11px] text-red-800 leading-snug"
													>
														{latestPublicPageReviewGuidance}
													</p>
												{/if}
											</div>
										{:else if latestPublicPageReview?.status === 'passed'}
											<p class="text-[11px] text-muted-foreground">
												Last content review passed.
											</p>
										{/if}
									</div>
								{/if}

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

									<!-- Images Section -->
									<div class="pt-2 border-t border-border">
										<button
											type="button"
											onclick={() => (showImages = !showImages)}
											class="w-full flex items-center justify-between px-2 py-1.5 -mx-2 text-left rounded-md hover:bg-card hover:shadow-ink transition-all pressable group"
										>
											<span class="micro-label text-foreground">IMAGES</span>
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
											<div class="pt-2">
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

									<!-- Version History Section -->
									<div class="pt-2 border-t border-border">
										<button
											type="button"
											onclick={() =>
												(showVersionHistory = !showVersionHistory)}
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
											<div class="pt-2">
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

									<!-- Voice Notes Section -->
									<div class="pt-2 border-t border-border">
										<button
											type="button"
											onclick={() => (showVoiceNotes = !showVoiceNotes)}
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
											<div class="pt-2">
												<EntityActivityLog
													entityType="document"
													entityId={activeDocumentId}
													autoLoad={!loading}
												/>
											</div>
										{/if}
									</div>

									<!-- Move to... button -->
									{#if !isArchivedDocument}
										<div class="pt-2 border-t border-border">
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
								<div class="px-3 pt-2 pb-1 flex-1 flex flex-col min-h-0">
									<div
										class="flex items-center justify-between gap-2 mb-1.5 shrink-0"
									>
										<h4 class="micro-label text-foreground">CONTENT</h4>
										{#if isEditing && activeDocumentId}
											<button
												type="button"
												onclick={() => (showImageInsertModal = true)}
												class="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors pressable"
												title="Insert image from project library"
											>
												<ImageIcon class="w-3 h-3" />
												Insert image
											</button>
										{/if}
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
											{#if isEditing}
												<span class="inline-flex items-center gap-1">
													{#if saveStatus === 'saving'}
														<LoaderCircle
															class="w-2.5 h-2.5 animate-spin text-muted-foreground"
														/>
														<span class="text-muted-foreground"
															>SAVING</span
														>
													{:else if saveStatus === 'saved'}
														<Check
															class="w-2.5 h-2.5 text-green-600 dark:text-green-400"
														/>
														<span
															class="text-green-600 dark:text-green-400"
															>{lastSavePublishedLive
																? 'LIVE UPDATED'
																: 'SAVED'}</span
														>
													{:else if saveStatus === 'error'}
														<AlertTriangle
															class="w-2.5 h-2.5 text-destructive"
														/>
														<span class="text-destructive">FAILED</span>
													{:else if saveStatus === 'conflict'}
														<AlertTriangle
															class="w-2.5 h-2.5 text-amber-500"
														/>
														<span class="text-amber-500">CONFLICT</span>
													{:else if saveStatus === 'dirty'}
														<span
															class="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
														></span>
														<span class="text-muted-foreground/50"
															>UNSAVED</span
														>
													{/if}
												</span>
											{/if}
										</p>
										<!-- Desktop: MARKDOWN label -->
										<span
											class="micro-label text-muted-foreground/70 hidden lg:inline"
											>MARKDOWN</span
										>
									</div>
									<div class="flex-1 min-h-0 flex flex-col">
										<RichMarkdownEditor
											bind:this={markdownEditorRef}
											bind:value={body}
											maxLength={50000}
											helpText=""
											fillHeight={true}
											onInsertImageRequested={() =>
												(showImageInsertModal = true)}
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
								<!-- Tab bar - always visible -->
								<div
									class="flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-hide"
								>
									<!-- Details tab -->
									<button
										type="button"
										onclick={() =>
											(activeMobileTab =
												activeMobileTab === 'details' ? null : 'details')}
										class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all pressable {activeMobileTab ===
										'details'
											? 'bg-card shadow-ink text-foreground'
											: 'text-muted-foreground hover:text-foreground hover:bg-card/50'}"
									>
										<Settings2 class="w-3.5 h-3.5" />
										Details
									</button>

									<!-- Links tab -->
									{#if isEditing && activeDocumentId}
										<button
											type="button"
											onclick={() =>
												(activeMobileTab =
													activeMobileTab === 'links' ? null : 'links')}
											class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all pressable {activeMobileTab ===
											'links'
												? 'bg-card shadow-ink text-foreground'
												: 'text-muted-foreground hover:text-foreground hover:bg-card/50'}"
										>
											<Link class="w-3.5 h-3.5" />
											Links
											{#if linkedCount + tagCount > 0}
												<span
													class="inline-flex items-center justify-center min-w-[1rem] h-3.5 px-1 text-[0.55rem] font-bold bg-accent/20 text-accent rounded-full"
												>
													{linkedCount + tagCount}
												</span>
											{/if}
										</button>

										<!-- Media tab -->
										<button
											type="button"
											onclick={() =>
												(activeMobileTab =
													activeMobileTab === 'media' ? null : 'media')}
											class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all pressable {activeMobileTab ===
											'media'
												? 'bg-card shadow-ink text-foreground'
												: 'text-muted-foreground hover:text-foreground hover:bg-card/50'}"
										>
											<ImageIcon class="w-3.5 h-3.5" />
											Media
										</button>

										<!-- History tab -->
										<button
											type="button"
											onclick={() =>
												(activeMobileTab =
													activeMobileTab === 'history'
														? null
														: 'history')}
											class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all pressable {activeMobileTab ===
											'history'
												? 'bg-card shadow-ink text-foreground'
												: 'text-muted-foreground hover:text-foreground hover:bg-card/50'}"
										>
											<Clock class="w-3.5 h-3.5" />
											History
										</button>

										<!-- Comments tab -->
										<button
											type="button"
											onclick={() =>
												(activeMobileTab =
													activeMobileTab === 'comments'
														? null
														: 'comments')}
											class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap transition-all pressable {activeMobileTab ===
											'comments'
												? 'bg-card shadow-ink text-foreground'
												: 'text-muted-foreground hover:text-foreground hover:bg-card/50'}"
										>
											<MessageSquare class="w-3.5 h-3.5" />
											Comments
											{#if commentsCount > 0}
												<span
													class="inline-flex items-center justify-center min-w-[1rem] h-3.5 px-1 text-[0.55rem] font-bold bg-accent/20 text-accent rounded-full"
												>
													{commentsCount}
												</span>
											{/if}
										</button>
									{/if}
								</div>

								<!-- Tab content panel -->
								{#if activeMobileTab}
									<div
										class="max-h-[40vh] overflow-y-auto border-t border-border/50 p-3 space-y-3 tx tx-frame tx-weak"
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
													{#each stateOptions as option}
														<option value={option.value}
															>{option.label}</option
														>
													{/each}
												</Select>
											</FormField>

											{#if isEditing && activeDocumentId}
												<div class="pt-2 border-t border-border space-y-2">
													{#if publicPageLoading}
														<div
															class="flex items-center gap-2 text-xs text-muted-foreground"
														>
															<LoaderCircle
																class="w-3.5 h-3.5 animate-spin"
															/>
															<span>Loading public page state...</span
															>
														</div>
													{:else if isLiveDocument && publicPageState}
														<div
															class="rounded-md border border-emerald-300/70 bg-emerald-50/70 px-2.5 py-2 space-y-1.5"
														>
															<p class="micro-label text-emerald-900">
																LIVE DOCUMENT
															</p>
															<p
																class="text-[11px] leading-snug text-emerald-800"
															>
																Saving updates publishes this page
																immediately.
															</p>
															<div
																class="flex items-center justify-between gap-2"
															>
																<span
																	class="text-[11px] text-emerald-900 font-mono truncate"
																>
																	{publicPageUrlPath}
																</span>
																<div
																	class="flex items-center gap-2 shrink-0"
																>
																	<button
																		type="button"
																		onclick={handleMakeDocumentPublic}
																		class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-900"
																	>
																		Edit
																	</button>
																	<button
																		type="button"
																		onclick={openPublicPageInNewTab}
																		class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-900"
																	>
																		Open
																		<ExternalLink
																			class="w-3 h-3"
																		/>
																	</button>
																</div>
															</div>
															<label
																class="flex items-center justify-between gap-2 text-[11px] text-emerald-900"
															>
																<span>Live sync on save</span>
																<input
																	type="checkbox"
																	checked={publicPageState.live_sync_enabled}
																	onchange={(event) =>
																		handleLiveSyncToggle(
																			(
																				event.currentTarget as HTMLInputElement
																			).checked
																		)}
																	class="h-3.5 w-3.5 rounded border-border"
																/>
															</label>
															{#if publicPageState.last_live_sync_error}
																<p
																	class="text-[11px] text-amber-700 leading-snug"
																>
																	Last live sync error: {publicPageState.last_live_sync_error}
																</p>
															{/if}
														</div>
													{:else}
														<Button
															type="button"
															variant="outline"
															size="sm"
															onclick={handleMakeDocumentPublic}
															disabled={blockingSave ||
																publicPageActionLoading ||
																isArchivedDocument}
															class="w-full text-xs justify-center"
														>
															<Globe class="w-3.5 h-3.5" />
															<span class="ml-1">
																{publicPageState
																	? 'Update Public Page'
																	: 'Make This Document Public'}
															</span>
														</Button>
													{/if}

													{#if hasFlaggedPublicPageReview && latestPublicPageReview}
														<div
															class="rounded-md border border-red-300/70 bg-red-50/70 px-2.5 py-2 space-y-1.5"
														>
															<p class="micro-label text-red-900">
																CONTENT REVIEW FLAGGED
															</p>
															{#if latestPublicPageReview.summary}
																<p
																	class="text-[11px] text-red-800 leading-snug"
																>
																	{latestPublicPageReview.summary}
																</p>
															{/if}
															{#if latestPublicPageReviewReasons.length > 0}
																<ul
																	class="space-y-0.5 text-[11px] text-red-800 list-disc pl-4"
																>
																	{#each latestPublicPageReviewReasons as reason}
																		<li>{reason}</li>
																	{/each}
																</ul>
															{/if}
															{#if latestPublicPageReview.admin_decision}
																<p
																	class="text-[11px] text-red-800 leading-snug"
																>
																	Admin decision:
																	{latestPublicPageReview.admin_decision ===
																	'approved'
																		? 'OK to publish'
																		: 'Not okay'}
																</p>
															{/if}
															{#if latestPublicPageReviewGuidance}
																<p
																	class="text-[11px] text-red-800 leading-snug"
																>
																	{latestPublicPageReviewGuidance}
																</p>
															{/if}
														</div>
													{/if}
												</div>
											{/if}

											{#if isEditing}
												<div class="pt-2 border-t border-border space-y-1">
													<div
														class="flex items-center justify-between gap-2"
													>
														<span
															class="micro-label text-muted-foreground/70"
															>CREATED</span
														>
														<span
															class="text-xs font-mono text-foreground"
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
														<span
															class="text-xs font-mono text-foreground"
															>{updatedAt
																? new Date(
																		updatedAt
																	).toLocaleDateString()
																: '—'}</span
														>
													</div>
													<div
														class="flex items-start justify-between gap-2"
													>
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

												<!-- Move to... button -->
												{#if !isArchivedDocument}
													<div class="pt-2 border-t border-border">
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

												<div class="pt-3 border-t border-border">
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

												<div class="pt-3 border-t border-border">
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
													onCountChange={(count) =>
														(commentsCount = count)}
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
							class="mx-3 mb-3 flex flex-col sm:flex-row items-start sm:items-center gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg"
						>
							<div class="flex items-center gap-2 flex-1 min-w-0">
								<AlertTriangle
									class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0"
								/>
								<span class="text-sm text-amber-800 dark:text-amber-200">
									This document was modified by someone else.
								</span>
							</div>
							<div class="flex items-center gap-2 shrink-0">
								<button
									type="button"
									onclick={handleConflictReload}
									class="text-xs font-medium px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-800/50 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors pressable"
								>
									Reload latest
								</button>
								<button
									type="button"
									onclick={handleConflictOverwrite}
									class="text-xs font-medium px-2.5 py-1 rounded bg-card border border-border text-foreground hover:bg-muted transition-colors pressable"
								>
									Overwrite
								</button>
							</div>
						</div>
					{/if}

					{#if globalFormError}
						<div
							class="mx-3 mb-3 flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak wt-card"
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
							onclick={() => (showComments = !showComments)}
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
						<!-- Always render to fetch count; hide body when collapsed -->
						<div
							class="{showComments
								? 'max-h-[25vh]'
								: 'max-h-0'} overflow-hidden transition-[max-height] duration-200"
						>
							<div
								class="overflow-y-auto"
								style:max-height={showComments ? '25vh' : undefined}
							>
								<EntityCommentsSection
									{projectId}
									entityType="document"
									entityId={activeDocumentId}
									onCountChange={(count) => (commentsCount = count)}
								/>
							</div>
						</div>
					</div>
				{/if}
			{/if}
		</div>
	{/snippet}
	{#snippet footer()}
		<div
			class="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
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
					onclick={closeModal}
					disabled={blockingSave}
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

{#if activeDocumentId}
	<Modal
		bind:isOpen={showImageInsertModal}
		title="Insert Image"
		size="lg"
		onClose={() => (showImageInsertModal = false)}
	>
		{#snippet children()}
			<div class="p-3 sm:p-4">
				<p class="text-xs text-muted-foreground mb-3">
					Choose a project image or upload a new one. The selected image will be inserted
					as markdown and linked inline to this document.
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
					onSelectAsset={handleInsertImageAsset}
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
			<div class="p-3 sm:p-4 space-y-4">
				<p class="text-sm text-muted-foreground">
					Review this preview, then confirm to publish this document as a public page. A
					content review will run on publish (document text plus embedded image
					metadata/OCR).
				</p>
				{#if hasFlaggedPublicPageReview && latestPublicPageReview}
					<div
						class="rounded-md border border-red-300/70 bg-red-50/70 px-3 py-2 space-y-1.5 tx tx-grain tx-weak wt-paper"
					>
						<p class="micro-label text-red-900">LAST REVIEW WAS FLAGGED</p>
						{#if latestPublicPageReview.summary}
							<p class="text-xs text-red-800 leading-snug">
								{latestPublicPageReview.summary}
							</p>
						{/if}
						{#if latestPublicPageReviewReasons.length > 0}
							<ul class="space-y-0.5 text-xs text-red-800 list-disc pl-4">
								{#each latestPublicPageReviewReasons as reason}
									<li>{reason}</li>
								{/each}
							</ul>
						{/if}
						{#if latestPublicPageReview.admin_decision}
							<p class="text-xs text-red-800 leading-snug">
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
							<p class="text-xs text-red-800 leading-snug">
								{latestPublicPageReview.admin_decision_reason}
							</p>
						{/if}
						{#if latestPublicPageReviewGuidance}
							<p class="text-xs text-red-800 leading-snug">
								{latestPublicPageReviewGuidance}
							</p>
						{/if}
					</div>
				{/if}

				<div class="grid gap-3 sm:grid-cols-2">
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
							<p class="text-[11px] text-muted-foreground">
								The prefix is frozen from the publishing account name.
							</p>
							{#if publicPageSlugBaseHelperText}
								<p class="text-[11px] text-muted-foreground">
									{publicPageSlugBaseHelperText}
								</p>
							{/if}
							{#if preview.slug_was_deduped}
								<p class="text-[11px] text-muted-foreground">
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

					<div class="space-y-2 self-end pb-1">
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
					<div class="p-3 max-h-[50vh] overflow-y-auto space-y-3">
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
</style>
