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
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import FSMStateVisualizer from './FSMStateVisualizer.svelte';
	import TaskSeriesModal from './TaskSeriesModal.svelte';
	import DocumentModal from './DocumentModal.svelte';
	import RichMarkdownEditor from '$lib/components/ui/RichMarkdownEditor.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { toastService } from '$lib/stores/toast.store';
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
		loadTask();
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
				allowedTransitions = data.data?.transitions || [];
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
				priority,
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
	title="Edit Task"
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
		<div class="px-4 sm:px-6 py-4">
			<!-- Tab Navigation -->
			<div
				class="flex items-center gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg"
				role="tablist"
				aria-label="Task views"
			>
				<button
					type="button"
					class={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
						activeView === 'details'
							? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
							: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
					}`}
					aria-pressed={activeView === 'details'}
					onclick={() => setActiveView('details')}
				>
					Details
				</button>
				<button
					type="button"
					class={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
						activeView === 'workspace'
							? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
							: 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
					}`}
					aria-pressed={activeView === 'workspace'}
					onclick={() => setActiveView('workspace')}
				>
					Workspace
				</button>
			</div>

			<!-- Tab Content with Horizontal Slide Animation -->
			<div class="relative overflow-hidden min-h-[500px]">
				{#key activeView}
					<div
						in:fly={{ x: slideDirection * 100, duration: 300, easing: cubicOut }}
						out:fly={{ x: slideDirection * -100, duration: 300, easing: cubicOut }}
						class="absolute inset-0"
					>
						{#if activeView === 'details'}
							<!-- DETAILS TAB -->
							<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 h-full">
								<!-- Main Form (Left 2 columns) -->
								<div class="lg:col-span-2 space-y-5">
									<!-- Task Title -->
									<div>
										<label
											for="title"
											class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
										>
											Task Title
										</label>
										<input
											type="text"
											id="title"
											bind:value={title}
											placeholder="Enter task title..."
											required
											disabled={isSaving}
											class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
										/>
									</div>

									<!-- Description -->
									<div>
										<label
											for="description"
											class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
										>
											Description
										</label>
										<textarea
											id="description"
											bind:value={description}
											placeholder="Describe the task..."
											rows={4}
											disabled={isSaving}
											class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none"
										></textarea>
									</div>

									<!-- Priority & Plan Grid -->
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div>
											<label
												for="priority"
												class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
											>
												Priority
											</label>
											<select
												id="priority"
												bind:value={priority}
												disabled={isSaving}
												class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											>
												<option value={1}>P1 - Critical</option>
												<option value={2}>P2 - High</option>
												<option value={3}>P3 - Medium</option>
												<option value={4}>P4 - Low</option>
												<option value={5}>P5 - Nice to have</option>
											</select>
										</div>

										{#if plans.length > 0}
											<div>
												<label
													for="plan"
													class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
												>
													Plan
												</label>
												<select
													id="plan"
													bind:value={planId}
													disabled={isSaving}
													class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
												>
													<option value="">No plan</option>
													{#each plans as plan}
														<option value={plan.id}>{plan.name}</option>
													{/each}
												</select>
											</div>
										{/if}

										{#if goals.length > 0}
											<div>
												<label
													for="goal"
													class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
												>
													Goal
												</label>
												<select
													id="goal"
													bind:value={goalId}
													disabled={isSaving}
													class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
												>
													<option value="">No goal</option>
													{#each goals as goal}
														<option value={goal.id}>{goal.name}</option>
													{/each}
												</select>
											</div>
										{/if}

										{#if milestones.length > 0}
											<div>
												<label
													for="milestone"
													class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
												>
													Supporting Milestone
												</label>
												<select
													id="milestone"
													bind:value={milestoneId}
													disabled={isSaving}
													class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
												>
													<option value="">No milestone</option>
													{#each milestones as milestone}
														<option value={milestone.id}>
															{milestone.title}
															{#if milestone.due_at}
																( {new Date(
																	milestone.due_at
																).toLocaleDateString()} )
															{/if}
														</option>
													{/each}
												</select>
											</div>
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
										<div>
											<label
												for="state"
												class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
											>
												State
											</label>
											<select
												id="state"
												bind:value={stateKey}
												disabled={isSaving}
												class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											>
												<option value="todo">To Do</option>
												<option value="in_progress">In Progress</option>
												<option value="blocked">Blocked</option>
												<option value="done">Done</option>
												<option value="archived">Archived</option>
											</select>
										</div>
									{/if}

									<!-- Connected Documents List -->
									{#if deliverableDocuments.length > 0}
										<div
											class="pt-4 border-t border-gray-200 dark:border-gray-700"
										>
											<h3
												class="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"
											>
												<FileText class="w-4 h-4 text-blue-500" />
												Connected Documents ({deliverableDocuments.length})
											</h3>
											<div class="space-y-2 max-h-48 overflow-y-auto">
												{#each deliverableDocuments as doc}
													<button
														type="button"
														onclick={() =>
															handleDocumentClick(doc.document.id)}
														class="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all group"
													>
														<div
															class="flex items-center justify-between gap-2"
														>
															<div class="flex-1 min-w-0">
																<p
																	class="font-medium text-gray-900 dark:text-white truncate"
																>
																	{doc.document.title ||
																		'Untitled'}
																</p>
																<p
																	class="text-xs text-gray-500 dark:text-gray-400 truncate"
																>
																	{doc.document.type_key}
																</p>
															</div>
															<div
																class="flex items-center gap-2 shrink-0"
															>
																<Badge variant="info" size="sm">
																	{doc.document.state_key ||
																		'draft'}
																</Badge>
																<ExternalLink
																	class="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors"
																/>
															</div>
														</div>
													</button>
												{/each}
											</div>
										</div>
									{/if}

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
									<div
										class="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg p-4 space-y-3 border border-gray-200 dark:border-gray-700 shadow-sm"
									>
										<h3
											class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2"
										>
											<span class="w-1.5 h-1.5 bg-blue-500 rounded-full"
											></span>
											Task Information
										</h3>

										<div class="space-y-2 text-sm">
											<div class="flex justify-between">
												<span class="text-gray-600 dark:text-gray-400"
													>Type:</span
												>
												<span
													class="font-mono text-gray-900 dark:text-white"
													>{task.type_key || 'task.basic'}</span
												>
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
													<span class="text-gray-600 dark:text-gray-400"
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
													<span class="text-gray-600 dark:text-gray-400"
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
									</div>

									<!-- Recurrence -->
									<div
										class="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-4 space-y-3 border border-indigo-200 dark:border-indigo-800/70 shadow-sm"
									>
										<h3
											class="text-xs font-semibold text-indigo-900 dark:text-indigo-100 uppercase tracking-wide flex items-center gap-2"
										>
											<span class="text-base">🔄</span>
											Recurrence
										</h3>

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
														<span class="font-medium">Timezone:</span>
														{seriesMeta.timezone}
													</li>
													{#if seriesMeta.rrule}
														<li class="break-all">
															<span class="font-medium">RRULE:</span>
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
												<p class="text-sm text-red-600 dark:text-red-400">
													{seriesActionError}
												</p>
											{/if}

											{#if !showSeriesDeleteConfirm}
												<Button
													size="sm"
													variant="danger"
													class="w-full"
													onclick={() => (showSeriesDeleteConfirm = true)}
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
															onclick={() => handleDeleteSeries(true)}
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
											<p class="text-sm text-indigo-900 dark:text-indigo-100">
												This task is part of a recurring series
												{#if seriesMeta.master_task_id}
													(master task: {seriesMeta.master_task_id})
												{/if}
												. Manage recurrence from the series master.
											</p>
										{:else}
											<p class="text-sm text-indigo-900 dark:text-indigo-100">
												Automatically create future instances on a schedule.
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
									</div>

									<!-- Danger Zone -->
									<div
										class="border-2 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 rounded-lg p-4"
									>
										<h3
											class="text-xs font-semibold text-red-700 dark:text-red-400 mb-3 uppercase tracking-wide flex items-center gap-2"
										>
											<span class="text-base">⚠️</span>
											Danger Zone
										</h3>

										{#if !showDeleteConfirm}
											<Button
												variant="danger"
												size="sm"
												onclick={() => (showDeleteConfirm = true)}
												disabled={isDeleting}
												class="w-full"
											>
												<Trash2 class="w-3.5 h-3.5" />
												Delete Task
											</Button>
										{:else}
											<div class="space-y-3">
												<p class="text-sm text-red-700 dark:text-red-300">
													Are you sure? This cannot be undone.
												</p>
												<div class="flex gap-2">
													<Button
														variant="danger"
														size="sm"
														onclick={handleDelete}
														disabled={isDeleting}
														class="flex-1"
													>
														{#if isDeleting}
															<Loader class="w-4 h-4 animate-spin" />
														{:else}
															Yes, Delete
														{/if}
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onclick={() => (showDeleteConfirm = false)}
														disabled={isDeleting}
														class="flex-1"
													>
														Cancel
													</Button>
												</div>
											</div>
										{/if}
									</div>
								</div>
							</div>
						{:else}
							<!-- WORKSPACE TAB -->
							<div class="h-full flex flex-col space-y-4">
								<!-- Document Selector -->
								<div
									class="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700"
								>
									<FileText class="w-5 h-5 text-blue-500 shrink-0" />
									<Select
										value={selectedWorkspaceDocId || ''}
										onchange={(val) => selectWorkspaceDocument(String(val))}
										size="sm"
										class="flex-1"
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
									<Button
										size="sm"
										variant="secondary"
										onclick={() => openWorkspaceDocumentModal(null)}
									>
										+ New
									</Button>
								</div>

								<!-- RichMarkdownEditor -->
								{#if selectedWorkspaceDoc}
									<div class="flex-1 min-h-0">
										<RichMarkdownEditor
											bind:value={workspaceDocContent}
											rows={18}
											maxLength={20000}
											size="base"
											label="Document Content"
											helpText="Full markdown support with live preview"
										/>
									</div>
								{:else}
									<div
										class="flex-1 flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg"
									>
										<div class="text-center p-8">
											<FileText
												class="w-12 h-12 text-gray-400 mx-auto mb-3"
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
									</div>
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
			class="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
		>
			{#if activeView === 'details'}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					disabled={isSaving || isDeleting}
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="primary"
					size="sm"
					onclick={handleSave}
					disabled={isSaving || isDeleting || !title.trim()}
				>
					{#if isSaving}
						<Loader class="w-4 h-4 animate-spin" />
						Saving...
					{:else}
						<Save class="w-4 h-4" />
						Save Changes
					{/if}
				</Button>
			{:else}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={() => setActiveView('details')}
				>
					← Back to Details
				</Button>
				<div class="flex items-center gap-2">
					{#if selectedWorkspaceDoc && !selectedWorkspaceDoc.edge?.props?.handed_off}
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onclick={() => handlePromoteWorkspaceDocument(selectedWorkspaceDocId!)}
						>
							<CheckCircle2 class="w-4 h-4" />
							Promote to Project
						</Button>
					{/if}
					<Button
						type="button"
						variant="primary"
						size="sm"
						onclick={saveWorkspaceDocument}
						disabled={workspaceDocSaving || !selectedWorkspaceDocId}
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
		<p class="text-sm text-gray-600 dark:text-gray-300">
			This action cannot be undone. The task and all its data will be permanently deleted.
		</p>
	</ConfirmationModal>
{/if}
