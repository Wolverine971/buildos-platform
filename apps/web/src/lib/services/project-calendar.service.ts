// apps/web/src/lib/services/project-calendar.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { CalendarService } from './calendar-service';
import { ApiResponse } from '$lib/utils/api-response';
import { GOOGLE_CALENDAR_COLORS, type GoogleColorId } from '$lib/config/calendar-colors';

type ProjectCalendar = Database['public']['Tables']['project_calendars']['Row'];
type ProjectCalendarInsert = Database['public']['Tables']['project_calendars']['Insert'];
type ProjectCalendarUpdate = Database['public']['Tables']['project_calendars']['Update'];
type Project = Database['public']['Tables']['onto_projects']['Row'];
type ProjectMember = Database['public']['Tables']['onto_project_members']['Row'];
type ProjectInvite = Database['public']['Tables']['onto_project_invites']['Row'];
type OntoActor = Database['public']['Tables']['onto_actors']['Row'];
type OntoEvent = Database['public']['Tables']['onto_events']['Row'];
type OntoEventSync = Database['public']['Tables']['onto_event_sync']['Row'];
type QueueJob = Database['public']['Tables']['queue_jobs']['Row'];
export type ProjectCalendarSyncMode = 'actor_projection' | 'member_fanout';
const DEFAULT_PROJECT_CALENDAR_SYNC_MODE: ProjectCalendarSyncMode = 'actor_projection';
type ProjectEventSyncAction = 'upsert' | 'delete';
const DEFAULT_SYNC_HEALTH_LIMIT = 20;
const MAX_SYNC_HEALTH_LIMIT = 50;
const ACTIVE_QUEUE_STATUSES = ['pending', 'processing', 'retrying', 'failed'] as const;

export interface ProjectCalendarCollaborationMember {
	actor_id: string;
	user_id: string | null;
	display_name: string;
	email: string | null;
	role_key: string;
	access: string;
	has_calendar: boolean;
	sync_enabled: boolean;
	calendar_name: string | null;
	sync_status: string | null;
	is_current_user: boolean;
}

export interface ProjectCalendarPendingInvite {
	invitee_email: string;
	role_key: string;
	access: string;
	expires_at: string;
}

export interface ProjectCalendarCollaborationSummary {
	sync_mode: ProjectCalendarSyncMode;
	total_members: number;
	mapped_members: number;
	active_sync_members: number;
	pending_invite_count: number;
	pending_invites: ProjectCalendarPendingInvite[];
	members: ProjectCalendarCollaborationMember[];
}

export interface ProjectCalendarSyncHealthTarget {
	user_id: string | null;
	display_name: string;
	email: string | null;
	sync_status: string | null;
	sync_error: string | null;
	last_synced_at: string | null;
	queue_status: string | null;
	queue_attempts: number | null;
	queue_max_attempts: number | null;
	queue_error: string | null;
	retry_action: ProjectEventSyncAction;
	can_retry: boolean;
}

export interface ProjectCalendarSyncHealthEvent {
	event_id: string;
	title: string;
	start_at: string;
	end_at: string | null;
	updated_at: string | null;
	deleted_at: string | null;
	targets: ProjectCalendarSyncHealthTarget[];
}

export interface ProjectCalendarSyncHealthSummary {
	total_events: number;
	total_targets: number;
	failed_targets: number;
	active_queue_targets: number;
}

export interface ProjectCalendarSyncHealthPayload {
	events: ProjectCalendarSyncHealthEvent[];
	summary: ProjectCalendarSyncHealthSummary;
}

export interface CreateProjectCalendarOptions {
	projectId: string;
	userId: string;
	name?: string;
	description?: string;
	colorId?: GoogleColorId;
	timeZone?: string;
	calendarId?: string;
}

export interface UpdateProjectCalendarOptions {
	name?: string;
	description?: string;
	colorId?: GoogleColorId;
	syncEnabled?: boolean;
	syncMode?: ProjectCalendarSyncMode;
}

export class ProjectCalendarService {
	private supabase: SupabaseClient<Database>;
	private calendarService: CalendarService;

	constructor(supabase: SupabaseClient<Database>) {
		this.supabase = supabase;
		this.calendarService = new CalendarService(supabase);
	}

	private parseProjectSyncMode(
		props: Record<string, unknown> | null | undefined
	): ProjectCalendarSyncMode {
		return props?.calendar_sync_mode === 'member_fanout'
			? 'member_fanout'
			: DEFAULT_PROJECT_CALENDAR_SYNC_MODE;
	}

	private parseSyncHealthLimit(rawLimit?: number | null): number {
		if (!rawLimit || Number.isNaN(rawLimit)) return DEFAULT_SYNC_HEALTH_LIMIT;
		return Math.min(Math.max(Math.floor(rawLimit), 1), MAX_SYNC_HEALTH_LIMIT);
	}

	private parseProjectEventSyncAction(rawAction: unknown): ProjectEventSyncAction {
		return rawAction === 'delete' ? 'delete' : 'upsert';
	}

	private parseProjectEventSyncMetadata(value: Json | null): {
		kind: 'onto_project_event_sync';
		eventId: string;
		projectId: string;
		targetUserId: string;
		action: ProjectEventSyncAction;
	} | null {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		const meta = value as Record<string, unknown>;
		if (meta.kind !== 'onto_project_event_sync') return null;
		if (
			typeof meta.eventId !== 'string' ||
			typeof meta.projectId !== 'string' ||
			typeof meta.targetUserId !== 'string'
		) {
			return null;
		}

		return {
			kind: 'onto_project_event_sync',
			eventId: meta.eventId,
			projectId: meta.projectId,
			targetUserId: meta.targetUserId,
			action: this.parseProjectEventSyncAction(meta.action)
		};
	}

	private buildTargetDisplayName(
		userId: string | null,
		currentUserId: string,
		actor: { name: string | null; email: string | null } | undefined
	): string {
		if (userId && userId === currentUserId) {
			return 'You';
		}

		const byName = actor?.name?.trim();
		if (byName) return byName;
		const byEmail = actor?.email?.trim();
		if (byEmail) return byEmail;
		if (userId) return `User ${userId.slice(0, 8)}`;
		return 'Unknown target';
	}

	async getProjectCalendarSyncMode(projectId: string): Promise<ProjectCalendarSyncMode> {
		const { data: project } = await this.supabase
			.from('onto_projects')
			.select('props')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		return this.parseProjectSyncMode(
			(project?.props as Record<string, unknown> | null | undefined) ?? null
		);
	}

	async updateProjectCalendarSyncMode(
		projectId: string,
		syncMode: ProjectCalendarSyncMode
	): Promise<Response> {
		try {
			const { data: project, error: projectError } = await this.supabase
				.from('onto_projects')
				.select('id, props')
				.eq('id', projectId)
				.is('deleted_at', null)
				.single();

			if (projectError || !project) {
				return ApiResponse.error('Project not found', 404);
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
				return ApiResponse.error('Failed to update project calendar sync mode', 500);
			}

			return ApiResponse.success(
				{
					sync_mode: syncMode
				},
				'Project calendar sync mode updated successfully'
			);
		} catch (error) {
			console.error('Error updating project calendar sync mode:', error);
			return ApiResponse.error('Failed to update project calendar sync mode', 500);
		}
	}

	/**
	 * Create a project calendar mapping (new Google calendar or link existing)
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
			const { data: existingCalendar, error: existingCalendarError } = await this.supabase
				.from('project_calendars')
				.select('*')
				.eq('project_id', options.projectId)
				.eq('user_id', options.userId)
				.maybeSingle();

			if (existingCalendarError && existingCalendarError.code !== 'PGRST116') {
				return ApiResponse.error('Failed to check existing project calendar', 500);
			}

			if (existingCalendar) {
				return ApiResponse.error('Calendar already exists for this project', 409);
			}

			const projectProps = (project.props as Record<string, unknown> | null) ?? {};
			const calendarProps = (projectProps.calendar as Record<string, unknown> | null) ?? {};
			const propsColorId = (calendarProps.color_id || projectProps.calendar_color_id) as
				| GoogleColorId
				| undefined;

			// Create calendar defaults with project name
			const calendarName = options.name || `${project.name} - Tasks`;
			const calendarDescription =
				options.description ||
				project.description ||
				`Tasks and events for ${project.name}`;

			let resolvedColorId = options.colorId || propsColorId || '7';
			let mappedGoogleCalendarId: string | null = null;
			let mappedCalendarName = calendarName;
			let createdGoogleCalendarId: string | null = null;

			const requestedCalendarId = options.calendarId?.trim();
			if (requestedCalendarId) {
				const listResult = await this.calendarService.listUserCalendars(options.userId);
				if (!listResult.success || !listResult.calendars) {
					return ApiResponse.error(
						listResult.error || 'Failed to verify selected Google calendar',
						500
					);
				}

				const matchedCalendar = listResult.calendars.find(
					(cal) => cal.id === requestedCalendarId
				);
				if (!matchedCalendar) {
					return ApiResponse.error('Selected Google calendar was not found', 400);
				}

				if (
					matchedCalendar.accessRole === 'reader' ||
					matchedCalendar.accessRole === 'freeBusyReader'
				) {
					return ApiResponse.error(
						'Selected Google calendar is read-only. Choose a writable calendar.',
						400
					);
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
				// Get user's timezone from users table (centralized source of truth)
				const { data: user } = await this.supabase
					.from('users')
					.select('timezone')
					.eq('id', options.userId)
					.single();

				const timeZone = options.timeZone || user?.timezone || 'America/New_York';

				// Create a new Google Calendar
				const createResult = await this.calendarService.createProjectCalendar(
					options.userId,
					{
						name: calendarName,
						description: calendarDescription,
						colorId: resolvedColorId,
						timeZone
					}
				);

				if (!createResult.success || !createResult.calendarId) {
					return ApiResponse.error(
						createResult.error || 'Failed to create Google Calendar',
						500
					);
				}

				mappedGoogleCalendarId = createResult.calendarId;
				createdGoogleCalendarId = createResult.calendarId;
			}

			if (!mappedGoogleCalendarId) {
				return ApiResponse.error('Failed to resolve Google calendar mapping', 500);
			}

			// Store calendar mapping in database
			const projectCalendarData: ProjectCalendarInsert = {
				project_id: options.projectId,
				user_id: options.userId,
				calendar_id: mappedGoogleCalendarId,
				calendar_name: mappedCalendarName,
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
				// Roll back only when this call created a new Google Calendar
				if (createdGoogleCalendarId) {
					await this.calendarService.deleteProjectCalendar(
						options.userId,
						createdGoogleCalendarId
					);
				}
				return ApiResponse.error('Failed to save calendar mapping', 500);
			}

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

			if (!data) {
				return ApiResponse.success(null);
			}

			const syncMode = await this.getProjectCalendarSyncMode(projectId);
			return ApiResponse.success({
				...data,
				sync_mode: syncMode
			});
		} catch (error) {
			console.error('Error fetching project calendar:', error);
			return ApiResponse.error('Failed to fetch project calendar', 500);
		}
	}

	async getProjectCalendarCollaboration(
		projectId: string,
		currentUserId: string
	): Promise<Response> {
		try {
			const [syncMode, memberResponse, calendarResponse, inviteResponse] = await Promise.all([
				this.getProjectCalendarSyncMode(projectId),
				this.supabase
					.from('onto_project_members')
					.select('actor_id, role_key, access')
					.eq('project_id', projectId)
					.is('removed_at', null),
				this.supabase
					.from('project_calendars')
					.select('user_id, calendar_name, sync_enabled, sync_status')
					.eq('project_id', projectId),
				this.supabase
					.from('onto_project_invites')
					.select('invitee_email, role_key, access, expires_at')
					.eq('project_id', projectId)
					.eq('status', 'pending')
					.gte('expires_at', new Date().toISOString())
			]);

			if (memberResponse.error) {
				return ApiResponse.error('Failed to fetch project members', 500);
			}

			if (calendarResponse.error) {
				return ApiResponse.error('Failed to fetch project calendar mappings', 500);
			}

			if (inviteResponse.error) {
				return ApiResponse.error('Failed to fetch pending project invites', 500);
			}

			const members = (memberResponse.data ?? []) as Array<
				Pick<ProjectMember, 'actor_id' | 'role_key' | 'access'>
			>;
			const actorIds = Array.from(
				new Set(members.map((member) => member.actor_id).filter(Boolean))
			);

			let actorsById = new Map<
				string,
				Pick<OntoActor, 'id' | 'user_id' | 'name' | 'email'>
			>();
			if (actorIds.length > 0) {
				const { data: actorRows, error: actorError } = await this.supabase
					.from('onto_actors')
					.select('id, user_id, name, email')
					.in('id', actorIds);

				if (actorError) {
					return ApiResponse.error('Failed to fetch project actor details', 500);
				}

				actorsById = new Map(
					(actorRows ?? []).map((actor) => [
						actor.id,
						{
							id: actor.id,
							user_id: actor.user_id,
							name: actor.name,
							email: actor.email
						}
					])
				);
			}

			const calendarByUserId = new Map<
				string,
				{
					calendar_name: string | null;
					sync_enabled: boolean;
					sync_status: string | null;
				}
			>();
			for (const calendar of calendarResponse.data ?? []) {
				if (!calendar.user_id) continue;
				calendarByUserId.set(calendar.user_id, {
					calendar_name: calendar.calendar_name,
					sync_enabled: calendar.sync_enabled ?? true,
					sync_status: calendar.sync_status
				});
			}

			const collaborationMembers: ProjectCalendarCollaborationMember[] = members.map(
				(member) => {
					const actor = actorsById.get(member.actor_id);
					const userId = actor?.user_id ?? null;
					const mapping = userId ? calendarByUserId.get(userId) : undefined;
					const displayName =
						actor?.name?.trim() ||
						actor?.email?.trim() ||
						(userId === currentUserId ? 'You' : 'Project member');

					return {
						actor_id: member.actor_id,
						user_id: userId,
						display_name: displayName,
						email: actor?.email ?? null,
						role_key: member.role_key,
						access: member.access,
						has_calendar: Boolean(mapping),
						sync_enabled: mapping?.sync_enabled ?? false,
						calendar_name: mapping?.calendar_name ?? null,
						sync_status: mapping?.sync_status ?? null,
						is_current_user: userId === currentUserId
					};
				}
			);

			collaborationMembers.sort((a, b) => {
				if (a.is_current_user && !b.is_current_user) return -1;
				if (!a.is_current_user && b.is_current_user) return 1;
				if (a.has_calendar !== b.has_calendar) return a.has_calendar ? -1 : 1;
				return a.display_name.localeCompare(b.display_name);
			});

			const mappedMembers = collaborationMembers.filter(
				(member) => member.has_calendar
			).length;
			const activeSyncMembers = collaborationMembers.filter(
				(member) => member.has_calendar && member.sync_enabled
			).length;

			const pendingInvitesRaw = (inviteResponse.data ?? []) as Array<
				Pick<ProjectInvite, 'invitee_email' | 'role_key' | 'access' | 'expires_at'>
			>;
			const seenInviteEmails = new Set<string>();
			const pendingInvites: ProjectCalendarPendingInvite[] = [];
			for (const invite of pendingInvitesRaw) {
				const normalizedEmail = invite.invitee_email.trim().toLowerCase();
				if (!normalizedEmail || seenInviteEmails.has(normalizedEmail)) continue;
				seenInviteEmails.add(normalizedEmail);
				pendingInvites.push({
					invitee_email: invite.invitee_email,
					role_key: invite.role_key,
					access: invite.access,
					expires_at: invite.expires_at
				});
			}
			pendingInvites.sort((a, b) => a.invitee_email.localeCompare(b.invitee_email));

			const summary: ProjectCalendarCollaborationSummary = {
				sync_mode: syncMode,
				total_members: collaborationMembers.length,
				mapped_members: mappedMembers,
				active_sync_members: activeSyncMembers,
				pending_invite_count: pendingInvites.length,
				pending_invites: pendingInvites,
				members: collaborationMembers
			};

			return ApiResponse.success(summary);
		} catch (error) {
			console.error('Error fetching project calendar collaboration summary:', error);
			return ApiResponse.error('Failed to fetch project calendar collaboration summary', 500);
		}
	}

	async getProjectEventSyncHealth(
		projectId: string,
		currentUserId: string,
		rawLimit?: number | null
	): Promise<Response> {
		try {
			const limit = this.parseSyncHealthLimit(rawLimit);
			const { data: eventRows, error: eventError } = await this.supabase
				.from('onto_events')
				.select('id, title, start_at, end_at, updated_at, deleted_at')
				.eq('project_id', projectId)
				.order('updated_at', { ascending: false })
				.limit(limit);

			if (eventError) {
				return ApiResponse.error('Failed to fetch project events for sync health', 500);
			}

			const events = (eventRows ?? []) as Array<
				Pick<
					OntoEvent,
					'id' | 'title' | 'start_at' | 'end_at' | 'updated_at' | 'deleted_at'
				>
			>;
			if (events.length === 0) {
				const emptyPayload: ProjectCalendarSyncHealthPayload = {
					events: [],
					summary: {
						total_events: 0,
						total_targets: 0,
						failed_targets: 0,
						active_queue_targets: 0
					}
				};
				return ApiResponse.success(emptyPayload);
			}

			const eventIds = events.map((event) => event.id);
			const [syncRowsResponse, queueRowsResponse] = await Promise.all([
				this.supabase
					.from('onto_event_sync')
					.select('event_id, user_id, sync_status, sync_error, last_synced_at')
					.in('event_id', eventIds)
					.eq('provider', 'google'),
				this.supabase
					.from('queue_jobs')
					.select(
						'id, status, attempts, max_attempts, error_message, metadata, created_at'
					)
					.eq('job_type', 'sync_calendar')
					.in('status', [...ACTIVE_QUEUE_STATUSES])
					.order('created_at', { ascending: false })
					.limit(400)
			]);

			if (syncRowsResponse.error) {
				return ApiResponse.error('Failed to fetch event sync rows', 500);
			}

			if (queueRowsResponse.error) {
				return ApiResponse.error('Failed to fetch sync queue jobs', 500);
			}

			const syncRows = (syncRowsResponse.data ?? []) as Array<
				Pick<
					OntoEventSync,
					'event_id' | 'user_id' | 'sync_status' | 'sync_error' | 'last_synced_at'
				>
			>;
			const queueRows = (queueRowsResponse.data ?? []) as Array<
				Pick<
					QueueJob,
					| 'id'
					| 'status'
					| 'attempts'
					| 'max_attempts'
					| 'error_message'
					| 'metadata'
					| 'created_at'
				>
			>;

			const LEGACY_TARGET_KEY = '__legacy__';
			const toTargetKey = (userId: string | null): string => userId ?? LEGACY_TARGET_KEY;
			const fromTargetKey = (targetKey: string): string | null =>
				targetKey === LEGACY_TARGET_KEY ? null : targetKey;

			const syncByEventTarget = new Map<
				string,
				Pick<
					OntoEventSync,
					'event_id' | 'user_id' | 'sync_status' | 'sync_error' | 'last_synced_at'
				>
			>();
			const targetKeysByEvent = new Map<string, Set<string>>();
			for (const row of syncRows) {
				const eventId = row.event_id;
				const targetKey = toTargetKey(row.user_id);
				syncByEventTarget.set(`${eventId}:${targetKey}`, row);

				let targetSet = targetKeysByEvent.get(eventId);
				if (!targetSet) {
					targetSet = new Set<string>();
					targetKeysByEvent.set(eventId, targetSet);
				}
				targetSet.add(targetKey);
			}

			const latestQueueByEventTarget = new Map<
				string,
				{
					status: string | null;
					attempts: number | null;
					max_attempts: number | null;
					error_message: string | null;
					action: ProjectEventSyncAction;
					created_at: string;
				}
			>();
			for (const job of queueRows) {
				const meta = this.parseProjectEventSyncMetadata(job.metadata);
				if (!meta) continue;
				if (meta.projectId !== projectId) continue;
				if (!eventIds.includes(meta.eventId)) continue;

				const queueKey = `${meta.eventId}:${meta.targetUserId}`;
				const existing = latestQueueByEventTarget.get(queueKey);
				if (!existing || existing.created_at < job.created_at) {
					latestQueueByEventTarget.set(queueKey, {
						status: job.status,
						attempts: job.attempts,
						max_attempts: job.max_attempts,
						error_message: job.error_message,
						action: meta.action,
						created_at: job.created_at
					});
				}

				let targetSet = targetKeysByEvent.get(meta.eventId);
				if (!targetSet) {
					targetSet = new Set<string>();
					targetKeysByEvent.set(meta.eventId, targetSet);
				}
				targetSet.add(meta.targetUserId);
			}

			const targetUserIds = Array.from(
				new Set(
					Array.from(targetKeysByEvent.values()).flatMap((targetSet) =>
						Array.from(targetSet)
							.map((targetKey) => fromTargetKey(targetKey))
							.filter((userId): userId is string => Boolean(userId))
					)
				)
			);

			let actorByUserId = new Map<string, { name: string | null; email: string | null }>();
			if (targetUserIds.length > 0) {
				const { data: actorRows, error: actorError } = await this.supabase
					.from('onto_actors')
					.select('user_id, name, email')
					.in('user_id', targetUserIds)
					.eq('kind', 'human');

				if (actorError) {
					return ApiResponse.error('Failed to resolve sync target identities', 500);
				}

				actorByUserId = new Map(
					(actorRows ?? [])
						.filter((row) => Boolean(row.user_id))
						.map((row) => [
							row.user_id as string,
							{
								name: row.name,
								email: row.email
							}
						])
				);
			}

			let totalTargets = 0;
			let failedTargets = 0;
			let activeQueueTargets = 0;
			const eventItems: ProjectCalendarSyncHealthEvent[] = events.map((event) => {
				const targetSet = targetKeysByEvent.get(event.id) ?? new Set<string>();
				const targets = Array.from(targetSet)
					.map((targetKey) => {
						const userId = fromTargetKey(targetKey);
						const syncRow = syncByEventTarget.get(`${event.id}:${targetKey}`);
						const queueState = userId
							? latestQueueByEventTarget.get(`${event.id}:${userId}`)
							: null;
						const queueStatus = queueState?.status ?? null;
						const syncStatus = syncRow?.sync_status ?? null;
						const retryAction =
							queueState?.action ?? (event.deleted_at ? 'delete' : 'upsert');
						const canRetry =
							Boolean(userId) &&
							(syncStatus === 'failed' || queueStatus === 'failed');

						if (syncStatus === 'failed' || queueStatus === 'failed') {
							failedTargets += 1;
						}
						if (
							queueStatus === 'pending' ||
							queueStatus === 'processing' ||
							queueStatus === 'retrying'
						) {
							activeQueueTargets += 1;
						}
						totalTargets += 1;

						return {
							user_id: userId,
							display_name: this.buildTargetDisplayName(
								userId,
								currentUserId,
								userId ? actorByUserId.get(userId) : undefined
							),
							email: userId ? (actorByUserId.get(userId)?.email ?? null) : null,
							sync_status: syncStatus,
							sync_error: syncRow?.sync_error ?? null,
							last_synced_at: syncRow?.last_synced_at ?? null,
							queue_status: queueStatus,
							queue_attempts: queueState?.attempts ?? null,
							queue_max_attempts: queueState?.max_attempts ?? null,
							queue_error: queueState?.error_message ?? null,
							retry_action: retryAction,
							can_retry: canRetry
						} satisfies ProjectCalendarSyncHealthTarget;
					})
					.sort((a, b) => {
						if (a.user_id === currentUserId && b.user_id !== currentUserId) return -1;
						if (a.user_id !== currentUserId && b.user_id === currentUserId) return 1;
						return a.display_name.localeCompare(b.display_name);
					});

				return {
					event_id: event.id,
					title: event.title,
					start_at: event.start_at,
					end_at: event.end_at,
					updated_at: event.updated_at,
					deleted_at: event.deleted_at,
					targets
				};
			});

			const payload: ProjectCalendarSyncHealthPayload = {
				events: eventItems,
				summary: {
					total_events: eventItems.length,
					total_targets: totalTargets,
					failed_targets: failedTargets,
					active_queue_targets: activeQueueTargets
				}
			};

			return ApiResponse.success(payload);
		} catch (error) {
			console.error('Error fetching project calendar sync health:', error);
			return ApiResponse.error('Failed to fetch project calendar sync health', 500);
		}
	}

	async retryProjectEventSyncTarget(
		projectId: string,
		triggeredByUserId: string,
		input: {
			eventId: string;
			targetUserId: string;
			action?: ProjectEventSyncAction;
		}
	): Promise<Response> {
		try {
			if (!input.eventId || !input.targetUserId) {
				return ApiResponse.badRequest('eventId and targetUserId are required');
			}

			const { data: event, error: eventError } = await this.supabase
				.from('onto_events')
				.select('id, project_id, updated_at, created_at, deleted_at')
				.eq('id', input.eventId)
				.maybeSingle();

			if (eventError) {
				return ApiResponse.error('Failed to load event for retry', 500);
			}

			if (!event || event.project_id !== projectId) {
				return ApiResponse.notFound('Event');
			}

			const { data: targetCalendar, error: targetCalendarError } = await this.supabase
				.from('project_calendars')
				.select('id')
				.eq('project_id', projectId)
				.eq('user_id', input.targetUserId)
				.maybeSingle();

			if (targetCalendarError) {
				return ApiResponse.error('Failed to validate target calendar mapping', 500);
			}

			if (!targetCalendar) {
				return ApiResponse.badRequest(
					'Target user does not have a linked project calendar'
				);
			}

			const action = input.action ?? (event.deleted_at ? 'delete' : 'upsert');
			const eventVersion = event.updated_at ?? event.created_at ?? new Date().toISOString();

			const metadata = {
				kind: 'onto_project_event_sync',
				action,
				eventId: event.id,
				projectId,
				targetUserId: input.targetUserId,
				triggeredByUserId,
				createCalendarIfMissing: false,
				eventUpdatedAt: eventVersion
			};
			const dedupKey = [
				'onto-project-event-sync',
				'manual-retry',
				action,
				event.id,
				input.targetUserId,
				Date.now().toString()
			].join(':');

			const { data: queueJobId, error: enqueueError } = await this.supabase.rpc(
				'add_queue_job',
				{
					p_user_id: input.targetUserId,
					p_job_type: 'sync_calendar',
					p_metadata: metadata as unknown as Json,
					p_priority: 4,
					p_scheduled_for: new Date().toISOString(),
					p_dedup_key: dedupKey
				}
			);

			if (enqueueError || !queueJobId) {
				return ApiResponse.error('Failed to enqueue sync retry', 500);
			}

			return ApiResponse.success({
				queue_job_id: queueJobId,
				event_id: event.id,
				target_user_id: input.targetUserId,
				action
			});
		} catch (error) {
			console.error('Error retrying project calendar sync target:', error);
			return ApiResponse.error('Failed to retry project calendar sync target', 500);
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

			if (updates.syncMode) {
				const syncModeResponse = await this.updateProjectCalendarSyncMode(
					projectId,
					updates.syncMode
				);
				const payload = await syncModeResponse.json().catch(() => null);
				if (!payload?.success) {
					return ApiResponse.error(
						payload?.error || 'Failed to update project calendar sync mode',
						500
					);
				}
			}

			return ApiResponse.success(
				{
					...updatedCalendar,
					sync_mode:
						updates.syncMode ?? (await this.getProjectCalendarSyncMode(projectId))
				},
				'Calendar settings updated successfully'
			);
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
