// apps/web/src/routes/api/agent/context-finder/+server.ts
//
// Workflow Lab "Find evidence": one Jev ranking (two short calls, about $0.001) for a
// question, returned as an editable plan. Nothing is saved; the plan rides along with the
// review the user starts, and the worker only materializes it.
import { env } from '$env/dynamic/private';
import { json, isHttpError } from '@sveltejs/kit';
import { JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import type { ContextFinderReadClient } from '@buildos/agentic-chat-runtime/context-finder';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { requireSpecialistWorkbenchUser } from '$lib/services/agentic-chat-v2/specialist-workbench-access.server';
import {
	ContextFinderPreviewError,
	previewProjectContext
} from '$lib/services/agentic-chat-v2/context-finder-preview.server';
import type { RequestHandler } from './$types';

const headers = { 'Cache-Control': 'private, no-store' };
const MAX_BODY_BYTES = 28_000;
/** Per Jev call; the preview is interactive, so fail fast and let the user retry. */
const PREVIEW_TIMEOUT_MS = 5_000;
/** Soft cap from the usage log; a runaway loop stops long before it costs real money. */
const DAILY_PREVIEWS = 150;

const enabled = () =>
	[
		env.AGENTIC_CHAT_CONTEXT_FINDER_ENABLED,
		env.AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED,
		env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED,
		env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED,
		env.AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED
	].every((flag) => flag?.trim() === 'true') && !!env.PRIVATE_OPENROUTER_API_KEY?.trim();

async function readBody(request: Request): Promise<{ projectId: string; question: string }> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
		throw new ContextFinderPreviewError(415, 'Send a JSON request.');
	const declared = Number(request.headers.get('content-length') ?? '0');
	if (declared > MAX_BODY_BYTES)
		throw new ContextFinderPreviewError(413, 'Question is too long.');
	const text = await request.text();
	if (new TextEncoder().encode(text).length > MAX_BODY_BYTES)
		throw new ContextFinderPreviewError(413, 'Question is too long.');
	try {
		const parsed = JSON.parse(text);
		if (
			parsed &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed) &&
			Object.keys(parsed).sort().join(',') === 'projectId,question' &&
			typeof parsed.projectId === 'string' &&
			typeof parsed.question === 'string'
		)
			return parsed;
	} catch {
		// fall through
	}
	throw new ContextFinderPreviewError(422, 'Invalid evidence request.');
}

export const POST: RequestHandler = async ({ locals, request, url }) => {
	try {
		const userId = await requireSpecialistWorkbenchUser(locals);
		if (!enabled())
			return json({ error: 'Evidence finding is not enabled.' }, { status: 404, headers });
		if (request.headers.get('origin') !== url.origin)
			return json({ error: 'Request origin does not match.' }, { status: 403, headers });
		const body = await readBody(request);
		const admin = createAdminSupabaseClient();
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const recent = await admin
			.from('llm_usage_logs')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId)
			.eq('operation_type', 'agentic_chat_context_finder_preview')
			.gte('created_at', since);
		if ((recent.count ?? 0) >= DAILY_PREVIEWS * 2)
			return json(
				{ error: 'The daily evidence preview limit has been reached.' },
				{ status: 429, headers }
			);
		const preview = await previewProjectContext({
			// The user's RLS-scoped client: previews see exactly what the user can see.
			client: locals.supabase as unknown as ContextFinderReadClient,
			decider: new JevClient({
				apiKey: env.PRIVATE_OPENROUTER_API_KEY!.trim(),
				timeoutMs: PREVIEW_TIMEOUT_MS,
				retryOnce: false,
				maxRequestBytes: 96_000,
				title: 'BuildOS Context Finder',
				usage: new LLMUsageLogger({ supabase: admin })
			}),
			userId,
			projectId: body.projectId,
			question: body.question,
			timeoutMs: PREVIEW_TIMEOUT_MS,
			signal: request.signal
		});
		return json({ preview }, { headers });
	} catch (cause) {
		if (isHttpError(cause))
			return json({ error: cause.body.message }, { status: cause.status, headers });
		if (cause instanceof ContextFinderPreviewError)
			return json({ error: cause.message }, { status: cause.status, headers });
		return json(
			{ error: 'Evidence finding is unavailable. Try again later.' },
			{ status: 503, headers }
		);
	}
};
