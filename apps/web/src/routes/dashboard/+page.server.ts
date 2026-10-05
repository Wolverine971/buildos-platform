// apps/web/src/routes/dashboard/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// /dashboard was the old home. Home is /today now (2026-10-04); the dashboard's panels
// (Today row, activity, chats) live on /projects. Old links and bookmarks keep their
// query string.
export const load: PageServerLoad = async ({ url }) => {
	redirect(303, `/today${url.search}`);
};
