// apps/web/src/lib/tests/layout-shift/judge.test.ts
import { describe, expect, it } from 'vitest';
import { judgeStep, type PageShot, type StepExpectation } from './judge';

function shot(overrides: Partial<PageShot> = {}): PageShot {
	return {
		path: '/projects',
		scrollY: 0,
		anchors: {
			panes: { stamp: '1', top: 100, left: 0, height: 600 },
			list: { stamp: '2', top: 100, left: 0, height: 600 },
			reader: { stamp: '3', top: 100, left: 400, height: 600 },
			readerHead: { stamp: '4', top: 100, left: 400, height: 40 },
			card: { stamp: '5', top: 80, left: 0, height: 700 }
		},
		rows: [
			{ title: 'A', top: 120, stamp: 'a' },
			{ title: 'B', top: 160, stamp: 'b' },
			{ title: 'C', top: 200, stamp: 'c' }
		],
		selected: 'B',
		readerTitle: 'B',
		shiftScore: 0,
		shiftSources: [],
		...overrides
	};
}

const STATUS: StepExpectation = {
	keep: ['panes', 'list', 'reader', 'card'],
	still: ['readerHead', 'card'],
	rowOrder: 'same',
	selectedRowStill: true,
	readerOpen: true
};

describe('judgeStep', () => {
	it('passes when nothing moves', () => {
		expect(judgeStep(shot(), shot(), STATUS)).toEqual([]);
	});

	it('catches the card closing (the invalidate bug)', () => {
		const after = shot({ anchors: {}, rows: [], selected: null, readerTitle: null });
		const rules = judgeStep(shot(), after, STATUS).map((finding) => finding.rule);
		expect(rules).toContain('closed');
		expect(rules).toContain('reader-closed');
	});

	it('catches a remount even when it lands in the same place', () => {
		const before = shot();
		const after = shot({
			anchors: { ...before.anchors, card: { ...before.anchors.card!, stamp: '99' } }
		});
		expect(judgeStep(before, after, STATUS).map((finding) => finding.rule)).toEqual([
			'remounted'
		]);
	});

	it('catches the changed row jumping to the top', () => {
		const after = shot({
			rows: [
				{ title: 'B', top: 120, stamp: 'b' },
				{ title: 'A', top: 160, stamp: 'a' },
				{ title: 'C', top: 200, stamp: 'c' }
			]
		});
		const rules = judgeStep(shot(), after, STATUS).map((finding) => finding.rule);
		expect(rules).toEqual(['reordered', 'open-row-moved']);
	});

	it('catches the done row leaving the list while it is open', () => {
		const after = shot({
			rows: [
				{ title: 'A', top: 120, stamp: 'a' },
				{ title: 'C', top: 160, stamp: 'c' }
			]
		});
		const rules = judgeStep(shot(), after, STATUS).map((finding) => finding.rule);
		expect(rules).toContain('row-vanished');
		expect(rules).toContain('open-row-vanished');
	});

	it('allows the expected removal and checks it happened', () => {
		const expectation: StepExpectation = {
			...STATUS,
			removed: ['B'],
			selectedRowStill: false,
			readerTitle: 'any'
		};
		const after = shot({
			rows: [
				{ title: 'A', top: 120, stamp: 'a' },
				{ title: 'C', top: 160, stamp: 'c' }
			],
			readerTitle: 'C'
		});
		expect(judgeStep(shot(), after, expectation)).toEqual([]);
		expect(judgeStep(shot(), shot(), expectation).map((finding) => finding.rule)).toEqual([
			'row-stayed'
		]);
	});

	it('catches the reader snapping back to another item', () => {
		const rules = judgeStep(shot(), shot({ readerTitle: 'A' }), STATUS).map(
			(finding) => finding.rule
		);
		expect(rules).toEqual(['reader-jumped']);
	});

	it('ignores anchors a surface does not have', () => {
		const before = shot();
		const { card: _card, ...rest } = before.anchors;
		const noCard = shot({ anchors: rest });
		expect(judgeStep(noCard, noCard, STATUS)).toEqual([]);
	});
});
