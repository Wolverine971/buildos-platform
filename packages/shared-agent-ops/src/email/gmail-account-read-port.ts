// packages/shared-agent-ops/src/email/gmail-account-read-port.ts
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_GMAIL_CONNECTIONS = 5;

const GMAIL_PROVIDER = 'google_gmail';
const CONNECTION_SELECT =
	'id, email_address, display_name, account_label, status, read_enabled, connected_at, last_verified_at, last_used_at';
const GMAIL_CAPABILITIES = new Set(['read', 'send', 'save_gmail_draft', 'modify_message']);
const GMAIL_CAPABILITY_STATUSES = new Set(['enabled', 'disabled', 'reconnect_required']);
const GMAIL_CONNECTION_STATUSES = new Set(['active', 'reconnect_required', 'disabled', 'error']);

export type GmailConnectionStatus = 'active' | 'reconnect_required' | 'disabled' | 'error';

export type GmailConnectionCapability = {
	capability: 'read' | 'send' | 'save_gmail_draft' | 'modify_message';
	status: 'enabled' | 'disabled' | 'reconnect_required';
};

export type GmailConnectionSummary = {
	id: string;
	emailAddress: string;
	displayName: string | null;
	accountLabel: string;
	status: GmailConnectionStatus;
	readEnabled: boolean;
	connectedAt: string;
	lastVerifiedAt: string | null;
	lastUsedAt: string | null;
	capabilities: GmailConnectionCapability[];
};

export type GmailConnectionsPayload = {
	available: boolean;
	maxConnections: number;
	connections: GmailConnectionSummary[];
	readOnly: true;
};

export type GmailAccountReadPortOptions = { available: boolean };

type ConnectionRow = Pick<
	Database['public']['Tables']['user_email_connections']['Row'],
	| 'id'
	| 'email_address'
	| 'display_name'
	| 'account_label'
	| 'status'
	| 'read_enabled'
	| 'connected_at'
	| 'last_verified_at'
	| 'last_used_at'
>;

type CapabilityRow = Pick<
	Database['public']['Tables']['email_capability_grants']['Row'],
	'connection_id' | 'capability' | 'status'
>;

export class GmailAccountReadPortError extends Error {
	constructor(
		public readonly code:
			| 'invalid_request'
			| 'connection_not_found'
			| 'read_not_enabled'
			| 'database_error',
		message: string
	) {
		super(message);
		this.name = 'GmailAccountReadPortError';
	}
}

/**
 * Worker-safe account discovery and ownership boundary for Gmail reads.
 *
 * This module has no SvelteKit or process-environment imports. Hosts must pass
 * configuration explicitly. The Supabase client is normally service-role, so
 * every connection lookup includes `user_id` even if its caller already
 * authenticated the user; service-role clients bypass RLS.
 */
export class GmailAccountReadPort {
	constructor(
		private readonly admin: SupabaseClient<Database>,
		private readonly options: GmailAccountReadPortOptions
	) {
		if (typeof options.available !== 'boolean') {
			throw new Error('Gmail account-read availability must be boolean');
		}
	}

	isConfigured(): boolean {
		return this.options.available;
	}

	async listConnections(userId: string): Promise<GmailConnectionsPayload> {
		const rows = await this.loadOwnedConnections(userId);
		const capabilityRows = await this.loadCapabilities(rows.map((row) => row.id));

		return {
			available: this.isConfigured(),
			maxConnections: MAX_GMAIL_CONNECTIONS,
			readOnly: true,
			connections: rows.map((row) => ({
				id: row.id,
				emailAddress: row.email_address,
				displayName: row.display_name,
				accountLabel: row.account_label,
				status: normalizeConnectionStatus(row.status),
				readEnabled: row.read_enabled,
				connectedAt: row.connected_at,
				lastVerifiedAt: row.last_verified_at,
				lastUsedAt: row.last_used_at,
				capabilities: capabilityRows
					.filter((capability) => capability.connection_id === row.id)
					.map(normalizeCapability)
					.filter(
						(capability): capability is GmailConnectionCapability => capability !== null
					)
			}))
		};
	}

	/**
	 * Resolve exact connection IDs through the ownership boundary used by future
	 * search/message ports. Missing and cross-user IDs share one non-enumerating
	 * error.
	 */
	async requireOwnedReadableConnections(
		userId: string,
		connectionIds: readonly string[]
	): Promise<ConnectionRow[]> {
		const normalizedIds = normalizeConnectionIds(connectionIds);
		const rows = await this.loadOwnedConnections(userId, normalizedIds);
		const foundIds = new Set(rows.map((row) => row.id));
		if (normalizedIds.some((connectionId) => !foundIds.has(connectionId))) {
			throw new GmailAccountReadPortError(
				'connection_not_found',
				'One or more Gmail connections were not found'
			);
		}
		if (rows.some((row) => row.status !== 'active' || row.read_enabled !== true)) {
			throw new GmailAccountReadPortError(
				'read_not_enabled',
				'One or more Gmail connections are not enabled for reading'
			);
		}

		const rowsById = new Map(rows.map((row) => [row.id, row]));
		return normalizedIds.map((connectionId) => rowsById.get(connectionId)!);
	}

	private async loadOwnedConnections(
		userId: string,
		connectionIds?: readonly string[]
	): Promise<ConnectionRow[]> {
		const normalizedUserId = normalizeUserId(userId);
		let query = this.admin
			.from('user_email_connections')
			.select(CONNECTION_SELECT)
			.eq('user_id', normalizedUserId)
			.eq('provider', GMAIL_PROVIDER)
			.is('deleted_at', null);

		if (connectionIds) query = query.in('id', [...connectionIds]);

		const { data, error } = await query
			.order('connected_at', { ascending: true })
			.limit(MAX_GMAIL_CONNECTIONS + 1);
		if (error) {
			throw new GmailAccountReadPortError(
				'database_error',
				'Failed to load Gmail connections'
			);
		}
		const rows = (data ?? []) as ConnectionRow[];
		if (rows.length > MAX_GMAIL_CONNECTIONS) {
			throw new GmailAccountReadPortError(
				'database_error',
				'Gmail connection limit invariant was exceeded'
			);
		}
		return rows;
	}

	private async loadCapabilities(connectionIds: readonly string[]): Promise<CapabilityRow[]> {
		if (connectionIds.length === 0) return [];
		const { data, error } = await this.admin
			.from('email_capability_grants')
			.select('connection_id, capability, status')
			.in('connection_id', [...connectionIds]);
		if (error) {
			throw new GmailAccountReadPortError(
				'database_error',
				'Failed to load Gmail permissions'
			);
		}
		return (data ?? []) as CapabilityRow[];
	}
}

function normalizeUserId(userId: string): string {
	const normalized = typeof userId === 'string' ? userId.trim() : '';
	if (!isCanonicalUuid(normalized)) {
		throw new GmailAccountReadPortError('invalid_request', 'A valid user ID is required');
	}
	return normalized;
}

function normalizeConnectionIds(connectionIds: readonly string[]): string[] {
	const normalized = Array.from(
		new Set(
			connectionIds
				.map((connectionId) =>
					typeof connectionId === 'string' ? connectionId.trim() : ''
				)
				.filter(Boolean)
		)
	);
	if (
		normalized.length === 0 ||
		normalized.length > MAX_GMAIL_CONNECTIONS ||
		normalized.some((connectionId) => !isCanonicalUuid(connectionId))
	) {
		throw new GmailAccountReadPortError(
			'invalid_request',
			`Gmail reads require 1-${MAX_GMAIL_CONNECTIONS} connection IDs`
		);
	}
	return normalized;
}

function isCanonicalUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function normalizeConnectionStatus(status: string): GmailConnectionStatus {
	return GMAIL_CONNECTION_STATUSES.has(status) ? (status as GmailConnectionStatus) : 'error';
}

function normalizeCapability(row: CapabilityRow): GmailConnectionCapability | null {
	if (!GMAIL_CAPABILITIES.has(row.capability) || !GMAIL_CAPABILITY_STATUSES.has(row.status)) {
		return null;
	}
	return {
		capability: row.capability as GmailConnectionCapability['capability'],
		status: row.status as GmailConnectionCapability['status']
	};
}
