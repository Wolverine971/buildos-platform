// apps/web/src/routes/api/admin/chat/users/[userId]/sessions/classify/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { queueChatSessionClassification } from '$lib/server/chat-classification.service';
import { ApiResponse } from '$lib/utils/api-response';

type ChatSessionClassificationRow = {
	id: string;
	user_id: string | null;
	last_message_at: string | null;
	updated_at: string | null;
	created_at: string | null;
	last_classified_at: string | null;
};

type ClassificationQueueResult = {
	session_id: string;
	classification_state: 'missing' | 'stale' | 'classified';
	queued: boolean;
	job_id?: string;
	reason?: string;
};

const MAX_SESSION_IDS = 50;

function readSessionIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const ids = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
	return Array.from(new Set(ids)).slice(0, MAX_SESSION_IDS);
}

function classificationState(
	session: ChatSessionClassificationRow
): ClassificationQueueResult['classification_state'] {
	if (!session.last_classified_at) return 'missing';
	const classifiedAt = new Date(session.last_classified_at).getTime();
	const lastActivityAt = new Date(
		session.last_message_at ?? session.updated_at ?? session.created_at ?? ''
	).getTime();
	if (
		Number.isFinite(lastActivityAt) &&
		Number.isFinite(classifiedAt) &&
		lastActivityAt > classifiedAt
	) {
		return 'stale';
	}
	return 'classified';
}

export const POST: RequestHandler = async ({ params, request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const userId = params.userId?.trim();
	if (!userId) {
		return ApiResponse.badRequest('User ID required');
	}

	let body: { session_ids?: unknown; include_classified?: unknown } = {};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return ApiResponse.badRequest('JSON body required');
	}

	const sessionIds = readSessionIds(body.session_ids);
	if (sessionIds.length === 0) {
		return ApiResponse.badRequest('At least one session ID is required');
	}

	const includeClassified = body.include_classified === true;

	try {
		const adminSupabase = createAdminSupabaseClient();
		const { data: sessions, error } = await adminSupabase
			.from('chat_sessions')
			.select('id, user_id, last_message_at, updated_at, created_at, last_classified_at')
			.eq('user_id', userId)
			.in('id', sessionIds);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		const rows = (sessions ?? []) as ChatSessionClassificationRow[];
		const foundIds = new Set(rows.map((session) => session.id));
		const results: ClassificationQueueResult[] = [];

		for (const session of rows) {
			const state = classificationState(session);
			if (state === 'classified' && !includeClassified) {
				results.push({
					session_id: session.id,
					classification_state: state,
					queued: false,
					reason: 'already_classified'
				});
				continue;
			}

			const result = await queueChatSessionClassification({
				sessionId: session.id,
				userId
			});
			results.push({
				session_id: session.id,
				classification_state: state,
				queued: result.queued,
				job_id: result.jobId,
				reason: result.reason
			});
		}

		for (const sessionId of sessionIds) {
			if (!foundIds.has(sessionId)) {
				results.push({
					session_id: sessionId,
					classification_state: 'missing',
					queued: false,
					reason: 'not_found_for_user'
				});
			}
		}

		return ApiResponse.success({
			requested: sessionIds.length,
			found: rows.length,
			queued: results.filter((result) => result.queued).length,
			skipped: results.filter((result) => !result.queued).length,
			results
		});
	} catch (err) {
		console.error('Admin chat classification queue error:', err);
		return ApiResponse.internalError(err, 'Failed to queue chat classification');
	}
};
