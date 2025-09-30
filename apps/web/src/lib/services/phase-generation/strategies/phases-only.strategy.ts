// apps/web/src/lib/services/phase-generation/strategies/phases-only.strategy.ts

import { BaseSchedulingStrategy } from './base-strategy';
import type { Task, TaskFilterResult, PhaseTaskAssignment } from '../types';
import { PromptTemplateService } from '$lib/services/promptTemplate.service';

/**
 * Strategy for organizing tasks into phases without specific date scheduling.
 * This method focuses on logical task grouping without assigning dates.
 */
export class PhasesOnlyStrategy extends BaseSchedulingStrategy {
	protected validateProjectTimeline(): void {
		const { project } = this.context;

		// Only requires start date for phases_only method
		if (!project.start_date) {
			throw new Error('Project start date is required');
		}

		const startDate = this.validateDate(project.start_date);
		if (!startDate) {
			throw new Error('Invalid project start date format');
		}

		console.log(`Phases-only generation: organizing tasks without date scheduling`);
	}

	protected async filterAndPrepareTasks(): Promise<TaskFilterResult> {
		const { tasks, project, config } = this.context;
		const today = this.getToday();
		const projectStart = this.validateDate(project.start_date);
		const projectEnd = this.validateDate(project.end_date);

		const excludedTasks: Task[] = [];
		const exclusionReasons: Record<string, string> = {};
		const warnings: string[] = [];
		const rescheduledTasks: any[] = [];

		// For phases_only, we null out conflicting dates instead of rescheduling
		const compatibleTasks = tasks
			.map((task) => {
				if (task.start_date) {
					const taskDate = this.validateDate(task.start_date);

					if (!taskDate) {
						excludedTasks.push(task);
						exclusionReasons[task.id] = 'Invalid date format';
						return null;
					}

					// Check if date needs to be nulled
					const hasConflict =
						taskDate < today ||
						(projectStart && taskDate < projectStart) ||
						(projectEnd && taskDate > projectEnd);

					if (hasConflict) {
						// If preserveExistingDates is true and it's not a recurring task,
						// keep the date even if it conflicts (user explicitly wants to keep dates)
						if (config.preserveExistingDates && task.task_type !== 'recurring') {
							warnings.push(
								`Task "${task.title}" has a date conflict but will be preserved as requested`
							);
							return task;
						}

						warnings.push(
							`Task "${task.title}" date removed (conflicts with project timeline)`
						);

						rescheduledTasks.push({
							id: task.id,
							title: task.title,
							current_start_date: task.start_date,
							new_start_date: null // Null out the date
						});

						// Return task with nulled date
						return { ...task, start_date: null };
					}
				}

				return task;
			})
			.filter(Boolean) as Task[];

		// Handle dependency exclusions
		this.cascadeDependencyExclusions(compatibleTasks, excludedTasks, exclusionReasons);

		return {
			compatibleTasks,
			excludedTasks,
			exclusionReasons,
			warnings,
			rescheduledTasks
		};
	}

	protected async generatePrompts(
		tasks: Task[]
	): Promise<{ systemPrompt: string; userPrompt: string }> {
		const { project, config, preservedPhases } = this.context;
		const promptService = new PromptTemplateService(this.supabase);

		// Use phases_only specific prompts
		const userPrompt = promptService.buildPhaseGenerationDataPrompt(
			project,
			tasks,
			'phases_only',
			config.includeRecurringTasks || false,
			config.allowRecurringReschedule || false,
			config.preserveExistingDates || false,
			config.userInstructions,
			preservedPhases
		);

		const systemPrompt = promptService.buildPhaseGenerationSystemPrompt(
			'phases_only',
			config.includeRecurringTasks || false,
			config.allowRecurringReschedule || false,
			config.preserveExistingDates || false,
			config.userInstructions,
			preservedPhases
		);

		return { systemPrompt, userPrompt };
	}

	protected determineSuggestedStartDate(): string | null {
		// Phases-only method never assigns suggested start dates
		return null;
	}

	protected getDefaultStartDateForPhase(): string | null {
		// No dates for phases-only method
		return null;
	}

	protected async handleTaskDateUpdates(assignments: PhaseTaskAssignment[]): Promise<void> {
		// For phases_only method, only null out dates if preserveExistingDates is false
		if (assignments.length === 0) return;

		// If preserving existing dates, skip the nulling operation
		if (this.context.config.preserveExistingDates) {
			console.log(
				`Preserved existing dates for ${assignments.length} tasks (phases_only method with preserveExistingDates)`
			);
			return;
		}

		const taskIds = assignments.map((a) => a.task_id);

		const { error } = await this.supabase
			.from('tasks')
			.update({ start_date: null })
			.in('id', taskIds);

		if (error) {
			console.error('Failed to null task dates:', error);
		} else {
			console.log(`Nulled start_date for ${taskIds.length} tasks (phases_only method)`);
		}
	}

	private cascadeDependencyExclusions(
		compatibleTasks: Task[],
		excludedTasks: Task[],
		exclusionReasons: Record<string, string>
	): void {
		const excludedIds = new Set(excludedTasks.map((t) => t.id));
		const dependentsMap = new Map<string, string[]>();

		// Build dependency map
		for (const task of [...compatibleTasks, ...excludedTasks]) {
			for (const depId of task.dependencies || []) {
				if (!dependentsMap.has(depId)) {
					dependentsMap.set(depId, []);
				}
				dependentsMap.get(depId)!.push(task.id);
			}
		}

		// Cascade exclusions
		const excludeDependents = (taskId: string, reason: string) => {
			const dependents = dependentsMap.get(taskId) || [];
			for (const dependentId of dependents) {
				if (!excludedIds.has(dependentId)) {
					excludedIds.add(dependentId);
					exclusionReasons[dependentId] = `Depends on excluded task: ${reason}`;

					// Remove from compatible tasks
					const index = compatibleTasks.findIndex((t) => t.id === dependentId);
					if (index !== -1) {
						const [task] = compatibleTasks.splice(index, 1);
						excludedTasks.push(task);
					}

					// Recursively exclude dependents
					excludeDependents(dependentId, `cascade from ${taskId}`);
				}
			}
		};

		// Apply cascading exclusions
		for (const excludedTask of excludedTasks) {
			excludeDependents(excludedTask.id, exclusionReasons[excludedTask.id]);
		}
	}
}
