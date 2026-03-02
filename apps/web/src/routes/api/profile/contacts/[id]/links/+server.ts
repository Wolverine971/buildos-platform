// apps/web/src/routes/api/profile/contacts/[id]/links/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import {
	createUserContactLink,
	insertUserContactAuditEvent
} from '$lib/server/user-contact.service';
import { resolveProfileActorId } from '$lib/server/user-profile.service';

export const POST: RequestHandler = async ({
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

	const linkTypeRaw = String((body as any).link_type ?? '').trim();
	const linkType =
		linkTypeRaw === 'profile_document' ||
		linkTypeRaw === 'profile_fragment' ||
		linkTypeRaw === 'onto_actor' ||
		linkTypeRaw === 'onto_entity'
			? linkTypeRaw
			: null;

	if (!linkType) {
		return ApiResponse.badRequest(
			'link_type must be profile_document, profile_fragment, onto_actor, or onto_entity'
		);
	}

	try {
		const actorId = await resolveProfileActorId(supabase as any, user.id);
		const { link } = await createUserContactLink({
			supabase: supabase as any,
			userId: user.id,
			contactId,
			linkType,
			profileDocumentId:
				typeof (body as any).profile_document_id === 'string'
					? (body as any).profile_document_id
					: null,
			profileFragmentId:
				typeof (body as any).profile_fragment_id === 'string'
					? (body as any).profile_fragment_id
					: null,
			actorId: typeof (body as any).actor_id === 'string' ? (body as any).actor_id : null,
			projectId:
				typeof (body as any).project_id === 'string' ? (body as any).project_id : null,
			entityType:
				typeof (body as any).entity_type === 'string' ? (body as any).entity_type : null,
			entityId: typeof (body as any).entity_id === 'string' ? (body as any).entity_id : null,
			props:
				(body as any).props &&
				typeof (body as any).props === 'object' &&
				!Array.isArray((body as any).props)
					? ((body as any).props as any)
					: undefined,
			createdByActorId: actorId
		});

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			contactId,
			actorId,
			accessType: 'link',
			contextType: 'api',
			reason: `contact_link:${linkType}`
		});

		return ApiResponse.success({ link }, 'Contact link created');
	} catch (error) {
		console.error('[Contacts API] Failed to create contact link:', error);
		return ApiResponse.internalError(error, 'Failed to create contact link');
	}
};
