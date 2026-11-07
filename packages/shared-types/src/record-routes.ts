// packages/shared-types/src/record-routes.ts
// Canonical routes for saved records. Callers establish access and ownership.
export function buildRecordHref(
	kind: 'project' | 'task' | 'document',
	id: string,
	projectId?: string
): string | null {
	if (kind === 'project') return `/projects/${encodeURIComponent(id)}`;
	if (!projectId) return null;
	return `/projects/${encodeURIComponent(projectId)}/${kind === 'task' ? 'tasks' : 'documents'}/${encodeURIComponent(id)}`;
}

export type RecordLinkKind =
	| 'project'
	| 'task'
	| 'document'
	| 'goal'
	| 'milestone'
	| 'plan'
	| 'risk';

/**
 * A link for any saved record. Tasks and documents have their own pages; goals, milestones,
 * plans and risks open in the project page's editor (`?entity=&entity_id=`).
 */
export function buildEntityHref(
	kind: RecordLinkKind,
	id: string,
	projectId?: string | null
): string | null {
	if (!id) return null;
	if (kind === 'project' || kind === 'task' || kind === 'document') {
		return buildRecordHref(kind, id, projectId ?? undefined);
	}
	if (!projectId) return null;
	return `/projects/${encodeURIComponent(projectId)}?entity=${kind}&entity_id=${encodeURIComponent(id)}`;
}
