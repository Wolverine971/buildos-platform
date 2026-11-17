// apps/web/src/lib/tests/layout-shift/judge.ts
//
// Pure: compares the page before and after one action and says what moved,
// closed or reloaded that shouldn't have. The live runner (layout-shift.live.test.ts)
// takes the snapshots; this decides. Unit-tested in judge.test.ts.

/** An element the harness follows across an action. `stamp` changes when it remounts. */
export interface AnchorShot {
	stamp: string;
	top: number;
	left: number;
	height: number;
}

/** A row of the list, found by its (unique, seeded) title. */
export interface RowShot {
	title: string;
	top: number;
	stamp: string;
}

export type AnchorName = 'panes' | 'list' | 'reader' | 'readerHead' | 'card';

export interface PageShot {
	path: string;
	scrollY: number;
	anchors: Partial<Record<AnchorName, AnchorShot>>;
	/** Visible rows in the list column, top to bottom. */
	rows: RowShot[];
	/** Title of the row marked as open in the list, if any. */
	selected: string | null;
	/** The reader's header text (the open item's title), or null when no reader is open. */
	readerTitle: string | null;
	/** Layout-shift score the browser reported between the two shots. */
	shiftScore: number;
	/** What the browser said moved, for the report. */
	shiftSources: string[];
}

export interface StepExpectation {
	/** Must still be there and be the same element (not closed, not remounted). */
	keep: AnchorName[];
	/** Must not move on screen (within TOLERANCE_PX). */
	still: AnchorName[];
	/** Rows must keep their order; `removed` titles may leave, `added` may arrive. */
	rowOrder: 'same' | 'any';
	removed?: string[];
	added?: string[];
	/** The row that was open stays at the same height on screen. */
	selectedRowStill?: boolean;
	/** Whether a reader should be open afterwards. */
	readerOpen: boolean;
	/** The reader shows this title afterwards (default: whatever it showed before). */
	readerTitle?: string | 'any';
}

export interface Finding {
	rule: string;
	detail: string;
}

export const TOLERANCE_PX = 2;

const near = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE_PX;

export function judgeStep(before: PageShot, after: PageShot, expect: StepExpectation): Finding[] {
	const findings: Finding[] = [];

	if (after.path !== before.path)
		findings.push({ rule: 'navigated', detail: `${before.path} → ${after.path}` });
	if (!near(after.scrollY, before.scrollY))
		findings.push({
			rule: 'page-scrolled',
			detail: `window scrolled ${Math.round(after.scrollY - before.scrollY)}px`
		});

	for (const name of expect.keep) {
		const was = before.anchors[name];
		const now = after.anchors[name];
		if (!was) continue; // not on this surface
		if (!now) findings.push({ rule: 'closed', detail: `${name} disappeared` });
		else if (now.stamp !== was.stamp)
			findings.push({ rule: 'remounted', detail: `${name} was rebuilt (reload/refresh)` });
	}

	for (const name of expect.still) {
		const was = before.anchors[name];
		const now = after.anchors[name];
		if (!was || !now) continue;
		if (!near(was.top, now.top) || !near(was.left, now.left))
			findings.push({
				rule: 'moved',
				detail: `${name} moved ${Math.round(now.top - was.top)}px down, ${Math.round(now.left - was.left)}px right`
			});
	}

	const readerNow = after.readerTitle !== null;
	if (readerNow !== expect.readerOpen)
		findings.push({
			rule: expect.readerOpen ? 'reader-closed' : 'reader-stayed-open',
			detail: expect.readerOpen ? 'the reader closed' : 'the reader did not close'
		});
	const wantTitle = expect.readerTitle ?? before.readerTitle;
	if (expect.readerOpen && wantTitle !== 'any' && wantTitle && after.readerTitle) {
		if (!after.readerTitle.includes(wantTitle))
			findings.push({
				rule: 'reader-jumped',
				detail: `reader shows “${after.readerTitle}”, expected “${wantTitle}”`
			});
	}

	if (expect.rowOrder === 'same') {
		const removed = new Set(expect.removed ?? []);
		const added = new Set(expect.added ?? []);
		const was = before.rows.map((row) => row.title).filter((title) => !removed.has(title));
		// A removed row that stayed is reported once, as row-stayed, below.
		const now = after.rows
			.map((row) => row.title)
			.filter((title) => !added.has(title) && !removed.has(title));
		const nowSet = new Set(now);
		const missing = was.filter((title) => !nowSet.has(title));
		const wasSet = new Set(was);
		const extra = now.filter((title) => !wasSet.has(title));
		if (missing.length)
			findings.push({ rule: 'row-vanished', detail: `left the list: ${missing.join(', ')}` });
		if (extra.length)
			findings.push({ rule: 'row-appeared', detail: `joined the list: ${extra.join(', ')}` });
		const common = was.filter((title) => nowSet.has(title));
		const commonNow = now.filter((title) => wasSet.has(title));
		if (common.join('\n') !== commonNow.join('\n'))
			findings.push({
				rule: 'reordered',
				detail: `before: ${common.join(' | ')}\nafter:  ${commonNow.join(' | ')}`
			});
		for (const title of expect.removed ?? [])
			if (after.rows.some((row) => row.title === title))
				findings.push({
					rule: 'row-stayed',
					detail: `“${title}” should have left the list`
				});
		for (const title of expect.added ?? [])
			if (!after.rows.some((row) => row.title === title))
				findings.push({ rule: 'row-missing', detail: `“${title}” should be in the list` });
	}

	if (expect.selectedRowStill && before.selected) {
		const was = before.rows.find((row) => row.title === before.selected);
		const now = after.rows.find((row) => row.title === before.selected);
		if (was && !now)
			findings.push({
				rule: 'open-row-vanished',
				detail: `the open row “${before.selected}” left the list`
			});
		else if (was && now && !near(was.top, now.top))
			findings.push({
				rule: 'open-row-moved',
				detail: `the open row moved ${Math.round(now.top - was.top)}px`
			});
	}

	return findings;
}
