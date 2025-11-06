// apps/web/src/lib/stores/project.store.ts
import { writable, derived, get } from 'svelte/store';
import type { Project, Note } from '$lib/types/project';
import type {
	TaskWithCalendarEvents,
	ProcessedPhase,
	CalendarStatus,
	TaskStats
} from '$lib/types/project-page.types';
import { eventBus, PROJECT_EVENTS, type LocalUpdatePayload } from '$lib/utils/event-bus';
import { performanceMonitor } from '$lib/utils/performance-monitor';

// Loading states for granular control
export type LoadingState = 'idle' | 'loading' | 'success' | 'error' | 'refreshing';

// Optimistic update tracking
interface OptimisticUpdate<T = any> {
	id: string;
	type: 'create' | 'update' | 'delete';
	entity: 'task' | 'note' | 'phase' | 'project';
	tempData: T;
	originalData?: T;
	status: 'pending' | 'success' | 'failed';
	timestamp: number;
	retryCount: number;
	apiCall?: Promise<any>;
}

// Cache entry with TTL
interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number; // milliseconds
}

// Enhanced store state
interface ProjectStoreV2State {
	// Core data
	project: Project | null;
	projectCalendar: any | null; // Project calendar data with color
	tasks: TaskWithCalendarEvents[];
	notes: Note[];
	phases: ProcessedPhase[];
	briefs: any[];
	synthesis: any | null;
	braindumps: any[] | null;

	// Metadata
	stats: TaskStats;
	calendarStatus: CalendarStatus | null;

	// Loading states for each data type
	loadingStates: {
		project: LoadingState;
		tasks: LoadingState;
		notes: LoadingState;
		phases: LoadingState;
		briefs: LoadingState;
		synthesis: LoadingState;
		stats: LoadingState;
		calendar: LoadingState;
		braindumps: LoadingState;
	};

	// Error states
	errors: {
		project: string | null;
		tasks: string | null;
		notes: string | null;
		phases: string | null;
		briefs: string | null;
		synthesis: string | null;
		stats: string | null;
		calendar: string | null;
		braindumps: string | null;
	};

	// UI State
	activeTab: string;
	selectedFilters: string[];
	globalTaskFilters: string[];
	phaseTaskFilters: Record<string, string[]>;

	// Optimistic updates tracking
	optimisticUpdates: Map<string, OptimisticUpdate>;

	// Cache management
	cache: Map<string, CacheEntry<any>>;

	// Flags
	isInitialized: boolean;
	lastFetch: Record<string, number>;
}

class ProjectStoreV2 {
	private store;
	private updateQueue: Map<string, Promise<any>> = new Map();
	private subscribers: Set<(state: ProjectStoreV2State) => void> = new Set();

	constructor() {
		const initialState: ProjectStoreV2State = {
			project: null,
			projectCalendar: null,
			tasks: [],
			notes: [],
			phases: [],
			briefs: [],
			synthesis: null,
			braindumps: null,
			stats: {
				total: 0,
				completed: 0,
				inProgress: 0,
				blocked: 0,
				deleted: 0,
				active: 0,
				scheduled: 0,
				backlog: 0
			},
			calendarStatus: null,
			loadingStates: {
				project: 'idle',
				tasks: 'idle',
				notes: 'idle',
				phases: 'idle',
				briefs: 'idle',
				synthesis: 'idle',
				stats: 'idle',
				calendar: 'idle',
				braindumps: 'idle'
			},
			errors: {
				project: null,
				tasks: null,
				notes: null,
				phases: null,
				briefs: null,
				synthesis: null,
				stats: null,
				calendar: null,
				braindumps: null
			},
			activeTab: 'overview',
			selectedFilters: [],
			globalTaskFilters: ['active', 'scheduled', 'overdue', 'recurring'],
			phaseTaskFilters: {},
			optimisticUpdates: new Map(),
			cache: new Map(),
			isInitialized: false,
			lastFetch: {}
		};

		this.store = writable<ProjectStoreV2State>(initialState);
	}

	// Subscribe to store changes
	subscribe(fn: (state: ProjectStoreV2State) => void) {
		return this.store.subscribe(fn);
	}

	// Initialize with minimal server data
	initialize(
		projectData: {
			id: string;
			name: string;
			slug: string;
			description?: string;
			status?: string;
		},
		projectCalendar?: any
	) {
		this.store.update((state) => ({
			...state,
			project: projectData as Project,
			projectCalendar: projectCalendar || null,
			isInitialized: true,
			loadingStates: {
				...state.loadingStates,
				project: 'success'
			}
		}));

		// FIXED: Start periodic cleanup to prevent memory leaks
		this.startCleanupInterval();
	}

	// Hydrate store slices with data streamed from the server load
	hydrateFromServer(data: {
		tasks?: TaskWithCalendarEvents[];
		phases?: ProcessedPhase[];
		notes?: Note[];
		stats?: TaskStats;
		calendarStatus?: CalendarStatus | null;
	}): void {
		const timestamp = Date.now();
		let shouldRecalculateStats = false;

		this.store.update((state) => {
			const nextState = {
				...state,
				loadingStates: { ...state.loadingStates },
				errors: { ...state.errors },
				lastFetch: { ...state.lastFetch }
			};

			if (data.tasks) {
				nextState.tasks = data.tasks;
				nextState.loadingStates.tasks = 'success';
				nextState.errors.tasks = null;
				nextState.lastFetch.tasks = timestamp;
				shouldRecalculateStats = true;
			}

			if (data.notes) {
				nextState.notes = data.notes;
				nextState.loadingStates.notes = 'success';
				nextState.errors.notes = null;
				nextState.lastFetch.notes = timestamp;
			}

			if (data.phases) {
				const phasesWithTasks = data.phases.map((phase) => ({
					...phase,
					tasks: Array.isArray(phase.tasks) ? phase.tasks : [],
					task_count: phase.task_count ?? phase.tasks?.length ?? 0,
					completed_tasks:
						phase.completed_tasks ??
						((phase.tasks || []).filter(
							(task: any) => task.status === 'done' && !task.deleted_at
						).length ||
							0)
				}));

				nextState.phases = phasesWithTasks;
				nextState.loadingStates.phases = 'success';
				nextState.errors.phases = null;
				nextState.lastFetch.phases = timestamp;
				shouldRecalculateStats = true;
			}

			if (typeof data.calendarStatus !== 'undefined') {
				nextState.calendarStatus = data.calendarStatus;
				nextState.loadingStates.calendar = 'success';
				nextState.errors.calendar = null;
				nextState.lastFetch.calendar = timestamp;
			}

			if (data.stats) {
				nextState.stats = {
					...nextState.stats,
					...data.stats
				};
				nextState.loadingStates.stats = 'success';
				nextState.errors.stats = null;
				nextState.lastFetch.stats = timestamp;
			}

			return nextState;
		});

		if (shouldRecalculateStats) {
			this.updateStats();
		}
	}

	setStreamingError(key: keyof ProjectStoreV2State['errors'], message: string): void {
		this.setError(key, message);
	}

	// Progressive data loading methods
	async loadTasks(projectId: string, force = false): Promise<void> {
		const state = get(this.store);

		// Check cache unless forced
		if (!force && this.isCacheValid('tasks', 60000)) {
			// 1 minute cache
			return;
		}

		// Avoid duplicate requests UNLESS forced (force overrides duplicate check)
		if (!force && state.loadingStates.tasks === 'loading') {
			console.log('[Store] Skipping duplicate tasks request (already loading)');
			return;
		}

		this.updateLoadingState('tasks', 'loading');

		// Start performance monitoring
		performanceMonitor.startTimer('store-operation-loadTasks', { projectId, force });
		const t0 = performance.now();

		try {
			// Add timeout to prevent hanging forever
			const controller = new AbortController();
			const timeoutId = setTimeout(() => {
				controller.abort();
				console.error('[Store] Tasks fetch timed out after 15s');
			}, 15000); // 15 second timeout

			// DETAILED TIMING: Track fetch time
			const fetchStart = performance.now();
			const response = await fetch(`/api/projects/${projectId}/tasks`, {
				signal: controller.signal
			});
			const fetchTime = performance.now() - fetchStart;

			clearTimeout(timeoutId);

			if (!response.ok) throw new Error('Failed to fetch tasks');

			// DETAILED TIMING: Track JSON parsing time
			const parseStart = performance.now();
			const result = await response.json();
			const parseTime = performance.now() - parseStart;

			if (result.success) {
				// The tasks endpoint returns { tasks: [...] } directly in data
				const tasksList = result.data?.tasks || result.tasks || [];

				// DETAILED TIMING: Track merge time
				const mergeStart = performance.now();
				const mergedTasks = this.mergeWithOptimistic(tasksList, 'task');
				const mergeTime = performance.now() - mergeStart;

				// DETAILED TIMING: Track store update time
				const storeUpdateStart = performance.now();
				this.store.update((state) => ({
					...state,
					tasks: mergedTasks,
					loadingStates: { ...state.loadingStates, tasks: 'success' },
					errors: { ...state.errors, tasks: null },
					lastFetch: { ...state.lastFetch, tasks: Date.now() }
				}));
				const storeUpdateTime = performance.now() - storeUpdateStart;

				// DETAILED TIMING: Track stats calculation time
				const statsStart = performance.now();
				this.updateStats();
				const statsTime = performance.now() - statsStart;

				const totalTime = performance.now() - t0;

				// Log detailed breakdown
				console.log(`[Store] loadTasks breakdown (${totalTime.toFixed(0)}ms total):`, {
					fetch: `${fetchTime.toFixed(0)}ms`,
					parse: `${parseTime.toFixed(0)}ms`,
					merge: `${mergeTime.toFixed(0)}ms`,
					storeUpdate: `${storeUpdateTime.toFixed(0)}ms`,
					stats: `${statsTime.toFixed(0)}ms`,
					taskCount: tasksList.length
				});

				// End performance monitoring on success
				performanceMonitor.endTimer('store-operation-loadTasks', {
					projectId,
					taskCount: tasksList.length,
					fetchTime,
					parseTime,
					mergeTime,
					storeUpdateTime,
					statsTime
				});
			} else {
				console.error('[Store] Tasks API returned success: false', result);
				this.setError('tasks', result.error || 'Failed to load tasks');
				// End performance monitoring on API error
				performanceMonitor.endTimer('store-operation-loadTasks', {
					projectId,
					error: result.error
				});
			}
		} catch (error) {
			// Handle timeout specifically
			if (error instanceof Error && error.name === 'AbortError') {
				console.error('[Store] Tasks fetch aborted (timeout)');
				this.setError('tasks', 'Request timed out. Please refresh the page.');
			} else {
				console.error('[Store] Error loading tasks:', error);
				this.setError(
					'tasks',
					error instanceof Error ? error.message : 'Failed to load tasks'
				);
			}
			// End performance monitoring on exception
			performanceMonitor.endTimer('store-operation-loadTasks', {
				projectId,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	async loadNotes(projectId: string, force = false): Promise<void> {
		const state = get(this.store);

		if (!force && this.isCacheValid('notes', 60000)) return;
		if (state.loadingStates.notes === 'loading') return;

		this.updateLoadingState('notes', 'loading');

		try {
			const response = await fetch(`/api/projects/${projectId}/notes`);
			if (!response.ok) throw new Error('Failed to fetch notes');

			const result = await response.json();
			if (result.success) {
				const notesList = result.data?.notes || [];
				this.store.update((state) => ({
					...state,
					notes: this.mergeWithOptimistic(notesList, 'note'),
					loadingStates: { ...state.loadingStates, notes: 'success' },
					errors: { ...state.errors, notes: null },
					lastFetch: { ...state.lastFetch, notes: Date.now() }
				}));
			}
		} catch (error) {
			this.setError('notes', error instanceof Error ? error.message : 'Failed to load notes');
		}
	}

	async loadPhases(projectId: string, force = false): Promise<void> {
		const state = get(this.store);

		if (!force && this.isCacheValid('phases', 120000)) {
			return;
		}
		// Avoid duplicate requests UNLESS forced (force overrides duplicate check)
		if (!force && state.loadingStates.phases === 'loading') {
			console.log('[Store] Skipping duplicate phases request (already loading)');
			return;
		}

		this.updateLoadingState('phases', 'loading');

		try {
			// Add timeout to prevent hanging forever
			const controller = new AbortController();
			const timeoutId = setTimeout(() => {
				controller.abort();
				console.error('[Store] Phases fetch timed out after 15s');
			}, 15000); // 15 second timeout

			const response = await fetch(`/api/projects/${projectId}/phases`, {
				signal: controller.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) throw new Error('Failed to fetch phases');

			const result = await response.json();

			if (result.success) {
				const phasesList = result.data?.phases || result.phases || [];

				// Ensure each phase has tasks array initialized
				const phasesWithTasks = phasesList.map((phase: any) => ({
					...phase,
					tasks: Array.isArray(phase.tasks) ? phase.tasks : [],
					task_count: phase.task_count || phase.tasks?.length || 0,
					completed_tasks: phase.completed_tasks || 0
				}));

				this.store.update((state) => ({
					...state,
					phases: phasesWithTasks,
					loadingStates: { ...state.loadingStates, phases: 'success' },
					errors: { ...state.errors, phases: null },
					lastFetch: { ...state.lastFetch, phases: Date.now() }
				}));
			} else {
				console.error('[Store] API returned success: false', result);
				this.setError('phases', result.error || 'Failed to load phases');
			}
		} catch (error) {
			// Handle timeout specifically
			if (error instanceof Error && error.name === 'AbortError') {
				console.error('[Store] Phases fetch aborted (timeout)');
				this.setError('phases', 'Request timed out. Please refresh the page.');
			} else {
				console.error('[Store] Error loading phases:', error);
				this.setError(
					'phases',
					error instanceof Error ? error.message : 'Failed to load phases'
				);
			}
		}
	}

	async loadStats(projectId: string, force = false): Promise<void> {
		const state = get(this.store);

		if (!force && this.isCacheValid('stats', 30000)) return; // 30 second cache
		if (state.loadingStates.stats === 'loading') return;

		this.updateLoadingState('stats', 'loading');

		try {
			const response = await fetch(`/api/projects/${projectId}/stats`);
			if (!response.ok) throw new Error('Failed to fetch stats');

			const result = await response.json();
			if (result.success) {
				this.store.update((state) => ({
					...state,
					stats: result.data.stats,
					loadingStates: { ...state.loadingStates, stats: 'success' },
					errors: { ...state.errors, stats: null },
					lastFetch: { ...state.lastFetch, stats: Date.now() }
				}));
			}
		} catch (error) {
			this.setError('stats', error instanceof Error ? error.message : 'Failed to load stats');
		}
	}

	async loadBraindumps(force = false): Promise<void> {
		const state = get(this.store);

		if (!state.project?.id) return;

		if (!force && this.isCacheValid('braindumps', 120000)) return; // 2 minute cache
		if (state.loadingStates.braindumps === 'loading') return;

		this.updateLoadingState('braindumps', 'loading');

		try {
			const response = await fetch(`/api/projects/${state.project.id}/braindumps`);
			if (!response.ok) throw new Error('Failed to fetch braindumps');

			const result = await response.json();
			const braindumpsList = result.braindumps || [];

			this.store.update((state) => ({
				...state,
				braindumps: braindumpsList,
				loadingStates: { ...state.loadingStates, braindumps: 'success' },
				errors: { ...state.errors, braindumps: null },
				lastFetch: { ...state.lastFetch, braindumps: Date.now() }
			}));
		} catch (error) {
			this.setError(
				'braindumps',
				error instanceof Error ? error.message : 'Failed to load braindumps'
			);
		}
	}

	// Optimistic update methods
	async optimisticCreateTask(task: Partial<TaskWithCalendarEvents>, apiCall: () => Promise<any>) {
		// Generate a proper UUID v4 for temporary ID
		const tempId = crypto.randomUUID();
		const tempTask = {
			...task,
			id: tempId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		} as TaskWithCalendarEvents;

		// Add optimistic update tracking
		const update: OptimisticUpdate = {
			id: tempId,
			type: 'create',
			entity: 'task',
			tempData: tempTask,
			status: 'pending',
			timestamp: Date.now(),
			retryCount: 0
		};

		// Apply optimistic update - add to both tasks array AND appropriate phase if phase_id exists
		this.store.update((state) => {
			const newState = {
				...state,
				tasks: [...state.tasks, tempTask],
				optimisticUpdates: new Map(state.optimisticUpdates).set(tempId, update)
			};

			// If task has a phase assignment, add it to that phase's tasks array
			// @ts-ignore - phase_id might be passed but not in type
			const phaseId = (task as any).phase_id;
			if (phaseId) {
				newState.phases = state.phases.map((phase) => {
					if (phase.id === phaseId) {
						return {
							...phase,
							tasks: [...(phase.tasks || []), tempTask]
						};
					}
					return phase;
				});
			} else {
				newState.phases = state.phases;
			}

			return newState;
		});

		this.updateStats();

		// Track this update BEFORE API call to prevent race condition
		// Use tempId for tracking since that's what's in the store now
		eventBus.emit<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, {
			entityId: tempId,
			entityType: 'task',
			timestamp: Date.now()
		});

		try {
			// Execute API call
			const result = await apiCall();

			// Track the real ID as well after we get it
			if (result?.id && result.id !== tempId) {
				eventBus.emit<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, {
					entityId: result.id,
					entityType: 'task',
					timestamp: Date.now()
				});
			}

			// Replace temp with real data in both tasks array AND phases
			this.store.update((state) => {
				const newTasks = state.tasks.map((t) => (t.id === tempId ? result : t));
				const newPhases = state.phases.map((phase) => {
					if (phase.tasks) {
						return {
							...phase,
							tasks: phase.tasks.map((t) => (t.id === tempId ? result : t))
						};
					}
					return phase;
				});

				return {
					...state,
					tasks: newTasks,
					phases: newPhases,
					optimisticUpdates: (() => {
						const updates = new Map(state.optimisticUpdates);
						updates.delete(tempId);
						return updates;
					})()
				};
			});

			this.updateStats();
			return result;
		} catch (error) {
			// Rollback on failure
			this.rollbackOptimisticUpdate(tempId);
			throw error;
		}
	}

	async optimisticUpdateTask(
		taskId: string,
		updates: Partial<TaskWithCalendarEvents>,
		apiCall: () => Promise<any>
	) {
		const state = get(this.store);
		const originalTask = state.tasks.find((t) => t.id === taskId);

		if (!originalTask) return;

		const updateId = `update_${taskId}_${Date.now()}`;
		const updatedTask = { ...originalTask, ...updates, updated_at: new Date().toISOString() };

		// Track update
		const update: OptimisticUpdate = {
			id: updateId,
			type: 'update',
			entity: 'task',
			tempData: updatedTask,
			originalData: originalTask,
			status: 'pending',
			timestamp: Date.now(),
			retryCount: 0
		};

		// Apply optimistic update - update both tasks array AND tasks within phases
		this.store.update((state) => {
			let newPhases = [...state.phases];

			// Handle phase changes - if phase_id changed, move task between phases
			// @ts-ignore - phase_id might be passed but not in type
			const updatePhaseId = (updates as any).phase_id;
			// @ts-ignore
			const originalPhaseId = (originalTask as any).phase_id;
			if (updatePhaseId !== undefined && updatePhaseId !== originalPhaseId) {
				// Remove from old phase (if it had one)
				if (originalPhaseId) {
					newPhases = newPhases.map((phase) => {
						if (phase.id === originalPhaseId) {
							return {
								...phase,
								tasks: phase.tasks ? phase.tasks.filter((t) => t.id !== taskId) : []
							};
						}
						return phase;
					});
				}

				// Add to new phase (if specified)
				if (updatePhaseId) {
					newPhases = newPhases.map((phase) => {
						if (phase.id === updatePhaseId) {
							return {
								...phase,
								tasks: [...(phase.tasks || []), updatedTask]
							};
						}
						return phase;
					});
				}
			} else {
				// Just update the task in its current phase
				newPhases = newPhases.map((phase) => ({
					...phase,
					tasks: phase.tasks
						? phase.tasks.map((t) => (t.id === taskId ? updatedTask : t))
						: []
				}));
			}

			return {
				...state,
				tasks: state.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
				phases: newPhases,
				optimisticUpdates: new Map(state.optimisticUpdates).set(updateId, update)
			};
		});

		this.updateStats();

		// Track this update BEFORE API call to prevent race condition
		eventBus.emit<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, {
			entityId: taskId,
			entityType: 'task',
			timestamp: Date.now()
		});

		try {
			const result = await apiCall();

			// Result tracking already done above - no need to duplicate
			// if (result?.id) {
			// 	RealtimeProjectService.trackLocalUpdate(result.id);
			// }

			// Confirm update with server data - update both tasks array AND tasks within phases
			this.store.update((state) => {
				let newPhases = [...state.phases];

				// Handle phase changes based on actual result from server
				const resultWithPhase = result as any;
				const resultPhaseId =
					resultWithPhase.phase_id ||
					(resultWithPhase.phase_tasks && resultWithPhase.phase_tasks[0]?.phase_id);
				const originalWithPhase = originalTask as any;
				const originalPhaseId =
					originalWithPhase.phase_id ||
					(originalWithPhase.phase_tasks && originalWithPhase.phase_tasks[0]?.phase_id);

				if (resultPhaseId !== originalPhaseId) {
					// Remove from old phase
					if (originalPhaseId) {
						newPhases = newPhases.map((phase) => {
							if (phase.id === originalPhaseId) {
								return {
									...phase,
									tasks: phase.tasks
										? phase.tasks.filter((t) => t.id !== taskId)
										: []
								};
							}
							return phase;
						});
					}

					// Add to new phase
					if (resultPhaseId) {
						newPhases = newPhases.map((phase) => {
							if (phase.id === resultPhaseId) {
								return {
									...phase,
									tasks: [...(phase.tasks || []), result]
								};
							}
							return phase;
						});
					}
				} else {
					// Just update the task in its current phase
					newPhases = newPhases.map((phase) => ({
						...phase,
						tasks: phase.tasks
							? phase.tasks.map((t) => (t.id === taskId ? result : t))
							: []
					}));
				}

				return {
					...state,
					tasks: state.tasks.map((t) => (t.id === taskId ? result : t)),
					phases: newPhases,
					optimisticUpdates: (() => {
						const updates = new Map(state.optimisticUpdates);
						updates.delete(updateId);
						return updates;
					})()
				};
			});

			this.updateStats();
			return result;
		} catch (error) {
			// Rollback to original
			this.rollbackOptimisticUpdate(updateId);
			throw error;
		}
	}

	async optimisticDeleteTask(taskId: string, apiCall: () => Promise<any>) {
		const state = get(this.store);
		const originalTask = state.tasks.find((t) => t.id === taskId);

		if (!originalTask) return;

		const updateId = `delete_${taskId}_${Date.now()}`;

		// Track deletion
		const update: OptimisticUpdate = {
			id: updateId,
			type: 'delete',
			entity: 'task',
			tempData: null,
			originalData: originalTask,
			status: 'pending',
			timestamp: Date.now(),
			retryCount: 0
		};

		// Apply optimistic deletion
		this.store.update((state) => ({
			...state,
			tasks: state.tasks.filter((t) => t.id !== taskId),
			// Also remove the task from phases
			phases: state.phases.map((phase) => ({
				...phase,
				tasks: phase.tasks ? phase.tasks.filter((t) => t.id !== taskId) : []
			})),
			optimisticUpdates: new Map(state.optimisticUpdates).set(updateId, update)
		}));

		this.updateStats();

		try {
			await apiCall();

			// Track this deletion to avoid processing it from realtime
			eventBus.emit<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, {
				entityId: taskId,
				entityType: 'task',
				timestamp: Date.now()
			});

			// Confirm deletion
			this.store.update((state) => ({
				...state,
				optimisticUpdates: (() => {
					const updates = new Map(state.optimisticUpdates);
					updates.delete(updateId);
					return updates;
				})()
			}));

			return true;
		} catch (error) {
			// Restore on failure
			this.rollbackOptimisticUpdate(updateId);
			throw error;
		}
	}

	// Similar methods for notes
	async optimisticCreateNote(note: Partial<Note>, apiCall: () => Promise<any>) {
		// Generate a proper UUID v4 for temporary ID
		const tempId = crypto.randomUUID();
		const tempNote = {
			...note,
			id: tempId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		} as Note;

		const update: OptimisticUpdate = {
			id: tempId,
			type: 'create',
			entity: 'note',
			tempData: tempNote,
			status: 'pending',
			timestamp: Date.now(),
			retryCount: 0
		};

		this.store.update((state) => ({
			...state,
			notes: [...state.notes, tempNote],
			optimisticUpdates: new Map(state.optimisticUpdates).set(tempId, update)
		}));

		try {
			const result = await apiCall();

			// Track this update to avoid processing it from realtime
			if (result?.id) {
				eventBus.emit<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, {
					entityId: result.id,
					entityType: 'note',
					timestamp: Date.now()
				});
			}

			this.store.update((state) => ({
				...state,
				notes: state.notes.map((n) => (n.id === tempId ? result : n)),
				optimisticUpdates: (() => {
					const updates = new Map(state.optimisticUpdates);
					updates.delete(tempId);
					return updates;
				})()
			}));

			return result;
		} catch (error) {
			this.rollbackOptimisticUpdate(tempId);
			throw error;
		}
	}

	async optimisticUpdateNote(
		noteId: string,
		updates: Partial<Note>,
		apiCall: () => Promise<any>
	) {
		const state = get(this.store);
		const originalNote = state.notes.find((n) => n.id === noteId);

		if (!originalNote) return;

		const updateId = `update_note_${noteId}_${Date.now()}`;
		const updatedNote = { ...originalNote, ...updates, updated_at: new Date().toISOString() };

		const update: OptimisticUpdate = {
			id: updateId,
			type: 'update',
			entity: 'note',
			tempData: updatedNote,
			originalData: originalNote,
			status: 'pending',
			timestamp: Date.now(),
			retryCount: 0
		};

		this.store.update((state) => ({
			...state,
			notes: state.notes.map((n) => (n.id === noteId ? updatedNote : n)),
			optimisticUpdates: new Map(state.optimisticUpdates).set(updateId, update)
		}));

		try {
			const result = await apiCall();

			// Track this update to avoid processing it from realtime
			if (result?.id) {
				eventBus.emit<LocalUpdatePayload>(PROJECT_EVENTS.LOCAL_UPDATE, {
					entityId: result.id,
					entityType: 'note',
					timestamp: Date.now()
				});
			}

			this.store.update((state) => ({
				...state,
				notes: state.notes.map((n) => (n.id === noteId ? result : n)),
				optimisticUpdates: (() => {
					const updates = new Map(state.optimisticUpdates);
					updates.delete(updateId);
					return updates;
				})()
			}));

			return result;
		} catch (error) {
			this.rollbackOptimisticUpdate(updateId);
			throw error;
		}
	}

	// Helper methods
	private updateLoadingState(
		key: keyof ProjectStoreV2State['loadingStates'],
		state: LoadingState
	) {
		this.store.update((s) => ({
			...s,
			loadingStates: { ...s.loadingStates, [key]: state }
		}));
	}

	private setError(key: keyof ProjectStoreV2State['errors'], error: string | null) {
		this.store.update((s) => ({
			...s,
			errors: { ...s.errors, [key]: error },
			loadingStates: { ...s.loadingStates, [key]: 'error' }
		}));
	}

	private isCacheValid(key: string, ttl: number): boolean {
		const state = get(this.store);
		const lastFetch = state.lastFetch[key];
		if (!lastFetch) return false;
		return Date.now() - lastFetch < ttl;
	}

	private mergeWithOptimistic<T extends { id: string }>(
		serverData: T[],
		entityType: string
	): T[] {
		const state = get(this.store);
		const optimisticUpdates = Array.from(state.optimisticUpdates.values()).filter(
			(u) => u.entity === entityType && u.status === 'pending'
		);

		// Start with server data
		let merged = [...serverData];

		// Apply optimistic updates
		for (const update of optimisticUpdates) {
			if (update.type === 'create' && update.tempData) {
				// Add if not already present
				if (!merged.find((item) => item.id === update.tempData.id)) {
					merged.push(update.tempData as T);
				}
			} else if (update.type === 'update' && update.tempData) {
				// Update existing
				merged = merged.map((item) =>
					item.id === update.tempData.id ? (update.tempData as T) : item
				);
			} else if (update.type === 'delete' && update.originalData) {
				// Remove deleted
				merged = merged.filter((item) => item.id !== update.originalData.id);
			}
		}

		return merged;
	}

	private rollbackOptimisticUpdate(updateId: string) {
		const state = get(this.store);
		const update = state.optimisticUpdates.get(updateId);

		if (!update) return;

		this.store.update((state) => {
			let newState = { ...state };

			if (update.type === 'create') {
				// Remove created item
				if (update.entity === 'task') {
					newState.tasks = state.tasks.filter((t) => t.id !== update.tempData?.id);
					// Also remove from phases
					newState.phases = state.phases.map((phase) => ({
						...phase,
						tasks: phase.tasks
							? phase.tasks.filter((t) => t.id !== update.tempData?.id)
							: []
					}));
				} else if (update.entity === 'note') {
					newState.notes = state.notes.filter((n) => n.id !== update.tempData?.id);
				}
			} else if (update.type === 'update' && update.originalData) {
				// Restore original
				if (update.entity === 'task') {
					newState.tasks = state.tasks.map((t) =>
						t.id === update.originalData?.id ? update.originalData : t
					);
					// Also restore in phases
					newState.phases = state.phases.map((phase) => ({
						...phase,
						tasks: phase.tasks
							? phase.tasks.map((t) =>
									t.id === update.originalData?.id ? update.originalData : t
								)
							: []
					}));
				} else if (update.entity === 'note') {
					newState.notes = state.notes.map((n) =>
						n.id === update.originalData?.id ? update.originalData : n
					);
				}
			} else if (update.type === 'delete' && update.originalData) {
				// Restore deleted
				if (update.entity === 'task') {
					newState.tasks = [...state.tasks, update.originalData];
					// Also restore in the appropriate phase if it had a phase_id
					// @ts-ignore - phase_id might exist on originalData
					const phaseId = (update.originalData as any).phase_id;
					if (phaseId) {
						newState.phases = state.phases.map((phase) => {
							if (phase.id === phaseId) {
								return {
									...phase,
									tasks: [...(phase.tasks || []), update.originalData]
								};
							}
							return phase;
						});
					}
					// Also restore the task to its phase if it had one
					const originalTask = update.originalData as any;
					// @ts-ignore - phase_id might exist
					const taskPhaseId = originalTask.phase_id;
					if (taskPhaseId) {
						newState.phases = state.phases.map((phase) => {
							if (phase.id === taskPhaseId) {
								return {
									...phase,
									tasks: [...(phase.tasks || []), originalTask]
								};
							}
							return phase;
						});
					}
				} else if (update.entity === 'note') {
					newState.notes = [...state.notes, update.originalData];
				}
			}

			// Remove from tracking
			const updates = new Map(state.optimisticUpdates);
			updates.delete(updateId);
			newState.optimisticUpdates = updates;

			return newState;
		});

		this.updateStats();
	}

	// FIXED: Debounce stats updates to prevent reactive loops
	private updateStatsTimeout: NodeJS.Timeout | null = null;
	private cleanupInterval: NodeJS.Timeout | null = null;
	private readonly OPTIMISTIC_UPDATE_TTL = 5 * 60 * 1000; // 5 minutes
	private readonly CACHE_TTL = 60 * 1000; // 1 minute default cache TTL
	private readonly CLEANUP_INTERVAL = 2 * 60 * 1000; // Run cleanup every 2 minutes

	private updateStats() {
		// Clear existing timeout
		if (this.updateStatsTimeout) {
			clearTimeout(this.updateStatsTimeout);
		}

		// Debounce stats calculation to prevent excessive reactive updates
		this.updateStatsTimeout = setTimeout(() => {
			this.calculateAndSetStats();
			this.updateStatsTimeout = null;
		}, 50); // 50ms debounce
	}

	// FIXED: Cleanup old optimistic updates and cache entries to prevent memory leaks
	private cleanupMaps() {
		const now = Date.now();
		const state = get(this.store);
		let optimisticCleaned = 0;
		let cacheCleaned = 0;

		// Clean up old optimistic updates (5 minutes TTL)
		for (const [key, update] of state.optimisticUpdates) {
			if (now - update.timestamp > this.OPTIMISTIC_UPDATE_TTL) {
				state.optimisticUpdates.delete(key);
				optimisticCleaned++;
			}
		}

		// Clean up old cache entries (1 minute TTL for most, longer for specific types)
		for (const [key, entry] of state.cache) {
			const ttl = this.getCacheTTL(key);
			if (now - entry.timestamp > ttl) {
				state.cache.delete(key);
				cacheCleaned++;
			}
		}

		// Log cleanup activity for monitoring
		if (optimisticCleaned > 0 || cacheCleaned > 0) {
			console.log(
				`[ProjectStore] Cleaned up ${optimisticCleaned} optimistic updates, ${cacheCleaned} cache entries`
			);
		}

		// Update store to trigger reactivity
		this.store.set({ ...state });
	}

	// Get appropriate TTL for different cache keys
	private getCacheTTL(key: string): number {
		if (key.includes('tasks') || key.includes('phases')) {
			return 5 * 60 * 1000; // 5 minutes for tasks and phases
		}
		if (key.includes('stats')) {
			return 2 * 60 * 1000; // 2 minutes for stats
		}
		return this.CACHE_TTL; // 1 minute default
	}

	// Start periodic cleanup
	private startCleanupInterval() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
		}

		this.cleanupInterval = setInterval(() => {
			this.cleanupMaps();
		}, this.CLEANUP_INTERVAL);
	}

	// Stop periodic cleanup
	private stopCleanupInterval() {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
	}

	private calculateAndSetStats() {
		const state = get(this.store);
		const tasks = state.tasks;

		// PERFORMANCE OPTIMIZATION: Single-pass calculation instead of multiple filters
		// Pre-calculate phased task IDs once
		const phasedTaskIds = new Set(state.phases.flatMap((p) => p.tasks?.map((t) => t.id) || []));

		// Single pass through tasks to calculate all stats at once
		let activeCount = 0;
		let completedCount = 0;
		let inProgressCount = 0;
		let blockedCount = 0;
		let deletedCount = 0;
		let scheduledCount = 0;
		let backlogCount = 0;

		for (const task of tasks) {
			// Deleted tasks
			if (task.deleted_at) {
				deletedCount++;
				continue;
			}

			// Completed tasks
			if (task.status === 'done') {
				completedCount++;
				continue;
			}

			// Active tasks (not deleted, not done)
			activeCount++;

			// Status counts
			if (task.status === 'in_progress') {
				inProgressCount++;
			} else if (task.status === 'blocked') {
				blockedCount++;
			}

			// Scheduled tasks (have synced or pending calendar events)
			const events = task.task_calendar_events || [];
			if (events.some((e) => e.sync_status === 'synced' || e.sync_status === 'pending')) {
				scheduledCount++;
			}

			// Backlog tasks (not in any phase)
			if (!phasedTaskIds.has(task.id)) {
				backlogCount++;
			}
		}

		this.store.update((s) => ({
			...s,
			stats: {
				total: activeCount + completedCount,
				completed: completedCount,
				inProgress: inProgressCount,
				blocked: blockedCount,
				deleted: deletedCount,
				active: activeCount,
				scheduled: scheduledCount,
				backlog: backlogCount
			}
		}));
	}

	// Clear all data
	reset() {
		// Clean up any pending stats updates
		if (this.updateStatsTimeout) {
			clearTimeout(this.updateStatsTimeout);
			this.updateStatsTimeout = null;
		}

		// FIXED: Stop cleanup interval to prevent memory leaks
		this.stopCleanupInterval();

		const initialState = get(this.store);
		this.store.set({
			...initialState,
			project: null,
			tasks: [],
			notes: [],
			phases: [],
			briefs: [],
			synthesis: null,
			braindumps: null,
			stats: {
				total: 0,
				completed: 0,
				inProgress: 0,
				blocked: 0,
				deleted: 0,
				active: 0,
				scheduled: 0,
				backlog: 0
			},
			calendarStatus: null,
			loadingStates: {
				project: 'idle',
				tasks: 'idle',
				notes: 'idle',
				phases: 'idle',
				briefs: 'idle',
				synthesis: 'idle',
				stats: 'idle',
				calendar: 'idle',
				braindumps: 'idle'
			},
			errors: {
				project: null,
				tasks: null,
				notes: null,
				phases: null,
				briefs: null,
				synthesis: null,
				stats: null,
				calendar: null,
				braindumps: null
			},
			globalTaskFilters: ['active', 'scheduled', 'overdue', 'recurring'],
			phaseTaskFilters: {},
			optimisticUpdates: new Map(),
			cache: new Map(),
			isInitialized: false,
			lastFetch: {},
			activeTab: 'overview' // FIXED: Reset activeTab to default
		});
	}

	// Direct store update methods for external services
	setBriefs(briefs: any[]): void {
		this.store.update((state) => ({
			...state,
			briefs,
			loadingStates: { ...state.loadingStates, briefs: 'success' }
		}));
	}

	setSynthesis(synthesis: any): void {
		this.store.update((state) => ({
			...state,
			synthesis,
			loadingStates: { ...state.loadingStates, synthesis: 'success' }
		}));
	}

	setCalendarStatus(calendarStatus: any): void {
		this.store.update((state) => ({
			...state,
			calendarStatus,
			loadingStates: { ...state.loadingStates, calendar: 'success' }
		}));
	}

	setNotes(notes: any[]): void {
		this.store.update((state) => ({
			...state,
			notes,
			loadingStates: { ...state.loadingStates, notes: 'success' }
		}));
	}

	setTasks(tasks: any[]): void {
		this.store.update((state) => ({
			...state,
			tasks
		}));
		this.updateStats();
	}

	setPhases(phases: any[]): void {
		this.store.update((state) => ({
			...state,
			phases
		}));
		this.updateStats();
	}

	updateStoreState(updates: Partial<ProjectStoreV2State>): void {
		this.store.update((state) => ({
			...state,
			...updates
		}));
	}

	// Phase management methods
	addPhase(phase: ProcessedPhase): void {
		this.store.update((state) => ({
			...state,
			phases: [...state.phases, phase]
		}));
	}

	updatePhase(phase: ProcessedPhase): void {
		const completedTaskCount = phase?.tasks?.filter((t) => t.status === 'done').length || 0;
		const updatedPhase = {
			...phase,
			completed_tasks: completedTaskCount,
			task_count: phase.tasks ? phase.tasks.length : 0
		};
		this.store.update((state) => ({
			...state,
			phases: state.phases.map((p) => (p.id === updatedPhase.id ? updatedPhase : p))
		}));
		this.updateStats();
	}

	// Task management methods
	moveTaskToPhase(taskId: string, targetPhaseId: string | null): void {
		this.store.update((state) => {
			// Find the task
			const task = state.tasks.find((t) => t.id === taskId);
			if (!task) return state;

			// Find the current phase of the task
			let currentPhaseId: string | null = null;
			for (const phase of state.phases) {
				if (phase.tasks?.some((t) => t.id === taskId)) {
					currentPhaseId = phase.id;
					break;
				}
			}

			// If moving to the same phase, no changes needed
			if (currentPhaseId === targetPhaseId) return state;

			// Update phases
			let updatedPhases = [...state.phases];

			// Remove from old phase
			if (currentPhaseId) {
				updatedPhases = updatedPhases.map((phase) => {
					if (phase.id === currentPhaseId) {
						return {
							...phase,
							tasks: phase.tasks?.filter((t) => t.id !== taskId) || [],
							task_count: Math.max(0, (phase.task_count || 0) - 1),
							completed_tasks:
								task.status === 'done'
									? Math.max(0, (phase.completed_tasks || 0) - 1)
									: phase.completed_tasks || 0
						};
					}
					return phase;
				});
			}

			// Add to new phase (if not moving to backlog)
			if (targetPhaseId) {
				updatedPhases = updatedPhases.map((phase) => {
					if (phase.id === targetPhaseId) {
						return {
							...phase,
							tasks: [...(phase.tasks || []), task],
							task_count: (phase.task_count || 0) + 1,
							completed_tasks:
								task.status === 'done'
									? (phase.completed_tasks || 0) + 1
									: phase.completed_tasks || 0
						};
					}
					return phase;
				});
			}

			return {
				...state,
				phases: updatedPhases
			};
		});
		this.updateStats();
	}

	updateTask(task: TaskWithCalendarEvents): void {
		this.store.update((state) => {
			// Extract phase information from the task
			const taskWithPhase = task as any;
			const newPhaseId =
				taskWithPhase.phase_id ||
				(taskWithPhase.phase_tasks && taskWithPhase.phase_tasks[0]?.phase_id);

			// Find the current phase of the task
			let currentPhaseId: string | null = null;
			for (const phase of state.phases) {
				if (phase.tasks?.some((t) => t.id === task.id)) {
					currentPhaseId = phase.id;
					break;
				}
			}

			// Update phases if the task has moved
			let updatedPhases = [...state.phases];
			if (newPhaseId !== currentPhaseId) {
				// Remove from old phase
				if (currentPhaseId) {
					updatedPhases = updatedPhases.map((phase) => {
						if (phase.id === currentPhaseId) {
							return {
								...phase,
								tasks: phase.tasks?.filter((t) => t.id !== task.id) || [],
								task_count: Math.max(0, (phase.task_count || 0) - 1),
								completed_tasks:
									task.status === 'done'
										? Math.max(0, (phase.completed_tasks || 0) - 1)
										: phase.completed_tasks || 0
							};
						}
						return phase;
					});
				}

				// Add to new phase
				if (newPhaseId) {
					updatedPhases = updatedPhases.map((phase) => {
						if (phase.id === newPhaseId) {
							return {
								...phase,
								tasks: [...(phase.tasks || []), task],
								task_count: (phase.task_count || 0) + 1,
								completed_tasks:
									task.status === 'done'
										? (phase.completed_tasks || 0) + 1
										: phase.completed_tasks || 0
							};
						}
						return phase;
					});
				}
			} else {
				// Just update the task in its current phase
				updatedPhases = updatedPhases.map((phase) => ({
					...phase,
					tasks: phase.tasks?.map((t) => (t.id === task.id ? task : t)) || []
				}));
			}

			return {
				...state,
				tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
				phases: updatedPhases
			};
		});
		this.updateStats();
	}

	// UI loading state management
	setLoading(key: string, loading: boolean): void {
		this.store.update((state) => ({
			...state,
			loadingStates: {
				...state.loadingStates,
				[key]: loading ? 'loading' : 'idle'
			}
		}));
	}

	// Public method for external services to set loading state
	setLoadingState(key: keyof ProjectStoreV2State['loadingStates'], state: LoadingState): void {
		this.updateLoadingState(key, state);
	}

	// Getter methods for realtime service
	getTasks(): TaskWithCalendarEvents[] {
		const state = get(this.store);
		return state.tasks;
	}

	getPhases(): ProcessedPhase[] {
		const state = get(this.store);
		return state.phases;
	}

	getNotes(): Note[] {
		const state = get(this.store);
		return state.notes;
	}

	// Debug helper
	getState(): ProjectStoreV2State {
		return get(this.store);
	}

	// Clear cache - for testing purposes
	clearCache(): void {
		this.store.update((state) => ({
			...state,
			cache: new Map(),
			lastFetch: {}
		}));
	}

	// Derived stores
	get activeTasks() {
		return derived(this.store, ($store) =>
			$store.tasks.filter((t) => !t.deleted_at && t.status !== 'done')
		);
	}

	get completedTasks() {
		return derived(this.store, ($store) =>
			$store.tasks.filter((t) => !t.deleted_at && t.status === 'done')
		);
	}

	get deletedTasks() {
		return derived(this.store, ($store) => $store.tasks.filter((t) => t.deleted_at));
	}

	get backlogTasks() {
		return derived(this.store, ($store) => {
			const phasedTaskIds = new Set(
				$store.phases.flatMap((p) => p.tasks?.map((t) => t.id) || [])
			);
			return $store.tasks
				.filter((t) => !t.deleted_at && t.status !== 'done')
				.filter((t) => !phasedTaskIds.has(t.id));
		});
	}

	get scheduledTasks() {
		return derived(this.store, ($store) =>
			$store.tasks.filter((t) => {
				if (t.deleted_at || t.status === 'done') return false;
				const events = t.task_calendar_events || [];
				return events.some(
					(e) => e.sync_status === 'synced' || e.sync_status === 'pending'
				);
			})
		);
	}

	get isAnyLoading() {
		return derived(this.store, ($store) =>
			Object.values($store.loadingStates).some((state) => state === 'loading')
		);
	}

	get hasPendingUpdates() {
		return derived(this.store, ($store) => $store.optimisticUpdates.size > 0);
	}

	// New derived stores for soft delete functionality
	get recentlyDeletedTasks() {
		return derived(this.store, ($store) => {
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

			return $store.tasks.filter(
				(t) => t.deleted_at && new Date(t.deleted_at) > thirtyDaysAgo
			);
		});
	}
}

// Export singleton instance
export const projectStoreV2 = new ProjectStoreV2();

// Also expose the internal store for direct updates when needed
export const projectStoreV2Internal = projectStoreV2 as ProjectStoreV2 & { store: any };

// Export types
export type { ProjectStoreV2State };
