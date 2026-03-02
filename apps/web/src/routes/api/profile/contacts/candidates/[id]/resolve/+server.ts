// apps/web/src/routes/api/profile/contacts/candidates/[id]/resolve/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import {
	insertUserContactAuditEvent,
	resolveSensitiveContactExposure,
	resolveUserContactMergeCandidate
} from '$lib/server/user-contact.service';
import { resolveProfileActorId } from '$lib/server/user-profile.service';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const candidateId = params.id;
	if (!candidateId) return ApiResponse.badRequest('Candidate id is required');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return ApiResponse.badRequest('Invalid request body');
	}

	const actionRaw = String((body as any).action ?? '').trim();
	const action =
		actionRaw === 'confirmed_merge' || actionRaw === 'rejected' || actionRaw === 'snoozed'
			? actionRaw
			: null;
	if (!action) {
		return ApiResponse.badRequest('action must be confirmed_merge, rejected, or snoozed');
	}

	try {
		const actorId = await resolveProfileActorId(supabase as any, user.id);
		const requestedSensitive =
			(body as any).expose_sensitive === true ||
			(body as any).include_sensitive_values === true;
		const exposure = resolveSensitiveContactExposure({
			includeSensitiveValues: requestedSensitive,
			userConfirmedSensitive: (body as any).user_confirmed_sensitive === true,
			reason: typeof (body as any).reason === 'string' ? (body as any).reason : null
		});

		const { candidate } = await resolveUserContactMergeCandidate({
			supabase: supabase as any,
			userId: user.id,
			candidateId,
			action,
			actorId,
			exposeSensitive: exposure.exposeSensitive
		});

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			contactId: String((candidate as any).primary_contact_id ?? ''),
			actorId,
			accessType: 'merge',
			contextType: 'api',
			reason: `candidate_resolve:${action}`,
			metadata: { candidate_id: candidateId }
		});

		return ApiResponse.success(
			{
				candidate,
				sensitive_values_exposed: exposure.exposeSensitive,
				...(exposure.warning ? { warning: exposure.warning } : {})
			},
			'Merge candidate resolved'
		);
	} catch (error) {
		console.error('[Contacts API] Failed to resolve merge candidate:', error);
		return ApiResponse.internalError(error, 'Failed to resolve merge candidate');
	}
};
