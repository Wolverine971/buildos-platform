// apps/web/src/lib/server/dump-sort/dump-sort-thread-core.test.ts
import { describe, expect, it } from 'vitest';
import { buildContextFinderEntities } from '@buildos/agentic-chat-runtime/context-finder';
import {
	buildThreadPrompt,
	readThreadLine,
	updateFields,
	type ThreadRecord
} from './dump-sort-thread-core';
import { REPLAY_RECORDS, REPLAY_THREADS } from './dump-sort-replay';

const task: ThreadRecord = {
	ref: 't1',
	id: 'task-1',
	kind: 'task',
	title: 'Email Priya about cover sketches',
	state: 'todo',
	due: '2026-11-14',
	description: 'Ask for two cover directions.',
	p: 0.9,
	tier: 'full'
};
const known = () => ({ records: new Map([['t1', task]]), pieces: new Set([4, 5]) });

describe('updateFields', () => {
	it('keeps only fields that change, with the current value as before', () => {
		expect(
			updateFields(task, {
				due: '2026-11-07',
				state: 'todo',
				title: task.title,
				add: 'Serif title'
			})
		).toEqual([
			{ field: 'due', before: '2026-11-14', after: '2026-11-07' },
			{ field: 'add', before: 'Ask for two cover directions.', after: 'Serif title' }
		]);
		expect(updateFields(task, { due: 'next week' })).toEqual([]);
	});
});

describe('readThreadLine', () => {
	it('reads each op and resolves refs to records', () => {
		const update = readThreadLine(
			'{"piece":4,"op":"update","ref":"t1","set":{"state":"done"},"why":"finished"}',
			known()
		);
		expect(update).toMatchObject({
			type: 'change',
			change: {
				op: 'update',
				record: { id: 'task-1' },
				fields: [{ field: 'state', after: 'done' }]
			}
		});
		expect(
			readThreadLine(
				'{"piece":5,"op":"create","kind":"task","title":"Book the venue"}',
				known()
			)
		).toMatchObject({
			type: 'change',
			change: { op: 'create', kind: 'task', title: 'Book the venue' }
		});
		expect(
			readThreadLine(
				'{"piece":5,"op":"answer","text":"Tuesdays.","refs":["t1","zz"]}',
				known()
			)
		).toMatchObject({ type: 'change', change: { op: 'answer', records: [{ ref: 't1' }] } });
		expect(readThreadLine('{"piece":4,"op":"covered","ref":"t1"}', known())).toMatchObject({
			change: { op: 'covered' }
		});
	});

	it('skips unknown pieces, refs, ops, and empty updates', () => {
		expect(readThreadLine('{"piece":9,"op":"covered","ref":"t1"}', known()).type).toBe('skip');
		expect(
			readThreadLine('{"piece":4,"op":"update","ref":"t9","set":{"state":"done"}}', known())
				.type
		).toBe('skip');
		expect(readThreadLine('{"piece":4,"op":"update","ref":"t1","set":{}}', known()).type).toBe(
			'skip'
		);
		expect(readThreadLine('{"piece":4,"op":"merge","ref":"t1"}', known()).type).toBe('skip');
	});
});

describe('replay threads', () => {
	it('every scripted decision resolves against the finder refs of its replay project', () => {
		for (const [projectId, script] of Object.entries(REPLAY_THREADS)) {
			const entities = buildContextFinderEntities(REPLAY_RECORDS[projectId]!);
			const records = new Map(
				entities.map((entity) => [
					entity.ref,
					{
						ref: entity.ref,
						id: entity.id,
						kind: entity.kind,
						title: entity.title,
						state: null,
						due: null,
						description: null,
						p: null,
						tier: 'full'
					} as ThreadRecord
				])
			);
			for (const pick of script.pick)
				expect(entities.some((e) => e.id === pick.id)).toBe(true);
			const pieces = new Set(
				script.answer.split('\n').map((line) => JSON.parse(line).piece as number)
			);
			for (const line of script.answer.split('\n')) {
				expect(readThreadLine(line, { records, pieces }).type).toBe('change');
			}
		}
	});

	it('builds a prompt with pieces, related records, and other titles', () => {
		const prompt = buildThreadPrompt({
			projectName: 'Fading Crown',
			projectDescription: null,
			today: 'Wed 2026-11-04',
			pieces: [{ n: 5, kind: 'task', quote: 'email Priya', title: 'Email Priya', due: null }],
			records: [task],
			others: [{ ...task, ref: 't2', title: 'Line edit Act I', tier: 'summary' }]
		});
		expect(prompt).toContain('[5] (task) "email Priya"');
		expect(prompt).toContain(
			't1 · task · Email Priya about cover sketches [todo, due 2026-11-14]'
		);
		expect(prompt).toContain('Other records (titles only):\nt2 · task · Line edit Act I');
	});
});
