// packages/shared-agent-ops/src/calendar/google-calendar-connection-read.ts
//
// Worker-safe read of the user's Google Calendar connections and their sources.
// This is the read half of the web
// `GoogleCalendarConnectionService.listConnections` (apps/web/src/lib/server/
// google-calendar-connection.service.ts) — only the fields the agent-facing
// `get_external_account_status` tool reports, with none of the OAuth,
// registration, rename, or disconnect machinery.
//
// No SvelteKit or process-environment imports: hosts pass `available`
// explicitly (see `isGoogleCalendarMultiAccountConfigured`). The Supabase client
// is normally service-role, so every query filters on `user_id` even when the
// caller already authenticated the user; service-role clients bypass RLS.

import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';

const GOOGLE_CALENDAR_PROVIDER = 'google_calendar';
const CONNECTION_SELECT = 'id, email_address, display_name, account_label, status';
const SOURCE_SELECT = 'id, connection_id, read_enabled, access_role';
const CONNECTION_STATUSES = new Set(['active', 'reconnect_required', 'disabled', 'error']);

export type GoogleCalendarConnectionReadStatus =
	| 'active'
	| 'reconnect_required'
	| 'disabled'
	| 'error';

export type GoogleCalendarConnectionReadSource = {
	id: string;
	readEnabled: boolean;
	/** Google access role for the source (`owner`, `writer`, `reader`, ...). */
	accessRole: string;
};

export type GoogleCalendarConnectionReadSummary = {
	id: string;
	emailAddress: string;
	displayName: string | null;
	accountLabel: string;
	status: GoogleCalendarConnectionReadStatus;
	sources: GoogleCalendarConnectionReadSource[];
};

export type GoogleCalendarConnectionReadPayload = {
	available: boolean;
	connections: GoogleCalendarConnectionReadSummary[];
};

export type GoogleCalendarConnectionReadOptions = { available: boolean };

export type GoogleCalendarEnvReader = (name: string) => string | undefined;

/**
 * Same predicate the web service uses for `available`: dedicated Calendar OAuth
 * credentials, a usable token key, and a client id distinct from the shared
 * login client (a connection retains the client that minted its grant, so the
 * two must never be conflated).
 */
export function isGoogleCalendarMultiAccountConfigured(readEnv: GoogleCalendarEnvReader): boolean {
	const clientId = readEnv('PRIVATE_GOOGLE_CALENDAR_CLIENT_ID')?.trim() ?? '';
	const clientSecret = readEnv('PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET')?.trim() ?? '';
	const tokenKey = readEnv('PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1') ?? '';
	const sharedLoginClientId = readEnv('PRIVATE_GOOGLE_CLIENT_ID')?.trim() ?? '';
	return Boolean(
		clientId &&
			clientSecret &&
			tokenKey &&
			Buffer.byteLength(tokenKey, 'utf8') >= 32 &&
			(!sharedLoginClientId || clientId !== sharedLoginClientId)
	);
}

export class GoogleCalendarConnectionReadError extends Error {
	constructor(
		public readonly code: 'invalid_request' | 'database_error',
		message: string
	) {
		super(message);
		this.name = 'GoogleCalendarConnectionReadError';
	}
}

export class GoogleCalendarConnectionReadPort {
	constructor(
		private readonly admin: SupabaseClient<Database>,
		private readonly options: GoogleCalendarConnectionReadOptions
	) {
		if (typeof options.available !== 'boolean') {
			throw new Error('Google Calendar connection-read availability must be boolean');
		}
	}

	isConfigured(): boolean {
		return this.options.available;
	}

	async listConnections(userId: string): Promise<GoogleCalendarConnectionReadPayload> {
		const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
		if (!normalizedUserId) {
			throw new GoogleCalendarConnectionReadError(
				'invalid_request',
				'A valid user ID is required'
			);
		}

		const { data: connectionData, error: connectionError } = await this.admin
			.from('user_calendar_connections')
			.select(CONNECTION_SELECT)
			.eq('user_id', normalizedUserId)
			.eq('provider', GOOGLE_CALENDAR_PROVIDER)
			.is('deleted_at', null)
			.order('connected_at', { ascending: true });
		if (connectionError) {
			throw new GoogleCalendarConnectionReadError(
				'database_error',
				'Failed to load Google Calendar connections'
			);
		}

		const connections = (connectionData ?? []) as Array<Record<string, any>>;
		const connectionIds = connections
			.map((connection) => connection.id)
			.filter((id): id is string => typeof id === 'string');

		let sources: Array<Record<string, any>> = [];
		if (connectionIds.length > 0) {
			const { data: sourceData, error: sourceError } = await this.admin
				.from('user_calendar_sources')
				.select(SOURCE_SELECT)
				.eq('user_id', normalizedUserId)
				.in('connection_id', connectionIds)
				.is('provider_deleted_at', null)
				.is('deleted_at', null);
			if (sourceError) {
				throw new GoogleCalendarConnectionReadError(
					'database_error',
					'Failed to load Google Calendar sources'
				);
			}
			sources = (sourceData ?? []) as Array<Record<string, any>>;
		}

		return {
			available: this.isConfigured(),
			connections: connections.map((connection) => ({
				id: connection.id as string,
				emailAddress: (connection.email_address as string) ?? '',
				displayName: (connection.display_name as string | null) ?? null,
				accountLabel: (connection.account_label as string) ?? '',
				status: normalizeConnectionStatus(connection.status),
				sources: sources
					.filter((source) => source.connection_id === connection.id)
					.map((source) => ({
						id: source.id as string,
						readEnabled: source.read_enabled === true,
						accessRole: (source.access_role as string) ?? 'reader'
					}))
			}))
		};
	}
}

function normalizeConnectionStatus(status: unknown): GoogleCalendarConnectionReadStatus {
	return typeof status === 'string' && CONNECTION_STATUSES.has(status)
		? (status as GoogleCalendarConnectionReadStatus)
		: 'error';
}
