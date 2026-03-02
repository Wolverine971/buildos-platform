// apps/web/src/routes/api/profile/contacts/import/preview/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';
import {
	insertUserContactAuditEvent,
	previewUserContactCsvImport
} from '$lib/server/user-contact.service';
import { resolveProfileActorId } from '$lib/server/user-profile.service';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');

	try {
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File)) {
			return ApiResponse.badRequest('CSV file is required');
		}

		const csvText = await file.text();
		const preview = await previewUserContactCsvImport({
			supabase: supabase as any,
			userId: user.id,
			csvText
		});
		const actorId = await resolveProfileActorId(supabase as any, user.id);

		await insertUserContactAuditEvent({
			supabase: supabase as any,
			userId: user.id,
			actorId,
			accessType: 'method_write',
			contextType: 'api',
			reason: 'contact_import_preview',
			metadata: {
				file_name: file.name,
				file_size: file.size,
				total_rows: preview.summary.total,
				ready_rows: preview.summary.ready,
				skipped_rows: preview.summary.skipped,
				error_rows: preview.summary.errors
			}
		});

		return ApiResponse.success(preview);
	} catch (error) {
		console.error('[Contacts API] Failed to preview contact CSV import:', error);
		return ApiResponse.internalError(error, 'Failed to preview contact import');
	}
};
