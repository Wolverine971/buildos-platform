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
