// apps/web/src/lib/services/phase-generation/strategies/schedule-in-phases.strategy.ts

import { BaseSchedulingStrategy } from './base-strategy';
import type {
	Task,
	TaskFilterResult,
	PhaseTaskAssignment,
	GenerationContext,
	PhaseGenerationResult
} from '../types';
import type { Phase } from '$lib/types/project';
import { PromptTemplateService } from '$lib/services/promptTemplate.service';
import { CalendarService } from '$lib/services/calendar-service';
import { TaskTimeSlotFinder } from '$lib/services/task-time-slot-finder';
import { checkTaskPhaseCompatibility } from '$lib/utils/dateValidation';

/**
 * Strategy for scheduling tasks within phase boundaries.
 * Tasks are assigned specific dates that fall within their assigned phase's timeline.
 */
export class ScheduleInPhasesStrategy extends BaseSchedulingStrategy {
	protected validateProjectTimeline(): void {
		const { project } = this.context;

		// Start date is always required
		if (!project.start_date) {
			throw new Error('Project start date is required for task scheduling');
		}

		const startDate = this.validateDate(project.start_date);
		if (!startDate) {
			throw new Error('Invalid project start date format');
		}

		// End date is optional - if not provided, we'll schedule tasks flexibly
		if (project.end_date) {
			const endDate = this.validateDate(project.end_date);

			if (!endDate) {
				throw new Error('Invalid project end date format');
			}

			if (startDate >= endDate) {
				throw new Error('Project start date must be before end date');
			}

			// Check if timeline is too short
			const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
			if (diffDays < 3) {
				console.warn(
					'Project timeline is very short (less than 3 days) - scheduling may be constrained'
				);
			}

			console.log(`Schedule-in-phases generation: ${diffDays} days available for scheduling`);
		} else {
			console.log(
				`Schedule-in-phases generation: flexible scheduling from start date (no end date specified)`
			);
		}
	}

	protected async filterAndPrepareTasks(): Promise<TaskFilterResult> {
		const { tasks, project, config } = this.context;
		const today = this.getToday();
		const projectStart = this.validateDate(project.start_date)!;
		const projectEnd = project.end_date ? this.validateDate(project.end_date) : null;

		const excludedTasks: Task[] = [];
		const exclusionReasons: Record<string, string> = {};
		const warnings: string[] = [];
		const rescheduledTasks: any[] = [];
		const compatibleTasks: Task[] = [];

		// Process each task for scheduling conflicts
		for (const task of tasks) {
			// Skip rescheduling for tasks with dates if preserveExistingDates is true
			// BUT only for non-recurring tasks (recurring tasks have their own handling)
			if (task.start_date && config.preserveExistingDates && task.task_type !== 'recurring') {
				// Keep existing date, just add to compatible tasks
				compatibleTasks.push(task);
				continue;
			}

			if (!task.start_date) {
				// Flexible tasks are always compatible
				compatibleTasks.push(task);
				continue;
			}

			const taskDate = this.validateDate(task.start_date);

			if (!taskDate) {
				excludedTasks.push(task);
				exclusionReasons[task.id] = `Invalid task start date: ${task.start_date}`;
				continue;
			}

			let needsRescheduling = false;
			let newStartDate: Date | null = null;

			// Check for various conflicts
			if (taskDate < today) {
				// Task is in the past
				needsRescheduling = true;
				newStartDate = projectStart > today ? projectStart : today;
				warnings.push(
					`Task "${task.title}" was scheduled in the past and will be rescheduled to ${newStartDate.toISOString().split('T')[0]}`
				);
			} else if (taskDate < projectStart) {
				// Task before project start
				needsRescheduling = true;
				newStartDate = projectStart > today ? projectStart : today;
				warnings.push(`Task "${task.title}" will be rescheduled to project start date`);
			} else if (projectEnd && taskDate > projectEnd) {
				// Task after project end (only check if project has an end date)
				needsRescheduling = true;
				// Try to fit within project timeline
				const projectDuration = projectEnd.getTime() - projectStart.getTime();
				const suggestedDate = new Date(projectStart.getTime() + projectDuration * 0.6);
				newStartDate = suggestedDate > today ? suggestedDate : today;
				warnings.push(`Task "${task.title}" will be rescheduled within project timeline`);
			}

			if (needsRescheduling && newStartDate) {
				// Ensure we never schedule before today
				if (newStartDate < today) {
					newStartDate = today;
				}

				rescheduledTasks.push({
					id: task.id,
					title: task.title,
					current_start_date: task.start_date,
					new_start_date: newStartDate.toISOString().split('T')[0]
				});

				// Update task for processing
				compatibleTasks.push({
					...task,
					start_date: newStartDate.toISOString().split('T')[0] as string
				});
			} else {
				compatibleTasks.push(task);
			}
		}

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

		const userPrompt = promptService.buildPhaseGenerationDataPrompt(
			project,
			tasks as any[],
			'schedule_in_phases',
			config.includeRecurringTasks || false,
			config.allowRecurringReschedule || false,
			config.preserveExistingDates || false,
			config.userInstructions,
			preservedPhases
		);

		const systemPrompt = promptService.buildPhaseGenerationSystemPrompt(
			'schedule_in_phases',
			config.includeRecurringTasks || false,
			config.allowRecurringReschedule || false,
			config.preserveExistingDates || false,
			config.userInstructions,
			preservedPhases
		);

		return { systemPrompt, userPrompt };
	}

	protected determineSuggestedStartDate(
		assignment: any,
		phase: Phase,
		task: Task
	): string | null {
		// Use provided suggested date or task's existing date if within phase bounds
		if (assignment.suggested_start_date) {
			return this.validateDateWithinPhase(assignment.suggested_start_date, phase);
		}

		// If task has existing date, validate it's within phase bounds
		if (task.start_date) {
			const compatibility = checkTaskPhaseCompatibility(
				task,
				phase,
				this.context.project.start_date,
				this.context.project.end_date
			);

			if (compatibility.compatible) {
				return task.start_date;
			} else {
				// Task date is outside phase bounds, adjust to phase start
				console.log(
					`Task "${task.title}" date adjusted to fit within phase "${phase.name}"`
				);
				if (compatibility.conflicts[0]?.suggestedDate) {
					return compatibility.conflicts[0].suggestedDate.toISOString();
				}
			}
		}

		// Default to phase start date
		return phase.start_date;
	}

	protected getDefaultStartDateForPhase(phase: any): string | null {
		return phase.start_date;
	}

	protected async handleTaskDateUpdates(assignments: PhaseTaskAssignment[]): Promise<void> {
		if (assignments.length === 0) return;

		// Get all tasks to update
		const taskIds = assignments.map((a) => a.task_id);
		const { data: tasks } = await this.supabase.from('tasks').select('*').in('id', taskIds);

		if (!tasks || tasks.length === 0) {
			console.log('No tasks found to update dates');
			return;
		}

		// Get phase information for validation
		const phaseIds = [...new Set(assignments.map((a) => a.phase_id))];
		const { data: phases } = await this.supabase.from('phases').select('*').in('id', phaseIds);

		const phaseMap = new Map((phases || []).map((p) => [p.id, p]));

		// Map assignments to tasks with suggested dates, ensuring they fall within phase bounds
		const tasksWithDates = tasks.map((task) => {
			const assignment = assignments.find((a) => a.task_id === task.id);
			if (assignment?.suggested_start_date) {
				const phase = phaseMap.get(assignment.phase_id);
				if (!phase) {
					console.warn(`Phase not found for task ${task.id}`);
					return task;
				}

				// Ensure task date is within phase bounds
				let suggestedDate = new Date(assignment.suggested_start_date);
				const phaseStart = new Date(phase.start_date);
				const phaseEnd = new Date(phase.end_date);

				// Constrain to phase boundaries
				if (suggestedDate < phaseStart) {
					suggestedDate = new Date(phaseStart);
					console.log(`Task "${task.title}" date adjusted to phase start`);
				} else if (suggestedDate > phaseEnd) {
					// Set to middle of phase if after phase end
					const phaseMidpoint = new Date((phaseStart.getTime() + phaseEnd.getTime()) / 2);
					suggestedDate = phaseMidpoint;
					console.log(`Task "${task.title}" date adjusted to phase midpoint`);
				}

				// If it's just a date (time is 00:00:00), set it to 9am
				if (suggestedDate.getHours() === 0 && suggestedDate.getMinutes() === 0) {
					suggestedDate.setHours(9, 0, 0, 0);
				}
				return {
					...task,
					start_date: suggestedDate.toISOString()
				};
			}
			return task;
		});

		// Use TaskTimeSlotFinder to find optimal time slots
		try {
			const scheduler = new TaskTimeSlotFinder(this.supabase);
			const scheduledTasks = await scheduler.scheduleTasks(tasksWithDates, this.userId);

			// Update tasks with the scheduled times
			for (const task of scheduledTasks) {
				if (task.start_date) {
					const { error } = await this.supabase
						.from('tasks')
						.update({
							start_date: task.start_date,
							duration_minutes: task.duration_minutes || 60
						})
						.eq('id', task.id);

					if (error) {
						console.error(
							`Failed to update task ${task.id} with scheduled time:`,
							error
						);
					}
				}
			}

			console.log(
				`Scheduled ${scheduledTasks.length} tasks using TaskTimeSlotFinder (schedule_in_phases method)`
			);
		} catch (error) {
			console.error('Failed to schedule tasks with TaskTimeSlotFinder:', error);

			// Fallback to simple date updates without time optimization
			console.log('Falling back to simple date updates');
			for (const assignment of assignments) {
				if (assignment.suggested_start_date) {
					// Ensure we have a proper timestamp with time
					const startDate = new Date(assignment.suggested_start_date);
					if (startDate.getHours() === 0 && startDate.getMinutes() === 0) {
						startDate.setHours(9, 0, 0, 0);
					}

					const { error } = await this.supabase
						.from('tasks')
						.update({ start_date: startDate.toISOString() })
						.eq('id', assignment.task_id);

					if (error) {
						console.error(`Failed to update task ${assignment.task_id}:`, error);
					}
				}
			}
		}

		// Handle calendar event updates based on configuration
		if (this.context.config.calendarHandling === 'clear_and_reschedule') {
			// Calendar events were already cleared, new ones will be created when tasks are updated
			console.log('Calendar events cleared; new events will be created with task schedules');
		} else if (this.context.config.calendarHandling !== 'preserve') {
			// Default to 'update' behavior - sync existing calendar events
			await this.syncCalendarEventsForUpdatedTasks(assignments);
		}
		// If 'preserve', do nothing with calendar events
	}

	/**
	 * Sync calendar events for tasks that had their dates updated during phase regeneration
	 */
	private async syncCalendarEventsForUpdatedTasks(
		assignments: PhaseTaskAssignment[]
	): Promise<void> {
		try {
			// Get tasks that have calendar events
			const taskIds = assignments.map((a) => a.task_id);
			if (taskIds.length === 0) return;

			const { data: tasksWithCalendarEvents, error } = await this.supabase
				.from('task_calendar_events')
				.select('*')
				.in('task_id', taskIds)
				.eq('user_id', this.userId)
				.is('sync_error', null); // Only update successfully synced events

			if (error) {
				console.error('Failed to fetch task calendar events:', error);
				return;
			}

			if (!tasksWithCalendarEvents || tasksWithCalendarEvents.length === 0) {
				return; // No calendar events to update
			}

			console.log(
				`Found ${tasksWithCalendarEvents.length} calendar events to update after phase regeneration`
			);

			// Get the full task data with new dates
			const { data: updatedTasks, error: taskError } = await this.supabase
				.from('tasks')
				.select('id, title, start_date, duration_minutes')
				.in(
					'id',
					tasksWithCalendarEvents.map((e) => e.task_id)
				);

			if (taskError || !updatedTasks) {
				console.error('Failed to fetch updated task data:', taskError);
				return;
			}

			// Create update operations for calendar events
			const calendarUpdates = [];
			for (const calendarEvent of tasksWithCalendarEvents) {
				const task = updatedTasks.find((t) => t.id === calendarEvent.task_id);
				if (!task || !task.start_date) continue;

				// Calculate new start and end times
				const startTime = new Date(task.start_date);
				const endTime = new Date(startTime);
				endTime.setMinutes(startTime.getMinutes() + (task.duration_minutes || 60));

				calendarUpdates.push({
					event_id: calendarEvent.calendar_event_id,
					calendar_id: calendarEvent.calendar_id || 'primary',
					start_time: startTime.toISOString(),
					end_time: endTime.toISOString(),
					summary: task.title
				});
			}

			if (calendarUpdates.length === 0) return;

			// Use CalendarService to bulk update calendar events
			const calendarService = new CalendarService(this.supabase);
			const result = await calendarService.bulkUpdateCalendarEvents(
				this.userId,
				calendarUpdates,
				{ batchSize: 5 }
			);

			console.log(
				`Calendar sync after phase regeneration: ${result.updated} updated, ${result.failed} failed`
			);

			if (result.failed > 0) {
				console.warn(
					'Some calendar events failed to update:',
					result.results.filter((r) => !r.success)
				);
			}
		} catch (error) {
			// Don't fail the entire operation if calendar sync fails
			console.error('Error syncing calendar events after phase regeneration:', error);
		}
	}

	private validateDateWithinPhase(dateStr: string, phase: Phase): string | null {
		const date = this.validateDate(dateStr);
		const phaseStart = this.validateDate(phase.start_date);
		const phaseEnd = phase.end_date ? this.validateDate(phase.end_date) : null;
		const today = this.getToday();

		if (!date || !phaseStart) {
			return phase.start_date;
		}

		// Ensure date is not in the past
		if (date < today) {
			return today.toISOString().split('T')[0];
		}

		// Ensure date is within phase bounds
		if (date < phaseStart) {
			return phase.start_date;
		}

		// Only check end date if phase has one
		if (phaseEnd && date > phaseEnd) {
			return phase.end_date || phase.start_date;
		}

		return dateStr;
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
						if (task) {
							excludedTasks.push(task);
						}
					}

					// Recursively exclude dependents
					excludeDependents(dependentId, `cascade from ${taskId}`);
				}
			}
		};

		// Apply cascading exclusions
		for (const excludedTask of excludedTasks) {
			const reason = exclusionReasons[excludedTask.id] || 'Unknown reason';
			excludeDependents(excludedTask.id, reason);
		}
	}

	/**
	 * Override execute to add calendar cleanup functionality
	 */
	async execute(context: GenerationContext): Promise<PhaseGenerationResult> {
		this.context = context;

		// 1. Validate project timeline for this scheduling method
		this.validateProjectTimeline();

		// 2. Clear existing calendar events if configured
		if (this.context.config.calendarHandling === 'clear_and_reschedule') {
			await this.clearExistingCalendarEvents();
		}

		// 3. Filter and prepare tasks based on scheduling method rules
		const filterResult = await this.filterAndPrepareTasks();

		// 4. Apply any task rescheduling if needed
		if (filterResult.rescheduledTasks.length > 0) {
			await this.applyTaskRescheduling(filterResult.rescheduledTasks);
		}

		// 5. Generate prompts for LLM
		const { systemPrompt, userPrompt } = await this.generatePrompts(
			filterResult.compatibleTasks
		);

		// 6. Call LLM to generate phases
		const llmResult = await this.callLLM(
			systemPrompt,
			userPrompt,
			filterResult.compatibleTasks
		);

		// 7. Validate and process LLM response
		const processedResult = await this.processLLMResponse(
			llmResult,
			filterResult.compatibleTasks
		);

		// 8. Persist phases and task assignments
		await this.persistPhases(processedResult, filterResult.compatibleTasks);

		// Note: Calendar event syncing is handled within persistPhases via handleTaskDateUpdates
		// which is called after task assignments are created. The calendar handling logic
		// determines whether to update existing events or create new ones based on config.

		// 10. Prepare final result with additional metadata
		return this.prepareFinalResult(processedResult, filterResult);
	}

	/**
	 * Clear existing calendar events before phase regeneration
	 */
	private async clearExistingCalendarEvents(): Promise<void> {
		try {
			// Get all tasks in the project that might have calendar events
			const { data: projectTasks, error: tasksError } = await this.supabase
				.from('tasks')
				.select('id')
				.eq('project_id', this.context.project.id)
				.is('deleted_at', null);

			if (tasksError) {
				console.error('Failed to fetch project tasks for calendar cleanup:', tasksError);
				throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
			}

			if (!projectTasks || projectTasks.length === 0) {
				console.log('No tasks to clear calendar events for');
				return;
			}

			const taskIds = projectTasks.map((t) => t.id);

			// Fetch existing calendar events for these tasks
			const { data: calendarEvents, error } = await this.supabase
				.from('task_calendar_events')
				.select('*')
				.in('task_id', taskIds)
				.eq('user_id', this.userId)
				.eq('sync_status', 'synced'); // Only clear successfully synced events

			if (error) {
				console.error('Failed to fetch calendar events for cleanup:', error);
				throw new Error(`Calendar cleanup failed: ${error.message}`);
			}

			if (!calendarEvents || calendarEvents.length === 0) {
				console.log('No calendar events to clear');
				return;
			}

			console.log(
				`Clearing ${calendarEvents.length} calendar events before phase regeneration`
			);

			// Handle recurring events specially if configured
			let eventsToDelete = calendarEvents;
			if (this.context.config.preserveRecurringEvents) {
				eventsToDelete = calendarEvents.filter((e) => !e.is_master_event);
				const preservedCount = calendarEvents.length - eventsToDelete.length;
				if (preservedCount > 0) {
					console.log(`Preserving ${preservedCount} recurring master events`);
				}
			}

			if (eventsToDelete.length === 0) {
				console.log('No events to delete after filtering');
				return;
			}

			// Use existing bulk delete function
			const calendarService = new CalendarService(this.supabase);
			const result = await calendarService.bulkDeleteCalendarEvents(
				this.userId,
				eventsToDelete.map((e) => ({
					id: e.id,
					calendar_event_id: e.calendar_event_id,
					calendar_id: e.calendar_id || 'primary'
				})),
				{
					batchSize: this.context.config.calendarCleanupBatchSize || 5,
					reason: 'phase_regeneration_cleanup'
				}
			);

			if (!result.success) {
				console.warn('Calendar cleanup had errors:', result.errors);
				// Don't fail the entire operation, but log warnings
				if (result.warnings?.length) {
					console.warn('Calendar cleanup warnings:', result.warnings);
				}
			}

			console.log(`Calendar cleanup complete: ${result.deletedCount} events deleted`);
		} catch (error) {
			console.error('Error during calendar cleanup:', error);
			// Decide whether to fail or continue based on config
			if (this.context.config.calendarHandling === 'clear_and_reschedule') {
				throw error; // Fail if cleanup was explicitly requested
			}
			// Otherwise, log and continue
			console.warn('Continuing with phase regeneration despite calendar cleanup failure');
		}
	}
}
