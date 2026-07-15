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

	The data loader preserves skeleton-first rendering while the server starts
	the full v2 payload and streams its promise to the client. Modals are rendered through
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
	import {
		collectDocIds,
		normalizeDocumentState,
		parseDocStructure
	} from '$lib/services/ontology/doc-structure.service';
	import ProjectHeaderCard from '$lib/components/project/ProjectHeaderCard.svelte';
	import PulseStrip from '$lib/components/project/v2/PulseStrip.svelte';
	import EntityTabStrip from '$lib/components/project/v2/EntityTabStrip.svelte';
	import ProjectEntitySearchCombobox from '$lib/components/project/v2/ProjectEntitySearchCombobox.svelte';
	import ProjectMemoryCard from '$lib/components/project/ProjectMemoryCard.svelte';
	import { trackLoopEvent } from '$lib/services/loop-telemetry';
	import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
	import {
		archiveProjectDocument,
		deleteProject,
		fetchProjectDocument,
		fetchProjectEvents,
		fetchProjectFullData,
		fetchProjectGoal,
		fetchProjectMilestone,
		fetchProjectNotificationSettings,
		fetchProjectPlan,
		fetchProjectRisk,
		fetchProjectSnapshot,
		fetchProjectTask,
		moveProjectDocument,
		updateProjectNotificationSettings,
		type DeferredProjectFullData,
		type OntoEventWithSync,
		type ProjectFullData,
		type ProjectNotificationSettings
	} from '$lib/components/project/project-page-data-controller';
	import { resolveEntityOpenAction } from '$lib/components/project/project-page-interactions';
	import { preloadProjectEntityModal } from '$lib/components/project/project-entity-modal-loader';
	import { Bell, BellOff, Calendar, Pencil, Trash2, Users } from 'lucide-svelte';
	import type { Project, Task, Document, Plan, Goal, Milestone, Risk } from '$lib/types/onto';
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
	let deferredProjectDataLoad = $state<PageData | null>(null);

	let project = $state.raw<Project>(projectFromPageData(initialData));
	let tasks = $state.raw<Task[]>(
		initialData.skeleton ? [] : ((initialData.tasks ?? []) as Task[])
	);
	let documents = $state.raw<Document[]>(
		initialData.skeleton ? [] : ((initialData.documents ?? []) as Document[])
	);
	let plans = $state.raw<Plan[]>(
		initialData.skeleton ? [] : ((initialData.plans ?? []) as Plan[])
	);
	let goals = $state.raw<Goal[]>(
		initialData.skeleton ? [] : ((initialData.goals ?? []) as Goal[])
	);
	let milestones = $state.raw<Milestone[]>(
		initialData.skeleton ? [] : ((initialData.milestones ?? []) as Milestone[])
	);
	let risks = $state.raw<Risk[]>(
		initialData.skeleton ? [] : ((initialData.risks ?? []) as Risk[])
	);
	let events = $state.raw<OntoEventWithSync[]>(
		initialData.skeleton ? [] : ((initialData.events ?? []) as OntoEventWithSync[])
	);
	let hasCompleteProjectEvents = $state(
		initialData.skeleton ? false : (initialData.events_coverage?.complete ?? true)
	);
	let isProjectEventsLoading = $state(false);
	let projectEventsRequestId = 0;
	let contextDocument = $state.raw<Document | null>(
		initialData.skeleton ? null : ((initialData.context_document ?? null) as Document | null)
	);
	let isContextDocumentContentLoading = $state(false);
	let contextDocumentContentRequestId = 0;
	let canLoadSecondaryProjectRequests = $state(false);
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
		hasCompleteProjectEvents = sourceData.skeleton
			? false
			: (sourceData.events_coverage?.complete ?? true);
		isProjectEventsLoading = false;
		projectEventsRequestId += 1;
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
	type ProjectEventsModalLazy =
		| typeof import('$lib/components/project/ProjectEventsModal.svelte').default
		| null;
	type RecentProjectChatsModalLazy =
		| typeof import('$lib/components/project/RecentProjectChatsModal.svelte').default
		| null;
	let showEventsModal = $state(false);
	let showRecentChatsModal = $state(false);
	let showRecentChatAgentModal = $state(false);
	let selectedRecentChatSessionId = $state<string | null>(null);
	let AgentChatModalComponent = $state<AgentChatModalLazy>(null);
	let ProjectEventsModalComponent = $state<ProjectEventsModalLazy>(null);
	let RecentProjectChatsModalComponent = $state<RecentProjectChatsModalLazy>(null);

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default;
		}
		return AgentChatModalComponent;
	}

	async function loadProjectEventsModal() {
		if (!ProjectEventsModalComponent) {
			const mod = await import('$lib/components/project/ProjectEventsModal.svelte');
			ProjectEventsModalComponent = mod.default;
		}
		return ProjectEventsModalComponent;
	}

	async function loadRecentProjectChatsModal() {
		if (!RecentProjectChatsModalComponent) {
			const mod = await import('$lib/components/project/RecentProjectChatsModal.svelte');
			RecentProjectChatsModalComponent = mod.default;
		}
		return RecentProjectChatsModalComponent;
	}

	// ============================================================
	// HEADER SETTINGS MENU PORTAL
	// ============================================================

	let showSettingsMenu = $state(false);
	let settingsMenuPos = $state({ top: 0, right: 0 });
	let settingsMenuRef = $state<HTMLDivElement | null>(null);
	// Element that opened the menu, so Escape/close can restore focus to it
	// (keyboard menu pattern — the trigger lives in ProjectHeaderCard).
	let settingsMenuTrigger: HTMLElement | null = null;

	function settingsMenuItems(): HTMLElement[] {
		if (!settingsMenuRef) return [];
		return Array.from(
			settingsMenuRef.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
		);
	}

	function closeSettingsMenu() {
		showSettingsMenu = false;
		settingsMenuTrigger?.focus?.();
	}

	function handleSettingsMenuKeydown(event: KeyboardEvent) {
		const items = settingsMenuItems();
		if (items.length === 0) return;
		const currentIndex = items.indexOf(document.activeElement as HTMLElement);
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				items[(currentIndex + 1 + items.length) % items.length]?.focus();
				break;
			case 'ArrowUp':
				event.preventDefault();
				items[(currentIndex - 1 + items.length) % items.length]?.focus();
				break;
			case 'Home':
				event.preventDefault();
				items[0]?.focus();
				break;
			case 'End':
				event.preventDefault();
				items[items.length - 1]?.focus();
				break;
			case 'Escape':
				event.preventDefault();
				closeSettingsMenu();
				break;
		}
	}

	// Move focus into the menu when it opens so it's keyboard-operable.
	$effect(() => {
		if (showSettingsMenu && settingsMenuRef) {
			settingsMenuItems()[0]?.focus();
		}
	});

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

	async function resolveInitialFullData(
		sourceData: PageData,
		bypassDeferredData: boolean
	): Promise<ProjectFullData> {
		if (sourceData.skeleton && !bypassDeferredData) {
			const result: DeferredProjectFullData = await sourceData.deferredFullData;
			if (result.ok) return result.data;
			throw new Error(result.error);
		}

		return fetchProjectFullData(sourceData.projectId, { profile: 'v2-initial' });
	}

	async function hydrateFullData(
		sourceData: PageData = data,
		{ bypassDeferredData = false }: { bypassDeferredData?: boolean } = {}
	) {
		if (!sourceData.skeleton) return;
		const projectId = sourceData.projectId;
		try {
			const fullData = await resolveInitialFullData(sourceData, bypassDeferredData);
			if (data.projectId !== projectId) return;
			project = (fullData.project as Project) || project;
			tasks = (fullData.tasks ?? []) as Task[];
			documents = (fullData.documents ?? []) as Document[];
			plans = (fullData.plans ?? []) as Plan[];
			goals = (fullData.goals ?? []) as Goal[];
			milestones = (fullData.milestones ?? []) as Milestone[];
			risks = (fullData.risks ?? []) as Risk[];
			events = (fullData.events ?? []) as OntoEventWithSync[];
			hasCompleteProjectEvents = fullData.events_coverage?.complete ?? true;
			contextDocument = mergeContextDocumentFromPayload(fullData.context_document);
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
			const fullData = await fetchProjectSnapshot(projectId, { profile: 'v2-initial' });
			if (data.projectId !== projectId) return;
			project = (fullData.project as Project) || project;
			tasks = (fullData.tasks ?? []) as Task[];
			documents = (fullData.documents ?? []) as Document[];
			plans = (fullData.plans ?? []) as Plan[];
			goals = (fullData.goals ?? []) as Goal[];
			milestones = (fullData.milestones ?? []) as Milestone[];
			risks = (fullData.risks ?? []) as Risk[];
			contextDocument = mergeContextDocumentFromPayload(fullData.context_document);
			if (Array.isArray(fullData.events)) {
				events = fullData.events as OntoEventWithSync[];
				hasCompleteProjectEvents = fullData.events_coverage?.complete ?? true;
			} else {
				await loadProjectEvents();
			}
			applyDocTreeSeed(buildDocTreeSeed(fullData.project as Project, documents));
		} catch (err) {
			console.warn('[Project v2] Silent refresh failed:', err);
		}
	}

	function upsertById<T extends { id: string }>(items: T[], nextItem: T): T[] {
		const index = items.findIndex((item) => item.id === nextItem.id);
		if (index === -1) return [nextItem, ...items];
		return items.map((item) => (item.id === nextItem.id ? nextItem : item));
	}

	async function refreshTaskById(taskId: string) {
		try {
			const task = await fetchProjectTask(taskId);
			tasks = upsertById(tasks, task);
		} catch (err) {
			console.warn('[Project v2] Failed to refresh task; falling back to snapshot:', err);
			await refreshSilently();
		}
	}

	async function refreshPlanById(planId: string) {
		try {
			const plan = await fetchProjectPlan(planId);
			plans = upsertById(plans, plan);
		} catch (err) {
			console.warn('[Project v2] Failed to refresh plan; falling back to snapshot:', err);
			await refreshSilently();
		}
	}

	async function refreshGoalById(goalId: string) {
		try {
			const goal = await fetchProjectGoal(goalId);
			goals = upsertById(goals, goal);
		} catch (err) {
			console.warn('[Project v2] Failed to refresh goal; falling back to snapshot:', err);
			await refreshSilently();
		}
	}

	async function refreshRiskById(riskId: string) {
		try {
			const risk = await fetchProjectRisk(riskId);
			risks = upsertById(risks, risk);
		} catch (err) {
			console.warn('[Project v2] Failed to refresh risk; falling back to snapshot:', err);
			await refreshSilently();
		}
	}

	async function refreshMilestoneById(milestoneId: string, goalId: string | null = null) {
		try {
			const fetchedMilestone = await fetchProjectMilestone(milestoneId);
			const existingMilestone = milestones.find((milestone) => milestone.id === milestoneId);
			const milestone = {
				...existingMilestone,
				...fetchedMilestone,
				goal_id:
					(fetchedMilestone as Milestone).goal_id ?? existingMilestone?.goal_id ?? goalId
			} as Milestone;
			milestones = upsertById(milestones, milestone);
		} catch (err) {
			console.warn(
				'[Project v2] Failed to refresh milestone; falling back to snapshot:',
				err
			);
			await refreshSilently();
		}
	}

	function hasContextDocumentContent(document: Document | null): boolean {
		if (!document) return true;
		// Only the content column counts: props.body_markdown is a legacy copy
		// that predates the managed status/map regions, so treating it as
		// loaded leaves the memory card (and edit modal) on a stale body.
		return typeof document.content === 'string';
	}

	function mergeContextDocumentFromPayload(value: unknown): Document | null {
		const nextDocument = (value ?? null) as Document | null;
		if (!nextDocument) return null;
		const currentDocument = contextDocument;
		if (
			currentDocument?.id === nextDocument.id &&
			hasContextDocumentContent(currentDocument) &&
			!hasContextDocumentContent(nextDocument)
		) {
			return {
				...nextDocument,
				content: currentDocument.content,
				props: nextDocument.props ?? currentDocument.props
			};
		}
		return nextDocument;
	}

	async function ensureContextDocumentContentLoaded() {
		const documentId = contextDocument?.id;
		if (
			!documentId ||
			hasContextDocumentContent(contextDocument) ||
			isContextDocumentContentLoading
		) {
			return;
		}
		const requestId = ++contextDocumentContentRequestId;
		isContextDocumentContentLoading = true;
		try {
			const loadedDocument = await fetchProjectDocument(documentId);
			if (
				contextDocument?.id !== documentId ||
				requestId !== contextDocumentContentRequestId
			) {
				return;
			}
			contextDocument = {
				...contextDocument,
				...loadedDocument
			};
		} catch (err) {
			console.warn('[Project v2] Failed to load context document content:', err);
		} finally {
			if (requestId === contextDocumentContentRequestId) {
				isContextDocumentContentLoading = false;
			}
		}
	}

	async function loadProjectEvents(showToast = false, projectId = project?.id) {
		if (!projectId) return;
		const requestId = ++projectEventsRequestId;
		isProjectEventsLoading = true;
		try {
			const loadedEvents = await fetchProjectEvents(projectId);
			if (data.projectId !== projectId || requestId !== projectEventsRequestId) return;
			events = loadedEvents;
			hasCompleteProjectEvents = true;
		} catch (err) {
			if (data.projectId !== projectId || requestId !== projectEventsRequestId) return;
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
		} finally {
			if (data.projectId === projectId && requestId === projectEventsRequestId) {
				isProjectEventsLoading = false;
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

	function resumeDeferredProjectDataLoading() {
		const pendingData = deferredProjectDataLoad;
		if (!pendingData) return;
		deferredProjectDataLoad = null;
		startProjectDataLoading(pendingData);
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

	$effect(() => {
		if (isHydrating || !project?.id) {
			canLoadSecondaryProjectRequests = false;
			return;
		}

		const activeProjectId = project.id;
		canLoadSecondaryProjectRequests = false;
		if (typeof window === 'undefined') return;

		const allowSecondaryRequests = () => {
			if (project?.id === activeProjectId && !isHydrating) {
				canLoadSecondaryProjectRequests = true;
			}
		};

		const requestIdleCallback = window.requestIdleCallback?.bind(window);
		const cancelIdleCallback = window.cancelIdleCallback?.bind(window);
		if (requestIdleCallback && cancelIdleCallback) {
			const idleId = requestIdleCallback(allowSecondaryRequests, { timeout: 1500 });
			return () => cancelIdleCallback(idleId);
		}

		const timerId = setTimeout(allowSecondaryRequests, 600);
		return () => clearTimeout(timerId);
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

	$effect(() => {
		if (!showProjectEditModal) return;
		untrack(() => void ensureContextDocumentContentLoaded());
	});

	// The memory card previews the Start Here body, so pull the lazily-loaded
	// content as soon as hydration lands a context document.
	$effect(() => {
		if (isHydrating || !contextDocument?.id) return;
		untrack(() => void ensureContextDocumentContentLoaded());
	});

	// Return-loop telemetry (activation plan Phase 2): one project_opened per
	// project id per page instance. First-open vs reopen is derived in PostHog
	// from per-user event history, not client state.
	let trackedOpenedProjectId: string | null = null;
	$effect(() => {
		const projectId = data.projectId;
		if (!projectId || trackedOpenedProjectId === projectId) return;
		trackedOpenedProjectId = projectId;
		untrack(() =>
			trackLoopEvent('project_opened', 'project', {
				project_id: projectId
			})
		);
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

	function preloadInitialEntitySurface(entityType: string) {
		void Promise.all([
			import('$lib/components/project/ProjectModalsHost.svelte'),
			preloadProjectEntityModal(entityType)
		]).catch((error) => {
			console.warn('[Project v2] Failed to preload entity modal:', error);
		});
	}

	function shouldPrioritizeInitialEntityModal(entityType: string): boolean {
		return (
			entityType === 'task' ||
			entityType === 'document' ||
			entityType === 'note' ||
			entityType === 'goal' ||
			entityType === 'plan'
		);
	}

	onMount(() => {
		let openedInitialEntity = false;
		// Open an entity via query params (used by notifications and OwnerBar "Edit original")
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			const docId = params.get('doc');
			const entityType = params.get('entity');
			const entityId = params.get('entity_id') ?? params.get('id');
			if (docId) {
				preloadInitialEntitySurface('document');
				activeDocumentId = docId;
				showDocumentModal = true;
				openedInitialEntity = true;
				const cleanUrl = window.location.pathname + window.location.hash;
				window.history.replaceState({}, '', cleanUrl);
			} else if (entityType && entityId) {
				preloadInitialEntitySurface(entityType);
				const result = openEntityEditor(entityType, entityId);
				if (result === 'opened') {
					openedInitialEntity = shouldPrioritizeInitialEntityModal(entityType);
					const cleanUrl = window.location.pathname + window.location.hash;
					window.history.replaceState({}, '', cleanUrl);
				}
			}
		}

		if (openedInitialEntity && data.skeleton) {
			deferredProjectDataLoad = data;
		} else {
			startProjectDataLoading(data);
		}
	});

	// ============================================================
	// HEADER MENU
	// ============================================================

	function handleHeaderMenuOpen(position: { top: number; right: number }) {
		settingsMenuPos = position;
		settingsMenuTrigger =
			typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null;
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
		resumeDeferredProjectDataLoading();
	}

	function closeTaskEditModal() {
		editingTaskId = null;
		resumeDeferredProjectDataLoading();
	}

	function closePlanEditModal() {
		editingPlanId = null;
		resumeDeferredProjectDataLoading();
	}

	function closeGoalEditModal() {
		editingGoalId = null;
		resumeDeferredProjectDataLoading();
	}

	function closeMoveDocumentModal() {
		showMoveDocModal = false;
		moveDocumentId = null;
	}

	function closeDeleteDocumentConfirmModal() {
		showDeleteDocConfirmModal = false;
		deleteDocumentId = null;
	}

	function handleDocumentSaved() {
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
		const nextDocumentsById = new Map<string, Document>();
		for (const doc of [
			...Object.values(loaded.documents),
			...(loaded.unlinked ?? []),
			...(loaded.archived ?? [])
		]) {
			nextDocumentsById.set(doc.id, doc as unknown as Document);
		}
		documents = Array.from(nextDocumentsById.values());
	}

	// ============================================================
	// ENTITY HANDLERS — Tasks
	// ============================================================

	function handleTaskCreated(taskId: string) {
		toastService.success('Task created');
		showTaskCreateModal = false;
		editingTaskId = taskId;
		void refreshTaskById(taskId);
	}

	function handleTaskUpdated() {
		const taskId = editingTaskId;
		editingTaskId = null;
		if (taskId) {
			void refreshTaskById(taskId);
		} else {
			void refreshSilently();
		}
	}

	function handleTaskDeleted() {
		const deletedId = editingTaskId;
		if (deletedId) tasks = tasks.filter((t) => t.id !== deletedId);
		editingTaskId = null;
	}

	function handleTaskMoved(taskId: string, newState: Task['state_key'] | 'archived') {
		let matchedExistingTask = false;
		if (newState === 'archived') {
			tasks = tasks.filter((task) => {
				const keep = task.id !== taskId;
				if (!keep) matchedExistingTask = true;
				return keep;
			});
			return;
		}

		const completedAt = newState === 'done' ? new Date().toISOString() : null;
		tasks = tasks.map((task) => {
			if (task.id !== taskId) return task;
			matchedExistingTask = true;
			return {
				...task,
				deleted_at: null,
				state_key: newState,
				completed_at: newState === 'done' ? (task.completed_at ?? completedAt) : null,
				updated_at: new Date().toISOString()
			};
		});

		if (!matchedExistingTask) {
			void refreshSilently();
		}
	}

	// ============================================================
	// ENTITY HANDLERS — Plans / Goals / Risks / Milestones / Events
	// ============================================================

	function handlePlanCreated(planId: string) {
		toastService.success('Plan created');
		showPlanCreateModal = false;
		editingPlanId = planId;
		void refreshPlanById(planId);
	}
	function handlePlanUpdated() {
		const planId = editingPlanId;
		editingPlanId = null;
		if (planId) {
			void refreshPlanById(planId);
		} else {
			void refreshSilently();
		}
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
		void refreshGoalById(goalId);
	}
	function handleGoalUpdated() {
		const goalId = editingGoalId;
		editingGoalId = null;
		if (goalId) {
			void refreshGoalById(goalId);
		} else {
			void refreshSilently();
		}
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
		void refreshRiskById(riskId);
	}
	function handleRiskUpdated() {
		const riskId = editingRiskId;
		editingRiskId = null;
		if (riskId) {
			void refreshRiskById(riskId);
		} else {
			void refreshSilently();
		}
	}
	function handleRiskDeleted() {
		const id = editingRiskId;
		if (id) risks = risks.filter((r) => r.id !== id);
		editingRiskId = null;
	}

	function handleMilestoneCreated(milestoneId: string) {
		const goalId = milestoneCreateGoalContext?.goalId ?? null;
		toastService.success('Milestone created');
		showMilestoneCreateModal = false;
		milestoneCreateGoalContext = null;
		editingMilestoneId = milestoneId;
		void refreshMilestoneById(milestoneId, goalId);
	}
	function handleMilestoneUpdated() {
		const milestoneId = editingMilestoneId;
		editingMilestoneId = null;
		if (milestoneId) {
			void refreshMilestoneById(milestoneId);
		} else {
			void refreshSilently();
		}
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
		if (!hasCompleteProjectEvents && !isProjectEventsLoading) {
			void loadProjectEvents(true);
		}
		void loadProjectEventsModal().catch((error) => {
			showEventsModal = false;
			console.error('[Project v2] Failed to load events modal:', error);
			toastService.error('Failed to open project events');
		});
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
	// Memory card (Start Here snapshot) — activation plan Phase 2.
	let showMemoryUpdateChatModal = $state(false);

	function handleOpenStartHereFromMemoryCard(docId: string) {
		trackLoopEvent('start_here_opened', 'project', {
			project_id: data.projectId,
			document_id: docId,
			source: 'memory_card'
		});
		handleOpenDocument(docId);
	}
	async function handleUpdateProjectFromMemoryCard() {
		trackLoopEvent('memory_update_started', 'project', { project_id: data.projectId });
		await loadAgentChatModal();
		showMemoryUpdateChatModal = true;
	}
	function closeMemoryUpdateChatModal(_summary?: DataMutationSummary) {
		showMemoryUpdateChatModal = false;
		// Refresh is handled globally via the dataMutationEvents subscription above.
	}
	function handleMemorySnapshotShown(info: {
		documentId: string;
		rendered: boolean;
		freshness: string;
	}) {
		trackLoopEvent('memory_snapshot_shown', 'project', {
			project_id: data.projectId,
			document_id: info.documentId,
			rendered: info.rendered,
			freshness: info.freshness
		});
	}

	function openRecentChatsModal() {
		showRecentChatsModal = true;
		void loadRecentProjectChatsModal().catch((error) => {
			showRecentChatsModal = false;
			console.error('[Project v2] Failed to load recent chats modal:', error);
			toastService.error('Failed to open recent chats');
		});
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

	let hasResolvedTaskViewport = $state(false);
	let isDesktopTaskViewport = $state(false);

	$effect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
		const mq = window.matchMedia('(min-width: 640px)');
		const syncTaskViewport = () => {
			isDesktopTaskViewport = mq.matches;
			hasResolvedTaskViewport = true;
		};
		syncTaskViewport();
		mq.addEventListener('change', syncTaskViewport);
		return () => mq.removeEventListener('change', syncTaskViewport);
	});
</script>

<svelte:head>
	<title>{project?.name || 'Project'} | BuildOS</title>
</svelte:head>

{#snippet taskBoardSkeleton()}
	<div class="sm:hidden mb-2">
		<div
			class="min-h-[260px] bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak animate-pulse"
		></div>
	</div>
	<div class="hidden sm:block">
		<div
			class="min-h-[300px] bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		>
			<div class="px-3 sm:px-4 py-2.5 border-b border-border/60">
				<div class="h-3.5 w-24 bg-muted rounded animate-pulse"></div>
			</div>
			<div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-3">
				{#each Array(4) as _, i (i)}
					<div class="space-y-2">
						<div class="h-4 w-20 bg-muted rounded animate-pulse"></div>
						<div class="h-40 bg-muted/40 rounded-md animate-pulse"></div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/snippet}

{#snippet documentsSectionSkeleton()}
	<div class="mt-2 sm:mt-3">
		<div
			class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		>
			<div class="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-3">
				<div
					class="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-muted/40 animate-pulse shrink-0"
				></div>
				<div class="space-y-1.5">
					<div class="h-3.5 w-24 bg-muted rounded animate-pulse"></div>
					<div class="h-2.5 w-16 bg-muted/40 rounded animate-pulse"></div>
				</div>
			</div>
		</div>
	</div>
{/snippet}

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

	<div class="mx-auto max-w-7xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 lg:py-6 overflow-x-hidden">
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
						void hydrateFullData(data, { bypassDeferredData: true });
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
					loadActivity={canLoadSecondaryProjectRequests}
					onOpenEntity={handleEntityClick}
				/>
			</div>
		{/if}

		<!-- Start Here / project memory snapshot (activation plan Phase 2).
			 Previews canonical memory and deep-links into the Start Here doc;
			 /today keeps ownership of event-level change receipts. -->
		{#if !isHydrating && contextDocument}
			<div class="mb-2 sm:mb-3">
				<ProjectMemoryCard
					document={contextDocument}
					contentLoading={isContextDocumentContentLoading}
					nextStepShort={project?.next_step_short ?? null}
					{canEdit}
					onOpenStartHere={handleOpenStartHereFromMemoryCard}
					onUpdateProject={handleUpdateProjectFromMemoryCard}
					onShown={handleMemorySnapshotShown}
				/>
			</div>
		{/if}

		{#if isHydrating}
			<div class="mb-2 sm:mb-3">
				<div
					class="rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak p-2 sm:p-2.5"
				>
					<div class="h-10 rounded-lg bg-muted/40 animate-pulse"></div>
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

		{#if PROJECT_LOOPS_ENABLED}
			<div class="mb-2 sm:mb-3">
				{#if canLoadSecondaryProjectRequests}
					{#await import('$lib/components/project/ProjectAuditTracker.svelte')}
						<div
							class="h-16 rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak animate-pulse"
							aria-hidden="true"
						></div>
					{:then { default: ProjectAuditTracker }}
						<ProjectAuditTracker projectId={project.id} {canEdit} />
					{/await}
				{:else}
					<div
						class="h-16 rounded-lg border border-border bg-card shadow-ink tx tx-frame tx-weak animate-pulse"
						aria-hidden="true"
					></div>
				{/if}
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
					loadInboxPreview={canLoadSecondaryProjectRequests}
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

		<!-- Task board: keep the responsive skeleton SSR-safe, then mount only
			 the active board once the browser viewport is known. -->
		{#if isHydrating || !hasResolvedTaskViewport}
			{@render taskBoardSkeleton()}
		{:else if isDesktopTaskViewport}
			{#await import('$lib/components/project/v2/TaskKanbanBoard.svelte')}
				{@render taskBoardSkeleton()}
			{:then { default: TaskKanbanBoard }}
				<TaskKanbanBoard
					projectId={project.id}
					{tasks}
					{canEdit}
					onEditTask={(id) => (editingTaskId = id)}
					onCreateTask={() => (showTaskCreateModal = true)}
					onTaskMoved={handleTaskMoved}
				/>
			{/await}
		{:else}
			{#await import('$lib/components/project/v2/MobileTaskBoard.svelte')}
				{@render taskBoardSkeleton()}
			{:then { default: MobileTaskBoard }}
				<div class="mb-2" in:fade={fadeIn} out:fade={fadeOut}>
					<MobileTaskBoard
						projectId={project.id}
						{tasks}
						{canEdit}
						onEditTask={(id) => (editingTaskId = id)}
						onCreateTask={() => (showTaskCreateModal = true)}
					/>
				</div>
			{/await}
		{/if}

		<!-- Documents (shared mobile + desktop) -->
		{#if !isHydrating}
			{#await import('$lib/components/project/ProjectDocumentsSection.svelte')}
				{@render documentsSectionSkeleton()}
			{:then { default: ProjectDocumentsSection }}
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
						pollInterval={canLoadSecondaryProjectRequests ? 30000 : 0}
						onTreeRefChange={(ref) => {
							docTreeViewRef = ref;
						}}
					/>
				</div>
			{/await}
		{:else}
			<!-- Reserve the section header while project data or its code chunk loads. -->
			{@render documentsSectionSkeleton()}
		{/if}
	</div>
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
			onCloseTaskEditModal={closeTaskEditModal}
			onTaskUpdated={handleTaskUpdated}
			onTaskDeleted={handleTaskDeleted}
			onClosePlanCreateModal={() => (showPlanCreateModal = false)}
			onPlanCreated={handlePlanCreated}
			onClosePlanEditModal={closePlanEditModal}
			onPlanUpdated={handlePlanUpdated}
			onPlanDeleted={handlePlanDeleted}
			onCloseGoalCreateModal={() => (showGoalCreateModal = false)}
			onGoalCreated={handleGoalCreated}
			onCloseGoalEditModal={closeGoalEditModal}
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
			onEntityModalLoaded={resumeDeferredProjectDataLoading}
		/>
	{/await}
{/if}

{#if ProjectEventsModalComponent}
	<ProjectEventsModalComponent
		isOpen={showEventsModal}
		{events}
		loading={isProjectEventsLoading}
		{canEdit}
		onClose={closeEventsModal}
		onAddEvent={openEventCreateFromEventsModal}
		onSelectEvent={openEventFromEventsModal}
	/>
{/if}

{#if RecentProjectChatsModalComponent}
	<RecentProjectChatsModalComponent
		isOpen={showRecentChatsModal}
		projectId={project.id}
		projectName={project.name}
		onClose={closeRecentChatsModal}
		onSelectChat={handleRecentChatSelected}
	/>
{/if}

{#if showRecentChatAgentModal && selectedRecentChatSessionId && AgentChatModalComponent}
	<AgentChatModalComponent
		isOpen={showRecentChatAgentModal}
		initialChatSessionId={selectedRecentChatSessionId}
		onClose={closeRecentChatAgentModal}
	/>
{/if}

<!-- "Update project" from the memory card: fresh project-context chat whose
	 mutations flow back through dataMutationEvents (and, at session end, the
	 Start Here capture proposal path). -->
{#if showMemoryUpdateChatModal && AgentChatModalComponent}
	<AgentChatModalComponent
		isOpen={showMemoryUpdateChatModal}
		contextType="project"
		entityId={data.projectId}
		onClose={closeMemoryUpdateChatModal}
	/>
{/if}

<!-- Header settings menu portal -->
{#if showSettingsMenu}
	<!-- Backdrop: tabindex=-1 + aria-hidden so it never sits in the keyboard
		 tab order (Hyperplexed S3 — the full-screen close target was a real
		 tab stop). Click anywhere outside to dismiss. -->
	<button
		type="button"
		tabindex="-1"
		aria-hidden="true"
		class="fixed inset-0 z-[9998] bg-transparent"
		onclick={closeSettingsMenu}
	></button>
	<div
		bind:this={settingsMenuRef}
		role="menu"
		aria-label="Project options"
		tabindex="-1"
		onkeydown={handleSettingsMenuKeydown}
		class="fixed z-[9999] w-56 rounded-lg border border-border bg-card shadow-ink-strong py-1"
		style="top: {settingsMenuPos.top}px; right: {settingsMenuPos.right}px;"
	>
		{#if canOpenCollabModal}
			<button
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					showSettingsMenu = false;
					void handleProjectNotificationQuickToggle();
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60 disabled:cursor-not-allowed"
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
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					showSettingsMenu = false;
					void ensureProjectNotificationSettingsLoaded();
					showCollabModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<Users class="w-4 h-4 text-muted-foreground" />
				Collaboration settings
			</button>
		{/if}
		{#if canEdit}
			<button
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					showSettingsMenu = false;
					showProjectEditModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<Pencil class="w-4 h-4 text-muted-foreground" />
				Edit project
			</button>
			<button
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					showSettingsMenu = false;
					showProjectCalendarModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-foreground hover:bg-muted transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<Calendar class="w-4 h-4 text-muted-foreground" />
				Calendar
			</button>
		{/if}
		{#if canDeleteProject}
			<hr class="my-1 border-border" />
			<button
				role="menuitem"
				tabindex="-1"
				onclick={() => {
					showSettingsMenu = false;
					showDeleteProjectModal = true;
				}}
				class="w-full flex items-center gap-3 px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			>
				<Trash2 class="w-4 h-4" />
				Delete project
			</button>
		{/if}
	</div>
{/if}
