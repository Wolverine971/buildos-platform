// apps/web/src/routes/api/profile/contacts/candidates/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import {
	insertUserContactAuditEvent,
	listUserContactMergeCandidates,
	resolveSensitiveContactExposure
} from '$lib/server/user-contact.service';
import { resolveProfileActorId } from '$lib/server/user-profile.service';

function parseBool(value: string | null, fallback = false): boolean {
	if (value === null) return fallback;
	return value === '1' || value.toLowerCase() === 'true';
}

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	try {
		const statusParam = url.searchParams.get('status');
		const status =
			statusParam === 'confirmed_merge' ||
			statusParam === 'rejected' ||
			statusParam === 'snoozed'
				? statusParam
				: 'pending';
		const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '100', 10);
		const limit = Number.isFinite(limitRaw) ? limitRaw : 100;
		const requestedSensitive =
			parseBool(url.searchParams.get('expose_sensitive')) ||
			parseBool(url.searchParams.get('include_sensitive_values'));
		const exposure = resolveSensitiveContactExposure({
			includeSensitiveValues: requestedSensitive,
			userConfirmedSensitive: parseBool(url.searchParams.get('user_confirmed_sensitive')),
			reason: url.searchParams.get('reason')
		});
		const actorId = await resolveProfileActorId(supabase as any, user.id);

		const { candidates } = await listUserContactMergeCandidates({
			supabase: supabase as any,
			userId: user.id,
			status,
			limit,
			exposeSensitive: exposure.exposeSensitive
		});

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			actorId,
			accessType: exposure.exposeSensitive ? 'method_read' : 'search',
			contextType: 'api',
			reason: 'contact_candidates_list',
			metadata: {
				status,
				requested_sensitive_values: requestedSensitive,
				exposed_sensitive_values: exposure.exposeSensitive,
				count: candidates.length
			}
		});

		return ApiResponse.success({
			candidates,
			sensitive_values_exposed: exposure.exposeSensitive,
			...(exposure.warning ? { warning: exposure.warning } : {})
		});
	} catch (error) {
		console.error('[Contacts API] Failed to list contact merge candidates:', error);
		return ApiResponse.internalError(error, 'Failed to list merge candidates');
	}
};
