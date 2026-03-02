// apps/web/src/routes/api/profile/contacts/import/commit/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import {
	commitUserContactCsvImport,
	insertUserContactAuditEvent
} from '$lib/server/user-contact.service';
import { resolveProfileActorId } from '$lib/server/user-profile.service';
import type { ContactImportCommitRowInput } from '$lib/types/profile-contacts';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return ApiResponse.badRequest('Invalid request body');
	}

	const rows = Array.isArray((body as any).rows)
		? ((body as any).rows as ContactImportCommitRowInput[])
		: null;
	if (!rows) {
		return ApiResponse.badRequest('rows is required');
	}

	try {
		const result = await commitUserContactCsvImport({
			supabase: supabase as any,
			userId: user.id,
			rows
		});
		const actorId = await resolveProfileActorId(supabase as any, user.id);

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			actorId,
			accessType: 'method_write',
			contextType: 'api',
			reason: 'contact_import_commit',
			metadata: {
				requested_rows: result.summary.requested,
				imported_rows: result.summary.imported,
				failed_rows: result.summary.failed
			}
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Contacts API] Failed to commit contact CSV import:', error);
		return ApiResponse.internalError(error, 'Failed to import contacts');
	}
};
