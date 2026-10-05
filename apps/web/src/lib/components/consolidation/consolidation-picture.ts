// apps/web/src/lib/components/consolidation/consolidation-picture.ts
//
// The before → after picture of a consolidation run (DJ, 2026-10-04: "see the
// number of tasks converted down to what tasks, and if two tasks got merged
// into one, see that"). Built from the run's operations, so the same picture
// previews what Apply will do and records what it did.
import {
	isTaskOp,
	type ConsolidationOp,
	type ConsolidationPlan
} from '@buildos/shared-agent-ops/consolidation';

export type PictureItem = { id: string | null; title: string; project: string };

export type PictureRow =
	| { kind: 'merge'; what: 'task' | 'doc'; from: PictureItem[]; into: PictureItem }
	| { kind: 'plan'; name: string; project: string; sequence: boolean; items: PictureItem[] }
	| { kind: 'rollup'; into: PictureItem; items: PictureItem[] }
	| { kind: 'close'; how: 'done' | 'archived'; note: string; items: PictureItem[] }
	| { kind: 'move'; what: 'task' | 'doc'; from: string; to: string; items: PictureItem[] }
	| { kind: 'archive'; note: string | null; items: PictureItem[] };

export type PictureCount = { before: number; after: number };

export type ConsolidationPictureModel = {
	tasks: PictureCount;
	docs: PictureCount;
	/** Short facts for the summary line, e.g. "3 tasks merged into 1". */
	facts: string[];
	rows: PictureRow[];
};

type Names = {
	document: (id: string) => string;
	task: (id: string) => string;
	project: (id: string) => string;
};

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function consolidationPicture(
	ops: readonly ConsolidationOp[],
	plan: ConsolidationPlan,
	names: Names
): ConsolidationPictureModel {
	const doc = (id: string): PictureItem => ({
		id,
		title: names.document(id),
		project: names.project(plan.documents[id]?.project_id ?? '')
	});
	const task = (id: string): PictureItem => ({
		id,
		title: names.task(id),
		project: names.project(plan.tasks?.[id]?.project_id ?? '')
	});
	const rows: PictureRow[] = [];
	const tally = {
		tasksMerged: 0,
		tasksInto: 0,
		tasksClosed: 0,
		plans: 0,
		rollups: 0,
		tasksMoved: 0,
		docsMerged: 0,
		docsInto: 0,
		docsArchived: 0,
		docsMoved: 0
	};
	// Moves read best grouped by where they go.
	const moves = new Map<string, Extract<PictureRow, { kind: 'move' }>>();
	const addMove = (what: 'task' | 'doc', from: string, to: string, item: PictureItem) => {
		const key = `${what}:${from}:${to}`;
		const row = moves.get(key) ?? { kind: 'move' as const, what, from, to, items: [] };
		row.items.push(item);
		moves.set(key, row);
	};

	for (const op of ops) {
		if (op.op === 'keep') continue;
		if (op.op === 'merge_tasks') {
			rows.push({
				kind: 'merge',
				what: 'task',
				from: [op.keep_id, ...op.task_ids].map(task),
				into: task(op.keep_id)
			});
			tally.tasksMerged += op.task_ids.length + 1;
			tally.tasksInto += 1;
		} else if (op.op === 'plan_tasks') {
			rows.push({
				kind: 'plan',
				name: op.name,
				project: names.project(op.project_id),
				sequence: op.sequence,
				items: op.task_ids.map(task)
			});
			tally.plans += 1;
		} else if (op.op === 'rollup_tasks') {
			rows.push({
				kind: 'rollup',
				into: { id: null, title: op.title, project: names.project(op.project_id) },
				items: op.task_ids.map(task)
			});
			tally.rollups += 1;
		} else if (op.op === 'close_tasks') {
			rows.push({ kind: 'close', how: op.how, note: op.note, items: op.task_ids.map(task) });
			tally.tasksClosed += op.task_ids.length;
		} else if (op.op === 'move_tasks') {
			for (const id of op.task_ids)
				addMove('task', task(id).project, names.project(op.target_project_id), task(id));
			tally.tasksMoved += op.task_ids.length;
		} else if (op.op === 'merge') {
			rows.push({
				kind: 'merge',
				what: 'doc',
				from: op.document_ids.map(doc),
				into: { id: null, title: op.title, project: names.project(op.target_project_id) }
			});
			tally.docsMerged += op.document_ids.length;
			tally.docsInto += 1;
		} else if (op.op === 'archive') {
			rows.push({
				kind: 'archive',
				note: op.replaced_by_id ? `Points to “${names.document(op.replaced_by_id)}”` : null,
				items: op.document_ids.map(doc)
			});
			tally.docsArchived += op.document_ids.length;
		} else if (op.op === 'move') {
			for (const id of op.document_ids)
				addMove('doc', doc(id).project, names.project(op.target_project_id), doc(id));
			tally.docsMoved += op.document_ids.length;
		} else if (isTaskOp(op)) {
			// Every task op is handled above; a new one shows up here first.
			continue;
		}
	}
	rows.push(...moves.values());

	const taskTotal = Object.keys(plan.tasks ?? {}).length;
	const docTotal = Object.keys(plan.documents).length;
	const facts: string[] = [];
	if (tally.tasksMerged)
		facts.push(`${plural(tally.tasksMerged, 'task')} merged into ${tally.tasksInto}`);
	if (tally.tasksClosed) facts.push(`${plural(tally.tasksClosed, 'task')} closed`);
	if (tally.plans) facts.push(`${plural(tally.plans, 'new plan')}`);
	if (tally.rollups) facts.push(`${plural(tally.rollups, 'roll-up task')}`);
	if (tally.tasksMoved) facts.push(`${plural(tally.tasksMoved, 'task')} moved`);
	if (tally.docsMerged)
		facts.push(`${plural(tally.docsMerged, 'doc')} merged into ${tally.docsInto}`);
	if (tally.docsArchived) facts.push(`${plural(tally.docsArchived, 'doc')} archived`);
	if (tally.docsMoved) facts.push(`${plural(tally.docsMoved, 'doc')} moved`);

	return {
		tasks: {
			before: taskTotal,
			after:
				taskTotal -
				(tally.tasksMerged - tally.tasksInto) -
				tally.tasksClosed +
				tally.rollups
		},
		docs: {
			before: docTotal,
			after: docTotal - tally.docsArchived - tally.docsMerged + tally.docsInto
		},
		facts,
		rows
	};
}
