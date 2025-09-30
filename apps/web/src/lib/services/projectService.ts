// apps/web/src/lib/services/projectService.ts
import type { Note, Project } from '$lib/types/project';
import type { PhaseWithTasks, TaskWithCalendarEvents } from '$lib/types/project-page.types';
import { projectStoreV2 } from '$lib/stores/project.store';
import { ApiService, type ServiceResponse } from './base/api-service';
import { CacheManager } from './base/cache-manager';

// Response types with proper generics
export type ProjectResponse = ServiceResponse<Project>;
export type ProjectsResponse = ServiceResponse<{ projects: Project[]; total: number }>;
export type TaskResponse = ServiceResponse<TaskWithCalendarEvents>;
export type NoteResponse = ServiceResponse<Note>;
export type PhaseResponse = ServiceResponse<PhaseWithTasks>;

/**
 * Project Service - Handles all project-related API operations
 * Uses base ApiService for consistent error handling and caching
 */
export class ProjectService extends ApiService {
	private cache: CacheManager;
	private static instance: ProjectService;

	private constructor() {
		super('/api');
		this.cache = new CacheManager(50, 5 * 60 * 1000); // 50 items, 5 min TTL
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): ProjectService {
		if (!ProjectService.instance) {
			ProjectService.instance = new ProjectService();
		}
		return ProjectService.instance;
	}

	/**
	 * Clear all caches
	 */
	clearCache(): void {
		this.cache.clear();
		projectStoreV2.clearCache();
	}

	// ==========================================
	// PROJECT OPERATIONS
	// ==========================================

	/**
	 * Get a single project by ID
	 */
	async getProject(projectId: string): Promise<ProjectResponse> {
		const cacheKey = `project:${projectId}`;

		// Check cache first
		const cached = this.cache.get(cacheKey);
		if (cached) {
			return { success: true, data: cached as Project };
		}

		const result = await this.get<Project>(`/projects/${projectId}`);

		if (result.success && result.data) {
			// Cache the result
			this.cache.set(cacheKey, result.data);
			// Update store
			projectStoreV2.updateStoreState({ project: result.data });
		}

		return result;
	}

	/**
	 * Get user projects with pagination
	 */
	async getUserProjects(
		options: {
			page?: number;
			limit?: number;
			status?: string;
		} = {}
	): Promise<ProjectsResponse> {
		const { page = 1, limit = 20, status } = options;
		const params: Record<string, string> = {
			page: String(page),
			limit: String(limit)
		};

		if (status) {
			params.status = status;
		}

		const cacheKey = `projects:${JSON.stringify(params)}`;
		const cached = this.cache.get(cacheKey);
		if (cached) {
			return { success: true, data: cached as any };
		}

		const result = await this.get<{ projects: Project[]; total: number }>('/projects', params);

		if (result.success && result.data) {
			this.cache.set(cacheKey, result.data);
			// Update store with projects list
			projectStoreV2.updateStoreState({
				project: result.data.projects[0] // Store only handles single project
			});
		}

		return result;
	}

	/**
	 * Create a new project
	 */
	async createProject(projectData: Partial<Project>): Promise<ProjectResponse> {
		const result = await this.post<Project>('/projects', projectData);

		if (result.success) {
			// Invalidate projects list cache
			this.cache.invalidatePattern(/^projects:/);
			// Update store
			if (result.data) {
				projectStoreV2.updateStoreState({ project: result.data });
			}
		}

		return result;
	}

	/**
	 * Update an existing project
	 */
	async updateProject(projectId: string, updates: Partial<Project>): Promise<ProjectResponse> {
		const result = await this.patch<Project>(`/projects/${projectId}`, updates);

		if (result.success && result.data) {
			// Invalidate caches
			this.cache.delete(`project:${projectId}`);
			this.cache.invalidatePattern(/^projects:/);
			// Update store
			projectStoreV2.updateStoreState({ project: result.data });
		}

		return result;
	}

	/**
	 * Delete a project
	 */
	async deleteProject(projectId: string): Promise<ServiceResponse> {
		const result = await this.delete(`/projects/${projectId}`);

		if (result.success) {
			// Invalidate caches
			this.cache.delete(`project:${projectId}`);
			this.cache.invalidatePattern(/^projects:/);
			// Update store - clear project if it's the current one
			const currentState = projectStoreV2.getState();
			if (currentState.project?.id === projectId) {
				projectStoreV2.updateStoreState({ project: null });
			}
		}

		return result;
	}

	/**
	 * Search projects
	 */
	async searchProjects(
		query: string,
		options: {
			limit?: number;
			status?: string;
		} = {}
	): Promise<ProjectsResponse> {
		const params: Record<string, string> = {
			q: query,
			limit: String(options.limit || 10)
		};

		if (options.status) {
			params.status = options.status;
		}

		return this.get<{ projects: Project[]; total: number }>('/projects/search', params);
	}

	// ==========================================
	// TASK OPERATIONS
	// ==========================================

	/**
	 * Create a task for a project
	 */
	async createTask(
		taskData: Partial<TaskWithCalendarEvents>,
		projectId: string
	): Promise<TaskResponse> {
		const result = await this.post<TaskWithCalendarEvents>(
			`/projects/${projectId}/tasks`,
			taskData
		);

		if (result.success && result.data) {
			// Invalidate project cache
			this.cache.delete(`project:${projectId}`);
			// Update store
			const currentTasks = projectStoreV2.getTasks();
			projectStoreV2.setTasks([...currentTasks, result.data]);
		}

		return result;
	}

	/**
	 * Update a task
	 */
	async updateTask(
		taskId: string,
		updates: Partial<TaskWithCalendarEvents>,
		projectId?: string
	): Promise<TaskResponse> {
		const endpoint = projectId ? `/projects/${projectId}/tasks/${taskId}` : `/tasks/${taskId}`;

		const result = await this.patch<TaskWithCalendarEvents>(endpoint, updates);

		if (result.success && result.data) {
			// Invalidate related caches
			if (projectId) {
				this.cache.delete(`project:${projectId}`);
			}
			// Update store
			projectStoreV2.updateTask(result.data);
		}

		return result;
	}

	/**
	 * Delete a task
	 */
	async deleteTask(taskId: string, projectId: string): Promise<ServiceResponse> {
		const result = await this.delete(`/projects/${projectId}/tasks/${taskId}`);

		if (result.success) {
			// Invalidate project cache
			this.cache.delete(`project:${projectId}`);
			// Update store
			const currentTasks = projectStoreV2.getTasks();
			projectStoreV2.setTasks(currentTasks.filter((t) => t.id !== taskId));
		}

		return result;
	}

	/**
	 * Bulk update tasks
	 */
	async bulkUpdateTasks(
		updates: Array<{ id: string; changes: Partial<TaskWithCalendarEvents> }>,
		projectId?: string
	): Promise<ServiceResponse<TaskWithCalendarEvents[]>> {
		const endpoint = projectId ? `/projects/${projectId}/tasks/bulk` : `/tasks/bulk`;

		const result = await this.patch<TaskWithCalendarEvents[]>(endpoint, { updates });

		if (result.success && result.data) {
			// Invalidate project cache if projectId provided
			if (projectId) {
				this.cache.delete(`project:${projectId}`);
			}
			// Update store with all updated tasks
			result.data.forEach((task) => {
				projectStoreV2.updateTask(task);
			});
		}

		return result;
	}

	// ==========================================
	// CALENDAR OPERATIONS
	// ==========================================

	/**
	 * Add a task to calendar
	 */
	async addTaskToCalendar(
		taskId: string,
		projectId: string,
		timeZone: string
	): Promise<ServiceResponse<{ task: TaskWithCalendarEvents }>> {
		const result = await this.patch<{ task: TaskWithCalendarEvents }>(
			`/projects/${projectId}/tasks/${taskId}`,
			{ timeZone, addTaskToCalendar: true }
		);

		if (result.success && result.data?.task) {
			// Update store with the updated task
			projectStoreV2.updateTask(result.data.task);
		}

		return result;
	}

	/**
	 * Remove a task from calendar
	 */
	async removeTaskFromCalendar(
		eventId: string,
		calendarId: string = 'primary'
	): Promise<ServiceResponse> {
		const result = await this.post(`/calendar/remove-task`, {
			event_id: eventId,
			calendar_id: calendarId
		});

		return result;
	}

	/**
	 * Move a task to a different phase
	 */
	async moveTaskToPhase(
		taskId: string,
		targetPhaseId: string | null,
		projectId: string
	): Promise<ServiceResponse<TaskWithCalendarEvents>> {
		// const result = await this.patch<TaskWithCalendarEvents>(
		// 	`/projects/${projectId}/tasks/${taskId}/phase`,
		// 	{ phaseId: targetPhaseId }
		// );

		const result = await this.post<TaskWithCalendarEvents>(
			`/projects/${projectId}/phases/tasks`,
			{
				taskId,
				toPhaseId: targetPhaseId,
				newStartDate: null
			}
		);

		if (result.success) {
			// Update store - use the dedicated moveTaskToPhase method
			// since the API doesn't return the updated task data
			projectStoreV2.moveTaskToPhase(taskId, targetPhaseId);
		}

		return result;
	}

	// ==========================================
	// NOTE OPERATIONS
	// ==========================================

	/**
	 * Create a note for a project
	 */
	async createNote(noteData: Partial<Note>, projectId: string): Promise<NoteResponse> {
		const payload = {
			...noteData,
			project_id: noteData.project_id ?? projectId
		};

		const result = await this.post<Note>(`/notes`, payload);

		if (result.success && result.data) {
			// Invalidate project cache
			this.cache.delete(`project:${projectId}`);
			// Update store
			const currentNotes = projectStoreV2.getNotes();
			projectStoreV2.setNotes([...currentNotes, result.data]);
		}

		return result;
	}

	/**
	 * Update a note
	 */
	async updateNote(noteId: string, updates: Partial<Note>): Promise<NoteResponse> {
		const result = await this.put<Note>(`/notes/${noteId}`, updates);

		if (result.success && result.data) {
			// Update store
			const currentNotes = projectStoreV2.getNotes();
			projectStoreV2.setNotes(currentNotes.map((n) => (n.id === noteId ? result.data : n)));
			// Invalidate project cache if we know the project ID
			if (result.data.project_id) {
				this.cache.delete(`project:${result.data.project_id}`);
			}
		}

		return result;
	}

	/**
	 * Delete a note
	 */
	async deleteNote(noteId: string, projectId?: string): Promise<ServiceResponse> {
		const result = await this.delete(`/notes/${noteId}`);

		if (result.success) {
			// Update store
			const currentNotes = projectStoreV2.getNotes();
			projectStoreV2.setNotes(currentNotes.filter((n) => n.id !== noteId));
			// Invalidate project cache if provided
			if (projectId) {
				this.cache.delete(`project:${projectId}`);
			}
		}

		return result;
	}

	// ==========================================
	// PHASE OPERATIONS
	// ==========================================

	/**
	 * Create a phase for a project
	 */
	async createPhase(
		phaseData: Partial<PhaseWithTasks>,
		projectId: string
	): Promise<PhaseResponse> {
		const result = await this.post<PhaseWithTasks>(`/projects/${projectId}/phases`, phaseData);

		if (result.success && result.data) {
			// Invalidate project cache
			this.cache.delete(`project:${projectId}`);
			// Update store
			projectStoreV2.addPhase(result.data);
		}

		return result;
	}

	/**
	 * Update a phase
	 */
	async updatePhase(
		phaseId: string,
		updates: Partial<PhaseWithTasks>,
		projectId: string
	): Promise<PhaseResponse> {
		const result = await this.patch<PhaseWithTasks>(
			`/projects/${projectId}/phases/${phaseId}`,
			updates
		);
		if (result.success && result.data) {
			// Invalidate project cache
			this.cache.delete(`project:${projectId}`);
			// Update store
			projectStoreV2.updatePhase(result.data);
		}

		return result;
	}

	/**
	 * Delete a phase
	 */
	async deletePhase(phaseId: string, projectId: string): Promise<ServiceResponse> {
		const result = await this.delete(`/projects/${projectId}/phases/${phaseId}`);

		if (result.success) {
			// Invalidate project cache
			this.cache.delete(`project:${projectId}`);
			// Update store
			const currentPhases = projectStoreV2.getPhases();
			projectStoreV2.setPhases(currentPhases.filter((p) => p.id !== phaseId));
		}

		return result;
	}

	// ==========================================
	// COMPOSITE OPERATIONS
	// ==========================================

	/**
	 * Get project with all details (tasks, notes, phases, etc.)
	 */
	async getProjectWithDetails(projectId: string): Promise<ServiceResponse> {
		const cacheKey = `project-details:${projectId}`;
		const cached = this.cache.get(cacheKey);

		if (cached) {
			return { success: true, data: cached };
		}

		const result = await this.get(`/projects/${projectId}/details`);

		if (result.success && result.data) {
			// Cache with shorter TTL for detailed data
			this.cache.set(cacheKey, result.data, 2 * 60 * 1000); // 2 minutes
			// Update store with full project data
			if (result.data.project)
				projectStoreV2.updateStoreState({ project: result.data.project });
			if (result.data.tasks) projectStoreV2.setTasks(result.data.tasks);
			if (result.data.notes) projectStoreV2.setNotes(result.data.notes);
			if (result.data.phases) projectStoreV2.setPhases(result.data.phases);
		}

		return result;
	}

	/**
	 * Archive a project
	 */
	async archiveProject(projectId: string): Promise<ProjectResponse> {
		return this.updateProject(projectId, { status: 'archived' });
	}

	/**
	 * Restore an archived project
	 */
	async restoreProject(projectId: string): Promise<ProjectResponse> {
		return this.updateProject(projectId, { status: 'active' });
	}

	/**
	 * Duplicate a project
	 */
	async duplicateProject(
		projectId: string,
		options: { name?: string; includeTask?: boolean } = {}
	): Promise<ProjectResponse> {
		const result = await this.post<Project>(`/projects/${projectId}/duplicate`, options);

		if (result.success && result.data) {
			// Invalidate projects list cache
			this.cache.invalidatePattern(/^projects:/);
			// Update store
			projectStoreV2.updateStoreState({ project: result.data });
		}

		return result;
	}
}

// Export singleton instance
export const projectService = ProjectService.getInstance();
