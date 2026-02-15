// apps/web/src/lib/services/project-calendar.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { CalendarService } from './calendar-service';
import { ApiResponse } from '$lib/utils/api-response';
import { GOOGLE_CALENDAR_COLORS, type GoogleColorId } from '$lib/config/calendar-colors';

type ProjectCalendar = Database['public']['Tables']['project_calendars']['Row'];
type ProjectCalendarInsert = Database['public']['Tables']['project_calendars']['Insert'];
type ProjectCalendarUpdate = Database['public']['Tables']['project_calendars']['Update'];
type Project = Database['public']['Tables']['onto_projects']['Row'];

export interface CreateProjectCalendarOptions {
	projectId: string;
	userId: string;
	name?: string;
	description?: string;
	colorId?: GoogleColorId;
	timeZone?: string;
}

export interface UpdateProjectCalendarOptions {
	name?: string;
	description?: string;
	colorId?: GoogleColorId;
	syncEnabled?: boolean;
}

export class ProjectCalendarService {
	private supabase: SupabaseClient<Database>;
	private calendarService: CalendarService;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.calendarService = new CalendarService(supabase);
	}

	/**
	 * Create a new Google Calendar for a project
	 */
	async createProjectCalendar(options: CreateProjectCalendarOptions): Promise<Response> {
		try {
			// Get project details (ontology-first)
			const { data: project, error: projectError } = await this.supabase
				.from('onto_projects')
				.select('id, name, description, props')
				.eq('id', options.projectId)
				.single();

			if (projectError || !project) {
				return ApiResponse.error('Project not found', 404);
			}

			// Check if calendar already exists for this project
			const { data: existingCalendar } = await this.supabase
				.from('project_calendars')
				.select('*')
				.eq('project_id', options.projectId)
				.eq('user_id', options.userId)
				.single();

			if (existingCalendar) {
				return ApiResponse.error('Calendar already exists for this project', 409);
			}

			const projectProps = (project.props as Record<string, unknown> | null) ?? {};
			const calendarProps = (projectProps.calendar as Record<string, unknown> | null) ?? {};
			const propsColorId = (calendarProps.color_id || projectProps.calendar_color_id) as
				| GoogleColorId
				| undefined;

			// Create calendar name with project name
			const calendarName = options.name || `${project.name} - Tasks`;
			const calendarDescription =
				options.description ||
				project.description ||
				`Tasks and events for ${project.name}`;

			// Get user's timezone from users table (centralized source of truth)
			const { data: user } = await this.supabase
				.from('users')
				.select('timezone')
				.eq('id', options.userId)
				.single();

			const timeZone = options.timeZone || user?.timezone || 'America/New_York';

			const resolvedColorId = options.colorId || propsColorId || '7';

			// Create the Google Calendar
			const createResult = await this.calendarService.createProjectCalendar(options.userId, {
				name: calendarName,
				description: calendarDescription,
				colorId: resolvedColorId,
				timeZone
			});

			if (!createResult.success || !createResult.calendarId) {
				return ApiResponse.error(
					createResult.error || 'Failed to create Google Calendar',
					500
				);
			}

			// Store calendar mapping in database
			const projectCalendarData: ProjectCalendarInsert = {
				project_id: options.projectId,
				user_id: options.userId,
				calendar_id: createResult.calendarId,
				calendar_name: calendarName,
				color_id: resolvedColorId,
				hex_color: GOOGLE_CALENDAR_COLORS[resolvedColorId as GoogleColorId].hex,
				is_primary: false,
				sync_enabled: true,
				visibility: 'private',
				sync_status: 'active'
			};

			const { data: projectCalendar, error: insertError } = await this.supabase
				.from('project_calendars')
				.insert(projectCalendarData)
				.select()
				.single();

			if (insertError || !projectCalendar) {
				// Try to delete the Google Calendar if database insert failed
				await this.calendarService.deleteProjectCalendar(
					options.userId,
					createResult.calendarId
				);
				return ApiResponse.error('Failed to save calendar mapping', 500);
			}

			// Store calendar metadata on project props for UI hints
			const nextProps = {
				...projectProps,
				calendar: {
					...calendarProps,
					color_id: resolvedColorId,
					sync_enabled: true
				}
			};

			await this.supabase
				.from('onto_projects')
				.update({
					props: nextProps,
					updated_at: new Date().toISOString()
				})
				.eq('id', options.projectId);

			return ApiResponse.success(projectCalendar, 'Project calendar created successfully');
		} catch (error) {
			console.error('Error creating project calendar:', error);
			return ApiResponse.error('Failed to create project calendar', 500);
		}
	}

	/**
	 * Get project calendar for a specific project
	 */
	async getProjectCalendar(projectId: string, userId: string): Promise<Response> {
		try {
			const { data, error } = await this.supabase
				.from('project_calendars')
				.select('*')
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.single();

			if (error && error.code !== 'PGRST116') {
				// PGRST116 is "no rows returned"
				return ApiResponse.error('Failed to fetch project calendar', 500);
			}

			return ApiResponse.success(data);
		} catch (error) {
			console.error('Error fetching project calendar:', error);
			return ApiResponse.error('Failed to fetch project calendar', 500);
		}
	}

	/**
	 * Update project calendar settings
	 */
	async updateProjectCalendar(
		projectId: string,
		userId: string,
		updates: UpdateProjectCalendarOptions
	): Promise<Response> {
		try {
			// Get existing calendar
			const { data: existingCalendar, error: fetchError } = await this.supabase
				.from('project_calendars')
				.select('*')
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.single();

			if (fetchError || !existingCalendar) {
				return ApiResponse.error('Project calendar not found', 404);
			}

			// Update Google Calendar properties if needed
			if (updates.name || updates.description || updates.colorId) {
				const updateResult = await this.calendarService.updateCalendarProperties(
					userId,
					existingCalendar.calendar_id,
					{
						summary: updates.name,
						description: updates.description,
						colorId: updates.colorId
					}
				);

				if (!updateResult.success) {
					return ApiResponse.error(
						updateResult.error || 'Failed to update Google Calendar',
						500
					);
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
				return ApiResponse.error('Failed to update calendar settings', 500);
			}

			// Update project props if calendar settings changed
			if (updates.colorId || updates.syncEnabled !== undefined) {
				const projectResult = await this.supabase
					.from('onto_projects')
					.select('props')
					.eq('id', projectId)
					.single();

				if (!projectResult.error && projectResult.data) {
					const projectProps =
						(projectResult.data.props as Record<string, unknown> | null) ?? {};
					const calendarProps =
						(projectProps.calendar as Record<string, unknown> | null) ?? {};

					const nextProps = {
						...projectProps,
						calendar: {
							...calendarProps,
							...(updates.colorId ? { color_id: updates.colorId } : {}),
							...(updates.syncEnabled !== undefined
								? { sync_enabled: updates.syncEnabled }
								: {})
						}
					};

					await this.supabase
						.from('onto_projects')
						.update({
							props: nextProps,
							updated_at: new Date().toISOString()
						})
						.eq('id', projectId);
				}
			}

			return ApiResponse.success(updatedCalendar, 'Calendar settings updated successfully');
		} catch (error) {
			console.error('Error updating project calendar:', error);
			return ApiResponse.error('Failed to update project calendar', 500);
		}
	}

	/**
	 * Delete project calendar (removes from Google and database)
	 */
	async deleteProjectCalendar(projectId: string, userId: string): Promise<Response> {
		try {
			// Get existing calendar
			const { data: existingCalendar, error: fetchError } = await this.supabase
				.from('project_calendars')
				.select('*')
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.single();

			if (fetchError || !existingCalendar) {
				return ApiResponse.error('Project calendar not found', 404);
			}

			// Delete from Google Calendar
			const deleteResult = await this.calendarService.deleteProjectCalendar(
				userId,
				existingCalendar.calendar_id
			);

			if (!deleteResult.success) {
				return ApiResponse.error(
					deleteResult.error || 'Failed to delete Google Calendar',
					500
				);
			}

			// Delete from database
			const { error: deleteError } = await this.supabase
				.from('project_calendars')
				.delete()
				.eq('id', existingCalendar.id);

			if (deleteError) {
				return ApiResponse.error('Failed to delete calendar mapping', 500);
			}

			// Update project props to disable calendar sync
			const projectResult = await this.supabase
				.from('onto_projects')
				.select('props')
				.eq('id', projectId)
				.single();

			if (!projectResult.error && projectResult.data) {
				const projectProps =
					(projectResult.data.props as Record<string, unknown> | null) ?? {};
				const calendarProps =
					(projectProps.calendar as Record<string, unknown> | null) ?? {};
				const nextProps = {
					...projectProps,
					calendar: { ...calendarProps, sync_enabled: false }
				};

				await this.supabase
					.from('onto_projects')
					.update({
						props: nextProps,
						updated_at: new Date().toISOString()
					})
					.eq('id', projectId);
			}

			return ApiResponse.success(undefined, 'Project calendar deleted successfully');
		} catch (error) {
			console.error('Error deleting project calendar:', error);
			return ApiResponse.error('Failed to delete project calendar', 500);
		}
	}

	/**
	 * List all project calendars for a user
	 */
	async listUserProjectCalendars(userId: string): Promise<Response> {
		try {
			const { data, error } = await this.supabase
				.from('project_calendars')
				.select(
					`
					*,
					project:onto_projects!project_calendars_project_id_fkey(*)
				`
				)
				.eq('user_id', userId)
				.order('created_at', { ascending: false });

			if (error) {
				return ApiResponse.error('Failed to fetch project calendars', 500);
			}

			// Type assertion since Supabase doesn't properly type the joined data
			const calendarsWithProjects = (data || []) as unknown as (ProjectCalendar & {
				project: Project;
			})[];

			return ApiResponse.success(calendarsWithProjects);
		} catch (error) {
			console.error('Error listing project calendars:', error);
			return ApiResponse.error('Failed to list project calendars', 500);
		}
	}

	/**
	 * Sync all tasks from a project to its calendar
	 */
	async syncProjectToCalendar(projectId: string, userId: string): Promise<Response> {
		try {
			// Get project calendar
			const calendarResponse = await this.getProjectCalendar(projectId, userId);
			const calendarResult = await calendarResponse.json();
			if (!calendarResult.success || !calendarResult.data) {
				return ApiResponse.error('Project calendar not found', 404);
			}

			const projectCalendar = calendarResult.data;

			// Get all tasks for the project
			const { data: tasks, error: tasksError } = await this.supabase
				.from('onto_tasks')
				.select('*')
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.not('start_at', 'is', null)
				.order('start_at', { ascending: true });

			if (tasksError) {
				return ApiResponse.error('Failed to fetch project tasks', 500);
			}

			const total = tasks?.length ?? 0;
			const calendarId = projectCalendar.calendar_id;

			if (total === 0) {
				await this.supabase
					.from('project_calendars')
					.update({
						last_synced_at: new Date().toISOString(),
						sync_status: 'active'
					})
					.eq('id', projectCalendar.id);

				return ApiResponse.success(
					{
						synced: 0,
						failed: 0,
						total: 0,
						calendarId
					},
					'No scheduled tasks to sync'
				);
			}

			// Schedule each task to the project calendar
			const results = [];
			for (const task of tasks || []) {
				const taskProps = (task.props as Record<string, unknown> | null) ?? {};
				const durationMinutes =
					typeof taskProps.duration_minutes === 'number'
						? taskProps.duration_minutes
						: 60;
				const taskDescription =
					task.description ||
					(typeof taskProps.details === 'string' ? taskProps.details : undefined);

				const result = await this.calendarService.scheduleTask(userId, {
					task_id: task.id,
					start_time: task.start_at!,
					duration_minutes: durationMinutes,
					calendar_id: calendarId,
					description: taskDescription
					// Don't set color_id - let events inherit the calendar's default color
				});
				results.push(result);
			}

			// Update last synced timestamp
			await this.supabase
				.from('project_calendars')
				.update({
					last_synced_at: new Date().toISOString(),
					sync_status: 'active'
				})
				.eq('id', projectCalendar.id);

			const failedCount = results.filter((r) => !r.success).length;
			const syncedCount = results.length - failedCount;
			const responseData = {
				synced: syncedCount,
				failed: failedCount,
				total: results.length,
				calendarId
			};

			if (failedCount === results.length) {
				return ApiResponse.error('Failed to sync any tasks', 500, undefined, responseData);
			}

			const message =
				failedCount > 0
					? `Synced ${syncedCount} of ${results.length} tasks`
					: `Successfully synced ${results.length} tasks`;

			return ApiResponse.success(responseData, message);
		} catch (error) {
			console.error('Error syncing project to calendar:', error);
			return ApiResponse.error('Failed to sync project to calendar', 500);
		}
	}

	/**
	 * Get or create a project calendar
	 */
	async ensureProjectCalendar(
		projectId: string,
		userId: string,
		createOptions?: Partial<CreateProjectCalendarOptions>
	): Promise<Response> {
		// Check if calendar exists
		const existingResponse = await this.getProjectCalendar(projectId, userId);
		const existingResult = await existingResponse.json();
		if (existingResult.success && existingResult.data) {
			return ApiResponse.success(existingResult.data);
		}

		// Create new calendar
		return this.createProjectCalendar({
			projectId,
			userId,
			...createOptions
		});
	}

	/**
	 * Share project calendar with team members
	 */
	async shareProjectCalendar(
		projectId: string,
		userId: string,
		shares: Array<{ email: string; role: 'reader' | 'writer' | 'owner' }>
	): Promise<Response> {
		try {
			// Get project calendar
			const { data: projectCalendar, error } = await this.supabase
				.from('project_calendars')
				.select('*')
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.single();

			if (error || !projectCalendar) {
				return ApiResponse.error('Project calendar not found', 404);
			}

			// Share via Google Calendar API
			const shareResult = await this.calendarService.shareCalendar(
				userId,
				projectCalendar.calendar_id,
				shares
			);

			if (!shareResult.success) {
				return ApiResponse.error(shareResult.error || 'Failed to share calendar', 500);
			}

			// Update visibility if sharing
			if (shares.length > 0) {
				await this.supabase
					.from('project_calendars')
					.update({
						visibility: 'shared',
						updated_at: new Date().toISOString()
					})
					.eq('id', projectCalendar.id);
			}

			return ApiResponse.success(undefined, 'Calendar shared successfully');
		} catch (error) {
			console.error('Error sharing project calendar:', error);
			return ApiResponse.error('Failed to share project calendar', 500);
		}
	}
}
