// apps/web/src/routes/api/calendar/changes/[id]/undo/+server.ts
//
// POST /api/calendar/changes/:id/undo -> { ok: true } | { ok: false, message }
// Undo one change BuildOS applied from a project's Google Calendar (tasker 154). The old values
// go back on the BuildOS event (and its task) and are pushed to Google.
import type { RequestHandler } from './$types';
import { undoCalendarIngestChange } from '@buildos/shared-agent-ops/calendar/calendar-change-ingest';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';

const REFUSALS = {
	not_found: 'That change was not found.',
	already_undone: 'That change was already undone.',
	changed_since: 'This event changed again after that, so Undo would overwrite the newer edit.',
	event_missing: 'That event no longer exists.'
} as const;

export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized('Authentication required');
	if (!params.id) return ApiResponse.badRequest('Change ID required');

	try {
		const outcome = await undoCalendarIngestChange({
			db: createAdminSupabaseClient() as any,
			userDb: locals.supabase as any,
			writer: new OntoEventSyncService(locals.supabase),
			userId: user.id,
			changeId: params.id
		});
		if (outcome.ok) return ApiResponse.success({ ok: true });
		return ApiResponse.success({ ok: false, message: REFUSALS[outcome.reason] });
	} catch (error) {
		console.error('[Calendar change undo] Failed:', error);
		return ApiResponse.internalError(error, 'Could not undo this change');
	}
};
