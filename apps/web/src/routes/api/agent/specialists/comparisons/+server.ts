// apps/web/src/routes/api/agent/specialists/comparisons/+server.ts
// "Compare answers" lab API. Same cohort gate as the specialist workbench. No model calls.
import { json, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireSpecialistWorkbenchUser } from '$lib/services/agentic-chat-v2/specialist-workbench-access.server';
import {
	AnswerComparisonValidationError,
	isUuid,
	parseAnswerComparisonRequest
} from '$lib/services/agentic-chat-v2/answer-comparison-core';
import {
	addAnswerComparisonCandidate,
	AnswerComparisonStoreError,
	createAnswerComparison,
	getAnswerComparison,
	listAnswerComparisonLab,
	recordAnswerComparisonVote,
	revealAnswerComparison,
	type AnswerComparisonClient
} from '$lib/services/agentic-chat-v2/answer-comparison.server';

const headers = { 'Cache-Control': 'private, no-store' };
const BODY_LIMIT = 400000;

function failure(err: unknown) {
	if (isHttpError(err)) return json({ error: err.body.message }, { status: err.status, headers });
	if (err instanceof AnswerComparisonValidationError)
		return json({ error: err.message }, { status: 422, headers });
	if (err instanceof AnswerComparisonStoreError)
		return json({ error: err.message }, { status: err.status, headers });
	return json(
		{ error: 'The comparison lab is unavailable. Try again.' },
		{ status: 503, headers }
	);
}
async function boundedBody(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
		throw new AnswerComparisonStoreError(415, 'Send a JSON request.');
	const reader = request.body?.getReader();
	if (!reader) throw new AnswerComparisonValidationError('Missing request body.');
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			length += value.byteLength;
			if (length > BODY_LIMIT) {
				await reader.cancel();
				throw new AnswerComparisonStoreError(413, 'Request exceeds the upload limit.');
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
		throw new AnswerComparisonValidationError('Invalid JSON request.');
	}
}

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const userId = await requireSpecialistWorkbenchUser(locals);
		const id = url.searchParams.get('id');
		if (id !== null && !isUuid(id))
			throw new AnswerComparisonValidationError('Comparison id must be a UUID.');
		const client = createAdminSupabaseClient() as unknown as AnswerComparisonClient;
		if (id)
			return json({ comparison: await getAnswerComparison(client, userId, id) }, { headers });
		return json(
			await listAnswerComparisonLab(client, userId, {
				includeHeldOut: url.searchParams.get('heldOut') === '1'
			}),
			{ headers }
		);
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
		const parsed = parseAnswerComparisonRequest(await boundedBody(request));
		// Create privileged adapter only after authentication, cohort and input validation.
		const client = createAdminSupabaseClient() as unknown as AnswerComparisonClient;
		const comparison =
			parsed.action === 'create'
				? await createAnswerComparison(client, userId, parsed)
				: parsed.action === 'add_candidate'
					? await addAnswerComparisonCandidate(client, userId, parsed)
					: parsed.action === 'vote'
						? await recordAnswerComparisonVote(client, userId, parsed)
						: await revealAnswerComparison(client, userId, parsed.comparisonId);
		return json({ comparison }, { headers });
	} catch (err) {
		return failure(err);
	}
};
