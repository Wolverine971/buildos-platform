<!-- apps/web/src/routes/projects/[id]/+page.svelte -->
<!--
	Project Detail v2 — action-driven project workspace.

	Layout (sm+ desktop):
	  ┌─ ProjectHeaderCard (existing) ─────────────────────────┐
	  │  ┌─ PulseStrip ────────────────────────────────────┐    │
	  │  │  Recently Done | Up Next                        │    │
	  │  └─────────────────────────────────────────────────┘    │
	  │  ┌─ EntityTabStrip ────────────────────────────────┐    │
	  │  │  Briefs · Activity · Graph · Goals · Milestones │    │
	  │  │  · Plans · Risks · Events                       │    │
	  │  └─────────────────────────────────────────────────┘    │
	  │  ┌─ TaskKanbanBoard ───────────────────────────────┐    │
	  │  │  Backlog · In Progress · Blocked · Done ·       │    │
	  │  │  Scheduled · Overdue · Archived                 │    │
	  │  └─────────────────────────────────────────────────┘    │
	  │  ┌─ ProjectDocumentsSection (existing) ────────────┐    │
	  │  └─────────────────────────────────────────────────┘    │
	  └─────────────────────────────────────────────────────────┘

	Layout (< sm mobile): PulseStrip (tabbed) + shared EntityTabStrip (all
	entity tabs wrap onto multiple pill rows) + MobileTaskBoard + shared
	ProjectDocumentsSection.

	The data loader is identical to v1 (skeleton-first + hydrate via
	/api/onto/projects/[id]/full). Modals are rendered through
	ProjectModalsHost so v2 has the same modal coverage as v1.
-->
<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';
	import { getNavigationData } from '$lib/stores/project-navigation.store';
	import { resolveMilestoneState } from '$lib/utils/milestone-state';
	import {
		collectDocIds,
		normalizeDocumentState,
		parseDocStructure
	} from '$lib/services/ontology/doc-structure.service';
	import ProjectHeaderCard from '$lib/components/project/ProjectHeaderCard.svelte';
	import ProjectDocumentsSection from '$lib/components/project/ProjectDocumentsSection.svelte';
	import ProjectEventsModal from '$lib/components/project/ProjectEventsModal.svelte';
	import RecentProjectChatsModal from '$lib/components/project/RecentProjectChatsModal.svelte';
	import PulseStrip from '$lib/components/project/v2/PulseStrip.svelte';
	import MobileTaskBoard from '$lib/components/project/v2/MobileTaskBoard.svelte';
	import TaskKanbanBoard from '$lib/components/project/v2/TaskKanbanBoard.svelte';
	import EntityTabStrip from '$lib/components/project/v2/EntityTabStrip.svelte';
	import ProjectEntitySearchCombobox from '$lib/components/project/v2/ProjectEntitySearchCombobox.svelte';
	import {
		archiveProjectDocument,
		deleteProject,
		fetchProjectEvents,
		fetchProjectFullData,
		fetchProjectNotificationSettings,
		fetchProjectSnapshot,
		moveProjectDocument,
		updateProjectMilestoneState,
		updateProjectNotificationSettings,
		type OntoEventWithSync,
		type ProjectNotificationSettings
	} from '$lib/components/project/project-page-data-controller';
	import { resolveEntityOpenAction } from '$lib/components/project/project-page-interactions';
	import { Bell, BellOff, Calendar, GitBranch, Pencil, Trash2, Users } from 'lucide-svelte';
	import type {
		Project,
		Task,
		Document,
		Plan,
		Goal,
		Milestone,
		MilestoneState,
		Risk
	} from '$lib/types/onto';
	import type { EntityReference, ProjectLogEntityType } from '@buildos/shared-types';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';
	import type { GraphNode } from '$lib/components/ontology/graph/lib/graph.types';
	import type { DataMutationSummary } from '$lib/components/agent/agent-chat.types';
	import { dataMutationEvents, mutationAffectsProject } from '$lib/stores/projectDataMutations';
	import { setRecentlyCreatedContext } from '$lib/stores/recentlyCreatedContext';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const initialData = untrack(() => data);

	// ============================================================
	// ACCESS / PERMISSIONS
	// ============================================================

	const access = $derived(
		data?.access ?? {
			canEdit: false,
			canAdmin: false,
			canInvite: false,
			canViewLogs: false,
			isOwner: false,
			isAuthenticated: false,
			currentActorId: null
		}
	);
	const canEdit = $derived(access.canEdit);
	const canAdmin = $derived(access.canAdmin);
	const canViewLogs = $derived(access.canViewLogs);
	const canOpenCollabModal = $derived(canViewLogs);
	const canDeleteProject = $derived(access.isOwner);

	// ============================================================
	// CORE PROJECT DATA (skeleton or fully loaded)
	// ============================================================

	function projectFromPageData(sourceData: PageData): Project {
		return sourceData.skeleton
			? ({
					id: sourceData.project.id,
					name: sourceData.project.name,
					description: sourceData.project.description,
					icon_svg: sourceData.project.icon_svg,
					icon_concept: sourceData.project.icon_concept,
					icon_generated_at: sourceData.project.icon_generated_at,
					icon_generation_source: sourceData.project.icon_generation_source,
					icon_generation_prompt: sourceData.project.icon_generation_prompt,
					state_key: sourceData.project.state_key,
					type_key: sourceData.project.type_key || 'project',
					next_step_short: sourceData.project.next_step_short,
					next_step_long: sourceData.project.next_step_long,
					next_step_source: sourceData.project.next_step_source,
					next_step_updated_at: sourceData.project.next_step_updated_at
				} as Project)
			: (sourceData.project as Project);
	}

	let isHydrating = $state(initialData.skeleton === true);
	let hydrationError = $state<string | null>(null);

	let project = $state<Project>(projectFromPageData(initialData));
	let tasks = $state<Task[]>(initialData.skeleton ? [] : ((initialData.tasks ?? []) as Task[]));
	let documents = $state<Document[]>(
		initialData.skeleton ? [] : ((initialData.documents ?? []) as Document[])
	);
	let plans = $state<Plan[]>(initialData.skeleton ? [] : ((initialData.plans ?? []) as Plan[]));
	let goals = $state<Goal[]>(initialData.skeleton ? [] : ((initialData.goals ?? []) as Goal[]));
	let milestones = $state<Milestone[]>(
		initialData.skeleton ? [] : ((initialData.milestones ?? []) as Milestone[])
	);
	let risks = $state<Risk[]>(initialData.skeleton ? [] : ((initialData.risks ?? []) as Risk[]));
	let events = $state<OntoEventWithSync[]>(
		initialData.skeleton ? [] : ((initialData.events ?? []) as OntoEventWithSync[])
	);
	let contextDocument = $state<Document | null>(
		initialData.skeleton ? null : ((initialData.context_document ?? null) as Document | null)
	);
	let activePageDataProjectId = initialData.projectId;

	function seedCoreProjectData(sourceData: PageData) {
		isHydrating = sourceData.skeleton === true;
		hydrationError = null;
		project = projectFromPageData(sourceData);
		tasks = sourceData.skeleton ? [] : ((sourceData.tasks ?? []) as Task[]);
		documents = sourceData.skeleton ? [] : ((sourceData.documents ?? []) as Document[]);
		plans = sourceData.skeleton ? [] : ((sourceData.plans ?? []) as Plan[]);
		goals = sourceData.skeleton ? [] : ((sourceData.goals ?? []) as Goal[]);
		milestones = sourceData.skeleton ? [] : ((sourceData.milestones ?? []) as Milestone[]);
		risks = sourceData.skeleton ? [] : ((sourceData.risks ?? []) as Risk[]);
		events = sourceData.skeleton ? [] : ((sourceData.events ?? []) as OntoEventWithSync[]);
		contextDocument = sourceData.skeleton
			? null
			: ((sourceData.context_document ?? null) as Document | null);
	}

	// ============================================================
	// DOCUMENT TREE (also passed into ProjectDocumentsSection + modals)
	// ============================================================

	let documentsExpanded = $state(true);
	let docTreeStructure = $state<DocStructure | null>(null);
	let docTreeDocuments = $state<Record<string, OntoDocument>>({});
	let docTreeUnlinked = $state<OntoDocument[]>([]);
	let docTreeArchived = $state<OntoDocument[]>([]);
	let docTreeViewRef = $state<{ refresh: () => void } | null>(null);

	// ============================================================
	// MODAL STATE — feeds ProjectModalsHost
	// ============================================================

	// Document modals
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let parentDocumentId = $state<string | null>(null);
	let showMoveDocModal = $state(false);
	let moveDocumentId = $state<string | null>(null);
	let moveDocumentTitle = $state('');
	let showDeleteDocConfirmModal = $state(false);
	let deleteDocumentId = $state<string | null>(null);
	let deleteDocumentTitle = $state('');
	let deleteDocumentHasChildren = $state(false);
	let deleteDocumentChildCount = $state(0);

	// Task modals
	let showTaskCreateModal = $state(false);
	let editingTaskId = $state<string | null>(null);

	// Plan modals
	let showPlanCreateModal = $state(false);
	let editingPlanId = $state<string | null>(null);

	// Goal modals
	let showGoalCreateModal = $state(false);
	let editingGoalId = $state<string | null>(null);

	// Risk modals
	let showRiskCreateModal = $state(false);
	let editingRiskId = $state<string | null>(null);

	// Milestone modals
	let showMilestoneCreateModal = $state(false);
	let milestoneCreateGoalContext = $state<{ goalId: string; goalName: string } | null>(null);
	let editingMilestoneId = $state<string | null>(null);

	// Event modals
	let showEventCreateModal = $state(false);
	let editingEventId = $state<string | null>(null);

	// Project modals
	let showProjectCalendarModal = $state(false);
	let showProjectEditModal = $state(false);
	let showCollabModal = $state(false);
	let showDeleteProjectModal = $state(false);
	let isDeletingProject = $state(false);
	let deleteProjectError = $state<string | null>(null);

	// Graph modal (full-screen)
	let showGraphModal = $state(false);

	// Recent project chats
	type AgentChatModalLazy =
		| typeof import('$lib/components/agent/AgentChatModal.svelte').default
		| null;
	let showEventsModal = $state(false);
	let showRecentChatsModal = $state(false);
	let showRecentChatAgentModal = $state(false);
	let selectedRecentChatSessionId = $state<string | null>(null);
	let AgentChatModalComponent = $state<AgentChatModalLazy>(null);

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default;
		}
		return AgentChatModalComponent;
	}

	// ============================================================
	// HEADER SETTINGS MENU PORTAL
	// ============================================================

	let showSettingsMenu = $state(false);
	let settingsMenuPos = $state({ top: 0, right: 0 });

	let projectNotificationSettings = $state<ProjectNotificationSettings | null>(null);
	let isNotificationSettingsLoading = $state(false);
	let isNotificationSettingsSaving = $state(false);
	let notificationSettingsLoadPromise = $state<Promise<void> | null>(null);

	// ============================================================
	// DERIVED
	// ============================================================

	const milestonesByGoalId = $derived.by(() => {
		const map = new Map<string, Milestone[]>();
		for (const m of milestones) {
			if (!m.goal_id) continue;
			const list = map.get(m.goal_id) ?? [];
			list.push(m);
			map.set(m.goal_id, list);
		}
		return map;
	});

	const documentTypeOptions = $derived.by(() => {
		const set = new Set<string>();
		for (const doc of documents) {
			if (doc.type_key) set.add(doc.type_key);
		}
		return Array.from(set);
	});

	// ============================================================
	// DOC TREE SEED
	// ============================================================

	function buildDocTreeSeed(
		sourceProject: Project | null | undefined,
		sourceDocuments: Document[]
	) {
		const structure = parseDocStructure(sourceProject?.doc_structure);
		const typedDocs = (sourceDocuments as unknown as OntoDocument[]).filter(
			(doc) => doc && typeof doc.id === 'string'
		);
		const documentsById: Record<string, OntoDocument> = {};
		for (const doc of typedDocs) documentsById[doc.id] = doc;
		const structureDocIds = collectDocIds(structure.root);
		const archived = typedDocs.filter(
			(doc) => normalizeDocumentState(doc.state_key) === 'archived'
		);
		const archivedDocIds = new Set(archived.map((doc) => doc.id));
		const unlinked = typedDocs.filter(
			(doc) => !archivedDocIds.has(doc.id) && !structureDocIds.has(doc.id)
		);
		return { structure, documents: documentsById, unlinked, archived };
	}

	function applyDocTreeSeed(seed: ReturnType<typeof buildDocTreeSeed>) {
		docTreeStructure = seed.structure;
		docTreeDocuments = seed.documents;
		docTreeUnlinked = seed.unlinked;
		docTreeArchived = seed.archived;
	}

	// ============================================================
	// HYDRATION + REFRESH
	// ============================================================

	async function hydrateFullData(sourceData: PageData = data) {
		if (!sourceData.skeleton) return;
		const projectId = sourceData.projectId;
		try {
			const fullData = await fetchProjectFullData(projectId);
			if (data.projectId !== projectId) return;
			project = (fullData.project as Project) || project;
			tasks = (fullData.tasks ?? []) as Task[];
			documents = (fullData.documents ?? []) as Document[];
			plans = (fullData.plans ?? []) as Plan[];
			goals = (fullData.goals ?? []) as Goal[];
			milestones = (fullData.milestones ?? []) as Milestone[];
			risks = (fullData.risks ?? []) as Risk[];
			events = (fullData.events ?? []) as OntoEventWithSync[];
			contextDocument = (fullData.context_document ?? null) as Document | null;
			applyDocTreeSeed(buildDocTreeSeed(fullData.project as Project, documents));
			isHydrating = false;
			if (!Array.isArray(fullData.events)) {
				void loadProjectEvents();
			}
		} catch (err) {
			if (data.projectId !== projectId) return;
			hydrationError = err instanceof Error ? err.message : 'Failed to load project data';
			isHydrating = false;
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/full`,
				method: 'GET',
				projectId,
				entityType: 'project',
				operation: 'project_v2_hydrate'
			});
		}
	}

	async function refreshSilently() {
		const projectId = data.projectId;
		try {
			const fullData = await fetchProjectSnapshot(projectId);
			if (data.projectId !== projectId) return;
			project = (fullData.project as Project) || project;
			tasks = (fullData.tasks ?? []) as Task[];
			documents = (fullData.documents ?? []) as Document[];
			plans = (fullData.plans ?? []) as Plan[];
			goals = (fullData.goals ?? []) as Goal[];
			milestones = (fullData.milestones ?? []) as Milestone[];
			risks = (fullData.risks ?? []) as Risk[];
			contextDocument = (fullData.context_document ?? null) as Document | null;
			if (Array.isArray(fullData.events)) {
				events = fullData.events as OntoEventWithSync[];
			} else {
				await loadProjectEvents();
			}
			applyDocTreeSeed(buildDocTreeSeed(fullData.project as Project, documents));
		} catch (err) {
			console.warn('[Project v2] Silent refresh failed:', err);
		}
	}

	async function loadProjectEvents(showToast = false, projectId = project?.id) {
		if (!projectId) return;
		try {
			const loadedEvents = await fetchProjectEvents(projectId);
			if (data.projectId !== projectId) return;
			events = loadedEvents;
		} catch (err) {
			if (data.projectId !== projectId) return;
			console.error('[Project v2] Failed to load events', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/projects/${projectId}/events`,
				method: 'GET',
				projectId,
				entityType: 'event',
				operation: 'project_events_load'
			});
			if (showToast) {
				toastService.error(err instanceof Error ? err.message : 'Failed to load events');
			}
		}
	}

	async function loadProjectNotificationSettings() {
		if (!project?.id || !canOpenCollabModal) return;
		isNotificationSettingsLoading = true;
		try {
			projectNotificationSettings = await fetchProjectNotificationSettings(project.id);
		} catch (err) {
			console.error('[Project v2] Failed to load notification settings', err);
		} finally {
			isNotificationSettingsLoading = false;
		}
	}

	async function ensureProjectNotificationSettingsLoaded(force = false) {
		if (!project?.id || !canOpenCollabModal) return;
		if (!force && projectNotificationSettings) return;
		if (notificationSettingsLoadPromise) {
			await notificationSettingsLoadPromise;
			return;
		}
		notificationSettingsLoadPromise = (async () => {
			try {
				await loadProjectNotificationSettings();
			} finally {
				notificationSettingsLoadPromise = null;
			}
		})();
		await notificationSettingsLoadPromise;
	}

	async function handleProjectNotificationQuickToggle() {
		if (!project?.id || !projectNotificationSettings || isNotificationSettingsSaving) return;
		const previous = projectNotificationSettings;
		const nextEnabled = !previous.member_enabled;
		projectNotificationSettings = {
			...previous,
			member_enabled: nextEnabled,
			effective_enabled: nextEnabled,
			member_overridden: nextEnabled !== previous.project_default_enabled
		};
		isNotificationSettingsSaving = true;
		try {
			projectNotificationSettings = await updateProjectNotificationSettings({
				projectId: project.id,
				memberEnabled: nextEnabled
			});
			toastService.success(
				nextEnabled
					? 'Project activity notifications enabled'
					: 'Project activity notifications muted'
			);
		} catch (err) {
			projectNotificationSettings = previous;
			toastService.error(
				err instanceof Error ? err.message : 'Failed to update notification settings'
			);
		} finally {
			isNotificationSettingsSaving = false;
		}
	}

	function startProjectDataLoading(sourceData: PageData) {
		if (sourceData.skeleton) {
			const navData = getNavigationData(sourceData.projectId);
			if (navData) {
				project = {
					...project,
					name: navData.name,
					description: navData.description,
					icon_svg: navData.icon_svg,
					icon_concept: navData.icon_concept,
					state_key: navData.state_key,
					next_step_short: navData.next_step_short,
					next_step_long: navData.next_step_long,
					next_step_source: navData.next_step_source,
					next_step_updated_at: navData.next_step_updated_at
				} as Project;
			}
			void hydrateFullData(sourceData);
		} else {
			applyDocTreeSeed(buildDocTreeSeed(project, documents));
			if (!Array.isArray((sourceData as Record<string, unknown>).events)) {
				void loadProjectEvents(false, project.id);
			}
		}
	}

	$effect(() => {
		const currentData = data;
		if (currentData.projectId === activePageDataProjectId) return;
		activePageDataProjectId = currentData.projectId;
		untrack(() => {
			seedCoreProjectData(currentData);
			startProjectDataLoading(currentData);
		});
	});

	// When the agentic chat (from anywhere — global launcher, embedded edit modals, …)
	// reports that it mutated data affecting this project, silently refetch so newly
	// created/updated entities appear without a manual reload.
	// Only react to mutation events that arrive AFTER this page is set up — a stale
	// event left in the store by a prior page should not trigger a refresh here.
	let lastHandledMutationNonce = get(dataMutationEvents)?.nonce ?? 0;

	// IDs of entities that just appeared via a chat/agent mutation, so the lists can
	// give them a brief "just created" entrance. Cleared shortly after.
	let recentlyCreatedIds = $state<ReadonlySet<string>>(new Set());
	let recentlyCreatedTimer: ReturnType<typeof setTimeout> | null = null;

	// Expose the highlight set to descendant lists (task boards, doc tree, …). The
	// closure reads reactive `$state`, so `has()` stays live as the set updates/clears.
	setRecentlyCreatedContext({ has: (id) => recentlyCreatedIds.has(id) });

	$effect(() => {
		const event = $dataMutationEvents;
		if (!event || event.nonce === lastHandledMutationNonce) return;
		lastHandledMutationNonce = event.nonce;
		if (mutationAffectsProject(event.summary, data.projectId)) {
			untrack(() => void refreshAndHighlight());
		}
	});

	$effect(() => () => {
		if (recentlyCreatedTimer) clearTimeout(recentlyCreatedTimer);
	});

	function snapshotEntityIds(): Set<string> {
		return new Set<string>([
			...tasks.map((t) => t.id),
			...documents.map((d) => d.id),
			...plans.map((p) => p.id),
			...goals.map((g) => g.id),
			...milestones.map((m) => m.id),
			...risks.map((r) => r.id)
		]);
	}

	// Refresh, then mark whichever entities are newly present so the lists can animate
	// them in. Skips highlighting while hydrating (lists aren't populated yet, so a diff
	// would misflag every pre-existing entity as new).
	async function refreshAndHighlight() {
		if (isHydrating) {
			await refreshSilently();
			return;
		}
		const before = snapshotEntityIds();
		await refreshSilently();
		const appeared = [...snapshotEntityIds()].filter((id) => !before.has(id));
		if (appeared.length === 0) return;
		recentlyCreatedIds = new Set(appeared);
		if (recentlyCreatedTimer) clearTimeout(recentlyCreatedTimer);
		recentlyCreatedTimer = setTimeout(() => {
			recentlyCreatedIds = new Set();
			recentlyCreatedTimer = null;
		}, 2400);
	}

	// ============================================================
	// MOUNT
	// ============================================================

	onMount(() => {
		// Open an entity via query params (used by notifications and OwnerBar "Edit original")
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			const docId = params.get('doc');
			const entityType = params.get('entity');
			const entityId = params.get('entity_id') ?? params.get('id');
			if (docId) {
				activeDocumentId = docId;
				showDocumentModal = true;
				const cleanUrl = window.location.pathname + window.location.hash;
				window.history.replaceState({}, '', cleanUrl);
			} else if (entityType && entityId) {
				const result = openEntityEditor(entityType, entityId);
				if (result === 'opened') {
					const cleanUrl = window.location.pathname + window.location.hash;
					window.history.replaceState({}, '', cleanUrl);
				}
			}
		}

		startProjectDataLoading(data);
	});

	// ============================================================
	// HEADER MENU
	// ============================================================

	function handleHeaderMenuOpen(position: { top: number; right: number }) {
		settingsMenuPos = position;
		showSettingsMenu = true;
		if (canOpenCollabModal) {
			void ensureProjectNotificationSettingsLoaded();
		}
	}

	// ============================================================
	// ENTITY ROUTING
	// ============================================================

	function openEntityEditor(
		entityType: string,
		entityId: string
	): 'opened' | 'unsupported' | 'unknown' {
		const resolution = resolveEntityOpenAction(entityType, entityId);
		if (resolution.result !== 'opened') {
			return resolution.result;
		}
		const id = resolution.action.entityId;
		switch (resolution.action.kind) {
			case 'task':
				editingTaskId = id;
				return 'opened';
			case 'plan':
				editingPlanId = id;
				return 'opened';
			case 'goal':
				editingGoalId = id;
				return 'opened';
			case 'document':
				activeDocumentId = id;
				showDocumentModal = true;
				return 'opened';
			case 'milestone':
				editingMilestoneId = id;
				return 'opened';
			case 'risk':
				editingRiskId = id;
				return 'opened';
			case 'event':
				editingEventId = id;
				return 'opened';
			case 'project':
				showProjectEditModal = true;
				return 'opened';
		}
	}

	function handleEntityClick(entityType: ProjectLogEntityType, entityId: string) {
		const result = openEntityEditor(entityType, entityId);
		if (result === 'unsupported') {
			console.info('No edit modal for entity type:', entityType);
		} else if (result === 'unknown') {
			console.warn('Unknown entity type clicked:', entityType);
		}
	}

	function handleNextStepClick(ref: EntityReference) {
		handleEntityClick(ref.type as ProjectLogEntityType, ref.id);
	}

	function handleGraphNodeClick(node: GraphNode) {
		handleEntityClick(node.type as ProjectLogEntityType, node.id);
	}

	// ============================================================
	// DOCUMENT HANDLERS
	// ============================================================

	function handleOpenDocument(docId: string) {
		activeDocumentId = docId;
		showDocumentModal = true;
	}

	function handleCreateDocument(parentId?: string | null) {
		parentDocumentId = parentId ?? null;
		activeDocumentId = null;
		showDocumentModal = true;
	}

	function handleMoveDocument(docId: string) {
		const doc = docTreeDocuments[docId];
		moveDocumentId = docId;
		moveDocumentTitle = doc?.title || 'Document';
		showMoveDocModal = true;
	}

	function handleDeleteDocument(docId: string, hasChildren: boolean) {
		const doc = docTreeDocuments[docId];
		deleteDocumentId = docId;
		deleteDocumentTitle = doc?.title || 'Document';
		deleteDocumentHasChildren = hasChildren;
		if (hasChildren && docTreeStructure) {
			type DocTreeNode = { id: string; children?: DocTreeNode[] };
			const countChildren = (nodes: DocTreeNode[]): number => {
				let count = 0;
				for (const node of nodes) {
					if (node.id === docId && node.children) {
						count = node.children.length;
						break;
					}
					if (node.children) {
						const c = countChildren(node.children);
						if (c > 0) count = c;
					}
				}
				return count;
			};
			deleteDocumentChildCount = countChildren(docTreeStructure.root);
		} else {
			deleteDocumentChildCount = 0;
		}
		showDeleteDocConfirmModal = true;
	}

	function closeDocumentModal() {
		showDocumentModal = false;
		activeDocumentId = null;
		parentDocumentId = null;
	}

	function closeMoveDocumentModal() {
		showMoveDocModal = false;
		moveDocumentId = null;
	}

	function closeDeleteDocumentConfirmModal() {
		showDeleteDocConfirmModal = false;
		deleteDocumentId = null;
	}

	async function handleDocumentSaved() {
		await refreshSilently();
		docTreeViewRef?.refresh();
	}

	async function handleDocumentDeleted() {
		const deletedId = activeDocumentId;
		if (deletedId) {
			documents = documents.filter((d) => d.id !== deletedId);
			if (docTreeDocuments[deletedId]) {
				const { [deletedId]: _, ...rest } = docTreeDocuments;
				docTreeDocuments = rest;
			}
		}
		closeDocumentModal();
		docTreeViewRef?.refresh();
	}

	async function handleMoveDocumentConfirm(newParentId: string | null) {
		if (!moveDocumentId || !project?.id) return;
		try {
			await moveProjectDocument({
				projectId: project.id,
				documentId: moveDocumentId,
				newParentId,
				newPosition: 0
			});
			toastService.success('Document moved');
			docTreeViewRef?.refresh();
		} catch (err) {
			toastService.error(err instanceof Error ? err.message : 'Failed to move document');
		} finally {
			closeMoveDocumentModal();
		}
	}

	async function handleDeleteDocumentConfirm(
		mode: 'archive_children' | 'promote_children' | 'unlink_children'
	) {
		if (!deleteDocumentId || !project?.id) return;
		const docId = deleteDocumentId;
		try {
			await archiveProjectDocument({ documentId: docId, mode });
			closeDeleteDocumentConfirmModal();
			toastService.success('Document archived');
			await refreshSilently();
			docTreeViewRef?.refresh();
		} catch (err) {
			toastService.error(err instanceof Error ? err.message : 'Failed to archive document');
		}
	}

	function handleDocTreeDataLoaded(loaded: {
		structure: DocStructure;
		documents: Record<string, OntoDocument>;
		unlinked?: OntoDocument[];
		archived?: OntoDocument[];
	}) {
		docTreeStructure = loaded.structure;
		docTreeDocuments = loaded.documents;
		docTreeUnlinked = loaded.unlinked ?? [];
		docTreeArchived = loaded.archived ?? [];
	}

	// ============================================================
	// ENTITY HANDLERS — Tasks
	// ============================================================

	function handleTaskCreated(taskId: string) {
		toastService.success('Task created');
		showTaskCreateModal = false;
		editingTaskId = taskId;
		void refreshSilently();
	}

	function handleTaskUpdated() {
		void refreshSilently();
		editingTaskId = null;
	}

	function handleTaskDeleted() {
		const deletedId = editingTaskId;
		if (deletedId) tasks = tasks.filter((t) => t.id !== deletedId);
		editingTaskId = null;
	}

	// ============================================================
	// ENTITY HANDLERS — Plans / Goals / Risks / Milestones / Events
	// ============================================================

	function handlePlanCreated(planId: string) {
		toastService.success('Plan created');
		showPlanCreateModal = false;
		editingPlanId = planId;
		void refreshSilently();
	}
	function handlePlanUpdated() {
		void refreshSilently();
		editingPlanId = null;
	}
	function handlePlanDeleted() {
		const id = editingPlanId;
		if (id) plans = plans.filter((p) => p.id !== id);
		editingPlanId = null;
	}

	function handleGoalCreated(goalId: string) {
		toastService.success('Goal created');
		showGoalCreateModal = false;
		editingGoalId = goalId;
		void refreshSilently();
	}
	function handleGoalUpdated() {
		void refreshSilently();
		editingGoalId = null;
	}
	function handleGoalDeleted() {
		const id = editingGoalId;
		if (id) {
			goals = goals.filter((g) => g.id !== id);
			milestones = milestones.filter((m) => m.goal_id !== id);
		}
		editingGoalId = null;
	}

	function handleRiskCreated(riskId: string) {
		toastService.success('Risk created');
		showRiskCreateModal = false;
		editingRiskId = riskId;
		void refreshSilently();
	}
	function handleRiskUpdated() {
		void refreshSilently();
		editingRiskId = null;
	}
	function handleRiskDeleted() {
		const id = editingRiskId;
		if (id) risks = risks.filter((r) => r.id !== id);
		editingRiskId = null;
	}

	function handleMilestoneCreated(milestoneId: string) {
		toastService.success('Milestone created');
		showMilestoneCreateModal = false;
		milestoneCreateGoalContext = null;
		editingMilestoneId = milestoneId;
		void refreshSilently();
	}
	function handleMilestoneUpdated() {
		void refreshSilently();
		editingMilestoneId = null;
	}
	function handleMilestoneDeleted() {
		const id = editingMilestoneId;
		if (id) milestones = milestones.filter((m) => m.id !== id);
		editingMilestoneId = null;
	}
	function closeMilestoneCreateModal() {
		showMilestoneCreateModal = false;
		milestoneCreateGoalContext = null;
	}
	function handleAddMilestoneFromGoal(goalId: string, goalName: string) {
		milestoneCreateGoalContext = { goalId, goalName };
		showMilestoneCreateModal = true;
	}
	async function handleToggleMilestoneComplete(milestoneId: string, currentState: string) {
		const newState: MilestoneState = currentState === 'completed' ? 'pending' : 'completed';
		try {
			await updateProjectMilestoneState({ milestoneId, stateKey: newState });
			milestones = milestones.map((m) => {
				if (m.id !== milestoneId) return m;
				const updated: Milestone = {
					...m,
					state_key: newState,
					due_at: m.due_at ?? null
				};
				const { state, isMissed } = resolveMilestoneState(updated);
				return {
					...updated,
					effective_state_key: state,
					is_missed: isMissed,
					due_at: updated.due_at
				};
			});
			toastService.success(
				newState === 'completed' ? 'Milestone completed!' : 'Milestone reopened'
			);
		} catch (err) {
			toastService.error(err instanceof Error ? err.message : 'Failed to update milestone');
		}
	}

	function handleEventCreated(eventId: string) {
		toastService.success('Event created');
		showEventCreateModal = false;
		editingEventId = eventId;
		void loadProjectEvents();
	}
	function handleEventUpdated() {
		void loadProjectEvents();
		editingEventId = null;
	}
	function handleEventDeleted() {
		const id = editingEventId;
		if (id) events = events.filter((e) => e.id !== id);
		editingEventId = null;
	}

	// ============================================================
	// PROJECT-LEVEL HANDLERS
	// ============================================================

	function closeProjectCalendarModal() {
		showProjectCalendarModal = false;
	}
	function closeProjectEditModal() {
		showProjectEditModal = false;
	}
	async function handleProjectSaved() {
		await refreshSilently();
		showProjectEditModal = false;
	}
	function closeCollabModal() {
		showCollabModal = false;
	}
	function cancelDeleteProjectModal() {
		showDeleteProjectModal = false;
	}
	function closeGraphModal() {
		showGraphModal = false;
	}
	function openEventsModal() {
		showEventsModal = true;
	}
	function closeEventsModal() {
		showEventsModal = false;
	}
	function openEventFromEventsModal(eventId: string) {
		showEventsModal = false;
		editingEventId = eventId;
	}
	function openEventCreateFromEventsModal() {
		showEventsModal = false;
		showEventCreateModal = true;
	}
	function openRecentChatsModal() {
		showRecentChatsModal = true;
	}
	function closeRecentChatsModal() {
		showRecentChatsModal = false;
	}
	async function handleRecentChatSelected(sessionId: string) {
		selectedRecentChatSessionId = sessionId;
		showRecentChatsModal = false;
		await tick();
		await loadAgentChatModal();
		showRecentChatAgentModal = true;
	}
	function closeRecentChatAgentModal(_summary?: DataMutationSummary) {
		showRecentChatAgentModal = false;
		selectedRecentChatSessionId = null;
		// Refresh is handled globally via the dataMutationEvents subscription above.
	}
	function handleCollaborationLeftProject() {
		goto('/projects');
	}
	function handleCollaborationMembersChanged() {
		// No-op; v2 doesn't yet load member-based filter facets like v1
	}
	async function handleProjectDeleteConfirm() {
		if (!project?.id) return;
		isDeletingProject = true;
		deleteProjectError = null;
		try {
			await deleteProject(project.id);
			toastService.success('Project deleted');
			showDeleteProjectModal = false;
			goto('/projects');
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to delete project';
			deleteProjectError = msg;
			toastService.error(msg);
		} finally {
			isDeletingProject = false;
		}
	}

	// ============================================================
	// MODAL OPEN AGGREGATE (for ProjectModalsHost gating)
	// ============================================================

	const hasAnyModalOpen = $derived(
		showDocumentModal ||
			showMoveDocModal ||
			showDeleteDocConfirmModal ||
			showTaskCreateModal ||
			Boolean(editingTaskId) ||
			showPlanCreateModal ||
			Boolean(editingPlanId) ||
			showGoalCreateModal ||
			Boolean(editingGoalId) ||
			showRiskCreateModal ||
			Boolean(editingRiskId) ||
			showMilestoneCreateModal ||
			Boolean(editingMilestoneId) ||
			showEventCreateModal ||
			Boolean(editingEventId) ||
			showProjectCalendarModal ||
			showProjectEditModal ||
			showCollabModal ||
			showDeleteProjectModal ||
			showGraphModal
	);

	// Respect "reduce motion" preference for hydration fades
	let prefersReducedMotion = $state(false);
	const fadeIn = $derived(prefersReducedMotion ? { duration: 0 } : { duration: 120, delay: 40 });
	const fadeOut = $derived(prefersReducedMotion ? { duration: 0 } : { duration: 70 });

	$effect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mq.matches;
		const handler = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});
</script>

<svelte:head>
	<title>{project?.name || 'Project'} | BuildOS</title>
</svelte:head>

<div class="overflow-x-hidden">
	<ProjectHeaderCard
		{project}
		showMobileMenu={showSettingsMenu}
		onOpenMenu={handleHeaderMenuOpen}
		onEntityClick={handleNextStepClick}
		onNextStepGenerated={refreshSilently}
		viewToggle={{
			label: 'Classic view',
			href: `/projects/${data.projectId}/old`,
			title: 'Switch to the classic project view'
		}}
	/>

	<main class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 overflow-x-hidden">
		{#if hydrationError}
			<div
				class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 tx tx-static tx-weak"
			>
				<p class="text-sm text-destructive">
					Failed to load project data: {hydrationError}
				</p>
				<button
					onclick={() => {
						hydrationError = null;
						isHydrating = true;
						void hydrateFullData();
					}}
					class="mt-2 text-sm font-medium text-destructive hover:text-destructive/80 pressable"
				>
					Try again
				</button>
			</div>
		{/if}

		<!-- Pulse (shared mobile + desktop). PulseStrip handles its own
			 viewport layout: tabbed on mobile, two-column at md+. -->
		{#if isHydrating}
			<div class="mb-2 sm:mb-3">
				<!-- Mobile pulse skeleton -->
				<div
					class="sm:hidden bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
				>
					<div class="flex border-b border-border/60">
						<div class="flex-1 h-10 bg-muted/40 animate-pulse"></div>
						<div class="flex-1 h-10 bg-muted/40 animate-pulse"></div>
					</div>
					<div class="p-2 space-y-1.5">
						{#each Array(3) as _, i (i)}
							<div
								class="h-14 bg-muted/40 border border-border/60 rounded-md animate-pulse"
							></div>
						{/each}
					</div>
				</div>
				<!-- Desktop pulse skeleton -->
				<div class="hidden sm:grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
					{#each Array(2) as _, i (i)}
						<div
							class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
						>
							<div class="px-3 sm:px-4 py-2.5 border-b border-border/60">
								<div class="h-3.5 w-32 bg-muted rounded animate-pulse"></div>
							</div>
							<div class="p-2 sm:p-3 space-y-1.5">
								{#each Array(3) as _, j (j)}
									<div
										class="h-12 bg-muted/40 border border-border/60 rounded-md animate-pulse"
									></div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div class="mb-2 sm:mb-3">
				<PulseStrip
					projectId={project.id}
					{tasks}
					{milestones}
					{goals}
					{events}
					onOpenEntity={handleEntityClick}
				/>
			</div>
		{/if}

		{#if isHydrating}
			<div class="mb-2 sm:mb-3">
				<div
					class="h-14 rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak p-2 sm:p-2.5"
				>
					<div class="h-10 rounded-md bg-muted/40 animate-pulse"></div>
				</div>
			</div>
		{:else}
			<div class="mb-2 sm:mb-3">
				<ProjectEntitySearchCombobox
					projectId={project.id}
					disabled={isHydrating}
					onSelectEntity={handleEntityClick}
				/>
			</div>
		{/if}

		<!-- Entity tabs (shared mobile + desktop). All entity surfaces live
			 here: Briefs · Chats · Graph · Goals · Milestones · Plans · Risks
			 · Events. Pills wrap on narrow screens. Chats, Graph, and Events
			 open modals; the rest expand inline. -->
		{#if isHydrating}
			<div class="mb-2 sm:mb-3 flex flex-wrap gap-1.5 sm:gap-2">
				{#each Array(9) as _, i (i)}
					<div
						class="h-10 min-w-[88px] flex-1 sm:flex-none bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak animate-pulse"
					></div>
				{/each}
			</div>
		{:else}
			<div class="mb-2 sm:mb-3">
				<EntityTabStrip
					projectId={project.id}
					projectName={project.name}
					{canEdit}
					{goals}
					{milestones}
					{plans}
					{risks}
					{events}
					{milestonesByGoalId}
					onEditGoal={(id) => (editingGoalId = id)}
					onEditMilestone={(id) => (editingMilestoneId = id)}
					onEditPlan={(id) => (editingPlanId = id)}
					onEditRisk={(id) => (editingRiskId = id)}
					onEntityClick={handleEntityClick}
					onOpenGraph={() => (showGraphModal = true)}
					onAddGoal={canEdit ? () => (showGoalCreateModal = true) : undefined}
					onAddMilestoneFromGoal={canEdit ? handleAddMilestoneFromGoal : undefined}
					onAddPlan={canEdit ? () => (showPlanCreateModal = true) : undefined}
					onAddRisk={canEdit ? () => (showRiskCreateModal = true) : undefined}
					onOpenRecentChats={openRecentChatsModal}
					onOpenEvents={openEventsModal}
				/>
			</div>
		{/if}

		<!-- Mobile-only: task board (sm:hidden). Tasks are the daily-driver
			 surface and deserve a dedicated pane on mobile. -->
		<div class="sm:hidden mb-2">
			{#if isHydrating}
				<div
					class="h-32 bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak animate-pulse"
				></div>
			{:else}
				<div in:fade={fadeIn} out:fade={fadeOut}>
					<MobileTaskBoard
						projectId={project.id}
						{tasks}
						{canEdit}
						onEditTask={(id) => (editingTaskId = id)}
						onCreateTask={() => (showTaskCreateModal = true)}
					/>
				</div>
			{/if}
		</div>

		<!-- Desktop-only: 7-column kanban board (hidden sm:block). -->
		<div class="hidden sm:block">
			{#if isHydrating}
				<div
					class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
				>
					<div class="px-3 sm:px-4 py-2.5 border-b border-border/60">
						<div class="h-3.5 w-24 bg-muted rounded animate-pulse"></div>
					</div>
					<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-3">
						{#each Array(4) as _, i (i)}
							<div class="space-y-2">
								<div class="h-4 w-20 bg-muted rounded animate-pulse"></div>
								<div class="h-16 bg-muted/40 rounded animate-pulse"></div>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<TaskKanbanBoard
					projectId={project.id}
					{tasks}
					{canEdit}
					onEditTask={(id) => (editingTaskId = id)}
					onCreateTask={() => (showTaskCreateModal = true)}
					onTaskMoved={() => void refreshSilently()}
				/>
			{/if}
		</div>

		<!-- Documents (shared mobile + desktop) -->
		{#if !isHydrating}
			<div class="mt-2 sm:mt-3">
				<ProjectDocumentsSection
					projectId={project.id}
					{documents}
					{canEdit}
					{documentsExpanded}
					{activeDocumentId}
					onToggleExpanded={() => (documentsExpanded = !documentsExpanded)}
					onCreateDocument={handleCreateDocument}
					onOpenDocument={handleOpenDocument}
					onMoveDocument={canEdit ? handleMoveDocument : undefined}
					onDeleteDocument={canEdit ? handleDeleteDocument : undefined}
					onDataLoaded={handleDocTreeDataLoaded}
					initialStructure={docTreeStructure}
					initialDocuments={docTreeDocuments}
					initialUnlinked={docTreeUnlinked}
					initialArchived={docTreeArchived}
					onTreeRefChange={(ref) => {
						docTreeViewRef = ref;
					}}
				/>
			</div>
		{/if}
	</main>
</div>

<!-- All modals via the shared host (matches v1 coverage) -->
{#if hasAnyModalOpen}
	{#await import('$lib/components/project/ProjectModalsHost.svelte') then { default: ProjectModalsHost }}
		<ProjectModalsHost
			{project}
			{contextDocument}
			{goals}
			{tasks}
			{documentTypeOptions}
			{docTreeStructure}
			{docTreeDocuments}
			{canDeleteProject}
			{canOpenCollabModal}
			{canAdmin}
			{showDocumentModal}
			{activeDocumentId}
			{parentDocumentId}
			{showMoveDocModal}
			{moveDocumentId}
			{moveDocumentTitle}
			{showDeleteDocConfirmModal}
			{deleteDocumentId}
			{deleteDocumentTitle}
			{deleteDocumentHasChildren}
			{deleteDocumentChildCount}
			{showTaskCreateModal}
			{editingTaskId}
			{showPlanCreateModal}
			{editingPlanId}
			{showGoalCreateModal}
			{editingGoalId}
			{showRiskCreateModal}
			{editingRiskId}
			{showMilestoneCreateModal}
			{milestoneCreateGoalContext}
			{editingMilestoneId}
			{showEventCreateModal}
			{editingEventId}
			{showProjectCalendarModal}
			{showProjectEditModal}
			{showCollabModal}
			{showDeleteProjectModal}
			{isDeletingProject}
			{deleteProjectError}
			{showGraphModal}
			onCloseDocumentModal={closeDocumentModal}
			onDocumentSaved={handleDocumentSaved}
			onDocumentDeleted={handleDocumentDeleted}
			onCloseMoveDocModal={closeMoveDocumentModal}
			onMoveDocumentConfirm={handleMoveDocumentConfirm}
			onCloseDeleteDocConfirmModal={closeDeleteDocumentConfirmModal}
			onDeleteDocumentConfirm={handleDeleteDocumentConfirm}
			onCloseTaskCreateModal={() => (showTaskCreateModal = false)}
			onTaskCreated={handleTaskCreated}
			onCloseTaskEditModal={() => (editingTaskId = null)}
			onTaskUpdated={handleTaskUpdated}
			onTaskDeleted={handleTaskDeleted}
			onClosePlanCreateModal={() => (showPlanCreateModal = false)}
			onPlanCreated={handlePlanCreated}
			onClosePlanEditModal={() => (editingPlanId = null)}
			onPlanUpdated={handlePlanUpdated}
			onPlanDeleted={handlePlanDeleted}
			onCloseGoalCreateModal={() => (showGoalCreateModal = false)}
			onGoalCreated={handleGoalCreated}
			onCloseGoalEditModal={() => (editingGoalId = null)}
			onGoalUpdated={handleGoalUpdated}
			onGoalDeleted={handleGoalDeleted}
			onCloseRiskCreateModal={() => (showRiskCreateModal = false)}
			onRiskCreated={handleRiskCreated}
			onCloseRiskEditModal={() => (editingRiskId = null)}
			onRiskUpdated={handleRiskUpdated}
			onRiskDeleted={handleRiskDeleted}
			onCloseMilestoneCreateModal={closeMilestoneCreateModal}
			onMilestoneCreated={handleMilestoneCreated}
			onCloseMilestoneEditModal={() => (editingMilestoneId = null)}
			onMilestoneUpdated={handleMilestoneUpdated}
			onMilestoneDeleted={handleMilestoneDeleted}
			onCloseEventCreateModal={() => (showEventCreateModal = false)}
			onEventCreated={handleEventCreated}
			onCloseEventEditModal={() => (editingEventId = null)}
			onEventUpdated={handleEventUpdated}
			onEventDeleted={handleEventDeleted}
			onCloseProjectCalendarModal={closeProjectCalendarModal}
			onCloseProjectEditModal={closeProjectEditModal}
			onProjectSaved={handleProjectSaved}
			onCloseCollabModal={closeCollabModal}
			onLeftProject={handleCollaborationLeftProject}
			onCollaborationMembersChanged={handleCollaborationMembersChanged}
			onProjectDeleteConfirm={handleProjectDeleteConfirm}
			onCancelProjectDelete={cancelDeleteProjectModal}
			onCloseGraphModal={closeGraphModal}
			onGraphNodeClick={handleGraphNodeClick}
		/>
	{/await}
{/if}

<ProjectEventsModal
	isOpen={showEventsModal}
	{events}
	{canEdit}
	onClose={closeEventsModal}
	onAddEvent={openEventCreateFromEventsModal}
	onSelectEvent={openEventFromEventsModal}
/>

<RecentProjectChatsModal
	isOpen={showRecentChatsModal}
	projectId={project.id}
	projectName={project.name}
	onClose={closeRecentChatsModal}
	onSelectChat={handleRecentChatSelected}
/>

{#if showRecentChatAgentModal && selectedRecentChatSessionId && AgentChatModalComponent}
	<AgentChatModalComponent
		isOpen={showRecentChatAgentModal}
		initialChatSessionId={selectedRecentChatSessionId}
		onClose={closeRecentChatAgentModal}
	/>
{/if}

<!-- Header settings menu portal -->
{#if showSettingsMenu}
	<button
		type="button"
		class="fixed inset-0 z-[9998] bg-transparent"
		onclick={() => (showSettingsMenu = false)}
		aria-label="Close menu"
	></button>
	<div
		class="fixed z-[9999] w-56 rounded-lg border border-border bg-card shadow-ink-strong py-1"
		style="top: {settingsMenuPos.top}px; right: {settingsMenuPos.right}px;"
	>
		{#if canOpenCollabModal}
			<button
				onclick={() => {
					showSettingsMenu = false;
					void handleProjectNotificationQuickToggle();
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable disabled:opacity-60 disabled:cursor-not-allowed"
				disabled={isNotificationSettingsSaving ||
					isNotificationSettingsLoading ||
					!projectNotificationSettings}
			>
				{#if projectNotificationSettings?.member_enabled}
					<Bell class="w-4 h-4 text-muted-foreground" />
				{:else}
					<BellOff class="w-4 h-4 text-muted-foreground" />
				{/if}
				{isNotificationSettingsSaving
					? 'Saving notifications...'
					: projectNotificationSettings?.member_enabled
						? 'Turn notifications off'
						: 'Turn notifications on'}
			</button>
		{/if}
		{#if canOpenCollabModal}
			<button
				onclick={() => {
					showSettingsMenu = false;
					void ensureProjectNotificationSettingsLoaded();
					showCollabModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable"
			>
				<Users class="w-4 h-4 text-muted-foreground" />
				Collaboration settings
			</button>
		{/if}
		<button
			onclick={() => {
				showSettingsMenu = false;
				showGraphModal = true;
			}}
			class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable"
		>
			<GitBranch class="w-4 h-4 text-muted-foreground" />
			Open graph
		</button>
		{#if canEdit}
			<button
				onclick={() => {
					showSettingsMenu = false;
					showProjectEditModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable"
			>
				<Pencil class="w-4 h-4 text-muted-foreground" />
				Edit project
			</button>
			<button
				onclick={() => {
					showSettingsMenu = false;
					showProjectCalendarModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable"
			>
				<Calendar class="w-4 h-4 text-muted-foreground" />
				Calendar
			</button>
		{/if}
		{#if canDeleteProject}
			<hr class="my-1 border-border" />
			<button
				onclick={() => {
					showSettingsMenu = false;
					showDeleteProjectModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors pressable"
			>
				<Trash2 class="w-4 h-4" />
				Delete project
			</button>
		{/if}
	</div>
{/if}
