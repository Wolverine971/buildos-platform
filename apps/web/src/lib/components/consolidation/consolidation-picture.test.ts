// apps/web/src/lib/components/consolidation/consolidation-picture.test.ts
import { describe, expect, it } from 'vitest';
import type { ConsolidationPlan } from '@buildos/shared-agent-ops/consolidation';
import { consolidationPicture } from './consolidation-picture';

const plan: ConsolidationPlan = {
	version: 1,
	clusters: [],
	documents: {
		d1: { title: 'Rod intake', project_id: 'wayne' },
		d2: { title: 'Rod plan', project_id: 'wayne' },
		d3: { title: 'Old brief', project_id: 'wayne' }
	},
	tasks: {
		kit: { title: 'Twitter brand kit', project_id: 'buildos' },
		guides: { title: 'Twitter guidelines', project_id: 'buildos' },
		palette: { title: 'Twitter palette', project_id: 'buildos' },
		script: { title: 'Script launch video', project_id: 'buildos' },
		a: { title: 'Hannibal outreach', project_id: 'hannibal' },
		b: { title: 'Julian outreach', project_id: 'julian' }
	},
	projects: {
		wayne: { name: 'Wayne Strategies', parent: true },
		buildos: { name: 'BuildOS', parent: false },
		beyond: { name: 'Beyond Exit Planning', parent: false }
	}
};
const names = {
	document: (id: string) => plan.documents[id]?.title ?? id,
	task: (id: string) => plan.tasks?.[id]?.title ?? id,
	project: (id: string) => plan.projects[id]?.name ?? id
};

describe('consolidationPicture', () => {
	it('counts tasks and docs before and after, and names what happened', () => {
		const picture = consolidationPicture(
			[
				{ op: 'merge_tasks', task_ids: ['guides', 'palette'], keep_id: 'kit' },
				{
					op: 'close_tasks',
					task_ids: ['script'],
					how: 'done',
					evidence_document_id: 'd3',
					note: 'The script exists.'
				},
				{
					op: 'rollup_tasks',
					task_ids: ['a', 'b'],
					project_id: 'wayne',
					title: 'Send outreach (2)'
				},
				{ op: 'move', document_ids: ['d1', 'd2'], target_project_id: 'beyond' },
				{ op: 'archive', document_ids: ['d3'], replaced_by_id: null }
			],
			plan,
			names
		);
		// 6 tasks: 3 become 1, 1 closed, 1 roll-up added → 6 - 2 - 1 + 1.
		expect(picture.tasks).toEqual({ before: 6, after: 4 });
		expect(picture.docs).toEqual({ before: 3, after: 2 });
		expect(picture.facts).toEqual([
			'3 tasks merged into 1',
			'1 task closed',
			'1 roll-up task',
			'1 doc archived',
			'2 docs moved'
		]);
		const merge = picture.rows.find((row) => row.kind === 'merge');
		expect(merge).toMatchObject({
			what: 'task',
			into: { title: 'Twitter brand kit' },
			from: [
				{ title: 'Twitter brand kit' },
				{ title: 'Twitter guidelines' },
				{ title: 'Twitter palette' }
			]
		});
		// Moves are grouped by where they go.
		expect(picture.rows.filter((row) => row.kind === 'move')).toEqual([
			expect.objectContaining({
				from: 'Wayne Strategies',
				to: 'Beyond Exit Planning',
				items: [expect.anything(), expect.anything()]
			})
		]);
	});
});
