// apps/web/src/lib/server/gmail-connection-health.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { GmailOAuthError, GmailReadOAuthService } from './gmail-read-oauth.service';
import { mapWithConcurrency } from './gmail-gateway-infrastructure';

type HealthCandidate = {
	connection_id: string;
	access_token_expires_at: string | null;
	refresh_token_expires_at: string | null;
};

type ActiveConnection = {
	id: string;
	user_id: string;
};

export type GmailConnectionHealthResult = {
	candidates: number;
	checked: number;
	refreshed: number;
	reconnectRequired: number;
	transientFailures: number;
	hasMore: boolean;
};

const DEFAULT_LIMIT = 50;
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

/**
 * Proactively refreshes Gmail credentials that are about to expire. A revoked
 * refresh token is discovered here even when the user has not recently asked
 * the agent to read Gmail; the connection trigger then creates the AI Inbox
 * reconnect item.
 */
export async function checkGmailConnectionHealth(
	admin: TypedSupabaseClient,
	options: {
		limit?: number;
		now?: Date;
		oauthService?: Pick<GmailReadOAuthService, 'getAuthorizedReadAccessToken'>;
	} = {}
): Promise<GmailConnectionHealthResult> {
	const now = options.now ?? new Date();
	const limit = Math.max(1, Math.min(Math.trunc(options.limit ?? DEFAULT_LIMIT), 200));
	const refreshBefore = new Date(now.getTime() + REFRESH_WINDOW_MS).toISOString();
	const nowIso = now.toISOString();
	const queryLimit = limit + 1;

	const { data: credentialData, error: credentialError } = await admin
		.from('email_connection_credentials')
		.select('connection_id, access_token_expires_at, refresh_token_expires_at')
		.eq('grant_kind', 'read')
		.eq('oauth_client_kind', 'gmail_read')
		.is('revoked_at', null)
		.or(
			`access_token_expires_at.is.null,access_token_expires_at.lte.${refreshBefore},refresh_token_expires_at.lte.${nowIso}`
		)
		.order('refresh_token_expires_at', { ascending: true, nullsFirst: false })
		.order('access_token_expires_at', { ascending: true, nullsFirst: true })
		.limit(queryLimit);
	if (credentialError) throw credentialError;

	const credentialRows = (credentialData ?? []) as HealthCandidate[];
	const hasMore = credentialRows.length > limit;
	const candidates = credentialRows.slice(0, limit);
	const connectionIds = [...new Set(candidates.map((row) => row.connection_id))];
	if (connectionIds.length === 0) {
		return {
			candidates: 0,
			checked: 0,
			refreshed: 0,
			reconnectRequired: 0,
			transientFailures: 0,
			hasMore
		};
	}

	const { data: connectionData, error: connectionError } = await admin
		.from('user_email_connections')
		.select('id, user_id')
		.in('id', connectionIds)
		.eq('provider', 'google_gmail')
		.eq('status', 'active')
		.eq('read_enabled', true)
		.is('deleted_at', null);
	if (connectionError) throw connectionError;

	const connections = (connectionData ?? []) as ActiveConnection[];
	const oauth = options.oauthService ?? new GmailReadOAuthService(admin);
	const outcomes = await mapWithConcurrency(connections, 4, async (connection) => {
		try {
			await oauth.getAuthorizedReadAccessToken(connection.user_id, connection.id, {
				forceRefresh: true
			});
			return 'refreshed' as const;
		} catch (error) {
			if (
				error instanceof GmailOAuthError &&
				(error.code === 'reconnect_required' || error.code === 'read_capability_disabled')
			) {
				return 'reconnect_required' as const;
			}
			return 'transient_failure' as const;
		}
	});

	return {
		candidates: candidates.length,
		checked: connections.length,
		refreshed: outcomes.filter((outcome) => outcome === 'refreshed').length,
		reconnectRequired: outcomes.filter((outcome) => outcome === 'reconnect_required').length,
		transientFailures: outcomes.filter((outcome) => outcome === 'transient_failure').length,
		hasMore
	};
}
