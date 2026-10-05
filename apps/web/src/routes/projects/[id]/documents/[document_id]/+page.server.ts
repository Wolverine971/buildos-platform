// apps/web/src/routes/projects/[id]/documents/[document_id]/+page.server.ts
/**
 * A document's own page: the reader at full width beside the project's list.
 * Access, moved-document redirects and errors live in the shared loader.
 */
import type { PageServerLoad } from './$types';
import { loadProjectItemPage } from '$lib/server/projects/project-item-page';

export const load: PageServerLoad = ({ params, fetch, locals, url }) =>
	loadProjectItemPage({
		kind: 'document',
		projectId: params.id,
		itemId: params.document_id,
		fetch,
		locals,
		url
	});
