// apps/web/src/lib/stores/dashboard.store.ts
import { DailyBrief } from '$lib/types/daily-brief';
import { CalendarEvent, Project, Task } from '$lib/types/project';
import { writable, derived, get } from 'svelte/store';
import { v4 as uuidv4 } from 'uuid';

export interface TaskWithCalendarEvents extends Task {
	task_calendar_events?: CalendarEvent[];
	calendar_events?: CalendarEvent[]; // Keep for backward compatibility
	project?: Project;
}

export interface DashboardStats {
	totalProjects: number;
	activeTasks: number;
	completedToday: number;
	upcomingDeadlines: number;
	weeklyProgress?: {
		completed: number;
		total: number;
	};
}

export interface CalendarStatus {
	isConnected: boolean;
	loading: boolean;
	error: string | null;
}

export interface DashboardState {
	pastDueTasks: TaskWithCalendarEvents[];
	todaysTasks: TaskWithCalendarEvents[];
	tomorrowsTasks: TaskWithCalendarEvents[];
	weeklyTasks: TaskWithCalendarEvents[];
	weeklyTasksByDate: Record<string, TaskWithCalendarEvents[]>;
	allTasks: TaskWithCalendarEvents[]; // Keep track of all tasks including unscheduled
	activeProjects: Project[];
	recentBriefs: DailyBrief[];
	stats: DashboardStats;
	calendarStatus: CalendarStatus;
	timezone: string;
	loading: boolean;
	error: string | null;
	initialized: boolean;
	lastUpdated: Date | null;
	optimisticUpdates: Map<string, OptimisticUpdate>;
}

export interface OptimisticUpdate {
	id: string;
	type: 'create' | 'update' | 'delete';
	timestamp: number;
	data: any;
	rollbackData?: any;
}

class DashboardStore {
	private store = writable<DashboardState>({
		pastDueTasks: [],
		todaysTasks: [],
		tomorrowsTasks: [],
		weeklyTasks: [],
		weeklyTasksByDate: {},
		allTasks: [],
		activeProjects: [],
		recentBriefs: [],
		stats: {
			totalProjects: 0,
			activeTasks: 0,
			completedToday: 0,
			upcomingDeadlines: 0
		},
		calendarStatus: {
			isConnected: false,
			loading: false,
			error: null
		},
		timezone: 'UTC',
		loading: false,
		error: null,
		initialized: false,
		lastUpdated: null,
		optimisticUpdates: new Map()
	});

	// Derived stores for specific views
	public readonly pastDueTasks = derived(this.store, ($store) => $store.pastDueTasks);
	public readonly todaysTasks = derived(this.store, ($store) => $store.todaysTasks);
	public readonly tomorrowsTasks = derived(this.store, ($store) => $store.tomorrowsTasks);
	public readonly weeklyTasks = derived(this.store, ($store) => $store.weeklyTasks);
	public readonly weeklyTasksByDate = derived(this.store, ($store) => $store.weeklyTasksByDate);
	public readonly activeProjects = derived(this.store, ($store) => $store.activeProjects);
	public readonly recentBriefs = derived(this.store, ($store) => $store.recentBriefs);
	public readonly stats = derived(this.store, ($store) => $store.stats);
	public readonly calendarStatus = derived(this.store, ($store) => $store.calendarStatus);
	public readonly loading = derived(this.store, ($store) => $store.loading);
	public readonly error = derived(this.store, ($store) => $store.error);
	public readonly initialized = derived(this.store, ($store) => $store.initialized);

	// Subscribe method for accessing the entire store
	public subscribe = this.store.subscribe;

	// Update methods
	public updateState(updates: Partial<DashboardState>) {
		console.log('[DashboardStore] Updating state with:', updates);
		this.store.update((state) => {
			// If we're initializing for the first time, ensure we have all the data
			const isInitializing = !state.initialized && updates.initialized;

			if (isInitializing) {
				console.log('[DashboardStore] Initial state update - setting all data');
			}

			return {
				...state,
				...updates,
				lastUpdated: new Date()
			};
		});
	}

	public setLoading(loading: boolean) {
		this.store.update((state) => ({ ...state, loading }));
	}

	public setError(error: string | null) {
		this.store.update((state) => ({ ...state, error }));
	}

	public setTimezone(timezone: string) {
		this.store.update((state) => ({ ...state, timezone }));
	}

	public setCalendarStatus(status: Partial<CalendarStatus>) {
		this.store.update((state) => ({
			...state,
			calendarStatus: { ...state.calendarStatus, ...status }
		}));
	}

	// Optimistic update methods
	public applyOptimisticUpdate(update: OptimisticUpdate) {
		this.store.update((state) => {
			const newState = { ...state };
			newState.optimisticUpdates.set(update.id, update);

			switch (update.type) {
				case 'update':
					// Apply optimistic update to task in all relevant lists
					this.applyTaskUpdate(newState, update.data);
					break;
				case 'create':
					// Add new task optimistically
					this.applyTaskCreate(newState, update.data);
					break;
				case 'delete':
					// Remove task optimistically
					this.applyTaskDelete(newState, update.data.id);
					break;
			}

			return newState;
		});
	}

	private applyTaskUpdate(
		state: DashboardState,
		taskUpdate: Partial<TaskWithCalendarEvents> & { id: string }
	) {
		// If status changed to 'done', remove task from all lists
		if (taskUpdate.status === 'done') {
			const removeFromList = (list: TaskWithCalendarEvents[]) =>
				list.filter((task) => task.id !== taskUpdate.id);

			state.pastDueTasks = removeFromList(state.pastDueTasks);
			state.todaysTasks = removeFromList(state.todaysTasks);
			state.tomorrowsTasks = removeFromList(state.tomorrowsTasks);
			state.weeklyTasks = removeFromList(state.weeklyTasks);

			// Remove from weekly tasks by date
			Object.keys(state.weeklyTasksByDate).forEach((date) => {
				const tasks = state.weeklyTasksByDate[date];
				if (tasks) {
					state.weeklyTasksByDate[date] = removeFromList(tasks);
					if (state.weeklyTasksByDate[date].length === 0) {
						delete state.weeklyTasksByDate[date];
					}
				}
			});

			// Update stats
			state.stats.activeTasks = Math.max(0, state.stats.activeTasks - 1);
			return; // Exit early, task is done
		}

		// Update task in all lists where it appears
		const updateTaskInList = (list: TaskWithCalendarEvents[]) => {
			return list.map((task) =>
				task.id === taskUpdate.id ? { ...task, ...taskUpdate } : task
			);
		};

		// If date changed, we need to move the task between lists
		if (taskUpdate.start_date !== undefined) {
			// First remove the task from all date-based lists
			const removeFromList = (list: TaskWithCalendarEvents[]) =>
				list.filter((task) => task.id !== taskUpdate.id);

			// Find the existing task to preserve all its data
			let existingTask: TaskWithCalendarEvents | null = null;
			const allLists = [
				...state.pastDueTasks,
				...state.todaysTasks,
				...state.tomorrowsTasks,
				...state.weeklyTasks
			];
			existingTask = allLists.find((t) => t.id === taskUpdate.id) || null;

			if (existingTask) {
				// Remove from all lists first
				state.pastDueTasks = removeFromList(state.pastDueTasks);
				state.todaysTasks = removeFromList(state.todaysTasks);
				state.tomorrowsTasks = removeFromList(state.tomorrowsTasks);
				state.weeklyTasks = removeFromList(state.weeklyTasks);

				// Remove from weekly tasks by date
				Object.keys(state.weeklyTasksByDate).forEach((date) => {
					const tasks = state.weeklyTasksByDate[date];
					if (tasks) {
						state.weeklyTasksByDate[date] = removeFromList(tasks);
						if (state.weeklyTasksByDate[date].length === 0) {
							delete state.weeklyTasksByDate[date];
						}
					}
				});

				// Create updated task
				const updatedTask = { ...existingTask, ...taskUpdate };

				// Add to appropriate list based on new date
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const tomorrow = new Date(today);
				tomorrow.setDate(tomorrow.getDate() + 1);
				const weekFromNow = new Date(today);
				weekFromNow.setDate(weekFromNow.getDate() + 7);

				const taskDate = updatedTask.start_date ? new Date(updatedTask.start_date) : null;
				if (taskDate) {
					taskDate.setHours(0, 0, 0, 0);

					// Add to appropriate lists based on date
					if (taskDate < today) {
						state.pastDueTasks.push(updatedTask);
					} else if (taskDate.getTime() === today.getTime()) {
						state.todaysTasks.push(updatedTask);
					} else if (taskDate.getTime() === tomorrow.getTime()) {
						state.tomorrowsTasks.push(updatedTask);
					}

					// Add to weekly if within range
					if (taskDate <= weekFromNow && taskDate >= today) {
						state.weeklyTasks.push(updatedTask);
						const dateKey = taskDate.toISOString().split('T')[0];
						if (dateKey) {
							if (!state.weeklyTasksByDate[dateKey]) {
								state.weeklyTasksByDate[dateKey] = [];
							}
							state.weeklyTasksByDate[dateKey].push(updatedTask);
						}
					}
				}
			}
		} else {
			// Just update the task properties in place (no date change)
			state.pastDueTasks = updateTaskInList(state.pastDueTasks);
			state.todaysTasks = updateTaskInList(state.todaysTasks);
			state.tomorrowsTasks = updateTaskInList(state.tomorrowsTasks);
			state.weeklyTasks = updateTaskInList(state.weeklyTasks);

			// Update weekly tasks by date
			Object.keys(state.weeklyTasksByDate).forEach((date) => {
				const tasks = state.weeklyTasksByDate[date];
				if (tasks) {
					state.weeklyTasksByDate[date] = updateTaskInList(tasks);
				}
			});
		}
	}

	private applyTaskCreate(state: DashboardState, task: TaskWithCalendarEvents) {
		// Add task to appropriate list based on date
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const tomorrow = new Date(today);
		tomorrow.setDate(tomorrow.getDate() + 1);

		const taskDate = task.start_date ? new Date(task.start_date) : null;

		if (taskDate) {
			taskDate.setHours(0, 0, 0, 0);

			if (taskDate < today) {
				state.pastDueTasks = [...state.pastDueTasks, task];
			} else if (taskDate.getTime() === today.getTime()) {
				state.todaysTasks = [...state.todaysTasks, task];
			} else if (taskDate.getTime() === tomorrow.getTime()) {
				state.tomorrowsTasks = [...state.tomorrowsTasks, task];
			}

			// Add to weekly if within 7 days
			const weekFromNow = new Date(today);
			weekFromNow.setDate(weekFromNow.getDate() + 7);

			if (taskDate <= weekFromNow) {
				state.weeklyTasks = [...state.weeklyTasks, task];

				const dateKey = taskDate.toISOString().split('T')[0];
				if (dateKey) {
					if (!state.weeklyTasksByDate[dateKey]) {
						state.weeklyTasksByDate[dateKey] = [];
					}
					state.weeklyTasksByDate[dateKey] = [...state.weeklyTasksByDate[dateKey], task];
				}
			}
		}

		// Update stats
		if (!task.status || task.status === 'backlog' || task.status === 'in_progress') {
			state.stats.activeTasks++;
		}
	}

	private applyTaskDelete(state: DashboardState, taskId: string) {
		const removeFromList = (list: TaskWithCalendarEvents[]) =>
			list.filter((task) => task.id !== taskId);

		state.pastDueTasks = removeFromList(state.pastDueTasks);
		state.todaysTasks = removeFromList(state.todaysTasks);
		state.tomorrowsTasks = removeFromList(state.tomorrowsTasks);
		state.weeklyTasks = removeFromList(state.weeklyTasks);

		// Remove from weekly tasks by date
		Object.keys(state.weeklyTasksByDate).forEach((date) => {
			const tasks = state.weeklyTasksByDate[date];
			if (tasks) {
				state.weeklyTasksByDate[date] = removeFromList(tasks);
				if (state.weeklyTasksByDate[date] && state.weeklyTasksByDate[date].length === 0) {
					delete state.weeklyTasksByDate[date];
				}
			}
		});

		// Update stats
		const wasActive = state.pastDueTasks
			.concat(state.todaysTasks, state.tomorrowsTasks, state.weeklyTasks)
			.some(
				(t) =>
					t.id === taskId &&
					(!t.status || t.status === 'backlog' || t.status === 'in_progress')
			);

		if (wasActive) {
			state.stats.activeTasks = Math.max(0, state.stats.activeTasks - 1);
		}
	}

	public rollbackOptimisticUpdate(updateId: string) {
		this.store.update((state) => {
			const update = state.optimisticUpdates.get(updateId);
			if (!update || !update.rollbackData) return state;

			const newState = { ...state };

			// Apply rollback based on update type
			switch (update.type) {
				case 'update':
					this.applyTaskUpdate(newState, update.rollbackData);
					break;
				case 'create':
					this.applyTaskDelete(newState, update.data.id);
					break;
				case 'delete':
					this.applyTaskCreate(newState, update.rollbackData);
					break;
			}

			// Remove the optimistic update
			newState.optimisticUpdates.delete(updateId);

			return newState;
		});
	}

	public confirmOptimisticUpdate(updateId: string) {
		this.store.update((state) => {
			const newState = { ...state };
			newState.optimisticUpdates.delete(updateId);
			return newState;
		});
	}

	public reset() {
		console.log('[DashboardStore] Resetting store to initial state');
		this.store.set({
			pastDueTasks: [],
			todaysTasks: [],
			tomorrowsTasks: [],
			weeklyTasks: [],
			weeklyTasksByDate: {},
			allTasks: [],
			activeProjects: [],
			recentBriefs: [],
			stats: {
				totalProjects: 0,
				activeTasks: 0,
				completedToday: 0,
				upcomingDeadlines: 0
			},
			calendarStatus: {
				isConnected: false,
				loading: false,
				error: null
			},
			timezone: 'UTC',
			loading: false,
			error: null,
			initialized: false,
			lastUpdated: null,
			optimisticUpdates: new Map()
		});
	}

	// Method to check if store is initialized
	public isInitialized(): boolean {
		return get(this.store).initialized;
	}

	// Utility method to get current state
	public getState(): DashboardState {
		return get(this.store);
	}

	// Method to update a single task across all lists
	public updateTask(taskId: string, updates: Partial<TaskWithCalendarEvents>) {
		const optimisticUpdate: OptimisticUpdate = {
			id: uuidv4(),
			type: 'update',
			timestamp: Date.now(),
			data: { id: taskId, ...updates }
		};

		// Store current task state for rollback
		const currentState = this.getState();
		const currentTask = this.findTaskInState(currentState, taskId);
		if (currentTask) {
			optimisticUpdate.rollbackData = { ...currentTask };
		}

		this.applyOptimisticUpdate(optimisticUpdate);
		return optimisticUpdate.id;
	}

	private findTaskInState(state: DashboardState, taskId: string): TaskWithCalendarEvents | null {
		const allTasks = [
			...state.pastDueTasks,
			...state.todaysTasks,
			...state.tomorrowsTasks,
			...state.weeklyTasks
		];

		return allTasks.find((task) => task.id === taskId) || null;
	}

	// Method to handle task completion
	public completeTask(taskId: string) {
		const updates: Partial<TaskWithCalendarEvents> = {
			status: 'done',
			completed_at: new Date().toISOString()
		};

		return this.updateTask(taskId, updates);
	}

	// Method to handle task deletion
	public deleteTask(taskId: string) {
		const currentState = this.getState();
		const task = this.findTaskInState(currentState, taskId);

		if (!task) return null;

		const optimisticUpdate: OptimisticUpdate = {
			id: uuidv4(),
			type: 'delete',
			timestamp: Date.now(),
			data: { id: taskId },
			rollbackData: task
		};

		this.applyOptimisticUpdate(optimisticUpdate);
		return optimisticUpdate.id;
	}

	// Method to add a new task
	public addTask(task: TaskWithCalendarEvents) {
		const optimisticUpdate: OptimisticUpdate = {
			id: uuidv4(),
			type: 'create',
			timestamp: Date.now(),
			data: task
		};

		this.applyOptimisticUpdate(optimisticUpdate);
		return optimisticUpdate.id;
	}
}

// Export singleton instance
export const dashboardStore = new DashboardStore();
