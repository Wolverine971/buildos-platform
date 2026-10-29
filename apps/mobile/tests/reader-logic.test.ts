// apps/mobile/tests/reader-logic.test.ts
import { describe, expect, it } from 'vitest';

import { orderDocs } from '@/lib/doc-order';
import { civilDay, describeDue, duePicks, isDueOn } from '@/lib/due-date';
import { inlineText, parseMarkdown } from '@/lib/markdown';
import { getReaderWalk, setReaderWalk, walkPosition } from '@/lib/reader-walk';
import { bucketOf, fetchWholeBucket, groupTasks } from '@/lib/task-buckets';

const NOW = new Date('2026-10-29T15:00:00Z');

const task = (
	id: string,
	fields: Partial<{
		state_key: 'todo' | 'in_progress' | 'blocked' | 'done';
		due_at: string | null;
		start_at: string | null;
		priority: number | null;
		updated_at: string;
	}> = {}
) => ({
	id,
	title: id,
	state_key: 'todo' as const,
	due_at: null,
	start_at: null,
	priority: null,
	updated_at: '2026-10-20T00:00:00Z',
	...fields
});

describe('task buckets (same rule as the server)', () => {
	it('classifies like get_project_full', () => {
		expect(
			bucketOf(task('a', { state_key: 'done', due_at: '2026-10-01T00:00:00Z' }), NOW)
		).toBe('done');
		expect(
			bucketOf(task('b', { state_key: 'in_progress', due_at: '2026-10-28T00:00:00Z' }), NOW)
		).toBe('overdue');
		expect(bucketOf(task('c', { due_at: '2026-11-02T00:00:00Z' }), NOW)).toBe('scheduled');
		expect(bucketOf(task('d', { start_at: '2026-11-02T00:00:00Z' }), NOW)).toBe('scheduled');
		expect(
			bucketOf(task('e', { state_key: 'in_progress', due_at: '2026-11-02T00:00:00Z' }), NOW)
		).toBe('in_progress');
		expect(bucketOf(task('f', { state_key: 'blocked' }), NOW)).toBe('blocked');
		expect(bucketOf(task('g'), NOW)).toBe('backlog');
	});

	it('orders groups by attention and tasks by due date, then priority', () => {
		const groups = groupTasks(
			[
				task('done-old', { state_key: 'done', updated_at: '2026-10-01T00:00:00Z' }),
				task('later', { due_at: '2026-11-10T00:00:00Z' }),
				task('sooner', { due_at: '2026-11-01T00:00:00Z' }),
				task('late', { due_at: '2026-10-20T00:00:00Z' }),
				task('p1', { priority: 1 }),
				task('p5', { priority: 5 }),
				task('done-new', { state_key: 'done', updated_at: '2026-10-28T00:00:00Z' })
			],
			NOW
		);
		expect(groups.map((group) => group.label)).toEqual([
			'Overdue',
			'Scheduled',
			'To do',
			'Done'
		]);
		expect(groups[1]!.tasks.map((t) => t.id)).toEqual(['sooner', 'later']);
		expect(groups[2]!.tasks.map((t) => t.id)).toEqual(['p1', 'p5']);
		expect(groups[3]!.tasks.map((t) => t.id)).toEqual(['done-new', 'done-old']);
	});
});

describe('show all', () => {
	it('pages through a group bigger than one call allows', async () => {
		const all = Array.from({ length: 250 }, (_, i) => ({ id: `t${i}` }));
		const offsets: number[] = [];
		const result = await fetchWholeBucket(async (offset) => {
			offsets.push(offset);
			const tasks = all.slice(offset, offset + 100);
			const next = offset + tasks.length;
			return {
				tasks,
				total: all.length,
				hasMore: next < all.length,
				nextOffset: next < all.length ? next : null
			};
		});
		expect(offsets).toEqual([0, 100, 200]);
		expect(result).toMatchObject({ total: 250, complete: true });
		expect(result.tasks).toHaveLength(250);
	});

	it('stops when the server does not move forward', async () => {
		const result = await fetchWholeBucket(async () => ({
			tasks: [{ id: 'same' }],
			total: 5,
			hasMore: true,
			nextOffset: 0
		}));
		expect(result.tasks).toHaveLength(1);
	});
});

describe('doc order', () => {
	const doc = (id: string, updated = '2026-10-01T00:00:00Z') => ({
		id,
		title: id,
		updated_at: updated
	});

	it('follows the doc tree with depth, then lists docs the tree misses, newest first', () => {
		const docs = [
			doc('a'),
			doc('b'),
			doc('c'),
			doc('stray-old'),
			doc('stray-new', '2026-10-28T00:00:00Z')
		];
		const structure = {
			version: 1,
			root: [
				{ id: 'b', order: 1 },
				{ id: 'a', order: 0, children: [{ id: 'c', order: 0 }] },
				{ id: 'folder', type: 'folder', order: 2, children: [{ id: 'missing', order: 0 }] }
			]
		};
		expect(orderDocs(docs, structure).map((entry) => [entry.doc.id, entry.depth])).toEqual([
			['a', 0],
			['c', 1],
			['b', 0],
			['stray-new', 0],
			['stray-old', 0]
		]);
	});

	it('copes with no tree at all', () => {
		expect(orderDocs([doc('x')], null).map((entry) => entry.doc.id)).toEqual(['x']);
	});

	it('leaves archived docs out, as the website does', () => {
		const docs = [doc('kept'), { ...doc('gone'), state_key: 'archived' }];
		expect(
			orderDocs(docs, { version: 1, root: [{ id: 'gone', order: 0 }] }).map((e) => e.doc.id)
		).toEqual(['kept']);
	});
});

describe('due dates', () => {
	const thursday = new Date(2026, 9, 29, 9, 30);

	it('offers today, tomorrow and next Monday as civil days', () => {
		expect(duePicks(thursday).map((pick) => pick.day)).toEqual([
			'2026-10-29',
			'2026-10-30',
			'2026-11-02'
		]);
		const sunday = new Date(2026, 10, 1, 9);
		expect(duePicks(sunday).map((pick) => pick.day)).toEqual([
			'2026-11-01',
			'2026-11-02',
			'2026-11-09'
		]);
		const monday = new Date(2026, 10, 2, 9);
		expect(duePicks(monday)[2]!.day).toBe('2026-11-09');
		// Sent as the end of that day on this phone, so it reads back as the same day.
		const today = duePicks(thursday)[0]!;
		expect(isDueOn(today.value, today.day)).toBe(true);
		expect(describeDue(today.value, thursday)).toBe('Due today');
	});

	it('describes a due date relative to now', () => {
		expect(describeDue(null, thursday)).toBeNull();
		expect(describeDue(new Date(2026, 9, 29, 23).toISOString(), thursday)).toBe('Due today');
		expect(describeDue(new Date(2026, 9, 30, 12).toISOString(), thursday)).toBe('Due tomorrow');
		expect(describeDue(new Date(2026, 9, 27, 12).toISOString(), thursday)).toMatch(
			/^Overdue · /
		);
		expect(describeDue(new Date(2026, 11, 25, 12).toISOString(), thursday)).toMatch(/^Due /);
	});

	it('matches a stored timestamp to a civil day', () => {
		expect(civilDay(thursday)).toBe('2026-10-29');
		expect(isDueOn(new Date(2026, 9, 29, 17).toISOString(), '2026-10-29')).toBe(true);
		expect(isDueOn(null, '2026-10-29')).toBe(false);
	});
});

describe('reader walk', () => {
	it('finds neighbours in the list the opening screen set', () => {
		setReaderWalk({
			label: 'Today',
			items: [
				{ kind: 'task', id: 't1' },
				{ kind: 'task', id: 't2' },
				{ kind: 'task', id: 't3' }
			]
		});
		const walk = getReaderWalk();
		expect(walkPosition(walk, { kind: 'task', id: 't2' })).toEqual({
			index: 1,
			total: 3,
			prev: { kind: 'task', id: 't1' },
			next: { kind: 'task', id: 't3' }
		});
		expect(walkPosition(walk, { kind: 'task', id: 't1' })?.prev).toBeNull();
		expect(walkPosition(walk, { kind: 'document', id: 't1' })).toBeNull();
		setReaderWalk({ label: 'Empty', items: [] });
		expect(getReaderWalk()).toBeNull();
	});
});

describe('markdown', () => {
	it('parses the shapes BuildOS docs use', () => {
		const blocks = parseMarkdown(
			[
				'# Plan',
				'',
				'Ship **the beta** by _Friday_, see [notes](https://build-os.com/x) and `code`.',
				'',
				'- [x] Draft invite',
				'- [ ] Send it',
				'',
				'1. First',
				'2. Second',
				'',
				'> A quote',
				'',
				'```ts',
				'const a = 1;',
				'```',
				'',
				'---',
				'',
				'| Who | When |',
				'| --- | ---- |',
				'| DJ  | Thu  |',
				'',
				'<div>raw &amp; html</div>'
			].join('\n')
		);
		expect(blocks.map((block) => block.kind)).toEqual([
			'heading',
			'paragraph',
			'list',
			'list',
			'quote',
			'code',
			'rule',
			'table',
			'paragraph'
		]);
		const paragraph = blocks[1]!;
		expect(paragraph.kind === 'paragraph' && inlineText(paragraph.inline)).toBe(
			'Ship the beta by Friday, see notes and code.'
		);
		const tasks = blocks[2]!;
		expect(tasks.kind === 'list' && tasks.items.map((item) => item.checked)).toEqual([
			true,
			false
		]);
		const ordered = blocks[3]!;
		expect(ordered.kind === 'list' && [ordered.ordered, ordered.start]).toEqual([true, 1]);
		const table = blocks[7]!;
		expect(table.kind === 'table' && table.rows[0]!.map(inlineText)).toEqual(['DJ', 'Thu']);
		const html = blocks[8]!;
		expect(html.kind === 'paragraph' && inlineText(html.inline)).toContain('raw');
	});

	it('returns nothing for empty text', () => {
		expect(parseMarkdown('')).toEqual([]);
		expect(parseMarkdown(null)).toEqual([]);
	});
});
