import { buildRecordHref } from '@buildos/shared-types';

type RecordKind = 'project' | 'task' | 'document';
type RecordReference = { kind: RecordKind; id: string; title: string; url: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLLECTIONS: Record<string, RecordKind> = {
	project: 'project',
	projects: 'project',
	task: 'task',
	tasks: 'task',
	document: 'document',
	documents: 'document'
};

/** Read only typed result envelopes, never props, document text, or embedded URLs. */
export function collectRecordReferences(payload: unknown, toolName: string): RecordReference[] {
	if (!/^(?:get|list|search|read|explore|create|update)_/.test(toolName)) return [];
	const references = new Map<string, RecordReference>();
	function visit(value: unknown, kind?: RecordKind, projectId?: string, depth = 0): void {
		if (depth > 5 || references.size >= 20) return;
		if (Array.isArray(value)) {
			for (const child of value) visit(child, kind, projectId, depth + 1);
			return;
		}
		if (!value || typeof value !== 'object') return;
		const record = value as Record<string, unknown>;
		if (record.found === false || record.error) return;
		const explicitKind = record.entity_type ?? record.type ?? record.kind;
		const ownKind =
			explicitKind === 'project' || explicitKind === 'task' || explicitKind === 'document'
				? explicitKind
				: kind;
		const ownProject =
			typeof record.project_id === 'string' && UUID.test(record.project_id)
				? record.project_id
				: projectId;
		const id = record.id ?? (ownKind ? record[`${ownKind}_id`] : undefined);
		const title = record.title ?? record.name;
		if (
			ownKind &&
			typeof id === 'string' &&
			UUID.test(id) &&
			typeof title === 'string' &&
			title.trim()
		) {
			const url = buildRecordHref(ownKind, id, ownProject);
			if (url)
				references.set(`${ownKind}:${id}`, {
					kind: ownKind,
					id,
					title: title.slice(0, 160),
					url
				});
		}
		const parentProject =
			ownKind === 'project' && typeof id === 'string' && UUID.test(id) ? id : ownProject;
		for (const [key, child] of Object.entries(record)) {
			if (COLLECTIONS[key]) visit(child, COLLECTIONS[key], parentProject, depth + 1);
			else if (['data', 'results', 'matches', 'entities'].includes(key))
				visit(child, undefined, parentProject, depth + 1);
		}
	}
	const kind = toolName.includes('document')
		? 'document'
		: toolName.includes('task')
			? 'task'
			: toolName.includes('project')
				? 'project'
				: undefined;
	visit(payload, kind);
	return [...references.values()];
}
