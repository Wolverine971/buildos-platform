// apps/web/src/routes/docs/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { loadDocPage, getSiblingDocs } from '$lib/utils/docs';

export const load: PageServerLoad = async ({ params }) => {
	const doc = await loadDocPage(params.slug);
	const siblings = getSiblingDocs(params.slug);

	return {
		doc,
		prev: siblings.prev,
		next: siblings.next
	};
};
