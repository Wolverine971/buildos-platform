// apps/web/src/lib/services/phase-generation/generate-phases-procedural.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

import { SmartLLMService } from '$lib/services/smart-llm-service';
import {
	TaskTimeSlotFinder,
	type NextAvailableSlotRequest
} from '$lib/services/task-time-slot-finder';
import { CalendarService, type BulkDeleteEventParams } from '$lib/services/calendar-service';
import type { PhaseGenerationConfig, SchedulingMethod } from './types';
import {
	buildPhaseGenerationSystemPromptCall1,
	buildPhaseGenerationUserPromptCall1,
	buildTaskOrderingSystemPromptCall2,
	buildTaskOrderingUserPromptCall2
} from '$lib/services/promptTemplate.service';

type TypedSupabaseClient = SupabaseClient<Database>;

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type TaskRow = Database['public']['Tables']['tasks']['Row'];
type PhaseRow = Database['public']['Tables']['phases']['Row'];
type PhaseTaskRow = Database['public']['Tables']['phase_tasks']['Row'];
type TaskCalendarEventRow = Database['public']['Tables']['task_calendar_events']['Row'];

interface TaskWithRelations extends TaskRow {
	task_calendar_events: TaskCalendarEventRow[] | null;
}

interface PhaseTaskWithTask extends PhaseTaskRow {
	tasks?: (TaskRow & { task_calendar_events?: TaskCalendarEventRow[] | null }) | null;
}

interface PhaseWithRelations extends PhaseRow {
	phase_tasks: PhaseTaskWithTask[] | null;
}

interface PhaseWithComputedTasks extends PhaseWithRelations {
	tasks: Array<
		| (TaskRow & {
				suggested_start_date: string | null;
				assignment_reason: string | null;
				order?: number | null;
		  })
		| null
	>;
	task_count: number;
	completed_tasks: number;
}

interface ProjectData {
	project: ProjectRow;
	tasks: TaskWithRelations[];
	existingPhases: PhaseWithRelations[];
}

interface ValidationResult {
	valid: boolean;
	errors: string[];
}

interface PhaseWithRoughGrouping {
	name: string;
	description: string;
	start_date: string;
	end_date: string;
	task_ids: string[];
}

interface OrderedPhaseTask {
	task_id: string;
	order: number;
}

interface PhaseWithOrderedTasks extends PhaseWithRoughGrouping {
	tasks: OrderedPhaseTask[];
}

interface LLMPhaseGroupingResponse {
	phases?: PhaseWithRoughGrouping[];
}

interface LLMTaskOrderingResponse {
	phases?: Array<{
		phase_id: number;
		tasks: OrderedPhaseTask[];
	}>;
}

export interface ProceduralPhaseGenerationResult {
	success: boolean;
	phases: PhaseWithComputedTasks[];
	historicalPhases: PhaseRow[];
	tasksScheduled: number;
	backlogTasks: TaskWithRelations[];
	backlog_tasks?: TaskWithRelations[];
	task_assignments: Record<string, unknown>;
	summary?: string;
	metadata: {
		isRegeneration: boolean;
		schedulingMethod: SchedulingMethod;
		preservedHistoricalPhases: number;
	};
}

export async function generatePhasesProcedural(
	config: PhaseGenerationConfig,
	supabase: TypedSupabaseClient
): Promise<ProceduralPhaseGenerationResult> {
	const validation = await validatePhaseGenerationConfig(config);
	if (!validation.valid) {
		throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
	}

	const projectId = config.projectId!;
	const userId = config.userId!;

	const projectData = await loadProjectData(projectId, userId, supabase);
	const isRegeneration = await checkIfRegeneration(projectId, supabase);

	const historicalPhases = isRegeneration
		? await handleHistoricalPhases(config, projectData, supabase)
		: [];

	const tasksToSchedule = await resetUnfinishedTasks(
		config,
		projectData,
		isRegeneration,
		supabase
	);

	if (tasksToSchedule.length === 0) {
		throw new Error('No tasks found for phase generation');
	}

	const phasesWithRoughGrouping = await llmCall1_GeneratePhases(
		config,
		projectData,
		tasksToSchedule,
		historicalPhases,
		supabase
	);

	const normalizedPhaseGrouping = normalizePhaseTaskAssignments(
		phasesWithRoughGrouping,
		tasksToSchedule,
		config
	);

	const phasesWithOrderedTasks =
		config.schedulingMethod === 'phases_only'
			? normalizedPhaseGrouping.map((phase) => ({ ...phase, tasks: [] }))
			: await llmCall2_OrderTasks(config, normalizedPhaseGrouping, tasksToSchedule, supabase);

	const persistedPhases = await persistPhasesToDatabase(phasesWithOrderedTasks, config, supabase);

	if (config.schedulingMethod === 'calendar_optimized') {
		await scheduleTasksWithTimeSlotFinder(persistedPhases, config, supabase);
	}

	if (config.schedulingMethod !== 'phases_only') {
		await handleCalendarEvents(persistedPhases, config, isRegeneration, supabase);
	}

	const assignedTaskIds = new Set(
		persistedPhases.flatMap((phase) =>
			(phase.phase_tasks ?? []).map((phaseTask) => phaseTask.task_id)
		)
	);

	const backlogTasks = await fetchBacklogTasksForProject(
		projectId,
		assignedTaskIds,
		config,
		supabase
	);

	return {
		success: true,
		phases: persistedPhases,
		historicalPhases,
		tasksScheduled: tasksToSchedule.length,
		backlogTasks,
		backlog_tasks: backlogTasks,
		task_assignments: {},
		summary: '',
		metadata: {
			isRegeneration,
			schedulingMethod: config.schedulingMethod,
			preservedHistoricalPhases: historicalPhases.length
		}
	};
}

async function validatePhaseGenerationConfig(
	config: PhaseGenerationConfig
): Promise<ValidationResult> {
	const errors: string[] = [];
	const validMethods: SchedulingMethod[] = [
		'phases_only',
		'schedule_in_phases',
		'calendar_optimized'
	];

	if (!config.projectId) errors.push('projectId is required');
	if (!config.userId) errors.push('userId is required');
	if (!config.schedulingMethod) errors.push('schedulingMethod is required');
	if (!validMethods.includes(config.schedulingMethod as SchedulingMethod)) {
		errors.push(`Invalid schedulingMethod: ${config.schedulingMethod}`);
	}

	if (config.projectStartDate && config.projectEndDate) {
		const start = new Date(config.projectStartDate);
		const end = new Date(config.projectEndDate);
		if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
			errors.push('projectStartDate must be before projectEndDate');
		}
	}

	return { valid: errors.length === 0, errors };
}

async function loadProjectData(
	projectId: string,
	userId: string,
	supabase: TypedSupabaseClient
): Promise<ProjectData> {
	const { data, error } = await supabase
		.from('projects')
		.select(
			`
      *,
      tasks (
        *,
        task_calendar_events (*)
      ),
      phases (
        *,
        phase_tasks (
          *,
          tasks (
            *,
            task_calendar_events (*)
          )
        )
      )
    `
		)
		.eq('id', projectId)
		.eq('user_id', userId)
		.single();

	if (error || !data) {
		throw new Error(`Project not found: ${projectId}`);
	}

	return {
		project: data as ProjectRow,
		tasks: ((data.tasks as TaskWithRelations[]) ?? []).map((task) => ({
			...task,
			task_calendar_events: task.task_calendar_events ?? []
		})),
		existingPhases: ((data.phases as PhaseWithRelations[]) ?? []).map((phase) => ({
			...phase,
			phase_tasks: phase.phase_tasks ?? []
		}))
	};
}

async function checkIfRegeneration(
	projectId: string,
	supabase: TypedSupabaseClient
): Promise<boolean> {
	const { count, error } = await supabase
		.from('phases')
		.select('id', { head: true, count: 'exact' })
		.eq('project_id', projectId);

	if (error) {
		console.warn('Failed to check regeneration state:', error);
		return false;
	}

	return (count ?? 0) > 0;
}

async function handleHistoricalPhases(
	config: PhaseGenerationConfig,
	projectData: ProjectData,
	supabase: TypedSupabaseClient
): Promise<PhaseRow[]> {
	const projectId = config.projectId!;

	if (config.preserveHistoricalPhases === false) {
		const { data: existingIds } = await supabase
			.from('phases')
			.select('id')
			.eq('project_id', projectId);

		const phaseIds = existingIds?.map((p) => p.id) ?? [];

		await deletePhasesWithTasks(phaseIds, supabase);
		return [];
	}

	const now = new Date();
	const nowIso = now.toISOString();

	const phases = projectData.existingPhases ?? [];

	const completedPhases = phases.filter((phase) => {
		const end = new Date(phase.end_date);
		return !isNaN(end.getTime()) && end < now;
	});

	const currentPhase = phases.find((phase) => {
		const start = new Date(phase.start_date);
		const end = new Date(phase.end_date);
		return !isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= now && end >= now;
	});

	const futurePhases = phases.filter((phase) => {
		const start = new Date(phase.start_date);
		return !isNaN(start.getTime()) && start > now;
	});

	if (futurePhases.length > 0) {
		const futureIds = futurePhases.map((phase) => phase.id);
		await deletePhasesWithTasks(futureIds, supabase);
	}

	if (currentPhase) {
		await supabase
			.from('phases')
			.update({ end_date: nowIso, updated_at: nowIso })
			.eq('id', currentPhase.id);

		currentPhase.end_date = nowIso;
	}

	return currentPhase ? [...completedPhases, currentPhase] : completedPhases;
}

async function resetUnfinishedTasks(
	config: PhaseGenerationConfig,
	projectData: ProjectData,
	isRegeneration: boolean,
	supabase: TypedSupabaseClient
): Promise<TaskWithRelations[]> {
	const tasks = projectData.tasks ?? [];
	const selectedStatuses = new Set(config.selectedStatuses ?? []);

	if (!isRegeneration) {
		return tasks.filter(
			(task) =>
				!task.deleted_at &&
				(!task.status || selectedStatuses.size === 0 || selectedStatuses.has(task.status))
		);
	}

	const tasksToReset = tasks.filter((task) => {
		if (task.deleted_at) return false;
		if (task.status === 'done') return false;
		if (task.status && selectedStatuses.size > 0 && !selectedStatuses.has(task.status)) {
			return false;
		}

		if (task.task_type === 'recurring' && config.allowRecurringReschedule === false) {
			return false;
		}

		const events = task.task_calendar_events ?? [];
		const hasAttendees = events.some(
			(event) => Array.isArray(event.attendees) && (event.attendees?.length ?? 0) > 0
		);

		if (task.task_type === 'recurring' && hasAttendees) {
			return false;
		}

		return true;
	});

	const taskIds = tasksToReset.map((task) => task.id);

	if (taskIds.length > 0) {
		await supabase.from('phase_tasks').delete().in('task_id', taskIds);
		await supabase.from('tasks').update({ start_date: null }).in('id', taskIds);
	}

	return tasksToReset;
}

async function llmCall1_GeneratePhases(
	config: PhaseGenerationConfig,
	projectData: ProjectData,
	tasksToSchedule: TaskWithRelations[],
	historicalPhases: PhaseRow[],
	supabase: TypedSupabaseClient
): Promise<PhaseWithRoughGrouping[]> {
	const systemPrompt = buildPhaseGenerationSystemPromptCall1(config);
	const userPrompt = buildPhaseGenerationUserPromptCall1(
		projectData,
		tasksToSchedule,
		historicalPhases,
		config
	);

	const llmService = new SmartLLMService({ supabase });
	const response = await llmService.getJSONResponse<LLMPhaseGroupingResponse>({
		systemPrompt,
		userPrompt,
		userId: config.userId!,
		profile: 'balanced',
		operationType: 'phase_generation_grouping',
		projectId: config.projectId
	});

	if (!response?.phases || !Array.isArray(response.phases)) {
		throw new Error('LLM phase generation returned invalid structure');
	}

	return response.phases.map((phase) => ({
		name: phase.name ?? 'Untitled Phase',
		description: phase.description ?? '',
		start_date: phase.start_date,
		end_date: phase.end_date,
		task_ids: Array.isArray(phase.task_ids) ? phase.task_ids : []
	}));
}

function normalizePhaseTaskAssignments(
	phases: PhaseWithRoughGrouping[],
	tasksToSchedule: TaskWithRelations[],
	config: PhaseGenerationConfig
): PhaseWithRoughGrouping[] {
	if (config.schedulingMethod === 'phases_only') {
		return phases;
	}

	const taskIdSet = new Set(tasksToSchedule.map((task) => task.id));
	const assignedTaskIds = new Set<string>();
	const normalizedPhases = phases.map((phase, idx) => {
		const uniqueTaskIds: string[] = [];

		for (const taskId of phase.task_ids ?? []) {
			if (!taskIdSet.has(taskId)) {
				console.warn(
					`LLM returned unknown task_id "${taskId}" in phase index ${idx}. It will be ignored.`
				);
				continue;
			}

			if (assignedTaskIds.has(taskId)) {
				console.warn(
					`Task ${taskId} was assigned to multiple phases. Keeping first assignment and dropping duplicates.`
				);
				continue;
			}

			assignedTaskIds.add(taskId);
			uniqueTaskIds.push(taskId);
		}

		return {
			...phase,
			task_ids: uniqueTaskIds
		};
	});

	const unassignedTasks = [...taskIdSet].filter((taskId) => !assignedTaskIds.has(taskId));

	if (unassignedTasks.length === 0) {
		return normalizedPhases;
	}

	console.warn(
		`LLM did not assign ${unassignedTasks.length} task(s). Assigning them to the final phase as a fallback.`
	);

	if (normalizedPhases.length === 0) {
		const now = new Date();
		const fallbackPhase: PhaseWithRoughGrouping = {
			name: 'Phase 1: Auto Generated',
			description:
				'Automatically created because the LLM did not return any phases. Review and adjust as needed.',
			start_date: config.projectStartDate || now.toISOString(),
			end_date:
				config.projectEndDate ||
				new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
			task_ids: unassignedTasks
		};

		return [fallbackPhase];
	}

	const targetPhaseIndex = normalizedPhases.length - 1;
	const targetPhase = normalizedPhases[targetPhaseIndex];

	const updatedPhase: PhaseWithRoughGrouping = {
		...targetPhase!,
		task_ids: [...(targetPhase!.task_ids ?? []), ...unassignedTasks]
	};

	const updatedPhases = [...normalizedPhases];
	updatedPhases[targetPhaseIndex] = updatedPhase;

	return updatedPhases;
}

async function llmCall2_OrderTasks(
	config: PhaseGenerationConfig,
	phasesWithRoughGrouping: PhaseWithRoughGrouping[],
	tasksToSchedule: TaskWithRelations[],
	supabase: TypedSupabaseClient
): Promise<PhaseWithOrderedTasks[]> {
	if (phasesWithRoughGrouping.length === 0) {
		return [];
	}

	const systemPrompt = buildTaskOrderingSystemPromptCall2(config);
	const userPrompt = buildTaskOrderingUserPromptCall2(phasesWithRoughGrouping, tasksToSchedule);

	const llmService = new SmartLLMService({ supabase });
	const response = await llmService.getJSONResponse<LLMTaskOrderingResponse>({
		systemPrompt,
		userPrompt,
		userId: config.userId!,
		profile: 'balanced',
		operationType: 'phase_generation_task_ordering',
		projectId: config.projectId
	});

	const orderingByPhaseIndex = new Map<number, OrderedPhaseTask[]>();

	if (response?.phases && Array.isArray(response.phases)) {
		for (const phase of response.phases) {
			const validTasks =
				phase.tasks?.filter(
					(task) => task.task_id && Number.isFinite(task.order) && task.order >= 0
				) ?? [];
			orderingByPhaseIndex.set(
				phase.phase_id,
				validTasks.map((task) => ({
					task_id: task.task_id,
					order: task.order
				}))
			);
		}
	}

	const validTaskIds = new Set(tasksToSchedule.map((task) => task.id));

	return phasesWithRoughGrouping.map((phase, index) => {
		const orderedTasks = orderingByPhaseIndex.get(index) ?? [];
		const filteredTasks = orderedTasks.filter((task) => validTaskIds.has(task.task_id));

		return {
			...phase,
			tasks: filteredTasks
		};
	});
}

async function persistPhasesToDatabase(
	phasesWithOrderedTasks: PhaseWithOrderedTasks[],
	config: PhaseGenerationConfig,
	supabase: TypedSupabaseClient
): Promise<PhaseWithComputedTasks[]> {
	if (phasesWithOrderedTasks.length === 0) {
		return [];
	}

	const projectId = config.projectId!;
	const userId = config.userId!;

	const tasksTargetedForAssignment = phasesWithOrderedTasks
		.flatMap((phase) => phase.tasks?.map((task) => task.task_id) ?? [])
		.filter(Boolean);

	if (tasksTargetedForAssignment.length > 0) {
		await supabase.from('phase_tasks').delete().in('task_id', tasksTargetedForAssignment);
	}

	const { data: existingPhase } = await supabase
		.from('phases')
		.select('order')
		.eq('project_id', projectId)
		.order('order', { ascending: false })
		.limit(1)
		.maybeSingle();

	const baseOrder = existingPhase?.order !== undefined ? existingPhase.order + 1 : 0;

	const phaseInsertPayload = phasesWithOrderedTasks.map((phase, index) => ({
		project_id: projectId,
		user_id: userId,
		name: phase.name,
		description: phase.description,
		start_date: phase.start_date,
		end_date: phase.end_date,
		order: baseOrder + index,
		scheduling_method: config.schedulingMethod
	}));

	const { data: insertedPhases, error: phaseInsertError } = await supabase
		.from('phases')
		.insert(phaseInsertPayload)
		.select();

	if (phaseInsertError) {
		throw new Error(`Failed to create phases: ${phaseInsertError.message}`);
	}

	const insertedPhaseList = insertedPhases as PhaseRow[];

	if (config.schedulingMethod !== 'phases_only') {
		const phaseTasksPayload: Array<{
			phase_id: string;
			task_id: string;
			order: number;
			suggested_start_date: string | null;
			assignment_reason: string;
		}> = [];

		insertedPhaseList.forEach((phaseRow, idx) => {
			const sourcePhase = phasesWithOrderedTasks[idx]!;
			sourcePhase.tasks.forEach((task) => {
				phaseTasksPayload.push({
					phase_id: phaseRow.id,
					task_id: task.task_id,
					order: task.order,
					suggested_start_date: sourcePhase.start_date ?? null,
					assignment_reason: `Assigned to ${sourcePhase.name}`
				});
			});
		});

		if (phaseTasksPayload.length > 0) {
			const { error: phaseTasksError } = await supabase
				.from('phase_tasks')
				.insert(phaseTasksPayload);

			if (phaseTasksError) {
				throw new Error(`Failed to create phase_tasks: ${phaseTasksError.message}`);
			}
		}
	}

	const { data: phasesWithRelations, error: fetchError } = await supabase
		.from('phases')
		.select(
			`
      *,
      phase_tasks (
        *,
        tasks (
          *,
          task_calendar_events (*)
        )
      )
    `
		)
		.eq('project_id', projectId)
		.order('order', { ascending: true });

	if (fetchError) {
		throw new Error(`Failed to load persisted phases: ${fetchError.message}`);
	}

	return (phasesWithRelations as PhaseWithRelations[]).map((phase) => {
		const phaseTasks =
			phase.phase_tasks
				?.map((pt) => {
					const task = pt.tasks;
					if (!task || task.deleted_at) {
						return null;
					}

					return {
						...task,
						suggested_start_date: pt.suggested_start_date ?? null,
						assignment_reason: pt.assignment_reason ?? null,
						order: pt.order ?? null
					};
				})
				.filter((task): task is NonNullable<typeof task> => Boolean(task)) ?? [];

		return {
			...phase,
			phase_tasks: phase.phase_tasks ?? [],
			tasks: phaseTasks,
			task_count: phaseTasks.length,
			completed_tasks: phaseTasks.filter((task) => task.status === 'done').length
		};
	});
}

async function scheduleTasksWithTimeSlotFinder(
	persistedPhases: PhaseWithComputedTasks[],
	config: PhaseGenerationConfig,
	supabase: TypedSupabaseClient
): Promise<void> {
	if (!config.userId) return;

	const timeSlotFinder = new TaskTimeSlotFinder(supabase);

	for (const phase of persistedPhases) {
		const phaseTasks = (phase.phase_tasks ?? []).slice().sort((a, b) => {
			const orderA = a.order ?? 0;
			const orderB = b.order ?? 0;
			return orderA - orderB;
		});

		for (const phaseTask of phaseTasks) {
			const task = phaseTask.tasks;
			if (!task) continue;
			if (task.start_date) continue;

			const hasCalendarEvent =
				task.task_calendar_events && task.task_calendar_events.length > 0;
			if (hasCalendarEvent) continue;

			const slotRequest: NextAvailableSlotRequest = {
				userId: config.userId,
				durationMinutes: task.duration_minutes ?? 60,
				startAfter: new Date(phase.start_date),
				endBefore: new Date(phase.end_date)
			};

			const slot = await timeSlotFinder.findNextAvailableSlot(slotRequest);

			if (!slot) {
				continue;
			}

			await supabase
				.from('tasks')
				.update({ start_date: slot.start.toISOString() })
				.eq('id', task.id);

			await supabase
				.from('phase_tasks')
				.update({ suggested_start_date: slot.start.toISOString() })
				.eq('id', phaseTask.id);
		}
	}
}

async function fetchBacklogTasksForProject(
	projectId: string,
	assignedTaskIds: Set<string>,
	config: PhaseGenerationConfig,
	supabase: TypedSupabaseClient
): Promise<TaskWithRelations[]> {
	const { data: tasks, error } = await supabase
		.from('tasks')
		.select(
			`
      *,
      task_calendar_events (*)
    `
		)
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.neq('status', 'done');

	if (error) {
		console.warn('Failed to fetch backlog tasks:', error);
		return [];
	}

	return ((tasks as TaskWithRelations[]) ?? [])
		.filter((task) => !assignedTaskIds.has(task.id))
		.filter((task) => {
			if (config.includeRecurringTasks) {
				return true;
			}
			return task.task_type !== 'recurring';
		})
		.map((task) => ({
			...task,
			task_calendar_events: task.task_calendar_events ?? []
		}));
}

async function handleCalendarEvents(
	persistedPhases: PhaseWithComputedTasks[],
	config: PhaseGenerationConfig,
	isRegeneration: boolean,
	supabase: TypedSupabaseClient
): Promise<void> {
	if (!config.userId) return;

	const calendarHandling = config.calendarHandling ?? 'update';
	if (calendarHandling === 'preserve') {
		return;
	}

	const taskMap = new Map<string, TaskWithRelations>();

	for (const phase of persistedPhases) {
		for (const phaseTask of phase.phase_tasks ?? []) {
			const task = phaseTask.tasks as TaskWithRelations | undefined;
			if (task) {
				taskMap.set(task.id, {
					...task,
					task_calendar_events: task.task_calendar_events ?? []
				});
			}
		}
	}

	if (taskMap.size === 0) {
		return;
	}

	const tasks = Array.from(taskMap.values()).filter((task) => task.start_date);
	if (tasks.length === 0) {
		return;
	}

	const calendarService = new CalendarService(supabase);

	if (calendarHandling === 'clear_and_reschedule') {
		await clearAndRescheduleCalendarEvents(tasks, config, calendarService);
		return;
	}

	if (calendarHandling === 'update' || isRegeneration) {
		await updateExistingCalendarEvents(tasks, config, calendarService, supabase);
	}
}

async function deletePhasesWithTasks(
	phaseIds: string[],
	supabase: TypedSupabaseClient
): Promise<void> {
	if (!phaseIds || phaseIds.length === 0) {
		return;
	}

	await supabase.from('phase_tasks').delete().in('phase_id', phaseIds);
	await supabase.from('phases').delete().in('id', phaseIds);
}

async function updateExistingCalendarEvents(
	tasks: TaskWithRelations[],
	config: PhaseGenerationConfig,
	calendarService: CalendarService,
	supabase: TypedSupabaseClient
) {
	for (const task of tasks) {
		const events = task.task_calendar_events ?? [];

		if (events.length === 0) {
			await calendarService.scheduleTask(config.userId!, {
				task_id: task.id,
				start_time: task.start_date!,
				duration_minutes: task.duration_minutes ?? 60
			});
			continue;
		}

		for (const calEvent of events) {
			if (calEvent.organizer_self === false) {
				console.warn(
					`Skipping calendar event ${calEvent.calendar_event_id} - user is not the organizer`
				);
				continue;
			}

			const hasAttendees =
				!!calEvent.attendees &&
				Array.isArray(calEvent.attendees) &&
				calEvent.attendees.length > 0;

			if (task.task_type === 'recurring' && hasAttendees) {
				console.warn(
					`Skipping recurring event ${calEvent.calendar_event_id} - attendees present`
				);
				continue;
			}

			const durationMinutes = task.duration_minutes ?? 60;
			const startDate = new Date(task.start_date!);
			const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

			try {
				await calendarService.updateCalendarEvent(config.userId!, {
					event_id: calEvent.calendar_event_id,
					calendar_id: calEvent.calendar_id ?? undefined,
					start_time: task.start_date!,
					end_time: endDate.toISOString(),
					sendUpdates: hasAttendees ? 'all' : 'none'
				});
			} catch (error) {
				console.warn(
					`Failed to update calendar event ${calEvent.calendar_event_id} for task ${task.id}. Attempting to reschedule.`,
					error
				);

				try {
					await supabase.from('task_calendar_events').delete().eq('id', calEvent.id);
				} catch (cleanupError) {
					console.warn(
						`Failed to clean up stale calendar event record ${calEvent.id} before rescheduling`,
						cleanupError
					);
				}

				try {
					await calendarService.scheduleTask(config.userId!, {
						task_id: task.id,
						start_time: task.start_date!,
						duration_minutes: durationMinutes
					});
				} catch (scheduleError) {
					console.error(
						`Failed to schedule replacement calendar event for task ${task.id}`,
						scheduleError
					);
				}
			}
		}
	}
}

async function clearAndRescheduleCalendarEvents(
	tasks: TaskWithRelations[],
	config: PhaseGenerationConfig,
	calendarService: CalendarService
) {
	const eventsToDelete: BulkDeleteEventParams[] = [];

	for (const task of tasks) {
		for (const calEvent of task.task_calendar_events ?? []) {
			if (calEvent.organizer_self === false) {
				continue;
			}

			eventsToDelete.push({
				id: calEvent.id,
				calendar_event_id: calEvent.calendar_event_id,
				calendar_id: calEvent.calendar_id ?? undefined
			});
		}
	}

	if (eventsToDelete.length > 0) {
		await calendarService.bulkDeleteCalendarEvents(config.userId!, eventsToDelete, {
			reason: 'phase_regeneration'
		});
	}

	const tasksToSchedule = tasks.filter((task) => task.start_date && task.status !== 'done');

	if (tasksToSchedule.length === 0) {
		return;
	}

	await calendarService.bulkScheduleTasks(
		config.userId!,
		tasksToSchedule.map((task) => ({
			task_id: task.id,
			start_time: task.start_date!,
			duration_minutes: task.duration_minutes ?? 60
		}))
	);
}
