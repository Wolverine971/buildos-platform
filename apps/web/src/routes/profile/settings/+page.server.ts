// apps/web/src/routes/profile/settings/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Redirect old settings URL to profile page with calendar tab
	throw redirect(301, '/profile?tab=calendar');
};
