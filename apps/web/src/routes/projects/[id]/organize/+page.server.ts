// apps/web/src/routes/projects/[id]/organize/+page.server.ts
import type { PageServerLoad } from './$types';
import { error, redirect, isHttpError } from '@sveltejs/kit';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	loadOrganizeSnapshot,
	OrganizeSnapshotError
} from '$lib/server/organize/organize-snapshot';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user)
		redirect(303, `/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
	if (!isValidUUID(params.id)) error(400, 'Invalid project ID');
	const withId = url.searchParams.get('with');
	if (withId && (!isValidUUID(withId) || withId === params.id))
		error(400, 'Choose a different project.');
	try {
		// Authorize each independently; the second project is never implicitly granted.
		const [primary, secondary] = await Promise.all([
			loadOrganizeSnapshot(locals.supabase, params.id),
			withId ? loadOrganizeSnapshot(locals.supabase, withId) : null
		]);
		const documentId = url.searchParams.get('document');
		const taskId = url.searchParams.get('task');
		if (
			(documentId && taskId) ||
			(documentId && !isValidUUID(documentId)) ||
			(taskId && !isValidUUID(taskId))
		)
			error(400, 'Choose one document or task to move.');
		const itemId = documentId ?? taskId;
		const kind = documentId ? ('document' as const) : ('task' as const);
		if (
			itemId &&
			!(kind === 'document' ? primary.project.documents : primary.project.tasks).some(
				(item) => item.id === itemId
			)
		)
			error(404, 'This item is no longer in this project.');
		return {
			project: primary.project,
			secondaryProject: secondary?.project ?? null,
			relatedProjects: primary.related_projects,
			initialRef: itemId ? { kind, id: itemId, project_id: params.id } : null
		};
	} catch (cause) {
		if (cause instanceof OrganizeSnapshotError) error(cause.status, cause.message);
		// Preserve explicit URL/item validation HTTP errors.
		if (isHttpError(cause)) throw cause;
		error(500, 'Could not load Organize.');
	}
};
