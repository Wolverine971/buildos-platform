<!-- apps/web/src/lib/components/ontology/TaskEditModal.svelte -->
<!--
	Task Edit Modal Component

	Provides full CRUD operations for tasks within the BuildOS ontology system:
	- Edit task details (title, description, priority, state, etc.)
	- Select task state from enum dropdown
	- Workspace with RichMarkdownEditor for document editing
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
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import {
		Save,
		Loader,
		Trash2,
		FileText,
		ExternalLink,
		CircleCheck,
		ListChecks
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import LinkedEntities from './linked-entities/LinkedEntities.svelte';
	import { TASK_STATES } from '$lib/types/onto';
	import type { EntityKind } from './linked-entities/linked-entities.types';
	import type { ComponentType } from 'svelte';

	// Lazy-loaded modal components for better initial load performance
	let TaskSeriesModalComponent = $state<ComponentType<any> | null>(null);
	let DocumentModalComponent = $state<ComponentType<any> | null>(null);
	let GoalEditModalComponent = $state<ComponentType<any> | null>(null);
	let PlanEditModalComponent = $state<ComponentType<any> | null>(null);
	let TaskEditModalSelfComponent = $state<ComponentType<any> | null>(null);

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

	async function loadTaskEditModalSelf() {
		if (!TaskEditModalSelfComponent) {
			const mod = await import('./TaskEditModal.svelte');
			TaskEditModalSelfComponent = mod.default;
		}
		return TaskEditModalSelfComponent;
	}

	// Linked entities types are imported from linked-entities component
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		fetchTaskDocuments,
		promoteTaskDocument,
		type TaskWorkspaceDocument
	} from '$lib/services/ontology/task-document.service';
	import { format } from 'date-fns';

	interface Props {
		taskId: string;
		projectId: string;
		plans?: Array<{ id: string; name: string }>;
		goals?: Array<{ id: string; name: string }>;
		milestones?: Array<{ id: string; title: string; due_at?: string }>;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let {
		taskId,
		projectId,
		plans = [],
		goals = [],
		milestones = [],
		onClose,
		onUpdated,
		onDeleted
	}: Props = $props();

	let modalOpen = $state(true);
	let task = $state<any>(null);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let showDeleteConfirm = $state(false);

	// Form fields
	let title = $state('');
	let description = $state('');
	let priority = $state<number>(3);
	let planId = $state('');
	let goalId = $state('');
	let milestoneId = $state('');
	let stateKey = $state('todo');
	let dueAt = $state('');
	let showSeriesModal = $state(false);
	let showSeriesDeleteConfirm = $state(false);
	let isDeletingSeries = $state(false);
	let seriesActionError = $state('');

	// View state with horizontal slide animation
	const VIEW_STORAGE_KEY = 'task_edit_modal_view';
	let hasLoadedViewPreference = $state(false);
	let activeView = $state<'details' | 'workspace'>('details');
	let slideDirection = $state<1 | -1>(1); // 1 = slide left, -1 = slide right

	// Workspace state
	let workspaceDocuments = $state<TaskWorkspaceDocument[]>([]);
	let workspaceLoading = $state(false);
	let workspaceError = $state('');
	let workspaceInitialized = $state(false);
	let selectedWorkspaceDocId = $state<string | null>(null);
	let workspaceDocContent = $state('');
	let workspaceDocSaving = $state(false);

	let workspaceDocumentModalOpen = $state(false);
	let workspaceDocumentId = $state<string | null>(null);

	// Note: LinkedEntities component fetches its own data

	// Modal states for linked entity navigation
	let showGoalModal = $state(false);
	let selectedGoalIdForModal = $state<string | null>(null);
	let showPlanModal = $state(false);
	let selectedPlanIdForModal = $state<string | null>(null);
	let showLinkedTaskModal = $state(false);
	let selectedLinkedTaskId = $state<string | null>(null);

	const deliverableDocuments = $derived.by(() =>
		workspaceDocuments.filter((item) => item.edge?.props?.role !== 'scratch')
	);

	const selectedWorkspaceDoc = $derived.by(() => {
		if (!selectedWorkspaceDocId) return null;
		return workspaceDocuments.find((doc) => doc.document.id === selectedWorkspaceDocId);
	});

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

	// Load task data when modal opens
	$effect(() => {
		if (!browser) return;
		if (taskId) {
			loadTask();
		}
	});

	$effect(() => {
		if (!browser) return;
		if (hasLoadedViewPreference) return;
		const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
		if (stored === 'workspace' || stored === 'details') {
			activeView = stored;
		}
		hasLoadedViewPreference = true;
	});

	// Deferred loading: Only load workspace documents when user switches to workspace tab
	$effect(() => {
		if (!browser) return;
		if (activeView === 'workspace' && !workspaceInitialized && task) {
			loadWorkspaceDocuments();
		}
	});

	onDestroy(() => {
		// Cleanup
	});

	function extractGoalIdFromProps(props: Record<string, unknown> | null | undefined): string {
		if (!props || typeof props !== 'object') return '';
		const goalIdProp = (props as Record<string, unknown>).goal_id;
		if (typeof goalIdProp === 'string' && goalIdProp.trim().length > 0) {
			return goalIdProp;
		}
		const sourceGoalId = (props as Record<string, unknown>).source_goal_id;
		if (typeof sourceGoalId === 'string' && sourceGoalId.trim().length > 0) {
			return sourceGoalId;
		}
		return '';
	}

	function extractMilestoneIdFromProps(
		props: Record<string, unknown> | null | undefined
	): string {
		if (!props || typeof props !== 'object') return '';
		const milestoneId = (props as Record<string, unknown>).supporting_milestone_id;
		return typeof milestoneId === 'string' && milestoneId.trim().length > 0 ? milestoneId : '';
	}

	function formatTimestamp(value: string | null | undefined): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString();
	}

	function formatDateTimeForInput(date: Date | string | null): string {
		if (!date) return '';
		try {
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			if (isNaN(dateObj.getTime())) return '';
			// Format for HTML datetime-local input
			return format(dateObj, "yyyy-MM-dd'T'HH:mm");
		} catch (error) {
			console.warn('Failed to format datetime for input:', date, error);
			return '';
		}
	}

	function parseDateTimeFromInput(value: string): string | null {
		if (!value) return null;
		try {
			// The datetime-local input gives us a value in local time
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;
			// Convert to ISO string for storage (UTC)
			return date.toISOString();
		} catch (error) {
			console.warn('Failed to parse datetime from input:', value, error);
			return null;
		}
	}

	async function loadTask() {
		try {
			isLoading = true;
			workspaceInitialized = false;
			workspaceDocuments = [];
			selectedWorkspaceDocId = null;
			workspaceDocContent = '';

			// Use combined endpoint for optimal loading (task + transitions in one request)
			// Workspace documents are deferred until user switches to workspace tab
			const response = await fetch(`/api/onto/tasks/${taskId}/full`);

			if (!response.ok) throw new Error('Failed to load task');

			const data = await response.json();
			task = data.data?.task;

			if (task) {
				title = task.title || '';
				description = task.props?.description || '';
				priority = task.priority || 3;
				// Plan is now fetched via edge relationship, returned as task.plan object
				planId = task.plan?.id || '';
				goalId = extractGoalIdFromProps(task.props || null);
				milestoneId = extractMilestoneIdFromProps(task.props || null);
				stateKey = task.state_key || 'todo';
				dueAt = task.due_at ? formatDateTimeForInput(task.due_at) : '';
				seriesActionError = '';
				showSeriesDeleteConfirm = false;
			}
		} catch (err) {
			console.error('Error loading task:', err);
			error = 'Failed to load task';
		} finally {
			isLoading = false;
		}
	}

	function setActiveView(view: 'details' | 'workspace', documentId?: string) {
		// Determine slide direction
		slideDirection = view === 'workspace' ? 1 : -1;

		activeView = view;
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(VIEW_STORAGE_KEY, view);
		}

		if (view === 'workspace') {
			if (!workspaceInitialized) {
				loadWorkspaceDocuments();
			}
			// If documentId provided, select it
			if (documentId) {
				selectWorkspaceDocument(documentId);
			}
		}
	}

	function selectWorkspaceDocument(documentId: string) {
		selectedWorkspaceDocId = documentId;
		const doc = workspaceDocuments.find((d) => d.document.id === documentId);
		if (doc) {
			workspaceDocContent = (doc.document?.props?.body_markdown as string) ?? '';
		}
	}

	function handleDocumentClick(documentId: string) {
		setActiveView('workspace', documentId);
	}

	async function saveWorkspaceDocument() {
		if (!selectedWorkspaceDocId) return;

		try {
			workspaceDocSaving = true;

			const response = await fetch(`/api/onto/documents/${selectedWorkspaceDocId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					body_markdown: workspaceDocContent
				})
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				throw new Error(payload?.error || 'Failed to save document');
			}

			// Update local cache
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

	async function loadWorkspaceDocuments() {
		if (!taskId) return;
		try {
			workspaceLoading = true;
			workspaceError = '';
			const result = await fetchTaskDocuments(taskId);
			workspaceDocuments = result.documents ?? [];

			// Auto-select first deliverable document if none selected
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

	async function openWorkspaceDocumentModal(documentId: string | null = null) {
		await loadDocumentModal();
		workspaceDocumentId = documentId;
		workspaceDocumentModalOpen = true;
	}

	async function handleWorkspaceDocumentSaved() {
		workspaceDocumentModalOpen = false;
		await loadWorkspaceDocuments();
	}

	async function handleWorkspaceDocumentDeleted() {
		workspaceDocumentModalOpen = false;
		await loadWorkspaceDocuments();
	}

	async function handlePromoteWorkspaceDocument(documentId: string) {
		try {
			await promoteTaskDocument(taskId, documentId, { target_state: 'ready' });
			toastService.success('Document promoted to project');
			await loadWorkspaceDocuments();
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to promote document';
			toastService.error(message);
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
				plan_id: planId || null,
				state_key: stateKey,
				due_at: parseDateTimeFromInput(dueAt),
				goal_id: goalId?.trim() || null,
				supporting_milestone_id: milestoneId?.trim() || null
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

			// Success! Call the callback and close
			if (onUpdated) {
				onUpdated();
			}
			onClose();
		} catch (err) {
			console.error('Error updating task:', err);
			error = err instanceof Error ? err.message : 'Failed to update task';
			isSaving = false;
		}
	}

	async function handleDelete() {
		isDeleting = true;
		error = '';

		try {
			const response = await fetch(`/api/onto/tasks/${taskId}`, {
				method: 'DELETE'
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete task');
			}

			// Success! Call the callback and close
			if (onDeleted) {
				onDeleted();
			}
			onClose();
		} catch (err) {
			console.error('Error deleting task:', err);
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
		workspaceDocumentId = id;
		workspaceDocumentModalOpen = true;
	}

	async function openLinkedTaskModal(id: string) {
		await loadTaskEditModalSelf();
		selectedLinkedTaskId = id;
		showLinkedTaskModal = true;
	}

	function handleLinkedEntityModalClose() {
		showGoalModal = false;
		showPlanModal = false;
		showLinkedTaskModal = false;
		selectedGoalIdForModal = null;
		selectedPlanIdForModal = null;
		selectedLinkedTaskId = null;
		// Refresh task data to get updated linked entities
		loadTask();
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
			// milestone and output don't have edit modals yet, could add later
			default:
				console.log(`No modal handler for entity kind: ${kind}`);
		}
	}
</script>

<Modal
	bind:isOpen={modalOpen}
	size="xl"
	onClose={handleClose}
	closeOnEscape={!isSaving}
	showCloseButton={false}
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="p-1.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0"
				>
					<ListChecks class="w-4 h-4" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || task?.title || 'Task'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
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
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				class="text-muted-foreground hover:text-foreground shrink-0 !p-1 sm:!p-1.5"
				disabled={isSaving || isDeleting}
			>
				<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</Button>
		</div>
	{/snippet}

	{#snippet children()}
		{#if isLoading}
			<div class="flex items-center justify-center py-16 px-6">
				<Loader class="w-8 h-8 animate-spin text-muted-foreground" />
			</div>
		{:else if !task}
			<div class="text-center py-12 px-6">
				<p class="text-destructive">Task not found</p>
			</div>
		{:else}
			<div class="px-3 py-3 sm:px-6 sm:py-6">
				<!-- Tab Navigation - Pill Toggle -->
				<div
					class="inline-flex rounded-lg border border-border bg-muted/50 p-1 text-sm font-bold mb-6 shadow-ink"
					role="tablist"
					aria-label="Task views"
				>
					<button
						type="button"
						role="tab"
						aria-selected={activeView === 'details'}
						aria-controls="details-panel"
						tabindex={activeView === 'details' ? 0 : -1}
						class={`relative rounded px-4 py-2 transition pressable ${
							activeView === 'details'
								? 'bg-accent text-accent-foreground shadow-ink'
								: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
						}`}
						onclick={() => setActiveView('details')}
					>
						Details
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeView === 'workspace'}
						aria-controls="workspace-panel"
						tabindex={activeView === 'workspace' ? 0 : -1}
						class={`relative rounded px-4 py-2 transition pressable ${
							activeView === 'workspace'
								? 'bg-accent text-accent-foreground shadow-ink'
								: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
						}`}
						onclick={() => setActiveView('workspace')}
					>
						Workspace
					</button>
				</div>

				<!-- Tab Content with Horizontal Slide Animation -->
				<div class="relative" style="min-height: 400px;">
					{#key activeView}
						<div
							in:fly={{ x: slideDirection * 100, duration: 300, easing: cubicOut }}
							out:fly={{ x: slideDirection * -100, duration: 300, easing: cubicOut }}
							class="w-full"
							role="tabpanel"
							id={activeView === 'details' ? 'details-panel' : 'workspace-panel'}
							aria-labelledby={activeView === 'details'
								? 'details-tab'
								: 'workspace-tab'}
						>
							{#if activeView === 'details'}
								<!-- DETAILS TAB -->
								<form
									class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 p-2"
									id={detailsFormId}
									onsubmit={handleSave}
								>
									<!-- Main Form (Left 2 columns) -->
									<div class="lg:col-span-2 space-y-6">
										<!-- Task Title -->
										<FormField
											label="Task Title"
											labelFor="title"
											required={true}
											error={!title.trim() && error
												? 'Task title is required'
												: ''}
										>
											<TextInput
												id="title"
												bind:value={title}
												inputmode="text"
												enterkeyhint="next"
												placeholder="Enter task title..."
												required={true}
												disabled={isSaving}
												error={!title.trim() && error ? true : false}
												size="md"
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
												placeholder="Describe the task..."
												rows={4}
												disabled={isSaving}
												size="md"
											/>
										</FormField>

										<!-- Priority & Plan Grid -->
										<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
											<FormField
												label="Priority"
												labelFor="priority"
												required={true}
											>
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

											{#if plans.length > 0}
												<FormField
													label="Plan"
													labelFor="plan"
													hint="Optional project plan"
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
															<option value={plan.id}
																>{plan.name}</option
															>
														{/each}
													</Select>
												</FormField>
											{/if}

											{#if goals.length > 0}
												<FormField
													label="Goal"
													labelFor="goal"
													hint="Link to a project goal"
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
															<option value={goal.id}
																>{goal.name}</option
															>
														{/each}
													</Select>
												</FormField>
											{/if}

											{#if milestones.length > 0}
												<FormField
													label="Supporting Milestone"
													labelFor="milestone"
													hint="Connect to a milestone"
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

										<!-- Task State -->
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

										<!-- Connected Documents List -->
										<div class="pt-6 border-t border-border">
											{#if deliverableDocuments.length > 0}
												<h3
													class="text-sm font-semibold text-foreground mb-4 flex items-center gap-2"
												>
													<FileText class="w-4 h-4 text-accent" />
													Connected Documents
													<Badge variant="info" size="sm">
														{deliverableDocuments.length}
													</Badge>
												</h3>
												<div
													class="space-y-2 max-h-64 overflow-y-auto"
													role="list"
													aria-label="Connected documents"
												>
													{#each deliverableDocuments as doc}
														{@const timestamp = formatTimestamp(
															doc.document.updated_at ??
																doc.document.created_at ??
																null
														)}
														<Card
															variant="interactive"
															class="group"
															role="listitem"
														>
															<button
																type="button"
																onclick={() =>
																	handleDocumentClick(
																		doc.document.id
																	)}
																class="w-full text-left focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded"
																aria-label="Open {doc.document
																	.title ||
																	'Untitled Document'} in workspace"
															>
																<CardBody padding="sm">
																	<div
																		class="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row"
																	>
																		<div class="flex-1 min-w-0">
																			<p
																				class="font-semibold text-sm sm:text-base text-foreground truncate group-hover:text-accent transition-colors"
																			>
																				{doc.document
																					.title ||
																					'Untitled Document'}
																			</p>
																			<p
																				class="text-xs text-muted-foreground truncate mt-0.5"
																			>
																				{doc.document
																					.type_key}
																			</p>
																			{#if timestamp}
																				<p
																					class="text-xs text-muted-foreground/70 mt-1"
																				>
																					Updated {timestamp}
																				</p>
																			{/if}
																		</div>
																		<div
																			class="flex items-center gap-2 shrink-0"
																		>
																			<Badge
																				variant="info"
																				size="sm"
																			>
																				{doc.document
																					.state_key ||
																					'draft'}
																			</Badge>
																			<ExternalLink
																				class="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors"
																				aria-hidden="true"
																			/>
																		</div>
																	</div>
																</CardBody>
															</button>
														</Card>
													{/each}
												</div>
											{:else}
												<Card variant="outline" class="border-dashed">
													<CardBody padding="lg">
														<div class="text-center">
															<FileText
																class="w-8 h-8 text-muted-foreground mx-auto mb-3"
																aria-hidden="true"
															/>
															<p
																class="text-sm text-muted-foreground mb-4"
															>
																Keep critical briefs and notes
																attached to this task so the
																workspace stays in sync.
															</p>
															<div
																class="flex flex-col sm:flex-row gap-2 justify-center"
															>
																<Button
																	type="button"
																	variant="secondary"
																	size="sm"
																	onclick={() =>
																		setActiveView('workspace')}
																>
																	Open workspace
																</Button>
																<Button
																	type="button"
																	variant="primary"
																	size="sm"
																	onclick={() =>
																		openWorkspaceDocumentModal(
																			null
																		)}
																>
																	Create document
																</Button>
															</div>
														</div>
													</CardBody>
												</Card>
											{/if}
										</div>

										{#if error}
											<div
												class="p-3 bg-destructive/10 border border-destructive/30 rounded-lg tx tx-static tx-weak"
											>
												<p class="text-sm text-destructive">
													{error}
												</p>
											</div>
										{/if}
									</div>

									<!-- Sidebar (Right column) -->
									<div class="space-y-4">
										<!-- Linked Entities -->
										<LinkedEntities
											sourceId={taskId}
											sourceKind="task"
											projectId={task.project_id}
											onEntityClick={handleLinkedEntityClick}
											onLinksChanged={loadTask}
										/>

										<!-- Schedule -->
										<Card variant="elevated">
											<CardHeader variant="accent">
												<h3
													class="text-xs font-semibold uppercase tracking-wide flex items-center gap-2"
												>
													<span class="text-base">📅</span>
													{#if !dueAt}Schedule?
													{:else}Scheduled
													{/if}
												</h3>
											</CardHeader>
											<CardBody padding="sm">
												<div class="space-y-3">
													<div>
														<label
															for="sidebar-due-date"
															class="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5"
														>
															Due Date
														</label>
														<TextInput
															id="sidebar-due-date"
															type="datetime-local"
															inputmode="numeric"
															enterkeyhint="done"
															bind:value={dueAt}
															disabled={isSaving}
															size="sm"
															class="border-border bg-card focus:ring-2 focus:ring-accent w-full"
														/>
														{#if dueAt}
															<p
																class="mt-1.5 text-xs text-muted-foreground"
															>
																{new Date(dueAt).toLocaleString(
																	'en-US',
																	{
																		weekday: 'short',
																		month: 'short',
																		day: 'numeric',
																		hour: 'numeric',
																		minute: '2-digit'
																	}
																)}
															</p>
														{:else}
															<p
																class="mt-1.5 text-xs text-muted-foreground italic"
															>
																No deadline set
															</p>
														{/if}
													</div>
												</div>
											</CardBody>
										</Card>

										<!-- Recurrence -->
										<Card variant="elevated">
											<CardHeader variant="accent">
												<h3
													class="text-xs font-semibold uppercase tracking-wide flex items-center gap-2"
												>
													<span class="text-base">🔄</span>
													Recurrence
												</h3>
											</CardHeader>
											<CardBody padding="sm">
												{#if isSeriesMaster && seriesMeta}
													<div class="space-y-2 text-sm">
														<p class="text-foreground">
															This task controls a recurring series.
														</p>
														<ul class="text-muted-foreground space-y-1">
															{#if seriesId}
																<li>
																	<span
																		class="font-medium text-foreground"
																		>Series ID:</span
																	>
																	<span
																		class="font-mono text-xs break-all"
																		>{seriesId}</span
																	>
																</li>
															{/if}
															<li>
																<span
																	class="font-medium text-foreground"
																	>Timezone:</span
																>
																{seriesMeta.timezone}
															</li>
															{#if seriesMeta.rrule}
																<li class="break-all">
																	<span
																		class="font-medium text-foreground"
																		>RRULE:</span
																	>
																	{seriesMeta.rrule}
																</li>
															{/if}
															{#if seriesMeta.instance_count}
																<li>
																	<span
																		class="font-medium text-foreground"
																		>Instances:</span
																	>
																	{seriesMeta.instance_count}
																</li>
															{/if}
														</ul>
													</div>

													{#if seriesActionError}
														<p class="text-sm text-destructive">
															{seriesActionError}
														</p>
													{/if}

													{#if !showSeriesDeleteConfirm}
														<Button
															size="sm"
															variant="danger"
															class="w-full mt-3"
															onclick={() =>
																(showSeriesDeleteConfirm = true)}
														>
															Delete Series
														</Button>
													{:else}
														<div class="space-y-2 mt-3">
															<p
																class="text-sm text-muted-foreground"
															>
																Delete this series? Completed
																instances remain unless you force
																delete.
															</p>
															<div class="flex flex-col gap-2">
																<Button
																	variant="danger"
																	size="sm"
																	disabled={isDeletingSeries}
																	onclick={() =>
																		handleDeleteSeries(false)}
																>
																	{#if isDeletingSeries}
																		<Loader
																			class="w-4 h-4 animate-spin"
																		/>
																		Removing…
																	{:else}
																		Delete Upcoming Only
																	{/if}
																</Button>
																<Button
																	variant="danger"
																	size="sm"
																	disabled={isDeletingSeries}
																	onclick={() =>
																		handleDeleteSeries(true)}
																>
																	{#if isDeletingSeries}
																		<Loader
																			class="w-4 h-4 animate-spin"
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
														</div>
													{/if}
												{:else if isSeriesInstance && seriesMeta}
													<p class="text-sm text-muted-foreground">
														This task is part of a recurring series
														{#if seriesMeta.master_task_id}
															(master task: {seriesMeta.master_task_id})
														{/if}
														. Manage recurrence from the series master.
													</p>
												{:else}
													<p class="text-sm text-muted-foreground mb-3">
														Automatically create future instances on a
														schedule.
													</p>
													<Button
														size="sm"
														variant="secondary"
														class="w-full"
														onclick={openSeriesModal}
													>
														Make Recurring
													</Button>
												{/if}
											</CardBody>
										</Card>
									</div>
								</form>
							{:else}
								<!-- WORKSPACE TAB -->
								<div class="h-full flex flex-col space-y-4 overflow-y-auto">
									<!-- Document Selector -->
									<Card variant="elevated">
										<CardBody padding="md">
											<div
												class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4"
											>
												<div class="flex items-center gap-3 flex-1 min-w-0">
													<FileText
														class="w-5 h-5 text-accent shrink-0 hidden sm:block"
														aria-hidden="true"
													/>
													<div class="flex-1 min-w-0">
														<label
															for="workspace-doc-selector"
															class="sr-only"
														>
															Select document
														</label>
														<Select
															id="workspace-doc-selector"
															value={selectedWorkspaceDocId || ''}
															onchange={(val) =>
																selectWorkspaceDocument(
																	String(val)
																)}
															size={{ base: 'sm', md: 'md' }}
														>
															{#if deliverableDocuments.length === 0}
																<option value=""
																	>No documents yet</option
																>
															{:else}
																{#each deliverableDocuments as doc}
																	<option value={doc.document.id}>
																		{doc.document.title ||
																			'Untitled'} ({doc
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
													onclick={() => openWorkspaceDocumentModal(null)}
													class="w-full sm:w-auto"
												>
													+ New Document
												</Button>
											</div>
										</CardBody>
									</Card>

									<!-- RichMarkdownEditor -->
									{#if selectedWorkspaceDoc}
										<Card variant="elevated">
											<CardBody padding="md">
												<RichMarkdownEditor
													bind:value={workspaceDocContent}
													rows={18}
													maxLength={20000}
													size="base"
													label="Document Content"
													helpText="Full markdown support with live preview"
												/>
											</CardBody>
										</Card>
									{:else}
										<Card variant="outline" class="border-dashed">
											<CardBody padding="lg">
												<div class="text-center">
													<FileText
														class="w-12 h-12 text-muted-foreground mx-auto mb-3"
														aria-hidden="true"
													/>
													<p class="text-muted-foreground mb-4">
														No document selected. Create one to get
														started.
													</p>
													<Button
														size="sm"
														variant="primary"
														onclick={() =>
															openWorkspaceDocumentModal(null)}
													>
														Create Document
													</Button>
												</div>
											</CardBody>
										</Card>
									{/if}
								</div>
							{/if}
						</div>
					{/key}
				</div>
			</div>
		{/if}
	{/snippet}

	<!-- Footer Actions - buttons on one row, smaller on mobile -->
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-4 p-2 sm:p-4 border-t border-border bg-muted/50"
		>
			{#if activeView === 'details'}
				<!-- Danger zone inline on mobile -->
				<div class="flex items-center gap-1.5 sm:gap-2">
					<Trash2 class="w-3 h-3 sm:w-4 sm:h-4 text-red-500 shrink-0" />
					<Button
						type="button"
						variant="danger"
						size="sm"
						onclick={() => (showDeleteConfirm = true)}
						disabled={isDeleting || isSaving}
						class="text-[10px] sm:text-xs px-2 py-1 sm:px-3 sm:py-1.5"
					>
						<span class="hidden sm:inline">Delete</span>
						<span class="sm:hidden">Del</span>
					</Button>
				</div>

				<!-- Cancel and Save buttons on the right -->
				<div class="flex flex-row items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving || isDeleting}
						class="text-xs sm:text-sm px-2 sm:px-4"
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
						class="text-xs sm:text-sm px-2 sm:px-4"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Save</span>
						<span class="sm:hidden">Save</span>
					</Button>
				</div>
			{:else}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => setActiveView('details')}
					class="text-xs sm:text-sm px-2 sm:px-4"
				>
					<span class="hidden sm:inline">← Details</span>
					<span class="sm:hidden">←</span>
				</Button>
				<div class="flex flex-row items-center gap-2">
					{#if selectedWorkspaceDoc && !selectedWorkspaceDoc.edge?.props?.handed_off}
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onclick={() => handlePromoteWorkspaceDocument(selectedWorkspaceDocId!)}
							class="text-[10px] sm:text-xs px-2 py-1 sm:px-3"
						>
							<CircleCheck class="w-3 h-3 sm:w-4 sm:h-4" />
							<span class="hidden sm:inline">Promote</span>
						</Button>
					{/if}
					<Button
						type="button"
						variant="primary"
						size="sm"
						onclick={saveWorkspaceDocument}
						loading={workspaceDocSaving}
						disabled={workspaceDocSaving || !selectedWorkspaceDocId}
						class="text-xs sm:text-sm px-2 sm:px-4"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Save Doc</span>
						<span class="sm:hidden">Save</span>
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>

{#if task && showSeriesModal && TaskSeriesModalComponent}
	<svelte:component
		this={TaskSeriesModalComponent}
		{task}
		bind:isOpen={showSeriesModal}
		onClose={() => (showSeriesModal = false)}
		onSuccess={handleSeriesCreated}
	/>
{/if}

{#if task && workspaceDocumentModalOpen && DocumentModalComponent}
	<svelte:component
		this={DocumentModalComponent}
		projectId={task.project_id}
		taskId={task.id}
		bind:isOpen={workspaceDocumentModalOpen}
		documentId={workspaceDocumentId}
		onClose={() => (workspaceDocumentModalOpen = false)}
		onSaved={handleWorkspaceDocumentSaved}
		onDeleted={handleWorkspaceDocumentDeleted}
	/>
{/if}

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
				This action cannot be undone. The task and all its data will be permanently deleted.
			</p>
		{/snippet}
	</ConfirmationModal>
{/if}

<!-- Linked Entity Modals (Lazy Loaded) -->
{#if showGoalModal && selectedGoalIdForModal && GoalEditModalComponent}
	<svelte:component
		this={GoalEditModalComponent}
		goalId={selectedGoalIdForModal}
		{projectId}
		onClose={handleLinkedEntityModalClose}
		onUpdated={handleLinkedEntityModalClose}
		onDeleted={handleLinkedEntityModalClose}
	/>
{/if}

{#if showPlanModal && selectedPlanIdForModal && PlanEditModalComponent}
	<svelte:component
		this={PlanEditModalComponent}
		planId={selectedPlanIdForModal}
		{projectId}
		onClose={handleLinkedEntityModalClose}
		onUpdated={handleLinkedEntityModalClose}
		onDeleted={handleLinkedEntityModalClose}
	/>
{/if}

{#if showLinkedTaskModal && selectedLinkedTaskId && TaskEditModalSelfComponent}
	<svelte:component
		this={TaskEditModalSelfComponent}
		taskId={selectedLinkedTaskId}
		{projectId}
		{plans}
		{goals}
		{milestones}
		onClose={handleLinkedEntityModalClose}
		onUpdated={handleLinkedEntityModalClose}
		onDeleted={handleLinkedEntityModalClose}
	/>
{/if}
