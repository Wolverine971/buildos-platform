// apps/web/src/routes/api/workspace/find/best/+server.ts
// POST { query }: Workspace search's best match (tasker 159). Jev hop 1 picks the projects
// (Workspace included) a search is about, hop 2 ranks the records inside them; about $0.0008
// a search. Fail-open: when the model is off, slow or failing, the answer is an empty
// "unavailable" and the word matches stand on their own. The page only asks for 3+ word
// queries or thin word matches; a daily cap stops a runaway client.
import { env } from '$env/dynamic/private';
import { JevClient, LLMUsageLogger } from '@buildos/smart-llm';
import {
	loadContextFinderProject,
	loadWorkspaceFinderProjects,
	type ContextFinderReadClient,
	type WorkspaceFinderReadClient
} from '@buildos/agentic-chat-runtime/context-finder';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BEST_MATCH_HOP1_TIMEOUT_MS,
	BEST_MATCH_OPERATION,
	createBestMatchMemo,
	findBestMatch
} from '$lib/server/workspace/find.service';
import {
	FIND_QUERY_MIN,
	normalizeFindQuery,
	type BestMatchResponse
} from '$lib/components/workspace/find-model';

/** Usage-log rows per person per day (a search writes 2–4); ~300 searches, under $0.30. */
const DAILY_USAGE_ROWS = 1_200;
const memo = createBestMatchMemo();

const unavailable = (query: string): BestMatchResponse => ({
	query,
	status: 'unavailable',
	items: [],
	ms: 0
});

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const body = (await request.json().catch(() => null)) as { query?: unknown } | null;
	const query = normalizeFindQuery(body?.query);
	if (query.length < FIND_QUERY_MIN) return ApiResponse.badRequest('Type a few letters first.');

	const apiKey = env.PRIVATE_OPENROUTER_API_KEY?.trim();
	if (!apiKey || env.WORKSPACE_BEST_MATCH_DISABLED?.trim() === 'true')
		return ApiResponse.success(unavailable(query));

	const key = `${user.id}:${query.toLocaleLowerCase()}`;
	const cached = memo.get(key);
	if (cached) return ApiResponse.success({ ...cached, ms: 0 });

	try {
		const admin = createAdminSupabaseClient();
		const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const recent = await admin
			.from('llm_usage_logs')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', user.id)
			.eq('operation_type', BEST_MATCH_OPERATION)
			.gte('created_at', since);
		if ((recent.count ?? 0) >= DAILY_USAGE_ROWS) return ApiResponse.success(unavailable(query));

		// The person's own session: the cards and records are exactly what they can open.
		const client = locals.supabase as unknown as WorkspaceFinderReadClient &
			ContextFinderReadClient;
		const result = await findBestMatch({
			query,
			signal: request.signal,
			userId: user.id,
			decider: new JevClient({
				apiKey,
				timeoutMs: BEST_MATCH_HOP1_TIMEOUT_MS,
				retryOnce: false,
				maxRequestBytes: 96_000,
				title: 'BuildOS Workspace Search',
				usage: new LLMUsageLogger({ supabase: admin })
			}),
			loadProjects: (signal) => loadWorkspaceFinderProjects(client, user.id, signal),
			loadProject: (projectId, signal) => loadContextFinderProject(client, projectId, signal)
		});
		memo.set(key, result);
		return ApiResponse.success(result);
	} catch (error) {
		if (request.signal.aborted) return ApiResponse.success(unavailable(query));
		console.warn('[Workspace find] best match endpoint failed open:', error);
		return ApiResponse.success(unavailable(query));
	}
};
