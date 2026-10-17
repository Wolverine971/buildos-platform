// packages/shared-agent-ops/src/consolidation/check-summary.ts
//
// What a quick duplicate check found, in a shape a chat card or the run page
// can show as is (tasker 122): counts by kind, the top groups with each item's
// project, and where to review the full thing. Pure and client-safe: it reads
// the run's stored plan and never calls a model. Every sentence here is built
// from structured fields (kinds, counts, names), never from reading text.
import type {
	ConsolidationCluster,
	ConsolidationClusterKind,
	ConsolidationPlan
} from './consolidation';

/** How the run page and chat cards name each kind of group. */
export const CONSOLIDATION_KIND_LABELS: Record<ConsolidationClusterKind, string> = {
	misfiled: 'In the wrong project',
	fragments: 'Scattered notes',
	versions: 'Versions',
	superseded: 'Replaced',
	twins: 'Identical copies',
	duplicate_tasks: 'Duplicate tasks',
	task_parts: 'Pieces of a bigger task',
	task_sequence: 'Steps in order',
	sibling_tasks: 'Same work across projects',
	finished_tasks: 'Done or no longer needed'
};

/** The buckets a check reports, in the order a card reads them. */
export const CONSOLIDATION_CHECK_BUCKETS = [
	'duplicate_docs',
	'duplicate_tasks',
	'outdated_docs',
	'overlapping_docs',
	'finished_tasks',
	'other'
] as const;
export type ConsolidationCheckBucket = (typeof CONSOLIDATION_CHECK_BUCKETS)[number];

const BUCKET_OF: Record<ConsolidationClusterKind, ConsolidationCheckBucket> = {
	twins: 'duplicate_docs',
	duplicate_tasks: 'duplicate_tasks',
	versions: 'outdated_docs',
	superseded: 'outdated_docs',
	fragments: 'overlapping_docs',
	finished_tasks: 'finished_tasks',
	misfiled: 'other',
	task_parts: 'other',
	task_sequence: 'other',
	sibling_tasks: 'other'
};

export const CHECK_SUMMARY_GROUP_LIMIT = 8;

export type ConsolidationCheckItem = {
	id: string;
	title: string;
	project_id: string;
	project_name: string;
};

export type ConsolidationCheckGroup = {
	key: string;
	kind: ConsolidationClusterKind;
	kind_label: string;
	bucket: ConsolidationCheckBucket;
	title: string;
	reason: string;
	/** Items sit in two or more projects: what a nest or a combine would bring together. */
	cross_project: boolean;
	documents: ConsolidationCheckItem[];
	tasks: ConsolidationCheckItem[];
	/** Superseded docs: the newer doc that covers them. */
	newer?: ConsolidationCheckItem;
	/** Finished tasks: the doc that shows the work was done. */
	evidence?: ConsolidationCheckItem;
	/** Misfiled: the project the items belong in. */
	belongs_in?: { id: string; name: string };
};

export type ConsolidationCheckCount = { groups: number; documents: number; tasks: number };

export type ConsolidationCheckSummary = {
	run_id: string;
	/** running: still surveying. done: groups below are final. */
	state: 'running' | 'done' | 'failed' | 'cancelled';
	root_project_id: string;
	/** In scope order; the first is the root (where things would end up). */
	projects: Array<{ id: string; name: string }>;
	/** What the check read; null until the survey has loaded the projects. */
	scanned: { documents: number | null; tasks: number | null };
	counts: Record<ConsolidationCheckBucket, ConsolidationCheckCount>;
	total_groups: number;
	/** The top groups: across projects first, then duplicates before the rest. */
	groups: ConsolidationCheckGroup[];
	more_groups: number;
	/** One plain sentence for a card. */
	headline: string;
	cost_usd: number;
	error: string | null;
	/** The run page: a read-only summary with "Review and merge" for a check. */
	review_path: string;
};

/** The run fields the summary reads (a consolidation_runs row, or the web's run view). */
export type ConsolidationCheckRunInput = {
	id: string;
	root_project_id: string;
	project_ids: string[];
	status: string;
	plan: ConsolidationPlan | null | unknown;
	progress?: unknown;
	cost_usd?: number | string | null;
	error?: string | null;
};

const BUCKET_RANK = new Map(CONSOLIDATION_CHECK_BUCKETS.map((bucket, index) => [bucket, index]));

function asPlan(value: unknown): ConsolidationPlan | null {
	return value &&
		typeof value === 'object' &&
		Array.isArray((value as ConsolidationPlan).clusters)
		? (value as ConsolidationPlan)
		: null;
}

function num(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function joinAnd(parts: string[]): string {
	if (parts.length <= 1) return parts.join('');
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function stateOf(status: string): ConsolidationCheckSummary['state'] {
	if (status === 'failed') return 'failed';
	if (status === 'cancelled') return 'cancelled';
	if (status === 'surveying') return 'running';
	return 'done';
}

/**
 * Turns a check run into a chat- or card-ready summary. Works on a full run's
 * plan too (its groups, before any decision). `visibleProjectIds`, when given,
 * hides the titles of items in projects the viewer can no longer open.
 */
export function summarizeConsolidationCheck(
	run: ConsolidationCheckRunInput,
	options: {
		limit?: number;
		/** Names to use before the survey has stored the plan. */
		projectNames?: Record<string, string>;
		visibleProjectIds?: ReadonlySet<string>;
	} = {}
): ConsolidationCheckSummary {
	const plan = asPlan(run.plan);
	const limit = Math.max(0, options.limit ?? CHECK_SUMMARY_GROUP_LIMIT);
	const visible = options.visibleProjectIds;
	const projectName = (id: string) =>
		plan?.projects[id]?.name ?? options.projectNames?.[id] ?? 'another project';
	const hidden = (projectId: string) => Boolean(visible && !visible.has(projectId));

	const docItem = (id: string): ConsolidationCheckItem => {
		const doc = plan?.documents[id];
		const projectId = doc?.project_id ?? '';
		return {
			id,
			title: hidden(projectId) ? 'A doc you can no longer see' : (doc?.title ?? 'Untitled'),
			project_id: projectId,
			project_name: projectName(projectId)
		};
	};
	const taskItem = (id: string): ConsolidationCheckItem => {
		const task = plan?.tasks?.[id];
		const projectId = task?.project_id ?? '';
		return {
			id,
			title: hidden(projectId)
				? 'A task you can no longer see'
				: (task?.title ?? 'Untitled task'),
			project_id: projectId,
			project_name: projectName(projectId)
		};
	};

	const counts = Object.fromEntries(
		CONSOLIDATION_CHECK_BUCKETS.map((bucket) => [bucket, { groups: 0, documents: 0, tasks: 0 }])
	) as Record<ConsolidationCheckBucket, ConsolidationCheckCount>;

	const groups = (plan?.clusters ?? []).map((cluster: ConsolidationCluster, index) => {
		const bucket = BUCKET_OF[cluster.kind] ?? 'other';
		const documents = cluster.document_ids.map(docItem);
		const tasks = (cluster.task_ids ?? []).map(taskItem);
		counts[bucket].groups += 1;
		counts[bucket].documents += documents.length;
		counts[bucket].tasks += tasks.length;
		const newer = cluster.newer_id ? docItem(cluster.newer_id) : undefined;
		const evidence = cluster.evidence_id ? docItem(cluster.evidence_id) : undefined;
		const projects = new Set(
			[...documents, ...tasks, ...(newer ? [newer] : [])]
				.map((item) => item.project_id)
				.filter(Boolean)
		);
		const group: ConsolidationCheckGroup = {
			key: cluster.key,
			kind: cluster.kind,
			kind_label: CONSOLIDATION_KIND_LABELS[cluster.kind] ?? cluster.kind,
			bucket,
			title: cluster.title,
			reason: cluster.reason,
			cross_project: projects.size > 1,
			documents,
			tasks,
			...(newer ? { newer } : {}),
			...(evidence ? { evidence } : {}),
			...(cluster.belongs_in
				? { belongs_in: { id: cluster.belongs_in, name: projectName(cluster.belongs_in) } }
				: {})
		};
		return { group, index };
	});

	const ranked = [...groups]
		.sort(
			(a, b) =>
				Number(b.group.cross_project) - Number(a.group.cross_project) ||
				(BUCKET_RANK.get(a.group.bucket) ?? 99) - (BUCKET_RANK.get(b.group.bucket) ?? 99) ||
				a.index - b.index
		)
		.map((entry) => entry.group);

	const projects = run.project_ids.map((id) => ({ id, name: projectName(id) }));
	const state = stateOf(run.status);
	const progress =
		run.progress && typeof run.progress === 'object'
			? (run.progress as Record<string, unknown>)
			: {};

	return {
		run_id: run.id,
		state,
		root_project_id: run.root_project_id,
		projects,
		scanned: { documents: num(progress.documents), tasks: num(progress.tasks) },
		counts,
		total_groups: ranked.length,
		groups: ranked.slice(0, limit),
		more_groups: Math.max(0, ranked.length - limit),
		headline: headline(state, counts, ranked.length, projects),
		cost_usd: Number(run.cost_usd) || 0,
		error: run.error ?? null,
		review_path: `/projects/${run.root_project_id}/consolidate/${run.id}`
	};
}

function headline(
	state: ConsolidationCheckSummary['state'],
	counts: Record<ConsolidationCheckBucket, ConsolidationCheckCount>,
	groups: number,
	projects: Array<{ name: string }>
): string {
	const where =
		projects.length === 2
			? `${projects[0]!.name} and ${projects[1]!.name}`
			: plural(projects.length, 'project');
	if (state === 'running') return `Checking ${where} for duplicates…`;
	if (state === 'failed') return 'The duplicate check did not finish. Nothing changed.';
	if (state === 'cancelled') return 'The duplicate check was cancelled. Nothing changed.';
	if (groups === 0) return `No duplicates found across ${where}.`;
	const parts: string[] = [];
	if (counts.duplicate_docs.documents)
		parts.push(plural(counts.duplicate_docs.documents, 'identical doc'));
	if (counts.duplicate_tasks.tasks)
		parts.push(plural(counts.duplicate_tasks.tasks, 'duplicate task'));
	if (counts.outdated_docs.documents)
		parts.push(plural(counts.outdated_docs.documents, 'outdated doc'));
	if (counts.overlapping_docs.documents)
		parts.push(plural(counts.overlapping_docs.documents, 'overlapping doc'));
	if (counts.finished_tasks.tasks)
		parts.push(plural(counts.finished_tasks.tasks, 'finished or stale task'));
	if (counts.other.groups) parts.push(plural(counts.other.groups, 'other group'));
	return `Found ${joinAnd(parts)} across ${where}.`;
}
