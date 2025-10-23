// apps/web/src/lib/services/calendar-service.ts
import { calendar_v3, google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { GoogleOAuthService, GoogleOAuthConnectionError } from './google-oauth-service';
import { ErrorLoggerService } from './errorLogger.service';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { recurrencePatternBuilder, type RecurrenceConfig } from './recurrence-pattern.service';

// Use GoogleOAuthConnectionError from google-oauth-service
export { GoogleOAuthConnectionError as CalendarConnectionError };

// Type definitions for method parameters
export interface GetCalendarEventsParams {
	calendarId?: string;
	timeMin?: string;
	timeMax?: string;
	maxResults?: number;
	q?: string;
	timeZone?: string;
}

export interface FindAvailableSlotsParams {
	timeMin: string;
	timeMax: string;
	duration_minutes?: number;
	calendarId?: string;
	preferred_hours?: number[];
	timeZone?: string;
}

export interface ScheduleTaskParams {
	task_id: string;
	start_time: string;
	duration_minutes?: number;
	calendar_id?: string;
	description?: string;
	color_id?: string;
	timeZone?: string;
	// Optional recurrence override (if not provided, will use task's settings)
	recurrence_pattern?: Database['public']['Enums']['recurrence_pattern'];
	recurrence_ends?: string;
}

export type CalendarSendUpdatesOption = 'all' | 'externalOnly' | 'none';

export interface UpdateCalendarEventParams {
	event_id: string;
	calendar_id?: string;
	start_time?: string;
	end_time?: string;
	summary?: string;
	description?: string;
	location?: string;
	attendees?: Array<{
		email: string;
		displayName?: string;
		optional?: boolean;
		responseStatus?: string;
	}>;
	timeZone?: string;
	recurrence?: string[] | string | null;
	// For recurring events - specify which instances to update
	update_scope?: 'single' | 'all' | 'future';
	// For single instance updates - the specific instance date
	instance_date?: string;
	sendUpdates?: CalendarSendUpdatesOption;
}

export interface DeleteCalendarEventParams {
	event_id: string;
	calendar_id?: string;
	send_notifications?: boolean;
}

export interface GetUpcomingTasksParams {
	days_ahead?: number;
}

export interface BulkDeleteEventParams {
	id: string;
	calendar_event_id: string;
	calendar_id?: string;
}

// Response types

export interface CalendarEvent {
	kind: 'calendar#event';
	etag: string;
	id: string;
	status: 'confirmed' | 'tentative' | 'cancelled';
	htmlLink: string;
	created: string; // ISO timestamp
	updated: string; // ISO timestamp
	summary: string;
	description?: string; // Event description/notes
	location?: string; // Event location
	colorId?: string; // Event color
	creator: {
		email: string;
		displayName?: string;
		self?: boolean;
	};
	organizer: {
		email: string;
		displayName?: string;
		self?: boolean;
	};
	start: {
		dateTime?: string; // ISO timestamp
		date?: string; // For all-day events
		timeZone?: string;
	};
	end: {
		dateTime?: string;
		date?: string;
		timeZone?: string;
	};
	recurringEventId?: string;
	originalStartTime?: {
		dateTime?: string;
		date?: string;
		timeZone?: string;
	};
	iCalUID: string;
	sequence: number;
	attendees?: {
		email: string;
		displayName?: string;
		organizer?: boolean;
		self?: boolean;
		responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
		comment?: string;
		additionalGuests?: number;
	}[];
	reminders?: {
		useDefault: boolean;
		overrides?: {
			method: 'email' | 'popup';
			minutes: number;
		}[];
	};
	eventType?: 'default' | 'outOfOffice' | 'focusTime' | string;
	transparency?: 'opaque' | 'transparent';
	visibility?: 'default' | 'public' | 'private' | 'confidential';
	recurrence?: string[]; // RRULE strings
	hangoutLink?: string; // Google Meet link
	conferenceData?: any; // Conference info
}

export interface GetCalendarEventsResponse {
	event_count: number;
	time_range: {
		start: string;
		end: string;
		timeZone?: string;
	};
	events: CalendarEvent[];
}

export interface AvailableSlot {
	start: string | Date; // ISO 8601 string or Date object
	end: string | Date; // ISO 8601 string or Date object
	duration_minutes: number;
	timeZone?: string;
}

export interface FindAvailableSlotsResponse {
	available_slots: AvailableSlot[];
	total_available: number;
	search_params: {
		timeMin: string;
		timeMax: string;
		duration_minutes: number;
		preferred_hours?: number[];
		timeZone?: string;
	};
}

export interface ScheduleTaskResponse {
	success: boolean;
	event_id?: string;
	event_link?: string;
	calendar_id: string;
	task_id: string;
	summary?: string;
	start?: calendar_v3.Schema$EventDateTime;
	end?: calendar_v3.Schema$EventDateTime;
	recurrence?: string[];
	timeZone?: string;
}

export interface CreateStandaloneEventParams {
	summary: string;
	description?: string;
	start: Date;
	end: Date;
	timeZone?: string;
	colorId?: string;
	calendar_id?: string;
}

export interface CreateStandaloneEventResult {
	eventId: string;
	eventLink?: string;
}

export interface UpdateCalendarEventResponse {
	success: boolean;
	event_id?: string;
	event_link?: string;
	summary?: string;
	start?: calendar_v3.Schema$EventDateTime;
	end?: calendar_v3.Schema$EventDateTime;
	recurrence?: string[];
	updated?: string;
	timeZone?: string;
}

export interface DeleteCalendarEventResponse {
	success: boolean;
	event_id: string;
	message: string;
}

export interface UpcomingTask {
	id: string;
	title: string;
	description?: string;
	start_date?: string;
	duration_minutes?: number;
	task_type?: string;
	recurrence_pattern?: string;
	project?: {
		name: string;
		slug: string;
	};
	status: string;
	priority?: number;
}

export interface GetUpcomingTasksResponse {
	task_count: number;
	days_ahead: number;
	tasks: UpcomingTask[];
}

export interface BulkDeleteResponse {
	success: boolean;
	warnings: string[];
	errors: string[];
	deletedCount: number;
}

export class CalendarService {
	private supabase: SupabaseClient;
	private activityLogger: ActivityLogger;
	private oAuthService: GoogleOAuthService;
	private errorLogger: ErrorLoggerService;

	constructor(supabase: SupabaseClient) {
		this.supabase = supabase;
		this.activityLogger = new ActivityLogger(supabase);
		this.oAuthService = new GoogleOAuthService(supabase);
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
	}

	/**
	 * Format date/time for Google Calendar API based on timezone preference
	 */
	private formatDateTimeForCalendar(dateTimeString: string, timeZone?: string) {
		if (timeZone) {
			try {
				const date = new Date(dateTimeString);
				if (isNaN(date.getTime())) {
					throw new Error('Invalid date string');
				}

				const zonedDate = toZonedTime(date, timeZone);
				const localDateTime = format(zonedDate, "yyyy-MM-dd'T'HH:mm:ss");

				return {
					dateTime: localDateTime,
					timeZone: timeZone
				};
			} catch (error) {
				console.error('Error formatting datetime for calendar:', error);
				return {
					dateTime: new Date(dateTimeString).toISOString()
				};
			}
		} else {
			const date = new Date(dateTimeString);
			return {
				dateTime: date.toISOString()
			};
		}
	}

	/**
	 * Silently handle connection failures by disconnecting the calendar
	 */
	private async handleConnectionFailure(userId: string, reason: string): Promise<void> {
		try {
			await this.activityLogger.logActivity(userId, 'admin_action', {
				action: 'calendar_auto_disconnected',
				reason: reason,
				timestamp: new Date().toISOString()
			});

			await this.oAuthService.disconnectCalendar(userId);
			console.log(`Calendar automatically disconnected for user ${userId}: ${reason}`);
		} catch (error) {
			console.error('Error handling calendar connection failure:', error);
		}
	}

	/**
	 * Mark a calendar change as app-initiated
	 */
	private async markAppInitiatedChange(eventId: string, userId: string): Promise<void> {
		const { data: taskEvent } = await this.supabase
			.from('task_calendar_events')
			.select('id')
			.eq('calendar_event_id', eventId)
			.eq('user_id', userId)
			.single();

		if (taskEvent) {
			await this.supabase
				.from('task_calendar_events')
				.update({
					sync_source: 'app',
					updated_at: new Date().toISOString()
				})
				.eq('id', taskEvent.id);
		}
	}

	private buildTaskUrl(projectId: string, taskId: string): string {
		return `https://build-os.com/projects/${projectId}/tasks/${taskId}`;
	}

	private ensureTaskLinkInDescription(
		description: string | null | undefined,
		projectId?: string | null,
		taskId?: string | null
	): string {
		if (!projectId || !taskId) {
			return description ?? '';
		}

		const taskUrl = this.buildTaskUrl(projectId, taskId);
		const existingDescription = description ?? '';

		if (
			existingDescription.includes(taskUrl) ||
			existingDescription.includes(taskUrl.replace('https://', '')) ||
			existingDescription.includes(`[BuildOS Task #${taskId}]`)
		) {
			return existingDescription;
		}

		const sanitized = existingDescription.trimEnd();
		const linkBlock = `📋 View Task: ${taskUrl}\n[BuildOS Task #${taskId}]`;

		if (sanitized.length === 0) {
			return linkBlock;
		}

		return `${sanitized}\n\n${linkBlock}`;
	}

	private extractOrganizerMetadata(event: calendar_v3.Schema$Event | null | undefined): {
		organizer_email: string | null;
		organizer_display_name: string | null;
		organizer_self: boolean | null;
	} {
		const organizer = event?.organizer;

		return {
			organizer_email: organizer?.email ?? null,
			organizer_display_name: organizer?.displayName ?? null,
			organizer_self:
				typeof organizer?.self === 'boolean' ? organizer.self : (organizer?.self ?? null)
		};
	}

	private normalizeAttendees(attendees: calendar_v3.Schema$EventAttendee[] | null | undefined): {
		email: string;
		displayName?: string;
		organizer?: boolean;
		self?: boolean;
		responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction';
		comment?: string;
		additionalGuests?: number;
	}[] {
		if (!attendees || attendees.length === 0) {
			return [];
		}

		return attendees
			.filter((attendee): attendee is calendar_v3.Schema$EventAttendee => !!attendee?.email)
			.map((attendee) => ({
				email: attendee.email!,
				displayName: attendee.displayName ?? undefined,
				organizer: attendee.organizer ?? undefined,
				self: attendee.self ?? undefined,
				responseStatus: this.normalizeAttendeeResponseStatus(attendee.responseStatus),
				comment: attendee.comment ?? undefined,
				additionalGuests:
					typeof attendee.additionalGuests === 'number'
						? attendee.additionalGuests
						: undefined
			}));
	}

	private normalizeAttendeeResponseStatus(
		status: string | null | undefined
	): 'accepted' | 'declined' | 'tentative' | 'needsAction' {
		switch (status) {
			case 'accepted':
			case 'declined':
			case 'tentative':
				return status;
			default:
				return 'needsAction';
		}
	}

	/**
	 * Convert recurrence pattern to RRULE
	 */
	private convertToRRule(
		pattern: Database['public']['Enums']['recurrence_pattern'],
		ends?: string,
		startDate?: string
	): string | null {
		const config: RecurrenceConfig = {
			pattern: { type: this.mapPatternType(pattern) },
			endOption: ends ? { type: 'date', value: ends } : { type: 'never' },
			startDate: startDate || new Date().toISOString()
		};

		return recurrencePatternBuilder.buildRRule(config);
	}

	private mapPatternType(
		pattern: Database['public']['Enums']['recurrence_pattern']
	): Database['public']['Enums']['recurrence_pattern'] {
		// The pattern is already the correct type, just return it
		// The recurrencePatternBuilder expects the same values
		return pattern;
	}

	/**
	 * Simple connection check - used by UI
	 */
	async hasValidConnection(userId: string): Promise<boolean> {
		try {
			const isValid = await this.oAuthService.hasValidConnection(userId);
			if (!isValid) {
				await this.handleConnectionFailure(userId, 'Connection validation failed');
			}
			return isValid;
		} catch (error) {
			console.error('Error checking calendar connection:', error);
			return false;
		}
	}

	/**
	 * Disconnect calendar and log activity
	 */
	async disconnectCalendar(userId: string): Promise<void> {
		try {
			await this.activityLogger.logActivity(userId, 'admin_action', {
				action: 'calendar_disconnected',
				timestamp: new Date().toISOString()
			});

			await this.oAuthService.disconnectCalendar(userId);
		} catch (error) {
			console.error('Error disconnecting calendar:', error);
			throw error;
		}
	}

	/**
	 * Get calendar events with optional filtering
	 */
	async getCalendarEvents(
		userId: string,
		params: GetCalendarEventsParams = {}
	): Promise<GetCalendarEventsResponse> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			const now = new Date();
			const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

			const requestParams = {
				calendarId: params.calendarId || 'primary',
				timeMin: params.timeMin || now.toISOString(),
				timeMax: params.timeMax || weekFromNow.toISOString(),
				singleEvents: true,
				orderBy: 'startTime' as const,
				maxResults: params.maxResults || 50,
				q: params.q,
				timeZone: params.timeZone
			};

			const response = await calendar.events.list(requestParams);
			// Cast the Google Calendar API response to our CalendarEvent type
			// This preserves ALL event data including description, location, attendees, etc.
			const events: CalendarEvent[] = (response.data.items || []) as CalendarEvent[];

			return {
				event_count: events.length,
				time_range: {
					start: requestParams.timeMin,
					end: requestParams.timeMax,
					timeZone: requestParams.timeZone
				},
				events // Return all event data without mapping/stripping
			};
		} catch (error: any) {
			console.error('Error getting calendar events:', error);
			if (error instanceof GoogleOAuthConnectionError && error.requiresReconnection) {
				await this.handleConnectionFailure(userId, error.message);
			}
			throw error;
		}
	}

	/**
	 * Find available time slots in the calendar
	 */
	async findAvailableSlots(
		userId: string,
		params: FindAvailableSlotsParams
	): Promise<FindAvailableSlotsResponse> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			const {
				timeMin,
				timeMax,
				duration_minutes = 60,
				calendarId = 'primary',
				preferred_hours,
				timeZone
			} = params;

			const freeBusyResponse = await calendar.freebusy.query({
				requestBody: {
					timeMin,
					timeMax,
					timeZone,
					items: [{ id: calendarId }]
				}
			});

			const busySlots = freeBusyResponse.data.calendars?.[calendarId]?.busy || [];
			const availableSlots: AvailableSlot[] = [];
			const startTime = new Date(timeMin);
			const endTime = new Date(timeMax);

			const current = new Date(startTime);
			while (current < endTime) {
				const slotEnd = new Date(current.getTime() + duration_minutes * 60 * 1000);

				const isAvailable = !busySlots.some((busy) => {
					const busyStart = new Date(busy.start!);
					const busyEnd = new Date(busy.end!);
					return current < busyEnd && slotEnd > busyStart;
				});

				const hour = current.getHours();
				const inPreferredHours = !preferred_hours || preferred_hours.includes(hour);

				if (isAvailable && inPreferredHours) {
					const slot = {
						start: current.toISOString(),
						end: slotEnd.toISOString(),
						duration_minutes
					};

					if (timeZone) {
						const startFormatted = this.formatDateTimeForCalendar(slot.start, timeZone);
						const endFormatted = this.formatDateTimeForCalendar(slot.end, timeZone);
						availableSlots.push({
							start: startFormatted,
							end: endFormatted,
							duration_minutes,
							timeZone
						});
					} else {
						availableSlots.push(slot);
					}
				}

				current.setMinutes(current.getMinutes() + 30);
			}

			return {
				available_slots: availableSlots.slice(0, 10),
				total_available: availableSlots.length,
				search_params: {
					timeMin,
					timeMax,
					duration_minutes,
					preferred_hours,
					timeZone
				}
			};
		} catch (error: any) {
			console.error('Error finding available slots:', error);
			if (error instanceof GoogleOAuthConnectionError && error.requiresReconnection) {
				await this.handleConnectionFailure(userId, error.message);
			}
			throw error;
		}
	}

	/**
	 * Schedule a task in the calendar
	 */
	async scheduleTask(userId: string, params: ScheduleTaskParams): Promise<ScheduleTaskResponse> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			const {
				task_id,
				start_time,
				duration_minutes,
				calendar_id = 'primary',
				description,
				color_id,
				timeZone,
				recurrence_pattern: overridePattern,
				recurrence_ends: overrideEnds
			} = params;

			// Get task details
			const { data: task, error: taskError } = await this.supabase
				.from('tasks')
				.select(
					`
					*,
					project:projects(id, name, slug)
				`
				)
				.eq('id', task_id)
				.eq('user_id', userId)
				.single();

			if (taskError || !task) {
				throw new Error('Task not found');
			}

			const taskDuration = duration_minutes || task.duration_minutes || 60;

			// Parse start time and calculate end time
			const startDate = new Date(start_time);
			if (isNaN(startDate.getTime())) {
				throw new Error('Invalid start time provided');
			}
			const endDate = new Date(startDate.getTime() + taskDuration * 60 * 1000);

			const projectId = task.project?.id || task.project_id || null;
			const descriptionSections: string[] = [];

			if (projectId && task.project?.name) {
				descriptionSections.push(
					`Project: ${task.project.name}\nhttps://build-os.com/projects/${projectId}`
				);
			}

			if (task.description) {
				descriptionSections.push(task.description);
			}

			if (description) {
				descriptionSections.push(description);
			}

			const eventDescription = this.ensureTaskLinkInDescription(
				descriptionSections.join('\n\n'),
				projectId,
				task_id
			);

			// Use override recurrence settings if provided, otherwise use task's settings
			const recurrencePattern = overridePattern || task.recurrence_pattern;
			const recurrenceEnds = overrideEnds || task.recurrence_ends;

			const recurrence = [];
			if ((task.task_type === 'recurring' || overridePattern) && recurrencePattern) {
				const rrule = this.convertToRRule(recurrencePattern, recurrenceEnds, start_time);
				if (rrule) recurrence.push(rrule);
			}

			// Format start and end times based on timezone preference
			const startFormatted = this.formatDateTimeForCalendar(start_time, timeZone);
			const endFormatted = this.formatDateTimeForCalendar(endDate.toISOString(), timeZone);

			const event: calendar_v3.Schema$Event = {
				summary: task.title,
				description: eventDescription,
				start: startFormatted,
				end: endFormatted,
				colorId: color_id,
				recurrence: recurrence.length > 0 ? recurrence : undefined
			};

			const response = await calendar.events.insert({
				calendarId: calendar_id,
				requestBody: event
			});

			if (response.data) {
				const organizerMetadata = this.extractOrganizerMetadata(response.data);
				const attendeesForStorage = this.normalizeAttendees(response.data.attendees);
				// Save the relationship with proper recurring event tracking
				const isRecurring = recurrence.length > 0;

				await this.supabase.from('task_calendar_events').upsert({
					user_id: userId,
					task_id: task_id,
					calendar_event_id: response.data.id!,
					calendar_id: calendar_id,
					event_link: response.data.htmlLink,
					event_start: startDate.toISOString(),
					event_end: endDate.toISOString(),
					event_title: task.title,
					// Mark as master event if it's recurring
					is_master_event: isRecurring,
					// Store the RRULE if recurring
					recurrence_rule: isRecurring && recurrence.length > 0 ? recurrence[0] : null,
					// Sync metadata
					last_synced_at: new Date().toISOString(),
					sync_status: 'synced',
					sync_source: 'app',
					updated_at: new Date().toISOString(),
					organizer_email: organizerMetadata.organizer_email,
					organizer_display_name: organizerMetadata.organizer_display_name,
					organizer_self: organizerMetadata.organizer_self,
					attendees: attendeesForStorage
				});

				await this.markAppInitiatedChange(response.data.id!, userId);

				return {
					success: true,
					event_id: response.data.id || undefined,
					event_link: response.data.htmlLink || undefined,
					calendar_id: calendar_id,
					task_id,
					summary: response.data.summary || undefined,
					start: response.data.start || undefined,
					end: response.data.end || undefined,
					recurrence: response.data?.recurrence || undefined,
					timeZone
				};
			} else {
				throw new Error('Failed to insert calendar event');
			}
		} catch (error: any) {
			console.error('Error scheduling task:', error);
			if (error instanceof GoogleOAuthConnectionError && error.requiresReconnection) {
				await this.handleConnectionFailure(userId, error.message);
			}
			throw error;
		}
	}

	/**
	 * Create a standalone calendar event (used for Time Play blocks and similar flows)
	 */
	async createStandaloneEvent(
		userId: string,
		params: CreateStandaloneEventParams
	): Promise<CreateStandaloneEventResult> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			const calendarId = params.calendar_id ?? 'primary';
			const startFormatted = this.formatDateTimeForCalendar(
				params.start.toISOString(),
				params.timeZone
			);
			const endFormatted = this.formatDateTimeForCalendar(
				params.end.toISOString(),
				params.timeZone
			);

			const event: calendar_v3.Schema$Event = {
				summary: params.summary,
				description: params.description,
				start: startFormatted,
				end: endFormatted,
				colorId: params.colorId
			};

			const response = await calendar.events.insert({
				calendarId,
				requestBody: event
			});

			const eventId = response.data.id;
			if (!eventId) {
				throw new Error('Failed to create calendar event');
			}

			return {
				eventId,
				eventLink: response.data.htmlLink ?? undefined
			};
		} catch (error: any) {
			console.error('Error creating standalone calendar event:', error);
			if (error instanceof GoogleOAuthConnectionError && error.requiresReconnection) {
				await this.handleConnectionFailure(userId, error.message);
			}
			throw error;
		}
	}

	/**
	 * Update an existing calendar event
	 */
	async updateCalendarEvent(
		userId: string,
		params: UpdateCalendarEventParams
	): Promise<UpdateCalendarEventResponse> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			const {
				event_id,
				calendar_id = 'primary',
				start_time,
				end_time,
				summary,
				description,
				location,
				attendees,
				timeZone,
				recurrence,
				update_scope = 'all',
				instance_date,
				sendUpdates
			} = params;

			// Handle different update scopes for recurring events
			let effectiveEventId = event_id;

			// For single instance updates, append the instance date to the event ID
			if (update_scope === 'single' && instance_date) {
				// Convert instance date to RFC3339 format for Google Calendar
				const instanceDateTime = new Date(instance_date);
				// Format: eventId_YYYYMMDDTHHMMSSZ
				const instanceId = `${event_id}_${instanceDateTime
					.toISOString()
					.replace(/[-:]/g, '')
					.replace(/\.\d{3}/, '')}`;
				effectiveEventId = instanceId;
			}

			// First get the existing event
			const existingEvent = await calendar.events.get({
				calendarId: calendar_id,
				eventId: effectiveEventId
			});

			if (!existingEvent.data) {
				throw new Error('Event not found');
			}

			// Build update payload
			const updatePayload: calendar_v3.Schema$Event = {
				...existingEvent.data
			};

			// Update times if provided
			if (start_time) {
				updatePayload.start = this.formatDateTimeForCalendar(start_time, timeZone);
			}

			if (end_time) {
				updatePayload.end = this.formatDateTimeForCalendar(end_time, timeZone);
			}

			// Update other fields if provided
			if (summary !== undefined) updatePayload.summary = summary;
			if (description !== undefined) {
				let projectIdForLink: string | null = null;
				let taskIdForLink: string | null = null;

				try {
					const { data: taskEvent } = await this.supabase
						.from('task_calendar_events')
						.select('task_id')
						.eq('calendar_event_id', event_id)
						.maybeSingle();

					if (taskEvent?.task_id) {
						taskIdForLink = taskEvent.task_id;
						const { data: taskDetails } = await this.supabase
							.from('tasks')
							.select('project_id')
							.eq('id', taskEvent.task_id)
							.maybeSingle();

						if (taskDetails?.project_id) {
							projectIdForLink = taskDetails.project_id;
						}
					}
				} catch (fetchError) {
					console.error('Error fetching task details for calendar update:', fetchError);
				}

				updatePayload.description = this.ensureTaskLinkInDescription(
					description,
					projectIdForLink,
					taskIdForLink
				);
			}
			if (location !== undefined) updatePayload.location = location;
			if (attendees !== undefined) updatePayload.attendees = attendees;

			// Handle recurrence updates
			if (recurrence !== undefined) {
				if (recurrence === null || (Array.isArray(recurrence) && recurrence.length === 0)) {
					delete updatePayload.recurrence;
				} else if (Array.isArray(recurrence)) {
					updatePayload.recurrence = recurrence;
				} else if (typeof recurrence === 'string') {
					updatePayload.recurrence = [recurrence];
				}
			}

			// Execute update with the appropriate event ID
			const response = await calendar.events.update({
				calendarId: calendar_id,
				eventId: effectiveEventId,
				requestBody: updatePayload,
				sendUpdates
			});

			if (!response.data) {
				throw new Error('Calendar API did not return updated event details');
			}

			const organizerMetadata = this.extractOrganizerMetadata(response.data);
			const attendeesForStorage = this.normalizeAttendees(response.data.attendees);

			// Track the update scope in database
			if (update_scope === 'single' && instance_date) {
				// For single instance updates, create or update an exception record
				await this.supabase.from('task_calendar_events').upsert({
					user_id: userId,
					calendar_event_id: effectiveEventId,
					calendar_id: calendar_id,
					recurrence_master_id: event_id,
					recurrence_instance_date: instance_date,
					is_exception: true,
					exception_type: 'modified',
					series_update_scope: 'single',
					event_start: start_time ? new Date(start_time).toISOString() : undefined,
					event_end: end_time ? new Date(end_time).toISOString() : undefined,
					event_title: summary,
					organizer_email: organizerMetadata.organizer_email,
					organizer_display_name: organizerMetadata.organizer_display_name,
					organizer_self: organizerMetadata.organizer_self,
					attendees: attendeesForStorage,
					sync_status: 'synced',
					sync_source: 'app',
					last_synced_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				});
			}

			// Update our tracking record with synced metadata
			const updates: Record<string, any> = {
				last_synced_at: new Date().toISOString(),
				sync_status: 'synced',
				sync_source: 'app',
				series_update_scope: update_scope,
				organizer_email: organizerMetadata.organizer_email,
				organizer_display_name: organizerMetadata.organizer_display_name,
				organizer_self: organizerMetadata.organizer_self,
				attendees: attendeesForStorage
			};

			if (start_time) {
				updates.event_start = new Date(start_time).toISOString();
			}

			if (end_time) {
				updates.event_end = new Date(end_time).toISOString();
			}

			// Update recurrence_rule if recurrence was changed
			if (recurrence !== undefined) {
				if (recurrence === null || (Array.isArray(recurrence) && recurrence.length === 0)) {
					updates.recurrence_rule = null;
					updates.is_master_event = false;
				} else if (Array.isArray(recurrence) && recurrence.length > 0) {
					updates.recurrence_rule = recurrence[0];
					updates.is_master_event = true;
				} else if (typeof recurrence === 'string') {
					updates.recurrence_rule = recurrence;
					updates.is_master_event = true;
				}
			}

			await this.supabase
				.from('task_calendar_events')
				.update({
					...updates,
					updated_at: new Date().toISOString()
				})
				.eq('calendar_event_id', event_id);

			await this.markAppInitiatedChange(event_id, userId);

			return {
				success: true,
				event_id: response.data.id || undefined,
				event_link: response.data.htmlLink || undefined,
				summary: response.data.summary || undefined,
				start: response.data.start || undefined,
				end: response.data.end || undefined,
				recurrence: response.data?.recurrence || undefined,
				updated: response.data.updated || undefined,
				timeZone
			};
		} catch (error: any) {
			console.error('Error updating calendar event:', error);

			// Log the calendar update error
			await this.errorLogger.logCalendarError(error, 'update', params.event_id, userId, {
				calendarEventId: params.event_id,
				calendarId: params.calendar_id || 'primary',
				reason: error.message || 'Unknown update error'
			});

			if (error instanceof GoogleOAuthConnectionError && error.requiresReconnection) {
				await this.handleConnectionFailure(userId, error.message);
			}
			throw error;
		}
	}

	/**
	 * Delete a calendar event
	 */
	async deleteCalendarEvent(
		userId: string,
		params: DeleteCalendarEventParams
	): Promise<DeleteCalendarEventResponse> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			const { event_id, calendar_id = 'primary', send_notifications = false } = params;

			await calendar.events.delete({
				calendarId: calendar_id,
				eventId: event_id,
				sendNotifications: send_notifications
			});

			// Mark as deleted in our tracking table (soft delete for audit trail)
			await this.supabase
				.from('task_calendar_events')
				.delete()
				.eq('calendar_event_id', event_id);

			return {
				success: true,
				event_id: event_id,
				message: 'Calendar event deleted successfully'
			};
		} catch (error: any) {
			console.error('Error deleting calendar event:', error);

			// Log the calendar deletion error
			await this.errorLogger.logCalendarError(
				error,
				'delete',
				'calendar_event', // Using calendar_event_id as task identifier
				userId,
				{
					calendarEventId: params.event_id,
					calendarId: params.calendar_id || 'primary',
					reason: error.message || 'Unknown deletion error'
				}
			);

			// 404 is not an error for delete operations
			if (error.code === 404 || error.message?.includes('404')) {
				// Still mark as deleted in our database
				await this.supabase
					.from('task_calendar_events')
					.delete()
					.eq('calendar_event_id', params.event_id);

				return {
					success: true,
					event_id: params.event_id,
					message: 'Event already deleted or not found'
				};
			}

			if (error instanceof GoogleOAuthConnectionError && error.requiresReconnection) {
				await this.handleConnectionFailure(userId, error.message);
			}
			throw error;
		}
	}

	/**
	 * Get upcoming tasks from BuildOS that need scheduling
	 */
	async getUpcomingTasks(
		userId: string,
		params: GetUpcomingTasksParams = {}
	): Promise<GetUpcomingTasksResponse> {
		try {
			const { days_ahead = 7 } = params;

			const startDate = new Date().toISOString();
			const endDate = new Date();
			endDate.setDate(endDate.getDate() + days_ahead);

			const { data: tasks, error } = await this.supabase
				.from('tasks')
				.select(
					`
					*,
					project:projects(name, slug)
				`
				)
				.eq('user_id', userId)
				.in('status', ['backlog', 'in_progress'])
				.gte('start_date', startDate)
				.lte('start_date', endDate.toISOString())
				.order('start_date', { ascending: true });

			if (error) throw error;

			return {
				task_count: tasks?.length || 0,
				days_ahead,
				tasks:
					tasks?.map((task) => ({
						id: task.id,
						title: task.title,
						description: task.description,
						start_date: task.start_date,
						duration_minutes: task.duration_minutes,
						task_type: task.task_type,
						recurrence_pattern: task.recurrence_pattern,
						project: task.project,
						status: task.status,
						priority: task.priority
					})) || []
			};
		} catch (error) {
			console.error('Error getting upcoming tasks:', error);
			throw error;
		}
	}

	/**
	 * Bulk delete calendar events - optimized version with parallel processing
	 */
	async bulkDeleteCalendarEvents(
		userId: string,
		calendarEvents: BulkDeleteEventParams[],
		options: { batchSize?: number; reason?: string } = {}
	): Promise<BulkDeleteResponse> {
		const { batchSize = 5, reason } = options;
		const warnings: string[] = [];
		const errors: string[] = [];
		let successCount = 0;
		let failCount = 0;

		// Process in batches to avoid overwhelming the API
		for (let i = 0; i < calendarEvents.length; i += batchSize) {
			const batch = calendarEvents.slice(i, i + batchSize);

			// Process batch in parallel
			const batchResults = await Promise.allSettled(
				batch.map(async (event) => {
					try {
						// Delete from Google Calendar
						await this.deleteCalendarEvent(userId, {
							event_id: event.calendar_event_id,
							calendar_id: event.calendar_id || 'primary'
						});

						// Mark as deleted in our database (don't actually delete the record)
						await this.supabase
							.from('task_calendar_events')
							.update({
								sync_status: 'deleted',
								last_synced_at: new Date().toISOString()
							})
							.eq('id', event.id)
							.eq('user_id', userId);

						return { success: true, eventId: event.calendar_event_id };
					} catch (error: any) {
						// Handle 404 errors gracefully - event already deleted
						if (
							error.message?.includes('404') ||
							error.message?.includes('not found')
						) {
							await this.supabase
								.from('task_calendar_events')
								.update({
									sync_status: 'deleted',
									sync_error: 'Event not found in calendar',
									last_synced_at: new Date().toISOString()
								})
								.eq('id', event.id);
							return { success: true, eventId: event.calendar_event_id };
						}
						throw error;
					}
				})
			);

			// Process results
			for (const result of batchResults) {
				if (result.status === 'fulfilled' && result.value.success) {
					successCount++;
				} else if (result.status === 'rejected') {
					failCount++;
					const error = result.reason;

					if (error instanceof GoogleOAuthConnectionError) {
						errors.push(`Connection error: ${error.message}`);
						// Stop processing if connection is lost
						if (failCount > 0) {
							await this.activityLogger.logActivity(userId, 'calendar_bulk_delete', {
								total: calendarEvents.length,
								success: successCount,
								failed: failCount,
								warnings,
								errors,
								reason
							});
						}
						return {
							success: false,
							warnings,
							errors,
							deletedCount: successCount
						};
					} else {
						warnings.push(`Failed to delete event: ${error.message}`);
					}
				}
			}
		}

		// Log activity
		if (successCount > 0 || failCount > 0) {
			await this.activityLogger.logActivity(userId, 'calendar_bulk_delete', {
				total: calendarEvents.length,
				success: successCount,
				failed: failCount,
				warnings,
				errors,
				reason
			});
		}

		// Log deletion reason for analytics if provided
		if (reason && successCount > 0) {
			await this.supabase.from('calendar_sync_logs').insert({
				user_id: userId,
				operation: 'bulk_delete_events',
				reason,
				event_count: successCount,
				created_at: new Date().toISOString()
			});
		}

		return {
			success: failCount === 0,
			warnings,
			errors,
			deletedCount: successCount
		};
	}

	/**
	 * Bulk schedule tasks to calendar
	 */
	async bulkScheduleTasks(
		userId: string,
		tasks: Array<{
			task_id: string;
			start_time: string;
			duration_minutes?: number;
			description?: string;
			timeZone?: string;
		}>,
		options: { batchSize?: number } = {}
	): Promise<{
		success: boolean;
		scheduled: number;
		failed: number;
		results: Array<{ taskId: string; success: boolean; error?: string; eventId?: string }>;
	}> {
		const { batchSize = 5 } = options;
		const results: Array<{
			taskId: string;
			success: boolean;
			error?: string;
			eventId?: string;
		}> = [];
		let scheduledCount = 0;
		let failedCount = 0;

		// Process in batches
		for (let i = 0; i < tasks.length; i += batchSize) {
			const batch = tasks.slice(i, i + batchSize);

			const batchResults = await Promise.allSettled(
				batch.map(async (task) => {
					try {
						const result = await this.scheduleTask(userId, task);
						return {
							taskId: task.task_id,
							success: true,
							eventId: result.event_id
						};
					} catch (error: any) {
						return {
							taskId: task.task_id,
							success: false,
							error: error.message
						};
					}
				})
			);

			// Process results
			for (const result of batchResults) {
				if (result.status === 'fulfilled') {
					results.push(result.value);
					if (result.value.success) {
						scheduledCount++;
					} else {
						failedCount++;
					}
				} else {
					failedCount++;
					results.push({
						taskId: 'unknown',
						success: false,
						error: result.reason?.message || 'Unknown error'
					});
				}
			}

			// Check for connection errors
			if (results.some((r) => r.error?.includes('Connection error'))) {
				break; // Stop processing if connection is lost
			}
		}

		return {
			success: failedCount === 0,
			scheduled: scheduledCount,
			failed: failedCount,
			results
		};
	}

	/**
	 * Bulk update calendar events
	 */
	async bulkUpdateCalendarEvents(
		userId: string,
		updates: Array<{
			event_id: string;
			calendar_id?: string;
			start_time?: string;
			end_time?: string;
			summary?: string;
			description?: string;
			timeZone?: string;
		}>,
		options: { batchSize?: number } = {}
	): Promise<{
		success: boolean;
		updated: number;
		failed: number;
		results: Array<{ eventId: string; success: boolean; error?: string }>;
	}> {
		const { batchSize = 5 } = options;
		const results: Array<{ eventId: string; success: boolean; error?: string }> = [];
		let updatedCount = 0;
		let failedCount = 0;

		// Process in batches
		for (let i = 0; i < updates.length; i += batchSize) {
			const batch = updates.slice(i, i + batchSize);

			const batchResults = await Promise.allSettled(
				batch.map(async (update) => {
					try {
						await this.updateCalendarEvent(userId, update);
						return {
							eventId: update.event_id,
							success: true
						};
					} catch (error: any) {
						return {
							eventId: update.event_id,
							success: false,
							error: error.message
						};
					}
				})
			);

			// Process results
			for (const result of batchResults) {
				if (result.status === 'fulfilled') {
					results.push(result.value);
					if (result.value.success) {
						updatedCount++;
					} else {
						failedCount++;
					}
				} else {
					failedCount++;
					results.push({
						eventId: 'unknown',
						success: false,
						error: result.reason?.message || 'Unknown error'
					});
				}
			}

			// Check for connection errors
			if (results.some((r) => r.error?.includes('Connection error'))) {
				break; // Stop processing if connection is lost
			}
		}

		return {
			success: failedCount === 0,
			updated: updatedCount,
			failed: failedCount,
			results
		};
	}

	/**
	 * Create a new Google Calendar for a project
	 */
	async createProjectCalendar(
		userId: string,
		options: {
			name: string;
			description?: string;
			colorId?: string;
			timeZone?: string;
		}
	): Promise<{ success: boolean; calendarId?: string; error?: string }> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// Get user's timezone if not provided
			const userTimeZone = options.timeZone || 'America/New_York';

			console.log('Creating calendar with options:', {
				summary: options.name,
				description: options.description,
				timeZone: userTimeZone
			});

			// Create the calendar with minimal required fields per Google API docs
			// Only 'summary' is required for calendars.insert
			const requestBody: any = {
				summary: options.name
			};

			// Add optional fields only if provided
			if (options.description) {
				requestBody.description = options.description;
			}
			if (userTimeZone) {
				requestBody.timeZone = userTimeZone;
			}

			console.log('Calendar API request body:', requestBody);

			// Try to create the calendar (may not return properly)
			try {
				await Promise.race([
					calendar.calendars.insert({
						requestBody
					}),
					new Promise((resolve) => setTimeout(resolve, 5000)) // Just wait 5 seconds max
				]);
			} catch (insertError: any) {
				// If it's a real error (not timeout), throw it
				if (insertError?.code && insertError.code !== 'ETIMEDOUT') {
					throw insertError;
				}
				console.log('Calendar insert may have timed out, checking if it was created...');
			}

			// Wait a bit for the calendar to be created and propagated
			console.log('Waiting for calendar to be created...');
			await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

			// Now list all calendars and find the one we just created
			console.log('Fetching calendar list to find the newly created calendar...');
			const calendarList = await this.listUserCalendars(userId);

			if (!calendarList.success || !calendarList.calendars) {
				throw new Error('Failed to retrieve calendar list after creation');
			}

			// Find the calendar with matching summary
			// Get the most recent one if there are duplicates
			const matchingCalendars = calendarList.calendars.filter(
				(cal) => cal.summary === options.name && cal.accessRole === 'owner'
			);

			if (matchingCalendars.length === 0) {
				throw new Error(
					`Calendar creation failed - calendar with summary "${options.name}" not found in list`
				);
			}

			// Use the first matching calendar (most recent if multiple)
			const createdCalendar = matchingCalendars[0];
			console.log('Found created calendar:', createdCalendar);

			const calendarId = createdCalendar.id;
			if (!calendarId) {
				throw new Error('Created calendar found but has no ID');
			}

			// Update the calendar's color in the user's calendar list
			if (options.colorId) {
				try {
					console.log(`Updating calendar color to ${options.colorId}...`);
					await calendar.calendarList.patch({
						calendarId: calendarId,
						requestBody: {
							colorId: options.colorId
						}
					});
					console.log('Calendar color updated successfully');
				} catch (colorError) {
					console.error('Failed to set calendar color:', colorError);
					// Don't fail the whole operation if color setting fails
				}
			}

			// Also update the calendar description if it wasn't set initially
			if (options.description && !createdCalendar.description) {
				try {
					console.log('Updating calendar description...');
					await calendar.calendars.patch({
						calendarId: calendarId,
						requestBody: {
							description: options.description
						}
					});
				} catch (descError) {
					console.error('Failed to update calendar description:', descError);
					// Don't fail the whole operation if description update fails
				}
			}

			console.log(`Successfully created calendar with ID: ${calendarId}`);
			return {
				success: true,
				calendarId: calendarId
			};
		} catch (error: any) {
			console.error('Error creating project calendar:', error);

			// Check for timeout error
			if (error?.message?.includes('timeout')) {
				return {
					success: false,
					error: 'Calendar creation timed out. Please check your Google Calendar connection and try again.'
				};
			}

			// Check for permission errors
			if (error?.code === 403 || error?.status === 403) {
				return {
					success: false,
					error: 'Permission denied. Please reconnect your Google Calendar with the necessary permissions.'
				};
			}

			// Check for authentication errors
			if (error?.code === 401 || error?.status === 401) {
				return {
					success: false,
					error: 'Authentication failed. Please reconnect your Google Calendar.'
				};
			}

			// Handle OAuth connection errors
			if (error instanceof GoogleOAuthConnectionError) {
				await this.handleConnectionFailure(userId, error.message);
				return { success: false, error: 'Connection error: ' + error.message };
			}

			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to create calendar'
			};
		}
	}

	/**
	 * Update properties of an existing Google Calendar
	 */
	async updateCalendarProperties(
		userId: string,
		calendarId: string,
		updates: {
			summary?: string;
			description?: string;
			colorId?: string;
			timeZone?: string;
		}
	): Promise<{ success: boolean; error?: string }> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// Update calendar properties
			if (updates.summary || updates.description || updates.timeZone) {
				const calendarUpdates: any = {};
				if (updates.summary) calendarUpdates.summary = updates.summary;
				if (updates.description) calendarUpdates.description = updates.description;
				if (updates.timeZone) calendarUpdates.timeZone = updates.timeZone;

				await calendar.calendars.patch({
					calendarId: calendarId,
					requestBody: calendarUpdates
				});
			}

			// Update color in calendar list (color is a property of the calendar list, not the calendar itself)
			if (updates.colorId) {
				await calendar.calendarList.patch({
					calendarId: calendarId,
					requestBody: {
						colorId: updates.colorId
					}
				});
			}

			return { success: true };
		} catch (error) {
			console.error('Error updating calendar properties:', error);
			if (error instanceof GoogleOAuthConnectionError) {
				await this.handleConnectionFailure(userId, error.message);
				return { success: false, error: 'Connection error: ' + error.message };
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update calendar'
			};
		}
	}

	/**
	 * Delete a Google Calendar
	 */
	async deleteProjectCalendar(
		userId: string,
		calendarId: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// Delete the calendar
			await calendar.calendars.delete({
				calendarId: calendarId
			});

			return { success: true };
		} catch (error) {
			console.error('Error deleting project calendar:', error);
			if (error instanceof GoogleOAuthConnectionError) {
				await this.handleConnectionFailure(userId, error.message);
				return { success: false, error: 'Connection error: ' + error.message };
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to delete calendar'
			};
		}
	}

	/**
	 * List all calendars for a user
	 */
	async listUserCalendars(userId: string): Promise<{
		success: boolean;
		calendars?: Array<{
			id: string;
			summary: string;
			description?: string;
			colorId?: string;
			primary?: boolean;
			accessRole?: string;
		}>;
		error?: string;
	}> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			const response = await calendar.calendarList.list({
				showHidden: false,
				showDeleted: false
			});

			const calendars =
				response.data.items?.map((cal) => ({
					id: cal.id || '',
					summary: cal.summary || '',
					description: cal.description,
					colorId: cal.colorId,
					primary: cal.primary,
					accessRole: cal.accessRole
				})) || [];

			return {
				success: true,
				calendars
			};
		} catch (error) {
			console.error('Error listing user calendars:', error);
			if (error instanceof GoogleOAuthConnectionError) {
				await this.handleConnectionFailure(userId, error.message);
				return { success: false, error: 'Connection error: ' + error.message };
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to list calendars'
			};
		}
	}

	/**
	 * Share a calendar with other users
	 */
	async shareCalendar(
		userId: string,
		calendarId: string,
		shares: Array<{
			email: string;
			role: 'reader' | 'writer' | 'owner';
		}>
	): Promise<{ success: boolean; error?: string }> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// Add ACL rules for each share
			for (const share of shares) {
				await calendar.acl.insert({
					calendarId: calendarId,
					requestBody: {
						role: share.role,
						scope: {
							type: 'user',
							value: share.email
						}
					}
				});
			}

			return { success: true };
		} catch (error) {
			console.error('Error sharing calendar:', error);
			if (error instanceof GoogleOAuthConnectionError) {
				await this.handleConnectionFailure(userId, error.message);
				return { success: false, error: 'Connection error: ' + error.message };
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to share calendar'
			};
		}
	}

	/**
	 * Remove calendar sharing for specific users
	 */
	async unshareCalendar(
		userId: string,
		calendarId: string,
		emails: string[]
	): Promise<{ success: boolean; error?: string }> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// List all ACL rules
			const aclResponse = await calendar.acl.list({
				calendarId: calendarId
			});

			// Find and delete ACL rules for specified emails
			const rulesToDelete = aclResponse.data.items?.filter(
				(rule) => rule.scope?.type === 'user' && emails.includes(rule.scope.value || '')
			);

			for (const rule of rulesToDelete || []) {
				if (rule.id) {
					await calendar.acl.delete({
						calendarId: calendarId,
						ruleId: rule.id
					});
				}
			}

			return { success: true };
		} catch (error) {
			console.error('Error unsharing calendar:', error);
			if (error instanceof GoogleOAuthConnectionError) {
				await this.handleConnectionFailure(userId, error.message);
				return { success: false, error: 'Connection error: ' + error.message };
			}
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to unshare calendar'
			};
		}
	}
}
