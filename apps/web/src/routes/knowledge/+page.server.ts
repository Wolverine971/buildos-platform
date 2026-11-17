// apps/web/src/routes/knowledge/+page.server.ts
// The personal knowledge graph: people you know, organizations, websites, channels and videos
// (tasker 160). First paint gets the opening list; everything else loads in the browser.
import type { PageServerLoad } from './$types';
import { redirectToLogin } from '$lib/server/auth-redirects';
import { knowledgeStoreFor } from '$lib/server/knowledge/knowledge.server';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirectToLogin(url);

	try {
		const store = knowledgeStoreFor(locals.supabase, user.id);
		const all = await store.list({ limit: 60 });
		return { initial: all, unavailable: false };
	} catch (error) {
		console.error('[knowledge] initial load failed', error);
		return { initial: null, unavailable: true };
	}
};
