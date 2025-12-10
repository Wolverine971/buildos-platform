<!-- apps/web/src/routes/projects/projects-v2/[id]/+page.svelte -->
<!--
	Ontology Project Detail Page V2 - Inkprint Design System

	Texture-based semantic design following Inkprint principles.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import { getMarkdownPreview } from '$lib/utils/markdown';
	import {
		Plus,
		Pencil,
		ChevronDown,
		Calendar,
		Target,
		FileText,
		RefreshCw,
		Trash2,
		Settings,
		ArrowLeft,
		CircleCheck,
		Circle,
		Clock
	} from 'lucide-svelte';
	import type {
		Project,
		Task,
		Output,
		Document,
		Plan,
		Template as OntoTemplate
	} from '$lib/types/onto';
	import type { PageData } from './$types';

	// ============================================================
	// TYPES
	// ============================================================
	interface Goal {
		id: string;
		name: string;
		type_key?: string | null;
		state_key: string;
		props?: {
			measurement_criteria?: string;
			priority?: 'low' | 'medium' | 'high' | 'urgent';
			[key: string]: unknown;
		};
	}

	interface Requirement {
		id?: string;
		text: string;
		project_id?: string;
		created_at?: string;
		props?: Record<string, unknown>;
	}

	interface Milestone {
		id: string;
		title: string;
		due_at: string;
		props?: {
			goal_id?: string;
			summary?: string;
			[key: string]: unknown;
		} | null;
	}

	interface Risk {
		id?: string;
		title: string;
		impact: string;
		project_id?: string;
		created_at?: string;
		props?: Record<string, unknown>;
	}

	// ============================================================
	// PROPS & DATA
	// ============================================================
	let { data }: { data: PageData } = $props();

	// Core data
	let project = $state(data.project as Project);
	let tasks = $state((data.tasks || []) as Task[]);
	let outputs = $state((data.outputs || []) as Output[]);
	let documents = $state((data.documents || []) as Document[]);
	let plans = $state((data.plans || []) as Plan[]);
	let goals = $state((data.goals || []) as Goal[]);
	let requirements = $state((data.requirements || []) as Requirement[]);
	let milestones = $state((data.milestones || []) as Milestone[]);
	let risks = $state((data.risks || []) as Risk[]);
	let template = $state((data.template || null) as OntoTemplate | null);
	let contextDocument = $state((data.context_document || null) as Document | null);

	// UI State
	let activeTab = $state('tasks');
	let showProjectEditModal = $state(false);
	let showDeleteProjectModal = $state(false);
	let isDeletingProject = $state(false);
	let deleteProjectError = $state<string | null>(null);
	let expandedTaskId = $state<string | null>(null);
	let expandedDocumentId = $state<string | null>(null);
	let expandedGoalId = $state<string | null>(null);
	let dataRefreshing = $state(false);
	let lastDataRefreshAt = $state<number>(Date.now());

	// Modal states
	let showTaskCreateModal = $state(false);
	let showOutputCreateModal = $state(false);
	let showPlanCreateModal = $state(false);
	let showGoalCreateModal = $state(false);
	let editingTaskId = $state<string | null>(null);
	let editingOutputId = $state<string | null>(null);
	let editingPlanId = $state<string | null>(null);
	let editingGoalId = $state<string | null>(null);
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);

	// ============================================================
	// DERIVED STATE
	// ============================================================
	const projectStats = $derived({
		tasks: tasks.length,
		goals: goals.length,
		plans: plans.length,
		outputs: outputs.length,
		documents: documents.length
	});

	const tabs = $derived([
		{ id: 'tasks', label: 'Tasks', count: tasks.length, icon: CircleCheck },
		{ id: 'outputs', label: 'Outputs', count: outputs.length, icon: FileText },
		{ id: 'documents', label: 'Documents', count: documents.length, icon: FileText },
		{ id: 'plans', label: 'Plans', count: plans.length, icon: Calendar },
		{ id: 'goals', label: 'Goals', count: goals.length, icon: Target },
		{
			id: 'other',
			label: 'Other',
			count: requirements.length + milestones.length + risks.length,
			icon: Settings
		}
	]);

	const lastDataRefreshLabel = $derived.by(() =>
		lastDataRefreshAt ? new Date(lastDataRefreshAt).toLocaleTimeString() : ''
	);

	// ============================================================
	// UTILITY FUNCTIONS
	// ============================================================
	function getTaskStateIcon(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') {
			return CircleCheck;
		} else if (normalized === 'in_progress' || normalized === 'active') {
			return Clock;
		} else if (normalized === 'blocked') {
			return Circle;
		}
		return Circle;
	}

	function getTaskStateBadgeClass(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') {
			return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
		} else if (normalized === 'in_progress' || normalized === 'active') {
			return 'bg-accent/10 text-accent border border-accent/20';
		}
		return 'bg-muted text-muted-foreground border border-border';
	}

	function formatDueDate(dateString: string) {
		const date = new Date(dateString);
		if (Number.isNaN(date.getTime())) {
			return 'No due date';
		}
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getDocumentPreview(doc: Document): string {
		const props = (doc.props ?? {}) as Record<string, unknown>;
		const candidateKeys = [
			'body_markdown',
			'body',
			'content',
			'summary_markdown',
			'description'
		];

		for (const key of candidateKeys) {
			const value = props[key];
			if (typeof value === 'string' && value.trim().length > 0) {
				return getMarkdownPreview(value, 160);
			}
		}
		return '';
	}

	function toggleTaskExpansion(taskId: string) {
		expandedTaskId = expandedTaskId === taskId ? null : taskId;
	}

	function toggleDocumentExpansion(documentId: string) {
		expandedDocumentId = expandedDocumentId === documentId ? null : documentId;
	}

	function toggleGoalExpansion(goalId: string) {
		expandedGoalId = expandedGoalId === goalId ? null : goalId;
	}

	// ============================================================
	// DATA MANAGEMENT
	// ============================================================
	async function refreshProjectData() {
		if (!project?.id) return;

		dataRefreshing = true;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`);
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error ?? 'Failed to refresh project data');
			}

			// Update all data from the response
			const newData = payload?.data || {};
			project = newData.project || project;
			tasks = newData.tasks || [];
			outputs = newData.outputs || [];
			documents = newData.documents || [];
			plans = newData.plans || [];
			goals = newData.goals || [];
			requirements = newData.requirements || [];
			milestones = newData.milestones || [];
			risks = newData.risks || [];
			template = newData.template || null;
			contextDocument = newData.context_document || null;

			lastDataRefreshAt = Date.now();
		} catch (error) {
			console.error('[Project] Failed to refresh', error);
			toastService.error(
				error instanceof Error ? error.message : 'Failed to refresh project data'
			);
		} finally {
			dataRefreshing = false;
		}
	}

	// ============================================================
	// EVENT HANDLERS
	// ============================================================
	function handleTabChange(tabId: string) {
		activeTab = tabId;
	}

	async function handleProjectStateChange(data: {
		state: string;
		actions: string[];
		event: string;
	}) {
		// Update local project state
		project = { ...project, state_key: data.state };
		// Refresh all project data in case actions modified related entities
		await refreshProjectData();
		toastService.success(`Project transitioned to "${data.state}"`);
	}

	async function handleProjectDeleteConfirm() {
		if (!project?.id) return;

		isDeletingProject = true;
		deleteProjectError = null;

		try {
			const response = await fetch(`/api/onto/projects/${project.id}`, {
				method: 'DELETE'
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to delete project');
			}

			toastService.success('Project deleted');
			showDeleteProjectModal = false;
			goto('/projects');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete project';
			deleteProjectError = message;
			toastService.error(message);
		} finally {
			isDeletingProject = false;
		}
	}

	function openDocumentModal(documentId: string | null = null) {
		activeDocumentId = documentId;
		showDocumentModal = true;
	}

	async function handleTaskCreated(taskId: string) {
		await refreshProjectData();
		editingTaskId = taskId;
	}

	async function handleTaskUpdated() {
		await refreshProjectData();
	}

	async function handleTaskDeleted() {
		await refreshProjectData();
	}

	async function handleOutputCreated(outputId: string) {
		await refreshProjectData();
		editingOutputId = outputId;
	}

	async function handlePlanCreated() {
		await refreshProjectData();
		showPlanCreateModal = false;
	}

	async function handleGoalCreated() {
		await refreshProjectData();
		showGoalCreateModal = false;
	}

	async function handleDocumentSaved() {
		await refreshProjectData();
		showDocumentModal = false;
	}

	// ============================================================
	// LIFECYCLE
	// ============================================================
	$effect(() => {
		// Update data when props change
		project = data.project as Project;
		tasks = (data.tasks || []) as Task[];
		outputs = (data.outputs || []) as Output[];
		documents = (data.documents || []) as Document[];
		plans = (data.plans || []) as Plan[];
		goals = (data.goals || []) as Goal[];
		requirements = (data.requirements || []) as Requirement[];
		milestones = (data.milestones || []) as Milestone[];
		risks = (data.risks || []) as Risk[];
		template = (data.template || null) as OntoTemplate | null;
		contextDocument = (data.context_document || null) as Document | null;
		lastDataRefreshAt = Date.now();
	});
</script>

<svelte:head>
	<title>{project.name} | BuildOS Workspace</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Header Bar - Inkprint Frame texture -->
	<header class="border-b border-border bg-card tx tx-frame tx-weak">
		<div class="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
			<!-- Row 1: Back + Title + Actions -->
			<div class="flex items-center gap-2 sm:gap-3">
				<!-- Back Navigation -->
				<button
					onclick={() => goto('/projects')}
					class="flex-shrink-0 p-1.5 -ml-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors pressable"
					title="Back to projects"
				>
					<ArrowLeft class="w-4 h-4" strokeWidth={2.5} />
				</button>

				<!-- Project Title -->
				<h1
					class="flex-1 min-w-0 text-sm sm:text-base lg:text-lg font-semibold text-foreground truncate"
				>
					{project.name}
				</h1>

				<!-- Project Actions -->
				<div class="flex-shrink-0 flex items-center gap-0.5">
					<button
						onclick={() => (showProjectEditModal = true)}
						class="p-1.5 sm:p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors pressable"
						title="Edit project"
					>
						<Pencil class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
					</button>
					<button
						onclick={() => (showDeleteProjectModal = true)}
						class="p-1.5 sm:p-2 rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors pressable"
						title="Delete project"
					>
						<Trash2 class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
					</button>
				</div>
			</div>

			<!-- Row 2: FSM State Bar -->
			<div class="mt-2">
				{#await import('$lib/components/ontology/FSMStateBar.svelte') then { default: FSMStateBar }}
					<FSMStateBar
						entityId={project.id}
						entityKind="project"
						currentState={project.state_key}
						entityName={project.name}
						onstatechange={handleProjectStateChange}
					/>
				{/await}
			</div>
		</div>
	</header>

	<!-- Tab Navigation -->
	<nav class="sticky top-0 z-10 border-b border-border bg-card shadow-ink">
		<div class="max-w-7xl mx-auto px-1.5 sm:px-6 lg:px-8">
			<div class="flex items-center gap-0 h-10 sm:h-11 overflow-x-auto scrollbar-none">
				{#each tabs as tab}
					{@const Icon = tab.icon}
					<button
						onclick={() => handleTabChange(tab.id)}
						class="flex items-center gap-1 sm:gap-1.5 whitespace-nowrap text-[11px] sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 font-medium transition-colors pressable {activeTab ===
						tab.id
							? 'text-accent border-b-2 border-accent'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						<Icon class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" strokeWidth={2.5} />
						<span>{tab.label}</span>
						{#if tab.count > 0}
							<span
								class="px-1.5 py-0.5 text-[9px] sm:text-xs font-bold rounded-lg min-w-[14px] text-center {activeTab ===
								tab.id
									? 'bg-accent text-accent-foreground'
									: 'bg-muted text-muted-foreground'}"
							>
								{tab.count}
							</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</nav>

	<!-- Main Content Area -->
	<main class="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-3 sm:py-6">
		<!-- Sync Status Bar -->
		<div
			class="mb-3 sm:mb-6 flex items-center justify-between text-[10px] sm:text-xs px-1 sm:px-0"
		>
			<div class="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
				{#if dataRefreshing}
					<RefreshCw class="w-3 h-3 animate-spin text-accent" />
					<span class="hidden sm:inline">Syncing workspace data…</span>
					<span class="sm:hidden">Syncing…</span>
				{:else}
					<Clock class="w-3 h-3" />
					<span class="hidden sm:inline"
						>Last synced {lastDataRefreshLabel || 'just now'}</span
					>
					<span class="sm:hidden">{lastDataRefreshLabel || 'Now'}</span>
				{/if}
			</div>
			<button
				onclick={() => refreshProjectData()}
				disabled={dataRefreshing}
				class="text-accent hover:text-accent/80 font-semibold tracking-wide pressable"
			>
				<RefreshCw class="w-3.5 h-3.5 sm:hidden" />
				<span class="hidden sm:inline">{dataRefreshing ? 'REFRESHING…' : 'REFRESH'}</span>
			</button>
		</div>

		<!-- Tab Content -->
		<div
			class="bg-card border border-border rounded-lg p-3 sm:p-6 shadow-ink tx tx-frame tx-weak"
		>
			{#if activeTab === 'tasks'}
				<div class="space-y-3 sm:space-y-6">
					<!-- Section Header -->
					<div
						class="flex items-center justify-between pb-2 sm:pb-4 border-b border-border"
					>
						<div class="min-w-0">
							<h2 class="text-base sm:text-xl font-bold text-foreground truncate">
								Tasks
							</h2>
							<p class="hidden sm:block mt-1 text-sm text-muted-foreground">
								Transform ideas into actionable items
							</p>
						</div>
						<button
							onclick={() => (showTaskCreateModal = true)}
							class="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-xs sm:text-sm tracking-wide flex items-center gap-1.5 sm:gap-2 flex-shrink-0 shadow-ink pressable"
						>
							<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
							<span class="hidden sm:inline">NEW TASK</span>
							<span class="sm:hidden">ADD</span>
						</button>
					</div>

					<!-- Tasks List -->
					{#if tasks.length === 0}
						<div
							class="rounded-lg border-2 border-dashed border-border p-6 sm:p-12 text-center tx tx-bloom tx-weak"
						>
							<div class="max-w-md mx-auto space-y-3 sm:space-y-4">
								<CircleCheck
									class="w-10 h-10 sm:w-16 sm:h-16 text-muted-foreground mx-auto opacity-50"
								/>
								<p class="text-sm sm:text-base text-muted-foreground font-medium">
									No tasks yet
								</p>
								<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
									Start building by creating your first task.
								</p>
								<button
									onclick={() => (showTaskCreateModal = true)}
									class="px-4 sm:px-6 py-2 sm:py-3 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm tracking-wide inline-flex items-center gap-2 shadow-ink pressable"
								>
									<Plus class="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
									<span>CREATE TASK</span>
								</button>
							</div>
						</div>
					{:else}
						<div class="space-y-2 sm:space-y-3">
							{#each tasks as task}
								{@const StateIcon = getTaskStateIcon(task.state_key)}
								<button
									onclick={() => (editingTaskId = task.id)}
									class="w-full bg-card border border-border rounded-lg p-2.5 sm:p-4 flex items-start gap-2.5 sm:gap-4 text-left hover:border-accent/50 transition-all duration-200 shadow-ink group tx tx-grain tx-weak"
								>
									<!-- Task State Icon -->
									<div class="flex-shrink-0 mt-0.5">
										<StateIcon
											class="w-4 h-4 sm:w-5 sm:h-5 {task.state_key ===
												'done' || task.state_key === 'completed'
												? 'text-emerald-500'
												: task.state_key === 'in_progress'
													? 'text-accent'
													: 'text-muted-foreground'} group-hover:opacity-80 transition-opacity"
											strokeWidth={2}
										/>
									</div>

									<!-- Task Content -->
									<div class="flex-1 min-w-0">
										<h3
											class="text-sm sm:text-base font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1"
										>
											{task.title}
										</h3>
										{#if task.props?.description}
											<p
												class="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2"
											>
												{task.props.description}
											</p>
										{/if}
										<div
											class="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs"
										>
											<span
												class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg font-semibold {getTaskStateBadgeClass(
													task.state_key
												)}"
											>
												{task.state_key.toUpperCase()}
											</span>
											{#if task.priority}
												<span
													class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-muted text-muted-foreground font-semibold border border-border"
												>
													P{task.priority}
												</span>
											{/if}
											{#if task.plan_id}
												{@const plan = plans.find(
													(p) => p.id === task.plan_id
												)}
												{#if plan}
													<span
														class="text-muted-foreground hidden sm:inline"
													>
														Plan: {plan.name}
													</span>
												{/if}
											{/if}
										</div>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'outputs'}
				<div class="space-y-3 sm:space-y-6">
					<!-- Section Header -->
					<div
						class="flex items-center justify-between pb-2 sm:pb-4 border-b border-border"
					>
						<div class="min-w-0">
							<h2 class="text-base sm:text-xl font-bold text-foreground truncate">
								Outputs
							</h2>
							<p class="hidden sm:block mt-1 text-sm text-muted-foreground">
								Structured deliverables and artifacts
							</p>
						</div>
						<button
							onclick={() => (showOutputCreateModal = true)}
							class="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-xs sm:text-sm tracking-wide flex items-center gap-1.5 sm:gap-2 flex-shrink-0 shadow-ink pressable"
						>
							<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
							<span class="hidden sm:inline">NEW OUTPUT</span>
							<span class="sm:hidden">ADD</span>
						</button>
					</div>

					<!-- Outputs Grid -->
					{#if outputs.length === 0}
						<div
							class="rounded-lg border-2 border-dashed border-border p-6 sm:p-12 text-center tx tx-bloom tx-weak"
						>
							<div class="max-w-md mx-auto space-y-3 sm:space-y-4">
								<FileText
									class="w-10 h-10 sm:w-16 sm:h-16 text-muted-foreground mx-auto opacity-50"
								/>
								<p class="text-sm sm:text-base text-muted-foreground font-medium">
									No outputs yet
								</p>
								<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
									Output documents are the tangible deliverables of your work.
								</p>
								<button
									onclick={() => (showOutputCreateModal = true)}
									class="px-4 sm:px-6 py-2 sm:py-3 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm tracking-wide inline-flex items-center gap-2 shadow-ink pressable"
								>
									<Plus class="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
									<span>CREATE OUTPUT</span>
								</button>
							</div>
						</div>
					{:else}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
							{#each outputs as output}
								<button
									onclick={() => (editingOutputId = output.id)}
									class="bg-card border border-border rounded-lg p-2.5 sm:p-4 text-left hover:border-accent/50 transition-all duration-200 shadow-ink group"
								>
									<div class="flex items-start justify-between gap-2 sm:gap-3">
										<div class="flex-1 min-w-0">
											<h3
												class="text-sm sm:text-base font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1"
											>
												{output.name}
											</h3>
											{#if output.props?.word_count}
												<p
													class="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground"
												>
													{output.props.word_count} words
												</p>
											{/if}
										</div>
										<span
											class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold flex-shrink-0 {output.state_key ===
											'published'
												? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
												: output.state_key === 'draft'
													? 'bg-muted text-muted-foreground border border-border'
													: 'bg-accent/10 text-accent border border-accent/20'}"
										>
											{output.state_key.toUpperCase()}
										</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'documents'}
				<div class="space-y-3 sm:space-y-6">
					<!-- Section Header -->
					<div
						class="flex items-center justify-between pb-2 sm:pb-4 border-b border-border"
					>
						<div class="min-w-0">
							<h2 class="text-base sm:text-xl font-bold text-foreground truncate">
								Documents
							</h2>
							<p class="hidden sm:block mt-1 text-sm text-muted-foreground">
								Knowledge base and reference materials
							</p>
						</div>
						<button
							onclick={() => openDocumentModal(null)}
							class="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-xs sm:text-sm tracking-wide flex items-center gap-1.5 sm:gap-2 flex-shrink-0 shadow-ink pressable"
						>
							<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
							<span class="hidden sm:inline">NEW DOC</span>
							<span class="sm:hidden">ADD</span>
						</button>
					</div>

					<!-- Documents List -->
					{#if documents.length === 0}
						<div
							class="rounded-lg border-2 border-dashed border-border p-6 sm:p-12 text-center tx tx-bloom tx-weak"
						>
							<div class="max-w-md mx-auto space-y-3 sm:space-y-4">
								<FileText
									class="w-10 h-10 sm:w-16 sm:h-16 text-muted-foreground mx-auto opacity-50"
								/>
								<p class="text-sm sm:text-base text-muted-foreground font-medium">
									No documents yet
								</p>
								<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
									Documents capture important context and decisions.
								</p>
								<button
									onclick={() => openDocumentModal(null)}
									class="px-4 sm:px-6 py-2 sm:py-3 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm tracking-wide inline-flex items-center gap-2 shadow-ink pressable"
								>
									<Plus class="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
									<span>CREATE DOC</span>
								</button>
							</div>
						</div>
					{:else}
						<div class="space-y-2 sm:space-y-3">
							{#each documents as doc}
								{@const isExpanded = expandedDocumentId === doc.id}
								{@const preview = getDocumentPreview(doc)}
								<div
									class="bg-card border border-border rounded-lg overflow-hidden shadow-ink"
								>
									<button
										onclick={() => toggleDocumentExpansion(doc.id)}
										class="w-full p-2.5 sm:p-4 flex items-start gap-2.5 sm:gap-4 text-left hover:bg-muted/50 transition-colors"
									>
										<div class="flex-shrink-0 hidden sm:block">
											<div
												class="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"
											>
												<FileText class="w-5 h-5 text-muted-foreground" />
											</div>
										</div>
										<div class="flex-1 min-w-0">
											<h3
												class="text-sm sm:text-base font-semibold text-foreground line-clamp-1"
											>
												{doc.title ?? 'Untitled document'}
											</h3>
											{#if preview}
												<p
													class="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2"
												>
													{preview}
												</p>
											{/if}
											<div
												class="mt-1.5 sm:mt-2 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs"
											>
												{#if doc.type_key}
													<span
														class="px-1.5 sm:px-2 py-0.5 rounded-lg bg-accent/10 text-accent font-semibold border border-accent/20"
													>
														{doc.type_key.toUpperCase()}
													</span>
												{/if}
												{#if doc.updated_at}
													<span
														class="text-muted-foreground hidden sm:inline"
													>
														Updated {new Date(
															doc.updated_at
														).toLocaleDateString()}
													</span>
												{/if}
											</div>
										</div>
										<ChevronDown
											class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground transition-transform flex-shrink-0 {isExpanded
												? 'rotate-180'
												: ''}"
										/>
									</button>

									{#if isExpanded}
										<div class="border-t border-border p-3 sm:p-4 bg-muted/30">
											<div
												class="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm"
											>
												{#if preview}
													<p>{preview}</p>
												{:else}
													<p class="italic text-muted-foreground">
														No content available
													</p>
												{/if}
											</div>
											<div class="mt-3 sm:mt-4 flex items-center justify-end">
												<button
													onclick={(e) => {
														e.stopPropagation();
														openDocumentModal(doc.id);
													}}
													class="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-card font-semibold text-[10px] sm:text-xs tracking-wide transition-colors shadow-ink pressable"
												>
													<Pencil
														class="w-3 h-3 sm:w-3.5 sm:h-3.5 inline mr-1"
													/>
													EDIT
												</button>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'plans'}
				<div class="space-y-3 sm:space-y-6">
					<!-- Section Header -->
					<div
						class="flex items-center justify-between pb-2 sm:pb-4 border-b border-border"
					>
						<div class="min-w-0">
							<h2 class="text-base sm:text-xl font-bold text-foreground truncate">
								Plans
							</h2>
							<p class="hidden sm:block mt-1 text-sm text-muted-foreground">
								Structured roadmaps and timelines
							</p>
						</div>
						<button
							onclick={() => (showPlanCreateModal = true)}
							class="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-xs sm:text-sm tracking-wide flex items-center gap-1.5 sm:gap-2 flex-shrink-0 shadow-ink pressable"
						>
							<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
							<span class="hidden sm:inline">NEW PLAN</span>
							<span class="sm:hidden">ADD</span>
						</button>
					</div>

					<!-- Plans Grid -->
					{#if plans.length === 0}
						<div
							class="rounded-lg border-2 border-dashed border-border p-6 sm:p-12 text-center tx tx-bloom tx-weak"
						>
							<div class="max-w-md mx-auto space-y-3 sm:space-y-4">
								<Calendar
									class="w-10 h-10 sm:w-16 sm:h-16 text-muted-foreground mx-auto opacity-50"
								/>
								<p class="text-sm sm:text-base text-muted-foreground font-medium">
									No plans yet
								</p>
								<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
									Plans organize tasks into phases and timelines.
								</p>
								<button
									onclick={() => (showPlanCreateModal = true)}
									class="px-4 sm:px-6 py-2 sm:py-3 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm tracking-wide inline-flex items-center gap-2 shadow-ink pressable"
								>
									<Plus class="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
									<span>CREATE PLAN</span>
								</button>
							</div>
						</div>
					{:else}
						<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
							{#each plans as plan}
								<button
									onclick={() => (editingPlanId = plan.id)}
									class="bg-card border border-border rounded-lg p-2.5 sm:p-4 text-left hover:border-accent/50 transition-all duration-200 shadow-ink group"
								>
									<div class="flex items-start gap-2 sm:gap-3">
										<Calendar
											class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground mt-0.5 flex-shrink-0"
										/>
										<div class="flex-1 min-w-0">
											<h3
												class="text-sm sm:text-base font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-1"
											>
												{plan.name}
											</h3>
											{#if plan.props?.start_date || plan.props?.end_date}
												<p
													class="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground"
												>
													{#if plan.props?.start_date && typeof plan.props.start_date === 'string'}
														{new Date(
															plan.props.start_date
														).toLocaleDateString()}
													{/if}
													{#if plan.props?.start_date && plan.props?.end_date}
														-
													{/if}
													{#if plan.props?.end_date && typeof plan.props.end_date === 'string'}
														{new Date(
															plan.props.end_date
														).toLocaleDateString()}
													{/if}
												</p>
											{/if}
										</div>
										<span
											class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold flex-shrink-0 {plan.state_key ===
											'active'
												? 'bg-accent/10 text-accent border border-accent/20'
												: plan.state_key === 'completed'
													? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
													: 'bg-muted text-muted-foreground border border-border'}"
										>
											{plan.state_key.toUpperCase()}
										</span>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'goals'}
				<div class="space-y-3 sm:space-y-6">
					<!-- Section Header -->
					<div
						class="flex items-center justify-between pb-2 sm:pb-4 border-b border-border"
					>
						<div class="min-w-0">
							<h2 class="text-base sm:text-xl font-bold text-foreground truncate">
								Goals
							</h2>
							<p class="hidden sm:block mt-1 text-sm text-muted-foreground">
								High-level objectives and success criteria
							</p>
						</div>
						<button
							onclick={() => (showGoalCreateModal = true)}
							class="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-xs sm:text-sm tracking-wide flex items-center gap-1.5 sm:gap-2 flex-shrink-0 shadow-ink pressable"
						>
							<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={2.5} />
							<span class="hidden sm:inline">NEW GOAL</span>
							<span class="sm:hidden">ADD</span>
						</button>
					</div>

					<!-- Goals List -->
					{#if goals.length === 0}
						<div
							class="rounded-lg border-2 border-dashed border-border p-6 sm:p-12 text-center tx tx-bloom tx-weak"
						>
							<div class="max-w-md mx-auto space-y-3 sm:space-y-4">
								<Target
									class="w-10 h-10 sm:w-16 sm:h-16 text-muted-foreground mx-auto opacity-50"
								/>
								<p class="text-sm sm:text-base text-muted-foreground font-medium">
									No goals yet
								</p>
								<p class="text-xs sm:text-sm text-muted-foreground hidden sm:block">
									Goals define what success looks like for this project.
								</p>
								<button
									onclick={() => (showGoalCreateModal = true)}
									class="px-4 sm:px-6 py-2 sm:py-3 rounded-lg bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-sm tracking-wide inline-flex items-center gap-2 shadow-ink pressable"
								>
									<Plus class="w-4 h-4 sm:w-5 sm:h-5" strokeWidth={2.5} />
									<span>CREATE GOAL</span>
								</button>
							</div>
						</div>
					{:else}
						<div class="space-y-2 sm:space-y-3">
							{#each goals as goal}
								{@const isExpanded = expandedGoalId === goal.id}
								<div
									class="bg-card border border-border rounded-lg overflow-hidden shadow-ink"
								>
									<div class="p-2.5 sm:p-4">
										<div class="flex items-start gap-2.5 sm:gap-4">
											<Target
												class="w-4 h-4 sm:w-5 sm:h-5 text-accent mt-0.5 flex-shrink-0"
											/>
											<div class="flex-1 min-w-0">
												<div
													class="flex items-start justify-between gap-2 sm:gap-3"
												>
													<div class="flex-1 min-w-0">
														<h3
															class="text-sm sm:text-base font-semibold text-foreground line-clamp-1"
														>
															{goal.name}
														</h3>
														{#if goal.props?.measurement_criteria}
															<p
																class="mt-0.5 sm:mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-1 sm:line-clamp-2"
															>
																{goal.props.measurement_criteria}
															</p>
														{/if}
														<div
															class="mt-1.5 sm:mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2"
														>
															<span
																class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold {goal.state_key ===
																'achieved'
																	? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
																	: goal.state_key === 'active'
																		? 'bg-accent/10 text-accent border border-accent/20'
																		: 'bg-muted text-muted-foreground border border-border'}"
															>
																{goal.state_key.toUpperCase()}
															</span>
															{#if goal.props?.priority}
																<span
																	class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-muted text-muted-foreground text-[10px] sm:text-xs font-semibold hidden sm:inline border border-border"
																>
																	{goal.props.priority.toUpperCase()}
																</span>
															{/if}
														</div>
													</div>
													<div
														class="flex items-center gap-0.5 sm:gap-2 flex-shrink-0"
													>
														<button
															onclick={() =>
																(editingGoalId = goal.id)}
															class="p-1.5 sm:p-2 rounded-lg hover:bg-muted transition-colors pressable"
														>
															<Pencil
																class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground"
															/>
														</button>
														<button
															onclick={() =>
																toggleGoalExpansion(goal.id)}
															class="p-1.5 sm:p-2 rounded-lg hover:bg-muted transition-colors pressable"
														>
															<ChevronDown
																class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground transition-transform {isExpanded
																	? 'rotate-180'
																	: ''}"
															/>
														</button>
													</div>
												</div>
											</div>
										</div>

										{#if isExpanded}
											<div
												class="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border space-y-3 sm:space-y-4"
											>
												<div
													class="text-xs sm:text-sm text-muted-foreground"
												>
													<p>
														Goal details and milestones would appear
														here
													</p>
												</div>
											</div>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'other'}
				<div class="space-y-4 sm:space-y-8">
					{#if requirements.length > 0}
						<div class="space-y-2 sm:space-y-4">
							<h3 class="text-sm sm:text-lg font-semibold text-foreground">
								Requirements ({requirements.length})
							</h3>
							<div class="space-y-1.5 sm:space-y-2">
								{#each requirements as req}
									<div
										class="p-2.5 sm:p-4 rounded-lg bg-muted border border-border text-xs sm:text-sm text-foreground"
									>
										{req.text}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if milestones.length > 0}
						<div class="space-y-2 sm:space-y-4">
							<h3 class="text-sm sm:text-lg font-semibold text-foreground">
								Milestones ({milestones.length})
							</h3>
							<div class="space-y-1.5 sm:space-y-2">
								{#each milestones as milestone}
									<div
										class="p-2.5 sm:p-4 rounded-lg bg-muted border border-border flex items-center justify-between gap-2"
									>
										<span
											class="text-xs sm:text-sm text-foreground line-clamp-1"
											>{milestone.title}</span
										>
										<span
											class="text-[10px] sm:text-sm text-muted-foreground flex-shrink-0"
										>
											{formatDueDate(milestone.due_at)}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if risks.length > 0}
						<div class="space-y-2 sm:space-y-4">
							<h3 class="text-sm sm:text-lg font-semibold text-foreground">
								Risks ({risks.length})
							</h3>
							<div class="space-y-1.5 sm:space-y-2">
								{#each risks as risk}
									<div
										class="p-2.5 sm:p-4 rounded-lg bg-muted border border-border tx tx-static tx-weak"
									>
										<div class="flex items-center justify-between gap-2">
											<span
												class="text-xs sm:text-sm font-medium text-foreground line-clamp-1"
											>
												{risk.title}
											</span>
											<span
												class="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] sm:text-xs font-semibold flex-shrink-0 border border-red-500/20"
											>
												{risk.impact.toUpperCase()}
											</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if requirements.length === 0 && milestones.length === 0 && risks.length === 0}
						<div
							class="rounded-lg border-2 border-dashed border-border p-12 text-center"
						>
							<p class="text-muted-foreground">No additional project entities yet</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</main>
</div>

<!-- Modals -->
{#await import('$lib/components/ui/ConfirmationModal.svelte') then { default: ConfirmationModal }}
	{#if showDeleteProjectModal}
		<ConfirmationModal
			isOpen={showDeleteProjectModal}
			title="Delete project"
			confirmText="Delete"
			confirmVariant="danger"
			loading={isDeletingProject}
			loadingText="Deleting..."
			icon="danger"
			on:confirm={handleProjectDeleteConfirm}
			on:cancel={() => (showDeleteProjectModal = false)}
		>
			{#snippet content()}
				<p class="text-sm text-muted-foreground">
					This will permanently delete <span class="font-semibold text-foreground"
						>{project.name}</span
					> and all related data. This action cannot be undone.
				</p>
			{/snippet}
			{#snippet details()}
				{#if deleteProjectError}
					<p class="mt-2 text-sm text-red-600 dark:text-red-400">
						{deleteProjectError}
					</p>
				{/if}
			{/snippet}
		</ConfirmationModal>
	{/if}
{/await}

{#await import('$lib/components/ontology/OntologyProjectEditModal.svelte') then { default: OntologyProjectEditModal }}
	{#if showProjectEditModal}
		<OntologyProjectEditModal
			bind:isOpen={showProjectEditModal}
			{project}
			{contextDocument}
			{template}
			onClose={() => (showProjectEditModal = false)}
			onSaved={async () => {
				await refreshProjectData();
				showProjectEditModal = false;
			}}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/TaskCreateModal.svelte') then { default: TaskCreateModal }}
	{#if showTaskCreateModal}
		<TaskCreateModal
			projectId={project.id}
			{plans}
			{goals}
			{milestones}
			onClose={() => (showTaskCreateModal = false)}
			onCreated={handleTaskCreated}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/TaskEditModal.svelte') then { default: TaskEditModal }}
	{#if editingTaskId}
		<TaskEditModal
			taskId={editingTaskId}
			projectId={project.id}
			{plans}
			{goals}
			{milestones}
			onClose={() => (editingTaskId = null)}
			onUpdated={handleTaskUpdated}
			onDeleted={handleTaskDeleted}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/OutputCreateModal.svelte') then { default: OutputCreateModal }}
	{#if showOutputCreateModal}
		<OutputCreateModal
			projectId={project.id}
			onClose={() => (showOutputCreateModal = false)}
			onCreated={handleOutputCreated}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/OutputEditModal.svelte') then { default: OutputEditModal }}
	{#if editingOutputId}
		<OutputEditModal
			isOpen={true}
			outputId={editingOutputId}
			projectId={project.id}
			onClose={() => (editingOutputId = null)}
			onUpdated={refreshProjectData}
			onDeleted={async () => {
				await refreshProjectData();
				editingOutputId = null;
			}}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/PlanCreateModal.svelte') then { default: PlanCreateModal }}
	{#if showPlanCreateModal}
		<PlanCreateModal
			projectId={project.id}
			onClose={() => (showPlanCreateModal = false)}
			onCreated={handlePlanCreated}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/PlanEditModal.svelte') then { default: PlanEditModal }}
	{#if editingPlanId}
		<PlanEditModal
			planId={editingPlanId}
			projectId={project.id}
			onClose={() => (editingPlanId = null)}
			onUpdated={refreshProjectData}
			onDeleted={async () => {
				await refreshProjectData();
				editingPlanId = null;
			}}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/GoalCreateModal.svelte') then { default: GoalCreateModal }}
	{#if showGoalCreateModal}
		<GoalCreateModal
			projectId={project.id}
			onClose={() => (showGoalCreateModal = false)}
			onCreated={handleGoalCreated}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/GoalEditModal.svelte') then { default: GoalEditModal }}
	{#if editingGoalId}
		<GoalEditModal
			goalId={editingGoalId}
			projectId={project.id}
			onClose={() => (editingGoalId = null)}
			onUpdated={refreshProjectData}
			onDeleted={async () => {
				await refreshProjectData();
				editingGoalId = null;
			}}
		/>
	{/if}
{/await}

{#await import('$lib/components/ontology/DocumentModal.svelte') then { default: DocumentModal }}
	{#if showDocumentModal}
		<DocumentModal
			bind:isOpen={showDocumentModal}
			projectId={project.id}
			documentId={activeDocumentId}
			onClose={() => (showDocumentModal = false)}
			onSaved={handleDocumentSaved}
			onDeleted={async () => {
				await refreshProjectData();
				showDocumentModal = false;
			}}
		/>
	{/if}
{/await}
