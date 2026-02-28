// apps/web/src/routes/api/webhooks/calendar-sync-job/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { PRIVATE_BUILDOS_WEBHOOK_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';
import type { OntoProjectEventSyncJobMetadata } from '@buildos/shared-types';

function isValidPayload(body: unknown): body is OntoProjectEventSyncJobMetadata {
	if (!body || typeof body !== 'object') return false;
	const payload = body as Record<string, unknown>;
	return (
		payload.kind === 'onto_project_event_sync' &&
		(payload.action === 'upsert' || payload.action === 'delete') &&
		typeof payload.eventId === 'string' &&
		typeof payload.projectId === 'string' &&
		typeof payload.targetUserId === 'string' &&
		(payload.eventUpdatedAt === undefined || typeof payload.eventUpdatedAt === 'string')
	);
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const expectedSecret = PRIVATE_BUILDOS_WEBHOOK_SECRET;
		if (!expectedSecret) {
			return ApiResponse.internalError(null, 'Webhook not configured');
		}

		const authHeader = request.headers.get('authorization');
		if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
			return ApiResponse.unauthorized('Unauthorized');
		}

		const body = (await request.json().catch(() => null)) as unknown;
		if (!isValidPayload(body)) {
			return ApiResponse.badRequest(
				'Invalid payload: expected onto_project_event_sync metadata'
			);
		}

		const supabase = createAdminSupabaseClient();
		const service = new OntoEventSyncService(supabase as any);
		const result = await service.processProjectEventSyncJob({
			action: body.action,
			eventId: body.eventId,
			projectId: body.projectId,
			targetUserId: body.targetUserId,
			createCalendarIfMissing: body.createCalendarIfMissing,
			expectedEventUpdatedAt: body.eventUpdatedAt
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[CalendarSyncWebhook] Processing failed:', error);
		return ApiResponse.internalError(error, 'Failed to process calendar sync job');
	}
};
