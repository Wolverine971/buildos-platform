// apps/web/src/routes/admin/ontology/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	// Redirect to the current ontology graph experience until we build
	// additional sub-sections under /admin/ontology.
	throw redirect(307, '/admin/ontology/graph');
};
