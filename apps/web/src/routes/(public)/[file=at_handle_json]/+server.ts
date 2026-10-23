// apps/web/src/routes/(public)/[file=at_handle_json]/+server.ts
//
// build-os.com/@handle.json: the builder page as data, for any agent. Logged-out view
// unless the request carries a BuildOS session. Unknown and unpublished look the same.

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { loadBuilderProfile } from '$lib/server/builder-profile/builder-profile.service';
import { toAgentJson } from '$lib/builder-profile/agent-json';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const handle = params.file.slice(1, -'.json'.length).toLowerCase();
	const { user } = await locals.safeGetSession();
	const headers: Record<string, string> = {
		'access-control-allow-origin': '*',
		'cache-control': user
			? 'private, no-store'
			: 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
	};
	try {
		const result = await loadBuilderProfile(locals.supabase as any, handle);
		if (!result.found || result.status !== 'published') {
			return json({ found: false, handle }, { status: 404, headers });
		}
		return json(toAgentJson(result, url.origin), { headers });
	} catch (err) {
		console.error('[BuilderProfile] json failed', err);
		return json({ error: 'Could not load this page' }, { status: 500, headers });
	}
};
