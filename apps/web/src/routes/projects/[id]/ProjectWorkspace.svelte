<!-- apps/web/src/routes/projects/[id]/ProjectWorkspace.svelte -->
<!--
	Project workspace prototype body

	Information architecture:
	- Overview is the default project map: trajectory, direction, milestones, and risks.
	- Tasks is the operating surface: the real Kanban board.
	- Docs gives the real document tree a dedicated, full-width workspace.
	- Activity owns change history and upcoming events.

	The route intentionally reuses the production project loader and existing task/document
	editors. It is a live prototype, not a static mock.
-->
<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import {
		dataMutationEvents,
		mutationAffectsProject,
		notifyDataMutation
	} from '$lib/stores/projectDataMutations';
	import type { DataMutation } from '$lib/components/agent/agent-chat.types';
	import {
		collectProjectMutations,
		createProjectRefreshQueue,
		fetchProjectMutationPatch,
		type ProjectMutationPatch
	} from '$lib/components/project/project-mutation-refresh';
	import { browser } from '$app/environment';
	import { goto, pushState, replaceState } from '$app/navigation';
	import { buildRecordHref } from '@buildos/shared-types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { DocDeleteConfirmModal, DocMoveModal } from '$lib/components/ontology/doc-tree';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
	import ProjectMemoryCard from '$lib/components/project/ProjectMemoryCard.svelte';
	import ProjectEntitySearchCombobox from '$lib/components/project/v2/ProjectEntitySearchCombobox.svelte';
	import PulseStrip from '$lib/components/project/v2/PulseStrip.svelte';
	import {
		resolveEntityOpenAction,
		type EntityOpenAction
	} from '$lib/components/project/project-page-interactions';
	import { preloadProjectEntityModal } from '$lib/components/project/project-entity-modal-loader';
	import { handleRovingTabKeydown } from '$lib/components/project/v2/board-a11y';
	import {
		archiveProjectDocument,
		fetchProjectDocument,
		fetchProjectFullData,
		fetchProjectTaskBucket,
		moveProjectDocument,
		recoverProjectStartHere,
		type OntoEventWithSync,
		type ProjectFullData
	} from '$lib/components/project/project-page-data-controller';
	import { parseStartHereStatusRegion } from '@buildos/shared-agent-ops/ontology/start-here';
	import { parseDocStructure } from '$lib/services/ontology/doc-structure.service';
	import { createCompleteProjectTasksCoverage } from '$lib/utils/project-task-board';
	import { toastService } from '$lib/stores/toast.store';
	import { trackLoopEvent } from '$lib/services/loop-telemetry';
	import type { Document, Goal, Milestone, Plan, Project, Risk, Task } from '$lib/types/onto';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';
	import type {
		ProjectActiveTaskBucketKey,
		ProjectTasksCoverage
	} from '$lib/types/project-full-data';
	import {
		Activity,
		AlertTriangle,
		BookOpen,
		ChevronRight,
		FileText,
		Flag,
		LayoutDashboard,
		ListChecks,
		LoaderCircle,
		Network,
		Pencil,
		Plus,
		Target,
		Workflow
	} from '$lib/icons/lucide';
	import type { PageData } from './$types';
	import ProjectBriefHubModal from './ProjectBriefHubModal.svelte';
	import ProjectProgressOverview from './ProjectProgressOverview.svelte';
	import ProjectRecentChats from './ProjectRecentChats.svelte';
	import ProjectWorkspaceEntityModals from './ProjectWorkspaceEntityModals.svelte';
	import ProjectWorkspaceOptionsMenu from './ProjectWorkspaceOptionsMenu.svelte';

	type WorkspaceTab = 'work' | 'overview' | 'docs' | 'activity';
	type WorkspaceCreateKind = 'goal' | 'plan' | 'milestone' | 'risk' | 'event';
	type WorkspaceEditTarget = Extract<EntityOpenAction, { kind: WorkspaceCreateKind | 'project' }>;
	const START_HERE_REFRESH_RECHECK_DELAYS_MS = [350, 750, 1500] as const;

	type Access = {
		canEdit: boolean;
		canAdmin: boolean;
		canInvite: boolean;
		canViewLogs: boolean;
		isOwner: boolean;
		isAuthenticated: boolean;
		currentActorId: string | null;
	};

	const DEFAULT_ACCESS: Access = {
		canEdit: false,
		canAdmin: false,
		canInvite: false,
		canViewLogs: false,
		isOwner: false,
		isAuthenticated: false,
		currentActorId: null
	};

	const TAB_ORDER: WorkspaceTab[] = ['overview', 'work', 'docs', 'activity'];

	let { data }: { data: PageData } = $props();
	const initialData = untrack(() => data);

	function projectFromPageData(source: PageData): Project {
		return source.skeleton
			? ({
					id: source.project.id,
					name: source.project.name,
					description: source.project.description,
					icon_svg: source.project.icon_svg,
					icon_concept: source.project.icon_concept,
					icon_generated_at: source.project.icon_generated_at,
					icon_generation_source: source.project.icon_generation_source,
					icon_generation_prompt: source.project.icon_generation_prompt,
					state_key: source.project.state_key,
					type_key: source.project.type_key || 'project',
					next_step_short: source.project.next_step_short,
					next_step_long: source.project.next_step_long,
					next_step_source: source.project.next_step_source,
					next_step_updated_at: source.project.next_step_updated_at,
					props: {},
					created_by: '',
					created_at: new Date(0).toISOString(),
					updated_at: new Date(0).toISOString()
				} as Project)
			: (source.project as Project);
	}

	function coverageFromPageData(source: PageData): ProjectTasksCoverage {
		if (source.skeleton) return createCompleteProjectTasksCoverage([]);
		return (
			source.tasks_coverage ??
			createCompleteProjectTasksCoverage((source.tasks ?? []) as Task[])
		);
	}

	function buildDocumentSeed(
		sourceProject: Project,
		sourceDocuments: Document[]
	): {
		structure: DocStructure;
		documents: Record<string, OntoDocument>;
		archived: OntoDocument[];
	} {
		const structure = parseDocStructure(sourceProject.doc_structure);
		const documentsById: Record<string, OntoDocument> = {};
		const archived: OntoDocument[] = [];
		for (const document of sourceDocuments as unknown as OntoDocument[]) {
			if (document.deleted_at || document.state_key === 'archived') {
				archived.push(document);
			} else {
				documentsById[document.id] = document;
			}
		}
		return { structure, documents: documentsById, archived };
	}

	let activeTab = $state<WorkspaceTab>('overview');
	let tabButtons = $state<Array<HTMLButtonElement | null>>([]);
	let isHydrating = $state(initialData.skeleton === true);
	let hydrationError = $state<string | null>(null);
	let refreshError = $state(false);
	let workspaceActive = true;
	let hydrationPromise = Promise.resolve();
	let taskPageLoad: Promise<void> | null = null;

	let project = $state.raw<Project>(projectFromPageData(initialData));
	let tasks = $state.raw<Task[]>(
		initialData.skeleton ? [] : ((initialData.tasks ?? []) as Task[])
	);
	let tasksCoverage = $state.raw<ProjectTasksCoverage>(coverageFromPageData(initialData));
	let documents = $state.raw<Document[]>(
		initialData.skeleton ? [] : ((initialData.documents ?? []) as Document[])
	);
	let goals = $state.raw<Goal[]>(
		initialData.skeleton ? [] : ((initialData.goals ?? []) as Goal[])
	);
	let milestones = $state.raw<Milestone[]>(
		initialData.skeleton ? [] : ((initialData.milestones ?? []) as Milestone[])
	);
	let plans = $state.raw<Plan[]>(
		initialData.skeleton ? [] : ((initialData.plans ?? []) as Plan[])
	);
	let risks = $state.raw<Risk[]>(
		initialData.skeleton ? [] : ((initialData.risks ?? []) as Risk[])
	);
	let events = $state.raw<OntoEventWithSync[]>(
		initialData.skeleton ? [] : ((initialData.events ?? []) as OntoEventWithSync[])
	);
	let contextDocument = $state.raw<Document | null>(
		initialData.skeleton ? null : ((initialData.context_document ?? null) as Document | null)
	);

	let docTreeStructure = $state<DocStructure | null>(null);
	let docTreeDocuments = $state<Record<string, OntoDocument>>({});
	let docTreeUnlinked = $state<OntoDocument[]>([]);
	let docTreeArchived = $state<OntoDocument[]>([]);

	let showTaskCreateModal = $state(false);
	let editingTaskId = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let parentDocumentId = $state<string | null>(null);
	let showMoveDocumentModal = $state(false);
	let moveDocumentId = $state<string | null>(null);
	let moveDocumentTitle = $state('Document');
	let showArchiveDocumentModal = $state(false);
	let archiveDocumentId = $state<string | null>(null);
	let archiveDocumentTitle = $state('Document');
	let archiveDocumentHasChildren = $state(false);
	let archiveDocumentChildCount = $state(0);
	let createEntityKind = $state<WorkspaceCreateKind | null>(null);
	let editingEntity = $state<WorkspaceEditTarget | null>(null);
	let showGraphModal = $state(false);
	let showProjectBriefModal = $state(false);
	let showMemoryUpdateChatModal = $state(false);
	let selectedRecentChatSessionId = $state<string | null>(null);
	let isContextDocumentContentLoading = $state(false);
	let isCreatingStartHere = $state(false);
	let startHereRefreshRequest = 0;
	onDestroy(() => {
		startHereRefreshRequest += 1;
		workspaceActive = false;
		refreshQueue.dispose();
	});
	let showAllGoals = $state(false);
	let showAllPlans = $state(false);
	let showAllMilestones = $state(false);
	let showAllRisks = $state(false);
	let entityHistoryOwned = false;
	let entityClosePending = false;

	const access = $derived((data.access ?? DEFAULT_ACCESS) as Access);
	const canEdit = $derived(access.canEdit);

	const initialCounts = $derived(
		data.skeleton
			? data.counts
			: {
					task_count: tasksCoverage.total,
					document_count: documents.length,
					goal_count: goals.length,
					plan_count: plans.length,
					milestone_count: milestones.length,
					risk_count: risks.length,
					image_count: data.images?.length ?? 0
				}
	);

	const taskCount = $derived(tasksCoverage.total || tasks.length);

	const activeGoals = $derived(
		goals.filter(
			(goal) => !goal.deleted_at && !['achieved', 'abandoned'].includes(goal.state_key)
		)
	);
	const activePlans = $derived(
		plans.filter((plan) => !plan.deleted_at && plan.state_key !== 'completed')
	);
	const openRisks = $derived(
		risks.filter(
			(risk) => !risk.deleted_at && !['mitigated', 'closed'].includes(risk.state_key)
		)
	);
	const upcomingMilestones = $derived.by(() => {
		const now = Date.now();
		return milestones
			.filter((milestone) => {
				if (milestone.deleted_at || milestone.state_key === 'completed') return false;
				const due = milestone.due_at
					? Date.parse(milestone.due_at)
					: Number.POSITIVE_INFINITY;
				return !Number.isFinite(due) || due >= now - 86_400_000;
			})
			.slice()
			.sort((a, b) => {
				const aDue = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
				const bDue = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
				return aDue - bDue;
			});
	});
	const visibleGoals = $derived(showAllGoals ? activeGoals : activeGoals.slice(0, 5));
	const visiblePlans = $derived(showAllPlans ? activePlans : activePlans.slice(0, 5));
	const visibleMilestones = $derived(
		showAllMilestones ? upcomingMilestones : upcomingMilestones.slice(0, 5)
	);
	const visibleRisks = $derived(showAllRisks ? openRisks : openRisks.slice(0, 5));
	const memorySourceUpdatedAt = $derived.by(() => {
		const times = [
			project,
			...tasks,
			...documents.filter((doc) => doc.id !== contextDocument?.id),
			...goals,
			...milestones,
			...plans,
			...risks
		]
			.map((record) => (record.updated_at ? Date.parse(record.updated_at) : NaN))
			.filter(Number.isFinite);
		return times.length ? new Date(Math.max(...times)).toISOString() : null;
	});

	function humanize(value: string | null | undefined): string {
		if (!value) return 'Unknown';
		return value
			.replace(/[._-]+/g, ' ')
			.replace(/\b\w/g, (character) => character.toUpperCase());
	}

	function formatDate(value: string | null | undefined, includeYear = false): string {
		if (!value) return 'No date';
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'No date';
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			...(includeYear ? { year: 'numeric' as const } : {})
		});
	}

	function seedDocumentTree() {
		const seed = buildDocumentSeed(project, documents);
		docTreeStructure = seed.structure;
		docTreeDocuments = seed.documents;
		docTreeArchived = seed.archived;
		docTreeUnlinked = [];
	}

	function applyFullData(fullData: ProjectFullData) {
		project = (fullData.project as Project) ?? project;
		tasks = (fullData.tasks ?? []) as Task[];
		tasksCoverage = fullData.tasks_coverage ?? createCompleteProjectTasksCoverage(tasks);
		documents = (fullData.documents ?? []) as Document[];
		goals = (fullData.goals ?? []) as Goal[];
		milestones = (fullData.milestones ?? []) as Milestone[];
		plans = (fullData.plans ?? []) as Plan[];
		risks = (fullData.risks ?? []) as Risk[];
		events = (fullData.events ?? []) as OntoEventWithSync[];
		contextDocument = (fullData.context_document ?? null) as Document | null;
		seedDocumentTree();
	}

	async function hydrateProject() {
		if (!initialData.skeleton) {
			seedDocumentTree();
			isHydrating = false;
			return;
		}

		isHydrating = true;
		hydrationError = null;
		try {
			const result = await initialData.deferredFullData;
			if (!result.ok) throw new Error(result.error);
			applyFullData(result.data);
			void hydrateContextDocument();
		} catch (error) {
			hydrationError =
				error instanceof Error ? error.message : 'Failed to load project workspace';
		} finally {
			isHydrating = false;
		}
	}

	async function hydrateContextDocument(force = false) {
		if (
			!contextDocument?.id ||
			(!force && contextDocument.content) ||
			isContextDocumentContentLoading
		) {
			return;
		}
		isContextDocumentContentLoading = true;
		try {
			const loaded = await fetchProjectDocument(contextDocument.id);
			if (contextDocument?.id === loaded.id) contextDocument = loaded;
		} catch (error) {
			console.warn('[Project workspace prototype] Failed to load project memory', error);
		} finally {
			isContextDocumentContentLoading = false;
		}
	}

	function applyMutationPatch(patch: ProjectMutationPatch) {
		if (patch.tasks) tasks = patch.tasks;
		if (patch.tasks_coverage) tasksCoverage = patch.tasks_coverage;
		if (patch.goals) goals = patch.goals;
		if (patch.plans) plans = patch.plans;
		if (patch.milestones) milestones = patch.milestones;
		if (patch.risks) risks = patch.risks;
		if (patch.events) events = patch.events;
		if (patch.documentTree) handleDocTreeDataLoaded(patch.documentTree);
		if ('context_document' in patch) contextDocument = patch.context_document ?? null;
	}

	const refreshQueue = createProjectRefreshQueue(
		async (summaries) => {
			await hydrationPromise;
			while (taskPageLoad) await taskPageLoad;
			if (!workspaceActive) return;
			const mutations =
				summaries && !hydrationError
					? collectProjectMutations(project.id, summaries)
					: null;
			const previousRefresh = contextDocument?.content
				? (parseStartHereStatusRegion(contextDocument.content)?.refreshedAt ?? null)
				: null;
			if (mutations) {
				if (!mutations.length) return;
				const patch = await fetchProjectMutationPatch(project.id, mutations, {
					project,
					tasks,
					tasks_coverage: tasksCoverage,
					documents,
					goals,
					plans,
					milestones,
					risks,
					events,
					context_document: contextDocument
				});
				if (!workspaceActive) return;
				applyMutationPatch(patch);
			} else {
				const fullData = await fetchProjectFullData(project.id, { profile: 'v2-initial' });
				if (!workspaceActive) return;
				applyFullData(fullData);
				hydrationError = null;
				void hydrateContextDocument();
			}
			if (summaries && contextDocument)
				void recheckStartHereAfterSnapshot(contextDocument, previousRefresh);
			refreshError = false;
		},
		(error) => {
			console.warn('[Project workspace] Failed to refresh changed data', error);
			if (workspaceActive) refreshError = true;
		}
	);

	function refreshProject() {
		return refreshQueue.enqueue();
	}

	function refreshEntity(
		entityKind: DataMutation['entityKind'],
		entityId: string | null,
		operation: DataMutation['operation'] = 'update'
	) {
		notifyDataMutation({
			hasChanges: true,
			totalMutations: 1,
			affectedProjectIds: [project.id],
			hasMessagesSent: false,
			mutations: [{ entityKind, entityId, operation, projectIds: [project.id] }]
		});
	}

	function selectTab(tab: WorkspaceTab, updateUrl = true) {
		activeTab = tab;
		const tabIndex = TAB_ORDER.indexOf(tab);
		void tick().then(() => {
			tabButtons[tabIndex]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
		});
		if (!browser || !updateUrl) return;
		const url = new URL(window.location.href);
		url.searchParams.set('view', tab);
		replaceState(resolve(`${url.pathname}${url.search}${url.hash}` as `/projects/${string}`), {
			...page.state
		});
	}

	function focusTab(index: number) {
		tabButtons[index]?.focus();
	}

	function handleTabKeydown(event: KeyboardEvent, index: number) {
		handleRovingTabKeydown(
			event,
			index,
			TAB_ORDER.length,
			(nextIndex) => selectTab(TAB_ORDER[nextIndex]!),
			focusTab
		);
	}

	function openProjectBrief() {
		showProjectBriefModal = true;
		void hydrateContextDocument(true);
	}

	function openStartHereFromMemory(documentId: string) {
		trackLoopEvent('start_here_opened', 'project', {
			project_id: project.id,
			document_id: documentId,
			source: 'memory_card'
		});
		openStartHereDocument(documentId);
	}

	function openStartHereDocument(documentId: string) {
		void goto(
			resolve(buildRecordHref('document', documentId, project.id)! as `/projects/${string}`)
		);
	}

	function openMemoryUpdateChat() {
		trackLoopEvent('memory_update_started', 'project', { project_id: project.id });
		showMemoryUpdateChatModal = true;
	}

	function handleMemorySnapshotShown(info: {
		documentId: string;
		rendered: boolean;
		freshness: 'authored' | 'refreshed' | 'never';
	}) {
		trackLoopEvent('memory_snapshot_shown', 'project', {
			project_id: project.id,
			document_id: info.documentId,
			rendered: info.rendered,
			freshness: info.freshness
		});
	}

	function hasRenderedStartHereSnapshot(document: Document): boolean {
		return Boolean(
			document.content && parseStartHereStatusRegion(document.content)?.refreshedAt
		);
	}

	async function recheckStartHereAfterSnapshot(
		seedDocument: Document,
		afterRefresh?: string | null
	) {
		if (afterRefresh === undefined && hasRenderedStartHereSnapshot(seedDocument)) return;
		const request = ++startHereRefreshRequest;

		const delays =
			afterRefresh === undefined
				? START_HERE_REFRESH_RECHECK_DELAYS_MS
				: [1000, 3000, 6000, 10000, 15000, 25000];
		for (const delayMs of delays) {
			await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
			if (request !== startHereRefreshRequest || contextDocument?.id !== seedDocument.id)
				return;

			try {
				const refreshed = await fetchProjectDocument(seedDocument.id);
				if (!hasRenderedStartHereSnapshot(refreshed)) continue;
				const refreshedAt = parseStartHereStatusRegion(refreshed.content!)?.refreshedAt;
				if (
					afterRefresh &&
					(!refreshedAt || Date.parse(refreshedAt) <= Date.parse(afterRefresh))
				)
					continue;
				contextDocument = refreshed;
				return;
			} catch {
				// Best-effort hydration. The canonical document already exists and a
				// normal project refresh remains the durable fallback.
			}
		}
	}

	async function createStartHere() {
		if (isCreatingStartHere || contextDocument) return;
		isCreatingStartHere = true;
		trackLoopEvent('start_here_recovery_started', 'project', { project_id: project.id });
		try {
			const recovery = await recoverProjectStartHere(project.id);
			contextDocument = recovery.document;
			trackLoopEvent('start_here_recovery_completed', 'project', {
				project_id: project.id,
				document_id: contextDocument.id,
				created: recovery.created,
				refresh_queued: recovery.refreshQueued
			});
			if (recovery.created && recovery.versionRecorded === false) {
				toastService.warning(
					'Project memory was created, but its first history version needs attention.'
				);
			} else if (recovery.refreshQueued) {
				toastService.success(
					recovery.created
						? 'Project memory created. Its live status is refreshing.'
						: 'Project memory found. Its live status is refreshing.'
				);
			} else {
				toastService.warning(
					recovery.created
						? 'Project memory was created, but its live refresh is delayed.'
						: 'Project memory was found, but its live refresh is delayed.'
				);
			}
			if (recovery.refreshQueued) void recheckStartHereAfterSnapshot(recovery.document);
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Failed to create project memory'
			);
		} finally {
			isCreatingStartHere = false;
		}
	}

	function openRecentChat(sessionId: string) {
		selectedRecentChatSessionId = sessionId;
	}

	function closeRecentChat() {
		selectedRecentChatSessionId = null;
	}

	function resetEntityEditors() {
		editingTaskId = null;
		showDocumentModal = false;
		activeDocumentId = null;
		parentDocumentId = null;
		editingEntity = null;
	}

	function applyEntityAction(action: EntityOpenAction) {
		resetEntityEditors();
		switch (action.kind) {
			case 'task':
				editingTaskId = action.entityId;
				break;
			case 'document':
				activeDocumentId = action.entityId;
				showDocumentModal = true;
				break;
			case 'goal':
			case 'plan':
			case 'milestone':
			case 'risk':
			case 'event':
			case 'project':
				editingEntity = action;
				break;
		}
	}

	function openEntity(entityType: string, entityId: string) {
		const resolution = resolveEntityOpenAction(entityType, entityId);
		if (resolution.result !== 'opened') {
			const message =
				resolution.result === 'unsupported'
					? `No workspace editor is available for ${entityType}.`
					: `Unknown project entity type: ${entityType}.`;
			console.info(message);
			return;
		}

		void preloadProjectEntityModal(resolution.action.kind).catch((error) => {
			console.warn('[Project workspace] Failed to preload entity editor', error);
		});
		entityClosePending = false;

		if (browser) {
			// `page.url` can lag a same-tick tab replacement. The address bar is the
			// authoritative source here so opening a modal preserves the visible view.
			const url = new URL(window.location.href);
			const replacingExistingEntity = url.searchParams.has('entity');
			url.searchParams.set('entity', resolution.action.kind);
			url.searchParams.set('entity_id', resolution.action.entityId);
			url.searchParams.delete('id');
			if (replacingExistingEntity) {
				replaceState(
					resolve(`${url.pathname}${url.search}${url.hash}` as `/projects/${string}`),
					{
						...page.state
					}
				);
			} else {
				pushState(
					resolve(`${url.pathname}${url.search}${url.hash}` as `/projects/${string}`),
					{
						...page.state
					}
				);
				entityHistoryOwned = true;
			}
		}

		applyEntityAction(resolution.action);
	}

	function closeEntityEditor() {
		if (entityClosePending) return;
		entityClosePending = true;
		resetEntityEditors();
		if (!browser) {
			entityClosePending = false;
			return;
		}

		if (entityHistoryOwned) {
			entityHistoryOwned = false;
			window.history.back();
			return;
		}

		const url = new URL(window.location.href);
		if (url.searchParams.has('entity') || url.searchParams.has('entity_id')) {
			url.searchParams.delete('entity');
			url.searchParams.delete('entity_id');
			url.searchParams.delete('id');
			replaceState(
				resolve(`${url.pathname}${url.search}${url.hash}` as `/projects/${string}`),
				{
					...page.state
				}
			);
		}
		queueMicrotask(() => {
			entityClosePending = false;
		});
	}

	function syncWorkspaceFromUrl(url: URL) {
		entityClosePending = false;
		const requestedView = url.searchParams.get('view');
		if (requestedView && TAB_ORDER.includes(requestedView as WorkspaceTab)) {
			activeTab = requestedView as WorkspaceTab;
		}

		const entityType = url.searchParams.get('entity');
		const entityId = url.searchParams.get('entity_id') ?? url.searchParams.get('id');
		if (!entityType || !entityId) {
			resetEntityEditors();
			entityHistoryOwned = false;
			return;
		}

		resetEntityEditors();
		const resolution = resolveEntityOpenAction(entityType, entityId);
		if (resolution.result === 'opened') {
			applyEntityAction(resolution.action);
		}
		entityHistoryOwned = false;
	}

	function handleWorkspacePopState() {
		if (!browser) return;
		syncWorkspaceFromUrl(new URL(window.location.href));
	}

	function createWorkspaceEntity(kind: WorkspaceCreateKind) {
		createEntityKind = kind;
	}

	function handleWorkspaceEntityCreated(kind: WorkspaceCreateKind, entityId: string) {
		createEntityKind = null;
		void refreshEntity(kind, entityId, 'create');
		openEntity(kind, entityId);
	}

	function handleWorkspaceEntityMutated() {
		closeEntityEditor();
		void refreshProject();
	}

	function createDocument(parentId: string | null = null) {
		activeDocumentId = null;
		parentDocumentId = parentId;
		showDocumentModal = true;
	}

	function documentTitle(documentId: string): string {
		return (
			docTreeDocuments[documentId]?.title ??
			docTreeUnlinked.find((document) => document.id === documentId)?.title ??
			docTreeArchived.find((document) => document.id === documentId)?.title ??
			'Document'
		);
	}

	function moveDocument(documentId: string) {
		moveDocumentId = documentId;
		moveDocumentTitle = documentTitle(documentId);
		showMoveDocumentModal = true;
	}

	function archiveDocument(documentId: string, hasChildren: boolean) {
		archiveDocumentId = documentId;
		archiveDocumentTitle = documentTitle(documentId);
		archiveDocumentHasChildren = hasChildren;
		archiveDocumentChildCount = 0;

		if (hasChildren && docTreeStructure) {
			type TreeNode = { id: string; children?: TreeNode[] };
			const countChildren = (nodes: TreeNode[]): number => {
				for (const node of nodes) {
					if (node.id === documentId) return node.children?.length ?? 0;
					const nestedCount = node.children ? countChildren(node.children) : 0;
					if (nestedCount > 0) return nestedCount;
				}
				return 0;
			};
			archiveDocumentChildCount = countChildren(docTreeStructure.root);
		}

		showArchiveDocumentModal = true;
	}

	function closeMoveDocumentModal() {
		showMoveDocumentModal = false;
		moveDocumentId = null;
	}

	function closeArchiveDocumentModal() {
		showArchiveDocumentModal = false;
		archiveDocumentId = null;
	}

	async function confirmMoveDocument(newParentId: string | null) {
		if (!moveDocumentId) return;
		try {
			await moveProjectDocument({
				projectId: project.id,
				documentId: moveDocumentId,
				newParentId,
				newPosition: 0
			});
			toastService.success('Document moved');
			void refreshEntity('document', moveDocumentId, 'move');
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Failed to move document');
		} finally {
			closeMoveDocumentModal();
		}
	}

	async function confirmArchiveDocument(
		mode: 'archive_children' | 'promote_children' | 'unlink_children'
	) {
		if (!archiveDocumentId) return;
		try {
			await archiveProjectDocument({ documentId: archiveDocumentId, mode });
			toastService.success('Document archived');
			closeArchiveDocumentModal();
			void refreshEntity('document', archiveDocumentId, 'delete');
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Failed to archive document'
			);
		}
	}

	function closeDocumentModal() {
		closeEntityEditor();
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
		documents = [
			...Object.values(loaded.documents),
			...(loaded.unlinked ?? []),
			...(loaded.archived ?? [])
		] as unknown as Document[];
	}

	async function loadMoreTasks(bucket: ProjectActiveTaskBucketKey) {
		await refreshQueue.whenIdle();
		if (!workspaceActive) return;
		while (taskPageLoad) await taskPageLoad;
		if (!workspaceActive) return;
		taskPageLoad = loadTaskPage(bucket);
		try {
			await taskPageLoad;
		} finally {
			taskPageLoad = null;
		}
	}

	async function loadTaskPage(bucket: ProjectActiveTaskBucketKey) {
		const coverage = tasksCoverage.buckets[bucket];
		if (!coverage || coverage.complete) return;
		const page = await fetchProjectTaskBucket({
			projectId: project.id,
			bucket,
			offset: coverage.returned,
			limit: 20,
			asOf: tasksCoverage.as_of
		});
		const incomingIds = new Set(page.tasks.map((task) => task.id));
		tasks = [...tasks.filter((task) => !incomingIds.has(task.id)), ...page.tasks];
		const returned = coverage.returned + page.tasks.length;
		tasksCoverage = {
			...tasksCoverage,
			returned: Math.min(tasksCoverage.total, tasksCoverage.returned + page.tasks.length),
			complete: Object.entries(tasksCoverage.buckets).every(([key, value]) =>
				key === bucket ? !page.hasMore : value.complete
			),
			buckets: {
				...tasksCoverage.buckets,
				[bucket]: {
					...coverage,
					returned,
					complete: !page.hasMore
				}
			}
		};
	}

	onMount(() => {
		syncWorkspaceFromUrl(new URL(window.location.href));
		hydrationPromise = hydrateProject();
		// Ignore the store's initial value; only react to new completed mutations.
		let initial = true;
		const unsubscribe = dataMutationEvents.subscribe((event) => {
			if (initial) {
				initial = false;
				return;
			}
			if (!event || !mutationAffectsProject(event.summary, project.id)) return;
			void refreshQueue.enqueue(event.summary);
		});
		return () => {
			unsubscribe();
		};
	});
</script>

<svelte:window
	onpopstate={handleWorkspacePopState}
	onfocus={() => void hydrateContextDocument(true)}
/>

<svelte:head>
	<title>{project.name || 'Project'} · BuildOS</title>
	<meta
		name="description"
		content="A focused BuildOS project workspace for overview, tasks, documents, and activity."
	/>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<header class="border-b border-border bg-card tx tx-frame tx-weak">
		<div class="mx-auto max-w-7xl px-2 pt-2 sm:px-4 sm:pt-3 lg:px-6">
			<div class="flex min-w-0 items-center justify-between gap-2 pb-2 sm:gap-3 sm:pb-3">
				<div class="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
					<div class="flex min-w-0 flex-1 items-center gap-2 py-1">
						<ProjectIcon
							svg={project.icon_svg ?? null}
							concept={project.icon_concept ?? null}
							size="md"
						/>
						<div class="min-w-0 flex-1">
							<h1
								class="min-w-0 flex-1 truncate text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl"
								style:view-transition-name="project-title-{project.id}"
								style:view-transition-class="project-title"
							>
								{project.name || 'Untitled project'}
							</h1>
							<p
								class="mt-0.5 hidden max-w-3xl truncate text-sm text-muted-foreground sm:block"
							>
								{project.description || 'No project description yet.'}
							</p>
						</div>
					</div>
				</div>

				<div class="flex shrink-0 items-center gap-1" aria-label="Project actions">
					<Button
						variant="outline"
						size="sm"
						icon={BookOpen}
						class="rounded-md shadow-none"
						aria-label="Open Brief / Start Here"
						title="Open Brief / Start Here"
						onclick={openProjectBrief}
					>
						<span class="hidden sm:inline">Brief</span>
						<span class="sr-only sm:hidden">Open Brief / Start Here</span>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						icon={Network}
						class="rounded-md"
						title="Open project graph"
						onclick={() => (showGraphModal = true)}
					>
						<span class="hidden lg:inline">Graph</span>
						<span class="sr-only lg:hidden">Open project graph</span>
					</Button>
					<ProjectWorkspaceOptionsMenu
						{project}
						{contextDocument}
						{canEdit}
						canAdmin={access.canAdmin}
						canOpenCollaboration={access.canViewLogs}
						canDeleteProject={access.isOwner}
						onProjectSaved={refreshProject}
					/>
				</div>
			</div>

			<nav
				class="workspace-tabs -mx-2 overflow-x-auto border-t border-border/80 bg-background/45 px-2 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6"
				aria-label="Project workspace views"
			>
				<div
					class="workspace-tablist flex min-w-max gap-1"
					role="tablist"
					aria-orientation="horizontal"
				>
					<button
						bind:this={tabButtons[0]}
						type="button"
						id="workspace-tab-overview"
						role="tab"
						aria-selected={activeTab === 'overview'}
						aria-controls="workspace-overview"
						tabindex={activeTab === 'overview' ? 0 : -1}
						onclick={() => selectTab('overview')}
						onkeydown={(event) => handleTabKeydown(event, 0)}
						class="workspace-tab {activeTab === 'overview'
							? 'workspace-tab-active'
							: ''}"
					>
						<LayoutDashboard class="hidden h-4 w-4 sm:block" />
						Overview
					</button>
					<button
						bind:this={tabButtons[1]}
						type="button"
						id="workspace-tab-work"
						role="tab"
						aria-selected={activeTab === 'work'}
						aria-controls="workspace-work"
						tabindex={activeTab === 'work' ? 0 : -1}
						onclick={() => selectTab('work')}
						onkeydown={(event) => handleTabKeydown(event, 1)}
						class="workspace-tab {activeTab === 'work' ? 'workspace-tab-active' : ''}"
					>
						<ListChecks class="hidden h-4 w-4 sm:block" />
						Tasks
						<span class="tab-count">{taskCount}</span>
					</button>
					<button
						bind:this={tabButtons[2]}
						type="button"
						id="workspace-tab-docs"
						role="tab"
						aria-selected={activeTab === 'docs'}
						aria-controls="workspace-docs"
						tabindex={activeTab === 'docs' ? 0 : -1}
						onclick={() => selectTab('docs')}
						onkeydown={(event) => handleTabKeydown(event, 2)}
						class="workspace-tab {activeTab === 'docs' ? 'workspace-tab-active' : ''}"
					>
						<FileText class="hidden h-4 w-4 sm:block" />
						Docs
						<span class="tab-count">
							{isHydrating ? initialCounts.document_count : documents.length}
						</span>
					</button>
					<button
						bind:this={tabButtons[3]}
						type="button"
						id="workspace-tab-activity"
						role="tab"
						aria-selected={activeTab === 'activity'}
						aria-controls="workspace-activity"
						tabindex={activeTab === 'activity' ? 0 : -1}
						onclick={() => selectTab('activity')}
						onkeydown={(event) => handleTabKeydown(event, 3)}
						class="workspace-tab {activeTab === 'activity'
							? 'workspace-tab-active'
							: ''}"
					>
						<Activity class="hidden h-4 w-4 sm:block" />
						Activity
					</button>
				</div>
			</nav>
		</div>
	</header>

	<main class="mx-auto max-w-7xl px-2 py-3 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
		{#if hydrationError}
			<div
				class="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 tx tx-static tx-weak"
				role="alert"
			>
				<div class="flex items-start gap-3">
					<AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
					<div>
						<p class="font-semibold text-foreground">
							The workspace did not finish loading
						</p>
						<p class="mt-1 text-sm text-muted-foreground">{hydrationError}</p>
						<Button
							variant="outline"
							size="sm"
							class="mt-3"
							onclick={() => void hydrateProject()}
						>
							Try again
						</Button>
					</div>
				</div>
			</div>
		{/if}

		{#if refreshError}
			<div
				class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
				role="alert"
			>
				<p class="text-sm">Your changes were saved, but this view could not refresh.</p>
				<Button
					variant="outline"
					size="sm"
					onclick={() => {
						refreshError = false;
						void refreshQueue.retry();
					}}>Try again</Button
				>
			</div>
		{/if}

		{#if activeTab !== 'activity'}
			<div class="workspace-toolbar mb-3">
				{#if isHydrating}
					<div
						class="h-11 flex-1 animate-pulse rounded-lg border border-border bg-card motion-reduce:animate-none"
						aria-label="Loading project search"
					></div>
				{:else}
					<div class="min-w-0 flex-1">
						<ProjectEntitySearchCombobox
							projectId={project.id}
							scope={activeTab}
							variant="toolbar"
							placeholder={activeTab === 'work'
								? 'Search tasks...'
								: activeTab === 'overview'
									? 'Search goals, plans, milestones...'
									: 'Search documents...'}
							onSelectEntity={(type, id) => openEntity(type, id)}
						/>
					</div>
				{/if}
				{#if canEdit && activeTab === 'work'}
					<Button
						variant="outline"
						size="sm"
						icon={Plus}
						onclick={() => (showTaskCreateModal = true)}
					>
						<span class="hidden sm:inline">New task</span>
						<span class="sr-only sm:hidden">New task</span>
					</Button>
				{:else if canEdit && activeTab === 'overview'}
					<Button
						variant="outline"
						size="sm"
						icon={Pencil}
						onclick={() => openEntity('project', project.id)}
					>
						<span class="hidden sm:inline">Edit project</span>
						<span class="sr-only sm:hidden">Edit project</span>
					</Button>
				{:else if canEdit && activeTab === 'docs'}
					<Button
						variant="outline"
						size="sm"
						icon={Plus}
						onclick={() => createDocument()}
					>
						<span class="hidden sm:inline">New document</span>
						<span class="sr-only sm:hidden">New document</span>
					</Button>
				{/if}
			</div>
		{/if}

		{#if activeTab === 'work'}
			<div
				id="workspace-work"
				class="workspace-panel"
				role="tabpanel"
				aria-labelledby="workspace-tab-work"
				tabindex="0"
			>
				{#if isHydrating}
					<div
						class="min-h-[430px] animate-pulse border-y border-border bg-card motion-reduce:animate-none"
						aria-label="Loading task board"
					></div>
				{:else}
					{#await import('$lib/components/project/v2/TaskKanbanBoard.svelte')}
						<div
							class="min-h-[430px] animate-pulse border-y border-border bg-card motion-reduce:animate-none"
							aria-label="Loading task board"
						></div>
					{:then { default: TaskKanbanBoard }}
						<TaskKanbanBoard
							projectId={project.id}
							{tasks}
							{tasksCoverage}
							{canEdit}
							onEditTask={(id) => openEntity('task', id)}
							onTaskMoved={(id, state) =>
								void refreshEntity(
									'task',
									id,
									state === 'archived' ? 'delete' : 'update'
								)}
							onLoadMoreTasks={loadMoreTasks}
						/>
					{:catch boardError}
						<div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
							<p class="text-sm text-foreground">
								{boardError instanceof Error
									? boardError.message
									: 'The task board could not be loaded.'}
							</p>
						</div>
					{/await}
				{/if}
			</div>
		{:else if activeTab === 'overview'}
			<div
				id="workspace-overview"
				class="workspace-panel"
				role="tabpanel"
				aria-labelledby="workspace-tab-overview"
				tabindex="0"
			>
				<div class="space-y-5">
					{#if !isHydrating}
						<ProjectMemoryCard
							document={contextDocument}
							contentLoading={isContextDocumentContentLoading}
							creating={isCreatingStartHere}
							sourceUpdatedAt={memorySourceUpdatedAt}
							nextStepShort={project.next_step_short ?? null}
							{canEdit}
							onOpenStartHere={openStartHereFromMemory}
							onUpdateProject={openMemoryUpdateChat}
							onCreateStartHere={['planning', 'active'].includes(project.state_key)
								? createStartHere
								: undefined}
							onShown={handleMemorySnapshotShown}
						/>
					{/if}

					<ProjectProgressOverview
						{project}
						{tasksCoverage}
						{milestones}
						{risks}
						onOpenTasks={() => selectTab('work')}
						onOpenMilestone={(milestoneId) => openEntity('milestone', milestoneId)}
					/>

					<div
						class="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.8fr)]"
					>
						<div class="min-w-0 space-y-5">
							<section
								class="overview-section"
								aria-labelledby="overview-direction-title"
							>
								<header class="overview-section-header">
									<div class="flex min-w-0 items-center gap-2">
										<Target class="h-4 w-4 shrink-0 text-warning" />
										<h2
											id="overview-direction-title"
											class="text-sm font-semibold"
										>
											Direction
										</h2>
									</div>
									{#if activeGoals.length > 0 || activePlans.length > 0}
										<span
											class="shrink-0 text-2xs font-medium text-muted-foreground"
										>
											{activeGoals.length} goals · {activePlans.length} plans
										</span>
									{/if}
								</header>
								{#if activeGoals.length === 0 && activePlans.length === 0}
									<div class="section-empty-state">
										<Target class="h-5 w-5 shrink-0 text-muted-foreground" />
										<div class="min-w-0 flex-1">
											<p class="text-sm font-semibold">
												No direction set yet
											</p>
											<p class="text-xs text-muted-foreground">
												Add a goal or plan when the path becomes clear.
											</p>
										</div>
										{#if canEdit}
											<div class="flex shrink-0 flex-wrap justify-end gap-1">
												<button
													type="button"
													class="section-empty-action"
													onclick={() => createWorkspaceEntity('goal')}
												>
													Add goal
												</button>
												<button
													type="button"
													class="section-empty-action"
													onclick={() => createWorkspaceEntity('plan')}
												>
													Add plan
												</button>
											</div>
										{/if}
									</div>
								{:else}
									<div
										class="grid gap-0 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0"
									>
										<div class="p-3 sm:p-4">
											<p class="micro-label mb-2">GOALS</p>
											<div class="space-y-2">
												{#each visibleGoals as goal (goal.id)}
													{@const goalMilestones = milestones.filter(
														(milestone) => milestone.goal_id === goal.id
													)}
													<button
														type="button"
														class="entity-row"
														onclick={() => openEntity('goal', goal.id)}
													>
														<div class="min-w-0 flex-1">
															<p
																class="truncate text-sm font-semibold"
															>
																{goal.name}
															</p>
															<p
																class="truncate text-xs text-muted-foreground"
															>
																{goalMilestones.length} milestone{goalMilestones.length ===
																1
																	? ''
																	: 's'}
																{goal.target_date
																	? ` · target ${formatDate(goal.target_date)}`
																	: ''}
															</p>
														</div>
														<ChevronRight
															class="h-4 w-4 shrink-0 text-muted-foreground"
														/>
													</button>
												{:else}
													<div class="empty-row">
														<Target class="h-5 w-5" />
														<p>No active goals yet</p>
													</div>
												{/each}
												{#if activeGoals.length > 5}
													<button
														type="button"
														class="view-all-row"
														aria-expanded={showAllGoals}
														onclick={() =>
															(showAllGoals = !showAllGoals)}
													>
														{showAllGoals
															? 'Show fewer goals'
															: `Show all ${activeGoals.length} goals`}
													</button>
												{/if}
												{#if canEdit}
													<button
														type="button"
														class="entity-create-row"
														onclick={() =>
															createWorkspaceEntity('goal')}
													>
														<Plus class="h-3.5 w-3.5" />
														Add goal
													</button>
												{/if}
											</div>
										</div>
										<div class="p-3 sm:p-4">
											<p class="micro-label mb-2">PLANS</p>
											<div class="space-y-2">
												{#each visiblePlans as plan (plan.id)}
													<button
														type="button"
														class="entity-row"
														onclick={() => openEntity('plan', plan.id)}
													>
														<div class="min-w-0 flex-1">
															<p
																class="truncate text-sm font-semibold"
															>
																{plan.name}
															</p>
															<p
																class="truncate text-xs text-muted-foreground"
															>
																{humanize(plan.state_key)}
																{plan.description
																	? ` · ${plan.description}`
																	: ''}
															</p>
														</div>
														<ChevronRight
															class="h-4 w-4 shrink-0 text-muted-foreground"
														/>
													</button>
												{:else}
													<div class="empty-row">
														<Workflow class="h-5 w-5" />
														<p>No active plans yet</p>
													</div>
												{/each}
												{#if activePlans.length > 5}
													<button
														type="button"
														class="view-all-row"
														aria-expanded={showAllPlans}
														onclick={() =>
															(showAllPlans = !showAllPlans)}
													>
														{showAllPlans
															? 'Show fewer plans'
															: `Show all ${activePlans.length} plans`}
													</button>
												{/if}
												{#if canEdit}
													<button
														type="button"
														class="entity-create-row"
														onclick={() =>
															createWorkspaceEntity('plan')}
													>
														<Plus class="h-3.5 w-3.5" />
														Add plan
													</button>
												{/if}
											</div>
										</div>
									</div>
								{/if}
							</section>
						</div>

						<aside class="min-w-0 space-y-5">
							<section
								class="overview-section"
								aria-labelledby="overview-milestones-title"
							>
								<header class="overview-section-header">
									<div class="flex min-w-0 items-center gap-2">
										<Flag class="h-4 w-4 shrink-0 text-accent" />
										<h2
											id="overview-milestones-title"
											class="text-sm font-semibold"
										>
											Milestones
										</h2>
									</div>
									{#if upcomingMilestones.length > 0}
										<span class="text-2xs font-medium text-muted-foreground">
											{upcomingMilestones.length} upcoming
										</span>
									{/if}
								</header>
								<div class="pt-2">
									{#if visibleMilestones.length > 0}
										{#each visibleMilestones as milestone (milestone.id)}
											<button
												type="button"
												class="entity-row"
												onclick={() =>
													openEntity('milestone', milestone.id)}
											>
												<div
													class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10"
												>
													<Flag class="h-3.5 w-3.5 text-accent" />
												</div>
												<div class="min-w-0 flex-1">
													<p class="truncate text-sm font-semibold">
														{milestone.title}
													</p>
													<p
														class="truncate text-xs text-muted-foreground"
													>
														{milestone.due_at
															? formatDate(milestone.due_at, true)
															: 'No target date'}
													</p>
												</div>
											</button>
										{/each}
										{#if upcomingMilestones.length > 5}
											<button
												type="button"
												class="view-all-row"
												aria-expanded={showAllMilestones}
												onclick={() =>
													(showAllMilestones = !showAllMilestones)}
											>
												{showAllMilestones
													? 'Show fewer milestones'
													: `Show all ${upcomingMilestones.length} milestones`}
											</button>
										{/if}
										{#if canEdit}
											<button
												type="button"
												class="entity-create-row"
												onclick={() => createWorkspaceEntity('milestone')}
											>
												<Plus class="h-3.5 w-3.5" />
												Add milestone
											</button>
										{/if}
									{:else}
										<div class="section-empty-state">
											<Flag class="h-5 w-5 shrink-0 text-muted-foreground" />
											<div class="min-w-0 flex-1">
												<p class="text-sm font-semibold">
													No milestones yet
												</p>
												<p class="text-xs text-muted-foreground">
													Add key commitments when dates matter.
												</p>
											</div>
											{#if canEdit}
												<button
													type="button"
													class="section-empty-action shrink-0"
													onclick={() =>
														createWorkspaceEntity('milestone')}
												>
													Add milestone
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</section>

							<section
								class="overview-section"
								aria-labelledby="overview-risks-title"
							>
								<header class="overview-section-header">
									<div class="flex min-w-0 items-center gap-2">
										<AlertTriangle class="h-4 w-4 shrink-0 text-destructive" />
										<h2 id="overview-risks-title" class="text-sm font-semibold">
											Risks
										</h2>
									</div>
									{#if openRisks.length > 0}
										<span class="text-2xs font-medium text-muted-foreground">
											{openRisks.length} open
										</span>
									{/if}
								</header>
								<div class="pt-2">
									{#if visibleRisks.length > 0}
										{#each visibleRisks as risk (risk.id)}
											<button
												type="button"
												class="entity-row"
												onclick={() => openEntity('risk', risk.id)}
											>
												<div class="min-w-0 flex-1">
													<p class="truncate text-sm font-semibold">
														{risk.title}
													</p>
													<p
														class="truncate text-xs text-muted-foreground"
													>
														{humanize(risk.impact)} impact
														{risk.probability !== null &&
														risk.probability !== undefined
															? ` · ${Math.round(risk.probability * 100)}% likelihood`
															: ''}
													</p>
												</div>
												<span
													class="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-2xs font-semibold text-destructive"
												>
													{humanize(risk.state_key)}
												</span>
											</button>
										{/each}
										{#if openRisks.length > 5}
											<button
												type="button"
												class="view-all-row"
												aria-expanded={showAllRisks}
												onclick={() => (showAllRisks = !showAllRisks)}
											>
												{showAllRisks
													? 'Show fewer risks'
													: `Show all ${openRisks.length} risks`}
											</button>
										{/if}
										{#if canEdit}
											<button
												type="button"
												class="entity-create-row"
												onclick={() => createWorkspaceEntity('risk')}
											>
												<Plus class="h-3.5 w-3.5" />
												Add risk
											</button>
										{/if}
									{:else}
										<div class="section-empty-state">
											<AlertTriangle
												class="h-5 w-5 shrink-0 text-muted-foreground"
											/>
											<div class="min-w-0 flex-1">
												<p class="text-sm font-semibold">No open risks</p>
												<p class="text-xs text-muted-foreground">
													Nothing is currently flagged.
												</p>
											</div>
											{#if canEdit}
												<button
													type="button"
													class="section-empty-action shrink-0"
													onclick={() => createWorkspaceEntity('risk')}
												>
													Add risk
												</button>
											{/if}
										</div>
									{/if}
								</div>
							</section>
						</aside>
					</div>
				</div>
			</div>
		{:else if activeTab === 'docs'}
			<div
				id="workspace-docs"
				class="workspace-panel"
				role="tabpanel"
				aria-labelledby="workspace-tab-docs"
				tabindex="0"
			>
				<h2 class="sr-only">Project documents</h2>

				<div class="min-w-0">
					{#if isHydrating}
						<div
							class="min-h-[420px] animate-pulse border-y border-border bg-card/40 motion-reduce:animate-none"
							aria-label="Loading project documents"
						></div>
					{:else}
						{#await import('$lib/components/project/ProjectDocumentsSection.svelte')}
							<div
								class="min-h-[420px] animate-pulse border-y border-border bg-card/40 motion-reduce:animate-none"
								aria-label="Loading project documents"
							></div>
						{:then { default: ProjectDocumentsSection }}
							<ProjectDocumentsSection
								projectId={project.id}
								{documents}
								{canEdit}
								{activeDocumentId}
								onCreateDocument={createDocument}
								onOpenDocument={(id) => openEntity('document', id)}
								onMoveDocument={moveDocument}
								onDeleteDocument={archiveDocument}
								onDataLoaded={handleDocTreeDataLoaded}
								initialStructure={docTreeStructure}
								initialDocuments={docTreeDocuments}
								initialUnlinked={docTreeUnlinked}
								initialArchived={docTreeArchived}
								maxInitialDepth={1}
								pollInterval={30000}
								variant="workspace"
							/>
						{/await}
					{/if}
				</div>
			</div>
		{:else}
			<div
				id="workspace-activity"
				class="workspace-panel"
				role="tabpanel"
				aria-labelledby="workspace-tab-activity"
				tabindex="0"
			>
				<h2 class="sr-only">Project activity</h2>

				{#if isHydrating}
					<div
						class="min-h-[360px] animate-pulse border-y border-border bg-card/40 motion-reduce:animate-none"
						aria-label="Loading project activity"
					></div>
				{:else}
					<ProjectRecentChats projectId={project.id} onOpenChat={openRecentChat} />

					<div class="mt-6">
						<PulseStrip
							projectId={project.id}
							{tasks}
							{milestones}
							{goals}
							{events}
							loadActivity={true}
							mode="workspace"
							onOpenEntity={(type, id) => openEntity(type, id)}
						/>
					</div>
				{/if}
			</div>
		{/if}
	</main>
</div>

{#if showTaskCreateModal}
	{#await import('$lib/components/ontology/TaskCreateModal.svelte') then { default: TaskCreateModal }}
		<TaskCreateModal
			projectId={project.id}
			onClose={() => (showTaskCreateModal = false)}
			onCreated={(taskId) => {
				showTaskCreateModal = false;
				void refreshEntity('task', taskId, 'create');
				openEntity('task', taskId);
			}}
		/>
	{/await}
{/if}

{#if editingTaskId}
	{#await import('$lib/components/ontology/TaskEditModal.svelte') then { default: TaskEditModal }}
		<TaskEditModal
			taskId={editingTaskId}
			projectId={project.id}
			onClose={closeEntityEditor}
			onUpdated={() => {
				void refreshEntity('task', editingTaskId);
				closeEntityEditor();
			}}
			onDeleted={() => {
				void refreshEntity('task', editingTaskId, 'delete');
				closeEntityEditor();
			}}
		/>
	{/await}
{/if}

{#if showDocumentModal}
	{#await import('$lib/components/ontology/DocumentModal.svelte') then { default: DocumentModal }}
		<DocumentModal
			isOpen={showDocumentModal}
			projectId={project.id}
			documentId={activeDocumentId}
			{parentDocumentId}
			onClose={closeDocumentModal}
			onSaved={() => void refreshEntity('document', activeDocumentId)}
			onDeleted={() => {
				void refreshEntity('document', activeDocumentId, 'delete');
				closeDocumentModal();
			}}
			onCreateChildRequested={(parentId) => createDocument(parentId)}
		/>
	{/await}
{/if}

{#if showMoveDocumentModal && moveDocumentId}
	<DocMoveModal
		isOpen={showMoveDocumentModal}
		projectId={project.id}
		documentId={moveDocumentId}
		documentTitle={moveDocumentTitle}
		structure={docTreeStructure}
		documents={docTreeDocuments}
		onClose={closeMoveDocumentModal}
		onMove={confirmMoveDocument}
	/>
{/if}

{#if showArchiveDocumentModal && archiveDocumentId}
	<DocDeleteConfirmModal
		isOpen={showArchiveDocumentModal}
		documentTitle={archiveDocumentTitle}
		hasChildren={archiveDocumentHasChildren}
		childCount={archiveDocumentChildCount}
		onClose={closeArchiveDocumentModal}
		onDelete={confirmArchiveDocument}
	/>
{/if}

<ProjectWorkspaceEntityModals
	{project}
	{contextDocument}
	canAdmin={access.canAdmin}
	{goals}
	{tasks}
	tasksComplete={tasksCoverage.complete}
	createKind={createEntityKind}
	editTarget={editingEntity}
	onCloseCreate={() => (createEntityKind = null)}
	onCreated={handleWorkspaceEntityCreated}
	onCloseEdit={closeEntityEditor}
	onMutated={handleWorkspaceEntityMutated}
/>

{#if showProjectBriefModal}
	<ProjectBriefHubModal
		isOpen={showProjectBriefModal}
		projectId={project.id}
		{contextDocument}
		{canEdit}
		onClose={() => (showProjectBriefModal = false)}
		onOpenStartHere={openStartHereDocument}
	/>
{/if}

<Modal
	isOpen={showGraphModal}
	onClose={() => (showGraphModal = false)}
	title="Project graph"
	size="xl"
	ariaLabel="Project relationship graph"
>
	<div class="h-[60vh] sm:h-[70vh]">
		{#if showGraphModal}
			{#await import('$lib/components/ontology/ProjectGraphSection.svelte')}
				<div
					class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
				>
					<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" />
					Loading project graph…
				</div>
			{:then { default: ProjectGraphSection }}
				<ProjectGraphSection
					projectId={project.id}
					onNodeClick={(node) => {
						showGraphModal = false;
						openEntity(node.type, node.id);
					}}
				/>
			{:catch graphError}
				<div class="flex h-full items-center justify-center px-4 text-sm text-destructive">
					{graphError instanceof Error
						? graphError.message
						: 'The project graph could not be loaded.'}
				</div>
			{/await}
		{/if}
	</div>
</Modal>

{#if selectedRecentChatSessionId}
	{#await import('$lib/components/agent/AgentChatModal.svelte') then { default: AgentChatModal }}
		<AgentChatModal
			isOpen={true}
			initialChatSessionId={selectedRecentChatSessionId}
			onClose={closeRecentChat}
		/>
	{/await}
{/if}

{#if showMemoryUpdateChatModal}
	{#await import('$lib/components/agent/AgentChatModal.svelte') then { default: AgentChatModal }}
		<AgentChatModal
			isOpen={true}
			contextType="project"
			entityId={project.id}
			onClose={() => {
				showMemoryUpdateChatModal = false;
			}}
		/>
	{/await}
{/if}

<style>
	.workspace-tab {
		display: inline-flex;
		min-height: 48px;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 3px solid transparent;
		padding: 0.75rem 0.875rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		font-weight: 600;
		transition:
			color 150ms ease,
			border-color 150ms ease,
			background-color 150ms ease;
	}

	.workspace-tab:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.45);
	}

	.workspace-tab:focus-visible {
		border-radius: 0.5rem 0.5rem 0 0;
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.workspace-tab-active {
		border-bottom-color: hsl(var(--accent));
		background: hsl(var(--card) / 0.72);
		color: hsl(var(--foreground));
	}

	.workspace-tab-active .tab-count {
		background: hsl(var(--accent) / 0.12);
		color: hsl(var(--accent));
	}

	.tab-count {
		display: inline-flex;
		min-width: 1.25rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: hsl(var(--muted));
		padding: 0.125rem 0.375rem;
		font-size: 0.6875rem;
		font-variant-numeric: tabular-nums;
	}

	.workspace-toolbar {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.7);
		padding-bottom: 0.75rem;
	}

	.view-all-row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.micro-label {
		color: hsl(var(--muted-foreground));
		font-weight: 600;
	}

	.overview-section {
		min-width: 0;
		border-top: 1px solid hsl(var(--border));
		padding-top: 1rem;
	}

	.overview-section-header {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0 0.25rem 0.75rem;
	}

	.entity-row {
		display: flex;
		width: 100%;
		min-width: 0;
		min-height: 44px;
		align-items: center;
		gap: 0.625rem;
		border-radius: 0.5rem;
		padding: 0.5rem 0.625rem;
		text-align: left;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.entity-row:hover {
		background: hsl(var(--muted) / 0.6);
	}

	.entity-row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.view-all-row {
		display: flex;
		min-height: 44px;
		width: 100%;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		padding: 0.5rem 0.625rem;
		color: hsl(var(--accent));
		font-size: 0.75rem;
		font-weight: 600;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.view-all-row:hover {
		background: hsl(var(--accent) / 0.08);
	}

	.entity-create-row {
		display: flex;
		min-height: 44px;
		width: 100%;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		border: 1px dashed hsl(var(--border));
		border-radius: 0.5rem;
		padding: 0.5rem 0.625rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		font-weight: 600;
		transition:
			border-color 120ms ease,
			background-color 120ms ease,
			color 120ms ease;
	}

	.entity-create-row:hover {
		border-color: hsl(var(--accent) / 0.45);
		background: hsl(var(--accent) / 0.06);
		color: hsl(var(--accent));
	}

	.entity-create-row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.empty-row {
		display: flex;
		min-height: 44px;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.625rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
	}

	.section-empty-state {
		display: flex;
		min-width: 0;
		min-height: 52px;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.625rem;
	}

	.section-empty-action {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		padding: 0 0.625rem;
		color: hsl(var(--accent));
		font-size: 0.75rem;
		font-weight: 600;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.section-empty-action:hover {
		background: hsl(var(--accent) / 0.08);
	}

	.section-empty-action:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.workspace-panel {
		min-width: 0;
		border-radius: 0.75rem;
	}

	.workspace-panel:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 3px;
	}

	@media (max-width: 639px) {
		.workspace-tabs {
			scroll-padding-inline: 0.5rem;
			scrollbar-width: none;
		}

		.workspace-tabs::-webkit-scrollbar {
			display: none;
		}

		.workspace-tablist {
			min-width: 100%;
			justify-content: space-between;
			gap: 0;
		}

		.workspace-tab {
			gap: 0.375rem;
			padding-inline: 0.625rem;
			font-size: 0.8125rem;
		}
	}

	@keyframes workspace-panel-in {
		from {
			opacity: 0.72;
			transform: translateY(3px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.workspace-panel {
			animation: workspace-panel-in 180ms cubic-bezier(0.4, 0, 0.2, 1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.workspace-tab,
		.entity-row,
		.view-all-row,
		.entity-create-row,
		.section-empty-action {
			transition: none;
		}
	}
</style>
