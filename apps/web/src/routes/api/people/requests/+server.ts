// apps/web/src/routes/api/people/requests/+server.ts
//
// GET  → requests asking you (pending) and requests you sent (any status).
// POST → ask someone, by handle, for access to their projects. They pick what to
//        share; the requester can't see their projects, so `project_hint` is free text.
//        A new request also emails them (best effort; a failed email never fails it).

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { asRecord, normalizeHandle, peopleRpcErrorResponse } from '$lib/server/people/people-api';
import { isPersonRole, requestOutcomeMessage } from '$lib/components/people/people-copy';
import { sendPeopleRequestReceivedEmail } from '$lib/server/people/people-emails';

const PROJECT_HINT_MAX = 120;
const NOTE_MAX = 500;

function optionalText(
	value: unknown,
	max: number,
	label: string
): { ok: true; value: string | undefined } | { ok: false; message: string } {
	if (value === undefined || value === null) return { ok: true, value: undefined };
	if (typeof value !== 'string') return { ok: false, message: `${label} must be text` };
	const trimmed = value.trim();
	if (trimmed.length > max) {
		return { ok: false, message: `${label} can be at most ${max} characters` };
	}
	return { ok: true, value: trimmed || undefined };
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const { data, error } = await locals.supabase.rpc('list_people_requests', {});
	if (error) return peopleRpcErrorResponse(error, 'Could not load requests');

	const result = asRecord(data);
	return ApiResponse.success({
		incoming: Array.isArray(result.incoming) ? result.incoming : [],
		outgoing: Array.isArray(result.outgoing) ? result.outgoing : []
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const body = asRecord(await request.json().catch(() => null));

	const handle = normalizeHandle(body.handle);
	if (!handle) {
		return ApiResponse.badRequest(
			'Enter a handle like @sam: 3 to 24 letters, numbers, or single hyphens.'
		);
	}

	const role = body.role ?? 'viewer';
	if (!isPersonRole(role)) return ApiResponse.badRequest('Role must be viewer or editor');

	const hint = optionalText(body.project_hint, PROJECT_HINT_MAX, 'What you want to see');
	if (!hint.ok) return ApiResponse.badRequest(hint.message);
	const note = optionalText(body.note, NOTE_MAX, 'The note');
	if (!note.ok) return ApiResponse.badRequest(note.message);

	const { data, error } = await locals.supabase.rpc('create_people_request', {
		p_handle: handle,
		p_role: role,
		...(hint.value ? { p_project_hint: hint.value } : {}),
		...(note.value ? { p_note: note.value } : {})
	});
	if (error) return peopleRpcErrorResponse(error, 'Could not send your request');

	const result = asRecord(data);
	const status = typeof result.status === 'string' ? result.status : 'error';
	const requestId = typeof result.request_id === 'string' ? result.request_id : null;

	// Only a brand-new request: not the one already waiting, not a silent block.
	if (status === 'pending' && requestId && result.already_pending !== true) {
		await sendPeopleRequestReceivedEmail(requestId);
	}
	const outcome = requestOutcomeMessage(
		{
			status,
			reason: typeof result.reason === 'string' ? result.reason : undefined,
			already_pending: result.already_pending === true
		},
		`@${handle}`
	);

	return ApiResponse.success({
		status,
		reason: typeof result.reason === 'string' ? result.reason : null,
		already_pending: result.already_pending === true,
		request_id: requestId,
		expires_at: typeof result.expires_at === 'string' ? result.expires_at : null,
		message: outcome.message,
		tone: outcome.tone
	});
};
