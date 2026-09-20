// apps/web/src/routes/api/agent/specialists/workbench/+server.ts
import { json, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireSpecialistWorkbenchUser } from '$lib/services/agentic-chat-v2/specialist-workbench-access.server';
import {
	getSpecialistWorkbenchVersion,
	saveSpecialistWorkbenchDraft,
	publishSpecialistWorkbenchVersion,
	SpecialistWorkbenchStoreError,
	type SpecialistWorkbenchClient
} from '$lib/services/agentic-chat-v2/specialist-workbench.server';
import {
	previewSpecialistWorkbenchDraftV1,
	SpecialistWorkbenchValidationError
} from '@buildos/agentic-chat-runtime/specialists';

const headers = { 'Cache-Control': 'private, no-store' };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function identity(id: unknown, revision: unknown, min = 0): asserts id is string {
	if (
		typeof id !== 'string' ||
		!uuid.test(id) ||
		!Number.isSafeInteger(revision) ||
		Number(revision) < min
	)
		throw new SpecialistWorkbenchValidationError('Invalid draft identity or revision.');
}
function failure(err: unknown) {
	if (isHttpError(err)) return json({ error: err.body.message }, { status: err.status, headers });
	if (err instanceof SpecialistWorkbenchValidationError)
		return json({ error: err.message }, { status: 422, headers });
	if (err instanceof SpecialistWorkbenchStoreError)
		return json({ error: err.message }, { status: err.status, headers });
	return json(
		{ error: 'The specialist workbench is unavailable. Keep your draft and try again.' },
		{ status: 503, headers }
	);
}
async function boundedBody(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
		throw new SpecialistWorkbenchStoreError(415, 'Send a JSON request.');
	const reader = request.body?.getReader();
	if (!reader) throw new SpecialistWorkbenchValidationError('Missing request body.');
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > 125000) {
				await reader.cancel();
				throw new SpecialistWorkbenchStoreError(413, 'Draft exceeds the upload limit.');
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const data = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		data.set(chunk, offset);
		offset += chunk.length;
	}
	try {
		const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
		return parsed;
	} catch {
		throw new SpecialistWorkbenchValidationError('Invalid JSON request.');
	}
}
export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = await requireSpecialistWorkbenchUser(locals);
		const id = url.searchParams.get('id');
		const version = Number(url.searchParams.get('version'));
		identity(id, version, 1);
		const client = createAdminSupabaseClient() as unknown as SpecialistWorkbenchClient;
		return json(await getSpecialistWorkbenchVersion(client, userId, id, version), { headers });
	} catch (err) {
		return failure(err);
	}
};
export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		const userId = await requireSpecialistWorkbenchUser(locals);
		// JSON endpoints do not get SvelteKit's form-only CSRF check.
		if (request.headers.get('origin') !== url.origin)
			return json({ error: 'Request origin does not match.' }, { status: 403, headers });
		const body = await boundedBody(request);
		if (body.action === 'preview')
			return json(
				{ preview: await previewSpecialistWorkbenchDraftV1(body.draft) },
				{ headers }
			);
		if (!['save', 'publish'].includes(String(body.action)))
			throw new SpecialistWorkbenchValidationError('Unsupported workbench action.');
		identity(body.id, body.expectedRevision, body.action === 'publish' ? 1 : 0);
		// Create privileged adapter only after authentication, cohort and input validation.
		const client = createAdminSupabaseClient() as unknown as SpecialistWorkbenchClient;
		const result =
			body.action === 'save'
				? await saveSpecialistWorkbenchDraft(
						client,
						userId,
						body.id,
						Number(body.expectedRevision),
						body.draft
					)
				: await publishSpecialistWorkbenchVersion(
						client,
						userId,
						body.id,
						Number(body.expectedRevision)
					);
		return json(result, { headers });
	} catch (err) {
		return failure(err);
	}
};
