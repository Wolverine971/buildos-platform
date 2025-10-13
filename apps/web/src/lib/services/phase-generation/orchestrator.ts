// apps/web/src/lib/services/phase-generation/orchestrator.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	PhaseGenerationConfig,
	PhaseGenerationResult,
	Task,
	ExistingPhaseAssignment,
	GenerationContext,
	SchedulingMethod
} from './types';
import type { Project } from '$lib/types/project';

import { PhasesOnlyStrategy } from './strategies/phases-only.strategy';
import { ScheduleInPhasesStrategy } from './strategies/schedule-in-phases.strategy';
import { BaseSchedulingStrategy } from './strategies/base-strategy';

export class PhaseGenerationOrchestrator {
	private supabase: SupabaseClient;
	private userId: string;
	private projectId: string;
	private config: PhaseGenerationConfig;
	private project: Project | null = null;
	private preservedPhases: any[] = [];

	constructor(
		supabase: SupabaseClient,
		userId: string,
		projectId: string,
		config: PhaseGenerationConfig
	) {
		this.supabase = supabase;
		this.userId = userId;
		this.projectId = projectId;
		this.config = { ...config, userId, projectId }; // Enrich config with identifiers
	}

	/**
	 * Main entry point for phase generation
	 */
	async generate(): Promise<PhaseGenerationResult> {
		// 1. Load and validate project
		await this.loadAndValidateProject();

		// 2. Update project dates if requested
		if (this.config.projectDatesChanged) {
			await this.updateProjectDates();
		}

		// 3. Check if this is a regeneration
		const isRegeneration = await this.checkIfRegeneration();

		// 4. Handle historical preservation if regenerating
		if (isRegeneration && this.config.preserveHistoricalPhases !== false) {
			await this.handleHistoricalPreservation();
		} else if (isRegeneration && this.config.preserveHistoricalPhases === false) {
			// User explicitly wants to wipe all phases
			await this.deleteAllPhases();
		}

		// 5. Select appropriate tasks
		const tasks = isRegeneration
			? await this.selectTasksForRegeneration()
			: await this.selectTasksForFirstGeneration();

		if (tasks.length === 0) {
			throw new Error('No tasks found for phase generation');
		}

		// 6. Clear invalid recurring data from non-recurring tasks
		await this.clearInvalidRecurringData(tasks);

		// 7. Get existing phase assignments if regenerating
		const existingAssignments = isRegeneration ? await this.getExistingPhaseAssignments() : [];

		// 8. Create generation context
		const context: GenerationContext = {
			project: this.project!,
			tasks,
			isRegeneration,
			existingAssignments,
			config: this.config,
			preservedPhases: this.preservedPhases
		};

		// 9. Get appropriate strategy and execute
		const strategy = this.getStrategy(this.config.schedulingMethod);
		const result = await strategy.execute(context);

		// 10. Fetch generated phases with tasks for response
		const generatedPhases = await this.fetchGeneratedPhases();

		// 11. Get backlog tasks
		const backlogTasks = await this.getBacklogTasks(result.task_assignments);

		return {
			...result,
			phases: generatedPhases,
			backlogTasks,
			scheduling_method: this.config.schedulingMethod
		};
	}

	/**
	 * Load and validate project
	 */
	private async loadAndValidateProject(): Promise<void> {
		const { data: projects, error } = await this.supabase
			.from('projects')
			.select('*')
			.eq('id', this.projectId)
			.eq('user_id', this.userId);

		if (error) {
			throw new Error(`Failed to load project: ${error.message}`);
		}

		if (!projects || projects.length === 0) {
			throw new Error('Project not found or access denied');
		}

		if (projects.length > 1) {
			console.warn(
				`Warning: Found ${projects.length} projects with same id, using first one`
			);
		}

		this.project = projects[0];
	}

	/**
	 * Update project dates if changed in UI
	 */
	private async updateProjectDates(): Promise<void> {
		if (!this.config.projectStartDate) {
			throw new Error('Project start date is required');
		}

		const updateData: any = {
			start_date: this.config.projectStartDate
		};

		if (this.config.projectEndDate) {
			updateData.end_date = this.config.projectEndDate;
		}

		const { error } = await this.supabase
			.from('projects')
			.update(updateData)
			.eq('id', this.projectId);

		if (error) {
			throw new Error(`Failed to update project dates: ${error.message}`);
		}

		// Update local project object
		this.project = {
			...this.project!,
			...updateData
		};

		console.log('Updated project dates:', updateData);
	}

	/**
	 * Check if this is a regeneration (phases already exist)
	 */
	private async checkIfRegeneration(): Promise<boolean> {
		const { data: existingPhases } = await this.supabase
			.from('phases')
			.select('id')
			.eq('project_id', this.projectId)
			.limit(1);

		return (existingPhases?.length || 0) > 0;
	}

	/**
	 * Select tasks for first-time generation
	 */
	private async selectTasksForFirstGeneration(): Promise<Task[]> {
		const query = this.supabase
			.from('tasks')
			.select('*')
			.eq('project_id', this.projectId)
			.is('deleted_at', null)
			.in('status', this.config.selectedStatuses);

		// Exclude recurring tasks if not including them
		if (!this.config.includeRecurringTasks) {
			query.neq('task_type', 'recurring');
		}

		const { data: tasks, error } = await query;

		if (error) {
			throw new Error(`Failed to fetch tasks: ${error.message}`);
		}

		console.log(
			`First generation: selected ${tasks?.length || 0} tasks with statuses: ${this.config.selectedStatuses.join(', ')}`
		);

		return tasks || [];
	}

	/**
	 * Select tasks for regeneration (existing + new)
	 */
	private async selectTasksForRegeneration(): Promise<Task[]> {
		// Get all project tasks
		const query = this.supabase
			.from('tasks')
			.select('*')
			.eq('project_id', this.projectId)
			.is('deleted_at', null);

		// Exclude recurring tasks if not including them
		if (!this.config.includeRecurringTasks) {
			query.neq('task_type', 'recurring');
		}

		const { data: allTasks, error: tasksError } = await query;

		if (tasksError) {
			throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
		}

		// Get tasks currently in phases
		const { data: phaseAssignments, error: assignmentsError } = await this.supabase
			.from('phase_tasks')
			.select(
				`
				task_id,
				phases!inner(project_id)
			`
			)
			.eq('phases.project_id', this.projectId);

		if (assignmentsError) {
			throw new Error(`Failed to fetch phase assignments: ${assignmentsError.message}`);
		}

		const tasksInPhasesSet = new Set(phaseAssignments?.map((pa) => pa.task_id) || []);

		// Include ALL tasks currently in phases (regardless of status)
		const tasksInPhases = (allTasks || []).filter((t) => tasksInPhasesSet.has(t.id));

		// Include tasks matching selected statuses that are NOT in phases
		const newTasksMatchingStatus = (allTasks || []).filter(
			(t) => !tasksInPhasesSet.has(t.id) && this.config.selectedStatuses.includes(t.status)
		);

		const result = [...tasksInPhases, ...newTasksMatchingStatus];

		console.log(
			`Regeneration: ${tasksInPhases.length} existing phase tasks + ${newTasksMatchingStatus.length} new tasks = ${result.length} total`
		);

		return result;
	}

	/**
	 * Clear recurring fields from non-recurring tasks
	 */
	private async clearInvalidRecurringData(tasks: Task[]): Promise<void> {
		const tasksWithInvalidData = tasks.filter(
			(task) =>
				task.task_type !== 'recurring' &&
				(task.recurrence_pattern || task.recurrence_ends || task.recurrence_end_source)
		);

		if (tasksWithInvalidData.length > 0) {
			const { error } = await this.supabase
				.from('tasks')
				.update({
					recurrence_pattern: null,
					recurrence_ends: null,
					recurrence_end_source: null
				})
				.in(
					'id',
					tasksWithInvalidData.map((t) => t.id)
				);

			if (!error) {
				console.log(
					`Cleared recurring data from ${tasksWithInvalidData.length} non-recurring tasks`
				);
			}
		}
	}

	/**
	 * Get existing phase assignments for regeneration
	 */
	private async getExistingPhaseAssignments(): Promise<ExistingPhaseAssignment[]> {
		const { data, error } = await this.supabase
			.from('phase_tasks')
			.select(
				`
				task_id,
				phase_id,
				phases!inner(
					id,
					project_id
				)
			`
			)
			.eq('phases.project_id', this.projectId);

		if (error) {
			console.error('Failed to fetch existing phase assignments:', error);
			return [];
		}

		return data || [];
	}

	/**
	 * Get the appropriate scheduling strategy
	 */
	private getStrategy(method: SchedulingMethod): BaseSchedulingStrategy {
		switch (method) {
			case 'phases_only':
				return new PhasesOnlyStrategy(this.supabase, this.userId);

			case 'schedule_in_phases':
				return new ScheduleInPhasesStrategy(this.supabase, this.userId);

			case 'calendar_optimized':
				// For now, use schedule_in_phases as fallback
				// TODO: Implement CalendarOptimizedStrategy
				console.warn('Calendar optimization not yet implemented, using schedule_in_phases');
				return new ScheduleInPhasesStrategy(this.supabase, this.userId);

			default:
				throw new Error(`Unknown scheduling method: ${method}`);
		}
	}

	/**
	 * Fetch generated phases with their tasks
	 */
	private async fetchGeneratedPhases(): Promise<any[]> {
		const { data: phases, error } = await this.supabase
			.from('phases')
			.select(
				`
				*,
				phase_tasks (
					task_id,
					suggested_start_date,
					assignment_reason,
					tasks (
						id,
						title,
						description,
						status,
						priority,
						task_type,
						start_date,
						deleted_at,
						created_at,
						updated_at
					)
				)
			`
			)
			.eq('project_id', this.projectId)
			.order('order', { ascending: true });

		if (error) {
			console.error('Error fetching generated phases:', error);
			return [];
		}

		// Process phases to match expected format
		return (phases || []).map((phase) => {
			const phaseTasks =
				phase.phase_tasks
					?.map((pt: any) => ({
						...pt.tasks,
						suggested_start_date: pt.suggested_start_date,
						assignment_reason: pt.assignment_reason
					}))
					.filter((task: any) => task && !task.deleted_at) || [];

			const taskCount = phaseTasks.length;
			const completedTasks = phaseTasks.filter((task: any) => task.status === 'done').length;

			return {
				...phase,
				tasks: phaseTasks,
				task_count: taskCount,
				completed_tasks: completedTasks
			};
		});
	}

	/**
	 * Get tasks not assigned to any phase
	 */
	private async getBacklogTasks(taskAssignments: Record<string, any>): Promise<any[]> {
		const assignedTaskIds = new Set(
			Object.keys(taskAssignments).filter((id) => taskAssignments[id].phase_order !== null)
		);

		// Build query matching the same filters used in task fetching
		const query = this.supabase
			.from('tasks')
			.select('*')
			.eq('project_id', this.projectId)
			.is('deleted_at', null)
			.neq('status', 'done');

		// Apply the same recurring task filter as in task fetching
		if (!this.config.includeRecurringTasks) {
			query.neq('task_type', 'recurring');
		}

		const { data: allTasks } = await query;

		return (allTasks || []).filter((t) => !assignedTaskIds.has(t.id));
	}

	/**
	 * Handle historical preservation during regeneration
	 * Preserves completed and current phases, reallocates completed future tasks
	 */
	private async handleHistoricalPreservation(): Promise<void> {
		console.log('[handleHistoricalPreservation] Starting historical preservation...');
		const now = new Date();
		const nowIso = now.toISOString();
		const completedStatuses = new Set(['done', 'completed']);
		const isTaskCompleted = (task: any): boolean => {
			if (!task) return false;
			return completedStatuses.has(task.status) || Boolean(task.completed_at);
		};
		const isTaskDeleted = (task: any): boolean => Boolean(task?.deleted_at);
		const isTaskCompleteOrDeleted = (task: any): boolean =>
			isTaskCompleted(task) || isTaskDeleted(task);

		// Fetch all existing phases with their tasks
		const { data: allPhases, error: phasesError } = await this.supabase
			.from('phases')
			.select(
				`
				*,
				phase_tasks (
					id,
					task_id,
					suggested_start_date,
					tasks!inner (
						id,
						title,
						status,
						deleted_at,
						completed_at,
						start_date
					)
				)
			`
			)
			.eq('project_id', this.projectId)
			.order('order', { ascending: true });

		if (phasesError) {
			console.error('[handleHistoricalPreservation] Failed to fetch phases:', phasesError);
			throw new Error(`Failed to fetch phases: ${phasesError.message}`);
		}

		const phases = allPhases || [];
		console.log(`[handleHistoricalPreservation] Found ${phases.length} existing phases`);

		// Categorize phases based on their dates
		// Completed phases: ended before now
		const completedPhases = phases.filter((p) => new Date(p.end_date) < now);
		// Current phases: overlapping with now (we'll adjust their end dates)
		const currentPhases = phases.filter(
			(p) => new Date(p.start_date) <= now && new Date(p.end_date) >= now
		);
		// Future phases: starting after now (will be deleted)
		const futurePhases = phases.filter((p) => new Date(p.start_date) > now);

		console.log(`[handleHistoricalPreservation] Categorized phases:
			- Completed: ${completedPhases.length}
			- Current: ${currentPhases.length}
			- Future: ${futurePhases.length}`);

		// Determine the target phase for reallocating completed tasks
		// Priority: last current phase > last completed phase
		let targetPhase = null;
		if (currentPhases.length > 0) {
			// If multiple current phases (overlapping), use the one with latest end date
			targetPhase = currentPhases.sort((a, b) => {
				return new Date(b.end_date).getTime() - new Date(a.end_date).getTime();
			})[0];
		} else if (completedPhases.length > 0) {
			// Use the last completed phase
			targetPhase = completedPhases[completedPhases.length - 1];
		}

		// Collect completed/deleted tasks for preservation & gather incomplete tasks to release
		const completedTasksToReallocate: any[] = [];
		const completedPhaseTaskIds = new Set<string>();
		const phaseTasksToDelete = new Set<string>();
		const phaseTasksToRelease = new Set<string>();

		const collectCompletedTask = (pt: any) => {
			if (!pt) return;
			if (isTaskCompleteOrDeleted(pt.tasks)) {
				phaseTasksToRelease.delete(pt.id);
				if (!completedPhaseTaskIds.has(pt.id)) {
					completedPhaseTaskIds.add(pt.id);
					completedTasksToReallocate.push(pt);
				}
				phaseTasksToDelete.add(pt.id);
			} else if (!phaseTasksToDelete.has(pt.id)) {
				phaseTasksToRelease.add(pt.id);
			}
		};

		// 1. Collect tasks from future phases, splitting by completion state
		for (const phase of futurePhases) {
			for (const pt of phase.phase_tasks || []) {
				collectCompletedTask(pt);
			}
		}

		// 2. Also evaluate tasks in all phases with future-dated assignments
		for (const phase of [...completedPhases, ...currentPhases, ...futurePhases]) {
			for (const pt of phase.phase_tasks || []) {
				if (!pt.tasks?.start_date) continue;
				const taskDate = new Date(pt.tasks.start_date);
				if (taskDate > now) {
					collectCompletedTask(pt);
				}
			}
		}

		// 3. Release any incomplete tasks still attached to historical phases
		for (const phase of [...completedPhases, ...currentPhases]) {
			for (const pt of phase.phase_tasks || []) {
				if (!isTaskCompleteOrDeleted(pt.tasks)) {
					phaseTasksToRelease.add(pt.id);
				}
			}
		}

		console.log(
			`Found ${completedTasksToReallocate.length} completed/deleted task assignments to preserve in history`
		);

		// Reallocate completed tasks to the most recent historical phase
		if (targetPhase && completedTasksToReallocate.length > 0) {
			console.log(
				`Reallocating ${completedTasksToReallocate.length} completed tasks to phase: ${targetPhase.name}`
			);

			// Check which tasks already exist in the target phase to avoid duplicates
			const { data: existingPhaseTasksInTarget } = await this.supabase
				.from('phase_tasks')
				.select('task_id')
				.eq('phase_id', targetPhase.id);

			const existingTaskIds = new Set(
				(existingPhaseTasksInTarget || []).map((pt) => pt.task_id)
			);

			// Delete old phase_tasks entries for the reallocated tasks
			const phaseTasksToDeleteArray = Array.from(phaseTasksToDelete);
			if (phaseTasksToDeleteArray.length > 0) {
				const { error: deleteError } = await this.supabase
					.from('phase_tasks')
					.delete()
					.in('id', phaseTasksToDeleteArray);

				if (deleteError) {
					console.error('Failed to delete old phase_tasks:', deleteError);
				} else {
					console.log(
						`Deleted ${phaseTasksToDeleteArray.length} old phase_task assignments`
					);
				}
			}

			// Only create new phase_tasks entries for tasks not already in the target phase
			const newPhaseTasksData = completedTasksToReallocate
				.filter((pt) => !existingTaskIds.has(pt.task_id))
				.map((pt) => ({
					phase_id: targetPhase.id,
					task_id: pt.task_id,
					suggested_start_date: pt.suggested_start_date || pt.tasks?.start_date,
					assignment_reason:
						'Completed task reallocated to historical phase during regeneration'
				}));

			if (newPhaseTasksData.length > 0) {
				const { error: insertError } = await this.supabase
					.from('phase_tasks')
					.insert(newPhaseTasksData);

				if (insertError) {
					console.error('Failed to reallocate tasks:', insertError);
				} else {
					console.log(
						`Successfully reallocated ${newPhaseTasksData.length} tasks to ${targetPhase.name}`
					);
				}
			} else if (existingTaskIds.size > 0) {
				console.log(`Skipped ${existingTaskIds.size} tasks already in target phase`);
			}
		} else if (completedTasksToReallocate.length > 0) {
			console.log(
				`Warning: ${completedTasksToReallocate.length} completed tasks found but no historical phase to reallocate to`
			);
		}

		// Remove any incomplete task assignments so they can be reassigned
		for (const id of phaseTasksToDelete) {
			phaseTasksToRelease.delete(id);
		}

		if (phaseTasksToRelease.size > 0) {
			const releaseIds = Array.from(phaseTasksToRelease);
			console.log(
				`Releasing ${releaseIds.length} incomplete task assignments for regeneration`
			);
			const { error: releaseError } = await this.supabase
				.from('phase_tasks')
				.delete()
				.in('id', releaseIds);

			if (releaseError) {
				console.error('Failed to release incomplete tasks from phases:', releaseError);
			}
		}

		// Adjust current phases: set their end date to now (they become historical)
		if (currentPhases.length > 0) {
			console.log(`Adjusting ${currentPhases.length} current phases to end now`);
			for (const phase of currentPhases) {
				const { error: updateError } = await this.supabase
					.from('phases')
					.update({
						end_date: nowIso
					})
					.eq('id', phase.id);

				if (updateError) {
					console.error(`Failed to update phase ${phase.id}:`, updateError);
				} else {
					console.log(`Phase "${phase.name}" end date adjusted to: ${nowIso}`);
				}
			}
		}

		// Ensure no historical phases have end dates in the future
		for (const phase of completedPhases) {
			if (new Date(phase.end_date) > now) {
				console.log(
					`Adjusting completed phase "${phase.name}" end date from future to now`
				);
				const { error: updateError } = await this.supabase
					.from('phases')
					.update({
						end_date: nowIso
					})
					.eq('id', phase.id);

				if (updateError) {
					console.error(`Failed to adjust phase ${phase.id} end date:`, updateError);
				}
			}
		}

		// Delete empty future phases and all remaining future phases
		const futurePhasesToDelete = futurePhases.map((p) => p.id);

		if (futurePhasesToDelete.length > 0) {
			// First delete all phase_tasks for future phases
			await this.supabase.from('phase_tasks').delete().in('phase_id', futurePhasesToDelete);

			// Then delete the phases themselves
			const { error: deleteError } = await this.supabase
				.from('phases')
				.delete()
				.in('id', futurePhasesToDelete);

			if (deleteError) {
				console.error('Failed to delete future phases:', deleteError);
			} else {
				console.log(`Deleted ${futurePhasesToDelete.length} future phases`);
			}
		}

		// Store preserved phases for context (with updated end dates)
		// Re-fetch to get the updated end dates
		const { data: updatedPreservedPhases } = await this.supabase
			.from('phases')
			.select('*')
			.eq('project_id', this.projectId)
			.lte('start_date', now.toISOString())
			.order('order', { ascending: true });

		this.preservedPhases = updatedPreservedPhases || [];
		console.log(
			`Preserved ${this.preservedPhases.length} historical phases (completed + adjusted current)`
		);
	}

	/**
	 * Delete all phases and their associations
	 */
	private async deleteAllPhases(): Promise<void> {
		// First delete all phase_tasks
		const { error: phaseTasksError } = await this.supabase
			.from('phase_tasks')
			.delete()
			.in(
				'phase_id',
				(
					await this.supabase.from('phases').select('id').eq('project_id', this.projectId)
				).data?.map((p) => p.id) || []
			);

		if (phaseTasksError) {
			console.error('Failed to delete phase_tasks:', phaseTasksError);
		}

		// Then delete all phases
		const { error: phasesError } = await this.supabase
			.from('phases')
			.delete()
			.eq('project_id', this.projectId);

		if (phasesError) {
			console.error('Failed to delete phases:', phasesError);
		} else {
			console.log('Deleted all existing phases');
		}

		this.preservedPhases = [];
	}
}
