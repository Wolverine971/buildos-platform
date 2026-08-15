// apps/web/src/routes/api/calendar/+server.ts
// Direct proxy endpoint for CalendarService methods

import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { CalendarService } from '$lib/services/calendar-service';
import { recurrencePatternBuilder } from '$lib/services/recurrence-pattern.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { googleCalendarRuntimeErrorResponse } from '$lib/server/google-calendar-api-errors';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { GoogleCalendarReadService } from '$lib/server/google-calendar-read.service';
import { GoogleCalendarWriteService } from '$lib/server/google-calendar-write.service';
import { ApiResponse, requireAuth } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

interface CalendarRequest {
	method: string;
	params?: any;
}

const calendarRequestSchema = z
	.object({
		method: z.string().min(1),
		params: z.record(z.unknown()).optional().default({})
	})
	.strict();

const eventReadParamsSchema = z
	.object({
		timeMin: z.string().datetime({ offset: true }).optional(),
		timeMax: z.string().datetime({ offset: true }).optional(),
		calendarId: z.string().min(1).max(1024).optional(),
		calendarSourceId: z.string().uuid().optional(),
		maxResults: z.number().int().min(1).max(500).optional(),
		q: z.string().max(500).optional(),
		timeZone: z.string().max(100).optional()
	})
	.strict()
	.refine(
		(value) =>
			!value.timeMin ||
			!value.timeMax ||
			Date.parse(value.timeMin) < Date.parse(value.timeMax),
		{ message: 'timeMin must be earlier than timeMax' }
	);

const availabilityParamsSchema = z
	.object({
		timeMin: z.string().datetime({ offset: true }),
		timeMax: z.string().datetime({ offset: true }),
		calendarId: z.string().min(1).max(1024).optional(),
		calendarSourceId: z.string().uuid().optional(),
		duration_minutes: z.number().int().min(1).max(1440).optional(),
		preferred_hours: z.array(z.number().int().min(0).max(23)).max(24).optional(),
		timeZone: z.string().max(100).optional()
	})
	.strict()
	.refine((value) => Date.parse(value.timeMin) < Date.parse(value.timeMax), {
		message: 'timeMin must be earlier than timeMax'
	});

const sendUpdatesSchema = z.enum(['all', 'externalOnly', 'none']);

const updateEventParamsSchema = z
	.object({
		event_id: z.string().min(1).max(2048),
		calendar_id: z.string().min(1).max(1024).optional(),
		calendarSourceId: z.string().uuid().optional(),
		ontoEventId: z.string().uuid().optional(),
		start_time: z.string().datetime({ offset: true }).optional(),
		end_time: z.string().datetime({ offset: true }).optional(),
		summary: z.string().max(1024).optional(),
		description: z.string().max(16_384).optional(),
		location: z.string().max(2048).optional(),
		attendees: z
			.array(
				z
					.object({
						email: z.string().email(),
						displayName: z.string().max(500).optional(),
						optional: z.boolean().optional(),
						responseStatus: z.string().max(100).optional()
					})
					.strict()
			)
			.max(500)
			.optional(),
		timeZone: z.string().max(100).optional(),
		recurrence: z
			.union([z.array(z.string().max(2048)), z.string().max(2048), z.null()])
			.optional(),
		update_scope: z.enum(['single', 'all', 'future']).optional(),
		instance_date: z.string().datetime({ offset: true }).optional(),
		sendUpdates: sendUpdatesSchema.optional()
	})
	.strict()
	.refine((value) => value.update_scope !== 'single' || Boolean(value.instance_date), {
		message: 'instance_date is required for a single-instance update'
	});

const deleteEventParamsSchema = z
	.object({
		event_id: z.string().min(1).max(2048),
		calendar_id: z.string().min(1).max(1024).optional(),
		calendarSourceId: z.string().uuid().optional(),
		ontoEventId: z.string().uuid().optional(),
		send_notifications: z.boolean().optional(),
		sendUpdates: sendUpdatesSchema.optional()
	})
	.strict();

const recurrencePatternSchema = z.enum([
	'daily',
	'weekdays',
	'weekly',
	'biweekly',
	'monthly',
	'quarterly',
	'yearly'
]);

const scheduleTaskParamsSchema = z
	.object({
		task_id: z.string().uuid(),
		start_time: z.string().datetime({ offset: true }),
		duration_minutes: z.number().int().min(1).max(1440).optional(),
		calendar_id: z.string().min(1).max(1024).optional(),
		calendarSourceId: z.string().uuid().optional(),
		description: z.string().max(16_384).optional(),
		color_id: z.string().max(100).optional(),
		timeZone: z.string().max(100).optional(),
		recurrence_pattern: recurrencePatternSchema.optional(),
		recurrence_ends: z.string().max(100).optional()
	})
	.strict();

function recurringInstanceEventId(eventId: string, instanceDate: string): string {
	return `${eventId}_${new Date(instanceDate)
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '')}`;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const authResult = await requireAuth(locals);
		if ('error' in authResult && authResult.error) {
			return authResult.error;
		}
		const { user } = authResult;

		const parsed = await parseJsonRequest(request, calendarRequestSchema);
		if (!parsed.ok) return parsed.response;
		const body = parsed.data as CalendarRequest;
		const { method, params = {} } = body;

		// Webhook rows are service-only. Legacy disconnects therefore need the
		// trusted server client after the multi-calendar RLS lockdown.
		const calendarService = new CalendarService(
			method === 'disconnectCalendar' ? createAdminSupabaseClient() : locals.supabase
		);
		const multiCalendarEnabled = isMultiCalendarUserAllowed(user.id, privateEnv);

		// Route to appropriate CalendarService method
		switch (method) {
			case 'hasValidConnection': {
				const isConnected = await calendarService.hasValidConnection(user.id);
				return ApiResponse.success(isConnected);
			}

			case 'getCalendarEvents': {
				if (multiCalendarEnabled) {
					const readParams = eventReadParamsSchema.safeParse(params);
					if (!readParams.success) {
						return ApiResponse.badRequest(
							'Invalid calendar event parameters',
							readParams.error.flatten()
						);
					}
					const service = new GoogleCalendarReadService(createAdminSupabaseClient());
					return ApiResponse.success(
						await service.listEvents({ userId: user.id, ...readParams.data }),
						undefined,
						{ public: false, maxAge: 0, mustRevalidate: true }
					);
				}
				const events = await calendarService.getCalendarEvents(user.id, params);
				return ApiResponse.success(events);
			}

			case 'findAvailableSlots': {
				if (multiCalendarEnabled) {
					const availabilityParams = availabilityParamsSchema.safeParse(params);
					if (!availabilityParams.success) {
						return ApiResponse.badRequest(
							'Invalid availability parameters',
							availabilityParams.error.flatten()
						);
					}
					const { duration_minutes, preferred_hours, ...readParams } =
						availabilityParams.data;
					const service = new GoogleCalendarReadService(createAdminSupabaseClient());
					return ApiResponse.success(
						await service.findAvailableSlots({
							userId: user.id,
							...readParams,
							durationMinutes: duration_minutes,
							preferredHours: preferred_hours
						}),
						undefined,
						{ public: false, maxAge: 0, mustRevalidate: true }
					);
				}
				const slots = await calendarService.findAvailableSlots(user.id, params);
				return ApiResponse.success(slots);
			}

			case 'scheduleTask': {
				if (multiCalendarEnabled) {
					const scheduleParams = scheduleTaskParamsSchema.safeParse(params);
					if (!scheduleParams.success) {
						return ApiResponse.badRequest(
							'Invalid task scheduling parameters',
							scheduleParams.error.flatten()
						);
					}
					const value = scheduleParams.data;
					const { data: taskRecord, error: taskError } = await locals.supabase
						.from('onto_tasks')
						.select('*, project:onto_projects(id, name)')
						.eq('id', value.task_id)
						.is('deleted_at', null)
						.single();
					if (taskError || !taskRecord) return ApiResponse.notFound('Task');

					const task = taskRecord as typeof taskRecord & {
						project?: { id: string; name: string } | null;
					};
					const taskProps = (task.props as Record<string, unknown> | null) ?? {};
					const durationMinutes =
						value.duration_minutes ??
						(typeof taskProps.duration_minutes === 'number'
							? Math.max(1, Math.min(taskProps.duration_minutes, 1440))
							: 60);
					const start = new Date(value.start_time);
					const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
					const projectId = task.project?.id ?? task.project_id ?? null;
					const descriptionSections: string[] = [];
					if (projectId && task.project?.name) {
						descriptionSections.push(
							`Project: ${task.project.name}\nhttps://build-os.com/projects/${projectId}`
						);
					}
					if (task.description) descriptionSections.push(task.description);
					if (value.description) descriptionSections.push(value.description);
					if (projectId) {
						descriptionSections.push(
							`📋 View Task: https://build-os.com/projects/${projectId}/tasks/${value.task_id}\n[BuildOS Task #${value.task_id}]`
						);
					}

					const storedPattern = recurrencePatternSchema.safeParse(
						taskProps.recurrence_pattern
					);
					const recurrencePattern =
						value.recurrence_pattern ??
						(storedPattern.success ? storedPattern.data : undefined);
					const recurrenceEnds =
						value.recurrence_ends ??
						(typeof taskProps.recurrence_ends === 'string'
							? taskProps.recurrence_ends
							: undefined);
					const isRecurring =
						Boolean(recurrencePattern) &&
						(value.recurrence_pattern !== undefined ||
							taskProps.task_type === 'recurring');
					const recurrenceRule =
						isRecurring && recurrencePattern
							? recurrencePatternBuilder.buildRRule({
									pattern: { type: recurrencePattern },
									endOption: recurrenceEnds
										? { type: 'date', value: recurrenceEnds }
										: { type: 'never' },
									startDate: value.start_time
								})
							: undefined;
					const service = new GoogleCalendarWriteService(createAdminSupabaseClient());
					const result = await service.createEvent({
						userId: user.id,
						selector: {
							calendarSourceId: value.calendarSourceId,
							calendarId: value.calendar_id
						},
						requestBody: {
							summary: task.title,
							description: descriptionSections.join('\n\n'),
							start: { dateTime: start.toISOString(), timeZone: value.timeZone },
							end: { dateTime: end.toISOString(), timeZone: value.timeZone },
							colorId: value.color_id,
							recurrence: recurrenceRule ? [recurrenceRule] : undefined
						},
						taskTracking: {
							taskId: value.task_id,
							eventStart: start.toISOString(),
							eventEnd: end.toISOString(),
							eventTitle: task.title,
							isMasterEvent: Boolean(recurrenceRule),
							recurrenceRule
						}
					});
					return ApiResponse.success({
						success: true,
						event_id: result.providerEventId,
						event_link: result.event.htmlLink ?? undefined,
						calendar_id: result.providerCalendarId,
						calendarSourceId: result.calendarSourceId,
						task_id: value.task_id,
						summary: result.event.summary ?? undefined,
						start: result.event.start ?? undefined,
						end: result.event.end ?? undefined,
						recurrence: result.event.recurrence ?? undefined,
						timeZone: value.timeZone
					});
				}
				const scheduleResult = await calendarService.scheduleTask(user.id, params);
				return ApiResponse.success(scheduleResult);
			}

			case 'updateCalendarEvent': {
				if (multiCalendarEnabled) {
					const updateParams = updateEventParamsSchema.safeParse(params);
					if (!updateParams.success) {
						return ApiResponse.badRequest(
							'Invalid calendar event update',
							updateParams.error.flatten()
						);
					}
					const value = updateParams.data;
					const providerEventId =
						value.update_scope === 'single' && value.instance_date
							? recurringInstanceEventId(value.event_id, value.instance_date)
							: value.event_id;
					const recurrence =
						value.recurrence === null
							? null
							: typeof value.recurrence === 'string'
								? [value.recurrence]
								: value.recurrence;
					const service = new GoogleCalendarWriteService(createAdminSupabaseClient());
					const result = await service.updateEvent({
						userId: user.id,
						providerEventId,
						selector: {
							calendarSourceId: value.calendarSourceId,
							ontoEventId: value.ontoEventId,
							calendarId: value.calendar_id
						},
						requestBody: {
							start: value.start_time
								? {
										dateTime: new Date(value.start_time).toISOString(),
										timeZone: value.timeZone
									}
								: undefined,
							end: value.end_time
								? {
										dateTime: new Date(value.end_time).toISOString(),
										timeZone: value.timeZone
									}
								: undefined,
							summary: value.summary,
							description: value.description,
							location: value.location,
							attendees: value.attendees,
							recurrence
						},
						sendUpdates: value.sendUpdates
					});
					return ApiResponse.success({
						success: true,
						event_id: result.providerEventId,
						event_link: result.event.htmlLink ?? undefined,
						summary: result.event.summary ?? undefined,
						start: result.event.start ?? undefined,
						end: result.event.end ?? undefined,
						recurrence: result.event.recurrence ?? undefined,
						updated: result.event.updated ?? undefined,
						timeZone: value.timeZone,
						calendarSourceId: result.calendarSourceId,
						providerCalendarId: result.providerCalendarId
					});
				}
				const updateResult = await calendarService.updateCalendarEvent(user.id, params);
				return ApiResponse.success(updateResult);
			}

			case 'deleteCalendarEvent': {
				if (multiCalendarEnabled) {
					const deleteParams = deleteEventParamsSchema.safeParse(params);
					if (!deleteParams.success) {
						return ApiResponse.badRequest(
							'Invalid calendar event deletion',
							deleteParams.error.flatten()
						);
					}
					const value = deleteParams.data;
					const service = new GoogleCalendarWriteService(createAdminSupabaseClient());
					const result = await service.deleteEvent({
						userId: user.id,
						providerEventId: value.event_id,
						selector: {
							calendarSourceId: value.calendarSourceId,
							ontoEventId: value.ontoEventId,
							calendarId: value.calendar_id
						},
						sendUpdates:
							value.sendUpdates ?? (value.send_notifications ? 'all' : 'none')
					});
					return ApiResponse.success({
						success: true,
						event_id: result.providerEventId,
						message: result.alreadyMissing
							? 'Event already deleted or not found'
							: 'Calendar event deleted successfully',
						calendarSourceId: result.calendarSourceId,
						providerCalendarId: result.providerCalendarId
					});
				}
				const deleteResult = await calendarService.deleteCalendarEvent(user.id, params);
				return ApiResponse.success(deleteResult);
			}

			case 'getUpcomingTasks': {
				const tasks = await calendarService.getUpcomingTasks(user.id, params);
				return ApiResponse.success(tasks);
			}

			case 'bulkDeleteCalendarEvents': {
				const bulkDeleteResult = await calendarService.bulkDeleteCalendarEvents(
					user.id,
					params.events,
					params.options
				);
				return ApiResponse.success(bulkDeleteResult);
			}

			case 'bulkScheduleTasks': {
				const bulkScheduleResult = await calendarService.bulkScheduleTasks(
					user.id,
					params.tasks,
					params.options
				);
				return ApiResponse.success(bulkScheduleResult);
			}

			case 'bulkUpdateCalendarEvents': {
				const bulkUpdateResult = await calendarService.bulkUpdateCalendarEvents(
					user.id,
					params.updates,
					params.options
				);
				return ApiResponse.success(bulkUpdateResult);
			}

			case 'disconnectCalendar':
				await calendarService.disconnectCalendar(user.id);
				return ApiResponse.success({ disconnected: true });

			case 'createProjectCalendar': {
				const result = await calendarService.createProjectCalendar(user.id, params);
				return ApiResponse.success(result);
			}

			case 'updateCalendarProperties': {
				const result = await calendarService.updateCalendarProperties(
					user.id,
					params.calendarId,
					params.updates
				);
				return ApiResponse.success(result);
			}

			case 'deleteProjectCalendar': {
				const result = await calendarService.deleteProjectCalendar(
					user.id,
					params.calendarId
				);
				return ApiResponse.success(result);
			}

			case 'listUserCalendars': {
				const result = await calendarService.listUserCalendars(user.id);
				return ApiResponse.success(result);
			}

			case 'shareCalendar': {
				const result = await calendarService.shareCalendar(
					user.id,
					params.calendarId,
					params.shares
				);
				return ApiResponse.success(result);
			}

			case 'unshareCalendar': {
				const result = await calendarService.unshareCalendar(
					user.id,
					params.calendarId,
					params.emails
				);
				return ApiResponse.success(result);
			}

			default:
				return ApiResponse.badRequest(`Unknown method: ${method}`);
		}
	} catch (error: any) {
		console.error('Calendar API error:', error);
		const runtimeResponse = googleCalendarRuntimeErrorResponse(error);
		if (runtimeResponse) return runtimeResponse;

		// Check for specific error types
		if (
			error.message?.includes('Connection required') ||
			error.message?.includes('not connected')
		) {
			return ApiResponse.error('Calendar not connected', 403, 'CALENDAR_NOT_CONNECTED', {
				requiresAuth: true
			});
		}

		if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
			return ApiResponse.error(
				'Calendar API limit reached. Please try again in a few minutes.',
				429,
				'RATE_LIMITED'
			);
		}

		return ApiResponse.internalError(error, error.message || 'Calendar operation failed');
	}
};

// GET endpoint for checking connection status
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const authResult = await requireAuth(locals);
		if ('error' in authResult && authResult.error) {
			return authResult.error;
		}
		const { user } = authResult;

		const calendarService = new CalendarService(locals.supabase);
		const isConnected = await calendarService.hasValidConnection(user.id);

		return ApiResponse.success({
			connected: isConnected,
			userId: user.id
		});
	} catch (error: any) {
		console.error('Calendar connection check error:', error);
		return ApiResponse.error(
			error.message || 'Calendar connection check failed',
			500,
			'OPERATION_FAILED',
			{ connected: false }
		);
	}
};
