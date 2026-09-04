// apps/web/src/lib/server/gmail-read-oauth.service.ts
// Preserve the web API while workers use the same server-only Gmail read OAuth
// code. The web binds SvelteKit's private env; the shared class stays host-free.
import { env as privateEnv } from '$env/dynamic/private';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { GmailSchemaClient } from '@buildos/shared-agent-ops/email/gmail-database.types';
import {
	GmailReadOAuthService as SharedGmailReadOAuthService,
	type GmailReadEnvReader,
	type GmailReadOAuthServiceOptions
} from '@buildos/shared-agent-ops/email/gmail-read-oauth.service';

export {
	GMAIL_READ_CONSENT_POLICY_VERSION,
	GMAIL_READ_SCOPE,
	GmailOAuthError,
	MAX_GMAIL_CONNECTIONS
} from '@buildos/shared-agent-ops/email/gmail-read-oauth.service';
export type {
	GmailReadEnvReader,
	GmailReadOAuthServiceOptions
} from '@buildos/shared-agent-ops/email/gmail-read-oauth.service';

/** SvelteKit private env first, then the process env the worker also reads. */
export const readWebGmailReadEnv: GmailReadEnvReader = (name) => {
	const value = privateEnv[name] ?? process.env[name];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

export class GmailReadOAuthService extends SharedGmailReadOAuthService {
	constructor(
		admin: TypedSupabaseClient | GmailSchemaClient,
		options: GmailReadOAuthServiceOptions = {}
	) {
		super(admin, { readEnv: readWebGmailReadEnv, ...options });
	}
}
