import { createHash, randomBytes } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getClientIpFromHeaders, getUserAgentFromHeaders } from '$lib/server/error-tracking';
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '$lib/legal/policy-versions';

export type LegalAcceptanceSurface = 'email_signup' | 'google_signup';

const INTENT_LIFETIME_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createLegalAcceptanceIntent(
	event: Pick<RequestEvent, 'request'>,
	surface: LegalAcceptanceSurface
): Promise<{ token: string; acceptedAt: string; expiresAt: string }> {
	const token = randomBytes(32).toString('base64url');
	const acceptedAt = new Date();
	const expiresAt = new Date(acceptedAt.getTime() + INTENT_LIFETIME_MS);
	const admin = createAdminSupabaseClient();
	const { error } = await (admin as any).from('legal_acceptance_intents').insert({
		token_hash: hashToken(token),
		terms_version: CURRENT_TERMS_VERSION,
		privacy_version: CURRENT_PRIVACY_VERSION,
		intended_surface: surface,
		accepted_at: acceptedAt.toISOString(),
		expires_at: expiresAt.toISOString(),
		client_ip: getClientIpFromHeaders(event.request.headers) ?? null,
		user_agent: getUserAgentFromHeaders(event.request.headers)?.slice(0, 1000) ?? null
	});

	if (error) {
		throw new Error(`Failed to record legal acceptance intent: ${error.message}`);
	}

	return {
		token,
		acceptedAt: acceptedAt.toISOString(),
		expiresAt: expiresAt.toISOString()
	};
}

export async function consumeLegalAcceptanceIntent(options: {
	token: string;
	userId: string;
	surface: LegalAcceptanceSurface;
}): Promise<boolean> {
	if (!options.token || !options.userId) return false;

	const admin = createAdminSupabaseClient();
	const { data, error } = await (admin as any).rpc('consume_legal_acceptance_intent', {
		p_token_hash: hashToken(options.token),
		p_user_id: options.userId,
		p_surface: options.surface
	});

	if (error) {
		throw new Error(`Failed to record legal acceptance: ${error.message}`);
	}

	return data === true;
}

export async function deleteExpiredLegalAcceptanceIntents(): Promise<number> {
	const admin = createAdminSupabaseClient();
	const { count, error } = await (admin as any)
		.from('legal_acceptance_intents')
		.delete({ count: 'exact' })
		.is('used_at', null)
		.lt('expires_at', new Date().toISOString());

	if (error) {
		throw new Error(`Failed to delete expired legal acceptance intents: ${error.message}`);
	}

	return count ?? 0;
}
