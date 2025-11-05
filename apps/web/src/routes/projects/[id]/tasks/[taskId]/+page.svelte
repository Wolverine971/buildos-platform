<!-- apps/web/src/routes/projects/[id]/tasks/[taskId]/+page.svelte -->
<!-- Redesigned with high information density and Apple-inspired aesthetics -->
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
		AlertCircle,
		Info,
		RefreshCw,
		MessageCircle,
		Calendar,
		Timer,
		RepeatIcon,
		ChevronRight
	} from 'lucide-svelte';
	import { invalidate, goto } from '$app/navigation';
	import { toastService } from '$lib/stores/toast.store';
	import ProjectContextModal from '$lib/components/project/ProjectContextModal.svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import ChatModal from '$lib/components/chat/ChatModal.svelte';
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
	import { format } from 'date-fns';

	export let data: PageData;

	// Get project service instance
	const projectService = ProjectService.getInstance();

	// Modal state
	let showProjectContextModal = false;
	let showDeleteConfirmation = false;
	let showChatModal = false;
	let expandedSections = { steps: false };

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
	let recurrenceEndOption = 'never';
	let taskStepsValue = '';
	let recurrenceEndMessage: string | null = null;

	// UI state
	let savingField: string | null = null;
	let isDeleting = false;

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
		{ value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'biweekly', label: 'Every 2 weeks' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'quarterly', label: 'Every 3 months' },
		{ value: 'yearly', label: 'Yearly' },
		{ value: 'custom', label: 'Custom...' }
	];

	const recurrenceEndOptions = [
		{ value: 'never', label: 'Never' },
		{ value: 'date', label: 'On date' },
		{ value: 'count', label: 'After occurrences' }
	];

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
		// Determine recurrence end option from existing data
		recurrenceEndOption = task.recurrence_ends ? 'date' : 'never';
		taskStepsValue = task.task_steps || '';
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
			}
		} catch (error) {
			console.error(`Error updating ${field}:`, error);
			toastService.error(`Failed to update ${field}`);
		} finally {
			savingField = null;
		}
	}

	// Project context modal handlers
	function openProjectContextModal() {
		showProjectContextModal = true;
	}

	function closeProjectContextModal() {
		showProjectContextModal = false;
	}

	// Chat modal handlers
	function openChatModal() {
		showChatModal = true;
	}

	function closeChatModal() {
		showChatModal = false;
	}

	// Get initial chat message based on task context
	function getInitialChatMessage() {
		if (!task) return '';

		// Create a context-aware greeting
		const taskStatus =
			statusValue === 'done'
				? 'completed'
				: statusValue === 'in_progress'
					? 'currently working on'
					: statusValue === 'blocked'
						? 'blocked on'
						: 'planned';

		return `I can help you with "${task.title}" which you're ${taskStatus}. You can ask me to:

• Break down this task into smaller steps
• Suggest implementation approaches
• Help with technical challenges
• Schedule time for this task
• Find related tasks or documentation
• Update task details or status

What would you like help with?`;
	}

	// Keyboard shortcut handler
	function handleKeyboardShortcut(event: KeyboardEvent) {
		// Cmd/Ctrl + K for chat
		if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
			event.preventDefault();
			openChatModal();
		}
	}

	// Get status display info
	function getStatusDisplay(status: string) {
		const configs: Record<
			string,
			{ label: string; color: string; bgColor: string; icon: typeof Clock }
		> = {
			backlog: {
				label: 'Backlog',
				color: 'text-gray-600 dark:text-gray-400',
				bgColor: 'bg-gray-50 dark:bg-gray-900/50',
				icon: Clock
			},
			in_progress: {
				label: 'In Progress',
				color: 'text-blue-700 dark:text-blue-400',
				bgColor:
					'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20',
				icon: Clock
			},
			done: {
				label: 'Done',
				color: 'text-emerald-700 dark:text-emerald-400',
				bgColor:
					'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20',
				icon: CheckCircle2
			},
			blocked: {
				label: 'Blocked',
				color: 'text-rose-700 dark:text-rose-400',
				bgColor:
					'bg-gradient-to-r from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20',
				icon: AlertTriangle
			}
		};
		return configs[status] || configs.backlog;
	}

	function getPriorityDisplay(priority: string) {
		const configs: Record<string, { label: string; color: string; dotColor: string }> = {
			low: {
				label: 'Low',
				color: 'text-gray-500 dark:text-gray-400',
				dotColor: 'bg-gray-400'
			},
			medium: {
				label: 'Medium',
				color: 'text-amber-600 dark:text-amber-400',
				dotColor: 'bg-amber-500'
			},
			high: {
				label: 'High',
				color: 'text-rose-600 dark:text-rose-400',
				dotColor: 'bg-rose-500'
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

	// Compute recurrence end date message
	$: recurrenceEndMessage = (() => {
		if (taskTypeValue !== 'recurring') return null;

		if (recurrenceEndsValue) {
			return null; // User specified end date
		}

		if (project?.end_date) {
			const endDate = new Date(project.end_date);
			return `Recurs until ${format(endDate, 'MMM d, yyyy')}`;
		}

		return 'Recurs indefinitely';
	})();

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

<svelte:window onkeydown={handleKeyboardShortcut} />

<div
	class="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
>
	<!-- Deleted Task Warning -->
	{#if isDeleted}
		<div
			class="bg-gradient-to-r from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 border-b border-rose-200 dark:border-rose-800"
		>
			<div class="max-w-6xl mx-auto px-4 py-2">
				<div class="flex items-center gap-2">
					<AlertCircle class="w-4 h-4 text-rose-600 dark:text-rose-400" />
					<p class="text-xs font-medium text-rose-700 dark:text-rose-300">
						Deleted {formatDateTimeForDisplay(task.deleted_at)} • Read-only
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Compact Header -->
	<header
		class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700 sticky {isDeleted
			? 'top-[32px]'
			: 'top-0'} z-0"
	>
		<div class="max-w-6xl mx-auto px-4">
			<div class="flex items-center justify-between h-12">
				<!-- Navigation -->
				<div class="flex items-center gap-2 min-w-0">
					<a
						href="/projects/{projectId}"
						class="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
					>
						<ArrowLeft class="w-3.5 h-3.5" />
						<span class="font-medium">{project.name}</span>
					</a>
					<ChevronRight class="w-3 h-3 text-gray-400 dark:text-gray-600" />
					<span class="text-xs font-semibold text-gray-900 dark:text-white truncate">
						{titleValue}
					</span>
				</div>

				<!-- Quick Actions -->
				<div class="flex items-center gap-1.5">
					<RecentActivityIndicator
						createdAt={task.created_at}
						updatedAt={task.updated_at}
						size="xs"
					/>
					<Button
						onclick={openChatModal}
						class="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 transition-all"
						title="Chat (⌘K)"
						disabled={isDeleted}
					>
						<MessageCircle class="w-4 h-4" />
					</Button>
					<Button
						onclick={openProjectContextModal}
						class="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:text-purple-400 dark:hover:bg-purple-900/20 transition-all"
						title="Project Context"
					>
						<Settings class="w-4 h-4" />
					</Button>
				</div>
			</div>
		</div>
	</header>

	<!-- Main Content -->
	<main class="max-w-6xl mx-auto px-4 py-3">
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
			<!-- Main Content Area -->
			<div class="lg:col-span-2 space-y-3 {isDeleted ? 'opacity-75' : ''}">
				<!-- Unified Task Card -->
				<div
					class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
				>
					<!-- Status & Priority Bar -->
					<div
						class="flex items-center justify-between px-4 py-2 {statusDisplay.bgColor} border-b border-gray-200 dark:border-gray-700"
					>
						<div class="flex items-center gap-3">
							<svelte:component
								this={statusDisplay.icon}
								class="w-4 h-4 {statusDisplay.color}"
							/>
							<span class="text-sm font-medium {statusDisplay.color}"
								>{statusDisplay.label}</span
							>
							{#if taskTypeValue === 'recurring'}
								<div
									class="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400"
								>
									<RepeatIcon class="w-3 h-3" />
									<span>Recurring</span>
								</div>
							{/if}
						</div>
						<div class="flex items-center gap-2">
							<span
								class="flex items-center gap-1 text-xs font-medium {priorityDisplay.color}"
							>
								<span class="w-1.5 h-1.5 rounded-full {priorityDisplay.dotColor}"
								></span>
								{priorityDisplay.label} Priority
							</span>
						</div>
					</div>

					<!-- Title Section -->
					<div class="px-4 pt-3 pb-2">
						<input
							type="text"
							bind:value={titleValue}
							onblur={() => !isDeleted && quickUpdateField('title', titleValue)}
							placeholder="Task title..."
							class="w-full text-xl font-semibold bg-transparent border-0 p-0 focus:outline-none focus:ring-0 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600"
							disabled={isDeleted}
							readonly={isDeleted}
						/>
						{#if savingField === 'title'}
							<div
								class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
							>
								<Save class="w-3 h-3 mr-1 animate-pulse" />
								Saving...
							</div>
						{/if}
					</div>

					<!-- Description Section -->
					<div class="px-4 pb-3">
						<textarea
							bind:value={descriptionValue}
							onblur={() =>
								!isDeleted && quickUpdateField('description', descriptionValue)}
							placeholder="Brief description..."
							rows={2}
							class="w-full text-sm text-gray-600 dark:text-gray-400 bg-transparent border-0 p-0 resize-none focus:outline-none focus:ring-0 placeholder-gray-400 dark:placeholder-gray-600"
							disabled={isDeleted}
							readonly={isDeleted}
						></textarea>
						{#if savingField === 'description'}
							<div
								class="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center"
							>
								<Save class="w-3 h-3 mr-1 animate-pulse" />
								Saving...
							</div>
						{/if}
					</div>

					<!-- Quick Metadata Grid -->
					{#if startDateValue || durationMinutesValue !== 60}
						<div class="px-4 pb-3 flex flex-wrap gap-3 text-xs">
							{#if startDateValue}
								<div
									class="flex items-center gap-1 text-gray-500 dark:text-gray-400"
								>
									<Calendar class="w-3 h-3" />
									<span
										>{formatDateForDisplay(
											convertDatetimeLocalToUTC(startDateValue)
										)}</span
									>
								</div>
							{/if}
							{#if durationMinutesValue !== 60}
								<div
									class="flex items-center gap-1 text-gray-500 dark:text-gray-400"
								>
									<Timer class="w-3 h-3" />
									<span>{durationMinutesValue} min</span>
								</div>
							{/if}
							{#if recurrencePatternValue && taskTypeValue === 'recurring'}
								<div
									class="flex items-center gap-1 text-purple-600 dark:text-purple-400"
								>
									<RepeatIcon class="w-3 h-3" />
									<span>{recurrencePatternValue}</span>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Details Section -->
					<div class="border-t border-gray-200 dark:border-gray-700">
						<div class="px-4 py-3">
							<label
								class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
								>Details</label
							>
							<textarea
								bind:value={detailsValue}
								onblur={() =>
									!isDeleted && quickUpdateField('details', detailsValue)}
								oninput={(e) => autoResize(e.target)}
								placeholder="Add detailed information, requirements, or notes..."
								rows={6}
								class="w-full mt-2 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-0 p-0 resize-none focus:outline-none focus:ring-0 placeholder-gray-400 dark:placeholder-gray-600"
								disabled={isDeleted}
								readonly={isDeleted}
							></textarea>
							{#if detailsValue}
								<div class="mt-1 text-xs text-gray-400">
									{detailsValue.length} characters
								</div>
							{/if}
						</div>
					</div>

					<!-- Task Steps Section -->
					{#if taskStepsValue || !isDeleted}
						<div class="border-t border-gray-200 dark:border-gray-700">
							<button
								onclick={() => (expandedSections.steps = !expandedSections.steps)}
								class="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
								type="button"
							>
								<div class="flex items-center gap-2">
									<Sparkles
										class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400"
									/>
									<span
										class="text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
										>Task Steps</span
									>
									{#if taskStepsValue}
										<span class="text-xs text-gray-500 dark:text-gray-400"
											>({taskStepsValue.split('\n').filter((l) => l.trim())
												.length} steps)</span
										>
									{/if}
								</div>
								<ChevronRight
									class="w-4 h-4 text-gray-400 transition-transform {expandedSections.steps
										? 'rotate-90'
										: ''}"
								/>
							</button>

							{#if expandedSections.steps}
								<div class="px-4 pb-3">
									<textarea
										bind:value={taskStepsValue}
										onblur={() =>
											!isDeleted &&
											quickUpdateField('task_steps', taskStepsValue)}
										oninput={(e) => autoResize(e.target)}
										placeholder="1. First step&#10;2. Second step&#10;3. Third step..."
										rows={6}
										class="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent border-0 p-0 resize-none focus:outline-none focus:ring-0 placeholder-gray-400 dark:placeholder-gray-600 font-mono"
										disabled={isDeleted}
										readonly={isDeleted}
									></textarea>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Calendar Events (if any) -->
				{#if calendarEvents.length > 0}
					<div
						class="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800"
					>
						<div class="flex items-center justify-between mb-2">
							<span
								class="text-xs font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wider"
								>Calendar Events</span
							>
							<span class="text-xs text-emerald-600 dark:text-emerald-400"
								>{calendarEvents.length} scheduled</span
							>
						</div>
						<div class="space-y-1.5">
							{#each calendarEvents.slice(0, 3) as event}
								<div class="flex items-center justify-between">
									<span class="text-xs text-emerald-700 dark:text-emerald-300">
										{formatEventDate(event.event_start)}
									</span>
									{#if event.event_link && event.sync_status === 'synced'}
										<a
											href={event.event_link}
											target="_blank"
											rel="noopener noreferrer"
											class="text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 inline-flex items-center gap-1"
										>
											View
											<ExternalLink class="w-3 h-3" />
										</a>
									{/if}
								</div>
							{/each}
							{#if calendarEvents.length > 3}
								<div class="text-xs text-emerald-600 dark:text-emerald-400">
									+{calendarEvents.length - 3} more...
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Compact Sidebar -->
			<div class="lg:col-span-1">
				<div
					class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 sticky top-16 overflow-hidden"
				>
					<!-- Sidebar Header -->
					<div
						class="px-3 py-2 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900 dark:to-slate-900 border-b border-gray-200 dark:border-gray-700"
					>
						<h3
							class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider"
						>
							Properties
						</h3>
					</div>

					<!-- Compact Controls -->
					<div class="p-3 space-y-2.5">
						<!-- Status -->
						<div>
							<label class="text-xs text-gray-500 dark:text-gray-400 font-medium"
								>Status</label
							>
							<select
								bind:value={statusValue}
								onchange={() =>
									!isDeleted && quickUpdateField('status', statusValue)}
								class="w-full mt-1 text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
								disabled={isDeleted}
							>
								{#each statusOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
							{#if savingField === 'status'}
								<div class="mt-1 text-xs text-blue-600 dark:text-blue-400">
									Saving...
								</div>
							{/if}
						</div>

						<!-- Priority -->
						<div>
							<label class="text-xs text-gray-500 dark:text-gray-400 font-medium"
								>Priority</label
							>
							<select
								bind:value={priorityValue}
								onchange={() =>
									!isDeleted && quickUpdateField('priority', priorityValue)}
								class="w-full mt-1 text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
								disabled={isDeleted}
							>
								{#each priorityOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>

						<!-- Task Type -->
						<div>
							<label class="text-xs text-gray-500 dark:text-gray-400 font-medium"
								>Type</label
							>
							<select
								bind:value={taskTypeValue}
								onchange={() =>
									!isDeleted && quickUpdateField('task_type', taskTypeValue)}
								class="w-full mt-1 text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
								disabled={isDeleted}
							>
								{#each taskTypeOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						</div>

						<!-- Start Date -->
						<div>
							<label class="text-xs text-gray-500 dark:text-gray-400 font-medium"
								>Start Date</label
							>
							<input
								type="datetime-local"
								bind:value={startDateValue}
								onchange={() =>
									!isDeleted &&
									quickUpdateField(
										'start_date',
										convertDatetimeLocalToUTC(startDateValue)
									)}
								class="w-full mt-1 text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
								disabled={isDeleted}
							/>
						</div>

						<!-- Duration -->
						<div>
							<label class="text-xs text-gray-500 dark:text-gray-400 font-medium"
								>Duration (min)</label
							>
							<input
								type="number"
								bind:value={durationMinutesValue}
								onchange={() =>
									!isDeleted &&
									quickUpdateField('duration_minutes', durationMinutesValue)}
								min="1"
								class="w-full mt-1 text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
								disabled={isDeleted}
							/>
						</div>

						<!-- Recurrence Pattern (only for recurring tasks with start date) -->
						{#if taskTypeValue === 'recurring' && startDateValue}
							<div>
								<label class="text-xs text-gray-500 dark:text-gray-400 font-medium"
									>Recurrence</label
								>
								<select
									bind:value={recurrencePatternValue}
									onchange={() =>
										!isDeleted &&
										quickUpdateField(
											'recurrence_pattern',
											recurrencePatternValue
										)}
									class="w-full mt-1 text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
									disabled={isDeleted}
								>
									{#each recurrenceOptions as option}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>
							</div>

							<!-- Recurrence End -->
							{#if recurrenceEndOption === 'date'}
								<div>
									<label
										class="text-xs text-gray-500 dark:text-gray-400 font-medium"
										>End Date</label
									>
									<input
										type="date"
										bind:value={recurrenceEndsValue}
										onchange={() =>
											!isDeleted &&
											quickUpdateField(
												'recurrence_ends',
												recurrenceEndsValue
													? new Date(
															recurrenceEndsValue + 'T00:00:00'
														).toISOString()
													: null
											)}
										class="w-full mt-1 text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
										disabled={isDeleted}
									/>
								</div>
							{/if}
						{/if}
					</div>

					<!-- Timestamps -->
					<div
						class="px-3 pb-3 space-y-1.5 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-3"
					>
						{#if task?.created_at}
							<div class="flex justify-between">
								<span>Created</span>
								<span>{formatDateForDisplay(task.created_at)}</span>
							</div>
						{/if}
						{#if task?.updated_at}
							<div class="flex justify-between">
								<span>Updated</span>
								<span>{formatDateForDisplay(task.updated_at)}</span>
							</div>
						{/if}
					</div>

					<!-- Delete Button -->
					{#if !isDeleted}
						<div class="p-3 border-t border-gray-200 dark:border-gray-700">
							<button
								onclick={handleDeleteClick}
								disabled={isDeleting}
								class="w-full text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 py-2 px-3 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
							>
								<Trash2 class="w-3.5 h-3.5 inline mr-1.5" />
								Delete Task
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
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

<!-- Chat Modal -->
{#if task}
	<ChatModal
		isOpen={showChatModal}
		contextType="task"
		entityId={task.id}
		initialMessage={getInitialChatMessage()}
		onClose={closeChatModal}
	/>
{/if}

<!-- Floating Chat Button -->
{#if !isDeleted}
	<button
		onclick={openChatModal}
		class="fixed bottom-6 right-6 z-0 flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg hover:shadow-xl hover:scale-110 transition-all focus:outline-none focus:ring-4 focus:ring-blue-500/30"
		aria-label="Chat about this task"
		title="Chat (⌘K)"
	>
		<MessageCircle class="w-5 h-5" />
	</button>
{/if}

<style>
	/* Smooth transitions */
	main {
		transition: opacity 0.2s ease-in-out;
	}

	/* Compact input styles */
	input[type='text'],
	input[type='number'],
	input[type='date'],
	input[type='datetime-local'],
	select,
	textarea {
		transition: all 0.15s ease-in-out;
	}

	input[type='text']:focus,
	input[type='number']:focus,
	input[type='date']:focus,
	input[type='datetime-local']:focus,
	select:focus,
	textarea:focus {
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}
</style>
