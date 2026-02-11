// apps/web/src/lib/services/projectData.service.ts
import { projectStoreV2, type LoadingState } from '$lib/stores/project.store';
import { ApiResponse } from '$lib/utils/api-response';
import type { TaskWithCalendarEvents, ProcessedPhase } from '$lib/types/project-page.types';
import type { Note } from '$lib/types/project';
import { requireApiData } from '$lib/utils/api-client-helpers';

interface FetchOptions {
	force?: boolean;
	priority?: 'high' | 'normal' | 'low';
	signal?: AbortSignal;
}

interface BatchFetchOptions {
	tasks?: boolean;
	phases?: boolean;
	notes?: boolean;
	stats?: boolean;
	briefs?: boolean;
	synthesis?: boolean;
	calendarStatus?: boolean;
	ontologyEvents?: boolean;
}

export class ProjectDataService {
	private projectId: string;
	private requestQueue: Map<string, Promise<any>> = new Map();
	private abortControllers: Map<string, AbortController> = new Map();
	private loadingSynthesis = false;
	private retryAttempts: Map<string, number> = new Map();
	private maxRetries = 3;
	private baseDelay = 1000; // Base delay for exponential backoff
	private backgroundTimers: Array<ReturnType<typeof setTimeout>> = [];

	constructor(projectId: string) {
		this.projectId = projectId;
	}

	// Priority-based data loading
	async loadByPriority(tab: string): Promise<void> {
		// Priority 1: Load current tab data immediately
		const priority1 = this.getPriority1Data(tab);
		await Promise.all(priority1);

		// Priority 2: Prefetch adjacent tab data
		this.scheduleBackgroundLoad(() => {
			const priority2 = this.getPriority2Data(tab);
			Promise.all(priority2).catch(console.error);
		}, 100);

		// Priority 3: Background load remaining data
		this.scheduleBackgroundLoad(() => {
			const priority3 = this.getPriority3Data(tab);
			Promise.all(priority3).catch(console.error);
		}, 500);
	}

	private scheduleBackgroundLoad(callback: () => void, delay: number): void {
		const timerId = setTimeout(() => {
			this.backgroundTimers = this.backgroundTimers.filter((timer) => timer !== timerId);
			callback();
		}, delay);

		this.backgroundTimers.push(timerId);
	}

	private getPriority1Data(tab: string): Promise<void>[] {
		const loads: Promise<void>[] = [];

		switch (tab) {
			case 'overview':
				loads.push(this.loadPhases());
				loads.push(this.loadTasks());
				break;
			case 'tasks':
				loads.push(this.loadTasks());
				break;
			case 'notes':
				loads.push(this.loadNotes());
				break;
			case 'briefs':
				loads.push(this.loadBriefs());
				break;
			case 'synthesis':
				loads.push(this.loadSynthesis());
				break;
		}

		// Always load stats for header and calendar status for UI
		loads.push(this.loadStats());
		loads.push(this.loadCalendarStatus());
		loads.push(this.loadOntologyEvents());

		return loads;
	}

	private getPriority2Data(tab: string): Promise<void>[] {
		const loads: Promise<void>[] = [];

		// Prefetch adjacent tabs
		if (tab !== 'tasks') loads.push(this.loadTasks());
		if (tab !== 'overview') loads.push(this.loadPhases());
		if (tab !== 'notes') loads.push(this.loadNotes({ priority: 'normal' }));

		return loads;
	}

	private getPriority3Data(tab: string): Promise<void>[] {
		const loads: Promise<void>[] = [];

		// Background load everything else
		if (tab !== 'briefs') loads.push(this.loadBriefs({ priority: 'low' }));
		if (tab !== 'synthesis') loads.push(this.loadSynthesis({ priority: 'low' }));

		return loads;
	}

	// Deduplicated fetch with retry logic
	private async fetchWithRetry<T>(
		endpoint: string,
		options: FetchOptions = {}
	): Promise<T | null> {
		const cacheKey = `fetch_${endpoint}`;

		// Check if request is already in flight
		if (this.requestQueue.has(cacheKey) && !options.force) {
			return this.requestQueue.get(cacheKey);
		}

		// Create abort controller for this request
		const abortController = new AbortController();
		this.abortControllers.set(cacheKey, abortController);

		const fetchPromise = this.executeFetch<T>(
			endpoint,
			{ ...options, signal: abortController.signal },
			cacheKey
		);

		this.requestQueue.set(cacheKey, fetchPromise);

		try {
			const result = await fetchPromise;
			return result;
		} finally {
			this.requestQueue.delete(cacheKey);
			this.abortControllers.delete(cacheKey);
		}
	}

	private async executeFetch<T>(
		endpoint: string,
		options: FetchOptions,
		cacheKey: string
	): Promise<T | null> {
		const attempts = this.retryAttempts.get(cacheKey) || 0;

		try {
			const response = await fetch(endpoint, {
				signal: options.signal,
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = await response.json();

			if (result.success) {
				this.retryAttempts.delete(cacheKey);
				return result.data as T;
			} else {
				throw new Error(result.error || 'Request failed');
			}
		} catch (error) {
			// Don't retry on abort
			if (error instanceof Error && error.name === 'AbortError') {
				throw error;
			}

			// Retry with exponential backoff
			if (attempts < this.maxRetries) {
				const delay = this.baseDelay * Math.pow(2, attempts);
				this.retryAttempts.set(cacheKey, attempts + 1);

				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.executeFetch<T>(endpoint, options, cacheKey);
			}

			console.error(`Failed to fetch ${endpoint} after ${attempts} attempts:`, error);
			this.retryAttempts.delete(cacheKey);
			return null;
		}
	}

	// Individual data loaders
	async loadTasks(options: FetchOptions = {}): Promise<void> {
		// Just delegate to the store's method which handles fetching
		await projectStoreV2.loadTasks(this.projectId, options.force);
	}

	async loadPhases(options: FetchOptions = {}): Promise<void> {
		// Just delegate to the store's method which handles fetching
		await projectStoreV2.loadPhases(this.projectId, options.force);

		// After phases are loaded, ensure they have tasks populated
		// This is a workaround for potential issues with the phase_tasks join
		const currentState = projectStoreV2.getState();

		if (currentState && currentState.phases) {
			console.log('[ProjectDataService] Phases loaded:', {
				phaseCount: currentState.phases.length,
				phases: currentState.phases.map((p: any) => ({
					id: p.id,
					name: p.name,
					taskCount: p.tasks?.length || 0,
					hasTasks: !!p.tasks
				}))
			});

			// Check if any phases are missing tasks
			const phasesNeedingTasks = currentState.phases.filter(
				(p: any) => !p.tasks || !Array.isArray(p.tasks)
			);

			if (phasesNeedingTasks.length > 0) {
				console.warn(
					'[ProjectDataService] Some phases missing tasks array:',
					phasesNeedingTasks.map((p: any) => p.name)
				);
			}
		}
	}

	async loadNotes(options: FetchOptions = {}): Promise<void> {
		// Just delegate to the store's method which handles fetching
		await projectStoreV2.loadNotes(this.projectId, options.force);
	}

	async loadStats(options: FetchOptions = {}): Promise<void> {
		await projectStoreV2.loadStats(this.projectId, options.force);
	}

	async loadBriefs(options: FetchOptions = {}): Promise<void> {
		const data = await this.fetchWithRetry<{ briefs: any[] }>(
			`/api/projects/${this.projectId}/briefs`,
			options
		);

		if (data) {
			projectStoreV2.setBriefs(data.briefs || []);
		}
	}

	async loadSynthesis(options: FetchOptions = {}): Promise<void> {
		// Skip if already loading to prevent duplicate requests
		// Note: We can't check loading state directly, so we'll just proceed
		if (!options.force && this.loadingSynthesis) {
			return;
		}

		this.loadingSynthesis = true;
		projectStoreV2.setLoadingState('synthesis', 'loading');

		try {
			const response = await fetch(`/api/projects/${this.projectId}/synthesize`, {
				method: 'GET' // Explicitly use GET to load existing synthesis
			});

			if (response.status === 404) {
				projectStoreV2.setSynthesis(null);
				projectStoreV2.setLoadingState('synthesis', 'idle');
				return;
			}

			const result = await requireApiData<{ synthesis?: any } | null>(
				response,
				'Failed to load synthesis'
			);

			if (result && 'synthesis' in result) {
				projectStoreV2.setSynthesis(result.synthesis ?? null);
			} else {
				projectStoreV2.setSynthesis(result);
			}
			projectStoreV2.setLoadingState('synthesis', 'success');
		} catch (error) {
			console.error('Failed to load synthesis:', error);
			projectStoreV2.setLoadingState('synthesis', 'error');
		} finally {
			this.loadingSynthesis = false;
		}
	}

	async loadCalendarStatus(options: FetchOptions = {}): Promise<void> {
		const data = await this.fetchWithRetry<{ calendarStatus: any }>(
			`/api/projects/${this.projectId}/calendar-status`,
			options
		);

		if (data) {
			projectStoreV2.setCalendarStatus(data.calendarStatus || data);
		}
	}

	async loadOntologyEvents(options: FetchOptions = {}): Promise<void> {
		await projectStoreV2.loadOntologyEvents(this.projectId, options.force);
	}

	// Batch loading for initial page load
	async batchLoad(options: BatchFetchOptions): Promise<void> {
		const loads: Promise<void>[] = [];

		if (options.tasks) loads.push(this.loadTasks());
		if (options.phases) loads.push(this.loadPhases());
		if (options.notes) loads.push(this.loadNotes());
		if (options.stats) loads.push(this.loadStats());
		if (options.briefs) loads.push(this.loadBriefs());
		if (options.synthesis) loads.push(this.loadSynthesis());
		if (options.calendarStatus) loads.push(this.loadCalendarStatus());
		if (options.ontologyEvents) loads.push(this.loadOntologyEvents());

		await Promise.all(loads);
	}

	// Force refresh all data
	async refreshAll(): Promise<void> {
		const loads = [
			this.loadTasks({ force: true }),
			this.loadPhases({ force: true }),
			this.loadNotes({ force: true }),
			this.loadStats({ force: true }),
			this.loadBriefs({ force: true }),
			this.loadSynthesis({ force: true }),
			this.loadCalendarStatus({ force: true }),
			this.loadOntologyEvents({ force: true })
		];

		await Promise.all(loads);
	}

	// Abort all pending requests
	abortAll(): void {
		this.abortControllers.forEach((controller) => controller.abort());
		this.abortControllers.clear();
		this.requestQueue.clear();
	}

	// Cleanup on destroy
	destroy(): void {
		this.abortAll();
		this.backgroundTimers.forEach((timer) => clearTimeout(timer));
		this.backgroundTimers = [];
		this.retryAttempts.clear();
	}

	// Optimistic operations wrappers
	async createTask(taskData: Partial<TaskWithCalendarEvents>): Promise<TaskWithCalendarEvents> {
		return projectStoreV2.optimisticCreateTask(taskData, async () => {
			// Remove the id field when sending to API for creation
			const { id, ...taskDataWithoutId } = taskData;

			const response = await fetch(`/api/projects/${this.projectId}/tasks`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(taskDataWithoutId)
			});

			const result = await response.json();
			if (!result.success) throw new Error(result.error);

			return result.data.task;
		});
	}

	async updateTask(
		taskId: string,
		updates: Partial<TaskWithCalendarEvents>
	): Promise<TaskWithCalendarEvents> {
		return projectStoreV2.optimisticUpdateTask(taskId, updates, async () => {
			const response = await fetch(`/api/projects/${this.projectId}/tasks/${taskId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			});

			const result = await response.json();
			if (!result.success) throw new Error(result.error);
			return result.data.task;
		});
	}

	async deleteTask(taskId: string): Promise<boolean> {
		const result = await projectStoreV2.optimisticDeleteTask(taskId, async () => {
			const response = await fetch(`/api/projects/${this.projectId}/tasks/${taskId}`, {
				method: 'DELETE'
			});

			const res = await response.json();
			if (!res.success) throw new Error(res.error);
			return true;
		});
		return (result as boolean) ?? false;
	}

	async createNote(noteData: Partial<Note>): Promise<Note> {
		return projectStoreV2.optimisticCreateNote(noteData, async () => {
			// Remove the id field when sending to API for creation
			const { id, ...notePayload } = noteData;
			const body = {
				...notePayload,
				project_id: notePayload.project_id ?? this.projectId
			};

			const response = await fetch(`/api/notes`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const result = await response.json();
			if (!result.success) throw new Error(result.error || 'Failed to create note');
			return result.data.note;
		});
	}

	async updateNote(noteId: string, updates: Partial<Note>): Promise<Note> {
		return projectStoreV2.optimisticUpdateNote(noteId, updates, async () => {
			const response = await fetch(`/api/notes/${noteId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			});

			const result = await response.json();
			if (!result.success) throw new Error(result.error || 'Failed to update note');
			return result.data.note;
		});
	}
}
