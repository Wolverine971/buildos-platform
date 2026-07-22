<!-- apps/web/src/routes/projects-v2/[id]/ProjectWorkspacePrototype.svelte -->
<!--
	Project workspace prototype body

	Information architecture:
	- Work is the default operating surface: current focus + the real Kanban board.
	- Overview answers why/where: memory, goals, milestones, plans, risks, and dates.
	- Docs gives the real document tree a dedicated, full-width workspace.
	- Activity owns change history and upcoming events.

	The route intentionally reuses the production project loader and existing task/document
	editors. It is a live prototype, not a static mock.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { pushState, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { DocDeleteConfirmModal, DocMoveModal } from '$lib/components/ontology/doc-tree';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
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
		type OntoEventWithSync,
		type ProjectFullData
	} from '$lib/components/project/project-page-data-controller';
	import { parseDocStructure } from '$lib/services/ontology/doc-structure.service';
	import {
		createCompleteProjectTasksCoverage,
		getProjectTaskAsOfMs,
		groupProjectTasksByBucket
	} from '$lib/utils/project-task-board';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import { toastService } from '$lib/stores/toast.store';
	import type { Document, Goal, Milestone, Plan, Project, Risk, Task } from '$lib/types/onto';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';
	import type {
		ProjectActiveTaskBucketKey,
		ProjectTaskBoardBucketKey,
		ProjectTasksCoverage
	} from '$lib/types/project-full-data';
	import {
		Activity,
		AlertTriangle,
		ArrowLeft,
		ArrowRight,
		Calendar,
		CalendarClock,
		CheckCircle2,
		ChevronRight,
		Columns2,
		FileText,
		Flag,
		LayoutDashboard,
		ListChecks,
		LoaderCircle,
		Network,
		Pencil,
		Plus,
		Sparkles,
		Target,
		Workflow
	} from '$lib/icons/lucide';
	import type { PageData } from './$types';
	import ProjectWorkspaceEntityModals from './ProjectWorkspaceEntityModals.svelte';

	type WorkspaceTab = 'work' | 'overview' | 'docs' | 'activity';
	type WorkspaceCreateKind = 'goal' | 'plan' | 'milestone' | 'risk' | 'event';
	type WorkspaceEditTarget = Extract<EntityOpenAction, { kind: WorkspaceCreateKind | 'project' }>;

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

	const TAB_ORDER: WorkspaceTab[] = ['work', 'overview', 'docs', 'activity'];

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

	let activeTab = $state<WorkspaceTab>('work');
	let tabButtons = $state<Array<HTMLButtonElement | null>>([]);
	let isHydrating = $state(initialData.skeleton === true);
	let hydrationError = $state<string | null>(null);
	let isRefreshing = $state(false);

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
	let docTreeViewRef = $state<{ refresh: () => void } | null>(null);

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
	let showAgentChatModal = $state(false);
	let showAllGoals = $state(false);
	let showAllPlans = $state(false);
	let showAllMilestones = $state(false);
	let showAllRisks = $state(false);
	let showAllEvents = $state(false);
	let showFullBrief = $state(false);
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

	const taskBuckets = $derived(
		groupProjectTasksByBucket(tasks, getProjectTaskAsOfMs(tasksCoverage.as_of))
	);
	const taskSignals = $derived.by(() => {
		const total = tasksCoverage.total || tasks.length;
		const done = tasksCoverage.buckets.done?.total ?? taskBuckets.done.length;
		const overdue = tasksCoverage.buckets.overdue?.total ?? taskBuckets.overdue.length;
		return {
			total,
			done,
			overdue,
			completion: total > 0 ? Math.round((done / total) * 100) : 0
		};
	});
	const taskStateSignals = $derived.by(() => {
		let inProgress = 0;
		let blocked = 0;
		for (const task of tasks) {
			if (task.deleted_at || task.state_key === 'done') continue;
			if (task.state_key === 'in_progress') inProgress += 1;
			if (task.state_key === 'blocked') blocked += 1;
		}
		return { inProgress, blocked };
	});
	const taskStateCountsMayBePartial = $derived(!tasksCoverage.complete);

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
	const upcomingEvents = $derived.by(() => {
		const now = Date.now();
		return events
			.filter((event) => Date.parse(event.start_at) >= now)
			.slice()
			.sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at));
	});
	const recentDocuments = $derived(
		documents
			.filter((document) => !document.deleted_at)
			.slice()
			.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
			.slice(0, 4)
	);

	const nextMilestone = $derived(upcomingMilestones[0] ?? null);
	const activeTask = $derived(taskBuckets.in_progress[0] ?? null);
	const projectStatusLabel = $derived(humanize(project.state_key || 'planning'));
	const projectDescription = $derived(
		project.description?.trim() ||
			'Add a concise description so collaborators can orient in seconds.'
	);
	const projectDescriptionNeedsDisclosure = $derived(
		(project.description?.trim().length ?? 0) > 320 ||
			(project.description?.match(/\n/g)?.length ?? 0) >= 4
	);
	const visibleGoals = $derived(showAllGoals ? activeGoals : activeGoals.slice(0, 5));
	const visiblePlans = $derived(showAllPlans ? activePlans : activePlans.slice(0, 5));
	const visibleMilestones = $derived(
		showAllMilestones ? upcomingMilestones : upcomingMilestones.slice(0, 5)
	);
	const visibleRisks = $derived(showAllRisks ? openRisks : openRisks.slice(0, 5));
	const visibleEvents = $derived(showAllEvents ? upcomingEvents : upcomingEvents.slice(0, 4));

	function humanize(value: string | null | undefined): string {
		if (!value) return 'Unknown';
		return value
			.replace(/[._-]+/g, ' ')
			.replace(/\b\w/g, (character) => character.toUpperCase());
	}

	function statusClass(state: string): string {
		switch (state) {
			case 'active':
			case 'achieved':
			case 'completed':
				return 'border-success/30 bg-success/10 text-success';
			case 'paused':
			case 'draft':
			case 'planning':
				return 'border-warning/30 bg-warning/10 text-foreground';
			case 'cancelled':
			case 'abandoned':
			case 'missed':
				return 'border-destructive/30 bg-destructive/10 text-destructive';
			default:
				return 'border-border bg-muted/50 text-muted-foreground';
		}
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

	function formatEventDate(event: OntoEventWithSync): string {
		const date = new Date(event.start_at);
		if (event.all_day) {
			return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		}
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function seedDocumentTree() {
		const seed = buildDocumentSeed(project, documents);
		docTreeStructure = seed.structure;
		docTreeDocuments = seed.documents;
		docTreeArchived = seed.archived;
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

	async function hydrateContextDocument() {
		if (!contextDocument?.id || contextDocument.content) return;
		try {
			const loaded = await fetchProjectDocument(contextDocument.id);
			if (contextDocument?.id === loaded.id) contextDocument = loaded;
		} catch (error) {
			console.warn('[Project workspace prototype] Failed to load project memory', error);
		}
	}

	async function refreshProject() {
		if (isRefreshing) return;
		isRefreshing = true;
		try {
			const fullData = await fetchProjectFullData(project.id, { profile: 'v2-initial' });
			applyFullData(fullData);
			void hydrateContextDocument();
		} catch (error) {
			console.warn('[Project workspace prototype] Failed to refresh project', error);
		} finally {
			isRefreshing = false;
		}
	}

	function selectTab(tab: WorkspaceTab, updateUrl = true) {
		activeTab = tab;
		if (!browser || !updateUrl) return;
		const url = new URL(window.location.href);
		url.searchParams.set('view', tab);
		replaceState(url, { ...page.state });
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
				replaceState(url, { ...page.state });
			} else {
				pushState(url, { ...page.state });
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
			replaceState(url, { ...page.state });
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
		void refreshProject();
		openEntity(kind, entityId);
	}

	function handleWorkspaceEntityMutated() {
		closeEntityEditor();
		void refreshProject();
	}

	function focusTaskBucket(bucket: ProjectTaskBoardBucketKey) {
		if (!browser) return;
		const column = document.getElementById(`task-bucket-${bucket}`);
		if (!(column instanceof HTMLElement)) return;
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		column.focus({ preventScroll: true });
		column.scrollIntoView({
			behavior: reduceMotion ? 'auto' : 'smooth',
			block: 'nearest',
			inline: 'center'
		});
	}

	function openTaskBucket(bucket: ProjectTaskBoardBucketKey) {
		selectTab('work');
		if (!browser) return;
		requestAnimationFrame(() => focusTaskBucket(bucket));
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
			docTreeViewRef?.refresh();
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
			docTreeViewRef?.refresh();
			void refreshProject();
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
		void hydrateProject();
	});
</script>

<svelte:window onpopstate={handleWorkspacePopState} />

<svelte:head>
	<title>{project.name || 'Project'} · BuildOS</title>
	<meta
		name="description"
		content="A focused BuildOS project workspace for work, direction, documents, and activity."
	/>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<header class="border-b border-border bg-card tx tx-frame tx-weak">
		<div class="mx-auto max-w-7xl px-2 pt-2 sm:px-4 sm:pt-3 lg:px-6">
			<div class="flex min-w-0 items-start justify-between gap-2">
				<div class="flex min-w-0 flex-1 items-start gap-1 sm:gap-2">
					<a
						href="/projects"
						class="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
						aria-label="All projects"
					>
						<ArrowLeft class="h-4 w-4 shrink-0" />
						<span class="hidden lg:inline">All projects</span>
					</a>
					<div class="flex min-w-0 flex-1 items-start gap-2 py-1">
						<ProjectIcon
							svg={project.icon_svg ?? null}
							concept={project.icon_concept ?? null}
							size="md"
						/>
						<div class="min-w-0 flex-1">
							<div class="flex min-w-0 items-center gap-2">
								<h1
									class="min-w-0 flex-1 truncate text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl"
									style:view-transition-name="project-title-{project.id}"
									style:view-transition-class="project-title"
								>
									{project.name || 'Untitled project'}
								</h1>
								<span
									class="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-2xs font-semibold {statusClass(
										project.state_key
									)}"
								>
									{projectStatusLabel}
								</span>
							</div>
							<p
								class="mt-0.5 hidden max-w-3xl truncate text-sm text-muted-foreground sm:block"
							>
								{project.description || 'No project description yet.'}
							</p>
						</div>
					</div>
				</div>

				<Button
					variant="outline"
					size="sm"
					icon={Network}
					onclick={() => (showGraphModal = true)}
				>
					<span class="hidden sm:inline">Graph</span>
					<span class="sr-only sm:hidden">Open project graph</span>
				</Button>
			</div>

			<div
				class="mt-2 grid border-y border-border bg-background/55 sm:grid-cols-2"
				aria-label="Project focus"
			>
				<button
					type="button"
					class="operating-focus group border-b border-border sm:border-b-0 sm:border-r"
					aria-label={activeTask
						? `Open active task ${activeTask.title}`
						: 'Jump to the in progress task column'}
					onclick={() =>
						activeTask
							? openEntity('task', activeTask.id)
							: openTaskBucket('in_progress')}
				>
					<div class="focus-icon bg-info/10">
						<ListChecks class="h-4 w-4 text-info" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="micro-label">ACTIVE NOW</p>
						<p class="truncate text-sm font-semibold text-foreground">
							{activeTask?.title || 'No task is marked in progress'}
						</p>
						<p class="truncate text-xs text-muted-foreground">
							{taskStateSignals.inProgress > 1
								? `${taskStateSignals.inProgress}${taskStateCountsMayBePartial ? '+' : ''} active tasks`
								: activeTask
									? 'Open the task to continue'
									: 'Move one task into In progress to set focus'}
						</p>
					</div>
					<ArrowRight
						class="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
					/>
				</button>

				<div class="operating-focus">
					<div class="focus-icon bg-accent/10">
						<Sparkles class="h-4 w-4 text-accent" />
					</div>
					<div class="min-w-0 flex-1">
						<p class="micro-label">RECOMMENDED NEXT</p>
						<p class="line-clamp-2 text-sm font-medium text-foreground">
							{project.next_step_short ||
								'Choose the next concrete move for this project.'}
						</p>
					</div>
					<button
						type="button"
						class="plan-next-action"
						onclick={() => (showAgentChatModal = true)}
					>
						Plan
					</button>
				</div>
			</div>

			<div
				class="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
				aria-label="Project status summary"
			>
				<span>
					<strong class="font-semibold tabular-nums text-foreground"
						>{taskSignals.completion}%</strong
					>
					complete
				</span>
				{#if taskSignals.overdue > 0}
					<button
						type="button"
						class="summary-link text-destructive"
						onclick={() => openTaskBucket('overdue')}
					>
						{taskSignals.overdue} overdue
					</button>
				{/if}
				{#if taskStateSignals.blocked > 0}
					<button
						type="button"
						class="summary-link text-foreground"
						onclick={() => openTaskBucket('blocked')}
					>
						{taskStateSignals.blocked}{taskStateCountsMayBePartial ? '+' : ''} blocked
					</button>
				{/if}
				{#if nextMilestone}
					<button
						type="button"
						class="summary-link"
						aria-label="Open next checkpoint {nextMilestone.title}"
						onclick={() => openEntity('milestone', nextMilestone.id)}
					>
						Checkpoint {formatDate(nextMilestone.due_at)}
					</button>
				{/if}
			</div>

			<nav class="-mb-px overflow-x-auto" aria-label="Project workspace views">
				<div class="flex min-w-max gap-1" role="tablist" aria-orientation="horizontal">
					<button
						bind:this={tabButtons[0]}
						type="button"
						id="workspace-tab-work"
						role="tab"
						aria-selected={activeTab === 'work'}
						aria-controls="workspace-work"
						tabindex={activeTab === 'work' ? 0 : -1}
						onclick={() => selectTab('work')}
						onkeydown={(event) => handleTabKeydown(event, 0)}
						class="workspace-tab {activeTab === 'work' ? 'workspace-tab-active' : ''}"
					>
						<Columns2 class="h-4 w-4" />
						Work
						<span class="tab-count">{taskSignals.total}</span>
					</button>
					<button
						bind:this={tabButtons[1]}
						type="button"
						id="workspace-tab-overview"
						role="tab"
						aria-selected={activeTab === 'overview'}
						aria-controls="workspace-overview"
						tabindex={activeTab === 'overview' ? 0 : -1}
						onclick={() => selectTab('overview')}
						onkeydown={(event) => handleTabKeydown(event, 1)}
						class="workspace-tab {activeTab === 'overview'
							? 'workspace-tab-active'
							: ''}"
					>
						<LayoutDashboard class="h-4 w-4" />
						Overview
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
						<FileText class="h-4 w-4" />
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
						<Activity class="h-4 w-4" />
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
								: activeTab === 'docs'
									? 'Search documents...'
									: 'Find a project entity...'}
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
				<Button variant="outline" size="sm" icon={Plus} onclick={() => createDocument()}>
					<span class="hidden sm:inline">New document</span>
					<span class="sr-only sm:hidden">New document</span>
				</Button>
			{/if}
		</div>

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
							onTaskMoved={() => void refreshProject()}
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
				<div class="space-y-6">
					<section class="overview-brief" aria-labelledby="overview-brief-title">
						<div class="min-w-0">
							<p class="micro-label">PROJECT BRIEF</p>
							<h2 id="overview-brief-title" class="sr-only">Project brief</h2>
							<p
								class="mt-2 max-w-4xl whitespace-pre-line text-base leading-relaxed text-foreground sm:text-lg {projectDescriptionNeedsDisclosure &&
								!showFullBrief
									? 'line-clamp-5'
									: ''}"
							>
								{projectDescription}
							</p>
							{#if projectDescriptionNeedsDisclosure}
								<button
									type="button"
									class="brief-toggle"
									aria-expanded={showFullBrief}
									onclick={() => (showFullBrief = !showFullBrief)}
								>
									{showFullBrief ? 'Show less' : 'Read full brief'}
								</button>
							{/if}
						</div>
						<dl class="overview-meta" aria-label="Project dates and status">
							<div class="overview-meta-item">
								<dt class="micro-label">STATUS</dt>
								<dd class="mt-1 text-sm font-semibold">{projectStatusLabel}</dd>
							</div>
							<div class="overview-meta-item">
								<dt class="micro-label">START</dt>
								<dd class="mt-1 text-sm font-semibold">
									{formatDate(project.start_at, true)}
								</dd>
							</div>
							<div class="overview-meta-item">
								<dt class="micro-label">TARGET</dt>
								<dd class="mt-1 text-sm font-semibold">
									{formatDate(project.end_at, true)}
								</dd>
							</div>
						</dl>
					</section>

					<div
						class="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.8fr)]"
					>
						<div class="min-w-0 space-y-6">
							<section
								class="overview-section"
								aria-labelledby="overview-direction-title"
							>
								<header class="overview-section-header">
									<div class="flex min-w-0 items-center gap-3">
										<div class="section-icon bg-warning/10">
											<Target class="h-4 w-4 text-warning" />
										</div>
										<div class="min-w-0">
											<h2
												id="overview-direction-title"
												class="text-sm font-semibold"
											>
												Direction
											</h2>
											<p class="text-xs text-muted-foreground">
												Goals and the plans that connect them
											</p>
										</div>
									</div>
									<span
										class="shrink-0 text-2xs font-medium text-muted-foreground"
									>
										{activeGoals.length} goals · {activePlans.length} plans
									</span>
								</header>
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
														<p class="truncate text-sm font-semibold">
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
													onclick={() => (showAllGoals = !showAllGoals)}
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
													onclick={() => createWorkspaceEntity('goal')}
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
														<p class="truncate text-sm font-semibold">
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
													onclick={() => (showAllPlans = !showAllPlans)}
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
													onclick={() => createWorkspaceEntity('plan')}
												>
													<Plus class="h-3.5 w-3.5" />
													Add plan
												</button>
											{/if}
										</div>
									</div>
								</div>
							</section>

							{#if contextDocument}
								{#await import('$lib/components/project/ProjectMemoryCard.svelte') then { default: ProjectMemoryCard }}
									<ProjectMemoryCard
										document={contextDocument}
										nextStepShort={null}
										showNextStep={false}
										variant="flat"
										{canEdit}
										onOpenStartHere={(id) => openEntity('document', id)}
										onUpdateProject={() => (showAgentChatModal = true)}
									/>
								{/await}
							{/if}
						</div>

						<aside class="min-w-0 space-y-6">
							<section
								class="overview-section"
								aria-labelledby="overview-milestones-title"
							>
								<header class="overview-section-header">
									<div class="flex min-w-0 items-center gap-3">
										<div class="section-icon bg-accent/10">
											<Flag class="h-4 w-4 text-accent" />
										</div>
										<div class="min-w-0">
											<h2
												id="overview-milestones-title"
												class="text-sm font-semibold"
											>
												Milestones
											</h2>
											<p class="text-xs text-muted-foreground">
												Upcoming checkpoints
											</p>
										</div>
									</div>
								</header>
								<div class="pt-2">
									{#each visibleMilestones as milestone (milestone.id)}
										<button
											type="button"
											class="entity-row"
											onclick={() => openEntity('milestone', milestone.id)}
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
												<p class="truncate text-xs text-muted-foreground">
													{milestone.due_at
														? formatDate(milestone.due_at, true)
														: 'No target date'}
												</p>
											</div>
										</button>
									{:else}
										<div class="empty-row">
											<Flag class="h-5 w-5" />
											<p>No upcoming milestones</p>
										</div>
									{/each}
									{#if upcomingMilestones.length > 5}
										<button
											type="button"
											class="view-all-row"
											aria-expanded={showAllMilestones}
											onclick={() => (showAllMilestones = !showAllMilestones)}
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
								</div>
							</section>

							<section
								class="overview-section"
								aria-labelledby="overview-watchlist-title"
							>
								<header class="overview-section-header">
									<div class="flex min-w-0 items-center gap-3">
										<div class="section-icon bg-destructive/10">
											<AlertTriangle class="h-4 w-4 text-destructive" />
										</div>
										<div class="min-w-0">
											<h2
												id="overview-watchlist-title"
												class="text-sm font-semibold"
											>
												Watchlist
											</h2>
											<p class="text-xs text-muted-foreground">
												Open project risks
											</p>
										</div>
									</div>
								</header>
								<div class="pt-2">
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
												<p class="truncate text-xs text-muted-foreground">
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
									{:else}
										<div class="empty-row">
											<CheckCircle2 class="h-5 w-5 text-success" />
											<p>No open risks</p>
										</div>
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
								</div>
							</section>

							<section
								class="overview-section"
								aria-labelledby="overview-events-title"
							>
								<header class="overview-section-header">
									<div class="flex min-w-0 items-center gap-3">
										<div class="section-icon bg-info/10">
											<CalendarClock class="h-4 w-4 text-info" />
										</div>
										<div class="min-w-0">
											<h2
												id="overview-events-title"
												class="text-sm font-semibold"
											>
												Coming up
											</h2>
											<p class="text-xs text-muted-foreground">
												Project calendar
											</p>
										</div>
									</div>
								</header>
								<div class="pt-2">
									{#each visibleEvents as event (event.id)}
										<button
											type="button"
											class="entity-row"
											onclick={() => openEntity('event', event.id)}
										>
											<Calendar class="h-4 w-4 shrink-0 text-info" />
											<div class="min-w-0 flex-1">
												<p class="truncate text-sm font-semibold">
													{event.title}
												</p>
												<p class="truncate text-xs text-muted-foreground">
													{formatEventDate(event)}
												</p>
											</div>
										</button>
									{:else}
										<div class="empty-row">
											<Calendar class="h-5 w-5" />
											<p>No upcoming events</p>
										</div>
									{/each}
									{#if upcomingEvents.length > 4}
										<button
											type="button"
											class="view-all-row"
											aria-expanded={showAllEvents}
											onclick={() => (showAllEvents = !showAllEvents)}
										>
											{showAllEvents
												? 'Show fewer events'
												: `Show all ${upcomingEvents.length} events`}
										</button>
									{/if}
									{#if canEdit}
										<button
											type="button"
											class="entity-create-row"
											onclick={() => createWorkspaceEntity('event')}
										>
											<Plus class="h-3.5 w-3.5" />
											Add event
										</button>
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
				<div class="mb-3 flex items-center gap-3 px-1 py-1">
					<div class="flex min-w-0 items-center gap-3">
						<div class="section-icon bg-info/10">
							<FileText class="h-4 w-4 text-info" />
						</div>
						<div class="min-w-0">
							<h2 class="text-base font-semibold">Project knowledge</h2>
							<p class="text-sm text-muted-foreground">
								Specs, decisions, research, and the context that keeps work
								coherent.
							</p>
						</div>
					</div>
				</div>

				<div
					class="grid gap-5 lg:gap-6 {recentDocuments.length > 0
						? 'lg:grid-cols-[minmax(0,1fr)_18rem]'
						: ''}"
				>
					<div class="min-w-0">
						{#if isHydrating}
							<div
								class="min-h-[420px] animate-pulse rounded-lg border border-border bg-card shadow-ink motion-reduce:animate-none"
								aria-label="Loading project documents"
							></div>
						{:else}
							{#await import('$lib/components/project/ProjectDocumentsSection.svelte')}
								<div
									class="min-h-[420px] animate-pulse rounded-lg border border-border bg-card shadow-ink motion-reduce:animate-none"
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
									onTreeRefChange={(ref) => (docTreeViewRef = ref)}
									initialStructure={docTreeStructure}
									initialDocuments={docTreeDocuments}
									initialUnlinked={docTreeUnlinked}
									initialArchived={docTreeArchived}
									pollInterval={30000}
									variant="workspace"
								/>
							{/await}
						{/if}
					</div>

					{#if recentDocuments.length > 0}
						<aside class="docs-recent-context order-first h-fit min-w-0 lg:order-last">
							<header class="mb-2 flex items-end justify-between gap-3">
								<p class="micro-label">RECENTLY UPDATED</p>
								<p class="hidden text-xs text-muted-foreground lg:block">
									Quick access
								</p>
							</header>
							<div class="docs-recent-list">
								{#each recentDocuments as document (document.id)}
									<button
										type="button"
										class="entity-row docs-recent-row"
										onclick={() => openEntity('document', document.id)}
									>
										<FileText class="h-4 w-4 shrink-0 text-info" />
										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold">
												{document.title}
											</p>
											<p class="truncate text-xs text-muted-foreground">
												Updated {formatRelativeTime(document.updated_at)}
											</p>
										</div>
									</button>
								{/each}
							</div>
						</aside>
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
				<div class="mb-3 flex items-center gap-3">
					<div class="section-icon bg-success/10">
						<Activity class="h-4 w-4 text-success" />
					</div>
					<div>
						<h2 class="text-base font-semibold">Project activity</h2>
						<p class="text-sm text-muted-foreground">
							Review the full change history alongside what is due next.
						</p>
					</div>
				</div>

				{#if isHydrating}
					<div
						class="min-h-[360px] animate-pulse rounded-lg border border-border bg-card shadow-ink motion-reduce:animate-none"
						aria-label="Loading project activity"
					></div>
				{:else}
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
				void refreshProject();
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
				closeEntityEditor();
				void refreshProject();
			}}
			onDeleted={() => {
				closeEntityEditor();
				void refreshProject();
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
			onSaved={() => void refreshProject()}
			onDeleted={() => {
				closeDocumentModal();
				void refreshProject();
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

{#if showAgentChatModal}
	{#await import('$lib/components/agent/AgentChatModal.svelte') then { default: AgentChatModal }}
		<AgentChatModal
			isOpen={showAgentChatModal}
			contextType="project"
			entityId={project.id}
			onClose={() => {
				showAgentChatModal = false;
				void refreshProject();
			}}
		/>
	{/await}
{/if}

<style>
	.workspace-tab {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 0.5rem;
		border-bottom: 2px solid transparent;
		padding: 0.625rem 0.75rem;
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
		color: hsl(var(--foreground));
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

	.operating-focus {
		display: flex;
		min-width: 0;
		min-height: 76px;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		text-align: left;
	}

	button.operating-focus {
		cursor: pointer;
		transition: background-color 120ms ease;
	}

	button.operating-focus:hover {
		background: hsl(var(--muted) / 0.5);
	}

	button.operating-focus:focus-visible,
	.plan-next-action:focus-visible,
	.summary-link:focus-visible,
	.view-all-row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.focus-icon,
	.section-icon {
		display: flex;
		height: 2.25rem;
		width: 2.25rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
	}

	.plan-next-action {
		display: inline-flex;
		min-height: 44px;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--card));
		padding: 0 0.75rem;
		color: hsl(var(--foreground));
		font-size: 0.75rem;
		font-weight: 650;
		transition: background-color 120ms ease;
	}

	.plan-next-action:hover,
	.summary-link:hover {
		background: hsl(var(--muted) / 0.65);
	}

	.plan-next-action:hover {
		border-color: hsl(var(--accent) / 0.45);
	}

	.brief-toggle {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		border-radius: 0.5rem;
		padding: 0 0.5rem;
		color: hsl(var(--accent));
		font-size: 0.75rem;
		font-weight: 600;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.brief-toggle:hover {
		background: hsl(var(--accent) / 0.08);
	}

	.brief-toggle:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.summary-link {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		border-radius: 0.5rem;
		padding: 0 0.5rem;
		font-weight: 600;
		transition: background-color 120ms ease;
	}

	.micro-label {
		color: hsl(var(--muted-foreground));
		font-weight: 600;
	}

	.overview-brief {
		display: grid;
		min-width: 0;
		gap: 1rem;
		border-top: 1px solid hsl(var(--border));
		border-bottom: 1px solid hsl(var(--border));
		padding: 1rem 0.25rem 1.25rem;
	}

	.overview-meta {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-top: 1px solid hsl(var(--border));
		padding-top: 1rem;
	}

	.overview-meta-item {
		min-width: 0;
		padding: 0 0.75rem;
	}

	.overview-meta-item:first-child {
		padding-left: 0;
	}

	.overview-meta-item + .overview-meta-item {
		border-left: 1px solid hsl(var(--border));
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

	.docs-recent-context {
		border-top: 1px solid hsl(var(--border));
		padding-top: 0.75rem;
	}

	.docs-recent-list {
		display: flex;
		min-width: 0;
		gap: 0.5rem;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		padding-bottom: 0.375rem;
		scroll-padding-inline: 0.125rem;
		scroll-snap-type: x mandatory;
	}

	.docs-recent-row {
		flex: 0 0 min(16rem, 78vw);
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		scroll-snap-align: start;
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

	.workspace-panel {
		min-width: 0;
		border-radius: 0.75rem;
	}

	.workspace-panel:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 3px;
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

	@media (min-width: 768px) {
		.overview-brief {
			grid-template-columns: minmax(0, 1fr) minmax(21rem, auto);
			align-items: end;
			gap: 2rem;
		}

		.overview-meta {
			border-top: 0;
			padding-top: 0;
		}
	}

	@media (min-width: 1024px) {
		.docs-recent-context {
			border-top: 0;
			border-left: 1px solid hsl(var(--border));
			padding-top: 0;
			padding-left: 1rem;
		}

		.docs-recent-list {
			display: block;
			overflow: visible;
			padding-bottom: 0;
		}

		.docs-recent-row {
			width: 100%;
			border: 0;
			background: transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.workspace-tab,
		.entity-row,
		.operating-focus,
		.plan-next-action,
		.brief-toggle,
		.summary-link,
		.view-all-row,
		.entity-create-row {
			transition: none;
		}
	}
</style>
