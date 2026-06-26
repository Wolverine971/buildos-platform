// packages/shared-agent-ops/src/project-loops.ts
import { createHash } from 'node:crypto';
import type { ProjectLoopBrief } from '@buildos/shared-types';

export interface ProjectLoopFingerprintGoal {
	name: string;
	description: string | null;
}

export interface ProjectLoopFingerprintDocument {
	id: string;
	title: string;
	state_key: string | null;
	updated_at: string | null;
	parent_id: string | null;
}

export interface ProjectLoopFingerprintTask {
	id: string;
	title: string;
	state_key: string | null;
	updated_at: string | null;
}

export interface ProjectLoopFingerprintContext {
	projectId: string;
	projectName: string;
	projectDescription: string | null;
	goals: ProjectLoopFingerprintGoal[];
	documents: ProjectLoopFingerprintDocument[];
	tasks: ProjectLoopFingerprintTask[];
}

function compareText(a: string | null | undefined, b: string | null | undefined): number {
	return (a ?? '').localeCompare(b ?? '');
}

export function buildProjectLoopSourceFingerprint(ctx: ProjectLoopFingerprintContext): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				project: {
					id: ctx.projectId,
					name: ctx.projectName,
					description: ctx.projectDescription
				},
				goals: [...ctx.goals]
					.sort(
						(a, b) =>
							compareText(a.name, b.name) || compareText(a.description, b.description)
					)
					.map((g) => ({ name: g.name, description: g.description })),
				documents: [...ctx.documents]
					.sort((a, b) => compareText(a.id, b.id))
					.map((d) => ({
						id: d.id,
						title: d.title,
						state_key: d.state_key,
						updated_at: d.updated_at,
						parent_id: d.parent_id
					})),
				tasks: [...ctx.tasks]
					.sort((a, b) => compareText(a.id, b.id))
					.map((t) => ({
						id: t.id,
						title: t.title,
						state_key: t.state_key,
						updated_at: t.updated_at
					}))
			})
		)
		.digest('hex');
}

export function buildProjectLoopParentMap(docStructure: unknown): Map<string, string | null> {
	const map = new Map<string, string | null>();
	const root =
		docStructure && typeof docStructure === 'object' && 'root' in (docStructure as any)
			? (docStructure as any).root
			: docStructure;
	const visit = (nodes: any, parentId: string | null) => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes) {
			if (!node || typeof node.id !== 'string') continue;
			map.set(node.id, parentId);
			if (Array.isArray(node.children)) visit(node.children, node.id);
		}
	};
	visit(root, null);
	return map;
}

export function summarizeProjectLoopDocTree(
	docStructure: unknown,
	titleById: Map<string, string>
): string {
	const root =
		docStructure && typeof docStructure === 'object' && 'root' in (docStructure as any)
			? (docStructure as any).root
			: docStructure;
	const lines: string[] = [];
	const visit = (nodes: any, depth: number) => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes) {
			if (!node || typeof node.id !== 'string') continue;
			lines.push(`${'  '.repeat(depth)}- ${titleById.get(node.id) ?? node.id}`);
			if (Array.isArray(node.children)) visit(node.children, depth + 1);
		}
	};
	visit(root, 0);
	return lines.length ? lines.join('\n') : '(flat - no hierarchy yet)';
}

export function buildHeuristicProjectLoopBrief(
	ctx: ProjectLoopFingerprintContext,
	now = new Date()
): ProjectLoopBrief {
	const activeTasks = ctx.tasks.filter((task) => task.state_key !== 'done');
	const staleDocs = ctx.documents
		.filter((doc) => {
			if (!doc.updated_at) return false;
			const updatedAt = Date.parse(doc.updated_at);
			if (!Number.isFinite(updatedAt)) return false;
			return now.getTime() - updatedAt > 45 * 24 * 60 * 60 * 1000;
		})
		.slice(0, 3);
	const currentGoal =
		ctx.goals.find((goal) => goal.name.trim())?.name ??
		ctx.projectDescription ??
		`Keep ${ctx.projectName} moving`;

	return {
		current_goal: currentGoal,
		recent_changes: [
			`${ctx.documents.length} document${ctx.documents.length === 1 ? '' : 's'} in scope`,
			`${activeTasks.length} open task${activeTasks.length === 1 ? '' : 's'} tracked`
		],
		open_decisions: activeTasks.slice(0, 3).map((task) => task.title),
		stale_assumptions: staleDocs.map((doc) => doc.title),
		contradictions_or_drift: [],
		next_best_action: activeTasks[0]?.title ?? 'Add the next concrete task',
		generated_at: now.toISOString(),
		source: 'heuristic'
	};
}
