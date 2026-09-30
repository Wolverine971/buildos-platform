// packages/shared-agent-ops/src/gateway/op-execution-gateway.archive-state.ts
// A bounded, read-only postcondition check. Archived rows are intentionally
// included by exact id; this is not a new workspace discovery surface.
import { isValidUUID } from '@buildos/shared-types';
import { loadVisibleProjects } from './op-execution-gateway.access';
import type { ToolExecutionContext } from './op-execution-gateway.types';

export type ArchiveStateTarget = { entity_kind: 'task' | 'goal' | 'document'; id: string };
export type ArchiveStateFact = ArchiveStateTarget & {
	status: 'archived' | 'active' | 'unavailable' | 'inconsistent';
	project_id?: string;
	title?: string;
	archived_at?: string;
};
export type ArchiveStateVerification = {
	version: 1;
	status: 'verified' | 'unavailable';
	targets: ArchiveStateFact[];
};

function treeIds(structure: unknown): Set<string> | null {
	if (!structure || typeof structure !== 'object' || Array.isArray(structure)) return null;
	const root = (structure as Record<string, unknown>).root;
	if (!Array.isArray(root)) return null;
	const ids = new Set<string>();
	const pending: unknown[] = [...root];
	let count = 0;
	while (pending.length) {
		if (++count > 10_000) return null;
		const value = pending.pop();
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		const node = value as Record<string, unknown>;
		if (typeof node.id !== 'string' || !isValidUUID(node.id)) return null;
		ids.add(node.id);
		if (node.children !== undefined && !Array.isArray(node.children)) return null;
		pending.push(...((node.children as unknown[] | undefined) ?? []));
	}
	return ids;
}

export async function readGatewayArchiveState(
	params: Pick<ToolExecutionContext, 'admin' | 'userId' | 'scope' | 'signal'> & {
		targets: ArchiveStateTarget[];
	}
): Promise<ArchiveStateVerification> {
	const unavailable: ArchiveStateVerification = {
		version: 1,
		status: 'unavailable',
		targets: []
	};
	if (
		params.targets.length > 100 ||
		params.targets.some(
			(t) => !['task', 'goal', 'document'].includes(t.entity_kind) || !isValidUUID(t.id)
		)
	)
		return unavailable;
	if (!params.targets.length) return { version: 1, status: 'verified', targets: [] };
	try {
		// No inherited turn memo: this check must use current membership.
		const visible = await loadVisibleProjects({
			admin: params.admin,
			userId: params.userId,
			scope: params.scope,
			signal: params.signal
		});
		const projectIds = visible.projects.map((p) => p.id);
		if (!projectIds.length)
			return {
				version: 1,
				status: 'verified',
				targets: params.targets.map((t) => ({ ...t, status: 'unavailable' }))
			};
		const facts: ArchiveStateFact[] = [];
		for (const kind of ['task', 'goal', 'document'] as const) {
			const targets = params.targets.filter((t) => t.entity_kind === kind);
			if (!targets.length) continue;
			const table = { task: 'onto_tasks', goal: 'onto_goals', document: 'onto_documents' }[
				kind
			];
			const nameField = kind === 'goal' ? 'name' : 'title';
			let query = params.admin
				.from(table as never)
				.select(`id, project_id, ${nameField}, archived_at, deleted_at, state_key`)
				.in(
					'id',
					targets.map((t) => t.id)
				)
				.in('project_id', projectIds);
			if (params.signal) query = query.abortSignal(params.signal);
			const { data, error } = await query;
			if (error) return unavailable;
			const rows = (data ?? []) as unknown as Record<string, unknown>[];
			const trees = new Map<string, Set<string> | null>();
			if (kind === 'document' && rows.some((r) => r.archived_at)) {
				let treeQuery = params.admin
					.from('onto_projects')
					.select('id, doc_structure')
					.in('id', [
						...new Set(
							rows.filter((r) => r.archived_at).map((r) => String(r.project_id))
						)
					])
					.is('deleted_at', null)
					.is('archived_at', null);
				if (params.signal) treeQuery = treeQuery.abortSignal(params.signal);
				const result = await treeQuery;
				if (result.error) return unavailable;
				for (const p of result.data ?? []) trees.set(p.id, treeIds(p.doc_structure));
			}
			for (const target of targets) {
				const row = rows.find(
					(r) => r.id === target.id && projectIds.includes(String(r.project_id))
				);
				if (!row || (row.deleted_at && !(kind === 'task' && row.archived_at))) {
					facts.push({ ...target, status: 'unavailable' });
					continue;
				}
				let status: ArchiveStateFact['status'] = row.archived_at ? 'archived' : 'active';
				if (kind === 'document' && row.state_key === 'archived' && !row.archived_at)
					status = 'inconsistent';
				if (kind === 'document' && row.archived_at) {
					const ids = trees.get(String(row.project_id));
					status = !ids
						? 'unavailable'
						: row.state_key !== 'archived' || ids.has(target.id)
							? 'inconsistent'
							: 'archived';
				}
				facts.push({
					...target,
					status,
					project_id: String(row.project_id),
					...(typeof row[nameField] === 'string'
						? { title: row[nameField] as string }
						: {}),
					...(typeof row.archived_at === 'string' ? { archived_at: row.archived_at } : {})
				});
			}
		}
		return { version: 1, status: 'verified', targets: facts };
	} catch {
		return unavailable;
	}
}
