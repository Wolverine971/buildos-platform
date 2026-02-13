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
		CircleCheck,
		Sparkles,
		RefreshCw,
		X,
		FolderOpen
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import Button from '$lib/components/ui/Button.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import LinkedEntities from '$lib/components/ontology/linked-entities/LinkedEntities.svelte';
	import StateDisplay from '$lib/components/ontology/StateDisplay.svelte';
	import TaskEditModal from '$lib/components/ontology/TaskEditModal.svelte';
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
	let projectTasks = $state(data.tasks || []);
	// Form fields
	let title = $state('');
	let description = $state('');
	let priority = $state<number>(3);
	let stateKey = $state('todo');
	let dueAt = $state('');

	// UI state
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);
	let dataRefreshing = $state(false);
	let initialLoaded = $state(false);

	// Mark initial load complete after first data load
	$effect(() => {
		if (task && !initialLoaded) {
			initialLoaded = true;
		}
	});

	// View state
	const VIEW_STORAGE_KEY = 'task_focus_view';
	let hasLoadedViewPreference = $state(false);
	let activeView = $state<'details' | 'workspace'>('details');

	// Workspace state
	let workspaceDocuments = $state<TaskWorkspaceDocument[]>([]);
	let workspaceLoading = $state(false);
	let workspaceInitialized = $state(false);
	let selectedWorkspaceDocId = $state<string | null>(null);
	let workspaceDocContent = $state('');
	let workspaceDocSaving = $state(false);

	// Auto-save state
	let autoSaveTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
	let hasUnsavedChanges = $state(false);
	let lastSavedContent = $state('');
	const AUTO_SAVE_DELAY = 2000; // 2 seconds debounce

	// Sidebar panels state
	let expandedPanels = $state<Record<string, boolean>>({
		goals: true,
		plans: false,
		documents: false,
		milestones: false,
		tasks: false,
		connectedDocs: false,
		linkedEntities: false
	});

	// Mobile context sheet state
	let showMobileContextSheet = $state(false);

	// Modal states for editing other entities
	let showDocumentModal = $state(false);
	let activeDocumentId = $state<string | null>(null);
	let showGoalModal = $state(false);
	let selectedGoalId = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanId = $state<string | null>(null);
	let showTaskModal = $state(false);
	let selectedTaskId = $state<string | null>(null);
	let showMilestoneModal = $state(false);
	let selectedMilestoneId = $state<string | null>(null);
	let showChatModal = $state(false);

	// Lazy-loaded modal components

	let DocumentModalComponent = $state<Component<any, any> | null>(null);

	let GoalEditModalComponent = $state<Component<any, any> | null>(null);

	let PlanEditModalComponent = $state<Component<any, any> | null>(null);

	let MilestoneEditModalComponent = $state<Component<any, any> | null>(null);

	let AgentChatModalComponent = $state<Component<any, any> | null>(null);

	// ============================================================
	// DERIVED STATE
	// ============================================================

	const connectedDocuments = $derived.by(() =>
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
	const TaskIcon = $derived(taskVisuals.icon);

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

	// Auto-save effect with debounce
	$effect(() => {
		if (!browser) return;
		if (!selectedWorkspaceDocId) return;
		if (workspaceDocContent === lastSavedContent) {
			hasUnsavedChanges = false;
			return;
		}

		hasUnsavedChanges = true;

		// Clear existing timeout
		if (autoSaveTimeout) {
			clearTimeout(autoSaveTimeout);
		}

		// Set new timeout for auto-save
		autoSaveTimeout = setTimeout(async () => {
			if (workspaceDocContent !== lastSavedContent && selectedWorkspaceDocId) {
				try {
					await saveWorkspaceDocument();
					lastSavedContent = workspaceDocContent;
					hasUnsavedChanges = false;
				} catch {
					// Error already shown via toast in saveWorkspaceDocument
				}
			}
		}, AUTO_SAVE_DELAY);

		// Cleanup on unmount
		return () => {
			if (autoSaveTimeout) {
				clearTimeout(autoSaveTimeout);
			}
		};
	});

	// ============================================================
	// UTILITY FUNCTIONS
	// ============================================================

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
			return { icon: CheckCircle2, color: 'text-success' };
		}
		if (normalized === 'in_progress' || normalized === 'active') {
			return { icon: Clock, color: 'text-accent' };
		}
		if (normalized === 'blocked') {
			return { icon: AlertTriangle, color: 'text-destructive' };
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
			const content = (doc.document?.props?.body_markdown as string) ?? '';
			workspaceDocContent = content;
			lastSavedContent = content; // Track baseline for auto-save
			hasUnsavedChanges = false;
		}
	}

	async function loadWorkspaceDocuments() {
		if (!task?.id) return;
		try {
			workspaceLoading = true;
			const result = await fetchTaskDocuments(task.id);
			workspaceDocuments = result.documents ?? [];

			const firstDoc = connectedDocuments[0];
			if (!selectedWorkspaceDocId && firstDoc) {
				selectWorkspaceDocument(firstDoc.document.id);
			}

			workspaceInitialized = true;
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load documents';
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
				state_key: stateKey,
				due_at: parseDateTimeFromInput(dueAt)
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
				projectTasks = projectData.data?.tasks || [];
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

	function openTaskModal(id: string) {
		selectedTaskId = id;
		showTaskModal = true;
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
		showMilestoneModal = false;
		activeDocumentId = null;
		selectedGoalId = null;
		selectedPlanId = null;
		selectedTaskId = null;
		selectedMilestoneId = null;
		refreshData();
	}

	function handleDocumentSaved() {
		// Refresh data but keep modal open - user can close manually when done editing
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

<!-- Keyboard Shortcuts -->
<svelte:window
	onkeydown={(e) => {
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (activeView === 'workspace' && selectedWorkspaceDocId) {
				saveWorkspaceDocument();
			} else {
				handleSave();
			}
		}
	}}
/>

<svelte:head>
	<title>{task?.title || 'Task'} | {project?.name || 'Project'} | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-background overflow-x-hidden">
	<!-- Sticky Header - Compact Mobile-First -->
	<header
		class="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
	>
		<div
			class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2 space-y-1 sm:space-y-2"
		>
			<!-- Title Row - Compact -->
			<div class="flex items-center justify-between gap-1.5 sm:gap-2">
				<div class="flex items-center gap-1.5 sm:gap-3 min-w-0">
					<button
						onclick={() => goto(`/projects/${project?.id}`)}
						class="p-1 sm:p-2 rounded-lg hover:bg-muted transition-colors shrink-0 pressable"
						aria-label="Back to project"
					>
						<ArrowLeft class="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
					</button>
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<div
								class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
							>
								<TaskIcon class="w-3.5 h-3.5 sm:w-4 sm:h-4 {taskVisuals.color}" />
							</div>
							<div class="min-w-0">
								<h1
									class="text-sm sm:text-xl font-semibold text-foreground leading-tight line-clamp-1 sm:line-clamp-2"
								>
									{title || 'Untitled Task'}
								</h1>
								<!-- Desktop: Show project link -->
								<a
									href="/projects/{project?.id}"
									class="text-xs text-muted-foreground hover:text-foreground transition-colors truncate hidden sm:block"
								>
									{project?.name || 'Project'}
								</a>
							</div>
						</div>
					</div>
				</div>

				<!-- Desktop Actions -->
				<div class="hidden sm:flex items-center gap-1.5 shrink-0">
					<StateDisplay state={stateKey} entityKind="task" />
					<button
						onclick={openChatModal}
						class="p-2 rounded-lg hover:bg-muted transition-colors pressable"
						aria-label="Chat about this task"
						title="Chat about this task"
					>
						<Sparkles class="w-5 h-5 text-accent" />
					</button>
					<button
						onclick={refreshData}
						disabled={dataRefreshing}
						class="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 pressable"
						aria-label="Refresh data"
					>
						<RefreshCw
							class="w-4 h-4 text-muted-foreground {dataRefreshing
								? 'animate-spin'
								: ''}"
						/>
					</button>
					<button
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting || isSaving}
						class="p-2 rounded-lg hover:bg-destructive/10 transition-colors pressable"
						aria-label="Delete task"
					>
						<Trash2 class="w-5 h-5 text-destructive" />
					</button>
					<Button
						variant="primary"
						size="sm"
						onclick={handleSave}
						loading={isSaving}
						disabled={isSaving || isDeleting || !title.trim()}
						class="pressable"
					>
						<Save class="w-4 h-4" />
						Save
					</Button>
				</div>

				<!-- Mobile: State + Quick Actions -->
				<div class="flex items-center gap-1.5 sm:hidden">
					<StateDisplay state={stateKey} entityKind="task" />
					<button
						onclick={openChatModal}
						class="p-1.5 rounded-lg hover:bg-muted transition-colors pressable"
						aria-label="AI Chat"
					>
						<Sparkles class="w-4 h-4 text-accent" />
					</button>
					<button
						onclick={refreshData}
						disabled={dataRefreshing}
						class="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50 pressable"
						aria-label="Refresh"
					>
						<RefreshCw
							class="w-4 h-4 text-muted-foreground {dataRefreshing
								? 'animate-spin'
								: ''}"
						/>
					</button>
				</div>
			</div>

			<!-- Mobile: Project Context & Due Date Bar -->
			<div class="flex sm:hidden items-center justify-between gap-2 text-muted-foreground">
				<a
					href="/projects/{project?.id}"
					class="flex items-center gap-1 text-xs hover:text-foreground transition-colors truncate"
				>
					<ChevronRight class="w-3 h-3 rotate-180" />
					<span class="truncate">{project?.name || 'Project'}</span>
				</a>
				{#if task?.due_at}
					<span class="flex items-center gap-1 text-xs shrink-0">
						<Clock class="w-3 h-3" />
						{formatDueDate(task.due_at)}
					</span>
				{/if}
			</div>

			<!-- Mobile: Quick Entity Stats (Goals, Plans, Docs, Tasks) -->
			{#if true}
				{@const mobileStats = [
					{ key: 'goals', count: goals.length, Icon: Target },
					{ key: 'plans', count: plans.length, Icon: Calendar },
					{ key: 'docs', count: documents.length, Icon: FileText },
					{ key: 'tasks', count: otherTasks.length, Icon: ListChecks }
				].filter((s) => s.count > 0)}
				{#if mobileStats.length > 0}
					<div
						class="flex sm:hidden items-center gap-2.5 text-muted-foreground overflow-x-auto pb-0.5"
					>
						{#each mobileStats as stat (stat.key)}
							{@const StatIcon = stat.Icon}
							<span class="flex items-center gap-0.5 shrink-0" title={stat.key}>
								<StatIcon class="h-3 w-3" />
								<span class="font-semibold text-[10px]">{stat.count}</span>
							</span>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</header>

	<!-- Main Content -->
	<main class="mx-auto max-w-screen-2xl px-2 sm:px-4 lg:px-6 py-2 sm:py-4 overflow-x-hidden">
		<div
			class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px] gap-2 sm:gap-4 lg:gap-6"
		>
			<!-- Left Column: Task Details & Workspace -->
			<div class="min-w-0 space-y-2 sm:space-y-4">
				<!-- Tab Navigation - Compact -->
				<div
					class="inline-flex rounded-lg border border-border bg-muted/50 p-0.5 sm:p-1 text-xs sm:text-sm font-semibold shadow-ink tx tx-frame tx-weak"
					role="tablist"
					aria-label="Task views"
				>
					<button
						type="button"
						role="tab"
						aria-selected={activeView === 'details'}
						aria-controls="details-panel"
						class="relative rounded px-3 sm:px-4 py-1.5 sm:py-2 transition pressable {activeView ===
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
						class="relative rounded px-3 sm:px-4 py-1.5 sm:py-2 transition pressable {activeView ===
						'workspace'
							? 'bg-accent text-accent-foreground shadow-ink'
							: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}"
						onclick={() => setActiveView('workspace')}
					>
						Workspace
						{#if connectedDocuments.length > 0}
							<span
								class="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-accent/20 text-accent"
								>{connectedDocuments.length}</span
							>
						{/if}
					</button>
				</div>

				<!-- Tab Content -->
				{#if activeView === 'details'}
					<!-- DETAILS TAB -->
					<section
						class="bg-card border border-border rounded-lg sm:rounded-xl shadow-ink tx tx-grain tx-weak overflow-hidden"
					>
						<div class="px-3 sm:px-4 py-2 sm:py-3 border-b border-border">
							<p
								class="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wide font-semibold"
							>
								Task Details
							</p>
						</div>
						<div class="p-3 sm:p-4">
							<form class="space-y-3 sm:space-y-4" onsubmit={handleSave}>
								<!-- Task Title -->
								<FormField
									label="Title"
									labelFor="title"
									required={true}
									error={!title.trim() && error ? 'Required' : ''}
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
										size="md"
										class="font-medium"
									/>
								</FormField>

								<!-- Description -->
								<FormField label="Description" labelFor="description">
									<Textarea
										id="description"
										bind:value={description}
										enterkeyhint="next"
										placeholder="Additional context..."
										rows={3}
										disabled={isSaving}
										size="md"
									/>
								</FormField>

								<!-- Grid: Priority, State, Due Date - 2 cols on mobile, 3 on desktop -->
								<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
									<FormField label="Priority" labelFor="priority" required={true}>
										<Select
											id="priority"
											value={priority}
											disabled={isSaving}
											size="sm"
											placeholder="Priority"
											onchange={(val) => (priority = Number(val))}
										>
											<option value={1}>P1 Critical</option>
											<option value={2}>P2 High</option>
											<option value={3}>P3 Medium</option>
											<option value={4}>P4 Low</option>
											<option value={5}>P5 Nice</option>
										</Select>
									</FormField>

									<FormField label="State" labelFor="state" required={true}>
										<Select
											id="state"
											bind:value={stateKey}
											disabled={isSaving}
											size="sm"
											placeholder="State"
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

									<FormField
										label="Due Date"
										labelFor="due-date"
										class="col-span-2 sm:col-span-1"
									>
										<TextInput
											id="due-date"
											type="datetime-local"
											inputmode="numeric"
											enterkeyhint="done"
											bind:value={dueAt}
											disabled={isSaving}
											size="sm"
										/>
									</FormField>
								</div>

								{#if error}
									<div
										class="p-2 sm:p-3 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
									>
										<p class="text-xs sm:text-sm text-destructive">{error}</p>
									</div>
								{/if}
							</form>
						</div>
					</section>

					<!-- Compact secondary sections in a 2-column grid -->
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
						<!-- Connected Documents - Compact -->
						<section
							class="bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak overflow-hidden"
						>
							<button
								onclick={() => togglePanel('connectedDocs')}
								class="w-full flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 text-left hover:bg-muted/60 transition-colors pressable"
							>
								<div class="flex items-center gap-2">
									<div
										class="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center"
									>
										<FileText class="w-3 h-3 text-accent" />
									</div>
									<span class="text-xs sm:text-sm font-semibold text-foreground"
										>Docs</span
									>
									{#if connectedDocuments.length > 0}
										<span
											class="text-[10px] font-semibold text-muted-foreground"
											>({connectedDocuments.length})</span
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
										class="p-1 rounded hover:bg-muted transition-colors cursor-pointer pressable"
										title="Add document"
									>
										<Plus class="w-3 h-3 text-muted-foreground" />
									</span>
									<ChevronDown
										class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.connectedDocs
											? 'rotate-180'
											: ''}"
									/>
								</div>
							</button>
							{#if expandedPanels.connectedDocs}
								<div class="border-t border-border max-h-32 overflow-y-auto">
									{#if connectedDocuments.length > 0}
										<ul class="divide-y divide-border/80">
											{#each connectedDocuments as doc}
												<li>
													<button
														type="button"
														onclick={() =>
															handleDocumentClick(doc.document.id)}
														class="w-full flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 text-left hover:bg-accent/5 transition-colors pressable"
													>
														<FileText
															class="w-3 h-3 text-accent shrink-0"
														/>
														<span
															class="text-xs text-foreground truncate flex-1"
														>
															{doc.document.title || 'Untitled'}
														</span>
														<span
															class="text-[9px] text-muted-foreground capitalize"
														>
															{doc.document.state_key || 'draft'}
														</span>
													</button>
												</li>
											{/each}
										</ul>
									{:else}
										<div class="px-2.5 py-3 text-center">
											<p class="text-[10px] text-muted-foreground mb-1.5">
												No documents yet
											</p>
											<button
												type="button"
												onclick={() => setActiveView('workspace')}
												class="text-xs text-accent hover:text-accent/80 font-medium pressable"
											>
												Open Workspace →
											</button>
										</div>
									{/if}
								</div>
							{/if}
						</section>

						<!-- Linked Entities - Compact -->
						<section
							class="bg-card border border-border rounded-lg shadow-ink tx tx-thread tx-weak overflow-hidden"
						>
							<button
								onclick={() => togglePanel('linkedEntities')}
								class="w-full flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 text-left hover:bg-muted/60 transition-colors pressable"
							>
								<div class="flex items-center gap-2">
									<div
										class="w-6 h-6 rounded-md bg-info/10 flex items-center justify-center"
									>
										<Layers class="w-3 h-3 text-info" />
									</div>
									<span class="text-xs sm:text-sm font-semibold text-foreground"
										>Links</span
									>
								</div>
								<ChevronDown
									class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.linkedEntities
										? 'rotate-180'
										: ''}"
								/>
							</button>
							{#if expandedPanels.linkedEntities}
								<div class="border-t border-border p-2 max-h-40 overflow-y-auto">
									<LinkedEntities
										sourceId={task?.id}
										sourceKind="task"
										projectId={project?.id}
										onEntityClick={handleLinkedEntityClick}
										onLinksChanged={refreshData}
									/>
								</div>
							{/if}
						</section>
					</div>
				{:else}
					<!-- WORKSPACE TAB -->
					<div class="space-y-2 sm:space-y-3">
						<!-- Document Selector - Compact -->
						<section
							class="bg-card border border-border rounded-lg shadow-ink tx tx-bloom tx-weak p-2 sm:p-3"
						>
							<div
								class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
							>
								<div class="flex items-center gap-2 flex-1 min-w-0">
									<FileText
										class="w-4 h-4 text-accent shrink-0 hidden sm:block"
									/>
									<div class="flex-1 min-w-0">
										<label for="workspace-doc-selector" class="sr-only"
											>Select document</label
										>
										<Select
											id="workspace-doc-selector"
											value={selectedWorkspaceDocId || ''}
											onchange={(val) => selectWorkspaceDocument(String(val))}
											size="sm"
										>
											{#if connectedDocuments.length === 0}
												<option value="">No documents yet</option>
											{:else}
												{#each connectedDocuments as doc}
													<option value={doc.document.id}>
														{doc.document.title || 'Untitled'} ({doc
															.document.state_key})
													</option>
												{/each}
											{/if}
										</Select>
									</div>
								</div>
								<button
									type="button"
									onclick={() => openDocumentModal(null)}
									class="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground text-xs font-semibold rounded-lg shadow-ink pressable w-full sm:w-auto"
								>
									<Plus class="w-3.5 h-3.5" />
									<span>New</span>
								</button>
							</div>
						</section>

						<!-- Editor -->
						{#if selectedWorkspaceDoc}
							<section
								class="bg-card border border-border rounded-lg shadow-ink tx tx-grain tx-weak overflow-hidden"
							>
								<div class="p-2 sm:p-3">
									<RichMarkdownEditor
										bind:value={workspaceDocContent}
										rows={18}
										maxLength={50000}
										size="base"
										label="Document Content"
										helpText="Markdown supported"
									/>
								</div>
								<div
									class="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 border-t border-border bg-muted/30"
								>
									<div class="flex items-center gap-2">
										{#if !selectedWorkspaceDoc.edge?.props?.handed_off}
											<button
												type="button"
												onclick={() =>
													handlePromoteWorkspaceDocument(
														selectedWorkspaceDocId!
													)}
												class="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-foreground border border-border rounded-lg hover:border-accent hover:bg-accent/5 transition-colors pressable"
											>
												<CircleCheck class="w-3.5 h-3.5" />
												<span class="hidden xs:inline">Promote</span>
											</button>
										{:else}
											<span class="text-[10px] text-muted-foreground"
												>Promoted</span
											>
										{/if}
										<!-- Unsaved changes indicator -->
										{#if hasUnsavedChanges}
											<span
												class="flex items-center gap-1 text-[10px] text-warning"
											>
												<span
													class="w-1.5 h-1.5 rounded-full bg-warning animate-pulse"
												></span>
												<span class="hidden sm:inline">Unsaved</span>
											</span>
										{/if}
									</div>
									<button
										type="button"
										onclick={saveWorkspaceDocument}
										disabled={workspaceDocSaving || !selectedWorkspaceDocId}
										class="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-accent-foreground text-xs font-semibold rounded-lg shadow-ink pressable disabled:opacity-50"
									>
										{#if workspaceDocSaving}
											<Loader class="w-3.5 h-3.5 animate-spin" />
										{:else}
											<Save class="w-3.5 h-3.5" />
										{/if}
										<span>Save</span>
									</button>
								</div>
							</section>
						{:else if workspaceLoading}
							<!-- Skeleton Loading State -->
							<section
								class="bg-card border border-border rounded-lg shadow-ink tx tx-pulse tx-weak overflow-hidden"
							>
								<div class="p-3 sm:p-4 space-y-3">
									<!-- Skeleton toolbar -->
									<div class="flex items-center gap-2">
										<div class="h-8 w-8 rounded bg-muted animate-pulse"></div>
										<div class="h-8 w-8 rounded bg-muted animate-pulse"></div>
										<div class="h-8 w-8 rounded bg-muted animate-pulse"></div>
										<div class="flex-1"></div>
										<div class="h-8 w-20 rounded bg-muted animate-pulse"></div>
									</div>
									<!-- Skeleton content lines -->
									<div class="space-y-2 pt-2">
										<div class="h-4 w-3/4 rounded bg-muted animate-pulse"></div>
										<div
											class="h-4 w-full rounded bg-muted animate-pulse"
										></div>
										<div class="h-4 w-5/6 rounded bg-muted animate-pulse"></div>
										<div class="h-4 w-2/3 rounded bg-muted animate-pulse"></div>
										<div class="h-4 w-0"></div>
										<div
											class="h-4 w-full rounded bg-muted animate-pulse"
										></div>
										<div class="h-4 w-4/5 rounded bg-muted animate-pulse"></div>
									</div>
								</div>
								<div
									class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-t border-border bg-muted/30"
								>
									<div class="h-8 w-20 rounded bg-muted animate-pulse"></div>
									<div class="h-8 w-16 rounded bg-muted animate-pulse"></div>
								</div>
							</section>
						{:else}
							<section
								class="bg-card border-2 border-dashed border-border rounded-lg p-4 sm:p-6 tx tx-bloom tx-weak"
							>
								<div class="text-center">
									<div
										class="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-3"
									>
										<FileText class="w-5 h-5 text-accent" />
									</div>
									<p class="text-xs text-muted-foreground mb-3">
										No document selected
									</p>
									<button
										type="button"
										onclick={() => openDocumentModal(null)}
										class="px-3 py-1.5 bg-accent text-accent-foreground text-xs font-semibold rounded-lg shadow-ink pressable"
									>
										Create Document
									</button>
								</div>
							</section>
						{/if}
					</div>
				{/if}

				<!-- Mobile Save/Delete Actions - Fixed Bottom Bar -->
				<div
					class="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-2 px-3 py-2.5 bg-card/95 backdrop-blur border-t border-border shadow-ink-strong"
				>
					<button
						type="button"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting || isSaving}
						class="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10 transition-colors pressable disabled:opacity-50"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span>Delete</span>
					</button>
					<button
						type="button"
						onclick={handleSave}
						disabled={isSaving || isDeleting || !title.trim()}
						class="flex items-center justify-center gap-1.5 px-4 py-2 bg-accent text-accent-foreground text-xs font-semibold rounded-lg shadow-ink pressable disabled:opacity-50 flex-1 max-w-[180px]"
					>
						{#if isSaving}
							<Loader class="w-3.5 h-3.5 animate-spin" />
						{:else}
							<Save class="w-3.5 h-3.5" />
						{/if}
						<span>Save Task</span>
					</button>
				</div>
				<!-- Spacer for fixed bottom bar on mobile -->
				<div class="sm:hidden h-16"></div>
			</div>

			<!-- Right Column: Project Context Sidebar - Hidden on Mobile (shown via header stats) -->
			<aside
				class="hidden lg:block min-w-0 space-y-2 lg:sticky lg:top-28 lg:max-h-[calc(100vh-140px)] lg:overflow-y-auto lg:pr-1"
			>
				<p
					class="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground px-1 mb-1"
				>
					Project Context
				</p>

				<!-- Goals Panel -->
				{#if goals.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							onclick={() => togglePanel('goals')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-warning/10 flex items-center justify-center"
								>
									<Target class="w-3 h-3 text-warning" />
								</div>
								<span class="text-xs font-semibold text-foreground">Goals</span>
								<span class="text-[10px] text-muted-foreground"
									>({goals.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.goals
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.goals}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each goals as goal}
										<li>
											<button
												type="button"
												onclick={() => openGoalModal(goal.id)}
												class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<Target class="w-3 h-3 text-warning shrink-0" />
												<span class="text-xs text-foreground truncate"
													>{goal.name}</span
												>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				<!-- Plans Panel -->
				{#if plans.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							onclick={() => togglePanel('plans')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-info/10 flex items-center justify-center"
								>
									<Calendar class="w-3 h-3 text-info" />
								</div>
								<span class="text-xs font-semibold text-foreground">Plans</span>
								<span class="text-[10px] text-muted-foreground"
									>({plans.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.plans
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.plans}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each plans as plan}
										<li>
											<button
												type="button"
												onclick={() => openPlanModal(plan.id)}
												class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<Calendar
													class="w-3 h-3 text-info shrink-0"
												/>
												<span class="text-xs text-foreground truncate"
													>{plan.name}</span
												>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				<!-- Documents Panel -->
				{#if documents.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							onclick={() => togglePanel('documents')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center"
								>
									<FileText class="w-3 h-3 text-accent" />
								</div>
								<span class="text-xs font-semibold text-foreground">Docs</span>
								<span class="text-[10px] text-muted-foreground"
									>({documents.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.documents
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.documents}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each documents.slice(0, 8) as doc}
										<li>
											<button
												type="button"
												onclick={() => openDocumentModal(doc.id)}
												class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<FileText class="w-3 h-3 text-accent shrink-0" />
												<span class="text-xs text-foreground truncate"
													>{doc.title}</span
												>
											</button>
										</li>
									{/each}
								</ul>
								{#if documents.length > 8}
									<div
										class="px-2.5 py-1.5 text-[10px] text-muted-foreground border-t border-border"
									>
										+{documents.length - 8} more
									</div>
								{/if}
							</div>
						{/if}
					</section>
				{/if}

				<!-- Milestones Panel -->
				{#if milestones.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							onclick={() => togglePanel('milestones')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-success/10 flex items-center justify-center"
								>
									<Flag class="w-3 h-3 text-success" />
								</div>
								<span class="text-xs font-semibold text-foreground">Milestones</span
								>
								<span class="text-[10px] text-muted-foreground"
									>({milestones.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.milestones
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.milestones}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each milestones as milestone}
										<li>
											<button
												type="button"
												onclick={() => openMilestoneModal(milestone.id)}
												class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<Flag class="w-3 h-3 text-success shrink-0" />
												<div class="min-w-0 flex-1">
													<span
														class="text-xs text-foreground truncate block"
														>{milestone.title}</span
													>
													{#if milestone.due_at}
														<span
															class="text-[10px] text-muted-foreground"
															>{formatDueDate(milestone.due_at)}</span
														>
													{/if}
												</div>
											</button>
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					</section>
				{/if}

				<!-- Other Tasks Panel -->
				{#if otherTasks.length > 0}
					<section
						class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
					>
						<button
							onclick={() => togglePanel('tasks')}
							class="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/50 transition-colors pressable"
						>
							<div class="flex items-center gap-2">
								<div
									class="w-6 h-6 rounded-md bg-muted flex items-center justify-center"
								>
									<ListChecks class="w-3 h-3 text-muted-foreground" />
								</div>
								<span class="text-xs font-semibold text-foreground">Tasks</span>
								<span class="text-[10px] text-muted-foreground"
									>({otherTasks.length})</span
								>
							</div>
							<ChevronDown
								class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-[120ms] {expandedPanels.tasks
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if expandedPanels.tasks}
							<div class="border-t border-border max-h-32 overflow-y-auto">
								<ul class="divide-y divide-border/80">
									{#each otherTasks.slice(0, 8) as otherTask}
										{@const visuals = getTaskVisuals(otherTask.state_key)}
										{@const OtherTaskIcon = visuals.icon}
										<li>
											<a
												href="/projects/{project?.id}/tasks/{otherTask.id}"
												class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/5 transition-colors pressable"
											>
												<OtherTaskIcon
													class="w-3 h-3 {visuals.color} shrink-0"
												/>
												<span class="text-xs text-foreground truncate"
													>{otherTask.title}</span
												>
											</a>
										</li>
									{/each}
								</ul>
								{#if otherTasks.length > 8}
									<div
										class="px-2.5 py-1.5 text-[10px] text-muted-foreground border-t border-border"
									>
										+{otherTasks.length - 8} more
									</div>
								{/if}
							</div>
						{/if}
					</section>
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
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
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
	<DocumentModalComponent
		projectId={project?.id}
		taskId={task?.id}
		bind:isOpen={showDocumentModal}
		documentId={activeDocumentId}
		onClose={handleModalClose}
		onSaved={handleDocumentSaved}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Goal Edit Modal (Lazy Loaded) -->
{#if showGoalModal && selectedGoalId && GoalEditModalComponent}
	<GoalEditModalComponent
		goalId={selectedGoalId}
		projectId={project?.id}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Plan Edit Modal (Lazy Loaded) -->
{#if showPlanModal && selectedPlanId && PlanEditModalComponent}
	<PlanEditModalComponent
		planId={selectedPlanId}
		projectId={project?.id}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Task Edit Modal -->
{#if showTaskModal && selectedTaskId}
	<TaskEditModal
		taskId={selectedTaskId}
		projectId={project?.id}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Milestone Edit Modal (Lazy Loaded) -->
{#if showMilestoneModal && selectedMilestoneId && MilestoneEditModalComponent}
	<MilestoneEditModalComponent
		milestoneId={selectedMilestoneId}
		projectId={project?.id}
		onClose={handleModalClose}
		onUpdated={handleModalClose}
		onDeleted={handleModalClose}
	/>
{/if}

<!-- Agent Chat Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	<AgentChatModalComponent
		isOpen={showChatModal}
		initialProjectFocus={entityFocus}
		onClose={() => (showChatModal = false)}
	/>
{/if}

<!-- Mobile Project Context Floating Button -->
{#if goals.length > 0 || plans.length > 0 || documents.length > 0 || otherTasks.length > 0}
	<button
		type="button"
		onclick={() => (showMobileContextSheet = true)}
		class="lg:hidden fixed bottom-20 right-3 z-30 flex items-center justify-center w-12 h-12 bg-accent text-accent-foreground rounded-full shadow-ink-strong pressable"
		aria-label="View project context"
	>
		<FolderOpen class="w-5 h-5" />
	</button>
{/if}

<!-- Mobile Project Context Slide-up Sheet -->
{#if showMobileContextSheet}
	<!-- Backdrop -->
	<div
		class="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
		onclick={() => (showMobileContextSheet = false)}
		onkeydown={(e) => e.key === 'Escape' && (showMobileContextSheet = false)}
		role="button"
		tabindex="0"
		aria-label="Close context sheet"
	></div>

	<!-- Sheet -->
	<div
		class="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-2xl shadow-ink-strong max-h-[75vh] flex flex-col animate-in slide-in-from-bottom duration-300"
	>
		<!-- Handle & Header -->
		<div class="sticky top-0 bg-card border-b border-border rounded-t-2xl">
			<div class="flex justify-center py-2">
				<div class="w-10 h-1 bg-muted-foreground/30 rounded-full"></div>
			</div>
			<div class="flex items-center justify-between px-4 pb-3">
				<div class="flex items-center gap-2">
					<FolderOpen class="w-4 h-4 text-accent" />
					<span class="text-sm font-semibold text-foreground">Project Context</span>
				</div>
				<button
					type="button"
					onclick={() => (showMobileContextSheet = false)}
					class="p-1.5 rounded-lg hover:bg-muted transition-colors pressable"
					aria-label="Close"
				>
					<X class="w-4 h-4 text-muted-foreground" />
				</button>
			</div>
		</div>

		<!-- Scrollable Content -->
		<div class="flex-1 overflow-y-auto p-3 space-y-2">
			<!-- Goals -->
			{#if goals.length > 0}
				<div
					class="bg-muted/50 border border-border rounded-lg tx tx-frame tx-weak overflow-hidden"
				>
					<div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
						<div
							class="w-6 h-6 rounded-md bg-warning/10 flex items-center justify-center"
						>
							<Target class="w-3 h-3 text-warning" />
						</div>
						<span class="text-xs font-semibold text-foreground">Goals</span>
						<span class="text-[10px] text-muted-foreground">({goals.length})</span>
					</div>
					<ul class="divide-y divide-border/50 max-h-32 overflow-y-auto">
						{#each goals as goal}
							<li>
								<button
									type="button"
									onclick={() => {
										showMobileContextSheet = false;
										openGoalModal(goal.id);
									}}
									class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/5 transition-colors pressable"
								>
									<Target class="w-3 h-3 text-warning shrink-0" />
									<span class="text-xs text-foreground truncate">{goal.name}</span
									>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Plans -->
			{#if plans.length > 0}
				<div
					class="bg-muted/50 border border-border rounded-lg tx tx-frame tx-weak overflow-hidden"
				>
					<div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
						<div
							class="w-6 h-6 rounded-md bg-info/10 flex items-center justify-center"
						>
							<Calendar class="w-3 h-3 text-info" />
						</div>
						<span class="text-xs font-semibold text-foreground">Plans</span>
						<span class="text-[10px] text-muted-foreground">({plans.length})</span>
					</div>
					<ul class="divide-y divide-border/50 max-h-32 overflow-y-auto">
						{#each plans as plan}
							<li>
								<button
									type="button"
									onclick={() => {
										showMobileContextSheet = false;
										openPlanModal(plan.id);
									}}
									class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/5 transition-colors pressable"
								>
									<Calendar class="w-3 h-3 text-info shrink-0" />
									<span class="text-xs text-foreground truncate">{plan.name}</span
									>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Documents -->
			{#if documents.length > 0}
				<div
					class="bg-muted/50 border border-border rounded-lg tx tx-frame tx-weak overflow-hidden"
				>
					<div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
						<div
							class="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center"
						>
							<FileText class="w-3 h-3 text-accent" />
						</div>
						<span class="text-xs font-semibold text-foreground">Documents</span>
						<span class="text-[10px] text-muted-foreground">({documents.length})</span>
					</div>
					<ul class="divide-y divide-border/50 max-h-32 overflow-y-auto">
						{#each documents.slice(0, 10) as doc}
							<li>
								<button
									type="button"
									onclick={() => {
										showMobileContextSheet = false;
										openDocumentModal(doc.id);
									}}
									class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/5 transition-colors pressable"
								>
									<FileText class="w-3 h-3 text-accent shrink-0" />
									<span class="text-xs text-foreground truncate">{doc.title}</span
									>
								</button>
							</li>
						{/each}
					</ul>
					{#if documents.length > 10}
						<div
							class="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/50"
						>
							+{documents.length - 10} more
						</div>
					{/if}
				</div>
			{/if}

			<!-- Other Tasks -->
			{#if otherTasks.length > 0}
				<div
					class="bg-muted/50 border border-border rounded-lg tx tx-frame tx-weak overflow-hidden"
				>
					<div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
						<div
							class="w-6 h-6 rounded-md bg-muted flex items-center justify-center"
						>
							<ListChecks class="w-3 h-3 text-muted-foreground" />
						</div>
						<span class="text-xs font-semibold text-foreground">Other Tasks</span>
						<span class="text-[10px] text-muted-foreground">({otherTasks.length})</span>
					</div>
					<ul class="divide-y divide-border/50 max-h-32 overflow-y-auto">
						{#each otherTasks.slice(0, 10) as otherTask}
							{@const visuals = getTaskVisuals(otherTask.state_key)}
							{@const OtherTaskIcon = visuals.icon}
							<li>
								<a
									href="/projects/{project?.id}/tasks/{otherTask.id}"
									onclick={() => (showMobileContextSheet = false)}
									class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/5 transition-colors pressable"
								>
									<OtherTaskIcon class="w-3 h-3 {visuals.color} shrink-0" />
									<span class="text-xs text-foreground truncate"
										>{otherTask.title}</span
									>
								</a>
							</li>
						{/each}
					</ul>
					{#if otherTasks.length > 10}
						<div
							class="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/50"
						>
							+{otherTasks.length - 10} more
						</div>
					{/if}
				</div>
			{/if}

			<!-- Milestones -->
			{#if milestones.length > 0}
				<div
					class="bg-muted/50 border border-border rounded-lg tx tx-frame tx-weak overflow-hidden"
				>
					<div class="flex items-center gap-2 px-3 py-2 border-b border-border/50">
						<div
							class="w-6 h-6 rounded-md bg-success/10 flex items-center justify-center"
						>
							<Flag class="w-3 h-3 text-success" />
						</div>
						<span class="text-xs font-semibold text-foreground">Milestones</span>
						<span class="text-[10px] text-muted-foreground">({milestones.length})</span>
					</div>
					<ul class="divide-y divide-border/50 max-h-32 overflow-y-auto">
						{#each milestones as milestone}
							<li>
								<button
									type="button"
									onclick={() => {
										showMobileContextSheet = false;
										openMilestoneModal(milestone.id);
									}}
									class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/5 transition-colors pressable"
								>
									<Flag class="w-3 h-3 text-success shrink-0" />
									<div class="min-w-0 flex-1">
										<span class="text-xs text-foreground truncate block"
											>{milestone.title}</span
										>
										{#if milestone.due_at}
											<span class="text-[10px] text-muted-foreground"
												>{formatDueDate(milestone.due_at)}</span
											>
										{/if}
									</div>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</div>
{/if}
