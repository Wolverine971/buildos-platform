<!-- apps/web/src/lib/components/ontology/TaskEditModal.svelte -->
<!--
	Task Edit Modal Component

	Provides full CRUD operations for tasks within the BuildOS ontology system:
	- Edit task details (title, description, priority, state, etc.)
	- Select task state from enum dropdown
	- Manage recurring task series
	- Delete tasks with confirmation

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Design Patterns: /apps/web/docs/technical/components/modals/TECHNICAL_ANALYSIS.md

	Related Files:
	- API Endpoints: /apps/web/src/routes/api/onto/tasks/[id]/+server.ts
	- Create Modal: /apps/web/src/lib/components/ontology/TaskCreateModal.svelte
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		Save,
		Loader,
		Trash2,
		ListChecks,
		X,
		ChevronDown,
		FileText,
		Users,
		CalendarRange,
		Clock3,
		CircleAlert,
		Repeat
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import TaskAssigneeSelector from './TaskAssigneeSelector.svelte';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import TaskEditModal from './TaskEditModal.svelte';
	import TagsDisplay from './TagsDisplay.svelte';
	import EntityActivityLog from './EntityActivityLog.svelte';
	import EntityCommentsSection from './EntityCommentsSection.svelte';
	import ImageAssetsPanel from './ImageAssetsPanel.svelte';
	import { TASK_STATES } from '$lib/types/onto';
	import type { EntityKind } from './linked-entities/linked-entities.types';
	// Lazy-loaded modal components for better initial load performance
	type TaskSeriesModalLazy = typeof import('./TaskSeriesModal.svelte').default | null;
	type DocumentModalLazy = typeof import('./DocumentModal.svelte').default | null;
	type GoalEditModalLazy = typeof import('./GoalEditModal.svelte').default | null;
	type PlanEditModalLazy = typeof import('./PlanEditModal.svelte').default | null;
	type AgentChatModalLazy =
		| typeof import('$lib/components/agent/AgentChatModal.svelte').default
		| null;
	let TaskSeriesModalComponent = $state<TaskSeriesModalLazy>(null);
	let DocumentModalComponent = $state<DocumentModalLazy>(null);
	let GoalEditModalComponent = $state<GoalEditModalLazy>(null);
	let PlanEditModalComponent = $state<PlanEditModalLazy>(null);
	let AgentChatModalComponent = $state<AgentChatModalLazy>(null);

	async function loadTaskSeriesModal() {
		if (!TaskSeriesModalComponent) {
			const mod = await import('./TaskSeriesModal.svelte');
			TaskSeriesModalComponent = mod.default;
		}
		return TaskSeriesModalComponent;
	}

	async function loadDocumentModal() {
		if (!DocumentModalComponent) {
			const mod = await import('./DocumentModal.svelte');
			DocumentModalComponent = mod.default;
		}
		return DocumentModalComponent;
	}

	async function loadGoalEditModal() {
		if (!GoalEditModalComponent) {
			const mod = await import('./GoalEditModal.svelte');
			GoalEditModalComponent = mod.default;
		}
		return GoalEditModalComponent;
	}

	async function loadPlanEditModal() {
		if (!PlanEditModalComponent) {
			const mod = await import('./PlanEditModal.svelte');
			PlanEditModalComponent = mod.default;
		}
		return PlanEditModalComponent;
	}

	async function loadAgentChatModal() {
		if (!AgentChatModalComponent) {
			const mod = await import('$lib/components/agent/AgentChatModal.svelte');
			AgentChatModalComponent = mod.default;
		}
		return AgentChatModalComponent;
	}

	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { format } from 'date-fns';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	interface Props {
		taskId: string;
		projectId: string;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { taskId, projectId, onClose, onUpdated, onDeleted }: Props = $props();

	let modalOpen = $state(true);
	let task = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);
	let hasCalendarLink = $state(false);
	let deleteFromCalendar = $state(true);
	let _hasChanges = $state(false);

	// Form fields
	let title = $state('');
	let description = $state('');
	let priority = $state<number>(3);
	let stateKey = $state('todo');
	let typeKey = $state('task.default');
	let startAt = $state('');
	let dueAt = $state('');
	let completedAt = $state('');
	let assigneeActorIds = $state<string[]>([]);
	let showSeriesModal = $state(false);
	let showSeriesDeleteConfirm = $state(false);
	let isDeletingSeries = $state(false);
	let seriesActionError = $state('');

	// Document modal state
	let documentModalOpen = $state(false);
	let documentIdForModal = $state<string | null>(null);

	// Modal states for linked entity navigation
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showLinkedTaskModal = $state(false);
	let selectedLinkedTaskId = $state<string | null>(null);
	let showChatModal = $state(false);
	let showActivityLog = $state(false);

	type SurfaceBadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'accent';

	const TASK_STATE_META: Record<
		string,
		{ label: string; variant: SurfaceBadgeVariant; note: string }
	> = {
		todo: {
			label: 'To do',
			variant: 'default',
			note: 'Ready to be picked up.'
		},
		in_progress: {
			label: 'In progress',
			variant: 'info',
			note: 'Actively being worked on.'
		},
		blocked: {
			label: 'Blocked',
			variant: 'warning',
			note: 'Waiting on something else first.'
		},
		done: {
			label: 'Done',
			variant: 'success',
			note: 'Completed and out of the queue.'
		}
	};

	const PRIORITY_META: Record<
		number,
		{ label: string; variant: SurfaceBadgeVariant; note: string }
	> = {
		1: {
			label: 'P1 Critical',
			variant: 'error',
			note: 'Needs immediate attention.'
		},
		2: {
			label: 'P2 High',
			variant: 'warning',
			note: 'Important enough to prioritize soon.'
		},
		3: {
			label: 'P3 Medium',
			variant: 'info',
			note: 'Standard working priority.'
		},
		4: {
			label: 'P4 Low',
			variant: 'default',
			note: 'Can wait without much risk.'
		},
		5: {
			label: 'P5 Nice to have',
			variant: 'accent',
			note: 'Optional work when there is slack.'
		}
	};

	function parseDisplayDate(value: Date | string | null | undefined): Date | null {
		if (!value) return null;
		const date = value instanceof Date ? value : new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	function formatSurfaceDate(
		value: Date | string | null | undefined,
		pattern: string = 'PPp',
		fallback: string = 'Not set'
	): string {
		const date = parseDisplayDate(value);
		return date ? format(date, pattern) : fallback;
	}

	function formatTaskTypeLabel(value: string | null | undefined): string {
		if (!value || value === 'task.default') return 'General task';

		return value
			.replace(/^task\./, '')
			.split(/[._]/)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function getStateMeta(value: string) {
		return (
			TASK_STATE_META[value] ?? {
				label: value,
				variant: 'default' as SurfaceBadgeVariant,
				note: 'Custom workflow state.'
			}
		);
	}

	function getPriorityMeta(value: number) {
		return (
			PRIORITY_META[value] ??
			PRIORITY_META[3] ?? {
				label: 'P3 Medium',
				variant: 'info' as SurfaceBadgeVariant,
				note: 'Standard working priority.'
			}
		);
	}

	const detailsFormId = $derived(`task-edit-${taskId}-details`);

	const seriesMeta = $derived.by(() => {
		if (!task?.props || typeof task.props !== 'object') return null;
		const meta = (task.props as Record<string, any>).series;
		return meta && typeof meta === 'object' ? meta : null;
	});

	const seriesId = $derived.by(() => {
		if (!task?.props || typeof task.props !== 'object') {
			return null;
		}
		return (task.props as Record<string, any>).series_id ?? null;
	});

	const isSeriesMaster = $derived(seriesMeta?.role === 'master');
	const isSeriesInstance = $derived(seriesMeta?.role === 'instance');
	const stateMeta = $derived.by(() => getStateMeta(stateKey));
	const priorityMeta = $derived.by(() => getPriorityMeta(priority));
	const taskTypeLabel = $derived.by(() => formatTaskTypeLabel(typeKey || task?.type_key));
	const assigneeSummary = $derived.by(() => {
		if (assigneeActorIds.length === 0) return 'Unassigned';
		if (assigneeActorIds.length === 1) return '1 assignee';
		return `${assigneeActorIds.length} assignees`;
	});
	const scheduleSummary = $derived.by(() => {
		const startDate = parseDisplayDate(startAt || task?.start_at);
		const dueDate = parseDisplayDate(dueAt || task?.due_at);

		if (startDate && dueDate) {
			return `${format(startDate, 'EEE, MMM d · p')} to ${format(dueDate, 'EEE, MMM d · p')}`;
		}

		if (startDate) {
			return `Starts ${format(startDate, 'EEE, MMM d · p')}`;
		}

		if (dueDate) {
			return `Due ${format(dueDate, 'EEE, MMM d · p')}`;
		}

		return 'No schedule defined yet';
	});
	const dueMeta = $derived.by(() => {
		const dueDate = parseDisplayDate(dueAt || task?.due_at);

		if (!dueDate) return null;
		if (stateKey === 'done') {
			return {
				label: 'Completed',
				variant: 'success' as SurfaceBadgeVariant,
				note: completedAt
					? `Finished ${formatSurfaceDate(completedAt, 'MMM d, p')}`
					: 'Task is marked complete.'
			};
		}

		if (dueDate.getTime() < Date.now()) {
			return {
				label: 'Overdue',
				variant: 'error' as SurfaceBadgeVariant,
				note: `Deadline passed ${formatSurfaceDate(dueDate, 'MMM d, p')}`
			};
		}

		return {
			label: 'Scheduled',
			variant: 'info' as SurfaceBadgeVariant,
			note: `Due ${formatSurfaceDate(dueDate, 'MMM d, p')}`
		};
	});
	const recurrenceSummary = $derived.by(() => {
		if (isSeriesMaster && seriesMeta) {
			if (seriesMeta.instance_count) {
				return `${seriesMeta.instance_count} upcoming instance${seriesMeta.instance_count === 1 ? '' : 's'}`;
			}
			return 'Recurring series';
		}

		if (isSeriesInstance) {
			return 'Part of a recurring series';
		}

		return 'Does not repeat';
	});

	// Build focus for chat about this task
	const entityFocus = $derived.by((): ProjectFocus | null => {
		if (!task || !projectId) return null;
		return {
			focusType: 'task',
			focusEntityId: taskId,
			focusEntityName: task.title || 'Untitled Task',
			projectId: projectId,
			projectName: task.project?.name || 'Project'
		};
	});

	// Load task data when modal opens
	$effect(() => {
		if (!browser) return;
		if (taskId) {
			loadTask();
		}
	});

	$effect(() => {
		if (!browser) return;
		if (showDeleteConfirm) {
			void loadCalendarLinkStatus();
		}
	});

	function formatDateTimeForInput(date: Date | string | null): string {
		if (!date) return '';
		try {
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			if (isNaN(dateObj.getTime())) return '';
			return format(dateObj, "yyyy-MM-dd'T'HH:mm");
		} catch (error) {
			console.warn('Failed to format datetime for input:', date, error);
			return '';
		}
	}

	function parseDateTimeFromInput(value: string): string | null {
		if (!value) return null;
		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;
			return date.toISOString();
		} catch (error) {
			console.warn('Failed to parse datetime from input:', value, error);
			return null;
		}
	}

	async function loadTask() {
		try {
			isLoading = true;
			const response = await fetch(`/api/onto/tasks/${taskId}/full`);

			if (!response.ok) throw new Error('Failed to load task');

			const data = await response.json();
			task = data.data?.task;

			if (task) {
				title = task.title || '';
				description = task.description || '';
				priority = task.priority || 3;
				stateKey = task.state_key || 'todo';
				typeKey = task.type_key || 'task.default';
				startAt = task.start_at ? formatDateTimeForInput(task.start_at) : '';
				dueAt = task.due_at ? formatDateTimeForInput(task.due_at) : '';
				completedAt = task.completed_at || '';
				assigneeActorIds = Array.isArray(task.assignees)
					? task.assignees
							.map((assignee: { actor_id?: string }) => assignee.actor_id)
							.filter((actorId: string | undefined): actorId is string =>
								Boolean(actorId)
							)
					: [];
				seriesActionError = '';
				showSeriesDeleteConfirm = false;
			}
		} catch (err) {
			console.error('Error loading task:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/tasks/${taskId}/full`,
				method: 'GET',
				projectId,
				entityType: 'task',
				entityId: taskId,
				operation: 'task_load'
			});
			error = 'Failed to load task';
		} finally {
			isLoading = false;
		}
	}

	async function loadCalendarLinkStatus() {
		if (!projectId || !taskId) {
			hasCalendarLink = false;
			return;
		}

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/events?owner_type=task&owner_id=${taskId}&limit=10`
			);

			if (!response.ok) {
				hasCalendarLink = false;
				return;
			}

			const result = await response.json();
			const events = result?.data?.events ?? [];

			hasCalendarLink = events.some((event: any) => {
				const syncRows = event.onto_event_sync || [];
				const props = event.props || {};
				return (
					syncRows.length > 0 ||
					Boolean(props.external_event_id || props.external_calendar_id)
				);
			});
		} catch {
			hasCalendarLink = false;
		}
	}

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
				type_key: typeKey || 'task.default',
				start_at: parseDateTimeFromInput(startAt),
				due_at: parseDateTimeFromInput(dueAt),
				assignee_actor_ids: assigneeActorIds
			};

			const response = await fetch(`/api/onto/tasks/${taskId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to update task');
			}

			const updatedTask = result?.data?.task;
			if (updatedTask) {
				completedAt = updatedTask.completed_at || '';
				stateKey = updatedTask.state_key || stateKey;
			} else {
				completedAt = stateKey === 'done' ? new Date().toISOString() : '';
			}

			if (onUpdated) {
				onUpdated();
			}
			onClose();
		} catch (err) {
			console.error('Error updating task:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/tasks/${taskId}`,
				method: 'PATCH',
				projectId,
				entityType: 'task',
				entityId: taskId,
				operation: 'task_update'
			});
			error = err instanceof Error ? err.message : 'Failed to update task';
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/tasks/${taskId}`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sync_to_calendar: deleteFromCalendar })
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete task');
			}

			if (onDeleted) {
				onDeleted();
			}
			onClose();
		} catch (err) {
			console.error('Error deleting task:', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/tasks/${taskId}`,
				method: 'DELETE',
				projectId,
				entityType: 'task',
				entityId: taskId,
				operation: 'task_delete'
			});
			error = err instanceof Error ? err.message : 'Failed to delete task';
			isDeleting = false;
			showDeleteConfirm = false;
		}
	}

	async function handleSeriesCreated() {
		await loadTask();
		showSeriesModal = false;
		toastService.success('Task marked as recurring');
		onUpdated?.();
	}

	async function handleDeleteSeries(force = false) {
		if (!seriesId) return;
		seriesActionError = '';
		isDeletingSeries = true;

		try {
			const response = await fetch(
				`/api/onto/task-series/${seriesId}${force ? '?force=true' : ''}`,
				{
					method: 'DELETE'
				}
			);
			const result = await response.json();
			if (!response.ok) {
				throw new Error(result?.error || 'Failed to delete series');
			}

			toastService.success('Series deleted');
			showSeriesDeleteConfirm = false;
			await loadTask();
			onUpdated?.();
		} catch (err) {
			console.error('Failed to delete task series', err);
			void logOntologyClientError(err, {
				endpoint: `/api/onto/task-series/${seriesId}`,
				method: 'DELETE',
				projectId,
				entityType: 'task_series',
				entityId: seriesId,
				operation: 'task_series_delete'
			});
			const message = err instanceof Error ? err.message : 'Failed to delete series';
			seriesActionError = message;
			toastService.error(message);
		} finally {
			isDeletingSeries = false;
		}
	}

	function handleClose() {
		modalOpen = false;
		onClose?.();
	}

	// Series modal handler with lazy loading
	async function openSeriesModal() {
		await loadTaskSeriesModal();
		showSeriesModal = true;
	}

	// Linked entity modal handlers with lazy loading
	async function openGoalModal(id: string) {
		await loadGoalEditModal();
		selectedGoalIdForModal = id;
		showGoalModal = true;
	}

	async function openPlanModal(id: string) {
		await loadPlanEditModal();
		selectedPlanIdForModal = id;
		showPlanModal = true;
	}

	async function openDocumentModal(id: string) {
		await loadDocumentModal();
		documentIdForModal = id;
		documentModalOpen = true;
	}

	function openLinkedTaskModal(id: string) {
		selectedLinkedTaskId = id;
		showLinkedTaskModal = true;
	}

	function closeLinkedEntityModals(wasChanged: boolean = true) {
		showGoalModal = false;
		showPlanModal = false;
		showLinkedTaskModal = false;
		documentModalOpen = false;
		selectedGoalIdForModal = null;
		selectedPlanIdForModal = null;
		selectedLinkedTaskId = null;
		documentIdForModal = null;
		if (wasChanged) {
			_hasChanges = true;
			loadTask();
		}
	}

	function handleLinksChanged() {
		_hasChanges = true;
	}

	// Unified handler for LinkedEntities component clicks
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
				openLinkedTaskModal(id);
				break;
			default:
				console.log(`No modal handler for entity kind: ${kind}`);
		}
	}

	// Chat about this task handlers
	async function openChatAbout() {
		if (!task || !projectId) return;
		await loadAgentChatModal();
		showChatModal = true;
	}

	function handleChatClose() {
		showChatModal = false;
	}
</script>

<Modal
	bind:isOpen={modalOpen}
	size="xl"
	onClose={handleClose}
	closeOnEscape={!isSaving && !isDeleting}
	showCloseButton={false}
	customClasses="wt-plate"
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-accent/10 text-accent shrink-0"
				>
					<ListChecks class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || task?.title || 'Task'}
					</h2>
					<div class="mt-1 flex flex-wrap items-center gap-1.5">
						<Badge variant={stateMeta.variant} size="sm">{stateMeta.label}</Badge>
						<Badge variant={priorityMeta.variant} size="sm">{priorityMeta.label}</Badge>
						<Badge variant="accent" size="sm">{taskTypeLabel}</Badge>
						{#if dueMeta}
							<Badge variant={dueMeta.variant} size="sm">{dueMeta.label}</Badge>
						{/if}
					</div>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-1">
						{#if task?.created_at}Created {new Date(task.created_at).toLocaleDateString(
								undefined,
								{ month: 'short', day: 'numeric' }
							)}{/if}{#if task?.updated_at && task.updated_at !== task.created_at}
							· Updated {new Date(task.updated_at).toLocaleDateString(undefined, {
								month: 'short',
								day: 'numeric'
							})}{/if}
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<!-- Chat about this task button -->
				<button
					type="button"
					onclick={openChatAbout}
					disabled={isLoading || isSaving || !task}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					title="Chat about this task"
				>
					<img
						src="/brain-bolt.png"
						alt="Chat about this task"
						class="w-6 h-6 rounded object-cover"
					/>
				</button>
				<!-- Close button -->
				<button
					type="button"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:bg-card hover:border-red-500/50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<!-- Main content -->
		<div class="px-2 py-2 sm:px-4 sm:py-4">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
				</div>
			{:else if !task}
				<div class="text-center py-8">
					<p class="text-destructive">Task not found</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
					<!-- Main Form (Left 2 columns) -->
					<div class="lg:col-span-2">
						<form
							id={detailsFormId}
							onsubmit={(e) => {
								e.preventDefault();
								handleSave();
							}}
							class="space-y-3 sm:space-y-4"
						>
							<Card variant="elevated" class="wt-paper">
								<CardHeader variant="accent" texture="strip">
									<div
										class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
									>
										<div class="min-w-0">
											<div class="flex items-center gap-2">
												<FileText class="h-4 w-4 text-accent" />
												<p
													class="text-xs font-semibold uppercase tracking-[0.18em] text-accent"
												>
													Overview
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												What this task is and what “done” looks like
											</h3>
											<p class="mt-1 text-xs text-muted-foreground">
												Lead with the title and supporting context so the
												task reads clearly before someone edits workflow
												details.
											</p>
										</div>
										<div class="flex flex-wrap items-center gap-1.5">
											<Badge variant={stateMeta.variant} size="sm"
												>{stateMeta.label}</Badge
											>
											<Badge variant={priorityMeta.variant} size="sm">
												{priorityMeta.label}
											</Badge>
										</div>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<FormField
										label="Title"
										labelFor="title"
										required={true}
										uppercase={false}
										showOptional={false}
										error={!title.trim() && error ? 'Required' : ''}
									>
										<TextInput
											id="title"
											bind:value={title}
											inputmode="text"
											enterkeyhint="next"
											placeholder="Task title..."
											required={true}
											disabled={isSaving}
											error={!title.trim() && error ? true : false}
										/>
									</FormField>

									<FormField
										label="Description"
										labelFor="description"
										uppercase={false}
										showOptional={false}
									>
										<Textarea
											id="description"
											bind:value={description}
											enterkeyhint="next"
											placeholder="Add the context, expected outcome, or handoff notes..."
											rows={4}
											disabled={isSaving}
											size="md"
										/>
									</FormField>
								</CardBody>
							</Card>

							<Card variant="default" class="wt-paper">
								<CardHeader variant="transparent" texture="none">
									<div
										class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
									>
										<div>
											<div class="flex items-center gap-2">
												<Users class="h-4 w-4 text-muted-foreground" />
												<p
													class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
												>
													Workflow
												</p>
											</div>
											<h3 class="mt-1 text-sm font-semibold text-foreground">
												Ownership and execution state
											</h3>
										</div>
										<p
											class="text-xs text-muted-foreground sm:max-w-52 sm:text-right"
										>
											Keep the operational controls together so the task’s
											status is obvious at a glance.
										</p>
									</div>
								</CardHeader>
								<CardBody class="space-y-4">
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<FormField
											label="State"
											labelFor="state"
											required={true}
											uppercase={false}
											showOptional={false}
										>
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
											label="Priority"
											labelFor="priority"
											required={true}
											uppercase={false}
											showOptional={false}
										>
											<Select
												id="priority"
												value={priority}
												disabled={isSaving}
												size="sm"
												placeholder="Priority"
												onchange={(val) => (priority = Number(val))}
											>
												<option value={1}>P1 - Critical</option>
												<option value={2}>P2 - High</option>
												<option value={3}>P3 - Medium</option>
												<option value={4}>P4 - Low</option>
												<option value={5}>P5 - Nice to have</option>
											</Select>
										</FormField>
									</div>

									<div class="space-y-1.5">
										<div class="flex items-center justify-between gap-2">
											<p class="text-xs font-medium text-muted-foreground">
												Assignees
											</p>
											<Badge
												variant={assigneeActorIds.length > 0
													? 'accent'
													: 'default'}
												size="sm"
											>
												{assigneeSummary}
											</Badge>
										</div>
										<TaskAssigneeSelector
											{projectId}
											bind:selectedActorIds={assigneeActorIds}
											fallbackAssignees={Array.isArray(task?.assignees)
												? task.assignees
												: []}
											disabled={isSaving || isLoading}
											maxAssignees={10}
										/>
									</div>

									{#if stateKey === 'done' && completedAt}
										<div
											class="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/10 dark:text-emerald-300"
										>
											Completed {format(new Date(completedAt), 'PPpp')}
										</div>
									{/if}
								</CardBody>
							</Card>

							<Card
								variant="default"
								class={dueMeta?.variant === 'error'
									? 'wt-paper tx tx-static tx-weak ring-1 ring-destructive/20'
									: 'wt-paper'}
							>
								<CardHeader variant="transparent" texture="none">
									<div class="flex items-center justify-between gap-2">
										<div class="flex items-center gap-2">
											<CalendarRange class="h-4 w-4 text-muted-foreground" />
											<p
												class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
											>
												Schedule
											</p>
										</div>
										{#if dueMeta}
											<Badge variant={dueMeta.variant} size="sm">
												{dueMeta.label}
											</Badge>
										{/if}
									</div>
								</CardHeader>
								<CardBody class="space-y-2">
									{#if dueMeta?.variant === 'error'}
										<div
											class="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2"
										>
											<CircleAlert
												class="h-3.5 w-3.5 shrink-0 text-destructive"
											/>
											<p class="text-xs font-semibold text-destructive">
												{dueMeta.note}
											</p>
										</div>
									{/if}

									<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
										<FormField
											label="Start"
											labelFor="start-date"
											uppercase={false}
											showOptional={false}
										>
											<TextInput
												id="start-date"
												type="datetime-local"
												inputmode="numeric"
												enterkeyhint="next"
												bind:value={startAt}
												disabled={isSaving}
												size="sm"
											/>
										</FormField>

										<FormField
											label="Due"
											labelFor="due-date"
											uppercase={false}
											showOptional={false}
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

									{#if startAt || dueAt}
										<p class="text-xs text-muted-foreground">
											{scheduleSummary}
										</p>
									{/if}

									<!-- Recurrence -->
									<div class="rounded-md border border-border/70 px-3 py-2">
										<div class="flex items-center justify-between gap-2">
											<div class="flex items-center gap-2 min-w-0">
												<Repeat
													class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
												/>
												<p
													class="text-xs font-medium text-foreground truncate"
												>
													{recurrenceSummary}
												</p>
												{#if isSeriesMaster || isSeriesInstance}
													<Badge variant="accent" size="sm"
														>Recurring</Badge
													>
												{/if}
											</div>
											{#if !isSeriesMaster && !isSeriesInstance}
												<Button
													size="sm"
													variant="ghost"
													class="shrink-0 text-xs pressable"
													onclick={openSeriesModal}
												>
													Set up
												</Button>
											{/if}
										</div>

										{#if isSeriesMaster && seriesMeta}
											<div class="mt-2 space-y-2">
												{#if seriesActionError}
													<p class="text-xs text-destructive">
														{seriesActionError}
													</p>
												{/if}

												{#if !showSeriesDeleteConfirm}
													<Button
														size="sm"
														variant="danger"
														class="w-full"
														onclick={() =>
															(showSeriesDeleteConfirm = true)}
													>
														Delete Series
													</Button>
												{:else}
													<p class="text-xs text-muted-foreground">
														Delete this series? Completed instances
														remain unless you force delete.
													</p>
													<div class="mt-1.5 flex flex-wrap gap-1.5">
														<Button
															variant="danger"
															size="sm"
															disabled={isDeletingSeries}
															onclick={() =>
																handleDeleteSeries(false)}
														>
															{#if isDeletingSeries}
																<Loader
																	class="w-3.5 h-3.5 animate-spin"
																/>
																Removing…
															{:else}
																Delete Upcoming
															{/if}
														</Button>
														<Button
															variant="danger"
															size="sm"
															disabled={isDeletingSeries}
															onclick={() => handleDeleteSeries(true)}
														>
															{#if isDeletingSeries}
																<Loader
																	class="w-3.5 h-3.5 animate-spin"
																/>
																Removing…
															{:else}
																Force Delete All
															{/if}
														</Button>
														<Button
															variant="ghost"
															size="sm"
															onclick={() => {
																showSeriesDeleteConfirm = false;
																seriesActionError = '';
															}}
															disabled={isDeletingSeries}
														>
															Cancel
														</Button>
													</div>
												{/if}
											</div>
										{:else if isSeriesInstance}
											<p class="mt-1 text-xs text-muted-foreground">
												Cadence inherited from parent series.
											</p>
										{/if}
									</div>
								</CardBody>
							</Card>

							{#if error}
								<div
									class="rounded-lg border border-destructive/30 bg-destructive/10 p-3 shadow-ink-inner"
								>
									<p class="text-sm text-destructive">{error}</p>
								</div>
							{/if}
						</form>
					</div>

					<!-- Sidebar (Right column) -->
					<div class="space-y-3">
						<Card variant="elevated" class="wt-card">
							<CardHeader variant="muted" texture="strip">
								<div class="flex items-center justify-between gap-3">
									<div>
										<p
											class="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
										>
											At a glance
										</p>
										<h3 class="mt-1 text-sm font-semibold text-foreground">
											Operational snapshot
										</h3>
									</div>
									<Badge variant={stateMeta.variant} size="sm"
										>{stateMeta.label}</Badge
									>
								</div>
							</CardHeader>
							<CardBody class="space-y-3">
								<div class="grid grid-cols-2 gap-2">
									<div class="rounded-lg border border-border/70 bg-muted/30 p-3">
										<p
											class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
										>
											Priority
										</p>
										<p class="mt-1 text-sm font-semibold text-foreground">
											{priorityMeta.label}
										</p>
										<p class="mt-1 text-xs text-muted-foreground">
											{priorityMeta.note}
										</p>
									</div>
									<div class="rounded-lg border border-border/70 bg-muted/30 p-3">
										<p
											class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
										>
											Assignees
										</p>
										<p class="mt-1 text-sm font-semibold text-foreground">
											{assigneeSummary}
										</p>
										<p class="mt-1 text-xs text-muted-foreground">
											{assigneeActorIds.length > 0
												? 'Ownership has been assigned.'
												: 'No owner set yet.'}
										</p>
									</div>
								</div>

								<div
									class={dueMeta?.variant === 'error'
										? 'rounded-lg border border-destructive/30 bg-destructive/5 p-3 tx tx-static tx-weak'
										: 'rounded-lg border border-border/70 bg-card p-3'}
								>
									<div class="space-y-2">
										<div class="flex items-start justify-between gap-2">
											<p
												class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
											>
												Timeline
											</p>
											{#if dueMeta}
												<Badge variant={dueMeta.variant} size="sm"
													>{dueMeta.label}</Badge
												>
											{/if}
										</div>
										{#if dueMeta?.variant === 'error'}
											<p class="text-xs font-semibold text-destructive">
												{dueMeta.note}
											</p>
										{/if}
										<div class="grid grid-cols-1 gap-1.5 text-xs">
											<div class="flex items-center justify-between gap-2">
												<span class="text-muted-foreground">Start</span>
												<span class="text-right text-foreground">
													{formatSurfaceDate(
														startAt || task?.start_at,
														'MMM d, p',
														'Not set'
													)}
												</span>
											</div>
											<div class="flex items-center justify-between gap-2">
												<span class="text-muted-foreground">Due</span>
												<span
													class={dueMeta?.variant === 'error'
														? 'text-right font-semibold text-destructive'
														: 'text-right text-foreground'}
												>
													{formatSurfaceDate(
														dueAt || task?.due_at,
														'MMM d, p',
														'No deadline'
													)}
												</span>
											</div>
											<div class="flex items-center justify-between gap-2">
												<span class="text-muted-foreground">Repeats</span>
												<span class="text-right text-foreground"
													>{recurrenceSummary}</span
												>
											</div>
										</div>
									</div>
								</div>

								<div class="rounded-lg border border-border/70 bg-muted/30 p-3">
									<div class="flex items-center gap-2">
										<Clock3 class="h-4 w-4 text-muted-foreground" />
										<p
											class="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
										>
											Metadata
										</p>
									</div>
									<div class="mt-3 space-y-2 text-sm">
										<div class="flex items-center justify-between gap-3">
											<span class="text-muted-foreground">Type</span>
											<span class="text-right text-foreground"
												>{taskTypeLabel}</span
											>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-muted-foreground">Created</span>
											<span class="text-right text-foreground">
												{formatSurfaceDate(task?.created_at, 'MMM d, yyyy')}
											</span>
										</div>
										<div class="flex items-center justify-between gap-3">
											<span class="text-muted-foreground">Updated</span>
											<span class="text-right text-foreground">
												{formatSurfaceDate(task?.updated_at, 'MMM d, yyyy')}
											</span>
										</div>
										{#if completedAt}
											<div class="flex items-center justify-between gap-3">
												<span class="text-muted-foreground">Completed</span>
												<span class="text-right text-foreground">
													{formatSurfaceDate(completedAt, 'MMM d, p')}
												</span>
											</div>
										{/if}
									</div>
								</div>
							</CardBody>
						</Card>

						<!-- Linked Entities -->
						<LinkedEntities
							sourceId={taskId}
							sourceKind="task"
							projectId={task.project_id}
							onEntityClick={handleLinkedEntityClick}
							onLinksChanged={handleLinksChanged}
						/>

						<!-- Images -->
						<ImageAssetsPanel
							{projectId}
							entityKind="task"
							entityId={taskId}
							title="Images"
							compact={true}
							onChanged={() => {
								void loadTask();
								onUpdated?.();
							}}
						/>

						{#if task?.props?.tags?.length}
							<div
								class="px-3 py-2.5 border border-border rounded-lg bg-card shadow-ink"
							>
								<p
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5"
								>
									Tags
								</p>
								<TagsDisplay props={task.props} size="sm" compact={true} />
							</div>
						{/if}

						<!-- Activity Log (collapsible) -->
						<div
							class="border border-border rounded-lg bg-card shadow-ink overflow-hidden"
						>
							<button
								type="button"
								onclick={() => (showActivityLog = !showActivityLog)}
								class="w-full px-3 py-2 flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:bg-muted/50 transition-colors"
							>
								<span>Activity</span>
								<ChevronDown
									class="w-3.5 h-3.5 transition-transform {showActivityLog
										? 'rotate-180'
										: ''}"
								/>
							</button>
							{#if showActivityLog}
								<div class="border-t border-border">
									<EntityActivityLog
										entityType="task"
										entityId={taskId}
										autoLoad={true}
									/>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="mt-4">
					<EntityCommentsSection {projectId} entityType="task" entityId={taskId} />
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Footer Actions - delete on left, cancel/save on right -->
	{#snippet footer()}
		{#if !isLoading && task}
			<div
				class="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-t border-border bg-muted/50"
			>
				<div class="flex items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting || isSaving}
						class="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-8 pressable"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span class="hidden sm:inline ml-1">Delete</span>
					</Button>
				</div>
				<div class="flex items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving || isDeleting}
						class="text-xs h-8 pressable"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form={detailsFormId}
						variant="primary"
						size="sm"
						loading={isSaving}
						disabled={isSaving || isDeleting || !title.trim()}
						class="text-xs h-8 pressable"
					>
						<Save class="w-3.5 h-3.5" />
						<span class="ml-1">Save</span>
					</Button>
				</div>
			</div>
		{/if}
	{/snippet}
</Modal>

{#if task && showSeriesModal && TaskSeriesModalComponent}
	{@const SeriesModal = TaskSeriesModalComponent}
	<SeriesModal
		{task}
		bind:isOpen={showSeriesModal}
		onClose={() => (showSeriesModal = false)}
		onSuccess={handleSeriesCreated}
	/>
{/if}

{#if showDeleteConfirm}
	<ConfirmationModal
		isOpen={showDeleteConfirm}
		title="Delete Task"
		confirmText={hasCalendarLink
			? deleteFromCalendar
				? 'Delete + Calendar'
				: 'Delete only here'
			: 'Delete Task'}
		confirmVariant="danger"
		loading={isDeleting}
		loadingText="Deleting..."
		icon="danger"
		onconfirm={handleDelete}
		oncancel={() => (showDeleteConfirm = false)}
	>
		{#snippet content()}
			<div class="space-y-3">
				<p class="text-sm text-muted-foreground">
					This action cannot be undone. The task will be permanently deleted from BuildOS.
				</p>
				{#if hasCalendarLink}
					<label
						class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer group"
					>
						<input
							type="checkbox"
							bind:checked={deleteFromCalendar}
							class="h-4 w-4 rounded border-border text-accent focus:ring-accent/50 focus:ring-offset-0 cursor-pointer"
						/>
						<span class="group-hover:text-foreground transition-colors">
							Also delete linked calendar events
						</span>
					</label>
				{:else}
					<p class="text-xs text-muted-foreground italic">
						No linked calendar events found.
					</p>
				{/if}
			</div>
		{/snippet}
	</ConfirmationModal>
{/if}

<!-- Linked Entity Modals (Lazy Loaded) -->
{#if showGoalModal && selectedGoalIdForModal && GoalEditModalComponent}
	{@const GoalModal = GoalEditModalComponent}
	<GoalModal
		goalId={selectedGoalIdForModal}
		{projectId}
		onClose={() => closeLinkedEntityModals(false)}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if showPlanModal && selectedPlanIdForModal && PlanEditModalComponent}
	{@const PlanModal = PlanEditModalComponent}
	<PlanModal
		planId={selectedPlanIdForModal}
		{projectId}
		onClose={() => closeLinkedEntityModals(false)}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if showLinkedTaskModal && selectedLinkedTaskId}
	<TaskEditModal
		taskId={selectedLinkedTaskId}
		{projectId}
		onClose={() => closeLinkedEntityModals(false)}
		onUpdated={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

{#if documentModalOpen && DocumentModalComponent}
	{@const DocModal = DocumentModalComponent}
	<DocModal
		{projectId}
		documentId={documentIdForModal}
		bind:isOpen={documentModalOpen}
		onClose={() => closeLinkedEntityModals(false)}
		onSaved={closeLinkedEntityModals}
		onDeleted={closeLinkedEntityModals}
	/>
{/if}

<!-- Chat About Modal (Lazy Loaded) -->
{#if showChatModal && AgentChatModalComponent && entityFocus}
	{@const ChatModal = AgentChatModalComponent}
	<ChatModal isOpen={showChatModal} initialProjectFocus={entityFocus} onClose={handleChatClose} />
{/if}
