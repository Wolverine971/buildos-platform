<!-- src/routes/projects/[id]/tasks/[taskId]/+page.svelte -->
<!-- https://claude.ai/chat/bb4907d4-80f4-414f-ac8b-0af5ff37ecbe -->
<script lang="ts">
	import {
		ArrowLeft,
		Settings,
		CheckCircle2,
		Clock,
		AlertTriangle,
		ExternalLink,
		Save,
		Edit3,
		Sparkles,
		Trash2,
		AlertCircle
	} from 'lucide-svelte';
	import { invalidate, goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import ProjectContextModal from '$lib/components/project/ProjectContextModal.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { ProjectService } from '$lib/services/projectService';
	import type { PageData } from './$types';
	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';

	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		formatDateForDisplay,
		formatDateTimeForDisplay,
		convertDatetimeLocalToUTC,
		convertUTCToDatetimeLocal,
		convertUTCToDateOnly
	} from '$lib/utils/date-utils';

	export let data: PageData;

	// Get project service instance
	const projectService = ProjectService.getInstance();

	// Tab management
	type TabType = 'info' | 'steps';
	let activeTab: TabType = 'info';

	// Modal state
	let showProjectContextModal = false;
	let showDeleteConfirmation = false;

	// Reactive values
	$: project = data.project;
	$: task = data.task;
	$: projectId = data.project?.id;
	$: calendarConnected = data.calendarStatus?.isConnected ?? false;
	$: isDeleted = !!task?.deleted_at;

	// Editable fields state
	let titleValue = '';
	let descriptionValue = '';
	let detailsValue = '';
	let statusValue = 'backlog';
	let priorityValue = 'medium';
	let taskTypeValue = 'one_off';
	let startDateValue = '';
	let durationMinutesValue = 60;
	let recurrencePatternValue = '';
	let recurrenceEndsValue = '';
	let dependenciesValue: string[] = [];
	let parentTaskIdValue = '';
	let taskStepsValue = '';
	// Removed outdatedValue - using soft delete pattern

	// Editing state
	let editingField: string | null = null;
	let savingField: string | null = null;
	let isDeleting = false;

	// Tab configuration
	$: tabConfig = [
		{
			id: 'info' as TabType,
			label: 'Task Details',
			icon: Edit3,
			count: null
		},
		{
			id: 'steps' as TabType,
			label: 'Task Steps',
			icon: Sparkles,
			count: null,
			badge: { text: 'Coming Soon', color: 'purple' }
		}
	];

	// Options for select fields
	const statusOptions = [
		{ value: 'backlog', label: 'Backlog' },
		{ value: 'in_progress', label: 'In Progress' },
		{ value: 'done', label: 'Done' },
		{ value: 'blocked', label: 'Blocked' }
	];

	const priorityOptions = [
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' }
	];

	const taskTypeOptions = [
		{ value: 'one_off', label: 'One-off' },
		{ value: 'recurring', label: 'Recurring' }
	];

	const recurrenceOptions = [
		{ value: '', label: 'No recurrence' },
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'biweekly', label: 'Bi-Weekly' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'yearly', label: 'Yearly' }
	];

	// No longer need local date conversion helpers - using centralized utilities

	// Initialize values when task changes
	$: if (task) {
		titleValue = task.title || '';
		descriptionValue = task.description || '';
		detailsValue = task.details || '';
		statusValue = task.status || 'backlog';
		priorityValue = task.priority || 'medium';
		taskTypeValue = task.task_type || 'one_off';
		startDateValue = convertUTCToDatetimeLocal(task.start_date || '');
		durationMinutesValue = task.duration_minutes || 60;
		recurrencePatternValue = task.recurrence_pattern || '';
		recurrenceEndsValue = convertUTCToDateOnly(task.recurrence_ends || '');
		dependenciesValue = task.dependencies || [];
		parentTaskIdValue = task.parent_task_id || '';
		taskStepsValue = task.task_steps || '';
		// Removed outdatedValue assignment - using soft delete pattern
	}

	// Granular invalidation
	async function invalidateTaskData() {
		if (projectId && task.id) {
			await invalidate(`task:${task.id}`);
			await invalidate(`projects:${projectId}:tasks`);
		}
	}

	// Quick update functions
	async function quickUpdateField(field: string, value: any) {
		if (!task?.id) return;

		savingField = field;
		try {
			const updateData = { [field]: value };
			const result = await projectService.updateTask(task.id, updateData, project.id);

			if (result?.success) {
				await invalidateTaskData();
				toastService.success('Task updated successfully');
			}
		} catch (error) {
			console.error(`Error updating ${field}:`, error);
			toastService.error(`Failed to update ${field}`);
		} finally {
			savingField = null;
			editingField = null;
		}
	}

	// Tab switching
	function switchTab(tab: TabType) {
		activeTab = tab;
	}

	// Project context modal handlers
	function openProjectContextModal() {
		showProjectContextModal = true;
	}

	function closeProjectContextModal() {
		showProjectContextModal = false;
	}

	// Task update handler
	async function handleTaskUpdated() {
		await invalidateTaskData();
		toastService.success('Task updated successfully');
	}

	// Get status display info
	function getStatusDisplay(status: string) {
		const configs: Record<string, { label: string; color: string; icon: typeof Clock }> = {
			backlog: {
				label: 'Backlog',
				color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
				icon: Clock
			},
			in_progress: {
				label: 'In Progress',
				color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
				icon: Clock
			},
			done: {
				label: 'Done',
				color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
				icon: CheckCircle2
			},
			blocked: {
				label: 'Blocked',
				color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
				icon: AlertTriangle
			}
		};
		return configs[status] || configs.backlog;
	}

	function getPriorityDisplay(priority: string) {
		const configs: Record<string, { label: string; color: string }> = {
			low: {
				label: 'Low',
				color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
			},
			medium: {
				label: 'Medium',
				color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
			},
			high: {
				label: 'High',
				color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
			}
		};
		return configs[priority] || configs.medium;
	}

	$: statusDisplay = getStatusDisplay(statusValue);
	$: priorityDisplay = getPriorityDisplay(priorityValue);
	$: calendarEvents = (task?.task_calendar_events || []).filter(
		(event) => event.sync_status !== ('deleted' as any)
	);
	$: isTaskScheduled = calendarEvents.length > 0;

	// Use centralized date formatter for calendar events
	function formatEventDate(dateString: string) {
		return formatDateTimeForDisplay(dateString);
	}

	// Auto-resize textarea
	function autoResize(textarea: HTMLTextAreaElement) {
		textarea.style.height = 'auto';
		textarea.style.height = textarea.scrollHeight + 'px';
	}

	// Delete task handler
	function handleDeleteClick() {
		showDeleteConfirmation = true;
	}

	async function handleConfirmDelete() {
		if (!task?.id || !projectId) return;

		isDeleting = true;
		try {
			const result = await projectService.deleteTask(task.id, projectId);
			if (result?.success) {
				toastService.success('Task deleted successfully');
				await goto(`/projects/${projectId}`);
			} else {
				toastService.error('Failed to delete task');
				showDeleteConfirmation = false;
			}
		} catch (error) {
			console.error('Error deleting task:', error);
			toastService.error('Failed to delete task');
			showDeleteConfirmation = false;
		} finally {
			isDeleting = false;
		}
	}

	function handleCancelDelete() {
		showDeleteConfirmation = false;
	}
</script>

<svelte:head>
	<title>{task.title} - {project.name} - BuildOS</title>
	<meta
		name="description"
		content="Task details for {task.title} in {project.name}. Manage task steps, dependencies, and track progress."
	/>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<!-- Deleted Task Warning Banner -->
	{#if isDeleted}
		<div class="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
				<div class="flex items-center gap-3">
					<AlertCircle class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
					<div class="flex-1">
						<p class="text-sm font-medium text-red-900 dark:text-red-200">
							This task was deleted on {formatDateTimeForDisplay(task.deleted_at)}
						</p>
						<p class="text-xs text-red-700 dark:text-red-300 mt-0.5">
							Deleted tasks are retained for record-keeping but cannot be edited or
							scheduled.
						</p>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Header Navigation Bar -->
	<header
		class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky {isDeleted
			? 'top-[68px]'
			: 'top-0'} z-10"
	>
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex items-center justify-between h-16">
				<!-- Left: Back Navigation -->
				<nav aria-label="Task navigation" class="flex items-center space-x-4">
					<a
						href="/projects/{projectId}"
						class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors group"
						aria-label="Return to {project.name} project"
					>
						<ArrowLeft
							class="w-4 h-4 mr-2 group-hover:-translate-x-0.5 transition-transform"
							aria-hidden="true"
						/>
						<span class="font-medium">{project.name}</span>
					</a>
					<span class="text-gray-300 dark:text-gray-600">/</span>
					<span
						class="text-sm font-medium text-gray-900 dark:text-white truncate max-w-md"
					>
						{titleValue}
					</span>
				</nav>

				<!-- Right: Actions -->
				<div class="flex items-center space-x-3">
					<!-- Recent Activity Indicator -->
					<RecentActivityIndicator
						createdAt={task.created_at}
						updatedAt={task.updated_at}
						size="sm"
					/>
					<!-- Status Badge -->
					{#if isDeleted}
						<span
							class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
						>
							<AlertCircle class="w-4 h-4 mr-1.5" />
							Deleted
						</span>
					{:else}
						<span
							class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium {statusDisplay.color}"
						>
							<svelte:component this={statusDisplay.icon} class="w-4 h-4 mr-1.5" />
							{statusDisplay.label}
						</span>
					{/if}

					<!-- Priority Badge -->
					<span
						class="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium {priorityDisplay.color}"
					>
						{priorityDisplay.label}
					</span>

					<!-- Project Context -->
					<Button
						type="button"
						on:click={openProjectContextModal}
						variant="ghost"
						size="sm"
						class="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
						aria-label="View project context"
						title="Project Context"
						icon={Settings}
					></Button>
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
		<!-- Tab Navigation -->
		<div class="mb-6">
			<div
				class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-1"
			>
				<nav class="flex space-x-1">
					{#each tabConfig as tab (tab.id)}
						<Button
							on:click={() => switchTab(tab.id)}
							variant={activeTab === tab.id ? 'primary' : 'ghost'}
							size="md"
							btnType="container"
							class="relative flex-1 justify-center gap-2 {activeTab === tab.id
								? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 shadow-sm'
								: ''}"
						>
							<svelte:component this={tab.icon} class="w-5 h-5 flex-shrink-0" />
							<span class="truncate font-semibold">{tab.label}</span>
							{#if tab.count !== null && tab.count !== undefined}
								<span
									class="text-xs bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded-full flex-shrink-0"
								>
									{tab.count}
								</span>
							{/if}
							{#if tab.badge}
								<span
									class="text-xs px-2 py-1 rounded-full flex-shrink-0 font-medium
									{tab.badge.color === 'blue'
										? 'bg-blue-500 text-white'
										: tab.badge.color === 'purple'
											? 'bg-purple-500 text-white'
											: 'bg-gray-500 text-white'}"
								>
									{tab.badge.text}
								</span>
							{/if}
						</Button>
					{/each}
				</nav>
			</div>
		</div>

		<!-- Tab Content -->
		{#if activeTab === 'info'}
			<!-- Main Task Content -->
			<div class="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[calc(100vh-16rem)]">
				<!-- Content Section (3/4 width) -->
				<div class="lg:col-span-3 space-y-6 {isDeleted ? 'opacity-75' : ''}">
					<!-- Title -->
					<div
						class="{isDeleted
							? 'bg-red-50 dark:bg-red-950/20'
							: 'bg-white dark:bg-gray-800'} rounded-xl shadow-sm border {isDeleted
							? 'border-red-200 dark:border-red-800'
							: 'border-gray-200 dark:border-gray-700'} p-6"
					>
						<FormField label="Task Title" labelFor="task-title">
							<TextInput
								id="task-title"
								bind:value={titleValue}
								on:blur={() => !isDeleted && quickUpdateField('title', titleValue)}
								placeholder="Task title..."
								size="lg"
								class="w-full text-2xl font-bold {isDeleted ? 'opacity-60' : ''}"
								disabled={isDeleted}
								readonly={isDeleted}
							/>
							{#if savingField === 'title'}
								<div
									class="mt-2 text-sm text-blue-600 dark:text-blue-400 flex items-center"
								>
									<Save class="w-4 h-4 mr-1 animate-pulse" />
									Saving...
								</div>
							{/if}
						</FormField>
					</div>

					<!-- Description -->
					<div
						class="{isDeleted
							? 'bg-red-50 dark:bg-red-950/20'
							: 'bg-white dark:bg-gray-800'} rounded-xl shadow-sm border {isDeleted
							? 'border-red-200 dark:border-red-800'
							: 'border-gray-200 dark:border-gray-700'} p-6"
					>
						<FormField label="Description" labelFor="task-description">
							<Textarea
								id="task-description"
								bind:value={descriptionValue}
								on:blur={() =>
									!isDeleted && quickUpdateField('description', descriptionValue)}
								placeholder="Brief task description..."
								rows={3}
								size="lg"
								class="w-full text-lg {isDeleted ? 'opacity-60' : ''}"
								disabled={isDeleted}
								readonly={isDeleted}
							/>
							{#if savingField === 'description'}
								<div
									class="mt-2 text-sm text-blue-600 dark:text-blue-400 flex items-center"
								>
									<Save class="w-4 h-4 mr-1 animate-pulse" />
									Saving...
								</div>
							{/if}
						</FormField>
					</div>

					<!-- Details -->
					<div
						class="{isDeleted
							? 'bg-red-50 dark:bg-red-950/20'
							: 'bg-white dark:bg-gray-800'} rounded-xl shadow-sm border {isDeleted
							? 'border-red-200 dark:border-red-800'
							: 'border-gray-200 dark:border-gray-700'} p-6 flex-1"
					>
						<label
							class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3"
						>
							Detailed Information
						</label>
						<div class="group h-full">
							<Textarea
								bind:value={detailsValue}
								on:blur={() =>
									!isDeleted && quickUpdateField('details', detailsValue)}
								on:input={(e) => !isDeleted && autoResize(e.currentTarget)}
								placeholder="Detailed task information, steps, notes, requirements..."
								rows={24}
								size="lg"
								class="w-full leading-relaxed {isDeleted ? 'opacity-60' : ''}"
								disabled={isDeleted}
								readonly={isDeleted}
							/>
							{#if savingField === 'details'}
								<div
									class="mt-2 text-sm text-blue-600 dark:text-blue-400 flex items-center"
								>
									<Save class="w-4 h-4 mr-1 animate-pulse" />
									Saving...
								</div>
							{/if}
							<div class="mt-2 text-sm text-gray-500 dark:text-gray-400">
								{detailsValue.length} characters
							</div>
						</div>
					</div>
				</div>

				<!-- Metadata Sidebar (1/4 width) -->
				<div class="lg:col-span-1 space-y-4">
					<div
						class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-4 sticky top-24"
					>
						<h3
							class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide"
						>
							Task Details
						</h3>

						<!-- Status -->
						<FormField label="Status" labelFor="task-status">
							<Select
								id="task-status"
								bind:value={statusValue}
								on:change={(e) => {
									if (!isDeleted) {
										statusValue = e.detail;
										quickUpdateField('status', statusValue);
									}
								}}
								size="sm"
								disabled={isDeleted}
							>
								{#each statusOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</Select>
							{#if savingField === 'status'}
								<div
									class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
								>
									<Save class="w-3 h-3 mr-1 animate-pulse" />
									Saving...
								</div>
							{/if}
						</FormField>

						<!-- Priority -->
						<FormField label="Priority" labelFor="task-priority">
							<Select
								id="task-priority"
								bind:value={priorityValue}
								on:change={(e) => {
									if (!isDeleted) {
										priorityValue = e.detail;
										quickUpdateField('priority', priorityValue);
									}
								}}
								size="sm"
								disabled={isDeleted}
							>
								{#each priorityOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</Select>
							{#if savingField === 'priority'}
								<div
									class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
								>
									<Save class="w-3 h-3 mr-1 animate-pulse" />
									Saving...
								</div>
							{/if}
						</FormField>

						<!-- Task Type -->
						<FormField label="Task Type" labelFor="task-type">
							<Select
								id="task-type"
								bind:value={taskTypeValue}
								on:change={(e) => {
									if (!isDeleted) {
										taskTypeValue = e.detail;
										quickUpdateField('task_type', taskTypeValue);
									}
								}}
								size="sm"
								disabled={isDeleted}
							>
								{#each taskTypeOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</Select>
							{#if savingField === 'task_type'}
								<div
									class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
								>
									<Save class="w-3 h-3 mr-1 animate-pulse" />
									Saving...
								</div>
							{/if}
						</FormField>

						<!-- Start Date -->
						<FormField label="Start Date & Time" labelFor="task-start-date">
							<TextInput
								id="task-start-date"
								type="datetime-local"
								bind:value={startDateValue}
								on:change={() =>
									!isDeleted &&
									quickUpdateField(
										'start_date',
										convertDatetimeLocalToUTC(startDateValue)
									)}
								size="sm"
								disabled={isDeleted}
							/>
							{#if savingField === 'start_date'}
								<div
									class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
								>
									<Save class="w-3 h-3 mr-1 animate-pulse" />
									Saving...
								</div>
							{/if}
						</FormField>

						<!-- Duration -->
						<FormField label="Duration (minutes)" labelFor="task-duration">
							<TextInput
								id="task-duration"
								type="number"
								bind:value={durationMinutesValue}
								on:change={() =>
									!isDeleted &&
									quickUpdateField('duration_minutes', durationMinutesValue)}
								min="1"
								size="sm"
								disabled={isDeleted}
							/>
							{#if savingField === 'duration_minutes'}
								<div
									class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
								>
									<Save class="w-3 h-3 mr-1 animate-pulse" />
									Saving...
								</div>
							{/if}
						</FormField>

						<!-- Calendar Events -->
						{#if calendarEvents.length > 0}
							<div>
								<label
									class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
								>
									Calendar Events
								</label>
								<div class="space-y-2">
									{#each calendarEvents as event}
										<div
											class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
										>
											<div class="flex items-center space-x-2">
												{#if event.sync_status === 'synced'}
													<CheckCircle2
														class="w-4 h-4 text-green-600 dark:text-green-400"
													/>
												{:else if event.sync_status === ('error' as any)}
													<AlertTriangle
														class="w-4 h-4 text-red-600 dark:text-red-400"
													/>
												{:else}
													<Clock
														class="w-4 h-4 text-yellow-600 dark:text-yellow-400"
													/>
												{/if}
												<div class="flex-1">
													<p
														class="text-xs font-medium text-green-800 dark:text-green-200"
													>
														{formatEventDate(event.event_start)}
													</p>
													{#if event.event_link && event.sync_status === 'synced'}
														<a
															href={event.event_link}
															target="_blank"
															rel="noopener noreferrer"
															class="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 inline-flex items-center mt-1"
														>
															View <ExternalLink
																class="w-3 h-3 ml-1"
															/>
														</a>
													{/if}
												</div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Creation/Update Info -->
						{#if task}
							<hr class="border-gray-200 dark:border-gray-700" />
							<div class="space-y-2 text-xs text-gray-600 dark:text-gray-400">
								{#if task.created_at}
									<div>
										<span class="font-medium">Created:</span>
										<br />
										{formatDateForDisplay(task.created_at)}
									</div>
								{/if}
								{#if task.updated_at}
									<div>
										<span class="font-medium">Updated:</span>
										<br />
										{formatDateForDisplay(task.updated_at)}
									</div>
								{/if}
								{#if task.deleted_at}
									<div class="text-red-600 dark:text-red-400">
										<span class="font-medium">Deleted:</span>
										<br />
										{formatDateForDisplay(task.deleted_at)}
									</div>
								{/if}
							</div>

							<!-- Delete Task Button (only show if not already deleted) -->
							{#if !isDeleted}
								<hr class="border-gray-200 dark:border-gray-700" />
								<div class="pt-2">
									<Button
										variant="danger"
										size="sm"
										fullWidth={true}
										on:click={handleDeleteClick}
										disabled={isDeleting}
										icon={Trash2}
									>
										Delete Task
									</Button>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			</div>
		{:else if activeTab === 'steps'}
			<!-- Task Steps Coming Soon Placeholder -->
			<div
				class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 min-h-[calc(100vh-16rem)] flex items-center justify-center"
			>
				<div class="text-center p-12">
					<div
						class="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-purple-400 to-blue-500 rounded-full flex items-center justify-center"
					>
						<Sparkles class="w-12 h-12 text-white" />
					</div>
					<h3 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
						Task Steps Coming Soon
					</h3>
					<p class="text-lg text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
						We're working on an intelligent task breakdown feature that will
						automatically generate step-by-step instructions for your tasks.
					</p>
					<div
						class="inline-flex items-center px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-full text-sm font-medium"
					>
						<Sparkles class="w-4 h-4 mr-2" />
						AI-Powered Task Planning
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>

<!-- Project Context Modal -->
{#if showProjectContextModal}
	<ProjectContextModal
		isOpen={showProjectContextModal}
		{project}
		on:close={closeProjectContextModal}
	/>
{/if}

<!-- Delete Confirmation Modal -->
<ConfirmationModal
	isOpen={showDeleteConfirmation}
	title="Delete Task"
	confirmText="Delete Task"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	loading={isDeleting}
	loadingText="Deleting task..."
	on:confirm={handleConfirmDelete}
	on:cancel={handleCancelDelete}
>
	<div slot="content" class="text-sm text-gray-600 dark:text-gray-400">
		<p class="font-medium text-gray-900 dark:text-white mb-2">
			Are you sure you want to delete "{task.title}"?
		</p>
		<p>This action cannot be undone. The task will be permanently removed from the project.</p>
	</div>
</ConfirmationModal>

<style>
	/* Smooth transitions for tab switching */
	main {
		transition: opacity 0.2s ease-in-out;
	}

	/* Custom scrollbar for content areas */
	:global(.task-content-scroll) {
		scrollbar-width: thin;
		scrollbar-color: rgb(203 213 225) transparent;
	}

	:global(.task-content-scroll::-webkit-scrollbar) {
		width: 6px;
	}

	:global(.task-content-scroll::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(.task-content-scroll::-webkit-scrollbar-thumb) {
		background-color: rgb(203 213 225);
		border-radius: 3px;
	}

	:global(.dark .task-content-scroll) {
		scrollbar-color: rgb(75 85 99) transparent;
	}

	:global(.dark .task-content-scroll::-webkit-scrollbar-thumb) {
		background-color: rgb(75 85 99);
	}

	/* Input hover effects */
	:global(.group:hover input, .group:hover textarea, .group:hover select) {
		border-color: rgb(156 163 175);
	}
</style>
