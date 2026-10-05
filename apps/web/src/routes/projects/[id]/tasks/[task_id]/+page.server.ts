// apps/web/src/routes/projects/[id]/tasks/[task_id]/+page.server.ts
/**
 * A task's own page: the reader at full width beside the project's list.
 * Access and errors live in the shared loader.
 */
import type { PageServerLoad } from './$types';
import { loadProjectItemPage } from '$lib/server/projects/project-item-page';

export const load: PageServerLoad = ({ params, fetch, locals, url }) =>
	loadProjectItemPage({
		kind: 'task',
		projectId: params.id,
		itemId: params.task_id,
		fetch,
		locals,
		url
	});
