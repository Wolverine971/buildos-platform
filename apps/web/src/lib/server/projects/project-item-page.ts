// apps/web/src/lib/server/projects/project-item-page.ts
//
// One loader for a doc's or task's own page (/projects/[id]/documents/[id] and
// /projects/[id]/tasks/[id]). The page is the reader at full width beside the
// project's list, so it needs two reads: the project card (doc tree, tasks,
// goals, write access; the same read as a Projects card) and the item itself,
// which seeds the reader. Access rules: a moved doc redirects to its new
// project first; an RLS-hidden project resolves to forbidden or a login; an
// archived project (no card) still opens its item, without the list.
import { error, redirect } from '@sveltejs/kit';
import type { DesktopCard } from '$lib/components/projects/desktop/desktop-moves';

export type ProjectItemKind = 'document' | 'task';

type LoadArgs = {
	kind: ProjectItemKind;
	projectId: string | undefined;
	itemId: string | undefined;
	fetch: typeof fetch;
	locals: App.Locals;
	url: URL;
};

export type ProjectItemPageData = {
	projectId: string;
	item: { kind: ProjectItemKind; id: string };
	projectName: string;
	canWrite: boolean;
	itemTitle: string;
	/** The project's list; null when it can't be read (an archived project). */
	card: DesktopCard | null;
	/** The reader's first read, so the page opens with the item already shown. */
	seed: Record<string, unknown> | null;
};

const WORD: Record<ProjectItemKind, { label: string; plural: string }> = {
	document: { label: 'Document', plural: 'documents' },
	task: { label: 'Task', plural: 'tasks' }
};

export async function loadProjectItemPage({
	kind,
	projectId,
	itemId,
	fetch,
	locals,
	url
}: LoadArgs): Promise<ProjectItemPageData> {
	const word = WORD[kind];
	if (!projectId || !itemId) {
		throw error(400, `Project ID and ${word.label} ID required`);
	}
	const loginRedirect = `/auth/login?redirect=${encodeURIComponent(`${url.pathname}${url.search}`)}`;

	const [cardResponse, itemResponse] = await Promise.all([
		fetch(`/api/onto/projects/${projectId}/card`),
		fetch(`/api/onto/${word.plural}/${itemId}/full?include_linked=false`)
	]);

	// The item endpoint checks access to its current project. Resolve a moved doc
	// before the former project's missing/access state.
	const itemPayload = itemResponse.ok ? await itemResponse.json().catch(() => null) : null;
	const itemData = (itemPayload?.data ?? null) as Record<string, unknown> | null;
	const record = (itemData?.[kind] ?? null) as {
		project_id?: string;
		title?: string;
	} | null;
	if (kind === 'document' && record?.project_id && record.project_id !== projectId) {
		throw redirect(307, `/projects/${record.project_id}/documents/${itemId}${url.search}`);
	}

	let card: DesktopCard | null = null;
	let projectName = '';
	if (cardResponse.ok) {
		const payload = await cardResponse.json().catch(() => null);
		card = (payload?.data ?? null) as DesktopCard | null;
		projectName = card?.project.name ?? '';
	} else {
		const status = cardResponse.status;
		if (status === 401) throw redirect(303, loginRedirect);
		if (status === 403 || status === 404) {
			const { data: routeAccessState, error: accessStateError } = await (
				locals.supabase as any
			).rpc('get_project_route_access_state', { p_project_id: projectId });
			if (accessStateError) {
				console.error(
					'[Project item page] Failed to resolve project access:',
					accessStateError
				);
				throw error(500, 'Failed to check project access');
			}
			if (routeAccessState === 'forbidden') {
				throw error(403, 'You do not have access to this project.');
			}
			if (routeAccessState === 'unauthenticated') throw redirect(303, loginRedirect);
			if (status === 404) throw error(404, 'Project not found');
			throw error(403, 'You do not have access to this project.');
		}
		// No card (an archived project, or a read that failed): the item still opens.
		const fallback = await fetch(`/api/onto/projects/${projectId}`);
		if (!fallback.ok) throw error(500, 'Failed to load project');
		const payload = await fallback.json().catch(() => null);
		projectName = payload?.data?.project?.name ?? '';
	}

	if (!itemResponse.ok) {
		if (itemResponse.status === 401) throw redirect(303, loginRedirect);
		if (itemResponse.status === 403)
			throw error(403, 'You do not have access to this project.');
		if (itemResponse.status === 404) throw error(404, `${word.label} not found`);
		throw error(500, `Failed to load ${word.label.toLowerCase()}`);
	}
	if (!record || (record.project_id && record.project_id !== projectId)) {
		throw error(404, `${word.label} not found in this project`);
	}

	return {
		projectId,
		item: { kind, id: itemId },
		projectName,
		canWrite: Boolean(card?.project.can_write),
		itemTitle: record.title ?? '',
		card,
		seed: itemData
	};
}
