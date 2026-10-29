// apps/mobile/tests/desktop.test.ts
import type { DesktopProject } from '@buildos/api-client';
import { describe, expect, it } from 'vitest';

import {
	arrangeDesktop,
	estimateLines,
	filterByName,
	gridColumns,
	groupByPulse,
	hasLook,
	meterColors,
	monogram,
	nestedCounts,
	nestedStamp,
	openTaskCount,
	overdueBadgeText,
	PEEK,
	peekLayout,
	peekNextStep,
	PULSE_META,
	PULSES,
	pulsePillColors,
	sortRecent,
	TASK_BUCKETS,
	taskSegments,
	tileAccessibilityLabel,
	tilePalette,
	topLevel
} from '@/lib/desktop';
import {
	colorMix,
	contrastRatio,
	inkprintDark,
	inkprintLight,
	pulseColors,
	withAlpha
} from '@/theme';

const T0 = Date.parse('2026-10-29T12:00:00Z');
const HOUR = 3_600_000;
const at = (hoursAgo: number) => new Date(T0 - hoursAgo * HOUR).toISOString();

let seq = 0;
function tile(overrides: Partial<DesktopProject> = {}): DesktopProject {
	seq += 1;
	return {
		id: `p${seq}`,
		name: `Project ${seq}`,
		kind: 'project',
		state_key: 'active',
		updated_at: at(100),
		last_touch_at: null,
		next_step_short: null,
		emoji: null,
		parent_project_id: null,
		pulse: null,
		pulse_reason: '',
		bars: { docs: 0, tasks: 0 },
		mix: { overdue: 0, in_progress: 0, scheduled: 0, backlog: 0 },
		open_tasks: 0,
		document_count: 0,
		task_count: 0,
		...overrides
	};
}

const ids = (list: readonly DesktopProject[]) => list.map((project) => project.id);

describe('which projects are tiles', () => {
	const workspace = tile({ id: 'ws', name: 'Workspace', kind: 'workspace' });
	const parent = tile({ id: 'parent', name: 'BuildOS' });
	const child = tile({ id: 'child', parent_project_id: 'parent' });
	const grandchild = tile({ id: 'grandchild', parent_project_id: 'child' });
	const orphan = tile({ id: 'orphan', parent_project_id: 'not-visible' });
	const inWorkspace = tile({ id: 'in-ws', parent_project_id: 'ws' });
	const all = [workspace, parent, child, grandchild, orphan, inWorkspace];

	it('topLevel hides the Workspace and projects whose parent is a tile', () => {
		expect(ids(topLevel(all))).toEqual(['parent', 'orphan', 'in-ws']);
	});

	it('nestedCounts counts direct sub-projects of tile parents only', () => {
		const counts = nestedCounts(all);
		expect(counts.get('parent')).toBe(1);
		expect(counts.get('child')).toBe(1);
		expect(counts.has('not-visible')).toBe(false);
		expect(counts.has('ws')).toBe(false);
		expect(nestedStamp(counts.get('parent') ?? 0)).toBe('1 NESTED');
	});
});

describe('sortRecent', () => {
	it("puts the most recent updated_at first, like the website's Recent", () => {
		const old = tile({ id: 'old', updated_at: at(50) });
		// Renamed today: logged as a touch, but the website doesn't move it, so neither do we.
		const renamed = tile({ id: 'renamed', updated_at: at(400), last_touch_at: at(2) });
		const fresh = tile({ id: 'fresh', updated_at: at(10), last_touch_at: at(300) });
		expect(ids(sortRecent([old, renamed, fresh]))).toEqual(['fresh', 'old', 'renamed']);
	});

	it("counts a sub-project's activity for its parent, even when sorting a filtered list", () => {
		const parent = tile({ id: 'parent', name: 'Folder', updated_at: at(500) });
		const busyChild = tile({ id: 'kid', parent_project_id: 'parent', updated_at: at(1) });
		const other = tile({ id: 'other', updated_at: at(5) });
		const all = [parent, busyChild, other];
		expect(ids(sortRecent(topLevel(all), all))).toEqual(['parent', 'other']);
		// Without the full list the parent only has its own date.
		expect(ids(sortRecent(topLevel(all)))).toEqual(['other', 'parent']);
	});

	it('breaks ties by name and treats missing dates as oldest', () => {
		const b = tile({ id: 'b', name: 'Beta', updated_at: at(3) });
		const a = tile({ id: 'a', name: 'alpha', updated_at: at(3) });
		const none = tile({ id: 'none', name: 'Aardvark', updated_at: 'not a date' });
		expect(ids(sortRecent([b, none, a]))).toEqual(['a', 'b', 'none']);
	});

	it('does not mutate its input', () => {
		const list = [tile({ updated_at: at(9) }), tile({ updated_at: at(1) })];
		const before = ids(list);
		sortRecent(list);
		expect(ids(list)).toEqual(before);
	});
});

describe('groupByPulse', () => {
	it("uses the website's order and labels, drops empty groups and keeps order within a group", () => {
		const list = [
			tile({ id: 'q1', pulse: 'quiet' }),
			tile({ id: 'm1', pulse: 'moving' }),
			tile({ id: 'n1', pulse: null }),
			tile({ id: 'm2', pulse: 'moving' }),
			tile({ id: 'p1', pulse: 'parked' })
		];
		const groups = groupByPulse(list);
		expect(groups.map((group) => [group.key, group.label, ids(group.projects)])).toEqual([
			['moving', 'Moving', ['m1', 'm2']],
			['quiet', 'Gone quiet', ['q1']],
			['parked', 'Parked', ['p1']],
			['unknown', 'No history yet', ['n1']]
		]);
	});

	it('copies the pulse rules from desktop-signals.ts', () => {
		expect(PULSES).toEqual(['moving', 'shaping', 'quiet', 'parked']);
		expect(PULSE_META.shaping).toEqual({
			label: 'Being shaped',
			rule: 'worked on in the last 14 days, nothing finished yet'
		});
		expect(PULSE_META.parked.rule).toBe('marked paused or done, or no changes for 60+ days');
	});
});

describe('filterByName', () => {
	const list = [
		tile({ id: 'a', name: 'BuildOS CEO Training' }),
		tile({ id: 'b', name: 'Church Ladies' }),
		tile({ id: 'c', name: 'buildos' })
	];

	it('matches a case-insensitive substring of the name', () => {
		expect(ids(filterByName(list, '  BUILDos '))).toEqual(['a', 'c']);
		expect(ids(filterByName(list, 'lad'))).toEqual(['b']);
		expect(filterByName(list, 'zzz')).toEqual([]);
	});

	it('returns a copy of everything for an empty query', () => {
		const result = filterByName(list, '   ');
		expect(ids(result)).toEqual(['a', 'b', 'c']);
		expect(result).not.toBe(list);
	});
});

describe('arrangeDesktop', () => {
	const workspace = tile({ id: 'ws', name: 'Workspace', kind: 'workspace', updated_at: at(0) });
	const folder = tile({
		id: 'folder',
		name: 'Wayne Strategies',
		pulse: 'shaping',
		updated_at: at(20)
	});
	const inside = tile({
		id: 'inside',
		name: 'Strategy memo',
		pulse: 'moving',
		parent_project_id: 'folder',
		updated_at: at(1)
	});
	const solo = tile({ id: 'solo', name: 'Radar', pulse: 'moving', updated_at: at(5) });
	const all = [workspace, folder, inside, solo];

	it('Recent: one group of top-level tiles, folders lifted by their sub-projects', () => {
		const result = arrangeDesktop(all);
		expect(result.searching).toBe(false);
		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]?.key).toBe('all');
		expect(ids(result.groups[0]?.projects ?? [])).toEqual(['folder', 'solo']);
		expect(result.shown).toBe(2);
		expect(result.total).toBe(3);
		expect(result.nestedCounts.get('folder')).toBe(1);
		expect(result.parentNames.size).toBe(0);
	});

	it('By activity: one group per pulse', () => {
		const result = arrangeDesktop(all, { sort: 'activity' });
		expect(result.groups.map((group) => [group.key, ids(group.projects)])).toEqual([
			['moving', ['solo']],
			['shaping', ['folder']]
		]);
	});

	it('a search lays matches out flat, sub-projects included, with their parent names', () => {
		const result = arrangeDesktop(all, { query: 'strat' });
		expect(result.searching).toBe(true);
		expect(ids(result.groups[0]?.projects ?? [])).toEqual(['inside', 'folder']);
		expect(result.parentNames.get('inside')).toBe('Wayne Strategies');
		expect(result.parentNames.has('folder')).toBe(false);
	});

	it('no matches means no groups', () => {
		expect(arrangeDesktop(all, { query: 'nothing here' }).groups).toEqual([]);
		expect(arrangeDesktop([workspace]).groups).toEqual([]);
	});
});

describe('what a tile says', () => {
	it('monogram matches the website', () => {
		expect(monogram('The Cadre Content Ops')).toBe('CC');
		expect(monogram('BuildOS')).toBe('BU');
		expect(monogram('Wayne Strategies')).toBe('WS');
		expect(monogram('AI Chat — Evaluation')).toBe('AC');
		expect(monogram('9takes')).toBe('9T');
		expect(monogram('Église (draft)')).toBe('ÉD');
		expect(monogram('  — ')).toBe('·');
	});

	it('hasLook is false for the fallback tile and true once the server sends a look', () => {
		expect(hasLook(tile())).toBe(false);
		expect(hasLook(tile({ pulse: 'quiet' }))).toBe(true);
		expect(hasLook(tile({ bars: { docs: 0.4, tasks: 0 } }))).toBe(true);
	});

	it('taskSegments split the T bar in bucket order, summing to its length', () => {
		const project = tile({
			bars: { docs: 0.5, tasks: 0.6 },
			mix: { overdue: 1, in_progress: 0, scheduled: 2, backlog: 3 }
		});
		const segments = taskSegments(project);
		expect(segments.map((segment) => segment.bucket)).toEqual([
			'overdue',
			'scheduled',
			'backlog'
		]);
		expect(segments.map((segment) => segment.fraction)).toEqual(
			[0.1, 0.2, 0.3].map((n) => expect.closeTo(n, 10))
		);
		expect(segments.reduce((sum, segment) => sum + segment.fraction, 0)).toBeCloseTo(0.6, 10);
		expect(taskSegments(tile({ bars: { docs: 0, tasks: 0.5 } }))).toEqual([]);
		expect(openTaskCount(project.mix)).toBe(6);
		expect(TASK_BUCKETS).toEqual(['overdue', 'in_progress', 'scheduled', 'backlog']);
	});

	it('overdue badge caps at 99+', () => {
		expect(overdueBadgeText(3)).toBe('3');
		expect(overdueBadgeText(99)).toBe('99');
		expect(overdueBadgeText(100)).toBe('99+');
	});

	it('VoiceOver label: name, pulse, open tasks, overdue, then nesting', () => {
		const project = tile({
			name: 'BuildOS',
			pulse: 'shaping',
			bars: { docs: 0.4, tasks: 0.9 },
			mix: { overdue: 3, in_progress: 2, scheduled: 0, backlog: 6 }
		});
		expect(tileAccessibilityLabel(project, 2)).toBe(
			'BuildOS, being shaped, 11 open tasks, 3 overdue, holds 2 projects'
		);
		expect(
			tileAccessibilityLabel(
				tile({
					name: 'Memo',
					pulse: 'moving',
					mix: { overdue: 0, in_progress: 1, scheduled: 0, backlog: 0 }
				}),
				0,
				'Wayne Strategies'
			)
		).toBe('Memo, moving, 1 open task, inside Wayne Strategies');
		// Fallback tiles have no counts to speak of.
		expect(tileAccessibilityLabel(tile({ name: 'Radar' }), 1)).toBe('Radar, holds 1 project');
	});
});

describe('tile colors', () => {
	for (const [scheme, colors] of [
		['light', inkprintLight],
		['dark', inkprintDark]
	] as const) {
		const pulses = pulseColors(scheme);

		it(`${scheme}: a pulse tints the card 16%, parked 7%, none is a neutral 5% card`, () => {
			const moving = tilePalette('moving', colors, pulses);
			expect(moving.face).toBe(colorMix(pulses.moving, colors.card, 0.16));
			expect(moving.border).toBe(withAlpha(pulses.moving, 0.5));
			expect(moving.tab).toBe(colorMix(pulses.moving, colors.card, 0.22));
			expect(moving.glyph).toBe(colorMix(pulses.moving, colors.foreground, 0.8));
			expect(moving.faded).toBe(false);

			const parked = tilePalette('parked', colors, pulses);
			expect(parked.face).toBe(colorMix(pulses.parked, colors.card, 0.07));
			expect(parked.glyph).toBe(colors.mutedForeground);
			expect(parked.faded).toBe(true);

			const none = tilePalette(null, colors, pulses);
			expect(none.ink).toBe(colors.borderStrong);
			expect(none.face).toBe(colorMix(colors.borderStrong, colors.card, 0.05));
			expect(none.glyph).toBe(colors.mutedForeground);
		});

		it(`${scheme}: meters use one meaning per color`, () => {
			const meter = meterColors(colors);
			expect(meter.track).toBe(withAlpha(colors.foreground, 0.1));
			expect(meter.docs).toBe(withAlpha(colors.foreground, 0.75));
			expect(meter.overdue).toBe(colors.destructive);
			expect(meter.in_progress).toBe(colors.success);
			expect(meter.scheduled).toBe(colors.info);
			expect(meter.backlog).toBe(colors.borderStrong);
		});

		it(`${scheme}: the pulse pill is a 14% tint with a half-strength border`, () => {
			const pill = pulsePillColors('shaping', colors, pulses);
			expect(pill.fill).toBe(withAlpha(pulses.shaping, 0.14));
			expect(pill.border).toBe(withAlpha(pulses.shaping, 0.5));
			expect(pill.text).toBe(colorMix(pulses.shaping, colors.foreground, 0.8));
		});

		it(`${scheme}: every pulse pill's text reads at 4.5:1 on its tint over the card`, () => {
			for (const pulse of PULSES) {
				const { text } = pulsePillColors(pulse, colors, pulses);
				const tint = colorMix(pulses[pulse], colors.card, 0.14);
				expect(contrastRatio(text, tint)).toBeGreaterThanOrEqual(4.5);
			}
		});
	}
});

describe('pulse pill text', () => {
	it('pulls light "Gone quiet" further toward the foreground (3.4:1 at 80%)', () => {
		const pulses = pulseColors('light');
		expect(pulsePillColors('quiet', inkprintLight, pulses).text).toBe(
			colorMix(inkprintLight.warning, inkprintLight.foreground, 0.6)
		);
		// Dark already reads at 80%.
		expect(pulsePillColors('quiet', inkprintDark, pulseColors('dark')).text).toBe(
			colorMix(inkprintDark.warning, inkprintDark.foreground, 0.8)
		);
	});
});

describe('gridColumns', () => {
	it('four across on every iPhone, fewer only when a cell would be under 80pt', () => {
		expect(gridColumns(358)).toBe(4);
		expect(gridColumns(343)).toBe(4);
		expect(gridColumns(320)).toBe(4);
		expect(gridColumns(288)).toBe(3);
		expect(gridColumns(0)).toBe(4);
		expect(gridColumns(Number.NaN)).toBe(4);
		expect(gridColumns(1200)).toBe(4);
		expect(gridColumns(50)).toBe(1);
	});
});

describe('peekLayout', () => {
	const headOnly = PEEK.head.top + PEEK.tile + PEEK.head.bottom + 1;

	it('a fallback tile peeks at just its header', () => {
		const layout = peekLayout(tile({ name: 'Radar' }));
		expect(layout).toMatchObject({
			width: 320,
			height: headOnly,
			nameLines: 1,
			reasonLines: 0,
			nextLines: 0,
			parts: { pulse: false, next: false, mix: false }
		});
	});

	it('adds the pulse row, next step and task mix when present', () => {
		const project = tile({
			name: 'BuildOS',
			pulse: 'moving',
			pulse_reason: 'Finished 2 tasks in the last 14 days',
			next_step_short: '  Ship the phone tiles  ',
			bars: { docs: 0.3, tasks: 0.5 },
			mix: { overdue: 1, in_progress: 1, scheduled: 1, backlog: 1 }
		});
		const layout = peekLayout(project);
		expect(layout.parts).toEqual({ pulse: true, next: true, mix: true });
		expect(peekNextStep(project)).toBe('Ship the phone tiles');
		const pulseRow = Math.max(
			PEEK.pill.height,
			layout.reasonLines * PEEK.reason.line + PEEK.reason.offset
		);
		const next =
			2 +
			2 * PEEK.next.padY +
			PEEK.next.label +
			PEEK.next.labelGap +
			layout.nextLines * PEEK.next.line;
		const m = PEEK.mix;
		const mix = m.label + m.labelGap + m.bar + m.barGap + 2 * m.row + m.rowGap;
		expect(layout.height).toBe(
			headOnly +
				PEEK.head.gap +
				pulseRow +
				PEEK.body.top +
				next +
				PEEK.body.gap +
				mix +
				PEEK.body.bottom
		);
		// Roughly the 320×240 card the spec asks for.
		expect(layout.height).toBeGreaterThan(200);
		expect(layout.height).toBeLessThan(320);
	});

	it('caps every text at its line budget', () => {
		const long = 'word '.repeat(80);
		const layout = peekLayout(
			tile({ name: long, pulse: 'quiet', pulse_reason: long, next_step_short: long })
		);
		expect(layout.nameLines).toBe(PEEK.name.max);
		expect(layout.reasonLines).toBe(PEEK.reason.max);
		expect(layout.nextLines).toBe(PEEK.next.max);
		expect(peekNextStep(tile({ next_step_short: '   ' }))).toBeNull();
	});

	it('estimateLines errs long and stays within 1…max', () => {
		expect(estimateLines('', 14, 200, 3)).toBe(1);
		expect(estimateLines('a'.repeat(10), 14, 200, 3)).toBe(1);
		expect(estimateLines('a'.repeat(30), 14, 200, 3)).toBe(2);
		expect(estimateLines('a'.repeat(500), 14, 200, 3)).toBe(3);
	});
});
