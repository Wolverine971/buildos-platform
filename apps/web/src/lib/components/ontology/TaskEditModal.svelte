<!-- apps/web/src/lib/components/ontology/TaskEditModal.svelte -->
<!--
	Task Edit Modal Component

	Provides full CRUD operations for tasks within the BuildOS ontology system:
	- Edit task details (title, description, priority, state, etc.)
	- Visualize FSM state transitions
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
	- FSM Visualizer: /apps/web/src/lib/components/ontology/FSMStateVisualizer.svelte
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Save, Loader, Trash2, FileText, ExternalLink, CheckCircle2 } from 'lucide-svelte';
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
	import FSMStateVisualizer from './FSMStateVisualizer.svelte';
	import TaskSeriesModal from './TaskSeriesModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		getTaskStateBadgeClass,
		getPriorityBadgeClass
	} from '$lib/utils/ontology-badge-styles';
	import {
		createTaskDocument,
		fetchTaskDocuments,
		promoteTaskDocument,
		type TaskWorkspaceDocument
	} from '$lib/services/ontology/task-document.service';

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

	const deliverableDocuments = $derived.by(() =>
		workspaceDocuments.filter((item) => item.edge?.props?.role !== 'scratch')
	);

	const selectedWorkspaceDoc = $derived.by(() => {
		if (!selectedWorkspaceDocId) return null;
		return workspaceDocuments.find((doc) => doc.document.id === selectedWorkspaceDocId);
	});

	const priorityLevels = [
		{
			value: 1,
			label: 'P1 • Critical',
			badgeIntent: 'urgent' as const,
			description: 'Requires immediate attention'
		},
		{
			value: 2,
			label: 'P2 • High',
			badgeIntent: 'high' as const,
			description: 'High impact deliverable'
		},
		{
			value: 3,
			label: 'P3 • Medium',
			badgeIntent: 'medium' as const,
			description: 'Balanced workload'
		},
		{
			value: 4,
			label: 'P4 • Low',
			badgeIntent: 'low' as const,
			description: 'Can be scheduled later'
		},
		{
			value: 5,
			label: 'P5 • Nice to have',
			badgeIntent: 'low' as const,
			description: 'Quality-of-life improvement'
		}
	];

	const defaultPriorityLevel = priorityLevels[2];

	const priorityDisplay = $derived.by(() => {
		const numericPriority = Number(priority);
		return (
			priorityLevels.find((level) => level.value === numericPriority) ?? defaultPriorityLevel
		);
	});

	const stateBadgeClasses = $derived(
		`px-3 py-1 rounded-full text-xs font-semibold capitalize ${getTaskStateBadgeClass(stateKey)}`
	);

	const priorityBadgeClasses = $derived(
		`px-3 py-1 rounded-full text-xs font-semibold ${getPriorityBadgeClass(priorityDisplay?.badgeIntent)}`
	);

	const selectedPlan = $derived.by(() => plans.find((plan) => plan.id === planId) ?? null);
	const selectedGoal = $derived.by(() => goals.find((goal) => goal.id === goalId) ?? null);
	const selectedMilestone = $derived.by(
		() => milestones.find((milestone) => milestone.id === milestoneId) ?? null
	);

	const milestoneDueLabel = $derived.by(() =>
		selectedMilestone?.due_at ? formatDateOnly(selectedMilestone.due_at) : null
	);

	const detailsFormId = $derived(`task-edit-${taskId}-details`);
	const formattedStateLabel = $derived(formatStateLabel(stateKey));
	const lastUpdatedLabel = $derived(
		formatTimestamp(task?.updated_at ?? task?.created_at ?? null)
	);

	// FSM related
	let allowedTransitions = $state<any[]>([]);

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
		if (taskId) {
			loadTask();
		}
	});

	$effect(() => {
		if (hasLoadedViewPreference) return;
		if (typeof window === 'undefined') return;
		const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
		if (stored === 'workspace' || stored === 'details') {
			activeView = stored;
		}
		hasLoadedViewPreference = true;
	});

	$effect(() => {
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

	function formatStateLabel(value: string): string {
		return value
			.split('_')
			.filter(Boolean)
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join(' ');
	}

	function formatTimestamp(value: string | null | undefined): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString();
	}

	function formatDateOnly(value: string | null | undefined): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString();
	}

	async function loadTask() {
		try {
			isLoading = true;
			workspaceInitialized = false;
			workspaceDocuments = [];
			selectedWorkspaceDocId = null;
			workspaceDocContent = '';

			const response = await fetch(`/api/onto/tasks/${taskId}`);
			if (!response.ok) throw new Error('Failed to load task');

			const data = await response.json();
			task = data.data?.task;

			if (task) {
				title = task.title || '';
				description = task.props?.description || '';
				priority = task.priority || 3;
				planId = task.plan_id || '';
				goalId = extractGoalIdFromProps(task.props || null);
				milestoneId = extractMilestoneIdFromProps(task.props || null);
				stateKey = task.state_key || 'todo';
				seriesActionError = '';
				showSeriesDeleteConfirm = false;
			}

			// Load FSM transitions if available
			await loadTransitions();
			await loadWorkspaceDocuments();
		} catch (err) {
			console.error('Error loading task:', err);
			error = 'Failed to load task';
		} finally {
			isLoading = false;
		}
	}

	async function loadTransitions() {
		try {
			const response = await fetch(`/api/onto/fsm/transitions?kind=task&id=${taskId}`);
			if (response.ok) {
				const data = await response.json();
				allowedTransitions =
					(data.data?.transitions || []).map((transition: any) => ({
						...transition,
						can_run:
							typeof transition?.can_run === 'boolean'
								? (transition.can_run as boolean)
								: true,
						failed_guards: Array.isArray(transition?.failed_guards)
							? transition.failed_guards
							: []
					})) ?? [];
			}
		} catch (err) {
			console.error('Error loading transitions:', err);
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

	function openWorkspaceDocumentModal(documentId: string | null = null) {
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

	async function handleStateChange(event: CustomEvent) {
		const newState = event.detail.newState;
		stateKey = newState;
		await handleSave();
		await loadTransitions();
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
</script>

<Modal
	bind:isOpen={modalOpen}
	size="xl"
	onClose={handleClose}
	closeOnEscape={!isSaving}
	title={title ? `Edit Task: ${title}` : 'Edit Task'}
>
	{#if isLoading}
		<div class="flex items-center justify-center py-16 px-6">
			<Loader class="w-8 h-8 animate-spin text-gray-400" />
		</div>
	{:else if !task}
		<div class="text-center py-12 px-6">
			<p class="text-red-600 dark:text-red-400">Task not found</p>
		</div>
	{:else}
		<div class="p-4 sm:p-6">
			<!-- Tab Navigation -->
			<div
				class="flex items-center gap-1 mb-6 p-1 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
				role="tablist"
				aria-label="Task views"
			>
				<button
					type="button"
					role="tab"
					aria-selected={activeView === 'details'}
					aria-controls="details-panel"
					tabindex={activeView === 'details' ? 0 : -1}
					class={`flex-1 px-4 py-2.5 rounded-md text-sm font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
						activeView === 'details'
							? 'bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/50 dark:to-purple-950/50 text-blue-700 dark:text-blue-300 shadow-md border border-blue-600 dark:border-blue-500'
							: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-800/50 border border-transparent'
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
					class={`flex-1 px-4 py-2.5 rounded-md text-sm font-semibold transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
						activeView === 'workspace'
							? 'bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/50 dark:to-purple-950/50 text-blue-700 dark:text-blue-300 shadow-md border border-blue-600 dark:border-blue-500'
							: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-gray-800/50 border border-transparent'
					}`}
					onclick={() => setActiveView('workspace')}
				>
					Workspace
				</button>
			</div>

			<!-- Tab Content with Horizontal Slide Animation -->
			<div class="relative overflow-hidden" style="min-height: 500px; max-height: 70vh;">
				{#key activeView}
					<div
						in:fly={{ x: slideDirection * 100, duration: 300, easing: cubicOut }}
						out:fly={{ x: slideDirection * -100, duration: 300, easing: cubicOut }}
						class="absolute inset-0 overflow-y-auto"
						role="tabpanel"
						id={activeView === 'details' ? 'details-panel' : 'workspace-panel'}
						aria-labelledby={activeView === 'details' ? 'details-tab' : 'workspace-tab'}
					>
						{#if activeView === 'details'}
							<!-- DETAILS TAB -->
							<form
								class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 h-full"
								id={detailsFormId}
								onsubmit={handleSave}
							>
								<!-- Status Overview Card -->
								<Card variant="elevated" class="lg:col-span-3">
									<CardBody padding="md">
										<div class="space-y-3">
											<!-- Badges Row -->
											<div class="flex flex-wrap items-center gap-2">
												<span class={stateBadgeClasses}
													>{formattedStateLabel}</span
												>
												<span class={priorityBadgeClasses}
													>{priorityDisplay?.label}</span
												>
												<span
													class="text-xs sm:text-sm text-gray-500 dark:text-gray-400"
												>
													{priorityDisplay?.description}
												</span>
											</div>

											<!-- Associations Row -->
											{#if selectedPlan || selectedGoal || selectedMilestone}
												<div
													class="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300"
												>
													{#if selectedPlan}
														<span
															class="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 whitespace-nowrap"
														>
															Plan • {selectedPlan.name}
														</span>
													{/if}
													{#if selectedGoal}
														<span
															class="px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 whitespace-nowrap"
														>
															Goal • {selectedGoal.name}
														</span>
													{/if}
													{#if selectedMilestone}
														<span
															class="px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 whitespace-nowrap"
														>
															Milestone • {selectedMilestone.title}
															{#if milestoneDueLabel}
																({milestoneDueLabel})
															{/if}
														</span>
													{/if}
												</div>
											{/if}

											<!-- Metadata Row -->
											<div
												class="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-3 sm:gap-4"
											>
												<span>
													Last updated {lastUpdatedLabel ??
														'Not available'}
												</span>
												<span>Type • {task.type_key || 'task.basic'}</span>
											</div>
										</div>
									</CardBody>
								</Card>

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
														<option value={plan.id}>{plan.name}</option>
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
														<option value={goal.id}>{goal.name}</option>
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

									<!-- FSM State Visualizer -->
									{#if task.type_key && allowedTransitions.length > 0}
										<div
											class="pt-4 border-t border-gray-200 dark:border-gray-700"
										>
											<FSMStateVisualizer
												entityId={taskId}
												entityKind="task"
												entityName={title}
												currentState={stateKey}
												initialTransitions={allowedTransitions}
												on:stateChange={handleStateChange}
											/>
										</div>
									{:else}
										<FormField label="State" labelFor="state" required={true}>
											<Select
												id="state"
												bind:value={stateKey}
												disabled={isSaving}
												size="md"
												placeholder="Select state"
											>
												<option value="todo">To Do</option>
												<option value="in_progress">In Progress</option>
												<option value="blocked">Blocked</option>
												<option value="done">Done</option>
												<option value="archived">Archived</option>
											</Select>
										</FormField>
									{/if}

									<!-- Connected Documents List -->
									<div class="pt-6 border-t border-gray-200 dark:border-gray-700">
										{#if deliverableDocuments.length > 0}
											<h3
												class="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2"
											>
												<FileText class="w-4 h-4 text-blue-500" />
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
															class="w-full text-left focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 rounded-lg"
															aria-label="Open {doc.document.title ||
																'Untitled Document'} in workspace"
														>
															<CardBody padding="sm">
																<div
																	class="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row"
																>
																	<div class="flex-1 min-w-0">
																		<p
																			class="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors"
																		>
																			{doc.document.title ||
																				'Untitled Document'}
																		</p>
																		<p
																			class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5"
																		>
																			{doc.document.type_key}
																		</p>
																		{#if timestamp}
																			<p
																				class="text-xs text-gray-400 dark:text-gray-500 mt-1"
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
																			class="w-4 h-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
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
															class="w-8 h-8 text-gray-400 mx-auto mb-3"
															aria-hidden="true"
														/>
														<p
															class="text-sm text-gray-600 dark:text-gray-400 mb-4"
														>
															Keep critical briefs and notes attached
															to this task so the workspace stays in
															sync.
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
											class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
										>
											<p class="text-sm text-red-700 dark:text-red-300">
												{error}
											</p>
										</div>
									{/if}
								</div>

								<!-- Sidebar (Right column) -->
								<div class="space-y-4">
									<!-- Task Metadata -->
									<Card variant="elevated">
										<CardHeader variant="default">
											<h3
												class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2"
											>
												<span class="w-1.5 h-1.5 bg-blue-500 rounded-full"
												></span>
												Task Information
											</h3>
										</CardHeader>
										<CardBody padding="sm">
											<div class="space-y-2 text-sm">
												<div class="flex justify-between items-center">
													<span class="text-gray-600 dark:text-gray-400"
														>Type:</span
													>
													<Badge variant="info" size="sm">
														{task.type_key || 'task.basic'}
													</Badge>
												</div>

												<div class="flex justify-between">
													<span class="text-gray-600 dark:text-gray-400"
														>ID:</span
													>
													<span class="font-mono text-xs text-gray-500"
														>{task.id.slice(0, 8)}...</span
													>
												</div>

												{#if task.created_at}
													<div class="flex justify-between">
														<span
															class="text-gray-600 dark:text-gray-400"
															>Created:</span
														>
														<span class="text-gray-900 dark:text-white">
															{new Date(
																task.created_at
															).toLocaleDateString()}
														</span>
													</div>
												{/if}

												{#if task.updated_at}
													<div class="flex justify-between">
														<span
															class="text-gray-600 dark:text-gray-400"
															>Updated:</span
														>
														<span class="text-gray-900 dark:text-white">
															{new Date(
																task.updated_at
															).toLocaleDateString()}
														</span>
													</div>
												{/if}
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
													<p class="text-indigo-900 dark:text-indigo-100">
														This task controls a recurring series.
													</p>
													<ul
														class="text-indigo-800 dark:text-indigo-100 space-y-1"
													>
														{#if seriesId}
															<li>
																<span class="font-medium"
																	>Series ID:</span
																>
																<span
																	class="font-mono text-xs break-all"
																	>{seriesId}</span
																>
															</li>
														{/if}
														<li>
															<span class="font-medium"
																>Timezone:</span
															>
															{seriesMeta.timezone}
														</li>
														{#if seriesMeta.rrule}
															<li class="break-all">
																<span class="font-medium"
																	>RRULE:</span
																>
																{seriesMeta.rrule}
															</li>
														{/if}
														{#if seriesMeta.instance_count}
															<li>
																<span class="font-medium"
																	>Instances:</span
																>
																{seriesMeta.instance_count}
															</li>
														{/if}
													</ul>
												</div>

												{#if seriesActionError}
													<p
														class="text-sm text-red-600 dark:text-red-400"
													>
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
													<div class="space-y-2">
														<p
															class="text-sm text-indigo-900 dark:text-indigo-100"
														>
															Delete this series? Completed instances
															remain unless you force delete.
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
												<p
													class="text-sm text-indigo-900 dark:text-indigo-100"
												>
													This task is part of a recurring series
													{#if seriesMeta.master_task_id}
														(master task: {seriesMeta.master_task_id})
													{/if}
													. Manage recurrence from the series master.
												</p>
											{:else}
												<p
													class="text-sm text-indigo-900 dark:text-indigo-100"
												>
													Automatically create future instances on a
													schedule.
												</p>
												<Button
													size="sm"
													variant="secondary"
													class="w-full"
													onclick={() => (showSeriesModal = true)}
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
													class="w-5 h-5 text-blue-500 shrink-0 hidden sm:block"
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
															selectWorkspaceDocument(String(val))}
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
																		'Untitled'} ({doc.document
																		.state_key})
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
													class="w-12 h-12 text-gray-400 mx-auto mb-3"
													aria-hidden="true"
												/>
												<p class="text-gray-600 dark:text-gray-400 mb-4">
													No document selected. Create one to get started.
												</p>
												<Button
													size="sm"
													variant="primary"
													onclick={() => openWorkspaceDocumentModal(null)}
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

	<!-- Footer Actions -->
	<svelte:fragment slot="footer">
		<div
			class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/50 dark:to-gray-800/50"
		>
			{#if activeView === 'details'}
				<!-- Delete button on the left -->
				<Button
					type="button"
					variant="danger"
					size="sm"
					onclick={() => (showDeleteConfirm = true)}
					disabled={isDeleting || isSaving}
					class="w-full sm:w-auto"
				>
					{#if isDeleting}
						<Loader class="w-4 h-4 animate-spin" />
						Deleting...
					{:else}
						<Trash2 class="w-4 h-4" />
						Delete Task
					{/if}
				</Button>

				<!-- Cancel and Save buttons on the right -->
				<div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving || isDeleting}
						class="w-full sm:w-auto"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form={detailsFormId}
						variant="primary"
						size="sm"
						disabled={isSaving || isDeleting || !title.trim()}
						class="w-full sm:w-auto"
					>
						{#if isSaving}
							<Loader class="w-4 h-4 animate-spin" />
							Saving...
						{:else}
							<Save class="w-4 h-4" />
							Save Changes
						{/if}
					</Button>
				</div>
			{:else}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => setActiveView('details')}
					class="w-full sm:w-auto"
				>
					← Back to Details
				</Button>
				<div
					class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto"
				>
					{#if selectedWorkspaceDoc && !selectedWorkspaceDoc.edge?.props?.handed_off}
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onclick={() => handlePromoteWorkspaceDocument(selectedWorkspaceDocId!)}
							class="w-full sm:w-auto"
						>
							<CheckCircle2 class="w-4 h-4" />
							<span class="hidden sm:inline">Promote to Project</span>
							<span class="sm:hidden">Promote</span>
						</Button>
					{/if}
					<Button
						type="button"
						variant="primary"
						size="sm"
						onclick={saveWorkspaceDocument}
						disabled={workspaceDocSaving || !selectedWorkspaceDocId}
						class="w-full sm:w-auto"
					>
						{#if workspaceDocSaving}
							<Loader class="w-4 h-4 animate-spin" />
							Saving...
						{:else}
							<Save class="w-4 h-4" />
							Save Document
						{/if}
					</Button>
				</div>
			{/if}
		</div>
	</svelte:fragment>
</Modal>

{#if task}
	<TaskSeriesModal
		{task}
		bind:isOpen={showSeriesModal}
		onClose={() => (showSeriesModal = false)}
		onSuccess={handleSeriesCreated}
	/>
{/if}

{#if task}
	<DocumentModal
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
		<p class="text-sm text-gray-600 dark:text-gray-300" slot="content">
			This action cannot be undone. The task and all its data will be permanently deleted.
		</p>
	</ConfirmationModal>
{/if}
