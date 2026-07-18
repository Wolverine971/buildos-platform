<!-- apps/web/src/routes/projects-v2/[id]/+page.svelte -->
<!--
	Project workspace prototype

	Information architecture:
	- Work is the default operating surface: immediate signals + the real Kanban board.
	- Overview answers why/where: memory, goals, milestones, plans, risks, and dates.
	- Docs gives the real document tree a dedicated, full-width workspace.
	- Activity owns change history and upcoming events.

	The route intentionally reuses the production project loader and existing task/document
	editors. It is a live prototype, not a static mock.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
	import ProjectEntitySearchCombobox from '$lib/components/project/v2/ProjectEntitySearchCombobox.svelte';
	import PulseStrip from '$lib/components/project/v2/PulseStrip.svelte';
	import { handleRovingTabKeydown } from '$lib/components/project/v2/board-a11y';
	import {
		fetchProjectDocument,
		fetchProjectFullData,
		fetchProjectTaskBucket,
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
	import type { Document, Goal, Milestone, Plan, Project, Risk, Task } from '$lib/types/onto';
	import type { DocStructure, OntoDocument } from '$lib/types/onto-api';
	import type {
		ProjectActiveTaskBucketKey,
		ProjectTasksCoverage
	} from '$lib/types/project-full-data';
	import {
		Activity,
		AlertTriangle,
		ArrowLeft,
		ArrowRight,
		BookOpen,
		Calendar,
		CalendarClock,
		CheckCircle2,
		ChevronRight,
		Columns2,
		FileText,
		Flag,
		FolderKanban,
		LayoutDashboard,
		ListChecks,
		LoaderCircle,
		MessageCircle,
		Network,
		Plus,
		Sparkles,
		Target,
		Workflow
	} from '$lib/icons/lucide';
	import type { PageData } from './$types';

	type WorkspaceTab = 'work' | 'overview' | 'docs' | 'activity';

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
	let documentsExpanded = $state(true);

	let showTaskCreateModal = $state(false);
	let editingTaskId = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let parentDocumentId = $state<string | null>(null);
	let showGraphModal = $state(false);
	let showAgentChatModal = $state(false);

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
		const inProgress =
			tasksCoverage.buckets.in_progress?.total ?? taskBuckets.in_progress.length;
		const overdue = tasksCoverage.buckets.overdue?.total ?? taskBuckets.overdue.length;
		const blocked = tasksCoverage.buckets.blocked?.total ?? taskBuckets.blocked.length;
		return {
			total,
			done,
			inProgress,
			overdue,
			blocked,
			completion: total > 0 ? Math.round((done / total) * 100) : 0
		};
	});

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
	const primaryGoal = $derived(activeGoals[0] ?? null);
	const primaryRisk = $derived(
		openRisks.slice().sort((a, b) => riskWeight(b) - riskWeight(a))[0] ?? null
	);
	const projectStatusLabel = $derived(humanize(project.state_key || 'planning'));

	function humanize(value: string | null | undefined): string {
		if (!value) return 'Unknown';
		return value
			.replace(/[._-]+/g, ' ')
			.replace(/\b\w/g, (character) => character.toUpperCase());
	}

	function riskWeight(risk: Risk): number {
		const impactWeight = { low: 1, medium: 2, high: 3, critical: 4 }[risk.impact] ?? 0;
		return impactWeight * (risk.probability ?? 0.5);
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
		window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
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

	function openEntity(entityType: string, entityId: string) {
		if (entityType === 'task') {
			editingTaskId = entityId;
			return;
		}
		if (entityType === 'document' || entityType === 'note') {
			activeDocumentId = entityId;
			parentDocumentId = null;
			showDocumentModal = true;
			return;
		}
		const params = new URLSearchParams({ entity: entityType, entity_id: entityId });
		window.location.href = `/projects/${project.id}?${params.toString()}`;
	}

	function createDocument(parentId: string | null = null) {
		activeDocumentId = null;
		parentDocumentId = parentId;
		showDocumentModal = true;
	}

	function closeDocumentModal() {
		showDocumentModal = false;
		activeDocumentId = null;
		parentDocumentId = null;
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
		const requestedView = new URLSearchParams(window.location.search).get('view');
		if (requestedView && TAB_ORDER.includes(requestedView as WorkspaceTab)) {
			selectTab(requestedView as WorkspaceTab, false);
		}
		void hydrateProject();
	});
</script>

<svelte:head>
	<title>{project.name || 'Project'} · Workspace prototype | BuildOS</title>
	<meta
		name="description"
		content="A focused BuildOS project workspace for work, direction, documents, and activity."
	/>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<header class="border-b border-border bg-card tx tx-frame tx-weak">
		<div class="mx-auto max-w-7xl px-2 pt-3 sm:px-4 sm:pt-5 lg:px-6 lg:pt-6">
			<div class="flex items-center justify-between gap-3">
				<a
					href="/projects"
					class="inline-flex min-h-[44px] items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					<ArrowLeft class="h-4 w-4 shrink-0" />
					<span class="hidden sm:inline">All projects</span>
					<span class="sm:hidden">Projects</span>
				</a>

				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						icon={Network}
						class="hidden sm:inline-flex"
						onclick={() => (showGraphModal = true)}
					>
						Graph
					</Button>
					<Button
						variant="primary"
						size="sm"
						icon={Sparkles}
						onclick={() => (showAgentChatModal = true)}
					>
						<span class="hidden sm:inline">Ask BuildOS</span>
						<span class="sm:hidden">Ask</span>
					</Button>
				</div>
			</div>

			<div class="mt-3 grid gap-4 pb-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
				<div class="flex min-w-0 items-start gap-3 sm:gap-4">
					<ProjectIcon
						svg={project.icon_svg ?? null}
						concept={project.icon_concept ?? null}
						size="lg"
					/>
					<div class="min-w-0">
						<div class="flex min-w-0 flex-wrap items-center gap-2">
							<h1
								class="min-w-0 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl"
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
						{#if project.description}
							<p
								class="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base"
							>
								{project.description}
							</p>
						{:else}
							<p class="mt-1 text-sm text-muted-foreground">
								No project description yet.
							</p>
						{/if}
					</div>
				</div>

				<div class="rounded-lg border border-accent/25 bg-accent/5 p-3 shadow-ink-inner">
					<div class="flex items-center gap-2">
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10"
						>
							<ArrowRight class="h-4 w-4 text-accent" />
						</div>
						<div class="min-w-0">
							<p class="micro-label text-accent">NEXT MOVE</p>
							<p class="line-clamp-2 text-sm font-medium text-foreground">
								{project.next_step_short ||
									'Choose the next concrete move for this project.'}
							</p>
						</div>
					</div>
				</div>
			</div>

			<div
				class="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-background/70 sm:grid-cols-4"
				aria-label="Project summary"
			>
				<div class="border-b border-r border-border p-3 sm:border-b-0">
					<p class="micro-label">PROGRESS</p>
					<div class="mt-1 flex items-end justify-between gap-2">
						<p class="text-lg font-semibold tabular-nums">{taskSignals.completion}%</p>
						<p class="text-2xs text-muted-foreground">
							{taskSignals.done}/{taskSignals.total} tasks
						</p>
					</div>
					<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
							style:width={`${taskSignals.completion}%`}
						></div>
					</div>
				</div>
				<div class="border-b border-border p-3 sm:border-b-0 sm:border-r">
					<p class="micro-label">IN MOTION</p>
					<p class="mt-1 text-lg font-semibold tabular-nums">{taskSignals.inProgress}</p>
					<p class="text-2xs text-muted-foreground">tasks in progress</p>
				</div>
				<div class="border-r border-border p-3">
					<p class="micro-label">KNOWLEDGE</p>
					<p class="mt-1 text-lg font-semibold tabular-nums">
						{isHydrating ? initialCounts.document_count : documents.length}
					</p>
					<p class="text-2xs text-muted-foreground">project documents</p>
				</div>
				<div class="p-3">
					<p class="micro-label">WATCHLIST</p>
					<p
						class="mt-1 text-lg font-semibold tabular-nums {openRisks.length > 0
							? 'text-destructive'
							: 'text-foreground'}"
					>
						{isHydrating ? initialCounts.risk_count : openRisks.length}
					</p>
					<p class="text-2xs text-muted-foreground">open risks</p>
				</div>
			</div>

			<nav class="-mb-px mt-4 overflow-x-auto" aria-label="Project workspace views">
				<div class="flex min-w-max gap-1" role="tablist" aria-orientation="horizontal">
					<button
						bind:this={tabButtons[0]}
						type="button"
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

		<div class="mb-3">
			{#if isHydrating}
				<div
					class="h-[62px] animate-pulse rounded-lg border border-border bg-card shadow-ink motion-reduce:animate-none"
					aria-label="Loading project search"
				></div>
			{:else}
				<ProjectEntitySearchCombobox
					projectId={project.id}
					onSelectEntity={(type, id) => openEntity(type, id)}
				/>
			{/if}
		</div>

		{#if activeTab === 'work'}
			<div id="workspace-work" role="tabpanel" aria-label="Work" tabindex="0">
				<div class="mb-3 grid gap-2 sm:grid-cols-3">
					<article class="signal-card">
						<div class="signal-icon bg-info/10">
							<ListChecks class="h-4 w-4 text-info" />
						</div>
						<div class="min-w-0">
							<p class="micro-label">NOW</p>
							<p class="truncate text-sm font-semibold text-foreground">
								{taskSignals.inProgress > 0
									? `${taskSignals.inProgress} task${taskSignals.inProgress === 1 ? '' : 's'} moving`
									: 'Nothing marked in progress'}
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{project.next_step_short || 'Set a next move to create focus'}
							</p>
						</div>
					</article>
					<article
						class="signal-card {taskSignals.blocked + taskSignals.overdue > 0
							? 'border-destructive/30'
							: ''}"
					>
						<div class="signal-icon bg-destructive/10">
							<AlertTriangle class="h-4 w-4 text-destructive" />
						</div>
						<div class="min-w-0">
							<p class="micro-label">NEEDS ATTENTION</p>
							<p class="truncate text-sm font-semibold text-foreground">
								{taskSignals.blocked + taskSignals.overdue} blocked or overdue
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{primaryRisk?.title || 'No critical risk is surfaced'}
							</p>
						</div>
					</article>
					<article class="signal-card">
						<div class="signal-icon bg-accent/10">
							<Flag class="h-4 w-4 text-accent" />
						</div>
						<div class="min-w-0">
							<p class="micro-label">NEXT CHECKPOINT</p>
							<p class="truncate text-sm font-semibold text-foreground">
								{nextMilestone?.title || 'No milestone scheduled'}
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{nextMilestone?.due_at
									? `Due ${formatDate(nextMilestone.due_at)}`
									: 'Add a checkpoint from Overview'}
							</p>
						</div>
					</article>
				</div>

				{#if isHydrating}
					<div
						class="min-h-[430px] animate-pulse rounded-lg border border-border bg-card shadow-ink motion-reduce:animate-none"
						aria-label="Loading task board"
					></div>
				{:else}
					{#await import('$lib/components/project/v2/TaskKanbanBoard.svelte')}
						<div
							class="min-h-[430px] animate-pulse rounded-lg border border-border bg-card shadow-ink motion-reduce:animate-none"
							aria-label="Loading task board"
						></div>
					{:then { default: TaskKanbanBoard }}
						<TaskKanbanBoard
							projectId={project.id}
							{tasks}
							{tasksCoverage}
							{canEdit}
							onEditTask={(id) => (editingTaskId = id)}
							onCreateTask={() => (showTaskCreateModal = true)}
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
			<div id="workspace-overview" role="tabpanel" aria-label="Overview" tabindex="0">
				<div class="grid gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.8fr)]">
					<div class="space-y-3">
						<article class="workspace-card p-4 sm:p-5">
							<div class="flex items-center justify-between gap-3">
								<div>
									<p class="micro-label text-accent">PROJECT BRIEF</p>
									<h2 class="mt-1 text-lg font-semibold">
										What this project is doing
									</h2>
								</div>
								<BookOpen class="h-5 w-5 text-muted-foreground" />
							</div>
							<p
								class="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base"
							>
								{project.description ||
									'Add a concise description so collaborators can orient in seconds.'}
							</p>
							<div class="mt-4 grid gap-2 sm:grid-cols-3">
								<div class="brief-field">
									<p class="micro-label">STATUS</p>
									<p class="mt-1 text-sm font-semibold">{projectStatusLabel}</p>
								</div>
								<div class="brief-field">
									<p class="micro-label">START</p>
									<p class="mt-1 text-sm font-semibold">
										{formatDate(project.start_at, true)}
									</p>
								</div>
								<div class="brief-field">
									<p class="micro-label">TARGET</p>
									<p class="mt-1 text-sm font-semibold">
										{formatDate(project.end_at, true)}
									</p>
								</div>
							</div>
						</article>

						<article class="workspace-card overflow-hidden">
							<header
								class="flex items-center justify-between gap-3 border-b border-border px-4 py-3"
							>
								<div class="flex min-w-0 items-center gap-3">
									<div class="section-icon bg-warning/10">
										<Target class="h-4 w-4 text-warning" />
									</div>
									<div class="min-w-0">
										<h2 class="text-sm font-semibold">Direction</h2>
										<p class="text-xs text-muted-foreground">
											Goals, milestones, and the plans that connect them
										</p>
									</div>
								</div>
								<span class="text-2xs font-medium text-muted-foreground">
									{activeGoals.length} active
								</span>
							</header>
							<div
								class="grid gap-0 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0"
							>
								<div class="p-3 sm:p-4">
									<p class="micro-label mb-2">GOALS</p>
									<div class="space-y-2">
										{#each activeGoals.slice(0, 5) as goal (goal.id)}
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
											<div class="empty-compact">
												<Target class="h-5 w-5" />
												<p>No active goals yet</p>
											</div>
										{/each}
									</div>
								</div>
								<div class="p-3 sm:p-4">
									<p class="micro-label mb-2">PLANS</p>
									<div class="space-y-2">
										{#each activePlans.slice(0, 5) as plan (plan.id)}
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
											<div class="empty-compact">
												<Workflow class="h-5 w-5" />
												<p>No active plans yet</p>
											</div>
										{/each}
									</div>
								</div>
							</div>
						</article>

						{#if contextDocument}
							{#await import('$lib/components/project/ProjectMemoryCard.svelte') then { default: ProjectMemoryCard }}
								<ProjectMemoryCard
									document={contextDocument}
									nextStepShort={project.next_step_short ?? null}
									{canEdit}
									onOpenStartHere={(id) => openEntity('document', id)}
									onUpdateProject={() => (showAgentChatModal = true)}
								/>
							{/await}
						{/if}
					</div>

					<aside class="space-y-3">
						<article class="workspace-card overflow-hidden">
							<header
								class="flex items-center gap-3 border-b border-border px-4 py-3"
							>
								<div class="section-icon bg-accent/10">
									<Flag class="h-4 w-4 text-accent" />
								</div>
								<div>
									<h2 class="text-sm font-semibold">Milestones</h2>
									<p class="text-xs text-muted-foreground">
										Upcoming checkpoints
									</p>
								</div>
							</header>
							<div class="p-2">
								{#each upcomingMilestones.slice(0, 5) as milestone (milestone.id)}
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
									<div class="empty-compact m-2">
										<Flag class="h-5 w-5" />
										<p>No upcoming milestones</p>
									</div>
								{/each}
							</div>
						</article>

						<article class="workspace-card overflow-hidden">
							<header
								class="flex items-center gap-3 border-b border-border px-4 py-3"
							>
								<div class="section-icon bg-destructive/10">
									<AlertTriangle class="h-4 w-4 text-destructive" />
								</div>
								<div>
									<h2 class="text-sm font-semibold">Watchlist</h2>
									<p class="text-xs text-muted-foreground">Open project risks</p>
								</div>
							</header>
							<div class="p-2">
								{#each openRisks.slice(0, 5) as risk (risk.id)}
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
									<div class="empty-compact m-2">
										<CheckCircle2 class="h-5 w-5 text-success" />
										<p>No open risks</p>
									</div>
								{/each}
							</div>
						</article>

						<article class="workspace-card overflow-hidden">
							<header
								class="flex items-center gap-3 border-b border-border px-4 py-3"
							>
								<div class="section-icon bg-info/10">
									<CalendarClock class="h-4 w-4 text-info" />
								</div>
								<div>
									<h2 class="text-sm font-semibold">Coming up</h2>
									<p class="text-xs text-muted-foreground">Project calendar</p>
								</div>
							</header>
							<div class="p-2">
								{#each upcomingEvents.slice(0, 4) as event (event.id)}
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
									<div class="empty-compact m-2">
										<Calendar class="h-5 w-5" />
										<p>No upcoming events</p>
									</div>
								{/each}
							</div>
						</article>
					</aside>
				</div>
			</div>
		{:else if activeTab === 'docs'}
			<div id="workspace-docs" role="tabpanel" aria-label="Documents" tabindex="0">
				<div
					class="mb-3 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-ink sm:flex-row sm:items-center sm:justify-between"
				>
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
					{#if canEdit}
						<Button
							variant="primary"
							size="sm"
							icon={Plus}
							onclick={() => createDocument()}
						>
							New document
						</Button>
					{/if}
				</div>

				<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<div>
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
									{documentsExpanded}
									{activeDocumentId}
									onToggleExpanded={() =>
										(documentsExpanded = !documentsExpanded)}
									onCreateDocument={createDocument}
									onOpenDocument={(id) => openEntity('document', id)}
									onDataLoaded={handleDocTreeDataLoaded}
									initialStructure={docTreeStructure}
									initialDocuments={docTreeDocuments}
									initialUnlinked={docTreeUnlinked}
									initialArchived={docTreeArchived}
									pollInterval={30000}
								/>
							{/await}
						{/if}
					</div>

					<aside class="workspace-card h-fit overflow-hidden">
						<header class="border-b border-border px-4 py-3">
							<p class="micro-label">RECENTLY UPDATED</p>
						</header>
						<div class="p-2">
							{#each recentDocuments as document (document.id)}
								<button
									type="button"
									class="entity-row"
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
							{:else}
								<div class="empty-compact m-2">
									<FileText class="h-5 w-5" />
									<p>No documents yet</p>
								</div>
							{/each}
						</div>
					</aside>
				</div>
			</div>
		{:else}
			<div id="workspace-activity" role="tabpanel" aria-label="Activity" tabindex="0">
				<div class="mb-3 flex items-center gap-3">
					<div class="section-icon bg-success/10">
						<Activity class="h-4 w-4 text-success" />
					</div>
					<div>
						<h2 class="text-base font-semibold">Project pulse</h2>
						<p class="text-sm text-muted-foreground">
							What changed, what is due next, and where attention is moving.
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
			onCreated={() => {
				showTaskCreateModal = false;
				void refreshProject();
			}}
		/>
	{/await}
{/if}

{#if editingTaskId}
	{#await import('$lib/components/ontology/TaskEditModal.svelte') then { default: TaskEditModal }}
		<TaskEditModal
			taskId={editingTaskId}
			projectId={project.id}
			onClose={() => (editingTaskId = null)}
			onUpdated={() => {
				editingTaskId = null;
				void refreshProject();
			}}
			onDeleted={() => {
				editingTaskId = null;
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

	.signal-card {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.75rem;
		background: hsl(var(--card));
		padding: 0.75rem;
		box-shadow: var(--shadow-ink);
	}

	.signal-icon,
	.section-icon {
		display: flex;
		height: 2.25rem;
		width: 2.25rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
	}

	.workspace-card {
		border: 1px solid hsl(var(--border));
		border-radius: 0.75rem;
		background: hsl(var(--card));
		box-shadow: var(--shadow-ink);
	}

	.brief-field {
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--background) / 0.65);
		padding: 0.75rem;
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

	.empty-compact {
		display: flex;
		min-height: 5rem;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border: 1px dashed hsl(var(--border));
		border-radius: 0.5rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.workspace-tab,
		.entity-row {
			transition: none;
		}
	}
</style>
