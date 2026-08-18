// apps/web/src/lib/server/calendar-proxy/request-schemas.ts
import { z } from 'zod';

export const calendarRequestSchema = z
	.object({
		method: z.string().min(1),
		params: z.record(z.unknown()).optional().default({})
	})
	.strict();

export const eventReadParamsSchema = z
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

export const availabilityParamsSchema = z
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

export const sendUpdatesSchema = z.enum(['all', 'externalOnly', 'none']);

export const updateEventParamsSchema = z
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

export const deleteEventParamsSchema = z
	.object({
		event_id: z.string().min(1).max(2048),
		calendar_id: z.string().min(1).max(1024).optional(),
		calendarSourceId: z.string().uuid().optional(),
		ontoEventId: z.string().uuid().optional(),
		send_notifications: z.boolean().optional(),
		sendUpdates: sendUpdatesSchema.optional()
	})
	.strict();

export const recurrencePatternSchema = z.enum([
	'daily',
	'weekdays',
	'weekly',
	'biweekly',
	'monthly',
	'quarterly',
	'yearly'
]);

export const scheduleTaskParamsSchema = z
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

export function recurringInstanceEventId(eventId: string, instanceDate: string): string {
	return `${eventId}_${new Date(instanceDate)
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '')}`;
}
