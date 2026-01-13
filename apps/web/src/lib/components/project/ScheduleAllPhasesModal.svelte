<!-- apps/web/src/lib/components/project/ScheduleAllPhasesModal.svelte -->
<script lang="ts">
	import { Calendar, AlertTriangle, LoaderCircle, CheckCircle2, X, Info } from 'lucide-svelte';
	import { createEventDispatcher, onMount } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import PhaseScheduleCard from '$lib/components/scheduling/PhaseScheduleCard.svelte';
	import ScheduleConflictAlert from '$lib/components/scheduling/ScheduleConflictAlert.svelte';
	import { calendarAPI } from '$lib/api/calendar-client';
	import { toastService } from '$lib/stores/toast.store';
	import { requireApiData } from '$lib/utils/api-client-helpers';
	import type { PhaseWithTasks } from '$lib/types/project-page.types';
	import type { ProposedTaskSchedule, ConflictInfo } from '$lib/utils/schedulingUtils';

	export let isOpen = false;
	export let phases: PhaseWithTasks[] = [];
	export let projectId: string;
	export let project: any;
	export let calendarStatus: any = null;

	const dispatch = createEventDispatcher();

	// State
	let loading = true;
	let saving = false;
	let error: string | null = null;
	let expandedPhases = new Set<string>();

	// Data
	let calendarEvents: any[] = [];
	let phaseSchedules = new Map<string, PhaseScheduleData>();
	let totalTasksToSchedule = 0;
	let totalScheduledTasks = 0;
	let globalConflicts: ConflictInfo[] = [];

	// Get browser timezone
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// User preferences
	let userPreferences = {
		work_start_time: '09:00',
		work_end_time: '17:00',
		working_days: [1, 2, 3, 4, 5],
		default_task_duration_minutes: 60,
		timeZone
	};

	interface PhaseScheduleData {
		phase: PhaseWithTasks;
		proposedSchedule: ProposedTaskSchedule[];
		conflicts: ConflictInfo[];
		calendarEvents: any[];
		unscheduledCount: number;
		scheduledCount: number;
	}

	// Reactive calculations
	$: phasesWithUnscheduledTasks = phases.filter((phase) =>
		phase.tasks?.some((task) => !task.start_date || !task.calendar_event_id)
	);

	$: {
		totalTasksToSchedule = 0;
		totalScheduledTasks = 0;
		phases.forEach((phase) => {
			const unscheduled =
				phase.tasks?.filter((t) => !t.start_date || !t.calendar_event_id).length || 0;
			const scheduled =
				phase.tasks?.filter((t) => t.start_date && t.calendar_event_id).length || 0;
			totalTasksToSchedule += unscheduled;
			totalScheduledTasks += scheduled;
		});
	}

	$: totalConflicts = Array.from(phaseSchedules.values()).reduce(
		(sum, data) => sum + data.conflicts.filter((c) => c.severity === 'error').length,
		0
	);

	onMount(() => {
		if (isOpen) {
			loadInitialData();
		}
	});

	async function loadInitialData() {
		loading = true;
		error = null;

		try {
			// Load user preferences
			try {
				const prefsResponse = await fetch('/api/users/calendar-preferences');
				const prefs = await requireApiData<typeof userPreferences>(
					prefsResponse,
					'Failed to load calendar preferences'
				);
				if (prefs) {
					userPreferences = { ...prefs, timeZone: prefs.timeZone || timeZone };
				}
			} catch (prefsError) {
				console.warn('Unable to load calendar preferences, using defaults', prefsError);
			}

			// Load calendar events for the project duration
			if (project.start_date && project.end_date && calendarStatus?.isConnected) {
				try {
					const result = await calendarAPI.getCalendarEvents({
						timeMin: new Date(project.start_date).toISOString(),
						timeMax: new Date(project.end_date).toISOString(),
						maxResults: 500
					});
					calendarEvents = result.events || [];
				} catch (err) {
					console.warn('Could not load calendar events:', err);
					calendarEvents = [];
				}
			}

			// Generate proposed schedules for each phase
			await generateProposedSchedules();
		} catch (err) {
			console.error('Error loading data:', err);
			error = err instanceof Error ? err.message : 'Failed to load scheduling data';
		} finally {
			loading = false;
		}
	}

	async function generateProposedSchedules() {
		phaseSchedules.clear();
		globalConflicts = [];

		for (const phase of phasesWithUnscheduledTasks) {
			try {
				// Get proposed schedule from API
				const response = await fetch(
					`/api/projects/${projectId}/phases/${phase.id}/schedule`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							preview: true,
							timeZone,
							preferences: userPreferences
						})
					}
				);

				const result = await requireApiData<{
					schedule: Array<{
						taskId: string;
						proposedStart: string;
						proposedEnd: string;
						hasConflict?: boolean;
						conflictReason?: string;
						duration_minutes?: number;
					}>;
					conflicts?: ConflictInfo[];
					warnings?: string[];
				}>(response, `Failed to generate schedule for phase ${phase.name}`);

				// Process the schedule data
				const phaseData: PhaseScheduleData = {
					phase,
					proposedSchedule: result.schedule
						.map((item: any) => ({
							task: phase.tasks.find((t) => t.id === item.taskId),
							phaseId: phase.id,
							proposedStart: new Date(item.proposedStart),
							proposedEnd: new Date(item.proposedEnd),
							hasConflict: item.hasConflict || false,
							conflictReason: item.conflictReason,
							duration_minutes: item.duration_minutes || 60
						}))
						.filter((item: any) => item.task),
					conflicts: result.conflicts || [],
					calendarEvents: filterEventsForPhase(phase),
					unscheduledCount: phase.tasks?.filter((t) => !t.start_date).length || 0,
					scheduledCount: phase.tasks?.filter((t) => t.start_date).length || 0
				};

				phaseSchedules.set(phase.id, phaseData);

				// Collect global conflicts
				if (result.conflicts) {
					globalConflicts.push(...result.conflicts);
				}
			} catch (err) {
				console.error(`Error generating schedule for phase ${phase.name}:`, err);

				// Create empty schedule for this phase
				phaseSchedules.set(phase.id, {
					phase,
					proposedSchedule: [],
					conflicts: [
						{
							type: 'phase_boundary',
							description: `Failed to generate schedule: ${err.message}`,
							affectedTaskIds: phase.tasks?.map((t) => t.id) || [],
							severity: 'error'
						}
					],
					calendarEvents: filterEventsForPhase(phase),
					unscheduledCount: phase.tasks?.filter((t) => !t.start_date).length || 0,
					scheduledCount: phase.tasks?.filter((t) => t.start_date).length || 0
				});
			}
		}
	}

	function filterEventsForPhase(phase: PhaseWithTasks): any[] {
		if (!phase.start_date || !phase.end_date) return [];

		const phaseStart = new Date(phase.start_date);
		const phaseEnd = new Date(phase.end_date);

		return calendarEvents.filter((event) => {
			const eventStart = new Date(event.start?.dateTime || event.start?.date);
			const eventEnd = new Date(event.end?.dateTime || event.end?.date);
			return eventStart <= phaseEnd && eventEnd >= phaseStart;
		});
	}

	function togglePhase(event: CustomEvent) {
		const { phaseId, expanded } = event.detail;
		if (expanded) {
			expandedPhases.add(phaseId);
		} else {
			expandedPhases.delete(phaseId);
		}
		expandedPhases = expandedPhases;
	}

	function expandAll() {
		phases.forEach((phase) => expandedPhases.add(phase.id));
		expandedPhases = expandedPhases;
	}

	function collapseAll() {
		expandedPhases.clear();
		expandedPhases = expandedPhases;
	}

	async function handleScheduleAll() {
		saving = true;
		error = null;

		try {
			const results = [];
			let successCount = 0;
			let failCount = 0;

			// Schedule each phase
			for (const [phaseId, scheduleData] of phaseSchedules) {
				if (scheduleData.proposedSchedule.length === 0) continue;

				try {
					const response = await fetch(
						`/api/projects/${projectId}/phases/${phaseId}/schedule`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								preview: false,
								schedule: scheduleData.proposedSchedule.map((item) => ({
									taskId: item.task.id,
									start_date: item.proposedStart.toISOString(),
									duration_minutes: item.duration_minutes
								})),
								timeZone,
								preferences: userPreferences
							})
						}
					);

					const result = await requireApiData<{ warnings?: string[] }>(
						response,
						`Failed to schedule phase ${scheduleData.phase.name}`
					);
					results.push(result);
					successCount += scheduleData.proposedSchedule.length;
				} catch (err) {
					console.error(`Error scheduling phase ${scheduleData.phase.name}:`, err);
					failCount += scheduleData.proposedSchedule.length;
				}
			}

			if (successCount > 0) {
				toastService.success(
					`Successfully scheduled ${successCount} tasks across ${phasesWithUnscheduledTasks.length} phases`
				);
				dispatch('scheduled', { results });
				handleClose();
			} else {
				throw new Error('Failed to schedule any tasks');
			}
		} catch (err) {
			console.error('Error scheduling phases:', err);
			error = err instanceof Error ? err.message : 'Failed to schedule phases';
		} finally {
			saving = false;
		}
	}

	function handleClose() {
		dispatch('close');
		isOpen = false;
	}
</script>

<Modal {isOpen} onClose={handleClose} title="Schedule All Phases" size="xl">
	{#snippet children()}
		<!-- Header -->
		{#snippet header()}
			<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
				<div class="flex items-center justify-between mb-3">
					<div>
						<h2 class="text-xl font-semibold text-gray-900 dark:text-white">
							Schedule All Tasks
						</h2>
						<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
							Schedule all unscheduled tasks across multiple phases
						</p>
					</div>
					<!-- Inkprint close button -->
					<button
						type="button"
						onclick={handleClose}
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-red-400/50 dark:hover:text-red-400"
						aria-label="Close modal"
					>
						<X class="h-4 w-4" />
					</button>
				</div>

				<!-- Summary Stats -->
				<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
					<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
						<div class="text-xs text-gray-500 dark:text-gray-400">Phases</div>
						<div class="text-lg font-semibold text-gray-900 dark:text-white">
							{phasesWithUnscheduledTasks.length}
						</div>
					</div>
					<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
						<div class="text-xs text-gray-500 dark:text-gray-400">
							Tasks to Schedule
						</div>
						<div class="text-lg font-semibold text-primary-600 dark:text-primary-400">
							{totalTasksToSchedule}
						</div>
					</div>
					<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
						<div class="text-xs text-gray-500 dark:text-gray-400">
							Already Scheduled
						</div>
						<div class="text-lg font-semibold text-gray-900 dark:text-white">
							{totalScheduledTasks}
						</div>
					</div>
					<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
						<div class="text-xs text-gray-500 dark:text-gray-400">Calendar Events</div>
						<div class="text-lg font-semibold text-gray-900 dark:text-white">
							{calendarEvents.length}
						</div>
					</div>
				</div>

				<!-- Action Bar -->
				<div class="flex items-center justify-between mt-4">
					<div class="flex items-center gap-2">
						<Button onclick={expandAll} variant="outline" size="sm">Expand All</Button>
						<Button onclick={collapseAll} variant="outline" size="sm"
							>Collapse All</Button
						>
					</div>
				</div>
			</div>
		{/snippet}

		<!-- Main Content -->
		<div class="flex-1 overflow-y-auto px-6 py-4 max-h-[60vh]">
			{#if loading}
				<div class="flex items-center justify-center py-12">
					<LoaderCircle class="w-8 h-8 animate-spin text-gray-400" />
					<span class="ml-3 text-gray-500 dark:text-gray-400"
						>Loading scheduling data...</span
					>
				</div>
			{:else if error}
				<div
					class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
				>
					<div class="flex items-start gap-3">
						<AlertTriangle
							class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
						/>
						<div>
							<h4 class="font-medium text-red-800 dark:text-red-200">Error</h4>
							<p class="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
						</div>
					</div>
				</div>
			{:else if phasesWithUnscheduledTasks.length === 0}
				<div class="text-center py-12">
					<CheckCircle2 class="w-12 h-12 text-green-500 mx-auto mb-4" />
					<h3 class="text-lg font-medium text-gray-900 dark:text-white">
						All tasks are scheduled!
					</h3>
					<p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
						There are no unscheduled tasks in any phase.
					</p>
				</div>
			{:else}
				<!-- Global Conflicts -->
				{#if totalConflicts > 0}
					<ScheduleConflictAlert
						conflicts={globalConflicts.filter((c) => c.severity === 'error')}
						warnings={[]}
						phaseValidationWarning={null}
					/>
					<div class="mt-4"></div>
				{/if}

				<!-- Phase Cards -->
				<div class="space-y-4">
					{#each phasesWithUnscheduledTasks as phase (phase.id)}
						<PhaseScheduleCard
							{phase}
							scheduleData={phaseSchedules.get(phase.id)}
							isExpanded={expandedPhases.has(phase.id)}
							{loading}
							on:toggle={togglePhase}
						/>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Footer -->
	{/snippet}
	{#snippet footer()}
		<div
			class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
		>
			<div class="flex items-center justify-between">
				<div class="text-sm text-gray-500 dark:text-gray-400">
					{#if totalTasksToSchedule > 0}
						<Info class="w-4 h-4 inline mr-1" />
						{totalTasksToSchedule} tasks will be scheduled across {phasesWithUnscheduledTasks.length}
						phases
					{/if}
				</div>
				<div class="flex items-center gap-3">
					<Button onclick={handleClose} variant="outline" disabled={saving}>
						Cancel
					</Button>
					<Button
						onclick={handleScheduleAll}
						variant="primary"
						disabled={saving || loading || totalTasksToSchedule === 0}
						class="min-w-[120px]"
					>
						{#if saving}
							<LoaderCircle class="w-4 h-4 animate-spin mr-2" />
							Scheduling...
						{:else}
							<Calendar class="w-4 h-4 mr-2" />
							Schedule All
						{/if}
					</Button>
				</div>
			</div>
		</div>
	{/snippet}
</Modal>
