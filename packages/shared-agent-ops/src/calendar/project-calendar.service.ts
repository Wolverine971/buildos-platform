// packages/shared-agent-ops/src/calendar/project-calendar.service.ts
// Write half of the project-calendar service, shared by web and the worker.
//
// Moved from apps/web/src/lib/services/project-calendar.service.ts. Web shaped
// every outcome as an `ApiResponse` `Response`; that HTTP shaping is web-only,
// so the shared methods return a plain outcome and the web class maps each one
// back to the exact `Response` it produced before.
//
// The source-aware provider work runs through GoogleCalendarProjectResourceService
// (already shared). The legacy singleton-OAuth client stays in apps/web and is
// injected through `LegacyProjectCalendarClient`; the worker never supplies one.
import type { Database } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { GOOGLE_CALENDAR_COLORS, type GoogleColorId } from './calendar-colors';
import type {
	GoogleCalendarProjectResource,
	GoogleCalendarProjectResourceService
} from './google-calendar-project-resource.service';
import type { LegacyProjectCalendarClient } from './legacy-google-calendar.port';
import {
	ProjectCalendarReadService,
	type ProjectCalendarRecord,
	type ProjectCalendarRow,
	type ProjectCalendarSyncMode
} from './project-calendar-read.service';

type ProjectCalendarInsert = Database['public']['Tables']['project_calendars']['Insert'];
type ProjectCalendarUpdate = Database['public']['Tables']['project_calendars']['Update'];

export interface CreateProjectCalendarOptions {
	projectId: string;
	userId: string;
	name?: string;
	description?: string;
	colorId?: GoogleColorId;
	timeZone?: string;
	calendarId?: string;
	calendarSourceId?: string;
	connectionId?: string;
}

export interface UpdateProjectCalendarOptions {
	name?: string;
	description?: string;
	colorId?: GoogleColorId;
	syncEnabled?: boolean;
	syncMode?: ProjectCalendarSyncMode;
}

export type ProjectCalendarResourceGateway = Pick<
	GoogleCalendarProjectResourceService,
	'resolveLinkedSource' | 'createCalendar' | 'updateCalendar' | 'deleteCalendar' | 'shareCalendar'
>;

/**
 * `httpStatus` carries the status the web route already returned; `badRequest`
 * marks the one failure web produced through `ApiResponse.badRequest` (which
 * also stamps an `INVALID_REQUEST` error code) so the shim can reproduce it.
 */
export type ProjectCalendarWriteOutcome<T> =
	| { status: 'ok'; data: T }
	| { status: 'error'; message: string; httpStatus: number; badRequest?: boolean };

export interface ProjectCalendarServiceOptions {
	projectResourceService?: ProjectCalendarResourceGateway;
	legacyCalendar?: LegacyProjectCalendarClient;
}

const LEGACY_CLIENT_UNAVAILABLE =
	'Google Calendar source selection is required for project calendars in this runtime';

export class ProjectCalendarService extends ProjectCalendarReadService {
	protected readonly projectResourceService?: ProjectCalendarResourceGateway;
	protected readonly legacyCalendar?: LegacyProjectCalendarClient;

	constructor(supabase: TypedSupabaseClient, options: ProjectCalendarServiceOptions = {}) {
		super(supabase);
		this.projectResourceService = options.projectResourceService;
		this.legacyCalendar = options.legacyCalendar;
	}

	/** Persist the project-level `calendar_sync_mode` prop. */
	async setProjectCalendarSyncMode(
		projectId: string,
		syncMode: ProjectCalendarSyncMode
	): Promise<ProjectCalendarWriteOutcome<{ sync_mode: ProjectCalendarSyncMode }>> {
		const { data: project, error: projectError } = await this.supabase
			.from('onto_projects')
			.select('id, props')
			.eq('id', projectId)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return { status: 'error', message: 'Project not found', httpStatus: 404 };
		}

		const currentProps = (project.props as Record<string, unknown> | null) ?? {};
		const nextProps = {
			...currentProps,
			calendar_sync_mode: syncMode
		};

		const { error: updateError } = await this.supabase
			.from('onto_projects')
			.update({
				props: nextProps,
				updated_at: new Date().toISOString()
			})
			.eq('id', projectId);

		if (updateError) {
			return {
				status: 'error',
				message: 'Failed to update project calendar sync mode',
				httpStatus: 500
			};
		}

		return { status: 'ok', data: { sync_mode: syncMode } };
	}

	/**
	 * Create a project calendar mapping (new Google calendar or link existing).
	 */
	async createProjectCalendarRecord(
		options: CreateProjectCalendarOptions
	): Promise<ProjectCalendarWriteOutcome<ProjectCalendarRow>> {
		// Get project details (ontology-first)
		const { data: project, error: projectError } = await this.supabase
			.from('onto_projects')
			.select('id, name, description, props')
			.eq('id', options.projectId)
			.single();

		if (projectError || !project) {
			return { status: 'error', message: 'Project not found', httpStatus: 404 };
		}

		// Check if calendar already exists for this project
		const { data: existingCalendar, error: existingCalendarError } = await this.supabase
			.from('project_calendars')
			.select('*')
			.eq('project_id', options.projectId)
			.eq('user_id', options.userId)
			.maybeSingle();

		if (existingCalendarError && existingCalendarError.code !== 'PGRST116') {
			return {
				status: 'error',
				message: 'Failed to check existing project calendar',
				httpStatus: 500
			};
		}

		if (existingCalendar) {
			return {
				status: 'error',
				message: 'Calendar already exists for this project',
				httpStatus: 409
			};
		}

		const projectProps = (project.props as Record<string, unknown> | null) ?? {};
		const calendarProps = (projectProps.calendar as Record<string, unknown> | null) ?? {};
		const propsColorId = (calendarProps.color_id || projectProps.calendar_color_id) as
			| GoogleColorId
			| undefined;

		// Create calendar defaults with project name
		const calendarName = options.name || `${project.name} - Tasks`;
		const calendarDescription =
			options.description || project.description || `Tasks and events for ${project.name}`;

		let resolvedColorId = options.colorId || propsColorId || '7';
		let mappedGoogleCalendarId: string | null = null;
		let mappedCalendarSourceId: string | null = null;
		let mappedCalendarName = calendarName;
		let createdGoogleCalendarId: string | null = null;
		let providerResourceManaged = false;
		let sourceAwareResource: GoogleCalendarProjectResource | null = null;

		const requestedCalendarId = options.calendarId?.trim();
		const requestedCalendarSourceId = options.calendarSourceId?.trim();
		if (this.projectResourceService) {
			if (requestedCalendarId && !requestedCalendarSourceId) {
				return {
					status: 'error',
					message:
						'calendarSourceId is required for source-aware project calendar mapping',
					httpStatus: 400,
					badRequest: true
				};
			}

			if (requestedCalendarSourceId) {
				sourceAwareResource = await this.projectResourceService.resolveLinkedSource(
					options.userId,
					requestedCalendarSourceId
				);
			} else {
				const { data: user } = await this.supabase
					.from('users')
					.select('timezone')
					.eq('id', options.userId)
					.single();
				sourceAwareResource = await this.projectResourceService.createCalendar({
					userId: options.userId,
					connectionId: options.connectionId?.trim() || undefined,
					name: calendarName,
					description: calendarDescription,
					colorId: resolvedColorId,
					timeZone: options.timeZone || user?.timezone || 'America/New_York'
				});
				providerResourceManaged = true;
				createdGoogleCalendarId = sourceAwareResource.providerCalendarId;
			}

			mappedGoogleCalendarId = sourceAwareResource.providerCalendarId;
			mappedCalendarSourceId = sourceAwareResource.calendarSourceId;
			mappedCalendarName = options.name || sourceAwareResource.summary || calendarName;
			if (
				!options.colorId &&
				sourceAwareResource.colorId &&
				sourceAwareResource.colorId in GOOGLE_CALENDAR_COLORS
			) {
				resolvedColorId = sourceAwareResource.colorId as GoogleColorId;
			}
		} else if (requestedCalendarId) {
			const legacy = this.requireLegacyCalendar();
			if (!legacy) {
				return {
					status: 'error',
					message: LEGACY_CLIENT_UNAVAILABLE,
					httpStatus: 500
				};
			}

			const listResult = await legacy.listUserCalendars(options.userId);
			if (!listResult.success || !listResult.calendars) {
				return {
					status: 'error',
					message: listResult.error || 'Failed to verify selected Google calendar',
					httpStatus: 500
				};
			}

			const matchedCalendar = listResult.calendars.find(
				(cal) => cal.id === requestedCalendarId
			);
			if (!matchedCalendar) {
				return {
					status: 'error',
					message: 'Selected Google calendar was not found',
					httpStatus: 400
				};
			}

			if (
				matchedCalendar.accessRole === 'reader' ||
				matchedCalendar.accessRole === 'freeBusyReader'
			) {
				return {
					status: 'error',
					message: 'Selected Google calendar is read-only. Choose a writable calendar.',
					httpStatus: 400
				};
			}

			if (
				!options.colorId &&
				typeof matchedCalendar.colorId === 'string' &&
				matchedCalendar.colorId in GOOGLE_CALENDAR_COLORS
			) {
				resolvedColorId = matchedCalendar.colorId as GoogleColorId;
			}

			mappedGoogleCalendarId = requestedCalendarId;
			mappedCalendarName = options.name || matchedCalendar.summary || calendarName;
		} else {
			const legacy = this.requireLegacyCalendar();
			if (!legacy) {
				return {
					status: 'error',
					message: LEGACY_CLIENT_UNAVAILABLE,
					httpStatus: 500
				};
			}

			// Get user's timezone from users table (centralized source of truth)
			const { data: user } = await this.supabase
				.from('users')
				.select('timezone')
				.eq('id', options.userId)
				.single();

			const timeZone = options.timeZone || user?.timezone || 'America/New_York';

			// Create a new Google Calendar
			const createResult = await legacy.createProjectCalendar(options.userId, {
				name: calendarName,
				description: calendarDescription,
				colorId: resolvedColorId,
				timeZone
			});

			if (!createResult.success || !createResult.calendarId) {
				return {
					status: 'error',
					message: createResult.error || 'Failed to create Google Calendar',
					httpStatus: 500
				};
			}

			mappedGoogleCalendarId = createResult.calendarId;
			createdGoogleCalendarId = createResult.calendarId;
		}

		if (!mappedGoogleCalendarId) {
			return {
				status: 'error',
				message: 'Failed to resolve Google calendar mapping',
				httpStatus: 500
			};
		}

		// Store calendar mapping in database
		const projectCalendarData: ProjectCalendarInsert = {
			project_id: options.projectId,
			user_id: options.userId,
			calendar_id: mappedGoogleCalendarId,
			calendar_source_id: mappedCalendarSourceId,
			calendar_name: mappedCalendarName,
			color_id: resolvedColorId,
			hex_color: GOOGLE_CALENDAR_COLORS[resolvedColorId as GoogleColorId].hex,
			is_primary: false,
			sync_enabled: true,
			visibility: 'private',
			sync_status: 'active',
			provider_resource_managed: providerResourceManaged
		};

		const { data: projectCalendar, error: insertError } = await this.supabase
			.from('project_calendars')
			.insert(projectCalendarData)
			.select()
			.single();

		if (insertError || !projectCalendar) {
			// Roll back only when this call created a new Google Calendar
			if (createdGoogleCalendarId && mappedCalendarSourceId && this.projectResourceService) {
				await this.projectResourceService.deleteCalendar({
					userId: options.userId,
					calendarSourceId: mappedCalendarSourceId
				});
			} else if (createdGoogleCalendarId && this.legacyCalendar) {
				await this.legacyCalendar.deleteProjectCalendar(
					options.userId,
					createdGoogleCalendarId
				);
			}
			return { status: 'error', message: 'Failed to save calendar mapping', httpStatus: 500 };
		}

		return { status: 'ok', data: projectCalendar as ProjectCalendarRow };
	}

	async updateProjectCalendarRecord(
		projectId: string,
		userId: string,
		updates: UpdateProjectCalendarOptions
	): Promise<ProjectCalendarWriteOutcome<ProjectCalendarRecord>> {
		// Get existing calendar
		const { data: existingCalendar, error: fetchError } = await this.supabase
			.from('project_calendars')
			.select('*')
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.single();

		if (fetchError || !existingCalendar) {
			return { status: 'error', message: 'Project calendar not found', httpStatus: 404 };
		}

		// Update Google Calendar properties if needed
		if (updates.name || updates.description || updates.colorId) {
			if (this.projectResourceService) {
				if (!existingCalendar.calendar_source_id) {
					return {
						status: 'error',
						message:
							'Project calendar source is unavailable. Re-link the calendar before updating it.',
						httpStatus: 409
					};
				}
				await this.projectResourceService.updateCalendar({
					userId,
					calendarSourceId: existingCalendar.calendar_source_id,
					providerResourceManaged: existingCalendar.provider_resource_managed,
					name: updates.name,
					description: updates.description,
					colorId: updates.colorId
				});
			} else {
				const legacy = this.requireLegacyCalendar();
				if (!legacy) {
					return {
						status: 'error',
						message: LEGACY_CLIENT_UNAVAILABLE,
						httpStatus: 500
					};
				}

				const updateResult = await legacy.updateCalendarProperties(
					userId,
					existingCalendar.calendar_id,
					{
						summary: updates.name,
						description: updates.description,
						colorId: updates.colorId
					}
				);

				if (!updateResult.success) {
					return {
						status: 'error',
						message: updateResult.error || 'Failed to update Google Calendar',
						httpStatus: 500
					};
				}
			}
		}

		// Update database record
		const dbUpdates: ProjectCalendarUpdate = {
			updated_at: new Date().toISOString()
		};

		if (updates.name) dbUpdates.calendar_name = updates.name;
		if (updates.colorId) {
			dbUpdates.color_id = updates.colorId;
			dbUpdates.hex_color = GOOGLE_CALENDAR_COLORS[updates.colorId].hex;
		}
		if (updates.syncEnabled !== undefined) dbUpdates.sync_enabled = updates.syncEnabled;

		const { data: updatedCalendar, error: updateError } = await this.supabase
			.from('project_calendars')
			.update(dbUpdates)
			.eq('id', existingCalendar.id)
			.select()
			.single();

		if (updateError || !updatedCalendar) {
			return {
				status: 'error',
				message: 'Failed to update calendar settings',
				httpStatus: 500
			};
		}

		if (updates.syncMode) {
			const syncModeOutcome = await this.setProjectCalendarSyncMode(
				projectId,
				updates.syncMode
			);
			if (syncModeOutcome.status === 'error') {
				return {
					status: 'error',
					message:
						syncModeOutcome.message || 'Failed to update project calendar sync mode',
					httpStatus: 500
				};
			}
		}

		return {
			status: 'ok',
			data: {
				...(updatedCalendar as ProjectCalendarRow),
				sync_mode: updates.syncMode ?? (await this.getProjectCalendarSyncMode(projectId))
			}
		};
	}

	/**
	 * Get or create a project calendar. Returns the stored row rather than an
	 * HTTP response so the shared event write path can consume it directly.
	 */
	async ensureProjectCalendarRecord(
		projectId: string,
		userId: string,
		createOptions?: Partial<CreateProjectCalendarOptions>
	): Promise<ProjectCalendarRow | null> {
		const existing = await this.readProjectCalendar(projectId, userId);
		if (existing.status === 'ok' && existing.calendar) {
			return existing.calendar;
		}

		const created = await this.createProjectCalendarRecord({
			projectId,
			userId,
			...createOptions
		});

		return created.status === 'ok' ? created.data : null;
	}

	private requireLegacyCalendar(): LegacyProjectCalendarClient | null {
		return this.legacyCalendar ?? null;
	}
}
