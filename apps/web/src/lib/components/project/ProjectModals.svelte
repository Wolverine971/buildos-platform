<!-- apps/web/src/lib/components/project/ProjectModals.svelte -->
<script lang="ts">
	import { tick } from 'svelte';
	import type { Project, Note } from '$lib/types/project';
	import type { TaskWithCalendarEvents } from '$lib/types/project-page.types';
	import { toastService } from '$lib/stores/toast.store';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import LoadingModal from '$lib/components/ui/LoadingModal.svelte';
	import { modalStore } from '$lib/stores/modal.store';

	interface Props {
		project: Project | null;
		isDeleting: boolean;
		calendarStatus: any;
		taskCount: number;
		noteCount: number;
		tasks: TaskWithCalendarEvents[];
		deletedTasks: TaskWithCalendarEvents[];
		notes: Note[];
		taskStats: any;
		phases?: any[];
		// Event handlers from parent
		onProjectUpdated: (event: CustomEvent) => void;
		onTaskUpdate: (task: TaskWithCalendarEvents) => void;
		onTaskCreate: (task: TaskWithCalendarEvents) => void;
		onTaskDelete: (taskId: string) => void;
		onNoteUpdate: (note: Partial<Note>) => void;
		onNoteDelete: (noteId: string) => Promise<boolean | void>;
		onDeleteConfirm: () => void;
		onCalendarRefreshConfirm: () => void;
		onMarkDeletedConfirm: (task: TaskWithCalendarEvents) => void;
		onPhaseScheduled?: (event: CustomEvent) => void;
		onPhaseUpdated?: () => void;
		onPhaseGenerationConfirm?: (params: any) => void;
		onPhaseUnscheduleConfirm?: (data: any) => void;
		onPhaseDelete?: (phase: any) => void;
		onProjectDatesUpdated?: (event: CustomEvent) => void;
		onScheduleAllPhases?: (event: CustomEvent) => void;
	}

	let {
		project,
		isDeleting,
		calendarStatus,
		taskCount,
		noteCount,
		tasks,
		deletedTasks,
		notes,
		taskStats,
		phases = [],
		onProjectUpdated,
		onTaskUpdate,
		onTaskCreate,
		onTaskDelete,
		onNoteUpdate,
		onNoteDelete,
		onDeleteConfirm,
		onCalendarRefreshConfirm,
		onMarkDeletedConfirm,
		onPhaseScheduled = () => {},
		onPhaseUpdated = () => {},
		onPhaseGenerationConfirm = () => {},
		onPhaseUnscheduleConfirm = () => {},
		onPhaseDelete = () => {},
		onProjectDatesUpdated = () => {},
		onScheduleAllPhases = () => {}
	}: Props = $props();

	let modals = $derived.by(() => $modalStore);

	// Modal component mapping
	const MODAL_COMPONENTS = {
		projectEdit: () => import('$lib/components/project/ProjectEditModal.svelte'),
		projectContext: () => import('$lib/components/project/ProjectContextModal.svelte'),
		projectHistory: () => import('$lib/components/project/ProjectHistoryModal.svelte'),
		projectCalendarSettings: () =>
			import('$lib/components/project/ProjectCalendarSettingsModal.svelte'),
		projectCalendarConnect: () =>
			import('$lib/components/project/ProjectCalendarConnectModal.svelte'),
		brief: () => import('$lib/components/briefs/ProjectBriefModal.svelte'),
		task: () => import('$lib/components/project/TaskModal.svelte'),
		note: () => import('$lib/components/project/NoteModal.svelte'),
		scheduling: () => import('$lib/components/project/PhaseSchedulingModal.svelte'),
		scheduleAllPhases: () => import('$lib/components/project/ScheduleAllPhasesModal.svelte'),
		projectDates: () => import('$lib/components/project/ProjectDatesModal.svelte'),
		phaseGenerationConfirmation: () =>
			import('$lib/components/project/PhaseGenerationConfirmationModal.svelte'),
		assignBacklogTasks: () => import('$lib/components/project/AssignBacklogTasksModal.svelte'),
		unscheduleConfirmation: () =>
			import('$lib/components/project/UnscheduleAllTasksModal.svelte'),
		rescheduleOverdueTasks: () =>
			import('$lib/components/project/RescheduleOverdueTasksModal.svelte')
	};

	// Component cache - make reactive with $state
	let componentCache = $state<Record<string, any>>({});

	// Loading states - make reactive with $state
	let loadingStates = $state<Record<string, boolean>>({});

	// Transition states - make reactive with $state
	let transitionStates = $state<Record<string, boolean>>({});

	// Loading promises to prevent duplicate loads
	const loadingPromises: Record<string, Promise<any>> = {};

	// Preload commonly used modals when project is available using Svelte 5 effects
	$effect(() => {
		if (project && !componentCache.task) {
			preloadModal('task');
		}
	});
	$effect(() => {
		if (project && !componentCache.note) {
			preloadModal('note');
		}
	});

	// Global cleanup effect for all transition states
	$effect(() => {
		// Check all modals and cleanup stuck transition states
		const modalNames = Object.keys(MODAL_COMPONENTS);
		modalNames.forEach((modalName) => {
			if (!modals?.[modalName]?.isOpen && transitionStates[modalName]) {
				// Reset transition state if modal is closed but transition state is still true
				setTimeout(() => {
					transitionStates[modalName] = false;
				}, 300);
			}
		});
	});

	// Preload modal without showing loading state
	async function preloadModal(modalName: string) {
		if (componentCache[modalName] || loadingPromises[modalName]) return;

		try {
			loadingPromises[modalName] = MODAL_COMPONENTS[modalName]();
			const module = await loadingPromises[modalName];
			componentCache[modalName] = module.default;
		} catch (error) {
			console.error(`Failed to preload ${modalName}:`, error);
		} finally {
			delete loadingPromises[modalName];
		}
	}

	// Load modal component with loading state
	async function loadModal(modalName: string): Promise<any> {
		// Return cached component if available
		if (componentCache[modalName]) {
			return componentCache[modalName];
		}

		// Return existing promise if loading
		if (loadingPromises[modalName]) {
			const module = await loadingPromises[modalName];
			return module.default;
		}

		// Start loading
		loadingStates[modalName] = true;

		try {
			loadingPromises[modalName] = MODAL_COMPONENTS[modalName]();
			const module = await loadingPromises[modalName];
			componentCache[modalName] = module.default;

			// Small delay to ensure smooth transition
			await tick();
			await new Promise((resolve) => setTimeout(resolve, 50));

			return componentCache[modalName];
		} catch (error) {
			console.error(`Failed to load ${modalName}:`, error);
			toastService.error(`Failed to load ${modalName}`);
			return null;
		} finally {
			loadingStates[modalName] = false;
			delete loadingPromises[modalName];
		}
	}

	// Enhanced close handler with smooth transitions
	async function handleCloseModal(modalName: string) {
		// If already transitioning, just close immediately to avoid stuck state
		if (transitionStates[modalName]) {
			modalStore.close(modalName);
			transitionStates[modalName] = false;
			return;
		}

		transitionStates[modalName] = true;

		// Let the modal animate out
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 200));

		modalStore.close(modalName);

		// Reset transition state after a small delay to ensure animation completes
		await tick();
		await new Promise((resolve) => setTimeout(resolve, 50));
		transitionStates[modalName] = false;
	}

	// Task modal handlers - Note: TaskModal handles its own close
	async function handleTaskCreate(task: TaskWithCalendarEvents) {
		// Don't close modal here - TaskModal already handles it
		onTaskCreate(task);
	}

	async function handleTaskUpdate(task: TaskWithCalendarEvents) {
		// Don't close modal here - TaskModal already handles it
		onTaskUpdate(task);
	}

	async function handleTaskDelete(taskId: string) {
		// Don't close modal here - TaskModal already handles it
		onTaskDelete(taskId);
	}

	// Note modal handlers
	async function handleNoteUpdate(note: Partial<Note>) {
		onNoteUpdate(note);
		await handleCloseModal('note');
	}

	async function handleNoteDelete(noteId: string) {
		try {
			await onNoteDelete(noteId);
			await handleCloseModal('note');
		} catch (error) {
			console.error('Failed to delete note from modal:', error);
		}
	}

	// Phase modal handlers
	async function handlePhaseScheduled(event: CustomEvent) {
		await handleCloseModal('scheduling');
		onPhaseScheduled(event);
		// Don't show toast here - parent component handles it
	}

	async function handleDatesUpdated(event: CustomEvent) {
		await handleCloseModal('projectDates');
		onProjectDatesUpdated(event);
		toastService.success('Project dates updated successfully');
	}

	async function handleGenerationConfirm(event: CustomEvent) {
		await handleCloseModal('phaseGenerationConfirmation');
		onPhaseGenerationConfirm(event.detail);
	}

	async function handleDeletePhase(phase: any) {
		await handleCloseModal('deletePhase');
		onPhaseDelete(phase);
	}

	async function handleDeletePhaseTask(taskId: string) {
		await handleCloseModal('deletePhaseTask');
		onTaskDelete(taskId);
	}

	// Modal visibility states
	let isProjectEditOpen = $derived.by(
		() => modals?.projectEdit?.isOpen && !transitionStates.projectEdit
	);
	let isProjectContextOpen = $derived.by(
		() => modals?.projectContext?.isOpen && !transitionStates.projectContext
	);
	let isProjectHistoryOpen = $derived.by(
		() => modals?.projectHistory?.isOpen && !transitionStates.projectHistory
	);
	let isProjectCalendarSettingsOpen = $derived.by(
		() => modals?.projectCalendarSettings?.isOpen && !transitionStates.projectCalendarSettings
	);
	let isProjectCalendarConnectOpen = $derived.by(
		() => modals?.projectCalendarConnect?.isOpen && !transitionStates.projectCalendarConnect
	);
	let isBriefOpen = $derived.by(() => modals?.brief?.isOpen && !transitionStates.brief);
	let isTaskOpen = $derived.by(() => modals?.task?.isOpen && !transitionStates.task);
	let isNoteOpen = $derived.by(() => modals?.note?.isOpen && !transitionStates.note);
	let isSchedulingOpen = $derived.by(
		() => modals?.scheduling?.isOpen && !transitionStates.scheduling
	);
	let isProjectDeleteOpen = $derived.by(
		() => modals?.projectDelete?.isOpen && !transitionStates.projectDelete
	);
	let isCalendarRefreshOpen = $derived.by(
		() => modals?.calendarRefresh?.isOpen && !transitionStates.calendarRefresh
	);
	let isMarkDeletedOpen = $derived.by(
		() => modals?.markDeleted?.isOpen && !transitionStates.markDeleted
	);
	let isProjectDatesOpen = $derived.by(
		() => modals?.projectDates?.isOpen && !transitionStates.projectDates
	);
	let isPhaseGenerationOpen = $derived.by(
		() =>
			modals?.phaseGenerationConfirmation?.isOpen &&
			!transitionStates.phaseGenerationConfirmation
	);
	let isUnscheduleConfirmOpen = $derived.by(
		() => modals?.unscheduleConfirmation?.isOpen && !transitionStates.unscheduleConfirmation
	);
	let isDeletePhaseOpen = $derived.by(
		() => modals?.deletePhase?.isOpen && !transitionStates.deletePhase
	);
	let isDeletePhaseTaskOpen = $derived.by(
		() => modals?.deletePhaseTask?.isOpen && !transitionStates.deletePhaseTask
	);
	let isAssignBacklogTasksOpen = $derived.by(
		() => modals?.assignBacklogTasks?.isOpen && !transitionStates.assignBacklogTasks
	);
	let isRescheduleOverdueTasksOpen = $derived.by(
		() => modals?.rescheduleOverdueTasks?.isOpen && !transitionStates.rescheduleOverdueTasks
	);
	let isScheduleAllPhasesOpen = $derived.by(
		() => modals?.scheduleAllPhases?.isOpen && !transitionStates.scheduleAllPhases
	);

	// Modal data
	let briefData = $derived.by(() => modals?.brief?.data || null);
	let taskData = $derived.by(() => modals?.task?.data || null);
	let taskPhaseId = $derived.by(() => modals?.task?.phaseId || null);
	let noteData = $derived.by(() => modals?.note?.data || null);
	let schedulingData = $derived.by(
		() => modals?.scheduling?.data || modals?.scheduling?.phase || null
	);
	let markDeletedData = $derived.by(() => modals?.markDeleted?.data || null);
	let phaseGenerationData = $derived.by(() => modals?.phaseGenerationConfirmation?.data || null);
	let unscheduleData = $derived.by(() => modals?.unscheduleConfirmation?.data || null);
	let deletePhaseData = $derived.by(
		() => modals?.deletePhase?.data || modals?.deletePhase?.phase || null
	);
	let deletePhaseTaskId = $derived.by(
		() => modals?.deletePhaseTask?.data || modals?.deletePhaseTask?.taskId || null
	);
	let calendarConnectData = $derived.by(() => modals?.projectCalendarConnect?.data || {});
	let taskPhase = $derived.by(() =>
		taskPhaseId ? phases.find((p) => p.id === taskPhaseId) : null
	);
	let assignBacklogData = $derived.by(() => modals?.assignBacklogTasks?.data || null);
	let rescheduleOverdueData = $derived.by(() => modals?.rescheduleOverdueTasks?.data || null);
	let scheduleAllPhasesData = $derived.by(() => modals?.scheduleAllPhases?.data || null);

	// Load modals when opened
	$effect(() => {
		if (isProjectEditOpen && !componentCache.projectEdit) loadModal('projectEdit');
	});
	$effect(() => {
		if (isProjectContextOpen && !componentCache.projectContext) loadModal('projectContext');
	});
	$effect(() => {
		if (isProjectHistoryOpen && !componentCache.projectHistory) {
			loadModal('projectHistory');
		}
	});
	$effect(() => {
		if (isProjectCalendarSettingsOpen && !componentCache.projectCalendarSettings)
			loadModal('projectCalendarSettings');
	});
	$effect(() => {
		if (isProjectCalendarConnectOpen && !componentCache.projectCalendarConnect)
			loadModal('projectCalendarConnect');
	});
	$effect(() => {
		if (isBriefOpen && !componentCache.brief) loadModal('brief');
	});
	$effect(() => {
		if (isTaskOpen && !componentCache.task) loadModal('task');
	});
	$effect(() => {
		if (isNoteOpen && !componentCache.note) loadModal('note');
	});
	$effect(() => {
		if (isSchedulingOpen && !componentCache.scheduling) loadModal('scheduling');
	});
	$effect(() => {
		if (isProjectDatesOpen && !componentCache.projectDates) loadModal('projectDates');
	});
	$effect(() => {
		if (isPhaseGenerationOpen && !componentCache.phaseGenerationConfirmation)
			loadModal('phaseGenerationConfirmation');
	});
	$effect(() => {
		if (isAssignBacklogTasksOpen && !componentCache.assignBacklogTasks)
			loadModal('assignBacklogTasks');
	});
	$effect(() => {
		if (isRescheduleOverdueTasksOpen && !componentCache.rescheduleOverdueTasks)
			loadModal('rescheduleOverdueTasks');
	});
	$effect(() => {
		if (isUnscheduleConfirmOpen && !componentCache.unscheduleConfirmation)
			loadModal('unscheduleConfirmation');
	});
	$effect(() => {
		if (isScheduleAllPhasesOpen && !componentCache.scheduleAllPhases)
			loadModal('scheduleAllPhases');
	});

	// Get loading message for modal
	function getLoadingMessage(modalName: string): string {
		const messages = {
			projectEdit: 'Loading editor...',
			projectContext: 'Loading context...',
			projectHistory: 'Loading history...',
			projectCalendarConnect: 'Preparing Google Calendar...',
			projectCalendarSettings: 'Loading calendar settings...',
			brief: 'Loading brief...',
			task: 'Loading task editor...',
			note: 'Loading note editor...',
			scheduling: 'Loading scheduler...',
			projectDates: 'Loading date editor...',
			phaseGenerationConfirmation: 'Loading generation options...',
			assignBacklogTasks: 'Loading task assignment...',
			rescheduleOverdueTasks: 'Loading reschedule options...',
			scheduleAllPhases: 'Loading bulk scheduler...'
		};
		return messages[modalName] || 'Loading...';
	}
</script>

<!-- Project Edit Modal -->
{#if isProjectEditOpen}
	<LoadingModal
		isOpen={loadingStates.projectEdit || !componentCache.projectEdit}
		message={getLoadingMessage('projectEdit')}
	/>
	{#if componentCache.projectEdit && !loadingStates.projectEdit}
		<svelte:component
			this={componentCache.projectEdit}
			isOpen={true}
			{project}
			on:close={() => handleCloseModal('projectEdit')}
			on:updated={onProjectUpdated}
		/>
	{/if}
{/if}

<!-- Project Context Modal -->
{#if isProjectContextOpen}
	<LoadingModal
		isOpen={loadingStates.projectContext || !componentCache.projectContext}
		message={getLoadingMessage('projectContext')}
	/>
	{#if componentCache.projectContext && !loadingStates.projectContext}
		<svelte:component
			this={componentCache.projectContext}
			isOpen={true}
			{project}
			on:close={() => handleCloseModal('projectContext')}
		/>
	{/if}
{/if}

<!-- Project History Modal -->
{#if isProjectHistoryOpen}
	<LoadingModal
		isOpen={loadingStates.projectHistory || !componentCache.projectHistory}
		message={getLoadingMessage('projectHistory')}
	/>
	{#if componentCache.projectHistory && !loadingStates.projectHistory}
		<svelte:component
			this={componentCache.projectHistory}
			isOpen={true}
			projectId={project?.id}
			on:close={() => handleCloseModal('projectHistory')}
		/>
	{/if}
{/if}

<!-- Project Calendar Connect Modal -->
{#if isProjectCalendarConnectOpen}
	<LoadingModal
		isOpen={loadingStates.projectCalendarConnect || !componentCache.projectCalendarConnect}
		message={getLoadingMessage('projectCalendarConnect')}
	/>
	{#if componentCache.projectCalendarConnect && !loadingStates.projectCalendarConnect}
		<svelte:component
			this={componentCache.projectCalendarConnect}
			isOpen={true}
			{project}
			redirectPath={calendarConnectData?.redirectPath || null}
			on:close={() => handleCloseModal('projectCalendarConnect')}
		/>
	{/if}
{/if}

<!-- Project Calendar Settings Modal -->
{#if isProjectCalendarSettingsOpen}
	<LoadingModal
		isOpen={loadingStates.projectCalendarSettings || !componentCache.projectCalendarSettings}
		message={getLoadingMessage('projectCalendarSettings')}
	/>
	{#if componentCache.projectCalendarSettings && !loadingStates.projectCalendarSettings}
		<svelte:component
			this={componentCache.projectCalendarSettings}
			isOpen={true}
			{project}
			userId={project?.user_id}
			on:close={() => handleCloseModal('projectCalendarSettings')}
			on:calendarCreated={() => {
				// Optionally refresh project data
				// toastService.success('Calendar created successfully');
			}}
			on:calendarUpdated={() => {
				console.log('Calendar settings updated');
			}}
			on:calendarDeleted={() => {
				console.log('Calendar deleted');
			}}
		/>
	{/if}
{/if}

<!-- Brief Modal -->
{#if isBriefOpen}
	<LoadingModal
		isOpen={loadingStates.brief || !componentCache.brief}
		message={getLoadingMessage('brief')}
	/>
	{#if componentCache.brief && !loadingStates.brief}
		<svelte:component
			this={componentCache.brief}
			isOpen={true}
			brief={briefData}
			on:close={() => handleCloseModal('brief')}
		/>
	{/if}
{/if}

<!-- Task Modal -->
{#if isTaskOpen}
	<LoadingModal
		isOpen={loadingStates.task || !componentCache.task}
		message={getLoadingMessage('task')}
	/>
	{#if componentCache.task && !loadingStates.task}
		<svelte:component
			this={componentCache.task}
			isOpen={true}
			task={taskData}
			projectId={project?.id}
			{project}
			phaseId={taskPhaseId}
			phase={taskPhase}
			{calendarStatus}
			onClose={() => handleCloseModal('task')}
			onCreate={handleTaskCreate}
			onUpdate={handleTaskUpdate}
			onDelete={handleTaskDelete}
		/>
	{/if}
{/if}

<!-- Note Modal -->
{#if isNoteOpen}
	<LoadingModal
		isOpen={loadingStates.note || !componentCache.note}
		message={getLoadingMessage('note')}
	/>
	{#if componentCache.note && !loadingStates.note}
		<svelte:component
			this={componentCache.note}
			isOpen={true}
			note={noteData}
			projectId={project?.id}
			on:close={() => handleCloseModal('note')}
			on:save={(e) => handleNoteUpdate(e.detail)}
			on:delete={(e) => handleNoteDelete(e.detail)}
		/>
	{/if}
{/if}

<!-- Phase Scheduling Modal -->
{#if isSchedulingOpen}
	<LoadingModal
		isOpen={loadingStates.scheduling || !componentCache.scheduling}
		message={getLoadingMessage('scheduling')}
	/>
	{#if componentCache.scheduling && !loadingStates.scheduling && schedulingData}
		<svelte:component
			this={componentCache.scheduling}
			isOpen={true}
			phase={schedulingData}
			projectId={project?.id}
			{project}
			{calendarStatus}
			on:close={() => handleCloseModal('scheduling')}
			on:scheduled={handlePhaseScheduled}
		/>
	{/if}
{/if}

<!-- Project Dates Modal -->
{#if isProjectDatesOpen}
	<LoadingModal
		isOpen={loadingStates.projectDates || !componentCache.projectDates}
		message={getLoadingMessage('projectDates')}
	/>
	{#if componentCache.projectDates && !loadingStates.projectDates}
		<svelte:component
			this={componentCache.projectDates}
			isOpen={true}
			projectStartDate={project?.start_date}
			projectEndDate={project?.end_date}
			projectId={project?.id}
			on:updated={handleDatesUpdated}
			on:close={() => handleCloseModal('projectDates')}
		/>
	{/if}
{/if}

<!-- Phase Generation Confirmation Modal -->
{#if isPhaseGenerationOpen}
	<LoadingModal
		isOpen={loadingStates.phaseGenerationConfirmation ||
			!componentCache.phaseGenerationConfirmation}
		message={getLoadingMessage('phaseGenerationConfirmation')}
	/>
	{#if componentCache.phaseGenerationConfirmation && !loadingStates.phaseGenerationConfirmation && phaseGenerationData}
		<svelte:component
			this={componentCache.phaseGenerationConfirmation}
			isOpen={true}
			projectId={phaseGenerationData.projectId}
			projectStartDate={phaseGenerationData.projectStartDate}
			projectEndDate={phaseGenerationData.projectEndDate}
			existingPhases={phaseGenerationData.existingPhases}
			isRegeneration={phaseGenerationData.isRegeneration}
			calendarConnected={calendarStatus?.isConnected === true}
			on:confirm={handleGenerationConfirm}
			on:cancel={() => handleCloseModal('phaseGenerationConfirmation')}
		/>
	{/if}
{/if}

<!-- Confirmation Modals -->
<ConfirmationModal
	isOpen={isProjectDeleteOpen}
	title="Delete Project"
	confirmText="Delete Project"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	loading={isDeleting}
	on:confirm={async () => {
		await handleCloseModal('projectDelete');
		onDeleteConfirm();
	}}
	on:cancel={() => handleCloseModal('projectDelete')}
>
	<div slot="content">
		<p class="text-sm text-gray-600 dark:text-gray-400">
			Are you sure you want to delete "{project?.name}"? This action cannot be undone.
		</p>
		{#if taskCount > 0 || noteCount > 0}
			<div class="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
				<p class="text-sm text-amber-800 dark:text-amber-200">This project contains:</p>
				<ul class="mt-1 text-sm text-amber-700 dark:text-amber-300 list-disc list-inside">
					{#if taskCount > 0}
						<li>{taskCount} task{taskCount === 1 ? '' : 's'}</li>
					{/if}
					{#if noteCount > 0}
						<li>{noteCount} note{noteCount === 1 ? '' : 's'}</li>
					{/if}
				</ul>
			</div>
		{/if}
	</div>
</ConfirmationModal>

<ConfirmationModal
	isOpen={isCalendarRefreshOpen}
	title="Refresh Calendar Connection"
	confirmText="Go to Settings"
	cancelText="Cancel"
	confirmVariant="warning"
	icon="warning"
	on:confirm={async () => {
		await handleCloseModal('calendarRefresh');
		onCalendarRefreshConfirm();
	}}
	on:cancel={() => handleCloseModal('calendarRefresh')}
>
	<div slot="content">
		<p class="text-sm text-gray-600 dark:text-gray-400">
			Your Google Calendar connection needs to be refreshed. You'll be redirected to the
			calendar settings page.
		</p>
	</div>
</ConfirmationModal>

<ConfirmationModal
	isOpen={isMarkDeletedOpen}
	title="Delete Task"
	confirmText="Delete Task"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	on:confirm={async () => {
		if (markDeletedData) {
			// Store the data before closing modal (closing clears the data)
			const taskToMarkDeleted = markDeletedData;
			await handleCloseModal('markDeleted');
			onMarkDeletedConfirm(taskToMarkDeleted);
		}
	}}
	on:cancel={() => handleCloseModal('markDeleted')}
>
	<div slot="content">
		{#if markDeletedData}
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Are you sure you want to delete "{markDeletedData.title}"?
			</p>
			<p class="text-sm text-gray-500 dark:text-gray-500 mt-2">
				Deleted tasks won't appear in your active task list but can be restored later.
			</p>
		{/if}
	</div>
</ConfirmationModal>

<!-- Unschedule All Tasks Modal -->
{#if isUnscheduleConfirmOpen}
	<LoadingModal
		isOpen={loadingStates.unscheduleConfirmation || !componentCache.unscheduleConfirmation}
		message="Loading unschedule options..."
	/>
	{#if componentCache.unscheduleConfirmation && !loadingStates.unscheduleConfirmation && unscheduleData}
		<svelte:component
			this={componentCache.unscheduleConfirmation}
			isOpen={true}
			phases={unscheduleData.phases || []}
			scheduledTaskCount={unscheduleData.scheduledTaskCount || 0}
			projectId={unscheduleData.projectId || project?.id}
			on:close={() => handleCloseModal('unscheduleConfirmation')}
			on:tasksUnscheduled={async (event) => {
				await handleCloseModal('unscheduleConfirmation');
				// Notify parent that tasks were unscheduled
				if (onPhaseUpdated) {
					onPhaseUpdated();
				}
				toastService.success(
					`${event.detail.unscheduledCount} task(s) unscheduled successfully`
				);
			}}
		/>
	{/if}
{/if}

<!-- Delete Phase Modal -->
<ConfirmationModal
	isOpen={isDeletePhaseOpen}
	title="Delete Phase"
	confirmText="Delete"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	on:confirm={() => {
		if (deletePhaseData) {
			handleDeletePhase(deletePhaseData);
		}
	}}
	on:cancel={() => handleCloseModal('deletePhase')}
>
	<div slot="content">
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Are you sure you want to delete "{deletePhaseData?.name}"? All tasks in this phase will
			be moved to the backlog.
		</p>
	</div>
</ConfirmationModal>

<!-- Delete Phase Task Modal -->
<ConfirmationModal
	isOpen={isDeletePhaseTaskOpen}
	title="Delete Task"
	confirmText="Delete"
	cancelText="Cancel"
	confirmVariant="danger"
	icon="danger"
	on:confirm={() => {
		if (deletePhaseTaskId) {
			handleDeletePhaseTask(deletePhaseTaskId);
		}
	}}
	on:cancel={() => handleCloseModal('deletePhaseTask')}
>
	<div slot="content">
		<p class="text-sm text-gray-500 dark:text-gray-400">
			Are you sure you want to delete this task? This action cannot be undone.
		</p>
	</div>
</ConfirmationModal>

<!-- Assign Backlog Tasks Modal -->
{#if isAssignBacklogTasksOpen}
	<LoadingModal
		isOpen={loadingStates.assignBacklogTasks || !componentCache.assignBacklogTasks}
		message={getLoadingMessage('assignBacklogTasks')}
	/>
	{#if componentCache.assignBacklogTasks && !loadingStates.assignBacklogTasks && assignBacklogData}
		<svelte:component
			this={componentCache.assignBacklogTasks}
			isOpen={true}
			projectId={assignBacklogData.projectId}
			backlogTasks={assignBacklogData.backlogTasks}
			phases={assignBacklogData.phases}
			calendarConnected={assignBacklogData.calendarConnected}
			on:close={() => handleCloseModal('assignBacklogTasks')}
			on:tasksAssigned={() => {
				// The modal already updates the store, but we can add any additional handling here if needed
				console.log('Tasks assigned successfully');
			}}
		/>
	{/if}
{/if}

<!-- Reschedule Overdue Tasks Modal -->
{#if isRescheduleOverdueTasksOpen}
	<LoadingModal
		isOpen={loadingStates.rescheduleOverdueTasks || !componentCache.rescheduleOverdueTasks}
		message={getLoadingMessage('rescheduleOverdueTasks')}
	/>
	{#if componentCache.rescheduleOverdueTasks && !loadingStates.rescheduleOverdueTasks && rescheduleOverdueData}
		<svelte:component
			this={componentCache.rescheduleOverdueTasks}
			isOpen={true}
			projectId={rescheduleOverdueData.projectId}
			overdueTasks={rescheduleOverdueData.overdueTasks}
			phases={rescheduleOverdueData.phases}
			calendarConnected={rescheduleOverdueData.calendarConnected}
			on:close={() => handleCloseModal('rescheduleOverdueTasks')}
		/>
	{/if}
{/if}

<!-- Schedule All Phases Modal -->
{#if isScheduleAllPhasesOpen}
	<LoadingModal
		isOpen={loadingStates.scheduleAllPhases || !componentCache.scheduleAllPhases}
		message={getLoadingMessage('scheduleAllPhases')}
	/>
	{#if componentCache.scheduleAllPhases && !loadingStates.scheduleAllPhases}
		<svelte:component
			this={componentCache.scheduleAllPhases}
			isOpen={true}
			{phases}
			projectId={project?.id}
			{project}
			{calendarStatus}
			on:close={() => handleCloseModal('scheduleAllPhases')}
			on:scheduled={(e: Event) => {
				handleCloseModal('scheduleAllPhases');
				onScheduleAllPhases(e);
			}}
		/>
	{/if}
{/if}

<style>
	/* Ensure smooth transitions globally */
	:global(*) {
		scroll-behavior: smooth;
	}

	/* Prevent layout shifts during modal transitions */
	:global(body) {
		min-height: 100vh;
		min-height: 100dvh;
	}
</style>
