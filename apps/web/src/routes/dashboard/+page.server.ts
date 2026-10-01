// apps/web/src/routes/dashboard/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The dashboard folded into Projects (2026-10-01): the Today row (brief, overdue,
// AI inbox, calendar) and the recent activity / chats panels live there now.
// Old links, bookmarks, and ?onboarding / ?payment params keep working.
export const load: PageServerLoad = async ({ url }) => {
	redirect(303, `/projects${url.search}`);
};
