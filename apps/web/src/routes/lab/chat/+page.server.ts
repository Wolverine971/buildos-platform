// apps/web/src/routes/lab/chat/+page.server.ts
import { error } from '@sveltejs/kit';
import { isDumpSortAdmin } from '$lib/server/dump-sort/dump-sort-access';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import { isActiveFacing } from '$lib/config/project-states';
import { REPLAY_CHAT_TURNS } from '$lib/server/thread-chat/thread-chat-replay';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Sign in to use the chat lab');
	if (!(await isDumpSortAdmin(locals.supabase, user.id))) error(404, 'Not found');
	setHeaders({ 'Cache-Control': 'private, no-store' });
	// For the "chat about one project" picker.
	const actorId = await ensureActorId(locals.supabase as never, user.id);
	const summaries = await fetchProjectSummaries(locals.supabase as never, actorId);
	const projects = summaries
		.filter((project) => project.kind !== 'workspace' && isActiveFacing(project.state_key))
		.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
		.slice(0, 40)
		.map((project) => ({ id: project.id, name: project.name }));
	return { projects, replayMessages: REPLAY_CHAT_TURNS.map((turn) => turn.message) };
};
