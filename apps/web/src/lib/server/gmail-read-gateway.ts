// apps/web/src/lib/server/gmail-read-gateway.ts
// Preserve the web API while workers use the same server-only Gmail read
// gateway. The web binds SvelteKit's private env for the default OAuth service
// and pagination-cursor key.
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { GmailSchemaClient } from '@buildos/shared-agent-ops/email/gmail-database.types';
import {
	GmailReadGateway as SharedGmailReadGateway,
	type GmailReadGatewayOptions
} from '@buildos/shared-agent-ops/email/gmail-read-gateway';
import { readWebGmailReadEnv } from './gmail-read-oauth.service';

export { GmailReadGatewayError } from '@buildos/shared-agent-ops/email/gmail-read-gateway';
export type { GmailReadGatewayOptions } from '@buildos/shared-agent-ops/email/gmail-read-gateway';

export class GmailReadGateway extends SharedGmailReadGateway {
	constructor(
		admin: TypedSupabaseClient | GmailSchemaClient,
		options: GmailReadGatewayOptions = {}
	) {
		super(admin, { readEnv: readWebGmailReadEnv, ...options });
	}
}
