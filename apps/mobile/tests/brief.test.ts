// apps/mobile/tests/brief.test.ts
import { describe, expect, it } from 'vitest';

import {
	BRIEF_PATHNAME,
	briefActions,
	briefCardLabel,
	briefHref,
	briefLead,
	briefLinkTarget,
	briefStatus,
	civilDayParam,
	formatElapsed,
	isWriting,
	listenLabel,
	splitBrief,
	stepDay
} from '@/lib/brief';

// The shape the worker writes (generateMainBriefMarkdown), trimmed.
const BRIEF = `# Oct 31, 2026

🎉 **Today is Halloween**

## Executive Brief

Blockers first: **only two tasks are scheduled today, but 65 are overdue.**

Start with **Get portal access** — it unblocks the website work.

- 🔴 **The Cadre:** Turn on the listings-watch pass before the Nov 1 run.

🔴 **76 items need attention** — 2 tasks across 33 projects

## Start Here

- **[Beta: send the 2 invites (drafts are in Gmail)](/projects/p1/tasks/t1)**
- **[Trash to the Curb](/projects/p2/tasks/t2)**
- **[Ask the wealth manager](/projects/p3/tasks/t3)**

## Calendar

**Today:** 2 items

### Today
- **[Start: Get portal access](/projects/p4/tasks/t4)**
  - 12:00 AM / [Cody Website](/projects/p4)

## While you were away

- 29 documents updated

## Project Details

## [TBPN](/projects/p5)

### Tasks
- one

## [Radar](/projects/p6)

Nothing new.
`;

describe('splitBrief', () => {
	const sections = splitBrief(BRIEF);

	it('drops the date H1 and leads with the holiday line and the executive brief', () => {
		expect(sections.lead.startsWith('🎉 **Today is Halloween**')).toBe(true);
		expect(sections.lead).toContain('Blockers first');
		expect(sections.lead).toContain('76 items need attention');
		expect(sections.lead).not.toContain('# Oct 31');
		expect(sections.executive?.startsWith('Blockers first')).toBe(true);
	});

	it('keeps Start Here aside for the action links', () => {
		expect(sections.startHere).toContain('/projects/p1/tasks/t1');
		expect(sections.body).not.toContain('Start Here');
	});

	it('keeps the other readouts in order with their headings', () => {
		expect(sections.body.indexOf('## Calendar')).toBe(0);
		expect(sections.body.indexOf('## While you were away')).toBeGreaterThan(0);
		expect(sections.body).toContain('### Today');
		expect(sections.body).not.toContain('Project Details');
	});

	it('folds every project section after Project Details', () => {
		expect(sections.detailCount).toBe(2);
		expect(sections.details?.startsWith('## [TBPN](/projects/p5)')).toBe(true);
		expect(sections.details).toContain('## [Radar](/projects/p6)');
		expect(sections.details).toContain('Nothing new.');
	});

	it('reads the older generator’s "Executive Summary" as the lead too', () => {
		const old = splitBrief(
			'# Jan 1\n\n## Executive Summary\n\nA pause.\n\n## Key Focus Areas\n\n1. Rest\n'
		);
		expect(old.executive).toBe('A pause.');
		expect(old.lead).toBe('A pause.');
		expect(old.body.startsWith('## Key Focus Areas')).toBe(true);
	});

	it('copes with an empty or heading-less document', () => {
		expect(splitBrief(null)).toEqual({
			lead: '',
			executive: null,
			startHere: null,
			body: '',
			details: null,
			detailCount: 0
		});
		expect(splitBrief('Just a line.').lead).toBe('Just a line.');
	});

	it('ignores headings inside code fences', () => {
		const fenced = '## Calendar\n\n```\n## not a heading\n```\n';
		expect(splitBrief(fenced).body).toContain('## not a heading');
		expect(splitBrief(fenced).detailCount).toBe(0);
	});
});

describe('briefLead', () => {
	it('is the first line of the executive brief, as plain text', () => {
		expect(briefLead(BRIEF)).toBe(
			'Blockers first: only two tasks are scheduled today, but 65 are overdue.'
		);
	});

	it('falls back to the first paragraph anywhere, and caps the length', () => {
		expect(briefLead('# Day\n\n## Calendar\n\nTwo things today.')).toBe('Two things today.');
		expect(briefLead(`## Executive Brief\n\n${'word '.repeat(80)}`, 40)?.length).toBe(40);
		expect(briefLead('')).toBeNull();
	});
});

describe('briefActions', () => {
	it('links each action to its task through the Start Here list', () => {
		const actions = briefActions(
			['Trash to the Curb', 'Ask the wealth manager', 'Not in the list'],
			splitBrief(BRIEF).startHere
		);
		expect(actions).toEqual([
			{ text: 'Trash to the Curb', href: '/projects/p2/tasks/t2' },
			{ text: 'Ask the wealth manager', href: '/projects/p3/tasks/t3' },
			{ text: 'Not in the list', href: null }
		]);
	});

	it('drops blank actions and survives a missing list', () => {
		expect(briefActions(['  ', 'Go'], null)).toEqual([{ text: 'Go', href: null }]);
		expect(briefActions(null, null)).toEqual([]);
	});
});

describe('briefLinkTarget', () => {
	const base = 'http://192.168.1.154:5199';

	it('maps the worker’s site-relative links to screens', () => {
		expect(briefLinkTarget('/projects', base)).toEqual({ kind: 'workspace' });
		expect(briefLinkTarget('/projects/p1', base)).toEqual({ kind: 'project', id: 'p1' });
		expect(briefLinkTarget('/projects/p1?entity=goal&entity_id=g1', base)).toEqual({
			kind: 'project',
			id: 'p1'
		});
		expect(briefLinkTarget('/projects/p1/tasks/t1', base)).toEqual({ kind: 'task', id: 't1' });
		expect(briefLinkTarget('/projects/p1/documents/d1', base)).toEqual({
			kind: 'document',
			id: 'd1'
		});
	});

	it('treats the website’s own absolute links the same way', () => {
		expect(briefLinkTarget('https://build-os.com/projects/p1/tasks/t1', base)).toEqual({
			kind: 'task',
			id: 't1'
		});
		expect(briefLinkTarget(`${base}/projects/p1`, base)).toEqual({ kind: 'project', id: 'p1' });
	});

	it('sends everything else to the browser, relative paths on this BuildOS', () => {
		expect(briefLinkTarget('/briefs?date=2026-10-30', base)).toEqual({
			kind: 'web',
			url: `${base}/briefs?date=2026-10-30`
		});
		expect(briefLinkTarget('https://example.com/x', base)).toEqual({
			kind: 'web',
			url: 'https://example.com/x'
		});
		expect(briefLinkTarget('mailto:a@b.co', base)).toEqual({
			kind: 'web',
			url: 'mailto:a@b.co'
		});
		expect(briefLinkTarget('#top', base)).toBeNull();
		expect(briefLinkTarget('  ', base)).toBeNull();
	});
});

describe('days', () => {
	it('steps civil days across month ends and DST changes', () => {
		expect(stepDay('2026-10-31', 1)).toBe('2026-11-01');
		expect(stepDay('2026-11-01', 1)).toBe('2026-11-02');
		expect(stepDay('2026-03-08', 1)).toBe('2026-03-09');
		expect(stepDay('2026-03-01', -1)).toBe('2026-02-28');
		expect(stepDay('2026-01-01', -1)).toBe('2025-12-31');
		expect(stepDay('nope', 1)).toBe('nope');
	});

	it('accepts only a civil day from the route', () => {
		expect(civilDayParam('2026-10-30')).toBe('2026-10-30');
		expect(civilDayParam(['2026-10-30'])).toBe('2026-10-30');
		expect(civilDayParam('tomorrow')).toBeNull();
		expect(civilDayParam(undefined)).toBeNull();
	});

	it('links every state of the page', () => {
		expect(briefHref()).toEqual({ pathname: BRIEF_PATHNAME, params: {} });
		expect(briefHref({ date: '2026-10-30' }).params).toEqual({ date: '2026-10-30' });
		expect(briefHref({ autoplay: true }).params).toEqual({ autoplay: '1' });
		expect(briefHref({ date: null, autoplay: false }).params).toEqual({});
	});
});

describe('status and copy', () => {
	const at = (iso: string) => `T(${iso})`;

	it('says when the brief was written, that it is being written, or why not', () => {
		expect(
			briefStatus(
				{ generation_status: 'completed', generation_completed_at: '2026-10-31T04:13:40Z' },
				at
			)
		).toEqual({ tone: 'muted', text: 'Generated T(2026-10-31T04:13:40Z)', writing: false });
		expect(briefStatus({ generation_status: 'completed' }, at)?.text).toBe('Generated');
		expect(briefStatus({ generation_status: 'processing' }, at)).toEqual({
			tone: 'accent',
			text: 'Being written now…',
			writing: true
		});
		expect(
			briefStatus({ generation_status: 'failed', generation_error: 'No projects' }, at)
		).toEqual({
			tone: 'destructive',
			text: "Couldn't be written · No projects",
			writing: false
		});
		expect(briefStatus(null, at)).toBeNull();
		expect(isWriting('pending')).toBe(true);
		expect(isWriting('completed')).toBe(false);
	});

	it('formats the narration clock', () => {
		expect(formatElapsed(0)).toBe('0:00');
		expect(formatElapsed(21.55)).toBe('0:22');
		expect(formatElapsed(252)).toBe('4:12');
		expect(formatElapsed(3723)).toBe('1:02:03');
		expect(formatElapsed(Number.NaN)).toBe('0:00');
		expect(listenLabel(21550)).toBe('Listen · 0:22');
		expect(listenLabel(null)).toBe('Listen');
	});

	it('labels the Today card', () => {
		expect(briefCardLabel('2026-10-31', '2026-10-31')).toEqual({
			title: 'Your brief',
			aside: 'Today'
		});
		const last = briefCardLabel('2026-10-30', '2026-10-31');
		expect(last.title).toBe('Your last brief');
		expect(last.aside).toContain('30');
	});
});
