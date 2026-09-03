// packages/shared-agent-ops/src/calendar/google-calendar-target.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { GoogleCalendarTarget } from '@buildos/shared-types';
import { GoogleCalendarSourceService } from './google-calendar-source.service';
import type { GoogleCalendarAccessRole } from '@buildos/shared-types';

type CalendarDatabaseClient = TypedSupabaseClient & {
	from(table: string): any;
};

export type CalendarTargetCapability = 'read' | 'availability' | 'analysis' | 'write' | 'sync';

export type CalendarTarget = GoogleCalendarTarget & {
	accountLabel: string;
	sourceSummary: string;
	isPrimary: boolean;
	connectionConnectedAt: string;
	sourceCreatedAt: string;
};

export type CalendarProjectTarget = CalendarTarget & {
	projectCalendarId: string;
};

export type CalendarEventTarget = CalendarTarget & {
	externalEventId: string;
	ontoEventSyncId: string;
	projectCalendarId: string | null;
};

export type CalendarExternalEventTarget = CalendarTarget & {
	externalEventId: string;
};

type SourceRow = {
	id: string;
	user_id: string;
	connection_id: string;
	provider_calendar_id: string;
	summary: string;
	access_role: GoogleCalendarAccessRole;
	is_primary: boolean;
	read_enabled: boolean;
	availability_enabled: boolean;
	analysis_enabled: boolean;
	sync_enabled: boolean;
	provider_deleted_at: string | null;
	created_at: string;
	deleted_at: string | null;
};

type ConnectionRow = {
	id: string;
	user_id: string;
	account_label: string;
	status: string;
	connected_at: string;
	deleted_at: string | null;
};

type ActiveSource = {
	source: SourceRow;
	connection: ConnectionRow;
};

const WRITABLE_ROLES = new Set<GoogleCalendarAccessRole>([
	'writerWithoutPrivateAccess',
	'writer',
	'owner'
]);

export class GoogleCalendarTargetError extends Error {
	constructor(
		public readonly code:
			| 'CALENDAR_SOURCE_REQUIRED'
			| 'CALENDAR_SOURCE_NOT_FOUND'
			| 'CALENDAR_SOURCE_NOT_CAPABLE'
			| 'CALENDAR_SOURCE_AMBIGUOUS'
			| 'CALENDAR_PROJECT_SOURCE_REQUIRED'
			| 'CALENDAR_EVENT_SOURCE_REQUIRED'
			| 'CALENDAR_MAPPING_NOT_FOUND',
		message: string
	) {
		super(message);
		this.name = 'GoogleCalendarTargetError';
	}
}

function capabilityEnabled(source: SourceRow, capability: CalendarTargetCapability): boolean {
	switch (capability) {
		case 'read':
			return source.read_enabled && source.access_role !== 'freeBusyReader';
		case 'availability':
			return source.availability_enabled;
		case 'analysis':
			return source.analysis_enabled && source.access_role !== 'freeBusyReader';
		case 'write':
			return WRITABLE_ROLES.has(source.access_role);
		case 'sync':
			return source.sync_enabled && WRITABLE_ROLES.has(source.access_role);
	}
}

export class GoogleCalendarTargetService {
	private readonly admin: CalendarDatabaseClient;
	private readonly connectionService: Pick<
		GoogleCalendarSourceService,
		'reconcileDefaultWriteSource'
	>;

	constructor(
		admin: TypedSupabaseClient | CalendarDatabaseClient,
		options: {
			connectionService?: Pick<GoogleCalendarSourceService, 'reconcileDefaultWriteSource'>;
		} = {}
	) {
		this.admin = admin as CalendarDatabaseClient;
		this.connectionService =
			options.connectionService ?? new GoogleCalendarSourceService(admin);
	}

	private async listActiveSources(userId: string): Promise<ActiveSource[]> {
		const { data: sourceData, error: sourceError } = await this.admin
			.from('user_calendar_sources')
			.select(
				'id, user_id, connection_id, provider_calendar_id, summary, access_role, is_primary, read_enabled, availability_enabled, analysis_enabled, sync_enabled, provider_deleted_at, created_at, deleted_at'
			)
			.eq('user_id', userId)
			.is('provider_deleted_at', null)
			.is('deleted_at', null);
		if (sourceError) throw sourceError;

		const sources = (sourceData ?? []) as SourceRow[];
		const connectionIds = Array.from(new Set(sources.map((source) => source.connection_id)));
		if (connectionIds.length === 0) return [];

		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_calendar_connections')
			.select('id, user_id, account_label, status, connected_at, deleted_at')
			.eq('user_id', userId)
			.eq('provider', 'google_calendar')
			.eq('status', 'active')
			.in('id', connectionIds)
			.is('deleted_at', null);
		if (connectionError) throw connectionError;

		const connections = new Map(
			((connectionData ?? []) as ConnectionRow[]).map((connection) => [
				connection.id,
				connection
			])
		);
		return sources
			.flatMap((source) => {
				const connection = connections.get(source.connection_id);
				return connection ? [{ source, connection }] : [];
			})
			.sort((left, right) => {
				const connectedDifference = left.connection.connected_at.localeCompare(
					right.connection.connected_at
				);
				if (connectedDifference !== 0) return connectedDifference;
				const sourceDifference = left.source.created_at.localeCompare(
					right.source.created_at
				);
				return sourceDifference !== 0
					? sourceDifference
					: left.source.id.localeCompare(right.source.id);
			});
	}

	private toTarget(active: ActiveSource): CalendarTarget {
		return {
			userId: active.source.user_id,
			connectionId: active.connection.id,
			calendarSourceId: active.source.id,
			providerCalendarId: active.source.provider_calendar_id,
			accessRole: active.source.access_role,
			accountLabel: active.connection.account_label,
			sourceSummary: active.source.summary,
			isPrimary: active.source.is_primary,
			connectionConnectedAt: active.connection.connected_at,
			sourceCreatedAt: active.source.created_at
		};
	}

	private requireCapability(
		active: ActiveSource,
		capability: CalendarTargetCapability
	): CalendarTarget {
		if (!capabilityEnabled(active.source, capability)) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_SOURCE_NOT_CAPABLE',
				`Google Calendar source cannot be used for ${capability}`
			);
		}
		return this.toTarget(active);
	}

	async listTargets(
		userId: string,
		capability: CalendarTargetCapability
	): Promise<CalendarTarget[]> {
		return (await this.listActiveSources(userId))
			.filter(({ source }) => capabilityEnabled(source, capability))
			.map((active) => this.toTarget(active));
	}

	listEnabledReadTargets(userId: string): Promise<CalendarTarget[]> {
		return this.listTargets(userId, 'read');
	}

	listAvailabilityTargets(userId: string): Promise<CalendarTarget[]> {
		return this.listTargets(userId, 'availability');
	}

	listAnalysisTargets(userId: string): Promise<CalendarTarget[]> {
		return this.listTargets(userId, 'analysis');
	}

	async hasActiveTarget(userId: string, capability: CalendarTargetCapability): Promise<boolean> {
		return (await this.listTargets(userId, capability)).length > 0;
	}

	async resolveExplicitSource(
		userId: string,
		calendarSourceId: string,
		capability: CalendarTargetCapability
	): Promise<CalendarTarget> {
		const active = (await this.listActiveSources(userId)).find(
			({ source }) => source.id === calendarSourceId
		);
		if (!active) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_SOURCE_NOT_FOUND',
				'Google Calendar source was not found'
			);
		}
		return this.requireCapability(active, capability);
	}

	async resolveDefaultWriteTarget(userId: string): Promise<CalendarTarget> {
		const sourceId = await this.connectionService.reconcileDefaultWriteSource(userId);
		if (!sourceId) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_SOURCE_REQUIRED',
				'Choose a writable Google Calendar before creating events'
			);
		}
		return this.resolveExplicitSource(userId, sourceId, 'write');
	}

	reconcileDefaultWriteSourceId(userId: string): Promise<string | null> {
		return this.connectionService.reconcileDefaultWriteSource(userId);
	}

	async resolveLegacyCalendarId(
		userId: string,
		providerCalendarId: string,
		capability: CalendarTargetCapability
	): Promise<CalendarTarget> {
		if (providerCalendarId === 'primary') {
			const defaultTarget = await this.resolveDefaultWriteTarget(userId);
			if (capability === 'write') return defaultTarget;
			return this.resolveExplicitSource(userId, defaultTarget.calendarSourceId, capability);
		}

		const matches = (await this.listActiveSources(userId)).filter(
			({ source }) => source.provider_calendar_id === providerCalendarId
		);
		if (matches.length === 0) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_SOURCE_NOT_FOUND',
				'No connected Google account exposes that calendar'
			);
		}
		if (matches.length > 1) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_SOURCE_AMBIGUOUS',
				'That calendar is visible through multiple Google accounts; choose a calendar source'
			);
		}
		return this.requireCapability(matches[0]!, capability);
	}

	async resolveProjectTarget(
		userId: string,
		projectId: string,
		capability: CalendarTargetCapability
	): Promise<CalendarProjectTarget> {
		const { data, error } = await this.admin
			.from('project_calendars')
			.select('id, calendar_source_id, calendar_id')
			.eq('user_id', userId)
			.eq('project_id', projectId)
			.maybeSingle();
		if (error || !data) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_PROJECT_SOURCE_REQUIRED',
				'This project does not have a Google Calendar source'
			);
		}

		const target = data.calendar_source_id
			? await this.resolveExplicitSource(userId, data.calendar_source_id, capability)
			: await this.resolveLegacyCalendarId(userId, data.calendar_id, capability);
		return { ...target, projectCalendarId: data.id };
	}

	async resolveEventTarget(
		userId: string,
		ontoEventId: string,
		capability: CalendarTargetCapability = 'write'
	): Promise<CalendarEventTarget> {
		const { data, error } = await this.admin
			.from('onto_event_sync')
			.select(
				'id, calendar_source_id, project_calendar_id, external_calendar_id, external_event_id'
			)
			.eq('user_id', userId)
			.eq('event_id', ontoEventId)
			.eq('provider', 'google')
			.maybeSingle();
		if (error || !data) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_MAPPING_NOT_FOUND',
				'Google Calendar event mapping was not found'
			);
		}

		let target: CalendarTarget | null = null;
		if (data.calendar_source_id) {
			target = await this.resolveExplicitSource(userId, data.calendar_source_id, capability);
		} else if (data.project_calendar_id) {
			const { data: projectCalendar } = await this.admin
				.from('project_calendars')
				.select('calendar_source_id, calendar_id')
				.eq('id', data.project_calendar_id)
				.eq('user_id', userId)
				.maybeSingle();
			if (projectCalendar?.calendar_source_id) {
				target = await this.resolveExplicitSource(
					userId,
					projectCalendar.calendar_source_id,
					capability
				);
			} else if (projectCalendar?.calendar_id) {
				target = await this.resolveLegacyCalendarId(
					userId,
					projectCalendar.calendar_id,
					capability
				);
			}
		} else if (data.external_calendar_id) {
			target = await this.resolveLegacyCalendarId(
				userId,
				data.external_calendar_id,
				capability
			);
		}

		if (!target) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_EVENT_SOURCE_REQUIRED',
				'This event is detached from its Google Calendar source'
			);
		}
		return {
			...target,
			externalEventId: data.external_event_id,
			ontoEventSyncId: data.id,
			projectCalendarId: data.project_calendar_id ?? null
		};
	}

	async resolveExternalEventTarget(
		userId: string,
		externalEventId: string,
		capability: CalendarTargetCapability = 'write'
	): Promise<CalendarExternalEventTarget> {
		const mappingQueries = [
			this.admin
				.from('onto_event_sync')
				.select('calendar_source_id')
				.eq('user_id', userId)
				.eq('provider', 'google')
				.eq('external_event_id', externalEventId),
			this.admin
				.from('task_calendar_events')
				.select('calendar_source_id')
				.eq('user_id', userId)
				.eq('calendar_event_id', externalEventId),
			this.admin
				.from('time_blocks')
				.select('calendar_source_id')
				.eq('user_id', userId)
				.eq('calendar_event_id', externalEventId),
			this.admin
				.from('recurring_task_instances')
				.select('calendar_source_id')
				.eq('user_id', userId)
				.eq('calendar_event_id', externalEventId)
		];
		const results = await Promise.all(mappingQueries);
		const failed = results.find((result) => result.error);
		if (failed?.error) throw failed.error;

		const sourceIds = Array.from(
			new Set(
				results.flatMap((result) =>
					(result.data ?? [])
						.map((row: { calendar_source_id: string | null }) => row.calendar_source_id)
						.filter((sourceId: string | null): sourceId is string => Boolean(sourceId))
				)
			)
		);
		if (sourceIds.length === 0) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_MAPPING_NOT_FOUND',
				'Google Calendar event mapping was not found'
			);
		}
		if (sourceIds.length > 1) {
			throw new GoogleCalendarTargetError(
				'CALENDAR_SOURCE_AMBIGUOUS',
				'That event exists in multiple connected calendars; choose a calendar source'
			);
		}

		return {
			...(await this.resolveExplicitSource(userId, sourceIds[0]!, capability)),
			externalEventId
		};
	}
}
