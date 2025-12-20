<!-- apps/web/src/routes/projects/[id]/tasks/[task_id]/+page.svelte -->
<!--
	Task Focus Page - Focused Task Work Area

	A dedicated full-page experience for working on a single task:
	- Task header with title, state, and quick actions
	- Main content area with Details and Workspace tabs
	- Project context sidebar with goals, plans, documents, and other tasks
	- Linked entities panel for relationships

	Documentation:
	- Ontology System: /apps/web/docs/features/ontology/README.md
	- Inkprint Design: /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
	- Task Modal: /apps/web/src/lib/components/ontology/TaskEditModal.svelte
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { toastService } from '$lib/stores/toast.store';
	import {
		ArrowLeft,
		Save,
		Loader,
		Trash2,
		FileText,
		Target,
		Calendar,
		ListChecks,
		Flag,
		ChevronDown,
		ChevronRight,
		Plus,
		Clock,
		CheckCircle2,
		Circle,
		AlertTriangle,
		Layers,
		ExternalLink,
		CircleCheck,
		Sparkles,
		RefreshCw
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import LinkedEntities from '$lib/components/ontology/linked-entities/LinkedEntities.svelte';
	import StateDisplay from '$lib/components/ontology/StateDisplay.svelte';
	import { TASK_STATES } from '$lib/types/onto';
	import type { EntityKind } from '$lib/components/ontology/linked-entities/linked-entities.types';
	import { format } from 'date-fns';
	import {
		fetchTaskDocuments,
		promoteTaskDocument,
		type TaskWorkspaceDocument
	} from '$lib/services/ontology/task-document.service';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type { Component } from 'svelte';

	// ============================================================
	// PROPS & DATA
	// ============================================================
	let { data }: { data: PageData } = $props();

	// Core data from server
	let project = $state(data.project);
	let task = $state(data.task);
	let plans = $state(data.plans || []);
	let goals = $state(data.goals || []);
	let documents = $state(data.documents || []);
	let milestones = $state(data.milestones || []);
	let outputs = $state(data.outputs || []);
	let projectTasks = $state(data.tasks || []);
	let risks = $state(data.risks || []);

	// Form fields
	let title = $state('');
	let description = $state('');
	let priority = $state<number>(3);
	let planId = $state('');
	let goalId = $state('');
	let milestoneId = $state('');
	let stateKey = $state('todo');
	let dueAt = $state('');

	// UI state
	let isLoading = $state(false);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);
	let dataRefreshing = $state(false);

	// View state
	const VIEW_STORAGE_KEY = 'task_focus_view';
	let hasLoadedViewPreference = $state(false);
	let activeView = $state<'details' | 'workspace'>('details');

	// Workspace state
	let workspaceDocuments = $state<TaskWorkspaceDocument[]>([]);
	let workspaceLoading = $state(false);
	let workspaceError = $state('');
	let workspaceInitialized = $state(false);
	let selectedWorkspaceDocId = $state<string | null>(null);
	let workspaceDocContent = $state('');
	let workspaceDocSaving = $state(false);

	// Sidebar panels state
	let expandedPanels = $state<Record<string, boolean>>({
		goals: true,
		plans: false,
		documents: false,
		milestones: false,
		tasks: false,
		outputs: false,
		connectedDocs: false,
		linkedEntities: false
	});

	// Modal states for editing other entities
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let showGoalModal = $state(false);
	let selectedGoalId = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanId = $state<string | null>(null);
	let showTaskModal = $state(false);
	let selectedTaskId = $state<string | null>(null);
	let showOutputModal = $state(false);
	let selectedOutputId = $state<string | null>(null);
	let showMilestoneModal = $state(false);
	let selectedMilestoneId = $state<string | null>(null);
	let showChatModal = $state(false);

	// Lazy-loaded modal components
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let DocumentModalComponent = $state<Component<any, any> | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let GoalEditModalComponent = $state<Component<any, any> | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let PlanEditModalComponent = $state<Component<any, any> | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let TaskEditModalComponent = $state<Component<any, any> | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let OutputEditModalComponent = $state<Component<any, any> | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let MilestoneEditModalComponent = $state<Component<any, any> | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let AgentChatModalComponent = $state<Component<any, any> | null>(null);

	// ============================================================
	// DERIVED STATE
	// ============================================================

	const deliverableDocuments = $derived.by(() =>
		workspaceDocuments.filter((item) => item.edge?.props?.role !== 'scratch')
	);

	const selectedWorkspaceDoc = $derived.by(() => {
		if (!selectedWorkspaceDocId) return null;
		return workspaceDocuments.find((doc) => doc.document.id === selectedWorkspaceDocId);
	});

	const otherTasks = $derived.by(() =>
		projectTasks.filter((t: any) => t.id !== task?.id).slice(0, 10)
	);

	// Task visuals based on current state (used in header)
	const taskVisuals = $derived(getTaskVisuals(stateKey));

	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!task || !project?.id) return null;
		return {
			focusType: 'task',
			focusEntityId: task.id,
			focusEntityName: task.title || 'Untitled Task',
			projectId: project.id,
			projectName: project.name || 'Project'
		};
	});

	// ============================================================
	// INITIALIZATION
	// ============================================================

	// Initialize form fields from task data
	$effect(() => {
		if (task) {
			title = task.title || '';
			description = task.props?.description || '';
			priority = task.priority || 3;
			planId = task.plan?.id || '';
			goalId = extractGoalIdFromProps(task.props);
			milestoneId = extractMilestoneIdFromProps(task.props);
			stateKey = task.state_key || 'todo';
			dueAt = task.due_at ? formatDateTimeForInput(task.due_at) : '';
		}
	});

	// Load view preference from localStorage
	$effect(() => {
		if (!browser) return;
		if (hasLoadedViewPreference) return;
		const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
		if (stored === 'workspace' || stored === 'details') {
			activeView = stored;
		}
		hasLoadedViewPreference = true;
	});

	// Load workspace documents when switching to workspace tab
	$effect(() => {
		if (!browser) return;
		if (activeView === 'workspace' && !workspaceInitialized && task) {
			loadWorkspaceDocuments();
		}
	});

	// ============================================================
	// UTILITY FUNCTIONS
	// ============================================================

	function extractGoalIdFromProps(props: Record<string, unknown> | null | undefined): string {
		if (!props || typeof props !== 'object') return '';
		const goalIdProp = props.goal_id;
		if (typeof goalIdProp === 'string' && goalIdProp.trim().length > 0) {
			return goalIdProp;
		}
		const sourceGoalId = props.source_goal_id;
		if (typeof sourceGoalId === 'string' && sourceGoalId.trim().length > 0) {
			return sourceGoalId;
		}
		return '';
	}

	function extractMilestoneIdFromProps(
		props: Record<string, unknown> | null | undefined
	): string {
		if (!props || typeof props !== 'object') return '';
		const milestoneIdProp = props.supporting_milestone_id;
		return typeof milestoneIdProp === 'string' && milestoneIdProp.trim().length > 0
			? milestoneIdProp
			: '';
	}

	function formatDateTimeForInput(date: Date | string | null): string {
		if (!date) return '';
		try {
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			if (isNaN(dateObj.getTime())) return '';
			return format(dateObj, "yyyy-MM-dd'T'HH:mm");
		} catch {
			return '';
		}
	}

	function parseDateTimeFromInput(value: string): string | null {
		if (!value) return null;
		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;
			return date.toISOString();
		} catch {
			return null;
		}
	}

	function getTaskVisuals(state: string) {
		const normalized = state?.toLowerCase() || '';
		if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') {
			return { icon: CheckCircle2, color: 'text-emerald-500' };
		}
		if (normalized === 'in_progress' || normalized === 'active') {
			return { icon: Clock, color: 'text-accent' };
		}
		if (normalized === 'blocked') {
			return { icon: AlertTriangle, color: 'text-red-500' };
		}
		return { icon: Circle, color: 'text-muted-foreground' };
	}

	function formatDueDate(dateString?: string | null) {
		if (!dateString) return 'No due date';
		const parsed = new Date(dateString);
		if (Number.isNaN(parsed.getTime())) return 'No due date';
		return parsed.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function togglePanel(key: string) {
		expandedPanels = { ...expandedPanels, [key]: !expandedPanels[key] };
	}

	// ============================================================
	// VIEW & TAB MANAGEMENT
	// ============================================================

	function setActiveView(view: 'details' | 'workspace', documentId?: string) {
		activeView = view;
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(VIEW_STORAGE_KEY, view);
		}

		if (view === 'workspace') {
			if (!workspaceInitialized) {
				loadWorkspaceDocuments();
			}
			if (documentId) {
				selectWorkspaceDocument(documentId);
			}
		}
	}

	// ============================================================
	// WORKSPACE DOCUMENT MANAGEMENT
	// ============================================================

	function selectWorkspaceDocument(documentId: string) {
		selectedWorkspaceDocId = documentId;
		const doc = workspaceDocuments.find((d) => d.document.id === documentId);
		if (doc) {
			workspaceDocContent = (doc.document?.props?.body_markdown as string) ?? '';
		}
	}

	async function loadWorkspaceDocuments() {
		if (!task?.id) return;
		try {
			workspaceLoading = true;
			workspaceError = '';
			const result = await fetchTaskDocuments(task.id);
			workspaceDocuments = result.documents ?? [];

			if (!selectedWorkspaceDocId && deliverableDocuments.length > 0) {
				selectWorkspaceDocument(deliverableDocuments[0].document.id);
			}

			workspaceInitialized = true;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load documents';
			workspaceError = message;
			toastService.error(message);
		} finally {
			workspaceLoading = false;
		}
	}

	async function saveWorkspaceDocument() {
		if (!selectedWorkspaceDocId) return;

		try {
			workspaceDocSaving = true;

			const response = await fetch(`/api/onto/documents/${selectedWorkspaceDocId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body_markdown: workspaceDocContent })
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to save document');
			}

			workspaceDocuments = workspaceDocuments.map((item) =>
				item.document.id === selectedWorkspaceDocId
					? {
							...item,
							document: {
								...item.document,
								props: {
									...(item.document?.props ?? {}),
									body_markdown: workspaceDocContent
								},
								updated_at: new Date().toISOString()
							}
						}
					: item
			);

			toastService.success('Document saved');
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to save document';
			toastService.error(message);
			throw err;
		} finally {
			workspaceDocSaving = false;
		}
	}

	async function handlePromoteWorkspaceDocument(documentId: string) {
		try {
			await promoteTaskDocument(task.id, documentId, { target_state: 'ready' });
			toastService.success('Document promoted to project');
			await loadWorkspaceDocuments();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to promote document';
			toastService.error(message);
		}
	}

	// ============================================================
	// TASK CRUD OPERATIONS
	// ============================================================

	async function handleSave() {
		if (!title.trim()) {
			error = 'Task title is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				title: title.trim(),
				description: description.trim() || null,
				priority: Number(priority),
				plan_id: planId || null,
				state_key: stateKey,
				due_at: parseDateTimeFromInput(dueAt),
				goal_id: goalId?.trim() || null,
				supporting_milestone_id: milestoneId?.trim() || null
			};

			const response = await fetch(`/api/onto/tasks/${task.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to update task');
			}

			toastService.success('Task updated');
			await refreshData();
		} catch (err) {
			console.error('Error updating task:', err);
			error = err instanceof Error ? err.message : 'Failed to update task';
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/tasks/${task.id}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete task');
			}

			toastService.success('Task deleted');
			goto(`/projects/${project.id}`);
		} catch (err) {
			console.error('Error deleting task:', err);
			error = err instanceof Error ? err.message : 'Failed to delete task';
			isDeleting = false;
			showDeleteConfirm = false;
		}
	}

	async function refreshData() {
		if (!project?.id || !task?.id) return;
		dataRefreshing = true;

		try {
			const [projectResponse, taskResponse] = await Promise.all([
				fetch(`/api/onto/projects/${project.id}`),
				fetch(`/api/onto/tasks/${task.id}/full`)
			]);

			if (projectResponse.ok && taskResponse.ok) {
				const [projectData, taskData] = await Promise.all([
					projectResponse.json(),
					taskResponse.json()
				]);

				project = projectData.data?.project || project;
				task = taskData.data?.task || task;
				plans = projectData.data?.plans || [];
				goals = projectData.data?.goals || [];
				documents = projectData.data?.documents || [];
				milestones = projectData.data?.milestones || [];
				outputs = projectData.data?.outputs || [];
				projectTasks = projectData.data?.tasks || [];
				risks = projectData.data?.risks || [];
			}
		} catch (err) {
			console.error('Failed to refresh data:', err);
			toastService.error('Failed to refresh data');
		} finally {
			dataRefreshing = false;
		}
	}

	// ============================================================
	// MODAL MANAGEMENT
	// ============================================================

	async function loadDocumentModal() {
		if (!DocumentModalComponent) {
			const mod = await import('$lib/components/ontology/DocumentModal.svelte');
			DocumentModalComponent = mod.default;
		}
	}

	async function loadGoalEditModal() {
		if (!GoalEditModalComponent) {
			const mod = await import('$lib/components/ontology/GoalEditModal.svelte');
			GoalEditModalComponent = mod.default;
		}
	}

	async function loadPlanEditModal() {
		if (!PlanEditModalComponent) {
			const mod = await import('$lib/components/ontology/PlanEditModal.svelte');
			PlanEditModalComponent = mod.default;
		}
	}

	async function loadTaskEditModal() {
		if (!TaskEditModalComponent) {
			const mod = await import('$lib/components/ontology/TaskEditModal.svelte');
			TaskEditModalComponent = mod.default;
		}
	}

	async function loadOutputEditModal() {
		if (!OutputEditModalComponent) {
			const mod = await import('$lib/components/ontology/OutputEditModal.svelte');
			OutputEditModalComponent = mod.default;
		}
	}

	async function loadMilestoneEditModal() {
		if (!MilestoneEditModalComponent) {
			const mod = await import('$lib/components/ontology/MilestoneEditModal.svelte');
			MilestoneEditModalComponent = mod.default;
		}
	}

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default;
		}
	}

	async function openDocumentModal(id: string | null = null) {
		await loadDocumentModal();
		activeDocumentId = id;
		showDocumentModal = true;
	}

	async function openGoalModal(id: string) {
		await loadGoalEditModal();
		selectedGoalId = id;
		showGoalModal = true;
	}

	async function openPlanModal(id: string) {
		await loadPlanEditModal();
		selectedPlanId = id;
		showPlanModal = true;
	}

	async function openTaskModal(id: string) {
		await loadTaskEditModal();
		selectedTaskId = id;
		showTaskModal = true;
	}

	async function openOutputModal(id: string) {
		await loadOutputEditModal();
		selectedOutputId = id;
		showOutputModal = true;
	}

	async function openMilestoneModal(id: string) {
		await loadMilestoneEditModal();
		selectedMilestoneId = id;
		showMilestoneModal = true;
	}

	async function openChatModal() {
		if (!task || !project?.id) return;
		await loadAgentChatModal();
		showChatModal = true;
	}

	function handleModalClose() {
		showDocumentModal = false;
		showGoalModal = false;
		showPlanModal = false;
		showTaskModal = false;
		showOutputModal = false;
		showMilestoneModal = false;
		activeDocumentId = null;
		selectedGoalId = null;
		selectedPlanId = null;
		selectedTaskId = null;
		selectedOutputId = null;
		selectedMilestoneId = null;
		refreshData();
	}

	function handleLinkedEntityClick(kind: EntityKind, id: string) {
		switch (kind) {
			case 'goal':
				openGoalModal(id);
				break;
			case 'plan':
				openPlanModal(id);
				break;
			case 'document':
				openDocumentModal(id);
				break;
			case 'task':
				openTaskModal(id);
				break;
			case 'output':
				openOutputModal(id);
				break;
			case 'milestone':
				openMilestoneModal(id);
				break;
			default:
				console.log(`No modal handler for entity kind: ${kind}`);
		}
	}

	function handleDocumentClick(documentId: string) {
		setActiveView('workspace', documentId);
	}
</script>

<svelte:head>
	<title>{task?.title || 'Task'} | {project?.name || 'Project'} | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<!-- Sticky Header -->
	<header
		class="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
	>
		<div class="mx-auto max-w-screen-2xl px-3 sm:px-4 lg:px-6">
			<!-- Breadcrumb Row -->
			<div class="flex items-center justify-between h-12 border-b border-border/50">
				<div class="flex items-center gap-2 min-w-0">
					<button
						onclick={() => goto(`/projects/${project?.id}`)}
						class="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
						aria-label="Back to project"
					>
						<ArrowLeft class="w-4 h-4 text-muted-foreground" />
					</button>
					<nav class="flex items-center gap-1.5 text-sm min-w-0">
						<a
							href="/projects"
							class="text-muted-foreground hover:text-foreground transition-colors shrink-0"
						>
							Projects
						</a>
						<ChevronRight class="w-3 h-3 text-muted-foreground shrink-0" />
						<a
							href="/projects/{project?.id}"
							class="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[150px] sm:max-w-[200px]"
						>
							{project?.name || 'Project'}
						</a>
						<ChevronRight class="w-3 h-3 text-muted-foreground shrink-0" />
						<span
							class="text-foreground font-medium truncate max-w-[150px] sm:max-w-[250px]"
						>
							{title || 'Task'}
						</span>
					</nav>
				</div>

				<div class="flex items-center gap-1.5 shrink-0">
					<!-- Chat button -->
					<button
						onclick={openChatModal}
						class="p-2 rounded-lg hover:bg-muted transition-colors"
						aria-label="Chat about this task"
						title="Chat about this task"
					>
						<img
							src="/brain-bolt.png"
							alt="Chat"
							class="w-5 h-5 rounded object-cover"
						/>
					</button>
					<!-- Refresh button -->
					<button
						onclick={refreshData}
						disabled={dataRefreshing}
						class="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
						aria-label="Refresh data"
					>
						<RefreshCw
							class="w-4 h-4 text-muted-foreground {dataRefreshing
								? 'animate-spin'
								: ''}"
						/>
					</button>
				</div>
			</div>

			<!-- Task Header Row -->
			<div class="py-3 sm:py-4">
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-3 mb-2">
							<div
								class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"
							>
								<svelte:component
									this={taskVisuals.icon}
									class="w-5 h-5 {taskVisuals.color}"
								/>
							</div>
							<div class="min-w-0">
								<h1
									class="text-xl sm:text-2xl font-bold text-foreground leading-tight truncate"
								>
									{title || 'Untitled Task'}
								</h1>
								<div class="flex items-center gap-2 mt-1">
									<StateDisplay state={stateKey} entityKind="task" />
									{#if task?.due_at}
										<span class="text-xs text-muted-foreground">
											Due {formatDueDate(task.due_at)}
										</span>
									{/if}
								</div>
							</div>
						</div>
					</div>

					<!-- Desktop Save/Delete Actions -->
					<div class="hidden sm:flex items-center gap-2 shrink-0">
						<Button
							variant="ghost"
							size="sm"
							onclick={() => (showDeleteConfirm = true)}
							disabled={isDeleting || isSaving}
							class="text-red-500 hover:text-red-600 hover:bg-red-500/10"
						>
							<Trash2 class="w-4 h-4" />
						</Button>
						<Button
							variant="primary"
							size="sm"
							onclick={handleSave}
							loading={isSaving}
							disabled={isSaving || isDeleting || !title.trim()}
						>
							<Save class="w-4 h-4" />
							Save
						</Button>
					</div>
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
		<div
			class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px] gap-4 lg:gap-6"
		>
			<!-- Left Column: Task Details & Workspace -->
			<div class="min-w-0 space-y-4">
				<!-- Tab Navigation -->
				<div
					class="inline-flex rounded-lg border border-border bg-muted/50 p-1 text-sm font-bold shadow-ink"
					role="tablist"
					aria-label="Task views"
				>
					<button
						type="button"
						role="tab"
						aria-selected={activeView === 'details'}
						aria-controls="details-panel"
						class="relative rounded px-4 py-2 transition pressable {activeView ===
						'details'
							? 'bg-accent text-accent-foreground shadow-ink'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
						onclick={() => setActiveView('details')}
					>
						Details
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeView === 'workspace'}
						aria-controls="workspace-panel"
						class="relative rounded px-4 py-2 transition pressable {activeView ===
						'workspace'
							? 'bg-accent text-accent-foreground shadow-ink'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
						onclick={() => setActiveView('workspace')}
					>
						Workspace
						{#if deliverableDocuments.length > 0}
							<Badge variant="info" size="sm" class="ml-2"
								>{deliverableDocuments.length}</Badge
							>
						{/if}
					</button>
				</div>

				<!-- Tab Content -->
				{#if activeView === 'details'}
					<!-- DETAILS TAB -->
					<Card variant="elevated" class="overflow-hidden">
						<CardBody padding="lg">
							<form class="space-y-6" onsubmit={handleSave}>
								<!-- Task Title -->
								<FormField
									label="Task Title"
									labelFor="title"
									required={true}
									error={!title.trim() && error ? 'Task title is required' : ''}
								>
									<TextInput
										id="title"
										bind:value={title}
										inputmode="text"
										enterkeyhint="next"
										placeholder="What needs to be done?"
										required={true}
										disabled={isSaving}
										error={!title.trim() && error ? true : false}
										size="lg"
										class="text-lg font-medium"
									/>
								</FormField>

								<!-- Description -->
								<FormField
									label="Description"
									labelFor="description"
									hint="Provide additional context about this task"
								>
									<Textarea
										id="description"
										bind:value={description}
										enterkeyhint="next"
										placeholder="Describe what needs to be accomplished..."
										rows={4}
										disabled={isSaving}
										size="md"
									/>
								</FormField>

								<!-- Grid: Priority, State, Due Date -->
								<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
									<FormField label="Priority" labelFor="priority" required={true}>
										<Select
											id="priority"
											value={priority}
											disabled={isSaving}
											size="md"
											placeholder="Select priority"
											onchange={(val) => (priority = Number(val))}
										>
											<option value={1}>P1 - Critical</option>
											<option value={2}>P2 - High</option>
											<option value={3}>P3 - Medium</option>
											<option value={4}>P4 - Low</option>
											<option value={5}>P5 - Nice to have</option>
										</Select>
									</FormField>

									<FormField label="State" labelFor="state" required={true}>
										<Select
											id="state"
											bind:value={stateKey}
											disabled={isSaving}
											size="md"
											placeholder="Select state"
										>
											{#each TASK_STATES as state}
												<option value={state}>
													{state === 'todo'
														? 'To Do'
														: state === 'in_progress'
															? 'In Progress'
															: state === 'blocked'
																? 'Blocked'
																: state === 'done'
																	? 'Done'
																	: state}
												</option>
											{/each}
										</Select>
									</FormField>

									<FormField label="Due Date" labelFor="due-date">
										<TextInput
											id="due-date"
											type="datetime-local"
											inputmode="numeric"
											enterkeyhint="done"
											bind:value={dueAt}
											disabled={isSaving}
											size="md"
										/>
									</FormField>
								</div>

								<!-- Grid: Plan, Goal, Milestone -->
								<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
									{#if plans.length > 0}
										<FormField
											label="Plan"
											labelFor="plan"
											hint="Link to a plan"
										>
											<Select
												id="plan"
												bind:value={planId}
												disabled={isSaving}
												size="md"
												placeholder="No plan"
											>
												<option value="">No plan</option>
												{#each plans as plan}
													<option value={plan.id}>{plan.name}</option>
												{/each}
											</Select>
										</FormField>
									{/if}

									{#if goals.length > 0}
										<FormField
											label="Goal"
											labelFor="goal"
											hint="Link to a goal"
										>
											<Select
												id="goal"
												bind:value={goalId}
												disabled={isSaving}
												size="md"
												placeholder="No goal"
											>
												<option value="">No goal</option>
												{#each goals as goal}
													<option value={goal.id}>{goal.name}</option>
												{/each}
											</Select>
										</FormField>
									{/if}

									{#if milestones.length > 0}
										<FormField
											label="Milestone"
											labelFor="milestone"
											hint="Link to a milestone"
										>
											<Select
												id="milestone"
												bind:value={milestoneId}
												disabled={isSaving}
												size="md"
												placeholder="No milestone"
											>
												<option value="">No milestone</option>
												{#each milestones as milestone}
													<option value={milestone.id}>
														{milestone.title}
														{#if milestone.due_at}
															({new Date(
																milestone.due_at
															).toLocaleDateString()})
														{/if}
													</option>
												{/each}
											</Select>
										</FormField>
									{/if}
								</div>

								{#if error}
									<div
										class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
									>
										<p class="text-sm text-destructive">{error}</p>
									</div>
								{/if}
							</form>
						</CardBody>
					</Card>

					<!-- Compact secondary sections in a 2-column grid -->
					<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
						<!-- Connected Documents - Compact -->
						<Card variant="elevated" class="overflow-hidden">
							<button
								onclick={() => togglePanel('connectedDocs')}
								class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
							>
								<div class="flex items-center gap-2">
									<FileText class="w-4 h-4 text-blue-500" />
									<span class="text-sm font-semibold text-foreground"
										>Documents</span
									>
									{#if deliverableDocuments.length > 0}
										<Badge variant="info" size="sm"
											>{deliverableDocuments.length}</Badge
										>
									{/if}
								</div>
								<div class="flex items-center gap-1">
									<span
										role="button"
										tabindex="0"
										onclick={(e) => {
											e.stopPropagation();
											openDocumentModal(null);
										}}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												e.stopPropagation();
												openDocumentModal(null);
											}
										}}
										class="p-1 rounded hover:bg-muted transition-colors cursor-pointer"
										title="Add document"
									>
										<Plus class="w-3.5 h-3.5 text-muted-foreground" />
									</span>
									<ChevronDown
										class="w-4 h-4 text-muted-foreground transition-transform {expandedPanels.connectedDocs
											? 'rotate-180'
											: ''}"
									/>
								</div>
							</button>
							{#if expandedPanels.connectedDocs}
								<div class="border-t border-border max-h-40 overflow-y-auto">
									{#if deliverableDocuments.length > 0}
										<ul class="divide-y divide-border/80">
											{#each deliverableDocuments as doc}
												<li>
													<button
														type="button"
														onclick={() =>
															handleDocumentClick(doc.document.id)}
														class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
													>
														<FileText
															class="w-3.5 h-3.5 text-blue-500 shrink-0"
														/>
														<span
															class="text-xs text-foreground truncate flex-1"
														>
															{doc.document.title || 'Untitled'}
														</span>
														<span
															class="text-[10px] text-muted-foreground"
														>
															{doc.document.state_key || 'draft'}
														</span>
													</button>
												</li>
											{/each}
										</ul>
									{:else}
										<div class="px-3 py-4 text-center">
											<p class="text-xs text-muted-foreground mb-2">
												No documents yet
											</p>
											<Button
												variant="secondary"
												size="sm"
												onclick={() => setActiveView('workspace')}
											>
												Open Workspace
											</Button>
										</div>
									{/if}
								</div>
							{/if}
						</Card>

						<!-- Linked Entities - Compact -->
						<Card variant="elevated" class="overflow-hidden">
							<button
								onclick={() => togglePanel('linkedEntities')}
								class="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
							>
								<div class="flex items-center gap-2">
									<Layers class="w-4 h-4 text-purple-500" />
									<span class="text-sm font-semibold text-foreground"
										>Linked Entities</span
									>
								</div>
								<ChevronDown
									class="w-4 h-4 text-muted-foreground transition-transform {expandedPanels.linkedEntities
										? 'rotate-180'
										: ''}"
								/>
							</button>
							{#if expandedPanels.linkedEntities}
								<div class="border-t border-border p-2 max-h-48 overflow-y-auto">
									<LinkedEntities
										sourceId={task?.id}
										sourceKind="task"
										projectId={project?.id}
										onEntityClick={handleLinkedEntityClick}
										onLinksChanged={refreshData}
									/>
								</div>
							{/if}
						</Card>
					</div>
				{:else}
					<!-- WORKSPACE TAB -->
					<div class="space-y-4">
						<!-- Document Selector -->
						<Card variant="elevated">
							<CardBody padding="md">
								<div
									class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4"
								>
									<div class="flex items-center gap-3 flex-1 min-w-0">
										<FileText
											class="w-5 h-5 text-accent shrink-0 hidden sm:block"
										/>
										<div class="flex-1 min-w-0">
											<label for="workspace-doc-selector" class="sr-only">
												Select document
											</label>
											<Select
												id="workspace-doc-selector"
												value={selectedWorkspaceDocId || ''}
												onchange={(val) =>
													selectWorkspaceDocument(String(val))}
												size="md"
											>
												{#if deliverableDocuments.length === 0}
													<option value="">No documents yet</option>
												{:else}
													{#each deliverableDocuments as doc}
														<option value={doc.document.id}>
															{doc.document.title || 'Untitled'} ({doc
																.document.state_key})
														</option>
													{/each}
												{/if}
											</Select>
										</div>
									</div>
									<Button
										size="sm"
										variant="secondary"
										onclick={() => openDocumentModal(null)}
										class="w-full sm:w-auto"
									>
										<Plus class="w-4 h-4" />
										New Document
									</Button>
								</div>
							</CardBody>
						</Card>

						<!-- Editor -->
						{#if selectedWorkspaceDoc}
							<Card variant="elevated">
								<CardBody padding="md">
									<RichMarkdownEditor
										bind:value={workspaceDocContent}
										rows={24}
										maxLength={50000}
										size="base"
										label="Document Content"
										helpText="Full markdown support with live preview"
									/>
								</CardBody>
								<div
									class="flex items-center justify-between gap-4 px-4 py-3 border-t border-border bg-muted/30"
								>
									{#if !selectedWorkspaceDoc.edge?.props?.handed_off}
										<Button
											variant="secondary"
											size="sm"
											onclick={() =>
												handlePromoteWorkspaceDocument(
													selectedWorkspaceDocId!
												)}
										>
											<CircleCheck class="w-4 h-4" />
											Promote to Project
										</Button>
									{:else}
										<span class="text-xs text-muted-foreground"
											>Already promoted</span
										>
									{/if}
									<Button
										variant="primary"
										size="sm"
										onclick={saveWorkspaceDocument}
										loading={workspaceDocSaving}
										disabled={workspaceDocSaving || !selectedWorkspaceDocId}
									>
										<Save class="w-4 h-4" />
										Save Document
									</Button>
								</div>
							</Card>
						{:else if workspaceLoading}
							<Card variant="elevated">
								<CardBody padding="lg">
									<div class="flex items-center justify-center py-12">
										<Loader
											class="w-8 h-8 animate-spin text-muted-foreground"
										/>
									</div>
								</CardBody>
							</Card>
						{:else}
							<Card variant="outline" class="border-dashed">
								<CardBody padding="lg">
									<div class="text-center py-8">
										<FileText
											class="w-12 h-12 text-muted-foreground mx-auto mb-4"
										/>
										<p class="text-muted-foreground mb-4">
											No document selected. Create one to get started.
										</p>
										<Button
											variant="primary"
											size="sm"
											onclick={() => openDocumentModal(null)}
										>
											Create Document
										</Button>
									</div>
								</CardBody>
							</Card>
						{/if}
					</div>
				{/if}

				<!-- Mobile Save/Delete Actions -->
				<div
					class="sm:hidden flex items-center justify-between gap-3 p-4 bg-card border border-border rounded-xl shadow-ink"
				>
					<Button
						variant="danger"
						size="sm"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting || isSaving}
					>
						<Trash2 class="w-4 h-4" />
						Delete
					</Button>
					<Button
						variant="primary"
						size="sm"
						onclick={handleSave}
						loading={isSaving}
						disabled={isSaving || isDeleting || !title.trim()}
					>
						<Save class="w-4 h-4" />
						Save Task
					</Button>
				</div>
			</div>

			<!-- Right Column: Project Context Sidebar -->
			<aside
				class="min-w-0 space-y-3 lg:sticky lg:top-36 lg:max-h-[calc(100vh-160px)] lg:overflow-y-auto"
			>
				<!-- Goals Panel -->
				{#if goals.length > 0}
					<Card variant="elevated" class="overflow-hidden">
						<button
							onclick={() => togglePanel('goals')}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"
								>
									<Target class="w-4 h-4 text-amber-500" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Goals</p>
									<p class="text-xs text-muted-foreground">
										{goals.length} defined
									</p>
								</div>
							</div>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform {expandedPanels.goals
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.goals}
							<div class="border-t border-border">
								<ul class="divide-y divide-border/80">
									{#each goals as goal}
										<li>
											<button
												type="button"
												onclick={() => openGoalModal(goal.id)}
												class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
											>
												<Target class="w-4 h-4 text-amber-500 shrink-0" />
												<span class="text-sm text-foreground truncate"
													>{goal.name}</span
												>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</Card>
				{/if}

				<!-- Plans Panel -->
				{#if plans.length > 0}
					<Card variant="elevated" class="overflow-hidden">
						<button
							onclick={() => togglePanel('plans')}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"
								>
									<Calendar class="w-4 h-4 text-blue-500" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Plans</p>
									<p class="text-xs text-muted-foreground">
										{plans.length} active
									</p>
								</div>
							</div>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform {expandedPanels.plans
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.plans}
							<div class="border-t border-border">
								<ul class="divide-y divide-border/80">
									{#each plans as plan}
										<li>
											<button
												type="button"
												onclick={() => openPlanModal(plan.id)}
												class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
											>
												<Calendar class="w-4 h-4 text-blue-500 shrink-0" />
												<span class="text-sm text-foreground truncate"
													>{plan.name}</span
												>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</Card>
				{/if}

				<!-- Documents Panel -->
				{#if documents.length > 0}
					<Card variant="elevated" class="overflow-hidden">
						<button
							onclick={() => togglePanel('documents')}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center"
								>
									<FileText class="w-4 h-4 text-purple-500" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">
										Project Documents
									</p>
									<p class="text-xs text-muted-foreground">
										{documents.length} available
									</p>
								</div>
							</div>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform {expandedPanels.documents
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.documents}
							<div class="border-t border-border">
								<ul class="divide-y divide-border/80 max-h-48 overflow-y-auto">
									{#each documents.slice(0, 10) as doc}
										<li>
											<button
												type="button"
												onclick={() => openDocumentModal(doc.id)}
												class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
											>
												<FileText
													class="w-4 h-4 text-purple-500 shrink-0"
												/>
												<span class="text-sm text-foreground truncate"
													>{doc.title}</span
												>
											</button>
										</li>
									{/each}
								</ul>
								{#if documents.length > 10}
									<div
										class="px-4 py-2 text-xs text-muted-foreground border-t border-border"
									>
										+{documents.length - 10} more documents
									</div>
								{/if}
							</div>
						{/if}
					</Card>
				{/if}

				<!-- Milestones Panel -->
				{#if milestones.length > 0}
					<Card variant="elevated" class="overflow-hidden">
						<button
							onclick={() => togglePanel('milestones')}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"
								>
									<Flag class="w-4 h-4 text-emerald-500" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Milestones</p>
									<p class="text-xs text-muted-foreground">
										{milestones.length} checkpoints
									</p>
								</div>
							</div>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform {expandedPanels.milestones
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.milestones}
							<div class="border-t border-border">
								<ul class="divide-y divide-border/80">
									{#each milestones as milestone}
										<li>
											<button
												type="button"
												onclick={() => openMilestoneModal(milestone.id)}
												class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
											>
												<Flag class="w-4 h-4 text-emerald-500 shrink-0" />
												<div class="min-w-0 flex-1">
													<p class="text-sm text-foreground truncate">
														{milestone.title}
													</p>
													{#if milestone.due_at}
														<p class="text-xs text-muted-foreground">
															{formatDueDate(milestone.due_at)}
														</p>
													{/if}
												</div>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</Card>
				{/if}

				<!-- Other Tasks Panel -->
				{#if otherTasks.length > 0}
					<Card variant="elevated" class="overflow-hidden">
						<button
							onclick={() => togglePanel('tasks')}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center"
								>
									<ListChecks class="w-4 h-4 text-accent" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Other Tasks</p>
									<p class="text-xs text-muted-foreground">
										{otherTasks.length} in project
									</p>
								</div>
							</div>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform {expandedPanels.tasks
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.tasks}
							<div class="border-t border-border">
								<ul class="divide-y divide-border/80 max-h-48 overflow-y-auto">
									{#each otherTasks as otherTask}
										{@const visuals = getTaskVisuals(otherTask.state_key)}
										<li>
											<a
												href="/projects/{project?.id}/tasks/{otherTask.id}"
												class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
											>
												<svelte:component
													this={visuals.icon}
													class="w-4 h-4 {visuals.color} shrink-0"
												/>
												<span class="text-sm text-foreground truncate"
													>{otherTask.title}</span
												>
											</a>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</Card>
				{/if}

				<!-- Outputs Panel -->
				{#if outputs.length > 0}
					<Card variant="elevated" class="overflow-hidden">
						<button
							onclick={() => togglePanel('outputs')}
							class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
						>
							<div class="flex items-center gap-3">
								<div
									class="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center"
								>
									<Layers class="w-4 h-4 text-cyan-500" />
								</div>
								<div>
									<p class="text-sm font-semibold text-foreground">Outputs</p>
									<p class="text-xs text-muted-foreground">
										{outputs.length} deliverables
									</p>
								</div>
							</div>
							<ChevronDown
								class="w-4 h-4 text-muted-foreground transition-transform {expandedPanels.outputs
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.outputs}
							<div class="border-t border-border">
								<ul class="divide-y divide-border/80 max-h-48 overflow-y-auto">
									{#each outputs.slice(0, 10) as output}
										<li>
											<button
												type="button"
												onclick={() => openOutputModal(output.id)}
												class="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/60 transition-colors"
											>
												<Layers class="w-4 h-4 text-cyan-500 shrink-0" />
												<span class="text-sm text-foreground truncate"
													>{output.name}</span
												>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</Card>
				{/if}
			</aside>
		</div>
	</main>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
	<ConfirmationModal
		isOpen={showDeleteConfirm}
		title="Delete Task"
		confirmText="Delete Task"
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		on:confirm={handleDelete}
		on:cancel={() => (showDeleteConfirm = false)}
	>
		{#snippet content()}
			<p class="text-sm text-muted-foreground">
				This action cannot be undone. The task <span class="font-semibold text-foreground"
					>"{title}"</span
				> and all its data will be permanently deleted.
			</p>
		{/snippet}
	</ConfirmationModal>
{/if}

<!-- Document Modal (Lazy Loaded) -->
{#if showDocumentModal && DocumentModalComponent}
	<svelte:component
		this={DocumentModalComponent}
		projectId={project?.id}
		taskId={task?.id}
		bind:isOpen={showDocumentModal}
		documentId={activeDocumentId}
		onClose={handleModalClose}
		onSaved={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Goal Edit Modal (Lazy Loaded) -->
{#if showGoalModal && selectedGoalId && GoalEditModalComponent}
	<svelte:component
		this={GoalEditModalComponent}
		goalId={selectedGoalId}
		projectId={project?.id}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Plan Edit Modal (Lazy Loaded) -->
{#if showPlanModal && selectedPlanId && PlanEditModalComponent}
	<svelte:component
		this={PlanEditModalComponent}
		planId={selectedPlanId}
		projectId={project?.id}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Task Edit Modal (Lazy Loaded) -->
{#if showTaskModal && selectedTaskId && TaskEditModalComponent}
	<svelte:component
		this={TaskEditModalComponent}
		taskId={selectedTaskId}
		projectId={project?.id}
		{plans}
		{goals}
		milestones={milestones.map((m) => ({ ...m, due_at: m.due_at ?? undefined }))}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Output Edit Modal (Lazy Loaded) -->
{#if showOutputModal && selectedOutputId && OutputEditModalComponent}
	<svelte:component
		this={OutputEditModalComponent}
		outputId={selectedOutputId}
		projectId={project?.id}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Milestone Edit Modal (Lazy Loaded) -->
{#if showMilestoneModal && selectedMilestoneId && MilestoneEditModalComponent}
	<svelte:component
		this={MilestoneEditModalComponent}
		milestoneId={selectedMilestoneId}
		projectId={project?.id}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Agent Chat Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	<svelte:component
		this={AgentChatModalComponent}
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={() => (showChatModal = false)}
	/>
{/if}
