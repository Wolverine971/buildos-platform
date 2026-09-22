// apps/web/src/routes/api/agent/specialists/recommendations/+server.ts
import { env } from '$env/dynamic/private';
import { json, isHttpError } from '@sveltejs/kit';
import { JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireSpecialistWorkbenchUser } from '$lib/services/agentic-chat-v2/specialist-workbench-access.server';
import {
	recommendPublishedSpecialist,
	SpecialistRecommendationError
} from '$lib/services/agentic-chat-v2/specialist-recommendations.server';
import type { SpecialistWorkbenchClient } from '$lib/services/agentic-chat-v2/specialist-workbench.server';
import type { RequestHandler } from './$types';

const headers = { 'Cache-Control': 'private, no-store' };
const enabled = () =>
	[
		env.AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED,
		env.AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED,
		env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED,
		env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED,
		env.AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED
	].every((flag) => flag?.trim() === 'true') && !!env.PRIVATE_OPENROUTER_API_KEY?.trim();

async function body(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
		throw new SpecialistRecommendationError(415, 'Send a JSON request.');
	const reader = request.body?.getReader();
	if (!reader) throw new SpecialistRecommendationError(422, 'Missing request body.');
	let size = 0;
	const parts: Uint8Array[] = [];
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > 28000) {
				await reader.cancel();
				throw new SpecialistRecommendationError(
					413,
					'Recommendation question is too long.'
				);
			}
			parts.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const part of parts) {
		bytes.set(part, offset);
		offset += part.length;
	}
	try {
		const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			Array.isArray(parsed) ||
			Object.keys(parsed).sort().join(',') !== 'projectId,question,requestId'
		)
			throw new Error();
		return parsed;
	} catch {
		throw new SpecialistRecommendationError(422, 'Invalid recommendation request.');
	}
}

export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		const userId = await requireSpecialistWorkbenchUser(locals);
		if (!enabled())
			return json(
				{ error: 'Jev recommendations are not enabled.' },
				{ status: 404, headers }
			);
		if (request.headers.get('origin') !== url.origin)
			return json({ error: 'Request origin does not match.' }, { status: 403, headers });
		const input = await body(request);
		if (
			typeof input.requestId !== 'string' ||
			typeof input.projectId !== 'string' ||
			typeof input.question !== 'string'
		)
			throw new SpecialistRecommendationError(422, 'Invalid recommendation request.');
		const client = createAdminSupabaseClient();
		const decider = new JevClient({
			apiKey: env.PRIVATE_OPENROUTER_API_KEY!.trim(),
			timeoutMs: 3000,
			retryOnce: false,
			maxRequestBytes: 64000,
			title: 'BuildOS specialist recommendation',
			usage: new LLMUsageLogger({ supabase: client })
		});
		const recommendation = await recommendPublishedSpecialist({
			client: client as unknown as SpecialistWorkbenchClient,
			decider,
			userId,
			requestId: input.requestId,
			projectId: input.projectId,
			question: input.question
		});
		return json({ recommendation }, { headers });
	} catch (cause) {
		if (isHttpError(cause))
			return json({ error: cause.body.message }, { status: cause.status, headers });
		if (cause instanceof SpecialistRecommendationError)
			return json({ error: cause.message }, { status: cause.status, headers });
		return json(
			{ error: 'Specialist recommendations are unavailable. Try again later.' },
			{ status: 503, headers }
		);
	}
};
