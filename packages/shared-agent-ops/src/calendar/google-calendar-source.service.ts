// packages/shared-agent-ops/src/calendar/google-calendar-source.service.ts
// Server-only source registration and default selection shared by both hosts.
import type { GoogleCalendarAccessRole } from '@buildos/shared-types';
import {
	GoogleCalendarConnectionError,
	type GoogleCalendarCredentialClient
} from './google-calendar-credential.service';

export type GoogleCalendarSourceRow = {
	id: string;
	user_id: string;
	connection_id: string;
	provider_calendar_id: string;
	summary: string;
	summary_override: string | null;
	timezone: string | null;
	color_id: string | null;
	background_color: string | null;
	foreground_color: string | null;
	access_role: GoogleCalendarAccessRole;
	is_primary: boolean;
	is_hidden: boolean;
	is_selected_in_google: boolean;
	read_enabled: boolean;
	availability_enabled: boolean;
	analysis_enabled: boolean;
	sync_enabled: boolean;
	provider_deleted_at: string | null;
	last_seen_at: string;
	created_at: string;
};

export interface GoogleCalendarAuthPort {
	getAuthenticatedClient(userId: string, connectionId: string): Promise<unknown>;
}

export interface GoogleCalendarSourceRegistrationPort {
	registerCreatedSource(
		params: Parameters<GoogleCalendarSourceService['registerCreatedSourceRow']>[0]
	): Promise<{
		id: string;
		summary: string;
		colorId: string | null;
	}>;
}

function firstRow<T>(data: T | T[] | null): T | null {
	return Array.isArray(data) ? (data[0] ?? null) : data;
}

export class GoogleCalendarSourceService {
	constructor(private readonly admin: GoogleCalendarCredentialClient) {}
	async registerCreatedSourceRow(params: {
		userId: string;
		connectionId: string;
		providerCalendarId: string;
		summary: string;
		description?: string | null;
		timezone?: string | null;
		colorId?: string | null;
	}): Promise<GoogleCalendarSourceRow> {
		const { data, error } = await this.admin.rpc('upsert_google_calendar_source', {
			p_user_id: params.userId,
			p_connection_id: params.connectionId,
			p_provider_calendar_id: params.providerCalendarId,
			p_summary: params.summary,
			p_summary_override: null,
			p_description: params.description ?? null,
			p_timezone: params.timezone ?? null,
			p_color_id: params.colorId ?? null,
			p_background_color: null,
			p_foreground_color: null,
			p_access_role: 'owner',
			p_is_primary: false,
			p_is_hidden: false,
			p_is_selected_in_google: false
		});
		const source = firstRow(data as GoogleCalendarSourceRow | GoogleCalendarSourceRow[] | null);
		if (error || !source) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to register the created Google Calendar source'
			);
		}
		return source;
	}

	/**
	 * Preserve a still-eligible user choice. If it has disappeared or lost write access, promote
	 * the primary calendar from the earliest connected healthy account. The RPC revalidates the
	 * final choice so a concurrent permission change cannot persist an ineligible source.
	 */
	async reconcileDefaultWriteSource(userId: string): Promise<string | null> {
		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_calendar_connections')
			.select('id, connected_at')
			.eq('user_id', userId)
			.eq('provider', 'google_calendar')
			.eq('status', 'active')
			.is('deleted_at', null)
			.order('connected_at', { ascending: true });
		if (connectionError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to reconcile the default Google Calendar source'
			);
		}

		const connections = (connectionData ?? []) as Array<{
			id: string;
			connected_at: string;
		}>;
		const connectionIds = connections.map((connection) => connection.id);
		let eligibleSources: GoogleCalendarSourceRow[] = [];
		if (connectionIds.length > 0) {
			const { data: sourceData, error: sourceError } = await this.admin
				.from('user_calendar_sources')
				.select('*')
				.eq('user_id', userId)
				.in('connection_id', connectionIds)
				.in('access_role', ['writerWithoutPrivateAccess', 'writer', 'owner'])
				.is('provider_deleted_at', null)
				.is('deleted_at', null)
				.order('created_at', { ascending: true });
			if (sourceError) {
				throw new GoogleCalendarConnectionError(
					'database_error',
					'Unable to reconcile the default Google Calendar source'
				);
			}
			eligibleSources = (sourceData ?? []) as GoogleCalendarSourceRow[];
		}

		const { data: preferenceData, error: preferenceError } = await this.admin
			.from('user_calendar_preferences')
			.select('default_write_calendar_source_id')
			.eq('user_id', userId)
			.maybeSingle();
		if (preferenceError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to reconcile the default Google Calendar source'
			);
		}

		const storedSourceId = preferenceData?.default_write_calendar_source_id ?? null;
		if (storedSourceId && eligibleSources.some((source) => source.id === storedSourceId)) {
			return storedSourceId;
		}

		const connectionRank = new Map(
			connections.map((connection, index) => [connection.id, index])
		);
		const promotedSource = eligibleSources
			.filter((source) => source.is_primary)
			.sort((left, right) => {
				const connectionDifference =
					(connectionRank.get(left.connection_id) ?? Number.MAX_SAFE_INTEGER) -
					(connectionRank.get(right.connection_id) ?? Number.MAX_SAFE_INTEGER);
				if (connectionDifference !== 0) return connectionDifference;
				const createdDifference = left.created_at.localeCompare(right.created_at);
				return createdDifference !== 0
					? createdDifference
					: left.id.localeCompare(right.id);
			})[0];
		const nextSourceId = promotedSource?.id ?? null;
		const { error: updateError } = await this.admin.rpc('set_default_calendar_source', {
			p_user_id: userId,
			p_calendar_source_id: nextSourceId
		});
		if (updateError) {
			throw new GoogleCalendarConnectionError(
				'database_error',
				'Unable to reconcile the default Google Calendar source'
			);
		}
		return nextSourceId;
	}
}
