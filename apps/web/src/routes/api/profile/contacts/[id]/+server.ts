// apps/web/src/routes/api/profile/contacts/[id]/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import {
	archiveUserContact,
	insertUserContactAuditEvent,
	updateUserContact
} from '$lib/server/user-contact.service';
import { resolveProfileActorId } from '$lib/server/user-profile.service';

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const contactId = params.id;
	if (!contactId) return ApiResponse.badRequest('Contact id is required');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return ApiResponse.badRequest('Invalid request body');
	}

	try {
		const actorId = await resolveProfileActorId(supabase as any, user.id);
		const exposeSensitive = body.expose_sensitive === true;
		const { contact, updated } = await updateUserContact({
			supabase: supabase as any,
			userId: user.id,
			contactId,
			input: body as any,
			exposeSensitive
		});

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			contactId,
			actorId,
			accessType: 'method_write',
			contextType: 'api',
			reason: 'contact_patch'
		});

		return ApiResponse.success({ contact, updated });
	} catch (error) {
		console.error('[Contacts API] Failed to patch contact:', error);
		return ApiResponse.internalError(error, 'Failed to update contact');
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const contactId = params.id;
	if (!contactId) return ApiResponse.badRequest('Contact id is required');

	try {
		const actorId = await resolveProfileActorId(supabase as any, user.id);
		const result = await archiveUserContact({
			supabase: supabase as any,
			userId: user.id,
			contactId
		});

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			contactId,
			actorId,
			accessType: 'method_write',
			contextType: 'api',
			reason: 'contact_archive'
		});

		return ApiResponse.success(result, 'Contact archived');
	} catch (error) {
		console.error('[Contacts API] Failed to archive contact:', error);
		return ApiResponse.internalError(error, 'Failed to archive contact');
	}
};
