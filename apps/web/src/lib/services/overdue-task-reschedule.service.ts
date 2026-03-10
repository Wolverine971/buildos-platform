// apps/web/src/lib/services/overdue-task-reschedule.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { addDays, addMinutes, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { CalendarService, type CalendarEvent } from '$lib/services/calendar-service';
import type { CalendarItem } from '$lib/types/calendar-items';
import {
	buildRescheduleWindow,
	createLocalWorkWindow,
	isWorkingDay,
	resolveDurationMinutes,
	roundUpToInterval,
	sortCandidateSlots,
	type CandidateSlot,
	type OverdueReschedulePreset,
	type SchedulingPreferencesShape
} from '$lib/utils/overdue-reschedule';

type OntoTaskRow = Database['public']['Tables']['onto_tasks']['Row'];
interface BusyInterval {
	start: Date;
	end: Date;
}

interface RescheduleContext {
	task: OntoTaskRow;
	timezone: string;
	preferences: SchedulingPreferencesShape;
	durationMinutes: number;
}

export interface RescheduleSuggestion {
	start_at: string;
	due_at: string;
	duration_minutes: number;
}

export interface ReschedulePlan {
	preset: OverdueReschedulePreset;
	timezone: string;
	duration_minutes: number;
	window_start_at: string;
	window_end_at: string;
	note: string | null;
	slots: RescheduleSuggestion[];
	calendar_connected: boolean;
}

const DEFAULT_PREFERENCES: SchedulingPreferencesShape = {
	work_start_time: '09:00',
	work_end_time: '17:00',
	working_days: [1, 2, 3, 4, 5],
	default_task_duration_minutes: 60,
	min_task_duration_minutes: 30,
	max_task_duration_minutes: 240,
	prefer_morning_for_important_tasks: false
};

class ReschedulePlannerError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'ReschedulePlannerError';
	}
}

function maxDate(left: Date, right: Date): Date {
	return left.getTime() >= right.getTime() ? left : right;
}

function minDate(left: Date, right: Date): Date {
	return left.getTime() <= right.getTime() ? left : right;
}

function sameLocalDay(left: Date, right: Date): boolean {
	return (
		left.getFullYear() === right.getFullYear() &&
		left.getMonth() === right.getMonth() &&
		left.getDate() === right.getDate()
	);
}

function parseTaskDuration(task: OntoTaskRow): number | null {
	const props = (task.props as Record<string, unknown> | null) ?? {};
	return typeof props.duration_minutes === 'number' && Number.isFinite(props.duration_minutes)
		? props.duration_minutes
		: null;
}

function pushBusyInterval(
	intervals: BusyInterval[],
	start: Date | null,
	end: Date | null,
	boundaryStart: Date,
	boundaryEnd: Date
) {
	if (!start || !end) return;
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
	if (end.getTime() <= start.getTime()) return;
	if (end.getTime() <= boundaryStart.getTime()) return;
	if (start.getTime() >= boundaryEnd.getTime()) return;

	intervals.push({
		start: maxDate(start, boundaryStart),
		end: minDate(end, boundaryEnd)
	});
}

function normalizeBusyIntervals(intervals: BusyInterval[]): BusyInterval[] {
	if (intervals.length === 0) return [];

	const sorted = [...intervals].sort(
		(left, right) => left.start.getTime() - right.start.getTime()
	);
	const merged: BusyInterval[] = [];
	let current = {
		start: new Date(sorted[0]!.start),
		end: new Date(sorted[0]!.end)
	};

	for (let index = 1; index < sorted.length; index += 1) {
		const next = sorted[index]!;
		if (next.start.getTime() <= current.end.getTime()) {
			current.end = new Date(Math.max(current.end.getTime(), next.end.getTime()));
			continue;
		}
		merged.push(current);
		current = {
			start: new Date(next.start),
			end: new Date(next.end)
		};
	}

	merged.push(current);
	return merged;
}

function buildGaps(
	busyIntervals: BusyInterval[],
	windowStart: Date,
	windowEnd: Date
): BusyInterval[] {
	if (windowEnd.getTime() <= windowStart.getTime()) {
		return [];
	}

	if (busyIntervals.length === 0) {
		return [{ start: windowStart, end: windowEnd }];
	}

	const gaps: BusyInterval[] = [];
	const normalized = normalizeBusyIntervals(busyIntervals);
	const firstBusy = normalized[0];
	if (firstBusy && firstBusy.start.getTime() > windowStart.getTime()) {
		gaps.push({ start: windowStart, end: firstBusy.start });
	}

	for (let index = 0; index < normalized.length - 1; index += 1) {
		const current = normalized[index]!;
		const next = normalized[index + 1]!;
		if (next.start.getTime() > current.end.getTime()) {
			gaps.push({ start: current.end, end: next.start });
		}
	}

	const lastBusy = normalized[normalized.length - 1];
	if (lastBusy && lastBusy.end.getTime() < windowEnd.getTime()) {
		gaps.push({ start: lastBusy.end, end: windowEnd });
	}

	return gaps;
}

function isImportantTask(task: OntoTaskRow): boolean {
	return (task.priority ?? 0) >= 4;
}

export class OverdueTaskRescheduleService {
	private readonly calendarService: CalendarService;

	constructor(private readonly supabase: SupabaseClient<Database>) {
		this.calendarService = new CalendarService(supabase);
	}

	async planReschedule(params: {
		userId: string;
		taskId: string;
		preset: OverdueReschedulePreset;
		limit?: number;
	}): Promise<ReschedulePlan> {
		const context = await this.loadContext(params.userId, params.taskId);
		const window = buildRescheduleWindow({
			preset: params.preset,
			timezone: context.timezone,
			workingDays: context.preferences.working_days
		});

		const windowStartUtc = fromZonedTime(window.startLocal, context.timezone);
		const windowEndUtc = fromZonedTime(window.endLocal, context.timezone);
		const busyIntervals = await this.loadBusyIntervals({
			userId: params.userId,
			taskId: params.taskId,
			windowStartUtc,
			windowEndUtc
		});

		const slots = this.buildCandidateSlots({
			task: context.task,
			timezone: context.timezone,
			preferences: context.preferences,
			durationMinutes: context.durationMinutes,
			windowStartLocal: window.startLocal,
			windowEndLocal: window.endLocal,
			busyIntervals
		});

		return {
			preset: params.preset,
			timezone: context.timezone,
			duration_minutes: context.durationMinutes,
			window_start_at: windowStartUtc.toISOString(),
			window_end_at: windowEndUtc.toISOString(),
			note: window.note,
			slots: slots.slice(0, params.limit ?? 5).map((slot) => ({
				start_at: slot.start.toISOString(),
				due_at: slot.end.toISOString(),
				duration_minutes: context.durationMinutes
			})),
			calendar_connected: busyIntervals.calendarConnected
		};
	}

	private async loadContext(userId: string, taskId: string): Promise<RescheduleContext> {
		const [{ data: userData }, { data: preferenceData, error: preferenceError }, taskResult] =
			await Promise.all([
				this.supabase.from('users').select('timezone').eq('id', userId).single(),
				this.supabase
					.from('user_calendar_preferences')
					.select('*')
					.eq('user_id', userId)
					.single(),
				this.supabase
					.from('onto_tasks')
					.select('*, project:onto_projects!inner(id)')
					.eq('id', taskId)
					.is('deleted_at', null)
					.single()
			]);

		if (preferenceError && preferenceError.code !== 'PGRST116') {
			throw preferenceError;
		}

		if (taskResult.error || !taskResult.data) {
			throw new ReschedulePlannerError('Task not found', 404);
		}

		const taskWithProject = taskResult.data as OntoTaskRow & {
			project: { id: string } | null;
		};
		const projectId = taskWithProject.project?.id ?? taskWithProject.project_id;
		if (!projectId) {
			throw new ReschedulePlannerError('Task project not found', 404);
		}

		const { data: hasAccess, error: accessError } = await this.supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'write'
			}
		);
		if (accessError) {
			throw accessError;
		}
		if (!hasAccess) {
			throw new ReschedulePlannerError('Access denied', 403);
		}

		const timezone = userData?.timezone || 'America/New_York';
		const preferences = {
			...DEFAULT_PREFERENCES,
			...(preferenceData ?? {})
		};
		const durationMinutes = resolveDurationMinutes(
			parseTaskDuration(taskWithProject),
			preferences
		);

		return {
			task: taskWithProject,
			timezone,
			preferences,
			durationMinutes
		};
	}

	private async loadBusyIntervals(params: {
		userId: string;
		taskId: string;
		windowStartUtc: Date;
		windowEndUtc: Date;
	}): Promise<{ intervals: BusyInterval[]; calendarConnected: boolean }> {
		const intervals: BusyInterval[] = [];
		const [{ data: calendarItems, error: calendarItemsError }, googleBusy] = await Promise.all([
			this.supabase.rpc('list_calendar_items', {
				p_start: params.windowStartUtc.toISOString(),
				p_end: params.windowEndUtc.toISOString(),
				p_include_events: true,
				p_include_task_range: true,
				p_include_task_start: true,
				p_include_task_due: true,
				p_limit: 2000
			}),
			this.loadPrimaryCalendarBusyEvents(
				params.userId,
				params.windowStartUtc,
				params.windowEndUtc
			)
		]);

		if (calendarItemsError) {
			throw calendarItemsError;
		}

		for (const item of (calendarItems ?? []) as CalendarItem[]) {
			if (item.task_id === params.taskId) continue;
			if (item.owner_entity_type === 'task' && item.owner_entity_id === params.taskId)
				continue;
			const start = new Date(item.start_at);
			const end =
				item.end_at && !Number.isNaN(new Date(item.end_at).getTime())
					? new Date(item.end_at)
					: addMinutes(start, 30);
			pushBusyInterval(intervals, start, end, params.windowStartUtc, params.windowEndUtc);
		}

		for (const event of googleBusy.events) {
			const startValue = event.start.dateTime ?? event.start.date ?? null;
			const endValue = event.end.dateTime ?? event.end.date ?? null;
			const start = startValue ? new Date(startValue) : null;
			const end = endValue ? new Date(endValue) : null;
			pushBusyInterval(intervals, start, end, params.windowStartUtc, params.windowEndUtc);
		}

		return {
			intervals: normalizeBusyIntervals(intervals),
			calendarConnected: googleBusy.connected
		};
	}

	private async loadPrimaryCalendarBusyEvents(
		userId: string,
		windowStartUtc: Date,
		windowEndUtc: Date
	): Promise<{ connected: boolean; events: CalendarEvent[] }> {
		const connected = await this.calendarService.hasValidConnection(userId);
		if (!connected) {
			return { connected: false, events: [] };
		}

		try {
			const response = await this.calendarService.getCalendarEvents(userId, {
				timeMin: windowStartUtc.toISOString(),
				timeMax: windowEndUtc.toISOString(),
				maxResults: 500
			});

			return {
				connected: true,
				events: response.events.filter((event) => {
					if (event.status === 'cancelled') return false;
					if (event.transparency === 'transparent') return false;
					return true;
				})
			};
		} catch (error) {
			console.warn('[OverdueReschedule] Failed to load primary calendar events:', error);
			return { connected: false, events: [] };
		}
	}

	private buildCandidateSlots(params: {
		task: OntoTaskRow;
		timezone: string;
		preferences: SchedulingPreferencesShape;
		durationMinutes: number;
		windowStartLocal: Date;
		windowEndLocal: Date;
		busyIntervals: { intervals: BusyInterval[] };
	}): CandidateSlot[] {
		const candidates: CandidateSlot[] = [];
		const finalDay = startOfDay(params.windowEndLocal);
		let cursor = startOfDay(params.windowStartLocal);

		while (cursor.getTime() <= finalDay.getTime()) {
			if (!isWorkingDay(cursor, params.preferences.working_days)) {
				cursor = addDays(cursor, 1);
				continue;
			}

			const workWindow = createLocalWorkWindow(cursor, params.preferences);
			let dayStartLocal = workWindow.startLocal;
			let dayEndLocal = workWindow.endLocal;

			if (sameLocalDay(cursor, params.windowStartLocal)) {
				dayStartLocal = maxDate(dayStartLocal, params.windowStartLocal);
			}
			if (sameLocalDay(cursor, params.windowEndLocal)) {
				dayEndLocal = minDate(dayEndLocal, params.windowEndLocal);
			}

			if (
				dayEndLocal.getTime() - dayStartLocal.getTime() <
				params.durationMinutes * 60 * 1000
			) {
				cursor = addDays(cursor, 1);
				continue;
			}

			const dayStartUtc = fromZonedTime(dayStartLocal, params.timezone);
			const dayEndUtc = fromZonedTime(dayEndLocal, params.timezone);
			const relevantBusy = params.busyIntervals.intervals.filter(
				(interval) =>
					interval.end.getTime() > dayStartUtc.getTime() &&
					interval.start.getTime() < dayEndUtc.getTime()
			);
			const gaps = buildGaps(relevantBusy, dayStartUtc, dayEndUtc);

			for (const gap of gaps) {
				const gapStartLocal = maxDate(
					toZonedTime(gap.start, params.timezone),
					dayStartLocal
				);
				let slotStartLocal = roundUpToInterval(gapStartLocal, 30);

				while (true) {
					const slotStartUtc = fromZonedTime(slotStartLocal, params.timezone);
					const slotEndUtc = addMinutes(slotStartUtc, params.durationMinutes);
					if (slotEndUtc.getTime() > gap.end.getTime()) {
						break;
					}
					candidates.push({
						start: slotStartUtc,
						end: slotEndUtc
					});
					slotStartLocal = addMinutes(slotStartLocal, 30);
				}
			}

			cursor = addDays(cursor, 1);
		}

		return sortCandidateSlots(candidates, {
			searchStartLocal: params.windowStartLocal,
			timezone: params.timezone,
			preferMorning:
				Boolean(params.preferences.prefer_morning_for_important_tasks) &&
				isImportantTask(params.task)
		});
	}
}
