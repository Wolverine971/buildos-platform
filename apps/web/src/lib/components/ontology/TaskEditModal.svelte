<!-- apps/web/src/lib/components/ontology/TaskEditModal.svelte -->
<!--
	Task Edit Modal Component

	Provides full CRUD operations for tasks within the BuildOS ontology system:
	- Edit task details (title, description, priority, state, etc.)
	- Visualize FSM state transitions
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

	Note: This modal uses custom layout instead of FormModal for advanced features
	like sidebar metadata and FSM visualization.
-->
<script lang="ts">
	import { X, Save, Loader, Trash2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import { fade } from 'svelte/transition';
	import FSMStateVisualizer from './FSMStateVisualizer.svelte';
	import TaskSeriesModal from './TaskSeriesModal.svelte';
	import { toastService } from '$lib/stores/toast.store';

	interface Props {
		taskId: string;
		projectId: string;
		plans?: Array<{ id: string; name: string }>;
		onClose: () => void;
		onUpdated?: () => void;
		onDeleted?: () => void;
	}

	let { taskId, projectId, plans = [], onClose, onUpdated, onDeleted }: Props = $props();

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
	let stateKey = $state('todo');
	let showSeriesModal = $state(false);
	let showSeriesDeleteConfirm = $state(false);
	let isDeletingSeries = $state(false);
	let seriesActionError = $state('');

	// FSM related
	let allowedTransitions = $state<any[]>([]);

	const seriesMeta = $derived(() => {
		if (!task?.props || typeof task.props !== 'object') return null;
		const meta = (task.props as Record<string, any>).series;
		return meta && typeof meta === 'object' ? meta : null;
	});

	const seriesId = $derived(() => {
		if (!task?.props || typeof task.props !== 'object') {
			return null;
		}
		return (task.props as Record<string, any>).series_id ?? null;
	});

	const isSeriesMaster = $derived(() => seriesMeta?.role === 'master');
	const isSeriesInstance = $derived(() => seriesMeta?.role === 'instance');

	// Load task data when modal opens
	$effect(() => {
		loadTask();
	});

	async function loadTask() {
		try {
			isLoading = true;
			const response = await fetch(`/api/onto/tasks/${taskId}`);
			if (!response.ok) throw new Error('Failed to load task');

			const data = await response.json();
			task = data.data?.task;

			if (task) {
				title = task.title || '';
				description = task.props?.description || '';
				priority = task.priority || 3;
				planId = task.plan_id || '';
				stateKey = task.state_key || 'todo';
				seriesActionError = '';
				showSeriesDeleteConfirm = false;
			}

			// Load FSM transitions if available
			await loadTransitions();
		} catch (err) {
			console.error('Error loading task:', err);
			error = 'Failed to load task';
		} finally {
			isLoading = false;
		}
	}

	async function loadTransitions() {
		try {
			const response = await fetch(
				`/api/onto/fsm/transitions?entity_id=${taskId}&entity_kind=task`
			);
			if (response.ok) {
				const data = await response.json();
				allowedTransitions = data.data?.transitions || [];
			}
		} catch (err) {
			console.error('Error loading transitions:', err);
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
				state_key: stateKey
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

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !isSaving && !isDeleting) {
			onClose();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Modal Backdrop -->
<button
	class="fixed inset-0 bg-black/50 dark:bg-black/70 z-40 cursor-default"
	onclick={onClose}
	disabled={isSaving || isDeleting}
	aria-label="Close dialog"
	transition:fade={{ duration: 200 }}
></button>

<!-- Modal Content -->
<div
	class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[90vh] overflow-hidden z-50"
	transition:fade={{ duration: 200 }}
>
	<Card variant="elevated" class="shadow-2xl">
		<CardHeader variant="gradient" class="p-6">
			<div class="flex items-center justify-between">
				<h2 class="text-2xl font-bold text-white">Edit Task</h2>
				<button
					onclick={onClose}
					disabled={isSaving || isDeleting}
					class="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
					aria-label="Close"
				>
					<X class="w-5 h-5 text-white" />
				</button>
			</div>
		</CardHeader>

		<CardBody class="max-h-[calc(90vh-120px)] overflow-y-auto p-6">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-gray-400" />
				</div>
			{:else if !task}
				<div class="text-center py-8">
					<p class="text-red-600 dark:text-red-400">Task not found</p>
				</div>
			{:else}
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<!-- Main Form (Left 2 columns) -->
					<div class="lg:col-span-2">
						<form
							onsubmit={(e) => {
								e.preventDefault();
								handleSave();
							}}
							class="space-y-6"
						>
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
									class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
								/>
							</div>

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
									class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
								></textarea>
							</div>

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
										class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
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
											class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<option value="">No plan</option>
											{#each plans as plan}
												<option value={plan.id}>{plan.name}</option>
											{/each}
										</select>
									</div>
								{/if}
							</div>

							<!-- FSM State Visualizer -->
							{#if task.type_key && allowedTransitions.length > 0}
								<div class="pt-4 border-t border-gray-200 dark:border-gray-700">
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
										class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<option value="todo">To Do</option>
										<option value="in_progress">In Progress</option>
										<option value="blocked">Blocked</option>
										<option value="done">Done</option>
										<option value="archived">Archived</option>
									</select>
								</div>
							{/if}

							{#if error}
								<div
									class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
								>
									<p class="text-sm text-red-700 dark:text-red-300">{error}</p>
								</div>
							{/if}
						</form>
					</div>

					<!-- Sidebar (Right column) -->
					<div class="space-y-4">
						<!-- Task Metadata -->
						<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
							<h3
								class="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide"
							>
								Task Information
							</h3>

							<div class="space-y-2 text-sm">
								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">Type:</span>
									<span class="font-mono text-gray-900 dark:text-white"
										>{task.type_key || 'task.basic'}</span
									>
								</div>

								<div class="flex justify-between">
									<span class="text-gray-600 dark:text-gray-400">ID:</span>
									<span class="font-mono text-xs text-gray-500 dark:text-gray-500"
										>{task.id.slice(0, 8)}...</span
									>
								</div>

								{#if task.created_at}
									<div class="flex justify-between">
										<span class="text-gray-600 dark:text-gray-400"
											>Created:</span
										>
										<span class="text-gray-900 dark:text-white">
											{new Date(task.created_at).toLocaleDateString()}
										</span>
									</div>
								{/if}

								{#if task.updated_at}
									<div class="flex justify-between">
										<span class="text-gray-600 dark:text-gray-400"
											>Updated:</span
										>
										<span class="text-gray-900 dark:text-white">
											{new Date(task.updated_at).toLocaleDateString()}
										</span>
									</div>
								{/if}
							</div>
						</div>

						<!-- Recurrence -->
						<div
							class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 space-y-3 border border-indigo-200 dark:border-indigo-800/70"
						>
							<h3
								class="text-sm font-semibold text-indigo-900 dark:text-indigo-100 uppercase tracking-wide"
							>
								Recurrence
							</h3>

							{#if isSeriesMaster && seriesMeta}
								<div class="space-y-2 text-sm">
									<p class="text-indigo-900 dark:text-indigo-100">
										This task controls a recurring series.
									</p>
									<ul class="text-indigo-800 dark:text-indigo-100 space-y-1">
										{#if seriesId}
											<li>
												<span class="font-medium">Series ID:</span>
												<span class="font-mono text-xs break-all"
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
												<span class="font-medium">Instances:</span>
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
										<p class="text-sm text-indigo-900 dark:text-indigo-100">
											Delete this series? Completed instances remain unless
											you force delete.
										</p>
										<div class="flex flex-col gap-2">
											<Button
												variant="danger"
												size="sm"
												disabled={isDeletingSeries}
												onclick={() => handleDeleteSeries(false)}
											>
												{#if isDeletingSeries}
													<Loader class="w-4 h-4 animate-spin" />
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
													<Loader class="w-4 h-4 animate-spin" />
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
						<div class="border border-red-200 dark:border-red-800 rounded-lg p-4">
							<h3
								class="text-sm font-semibold text-red-700 dark:text-red-400 mb-3 uppercase tracking-wide"
							>
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
									<Trash2 class="w-4 h-4" />
									Delete Task
								</Button>
							{:else}
								<div class="space-y-3">
									<p class="text-sm text-red-700 dark:text-red-300">
										Are you sure you want to delete this task? This action
										cannot be undone.
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
												Deleting...
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

				<!-- Action Buttons -->
				<div
					class="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-gray-200 dark:border-gray-700"
				>
					<Button
						type="button"
						variant="ghost"
						onclick={onClose}
						disabled={isSaving || isDeleting}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="primary"
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
				</div>
			{/if}
		</CardBody>
	</Card>
</div>

{#if task}
	<TaskSeriesModal
		{task}
		bind:isOpen={showSeriesModal}
		onClose={() => (showSeriesModal = false)}
		onSuccess={handleSeriesCreated}
	/>
{/if}
