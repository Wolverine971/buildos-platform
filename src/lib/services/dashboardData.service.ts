// src/lib/services/dashboardData.service.ts
import { dashboardStore, type TaskWithCalendarEvents } from '$lib/stores/dashboard.store';
import { ApiService, type ServiceResponse } from './base/api-service';
import { CacheManager } from './base/cache-manager';
import { v4 as uuidv4 } from 'uuid';
import type { Project, Task } from '$lib/types/project';
import { DailyBrief } from '$lib/types/daily-brief';

export interface DashboardData {
	pastDueTasks: TaskWithCalendarEvents[];
	todaysTasks: TaskWithCalendarEvents[];
	tomorrowsTasks: TaskWithCalendarEvents[];
	weeklyTasks: TaskWithCalendarEvents[];
	weeklyTasksByDate: Record<string, TaskWithCalendarEvents[]>;
	activeProjects: Project[];
	recentBriefs: DailyBrief[];
	stats: {
		totalProjects: number;
		activeTasks: number;
		completedToday: number;
		upcomingDeadlines: number;
	};
	calendarStatus: {
		isConnected?: boolean; // API returns isConnected
		needsRefresh?: boolean;
	};
}

// Response types with proper generics
export type DashboardResponse = ServiceResponse<DashboardData>;
export type TaskResponse = ServiceResponse<Task>;
export type TasksResponse = ServiceResponse<Task[]>;

/**
 * Dashboard Data Service - Handles all dashboard-related API operations
 * Uses base ApiService for consistent error handling and follows ProjectService patterns
 */
export class DashboardDataService extends ApiService {
	private cache: CacheManager;
	private static instance: DashboardDataService;

	private constructor() {
		super('/api');
		// Reduced cache TTL to 30 seconds to prevent stale data issues
		this.cache = new CacheManager(50, 30 * 1000); // 50 items, 30 sec TTL
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): DashboardDataService {
		if (!DashboardDataService.instance) {
			DashboardDataService.instance = new DashboardDataService();
		}
		return DashboardDataService.instance;
	}

	/**
	 * Clear all caches
	 */
	public clearCache(): void {
		this.cache.clear();
	}

	// ==========================================
	// DASHBOARD DATA OPERATIONS
	// ==========================================

	/**
	 * Load all dashboard data
	 */
	public async loadDashboardData(timezone: string = 'UTC'): Promise<DashboardResponse> {
		const cacheKey = `dashboard:${timezone}`;
		console.log('[DashboardDataService] Loading dashboard data for timezone:', timezone);

		// TEMPORARILY DISABLED: Cache check to debug inconsistent data issues
		// const cached = this.cache.get(cacheKey);
		// if (cached) {
		// 	console.log('[DashboardDataService] Using cached data');
		// 	// Map calendar status for cached data too
		// 	const cachedData = cached as DashboardData;
		// 	const mappedCachedData = {
		// 		...cachedData,
		// 		calendarStatus: cachedData.calendarStatus
		// 			? {
		// 				isConnected: cachedData.calendarStatus.isConnected || false,
		// 				loading: false,
		// 				error: null
		// 			}
		// 			: {
		// 				isConnected: false,
		// 				loading: false,
		// 				error: null
		// 			}
		// 	};
		// 	dashboardStore.updateState({
		// 		...mappedCachedData,
		// 		initialized: true
		// 	});
		// 	return { success: true, data: cachedData };
		// }

		dashboardStore.setLoading(true);
		dashboardStore.setError(null);

		const result = await this.get<DashboardData>('/dashboard', { timezone });
		console.log('[DashboardDataService] API response:', result);

		if (result.success && result.data) {
			console.log(
				'[DashboardDataService] Calendar status from API:',
				result.data.calendarStatus
			);

			// Map the API's isConnected to our store's connected property
			const calendarStatus = result.data.calendarStatus
				? {
						isConnected: result.data.calendarStatus.isConnected || false,
						loading: false,
						error: null
					}
				: {
						isConnected: false,
						loading: false,
						error: null
					};

			console.log('[DashboardDataService] Mapped calendar status for store:', calendarStatus);

			// Collect all unique tasks from all lists
			const allTasksMap = new Map<string, TaskWithCalendarEvents>();

			// Add tasks from all lists to the map to ensure uniqueness
			[
				...(result.data.pastDueTasks || []),
				...(result.data.todaysTasks || []),
				...(result.data.tomorrowsTasks || []),
				...(result.data.weeklyTasks || [])
			].forEach((task: TaskWithCalendarEvents) => {
				allTasksMap.set(task.id, task);
			});

			// Update store with fetched data
			const stateUpdate = {
				pastDueTasks: result.data.pastDueTasks || [],
				todaysTasks: result.data.todaysTasks || [],
				tomorrowsTasks: result.data.tomorrowsTasks || [],
				weeklyTasks: result.data.weeklyTasks || [],
				weeklyTasksByDate: result.data.weeklyTasksByDate || {},
				allTasks: Array.from(allTasksMap.values()), // Store all unique tasks
				activeProjects: result.data.activeProjects || [],
				recentBriefs: result.data.recentBriefs || [],
				stats: result.data.stats || {
					totalProjects: 0,
					activeTasks: 0,
					completedToday: 0,
					upcomingDeadlines: 0
				},
				calendarStatus,
				timezone,
				initialized: true
			};

			console.log('[DashboardDataService] Final state update object:', stateUpdate);
			dashboardStore.updateState(stateUpdate);

			// TEMPORARILY DISABLED: Cache the data - debugging inconsistent data
			// this.cache.set(cacheKey, result.data);
		} else {
			dashboardStore.setError(result.message || 'Failed to load dashboard data');
		}

		dashboardStore.setLoading(false);
		return result;
	}

	// ==========================================
	// TASK OPERATIONS WITH OPTIMISTIC UPDATES
	// ==========================================

	/**
	 * Update a task with optimistic updates
	 */
	public async updateTask(
		taskId: string,
		updates: Partial<Task>,
		projectId?: string
	): Promise<TaskResponse> {
		// Apply optimistic update immediately
		const optimisticUpdateId = dashboardStore.updateTask(taskId, updates);

		// Try to find the task in current state to get project_id
		const currentState = dashboardStore.getState();
		const task = this.findTaskInAllLists(currentState, taskId);

		// Use provided projectId or try to get it from the found task
		const taskProjectId = projectId || task?.project_id;

		if (!taskProjectId) {
			console.error(
				`[DashboardDataService] Cannot update task ${taskId}: project_id not found. Task may have been removed from lists due to date change.`
			);
			// Since we can't find the project_id, we can't make the API call
			// But we'll keep the optimistic update since the UI already reflects the change
			// The next dashboard refresh will sync everything properly
			return {
				success: false,
				message: 'Task project information not available. Please refresh the dashboard.'
			};
		}

		const result = await this.patch<Task>(
			`/projects/${taskProjectId}/tasks/${taskId}`,
			updates
		);

		if (result.success && result.data) {
			// Confirm the optimistic update
			dashboardStore.confirmOptimisticUpdate(optimisticUpdateId);
			// Update the task in the store with server response
			dashboardStore.updateTask(taskId, result.data?.task || result.data);
			// Invalidate cache
			this.cache.invalidatePattern(/^dashboard:/);
		} else {
			// Rollback optimistic update on error
			dashboardStore.rollbackOptimisticUpdate(optimisticUpdateId);
		}

		return result;
	}

	/**
	 * Delete a task with optimistic updates
	 */
	public async deleteTask(taskId: string): Promise<ServiceResponse<void>> {
		// Get task to find project_id
		const currentState = dashboardStore.getState();
		const task = this.findTaskInAllLists(currentState, taskId);

		if (!task || !task.project_id) {
			return {
				success: false,
				message: 'Task or project not found'
			};
		}

		// Apply optimistic delete immediately
		const optimisticUpdateId = dashboardStore.deleteTask(taskId);

		if (!optimisticUpdateId) {
			return {
				success: false,
				message: 'Task not found in store'
			};
		}

		const result = await this.delete<void>(`/projects/${task.project_id}/tasks/${taskId}`);

		if (result.success) {
			// Confirm the optimistic update
			dashboardStore.confirmOptimisticUpdate(optimisticUpdateId);
			// Invalidate cache
			this.cache.invalidatePattern(/^dashboard:/);
		} else {
			// Rollback optimistic update on error
			dashboardStore.rollbackOptimisticUpdate(optimisticUpdateId);
		}

		return result;
	}

	/**
	 * Complete a task with optimistic updates
	 */
	public async completeTask(taskId: string): Promise<TaskResponse> {
		const updates = {
			status: 'completed' as const,
			completed_at: new Date().toISOString()
		};

		return this.updateTask(taskId, updates);
	}

	/**
	 * Create a new task with optimistic updates
	 */
	public async createTask(projectId: string, task: Partial<Task>): Promise<TaskResponse> {
		// Generate temporary ID for optimistic update
		const tempId = uuidv4();
		const tempTask: TaskWithCalendarEvents = {
			...task,
			id: tempId,
			project_id: projectId,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		} as TaskWithCalendarEvents;

		// Apply optimistic create immediately
		const optimisticUpdateId = dashboardStore.addTask(tempTask);

		const result = await this.post<Task>(`/projects/${projectId}/tasks`, task);

		if (result.success && result.data) {
			// Remove temporary task and add real one
			dashboardStore.deleteTask(tempId);
			dashboardStore.addTask(result.data as TaskWithCalendarEvents);
			// Confirm the optimistic update
			dashboardStore.confirmOptimisticUpdate(optimisticUpdateId);
			// Invalidate cache
			this.cache.invalidatePattern(/^dashboard:/);
		} else {
			// Rollback optimistic update on error
			dashboardStore.rollbackOptimisticUpdate(optimisticUpdateId);
		}

		return result;
	}

	/**
	 * Refresh specific task data from server
	 */
	public async refreshTask(projectId: string, taskId: string): Promise<TaskResponse> {
		const result = await this.get<Task>(`/projects/${projectId}/tasks/${taskId}`);

		if (result.success && result.data) {
			// Update task in store
			dashboardStore.updateTask(taskId, result.data?.task || result.data);
		}

		return result;
	}

	/**
	 * Batch update multiple tasks
	 */
	public async batchUpdateTasks(
		projectId: string,
		updates: Array<{ id: string; updates: Partial<Task> }>
	): Promise<TasksResponse> {
		// Apply all optimistic updates
		const optimisticUpdateIds = updates.map(({ id, updates: taskUpdates }) =>
			dashboardStore.updateTask(id, taskUpdates)
		);

		const result = await this.patch<Task[]>(`/projects/${projectId}/tasks/batch`, { updates });

		if (result.success && result.data) {
			// Confirm all optimistic updates
			optimisticUpdateIds.forEach((id) => dashboardStore.confirmOptimisticUpdate(id));
			// Update tasks in store with server response
			result.data.forEach((task: Task) => {
				dashboardStore.updateTask(task.id, task);
			});
			// Invalidate cache
			this.cache.invalidatePattern(/^dashboard:/);
		} else {
			// Rollback all optimistic updates on error
			optimisticUpdateIds.forEach((id) => dashboardStore.rollbackOptimisticUpdate(id));
		}

		return result;
	}

	// ==========================================
	// CALENDAR OPERATIONS
	// ==========================================

	/**
	 * Update calendar status
	 */
	public async updateCalendarStatus(connected: boolean): Promise<ServiceResponse<void>> {
		dashboardStore.setCalendarStatus({ isConnected: connected });

		// Update on server
		const result = await this.post<void>('/calendar/status', { connected });

		if (!result.success) {
			console.error('Failed to update calendar status:', result.message);
		}

		return result;
	}

	// ==========================================
	// HELPER METHODS
	// ==========================================

	/**
	 * Find a task across all dashboard lists
	 */
	private findTaskInAllLists(state: any, taskId: string): TaskWithCalendarEvents | null {
		// First check allTasks if it exists
		if (state.allTasks && state.allTasks.length > 0) {
			const found = state.allTasks.find((task: any) => task.id === taskId);
			if (found) return found;
		}

		// Fallback to checking date-based lists
		const dateBasedTasks = [
			...(state.pastDueTasks || []),
			...(state.todaysTasks || []),
			...(state.tomorrowsTasks || []),
			...(state.weeklyTasks || [])
		];

		// Remove duplicates using Map
		const uniqueTasks = Array.from(
			new Map(dateBasedTasks.map((task: any) => [task.id, task])).values()
		);

		return uniqueTasks.find((task: any) => task.id === taskId) || null;
	}

	/**
	 * Invalidate all dashboard-related cache entries
	 */
	private invalidateDashboardCache(): void {
		this.cache.invalidatePattern(/^dashboard:/);
	}
}

// Export singleton instance
export const dashboardDataService = DashboardDataService.getInstance();
