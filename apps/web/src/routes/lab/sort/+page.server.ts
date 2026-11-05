// apps/web/src/routes/lab/sort/+page.server.ts
import { error } from '@sveltejs/kit';
import { isDumpSortAdmin } from '$lib/server/dump-sort/dump-sort-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Sign in to use the sort lab');
	if (!(await isDumpSortAdmin(locals.supabase, user.id))) error(404, 'Not found');
	setHeaders({ 'Cache-Control': 'private, no-store' });
	return {};
};
