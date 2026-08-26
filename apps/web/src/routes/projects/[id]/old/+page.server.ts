// apps/web/src/routes/projects/[id]/old/+page.server.ts
/** Temporary compatibility route for bookmarks to the retired classic workspace. */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => {
	throw redirect(307, `/projects/${encodeURIComponent(params.id)}${url.search}`);
};
