// apps/web/src/routes/people/+page.server.ts
//
// /people moved into Profile > People & agents (tasker 141). Old links, emails,
// and bookmarks land there.

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	redirect(308, '/profile?tab=people');
};
