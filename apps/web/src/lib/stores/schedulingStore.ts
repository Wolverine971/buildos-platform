// apps/web/src/lib/stores/schedulingStore.ts

import { writable, derived, get } from 'svelte/store';
import { calendarAPI } from '$lib/api/calendar-client';
import type { PhaseWithTasks, TaskWithCalendarEvents } from '$lib/types/project-page.types';
import type { ProposedTaskSchedule, ConflictInfo, WorkingHours } from '$lib/utils/schedulingUtils';
import { validateTaskSchedule, sortTasksByDependencies } from '$lib/utils/schedulingUtils';
import { requireApiData, requireApiSuccess } from '$lib/utils/api-client-helpers';

export type SchedulingStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'refreshing' | 'error';

export interface SchedulingState {
	status: SchedulingStatus;
	error: string | null;
	warnings: string[];

	// Data
	phase: PhaseWithTasks | null;
	proposedSchedules: ProposedTaskSchedule[];
	calendarEvents: any[];
	conflicts: ConflictInfo[];

	// User preferences
	workingHours: WorkingHours;
	timeZone: string;

	// UI state
	viewMode: 'day' | 'week' | 'month';
	currentDate: Date;
	editingTaskId: string | null;

	// Tracking
	lastLoadedPhaseId: string | null;
	isDirty: boolean;
}

const initialState: SchedulingState = {
	status: 'idle',
	error: null,
	warnings: [],
	phase: null,
	proposedSchedules: [],
	calendarEvents: [],
	conflicts: [],
	workingHours: {
		work_start_time: '09:00',
		work_end_time: '17:00',
		working_days: [1, 2, 3, 4, 5],
		default_task_duration_minutes: 60,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
	},
	timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	viewMode: 'week',
	currentDate: new Date(),
	editingTaskId: null,
	lastLoadedPhaseId: null,
	isDirty: false
};

function createSchedulingStore() {
	const { subscribe, update, set } = writable<SchedulingState>(initialState);

	// Abort controller for cancelling requests
	let abortController: AbortController | null = null;

	// Derived stores
	const totalTasks = derived([{ subscribe }], ([$state]) => $state.proposedSchedules.length);

	const conflictCount = derived(
		[{ subscribe }],
		([$state]) => $state.proposedSchedules.filter((s) => s.hasConflict).length
	);

	const unscheduledTasks = derived([{ subscribe }], ([$state]) => {
		if (!$state.phase) return [];
		return $state.phase.tasks?.filter((t) => !t.start_date) || [];
	});

	return {
		subscribe,
		totalTasks,
		conflictCount,
		unscheduledTasks,

		// Initialize store for a phase
		async initialize(phase: PhaseWithTasks, projectId: string, project?: any) {
			// Cancel any pending operations
			if (abortController) {
				abortController.abort();
			}
			abortController = new AbortController();

			update((state) => ({
				...state,
				status: 'loading',
				error: null,
				warnings: [],
				phase,
				lastLoadedPhaseId: phase.id
			}));

			try {
				// Load user preferences
				let userPreferences = initialState.workingHours;
				try {
					const prefsResponse = await fetch('/api/users/calendar-preferences');
					const prefs = await requireApiData<WorkingHours>(
						prefsResponse,
						'Failed to load calendar preferences'
					);
					if (prefs) {
						userPreferences = {
							...prefs,
							timeZone: prefs.timeZone || initialState.timeZone
						};
					}
				} catch (prefsError) {
					console.warn('Unable to load calendar preferences, using defaults', prefsError);
				}

				// Generate proposed schedule
				const scheduleResponse = await fetch(
					`/api/projects/${projectId}/phases/${phase.id}/schedule`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							preview: true,
							timeZone: userPreferences.timeZone
						}),
						signal: abortController.signal
					}
				);

				const scheduleData = await requireApiData<{
					schedule: Array<{
						taskId: string;
						proposedStart: string;
						proposedEnd: string;
						hasConflict?: boolean;
						conflictReason?: string;
						duration_minutes?: number;
					}>;
					warnings?: string[];
				}>(scheduleResponse, 'Failed to generate schedule');

				// Parse the schedule data
				const proposedSchedules: ProposedTaskSchedule[] = scheduleData.schedule
					.map((item: any) => {
						const proposedStart = new Date(item.proposedStart);
						const proposedEnd = new Date(item.proposedEnd);
						const task = phase.tasks?.find((t) => t.id === item.taskId);

						if (!task) return null;

						return {
							task,
							phaseId: phase.id,
							proposedStart,
							proposedEnd,
							originalStart: new Date(proposedStart),
							originalEnd: new Date(proposedEnd),
							hasConflict: item.hasConflict || false,
							conflictReason: item.conflictReason,
							duration_minutes: item.duration_minutes || 60
						};
					})
					.filter((item): item is NonNullable<typeof item> => Boolean(item));

				// Load calendar events
				let calendarEvents = [];
				try {
					if (phase.start_date && phase.end_date) {
						const result = await calendarAPI.getCalendarEvents({
							timeMin: new Date(phase.start_date).toISOString(),
							timeMax: new Date(phase.end_date).toISOString(),
							timeZone: userPreferences.timeZone,
							maxResults: 500
						});
						calendarEvents = result.events || [];
					}
				} catch (error) {
					console.warn('Could not load calendar events:', error);
				}

				// Validate all schedules
				const conflicts: ConflictInfo[] = [];
				proposedSchedules.forEach((schedule) => {
					const validation = validateTaskSchedule(
						schedule,
						phase,
						project,
						calendarEvents
					);
					if (!validation.isValid) {
						conflicts.push(...validation.conflicts);
					}
					if (validation.warnings.length > 0) {
						scheduleData.warnings = [
							...(scheduleData.warnings || []),
							...validation.warnings
						];
					}
				});

				update((state) => ({
					...state,
					status: 'ready',
					proposedSchedules,
					calendarEvents,
					conflicts,
					warnings: scheduleData.warnings || [],
					workingHours: userPreferences,
					currentDate: phase.start_date ? new Date(phase.start_date) : new Date()
				}));
			} catch (error: any) {
				if (error.name === 'AbortError') {
					return;
				}

				update((state) => ({
					...state,
					status: 'error',
					error: error.message || 'Failed to load scheduling data'
				}));
			}
		},

		// Update task schedule
		updateTaskSchedule(taskId: string, newStart: Date, newEnd: Date) {
			update((state) => {
				const schedules = [...state.proposedSchedules];
				const scheduleIndex = schedules.findIndex((s) => s.task.id === taskId);

				if (scheduleIndex >= 0) {
					const schedule = { ...schedules[scheduleIndex]! };
					schedule.proposedStart = newStart;
					schedule.proposedEnd = newEnd;
					schedule.duration_minutes = Math.round(
						(newEnd.getTime() - newStart.getTime()) / 60000
					);

					// Re-validate
					const validation = validateTaskSchedule(
						schedule,
						state.phase!,
						undefined,
						state.calendarEvents
					);

					schedule.hasConflict = !validation.isValid;
					schedule.conflictReason = validation.conflicts[0]?.description;

					schedules[scheduleIndex] = schedule;

					// Re-collect all conflicts from all schedules
					const conflicts: ConflictInfo[] = [];
					schedules.forEach((s) => {
						const val = validateTaskSchedule(
							s,
							state.phase!,
							undefined,
							state.calendarEvents
						);
						if (!val.isValid) {
							conflicts.push(...val.conflicts);
						}
					});

					return {
						...state,
						proposedSchedules: schedules,
						conflicts,
						isDirty: true
					};
				}

				return state;
			});
		},

		// Save all schedules
		async saveSchedules(projectId: string): Promise<boolean> {
			const state = get({ subscribe });

			if (!state.phase || state.proposedSchedules.length === 0) {
				return false;
			}

			update((s) => ({ ...s, status: 'saving', error: null }));

			try {
				const scheduleData = state.proposedSchedules.map((s) => ({
					taskId: s.task.id,
					start_date: s.proposedStart.toISOString(),
					duration_minutes: s.duration_minutes
				}));

				const response = await fetch(
					`/api/projects/${projectId}/phases/${state.phase.id}/schedule`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							preview: false,
							schedule: scheduleData,
							timeZone: state.timeZone
						})
					}
				);

				const result = await requireApiData<{ warnings?: string[] }>(
					response,
					'Failed to schedule tasks'
				);

				update((s) => ({
					...s,
					status: 'ready',
					isDirty: false,
					warnings: result.warnings || []
				}));

				return true;
			} catch (error: any) {
				update((s) => ({
					...s,
					status: 'error',
					error: error.message || 'Failed to save schedules'
				}));
				return false;
			}
		},

		// Refresh calendar events
		async refreshCalendarEvents() {
			const state = get({ subscribe });
			if (!state.phase) return;

			update((s) => ({ ...s, status: 'refreshing' }));

			try {
				const result = await calendarAPI.getCalendarEvents({
					timeMin: new Date(state.phase.start_date).toISOString(),
					timeMax: new Date(state.phase.end_date).toISOString(),
					timeZone: state.timeZone,
					maxResults: 500
				});

				update((s) => ({
					...s,
					status: 'ready',
					calendarEvents: result.events || []
				}));
			} catch (error: any) {
				update((s) => ({
					...s,
					status: 'error',
					error: 'Failed to refresh calendar events'
				}));
			}
		},

		// UI state updates
		setViewMode(mode: 'day' | 'week' | 'month') {
			update((state) => ({ ...state, viewMode: mode }));
		},

		setCurrentDate(date: Date) {
			update((state) => ({ ...state, currentDate: date }));
		},

		setEditingTask(taskId: string | null) {
			update((state) => ({ ...state, editingTaskId: taskId }));
		},

		// Reset store
		reset() {
			if (abortController) {
				abortController.abort();
			}
			set(initialState);
		}
	};
}

export const schedulingStore = createSchedulingStore();
