// src/lib/services/realtimeProject.service.ts
import { projectStoreV2 } from '$lib/stores/project.store';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { toastService } from '$lib/stores/toast.store';

interface ServiceState {
	channel: RealtimeChannel | null;
	projectId: string | null;
	isSubscribed: boolean;
	supabaseClient: SupabaseClient | null;
	currentUserId: string | null;
	recentLocalUpdates: Set<string>; // Track recent local updates to avoid duplicates
}

// Static timeout for debouncing phase reloads
let phaseReloadTimeout: NodeJS.Timeout | null = null;

export class RealtimeProjectService {
	private static state: ServiceState = {
		channel: null,
		projectId: null,
		isSubscribed: false,
		supabaseClient: null,
		currentUserId: null,
		recentLocalUpdates: new Set()
	};

	/**
	 * Initialize real-time subscription for project updates
	 */
	static async initialize(projectId: string, supabaseClient: SupabaseClient): Promise<void> {
		if (!browser || !projectId || !supabaseClient) {
			console.warn('RealtimeProjectService: Missing required parameters');
			return;
		}

		// Don't reinitialize if already subscribed to the same project
		if (this.state.isSubscribed && this.state.projectId === projectId) {
			return;
		}

		// Clean up any existing subscription
		await this.cleanup();

		// Get current user ID
		const {
			data: { session }
		} = await supabaseClient.auth.getSession();
		console.log('[RealtimeService] Initializing with session:', session?.user?.id);

		// Update state
		this.state.projectId = projectId;
		this.state.supabaseClient = supabaseClient;
		this.state.currentUserId = session?.user?.id || null;

		if (!this.state.currentUserId) {
			console.warn('[RealtimeService] No user ID found in session!');
		}

		// Setup subscription
		await this.setupSubscription();
	}

	/**
	 * Set up real-time subscription channels
	 */
	private static async setupSubscription(): Promise<void> {
		if (!this.state.supabaseClient || !this.state.projectId) return;

		try {
			// Create channel for project-specific updates
			this.state.channel = this.state.supabaseClient.channel(
				`project:${this.state.projectId}`
			);

			// Subscribe to all project-related tables
			this.state.channel
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'tasks',
						filter: `project_id=eq.${this.state.projectId}`
					},
					(payload) => this.handleTaskChange(payload)
				)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'phases',
						filter: `project_id=eq.${this.state.projectId}`
					},
					(payload) => this.handlePhaseChange(payload)
				)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'phase_tasks'
					},
					(payload) => this.handlePhaseTaskChange(payload)
				)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'notes',
						filter: `project_id=eq.${this.state.projectId}`
					},
					(payload) => this.handleNoteChange(payload)
				)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'projects',
						filter: `id=eq.${this.state.projectId}`
					},
					(payload) => this.handleProjectChange(payload)
				);

			// Subscribe to the channel
			const subscription = await this.state.channel.subscribe((status) => {
				if (status === 'SUBSCRIBED') {
					this.state.isSubscribed = true;
					console.log('✅ Real-time project updates connected');
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					console.error(`Subscription failed: ${status}`);
					this.state.isSubscribed = false;
				}
			});

			if (subscription === 'error' || subscription === 'timed_out') {
				throw new Error(`Subscription failed: ${subscription}`);
			}
		} catch (error) {
			console.error('Error setting up real-time subscription:', error);
		}
	}

	/**
	 * Track a local update to avoid processing it from realtime
	 */
	static trackLocalUpdate(entityId: string): void {
		this.state.recentLocalUpdates.add(entityId);
		// Remove after 3 seconds
		setTimeout(() => {
			this.state.recentLocalUpdates.delete(entityId);
		}, 3000);
	}

	/**
	 * Handle task changes from real-time updates
	 */
	private static handleTaskChange(payload: any): void {
		const { eventType, new: newRecord, old: oldRecord } = payload;

		console.log(
			'[RealtimeService] Task change:',
			eventType,
			newRecord?.id,
			'from user:',
			newRecord?.user_id,
			'current user:',
			this.state.currentUserId
		);

		// Skip if this is a recent local update
		if (newRecord?.id && this.state.recentLocalUpdates.has(newRecord.id)) {
			console.log('[RealtimeService] Skipping - recent local update');
			return;
		}

		// Skip if this update is from the current user within the last 2 seconds
		// This handles cases where the optimistic update hasn't been tracked yet
		if (newRecord?.user_id === this.state.currentUserId && this.isRecentUpdate(newRecord)) {
			console.log('[RealtimeService] Skipping - recent update from current user');
			return;
		}

		switch (eventType) {
			case 'INSERT':
				// Check if task already exists (might be from optimistic update)
				const currentTasks = projectStoreV2.getTasks();
				const taskExists = currentTasks.some((t) => t.id === newRecord.id);

				if (taskExists) {
					console.log('[RealtimeService] Task already exists, skipping INSERT');
					return;
				}

				// For INSERT from current user, check if there's a temp task with same title
				// This handles the case where realtime arrives before the store replacement
				if (newRecord?.user_id === this.state.currentUserId || !this.state.currentUserId) {
					const hasTempTaskWithSameTitle = currentTasks.some(
						(t) =>
							t.title === newRecord.title &&
							t.id !== newRecord.id &&
							t.created_at &&
							new Date().getTime() - new Date(t.created_at).getTime() < 5000 // Created in last 5 seconds
					);

					if (hasTempTaskWithSameTitle) {
						console.log(
							'[RealtimeService] Found temp task with same title, replacing it'
						);
						// Replace the temp task with the real one
						const updatedTasks = currentTasks.map((t) =>
							t.title === newRecord.title && t.id !== newRecord.id ? newRecord : t
						);
						projectStoreV2.setTasks(updatedTasks);
						return;
					}

					// If it's from current user but no temp task found, skip it
					// The store will handle it via optimistic update
					if (newRecord?.user_id === this.state.currentUserId) {
						console.log(
							'[RealtimeService] Skipping INSERT - from current user, store will handle'
						);
						return;
					}
				}

				// Add task from collaborator
				console.log('[RealtimeService] Adding new task from collaborator');
				projectStoreV2.setTasks([...currentTasks, newRecord]);
				if (newRecord?.user_id !== this.state.currentUserId) {
					toastService.info('New task added');
				}
				break;

			case 'UPDATE':
				// Update task silently
				console.log('[RealtimeService] Updating task');
				projectStoreV2.updateTask(newRecord);
				break;

			case 'DELETE':
				// Remove task silently
				if (oldRecord?.id) {
					const tasks = projectStoreV2.getTasks().filter((t) => t.id !== oldRecord.id);
					projectStoreV2.setTasks(tasks);
					// Only show toast for collaborator updates
					if (oldRecord?.user_id !== this.state.currentUserId) {
						toastService.info('Task removed');
					}
				}
				break;
		}
	}

	/**
	 * Handle phase changes from real-time updates
	 */
	private static handlePhaseChange(payload: any): void {
		const { eventType, new: newRecord, old: oldRecord } = payload;

		// Skip if this is a recent local update
		if (newRecord?.id && this.state.recentLocalUpdates.has(newRecord.id)) {
			return;
		}

		// Skip own recent updates
		if (newRecord?.user_id === this.state.currentUserId && this.isRecentUpdate(newRecord)) {
			return;
		}

		switch (eventType) {
			case 'INSERT':
				const currentPhases = projectStoreV2.getPhases();
				const phaseExists = currentPhases.some((p) => p.id === newRecord.id);
				if (!phaseExists) {
					// For new phases, we need to ensure tasks are populated
					// The realtime update won't include joined tasks, so initialize with empty array
					const phaseWithTasks = {
						...newRecord,
						tasks: newRecord.tasks || [],
						task_count: 0,
						completed_tasks: 0
					};
					projectStoreV2.addPhase(phaseWithTasks);
					if (newRecord?.user_id !== this.state.currentUserId) {
						toastService.info('New phase added');
					}
				}
				break;

			case 'UPDATE':
				// When updating, preserve existing tasks array if not provided
				const existingPhase = projectStoreV2.getPhases().find((p) => p.id === newRecord.id);
				const updatedPhase = {
					...newRecord,
					tasks: newRecord.tasks || existingPhase?.tasks || [],
					task_count: existingPhase?.task_count || 0,
					completed_tasks: existingPhase?.completed_tasks || 0
				};
				projectStoreV2.updatePhase(updatedPhase);
				break;

			case 'DELETE':
				if (oldRecord?.id) {
					const phases = projectStoreV2.getPhases().filter((p) => p.id !== oldRecord.id);
					projectStoreV2.setPhases(phases);
					if (oldRecord?.user_id !== this.state.currentUserId) {
						toastService.info('Phase removed');
					}
				}
				break;
		}
	}

	/**
	 * Handle phase_tasks changes (task assignments to phases)
	 */
	private static async handlePhaseTaskChange(payload: any): Promise<void> {
		const { eventType, new: newRecord, old: oldRecord } = payload;

		console.log('[RealtimeService] Phase task change:', eventType, newRecord, oldRecord);

		// When a task is assigned to or removed from a phase, we need to update the phase's tasks array
		// We'll need to refetch the phase data to get the updated tasks
		const phaseId = newRecord?.phase_id || oldRecord?.phase_id;
		if (!phaseId) return;

		// Skip if this is a recent local update to prevent infinite loops
		const entityId = newRecord?.id || oldRecord?.id;
		if (entityId && this.state.recentLocalUpdates.has(entityId)) {
			console.log('[RealtimeService] Skipping phase task change - recent local update');
			return;
		}

		// Ensure the task belongs to the active project before acting
		const taskId = newRecord?.task_id || oldRecord?.task_id;
		if (taskId) {
			const projectTasks = projectStoreV2.getTasks();
			const taskBelongsToProject = projectTasks.some((task) => task.id === taskId);
			if (!taskBelongsToProject) {
				return;
			}
		}

		// Skip updates for phases outside the active project
		const projectPhases = projectStoreV2.getPhases();
		if (projectPhases.length > 0 && !projectPhases.some((phase) => phase.id === phaseId)) {
			return;
		}

		// Debounce phase reloads to prevent infinite loops from multiple rapid changes
		if (phaseReloadTimeout) {
			clearTimeout(phaseReloadTimeout);
		}

		phaseReloadTimeout = setTimeout(async () => {
			// Force reload phases to get updated task assignments
			// This ensures phases have the correct embedded tasks
			if (this.state.projectId) {
				console.log('[RealtimeService] Reloading phases after phase task change');
				await projectStoreV2.loadPhases(this.state.projectId, true);
			}
			phaseReloadTimeout = null;
		}, 500); // 500ms debounce
	}

	/**
	 * Handle note changes from real-time updates
	 */
	private static handleNoteChange(payload: any): void {
		const { eventType, new: newRecord, old: oldRecord } = payload;

		// Skip if this is a recent local update
		if (newRecord?.id && this.state.recentLocalUpdates.has(newRecord.id)) {
			return;
		}

		// Skip own recent updates
		if (newRecord?.user_id === this.state.currentUserId && this.isRecentUpdate(newRecord)) {
			return;
		}

		switch (eventType) {
			case 'INSERT':
				const currentNotes = projectStoreV2.getNotes();
				const noteExists = currentNotes.some((n) => n.id === newRecord.id);
				if (!noteExists) {
					projectStoreV2.setNotes([...currentNotes, newRecord]);
					if (newRecord?.user_id !== this.state.currentUserId) {
						toastService.info('New note added');
					}
				}
				break;

			case 'UPDATE':
				const notes = projectStoreV2
					.getNotes()
					.map((n) => (n.id === newRecord.id ? newRecord : n));
				projectStoreV2.setNotes(notes);
				break;

			case 'DELETE':
				if (oldRecord?.id) {
					const filteredNotes = projectStoreV2
						.getNotes()
						.filter((n) => n.id !== oldRecord.id);
					projectStoreV2.setNotes(filteredNotes);
					if (oldRecord?.user_id !== this.state.currentUserId) {
						toastService.info('Note removed');
					}
				}
				break;
		}
	}

	/**
	 * Handle project metadata changes
	 */
	private static handleProjectChange(payload: any): void {
		const { eventType, new: newRecord } = payload;

		if (eventType === 'UPDATE' && newRecord) {
			// Skip if this is a recent local update
			if (this.state.recentLocalUpdates.has(newRecord.id)) {
				return;
			}

			// Skip own recent updates
			if (newRecord.user_id === this.state.currentUserId && this.isRecentUpdate(newRecord)) {
				return;
			}

			projectStoreV2.updateStoreState({ project: newRecord });
			if (newRecord.user_id !== this.state.currentUserId) {
				toastService.info('Project details updated');
			}
		}
	}

	/**
	 * Check if an update is recent (within 2 seconds)
	 * This helps avoid duplicate updates from our own actions
	 */
	private static isRecentUpdate(record: any): boolean {
		if (!record?.updated_at) return false;
		const updateTime = new Date(record.updated_at).getTime();
		const now = Date.now();
		return now - updateTime < 2000; // 2 second window
	}

	/**
	 * Cleanup subscriptions and state
	 */
	static async cleanup(): Promise<void> {
		if (this.state.channel && this.state.supabaseClient) {
			try {
				await this.state.supabaseClient.removeChannel(this.state.channel);
			} catch (error) {
				console.error('Error removing channel:', error);
			}
		}

		// Clear any pending timeout for local updates
		this.state.recentLocalUpdates.clear();

		// Clear any pending phase reload timeout
		if (phaseReloadTimeout) {
			clearTimeout(phaseReloadTimeout);
			phaseReloadTimeout = null;
		}

		// Reset state
		this.state = {
			channel: null,
			projectId: null,
			isSubscribed: false,
			supabaseClient: null,
			currentUserId: null,
			recentLocalUpdates: new Set()
		};
	}

	/**
	 * Check if service is initialized
	 */
	static isInitialized(): boolean {
		return this.state.isSubscribed && this.state.projectId !== null;
	}
}
