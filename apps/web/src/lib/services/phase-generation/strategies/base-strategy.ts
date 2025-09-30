// apps/web/src/lib/services/phase-generation/strategies/base-strategy.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	PhaseGenerationResult,
	Task,
	TaskFilterResult,
	GenerationContext,
	PhaseTaskAssignment
} from '../types';
import type { Project, Phase } from '$lib/types/project';
import { validatePhaseDatesAgainstProject } from '$lib/utils/dateValidation';

export abstract class BaseSchedulingStrategy {
	protected supabase: SupabaseClient;
	protected context!: GenerationContext; // Using definite assignment assertion since it's set in execute()
	protected userId!: string;

	constructor(supabase: SupabaseClient, userId: string) {
		this.supabase = supabase;
		this.userId = userId;
	}

	/**
	 * Main execution method using Template Method pattern
	 */
	async execute(context: GenerationContext): Promise<PhaseGenerationResult> {
		this.context = context;

		// 1. Validate project timeline for this scheduling method
		this.validateProjectTimeline();

		// 2. Filter and prepare tasks based on scheduling method rules
		const filterResult = await this.filterAndPrepareTasks();

		// 3. Apply any task rescheduling if needed
		if (filterResult.rescheduledTasks.length > 0) {
			await this.applyTaskRescheduling(filterResult.rescheduledTasks);
		}

		// 4. Generate prompts for LLM
		const { systemPrompt, userPrompt } = await this.generatePrompts(
			filterResult.compatibleTasks
		);

		// 5. Call LLM to generate phases
		const llmResult = await this.callLLM(
			systemPrompt,
			userPrompt,
			filterResult.compatibleTasks
		);

		// 6. Validate and process LLM response
		const processedResult = await this.processLLMResponse(
			llmResult,
			filterResult.compatibleTasks
		);

		// 7. Persist phases and task assignments
		await this.persistPhases(processedResult, filterResult.compatibleTasks);

		// 8. Prepare final result with additional metadata
		return this.prepareFinalResult(processedResult, filterResult);
	}

	/**
	 * Abstract methods that each strategy must implement
	 */
	protected abstract validateProjectTimeline(): void;
	protected abstract filterAndPrepareTasks(): Promise<TaskFilterResult>;
	protected abstract generatePrompts(
		tasks: Task[]
	): Promise<{ systemPrompt: string; userPrompt: string }>;
	protected abstract handleTaskDateUpdates(assignments: PhaseTaskAssignment[]): Promise<void>;

	/**
	 * Common methods with default implementations
	 */
	protected async applyTaskRescheduling(rescheduledTasks: any[]): Promise<void> {
		for (const task of rescheduledTasks) {
			const { error } = await this.supabase
				.from('tasks')
				.update({ start_date: task.new_start_date })
				.eq('id', task.id);

			if (error) {
				console.error(`Failed to reschedule task ${task.id}:`, error);
			}
		}

		if (rescheduledTasks.length > 0) {
			console.log(
				`Updated ${rescheduledTasks.length} task dates for ${this.context.config.schedulingMethod}`
			);
		}
	}

	protected async callLLM(systemPrompt: string, userPrompt: string, tasks: Task[]): Promise<any> {
		// This will be injected or imported from the actual LLM service
		// For now, returning a placeholder
		const { SmartLLMService } = await import('$lib/services/smart-llm-service');

		const smartLLM = new SmartLLMService({
			supabase: this.supabase,
			httpReferer: 'https://buildos.io',
			appName: 'BuildOS Phase Generation'
		});

		// Select profile based on task complexity
		const profile = tasks.length > 10 ? 'balanced' : 'fast';

		const response = await smartLLM.getJSONResponse({
			systemPrompt,
			userPrompt,
			userId: this.context.config.userId,
			profile,
			temperature: 0.3,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			},
			operationType: 'phase_generation',
			projectId: this.context.project.id
		});

		if (!response) {
			throw new Error('Failed to generate phases from LLM');
		}

		return response;
	}

	protected async processLLMResponse(
		llmResult: any,
		compatibleTasks: Task[]
	): Promise<PhaseGenerationResult> {
		// Validate and adjust phase dates against project boundaries
		this.validateAndAdjustPhaseDates(llmResult.phases);

		// Validate that all tasks were assigned
		const providedTaskIds = new Set(compatibleTasks.map((t) => t.id));
		const assignedTaskIds = new Set(Object.keys(llmResult.task_assignments || {}));
		const unassignedTaskIds = [...providedTaskIds].filter((id) => !assignedTaskIds.has(id));

		// Auto-assign unassigned tasks to the last phase
		if (unassignedTaskIds.length > 0 && llmResult.phases.length > 0) {
			const lastPhase = llmResult.phases[llmResult.phases.length - 1];
			console.warn(
				`Auto-assigning ${unassignedTaskIds.length} unassigned tasks to last phase`
			);

			for (const taskId of unassignedTaskIds) {
				if (!llmResult.task_assignments) {
					llmResult.task_assignments = {};
				}
				llmResult.task_assignments[taskId] = {
					phase_order: lastPhase.order,
					suggested_start_date: this.getDefaultStartDateForPhase(lastPhase),
					reason: 'Auto-assigned: Task was not assigned by phase generation'
				};
			}
		}

		// Normalize field names: LLM may return backlog_tasks, but we use backlogTasks
		if (llmResult.backlog_tasks && !llmResult.backlogTasks) {
			llmResult.backlogTasks = llmResult.backlog_tasks;
			delete llmResult.backlog_tasks;
		}

		return llmResult as PhaseGenerationResult;
	}

	protected async persistPhases(result: PhaseGenerationResult, tasks: Task[]): Promise<void> {
		const { project, config } = this.context;

		// Store backup data for rollback in case of failure
		let deletedPhases: any[] = [];
		let deletedPhaseTasks: any[] = [];
		let createdPhaseIds: string[] = [];

		try {
			// 1. Backup existing phases before deletion (for rollback)
			const { data: existingPhases } = await this.supabase
				.from('phases')
				.select('*')
				.eq('project_id', project.id);

			if (existingPhases && existingPhases.length > 0) {
				// Backup phase_tasks for these phases
				const phaseIds = existingPhases.map((p) => p.id);
				const { data: existingPhaseTasks } = await this.supabase
					.from('phase_tasks')
					.select('*')
					.in('phase_id', phaseIds);

				deletedPhaseTasks = existingPhaseTasks || [];

				// Filter out preserved phases from backup
				if (this.context.preservedPhases && this.context.preservedPhases.length > 0) {
					const preservedIds = new Set(this.context.preservedPhases.map((p) => p.id));
					deletedPhases = existingPhases.filter((p) => !preservedIds.has(p.id));
					deletedPhaseTasks = deletedPhaseTasks.filter(
						(pt) => !preservedIds.has(pt.phase_id)
					);
				} else {
					deletedPhases = existingPhases;
				}
			}

			// 2. Delete existing phases
			await this.deleteExistingPhases();

			// 3. Create new phases
			const phases = await this.createPhases(result.phases);
			createdPhaseIds = phases.map((p) => p.id);

			// 4. Create task assignments
			const assignments = await this.createTaskAssignments(result, phases, tasks);

			// 5. Handle task date updates based on scheduling method
			await this.handleTaskDateUpdates(assignments);

			console.log(
				`Created ${phases.length} phases with ${assignments.length} task assignments`
			);
		} catch (error) {
			console.error('Phase persistence failed, attempting rollback:', error);

			// Rollback: Try to restore deleted data
			try {
				// Delete any newly created phases
				if (createdPhaseIds.length > 0) {
					await this.supabase
						.from('phase_tasks')
						.delete()
						.in('phase_id', createdPhaseIds);

					await this.supabase.from('phases').delete().in('id', createdPhaseIds);

					console.log('Rolled back newly created phases');
				}

				// Restore deleted phases
				if (deletedPhases.length > 0) {
					// Remove auto-generated fields that might cause conflicts
					const phasesToRestore = deletedPhases.map((p) => {
						const { created_at, updated_at, ...phaseData } = p;
						return phaseData;
					});

					await this.supabase.from('phases').insert(phasesToRestore);

					console.log(`Restored ${deletedPhases.length} phases`);
				}

				// Restore deleted phase_tasks
				if (deletedPhaseTasks.length > 0) {
					const phaseTasksToRestore = deletedPhaseTasks.map((pt) => {
						const { created_at, updated_at, ...taskData } = pt;
						return taskData;
					});

					await this.supabase.from('phase_tasks').insert(phaseTasksToRestore);

					console.log(`Restored ${deletedPhaseTasks.length} phase_tasks`);
				}

				console.log('Rollback completed successfully');
			} catch (rollbackError) {
				console.error('CRITICAL: Rollback failed!', rollbackError);
				console.error('Database may be in inconsistent state');
				console.error('Deleted phases:', deletedPhases);
				console.error('Deleted phase_tasks:', deletedPhaseTasks);
			}

			// Re-throw the original error
			throw error;
		}
	}

	protected async deleteExistingPhases(): Promise<void> {
		const { project, preservedPhases } = this.context;

		// If we have preserved phases, only delete non-preserved phases
		if (preservedPhases && preservedPhases.length > 0) {
			const preservedPhaseIds = new Set(preservedPhases.map((p) => p.id));
			console.log(
				`[deleteExistingPhases] Preserving ${preservedPhases.length} phases:`,
				preservedPhaseIds
			);

			// Get all phases for the project
			const { data: allPhases } = await this.supabase
				.from('phases')
				.select('id, name')
				.eq('project_id', project.id);

			if (allPhases && allPhases.length > 0) {
				console.log(
					`[deleteExistingPhases] Found ${allPhases.length} total phases in project`
				);

				// Filter out preserved phases
				const phasesToDelete = allPhases.filter((p) => !preservedPhaseIds.has(p.id));

				if (phasesToDelete.length > 0) {
					const phaseIds = phasesToDelete.map((p) => p.id);
					console.log(
						`[deleteExistingPhases] Deleting ${phasesToDelete.length} non-preserved phases:`,
						phaseIds
					);

					// Delete phase-task relationships for non-preserved phases
					await this.supabase.from('phase_tasks').delete().in('phase_id', phaseIds);

					// Delete non-preserved phases
					await this.supabase.from('phases').delete().in('id', phaseIds);

					console.log(
						`[deleteExistingPhases] Successfully deleted ${phasesToDelete.length} non-preserved phases`
					);
				} else {
					console.log(`[deleteExistingPhases] No non-preserved phases to delete`);
				}
			} else {
				console.log(`[deleteExistingPhases] No phases found in project`);
			}

			console.log(
				`[deleteExistingPhases] Preserved ${preservedPhases.length} historical phases`
			);
			return;
		}

		// Original behavior when not preserving phases
		// Get existing phases
		const { data: existingPhases } = await this.supabase
			.from('phases')
			.select('id')
			.eq('project_id', project.id);

		if (existingPhases && existingPhases.length > 0) {
			const phaseIds = existingPhases.map((p) => p.id);

			// Delete phase-task relationships
			await this.supabase.from('phase_tasks').delete().in('phase_id', phaseIds);

			console.log(`Deleted task assignments for ${existingPhases.length} existing phases`);
		}

		// Delete phases
		await this.supabase.from('phases').delete().eq('project_id', project.id);
	}

	protected async createPhases(phaseDefs: any[]): Promise<Phase[]> {
		const { project, config, preservedPhases } = this.context;

		// Adjust phase order to continue from preserved phases
		let startingOrder = 1;
		if (preservedPhases && preservedPhases.length > 0) {
			// Find the highest order number from preserved phases
			startingOrder = Math.max(...preservedPhases.map((p) => p.order)) + 1;
			console.log(
				`Starting new phases from order ${startingOrder} after ${preservedPhases.length} preserved phases`
			);
		}

		const now = new Date();
		const nowTime = now.getTime();
		const DEFAULT_PHASE_DURATION_MS = 24 * 60 * 60 * 1000; // 1 day fallback

		let minStartTime = nowTime;
		if (preservedPhases && preservedPhases.length > 0) {
			const lastPreservedPhase = preservedPhases[preservedPhases.length - 1];
			const lastPreservedEnd = new Date(lastPreservedPhase.end_date).getTime();
			if (!isNaN(lastPreservedEnd)) {
				minStartTime = Math.max(minStartTime, lastPreservedEnd);
			}
		}

		let rollingStartTime = minStartTime;

		// Adjust phase orders and ensure they begin no earlier than the current moment or preserved history
		const adjustedPhaseDefs = phaseDefs.map((phase, index) => {
			const adjustedPhase = {
				...phase,
				order: startingOrder + index
			};

			const originalStart = new Date(phase.start_date);
			const originalEnd = new Date(phase.end_date);
			let originalStartMs = originalStart.getTime();
			let originalEndMs = originalEnd.getTime();

			if (isNaN(originalStartMs)) {
				originalStartMs = rollingStartTime;
			}

			if (isNaN(originalEndMs) || originalEndMs <= originalStartMs) {
				originalEndMs = originalStartMs + DEFAULT_PHASE_DURATION_MS;
			}

			let startMs = Math.max(originalStartMs, rollingStartTime);
			let durationMs = originalEndMs - originalStartMs;
			if (!isFinite(durationMs) || durationMs <= 0) {
				durationMs = DEFAULT_PHASE_DURATION_MS;
			}
			let endMs = startMs + durationMs;

			// Ensure we never schedule earlier than "now"
			startMs = Math.max(startMs, nowTime);
			endMs = Math.max(endMs, startMs + 60 * 60 * 1000); // Guarantee at least 1 hour span

			if (startMs !== originalStartMs || endMs !== originalEndMs) {
				console.log(
					`Adjusted phase "${phase.name}" timeline from ${new Date(originalStartMs).toISOString()} - ${new Date(originalEndMs).toISOString()} to ${new Date(startMs).toISOString()} - ${new Date(endMs).toISOString()}`
				);
			}

			adjustedPhase.start_date = new Date(startMs).toISOString();
			adjustedPhase.end_date = new Date(endMs).toISOString();

			rollingStartTime = endMs;

			return adjustedPhase;
		});

		const { data: phases, error } = await this.supabase
			.from('phases')
			.insert(
				adjustedPhaseDefs.map((phase) => ({
					project_id: project.id,
					user_id: config.userId,
					scheduling_method: config.schedulingMethod,
					...phase
				}))
			)
			.select();

		if (error || !phases) {
			throw new Error(`Failed to create phases: ${error?.message}`);
		}

		return phases;
	}

	protected async createTaskAssignments(
		result: PhaseGenerationResult,
		phases: Phase[],
		tasks: Task[]
	): Promise<PhaseTaskAssignment[]> {
		const assignments: PhaseTaskAssignment[] = [];
		const taskMap = new Map(tasks.map((t) => [t.id, t]));

		for (const [taskId, assignment] of Object.entries(result.task_assignments)) {
			if (assignment.phase_order !== null && assignment.phase_order !== undefined) {
				const phase = phases.find((p) => p.order === assignment.phase_order);
				const task = taskMap.get(taskId);

				if (phase && task) {
					assignments.push({
						phase_id: phase.id,
						task_id: taskId,
						suggested_start_date: this.determineSuggestedStartDate(
							assignment,
							phase,
							task
						),
						assignment_reason: assignment.reason
					});
				}
			}
		}

		if (assignments.length > 0) {
			const { error } = await this.supabase.from('phase_tasks').insert(assignments);

			if (error) {
				throw new Error(`Failed to create task assignments: ${error.message}`);
			}
		}

		return assignments;
	}

	protected determineSuggestedStartDate(
		assignment: any,
		phase: Phase,
		task: Task
	): string | null {
		// Override in subclasses for specific scheduling method behavior
		return assignment.suggested_start_date;
	}

	protected getDefaultStartDateForPhase(phase: any): string | null {
		// Override in subclasses
		return phase.start_date;
	}

	protected prepareFinalResult(
		processedResult: PhaseGenerationResult,
		filterResult: TaskFilterResult
	): PhaseGenerationResult {
		return {
			...processedResult,
			filtering_summary: {
				total_tasks: this.context.tasks.length,
				compatible_tasks: filterResult.compatibleTasks.length,
				excluded_tasks: filterResult.excludedTasks.length,
				rescheduled_tasks: filterResult.rescheduledTasks.length,
				exclusion_reasons: filterResult.exclusionReasons,
				warnings: filterResult.warnings,
				scheduling_method: this.context.config.schedulingMethod
			},
			project_dates_updated: this.context.config.projectDatesChanged,
			is_regeneration: this.context.isRegeneration
		};
	}

	/**
	 * Helper method for date validation
	 */
	protected validateDate(dateStr: string | null | undefined): Date | null {
		if (!dateStr) return null;
		const date = new Date(dateStr);
		return isNaN(date.getTime()) ? null : date;
	}

	protected getToday(): Date {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}

	/**
	 * Validate and adjust phase dates to ensure they fall within project boundaries
	 */
	protected validateAndAdjustPhaseDates(phases: any[]): void {
		const { project } = this.context;

		if (!project.start_date) {
			console.warn('No project start date, skipping phase date validation');
			return;
		}

		const projectStart = new Date(project.start_date);
		const projectEnd = project.end_date ? new Date(project.end_date) : null;
		const today = new Date();

		for (const phase of phases) {
			let phaseStart = new Date(phase.start_date);
			let phaseEnd = new Date(phase.end_date);
			let adjusted = false;

			// Validate against project boundaries
			const validation = validatePhaseDatesAgainstProject(
				phase.start_date,
				phase.end_date,
				project.start_date,
				project.end_date
			);

			if (!validation.isValid) {
				console.log(`Phase "${phase.name}" validation failed: ${validation.error}`);

				// Auto-adjust phase dates to fit within project boundaries
				// Adjust start date if before project start
				if (phaseStart < projectStart) {
					const daysDiff = Math.ceil(
						(phaseEnd.getTime() - phaseStart.getTime()) / (1000 * 60 * 60 * 24)
					);
					phaseStart = new Date(projectStart);
					phaseEnd = new Date(phaseStart);
					phaseEnd.setDate(phaseEnd.getDate() + daysDiff);
					adjusted = true;
					console.log(`Adjusted phase "${phase.name}" start to project start date`);
				}

				// Adjust end date if after project end
				if (projectEnd && phaseEnd > projectEnd) {
					phaseEnd = new Date(projectEnd);
					// If this makes the phase too short, adjust start date proportionally
					if (phaseStart >= phaseEnd) {
						const phaseDuration = 7; // Default to 7 days if phase becomes invalid
						phaseStart = new Date(phaseEnd);
						phaseStart.setDate(phaseStart.getDate() - phaseDuration);
						if (phaseStart < projectStart) {
							phaseStart = new Date(projectStart);
						}
					}
					adjusted = true;
					console.log(`Adjusted phase "${phase.name}" end to project end date`);
				}

				// Ensure phase dates are not in the past (unless preserving historical)
				if (!this.context.preservedPhases?.length && phaseStart < today) {
					const daysDiff = Math.ceil(
						(phaseEnd.getTime() - phaseStart.getTime()) / (1000 * 60 * 60 * 24)
					);
					phaseStart = new Date(Math.max(today.getTime(), projectStart.getTime()));
					phaseEnd = new Date(phaseStart);
					phaseEnd.setDate(phaseEnd.getDate() + daysDiff);
					adjusted = true;
					console.log(`Adjusted phase "${phase.name}" to not be in the past`);
				}
			}

			// Ensure phase end is after phase start
			if (phaseEnd <= phaseStart) {
				phaseEnd = new Date(phaseStart);
				phaseEnd.setDate(phaseEnd.getDate() + 7); // Default to 7 days
				adjusted = true;
				console.log(
					`Adjusted phase "${phase.name}" to ensure end date is after start date`
				);
			}

			// Apply adjustments if any were made
			if (adjusted) {
				phase.start_date = phaseStart.toISOString();
				phase.end_date = phaseEnd.toISOString();
				console.log(
					`Phase "${phase.name}" dates adjusted to: ${phaseStart.toISOString().split('T')[0]} - ${phaseEnd.toISOString().split('T')[0]}`
				);
			}
		}

		// Note: We're not checking for overlaps since overlapping phases are allowed per requirements
		console.log('Phase date validation and adjustment complete');
	}
}
