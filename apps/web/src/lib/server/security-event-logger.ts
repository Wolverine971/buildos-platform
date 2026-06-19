// apps/web/src/lib/server/security-event-logger.ts
//
// Web shim over the carved logger in `@buildos/shared-agent-ops`. The package
// requires `options.supabase`; here we default it to the admin client so the
// existing web importers keep their auto-admin behavior. Everything else
// (types, request/metadata helpers) is re-exported unchanged.
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	logSecurityEvent as coreLogSecurityEvent,
	logSecurityEventBlocking as coreLogSecurityEventBlocking,
	logSecurityEventAsync as coreLogSecurityEventAsync,
	type SecurityEventInput,
	type SecurityEventLogOptions
} from '@buildos/shared-agent-ops/ops/security-event-logger';

export * from '@buildos/shared-agent-ops/ops/security-event-logger';

function withDefaultAdmin(options: SecurityEventLogOptions = {}): SecurityEventLogOptions {
	return options.supabase ? options : { ...options, supabase: createAdminSupabaseClient() };
}

export async function logSecurityEvent(
	input: SecurityEventInput,
	options: SecurityEventLogOptions = {}
): Promise<void> {
	return coreLogSecurityEvent(input, withDefaultAdmin(options));
}

export async function logSecurityEventBlocking(
	input: SecurityEventInput,
	options: Omit<SecurityEventLogOptions, 'delivery'> = {}
): Promise<void> {
	return coreLogSecurityEventBlocking(input, withDefaultAdmin(options));
}

export function logSecurityEventAsync(
	input: SecurityEventInput,
	options: Omit<SecurityEventLogOptions, 'delivery'> = {}
): void {
	return coreLogSecurityEventAsync(input, withDefaultAdmin(options));
}
