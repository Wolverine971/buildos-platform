// apps/web/src/routes/api/profile/contacts/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import {
	createOrUpsertUserContact,
	insertUserContactAuditEvent,
	listUserContacts,
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
		const includeArchived = parseBool(url.searchParams.get('include_archived'));
		const includeMethods = parseBool(url.searchParams.get('include_methods'), true);
		const requestedSensitive =
			parseBool(url.searchParams.get('expose_sensitive')) ||
			parseBool(url.searchParams.get('include_sensitive_values'));
		const exposure = resolveSensitiveContactExposure({
			includeSensitiveValues: requestedSensitive,
			userConfirmedSensitive: parseBool(url.searchParams.get('user_confirmed_sensitive')),
			reason: url.searchParams.get('reason')
		});
		const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '200', 10);
		const limit = Number.isFinite(limitRaw) ? limitRaw : 200;

		const actorId = await resolveProfileActorId(supabase as any, user.id);
		const { contacts } = await listUserContacts({
			supabase: supabase as any,
			userId: user.id,
			includeArchived,
			includeMethods,
			exposeSensitive: exposure.exposeSensitive,
			limit
		});

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			actorId,
			accessType: includeMethods ? 'method_read' : 'search',
			contextType: 'api',
			reason: 'contacts_list',
			metadata: {
				include_archived: includeArchived,
				include_methods: includeMethods,
				requested_sensitive_values: requestedSensitive,
				exposed_sensitive_values: exposure.exposeSensitive,
				reason: url.searchParams.get('reason'),
				count: contacts.length
			}
		});

		return ApiResponse.success({
			contacts,
			sensitive_values_exposed: exposure.exposeSensitive,
			...(exposure.warning ? { warning: exposure.warning } : {})
		});
	} catch (error) {
		console.error('[Contacts API] Failed to list contacts:', error);
		return ApiResponse.internalError(error, 'Failed to list contacts');
	}
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return ApiResponse.badRequest('Invalid request body');
	}

	try {
		const actorId = await resolveProfileActorId(supabase as any, user.id);
		const requestedSensitive =
			body.expose_sensitive === true || body.include_sensitive_values === true;
		const exposure = resolveSensitiveContactExposure({
			includeSensitiveValues: requestedSensitive,
			userConfirmedSensitive: body.user_confirmed_sensitive === true,
			reason: typeof body.reason === 'string' ? body.reason : null
		});
		const { contact, created } = await createOrUpsertUserContact({
			supabase: supabase as any,
			userId: user.id,
			input: body as any,
			exposeSensitive: exposure.exposeSensitive
		});

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			contactId: String(contact.id),
			actorId,
			accessType: 'method_write',
			contextType: 'api',
			reason: created ? 'contact_create' : 'contact_upsert'
		});

		return ApiResponse.success(
			{
				contact,
				created,
				sensitive_values_exposed: exposure.exposeSensitive,
				...(exposure.warning ? { warning: exposure.warning } : {})
			},
			created ? 'Contact created' : 'Contact updated'
		);
	} catch (error) {
		console.error('[Contacts API] Failed to create/upsert contact:', error);
		return ApiResponse.internalError(error, 'Failed to create or update contact');
	}
};
