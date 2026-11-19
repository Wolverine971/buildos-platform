// apps/web/src/lib/components/knowledge/where-types.ts
// "Where it shows up" for a knowledge entry: the projects, tasks and documents that name it.

import { requireApiData } from '$lib/utils/api-client-helpers';
import type { KnowledgeEntitySummary } from './knowledge-client';

export interface KnowledgeWhereRecord {
	id: string;
	kind: 'task' | 'document';
	title: string;
	project_id: string | null;
	project_name: string | null;
	done: boolean;
	/** The sentence that named the entry, when the link kept one. */
	quote: string | null;
}

export interface KnowledgeWhereProject {
	id: string;
	name: string;
	/** Links inside this project: the project itself plus its tasks and docs. */
	count: number;
	quote: string | null;
}

export interface KnowledgeWhere {
	projects: KnowledgeWhereProject[];
	tasks: KnowledgeWhereRecord[];
	documents: KnowledgeWhereRecord[];
}

export type KnowledgeProjectRow = KnowledgeEntitySummary & {
	updated_at: string;
	researched_at: string | null;
};

export interface KnowledgeProjectEntries {
	project: { id: string; name: string };
	entities: KnowledgeProjectRow[];
	where: Record<string, KnowledgeWhere>;
}

export const whereApi = {
	async forEntities(ids: string[]): Promise<Record<string, KnowledgeWhere>> {
		const res = await fetch(`/api/knowledge/where?ids=${ids.join(',')}`);
		return (await requireApiData<{ where: Record<string, KnowledgeWhere> }>(res)).where;
	},
	async inProject(projectId: string): Promise<KnowledgeProjectEntries> {
		const res = await fetch(`/api/knowledge/where?project_id=${encodeURIComponent(projectId)}`);
		return requireApiData<KnowledgeProjectEntries>(res);
	}
};

/** "BuildOS, Cadre · 3 tasks · 2 docs" — the one quiet line on phones. */
export function whereSummary(where: KnowledgeWhere): string {
	const parts: string[] = [];
	if (where.projects.length) {
		const names = where.projects.slice(0, 2).map((p) => p.name);
		const extra = where.projects.length - names.length;
		parts.push(names.join(', ') + (extra > 0 ? ` +${extra}` : ''));
	}
	if (where.tasks.length)
		parts.push(`${where.tasks.length} task${where.tasks.length === 1 ? '' : 's'}`);
	if (where.documents.length)
		parts.push(`${where.documents.length} doc${where.documents.length === 1 ? '' : 's'}`);
	return parts.join(' · ');
}

export function emptyWhere(): KnowledgeWhere {
	return { projects: [], tasks: [], documents: [] };
}

export function isWhereEmpty(where: KnowledgeWhere | undefined): boolean {
	return !where || (!where.projects.length && !where.tasks.length && !where.documents.length);
}
