// packages/shared-agent-ops/src/ontology/start-here.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	applyStartHereSectionBodies,
	buildStartHerePromptExcerpt,
	checkStartHereCaptureInvariants,
	buildStartHereTemplate,
	dedupeStartHereBulletList,
	extractStartHereManagedRegions,
	extractStartHereOrientation,
	findStartHereManagedRegionRanges,
	normalizeStartHereDateStamps,
	parseStartHereStatusRegion,
	planStartHereCheckpointRewrites,
	readStartHereAuthoredSections,
	readStartHereDocumentSections,
	reconcileStartHereAuthoredSections,
	renderStartHereManagedRegion,
	renderStartHereStatusContent,
	replaceStartHereAuthoredSections,
	sanitizeStartHereSectionMarkdown,
	stripStartHereAuthoredSections
} from './start-here';

// Production START HERE doc 1fc5b3c2… ("100-Day Book Project"), captured
// 2026-09-22 after four append-only session captures (tasker/93).
const bookFixture = readFileSync(
	new URL('./__fixtures__/start-here-100-day-book.md', import.meta.url),
	'utf8'
);

function managedBlocks(body: string): string[] {
	return findStartHereManagedRegionRanges(body).map((range) => body.slice(range.from, range.to));
}

function boldTitles(markdown: string): string[] {
	return [...markdown.matchAll(/^\s?[-*+]\s+\*\*(.+?)\*\*/gm)].map((match) => match[1] ?? '');
}

const renderedStatusBody = [
	'# START HERE - Demo',
	'',
	renderStartHereManagedRegion({
		name: 'status',
		content: renderStartHereStatusContent({
			state: 'Active',
			stage: 'execution',
			openTasks: 4,
			overdueTasks: 1,
			nextStep: 'Ship the launch email.',
			refreshedAt: '2026-07-10T04:00:00.000Z'
		})
	}),
	'',
	'## What this is',
	'A demo project used for parser tests. It exists to verify orientation extraction.',
	'',
	'## Current state',
	'Mid-flight.'
].join('\n');

describe('parseStartHereStatusRegion', () => {
	it('round-trips a rendered status region', () => {
		const status = parseStartHereStatusRegion(renderedStatusBody);
		expect(status).not.toBeNull();
		expect(status?.state).toBe('Active');
		expect(status?.stage).toBe('execution');
		expect(status?.now).toContain('4 open tasks');
		expect(status?.now).toContain('1 overdue');
		expect(status?.nextStep).toBe('Ship the launch email.');
		expect(status?.refreshedAt).toBe('2026-07-10T04:00:00.000Z');
		expect(status?.rendered).toBe(true);
	});

	it('flags the never-rendered template as not rendered and nulls placeholders', () => {
		const body = buildStartHereTemplate({ projectName: 'Demo' });
		const status = parseStartHereStatusRegion(body);
		expect(status).not.toBeNull();
		expect(status?.rendered).toBe(false);
		expect(status?.state).toBeNull();
		expect(status?.now).toBeNull();
		expect(status?.nextStep).toBeNull();
		expect(status?.refreshedAt).toBeNull();
	});

	it('returns null when the body has no status region', () => {
		expect(parseStartHereStatusRegion('# Some doc\n\nJust prose.')).toBeNull();
	});
});

describe('extractStartHereOrientation', () => {
	it('prefers the What this is section', () => {
		const orientation = extractStartHereOrientation(renderedStatusBody);
		expect(orientation).toBe(
			'A demo project used for parser tests. It exists to verify orientation extraction.'
		);
	});

	it('reads the instantiation Vision & Summary dialect', () => {
		const body = [
			'# Herb Garden Context Document',
			'',
			'## Vision & Summary',
			'',
			'Set up a small balcony herb garden by end of July.',
			'',
			'## Initial Tasks / Threads',
			'- Buy pots · todo'
		].join('\n');
		expect(extractStartHereOrientation(body)).toBe(
			'Set up a small balcony herb garden by end of July.'
		);
	});

	it('skips managed regions, headings, and placeholder scaffolding', () => {
		const body = buildStartHereTemplate({ projectName: 'Empty' });
		expect(extractStartHereOrientation(body)).toBeNull();
	});

	it('truncates to maxChars', () => {
		const body = ['## What this is', 'word '.repeat(100)].join('\n');
		const orientation = extractStartHereOrientation(body, 40);
		expect(orientation).not.toBeNull();
		expect(orientation!.length).toBeLessThanOrEqual(40);
	});
});

describe('legacy scaffold stripping', () => {
	it('drops 2026-06-24 backfill instructional lines from prompt excerpts', () => {
		const body = [
			'# START HERE - Legacy',
			'',
			'## What this is',
			'> _authored - capture target_',
			'A real seeded description.',
			'',
			'## Non-goals',
			'> _authored - capture target_',
			'- Things we are deliberately not doing, with the reason in brief.',
			'',
			'## Current state',
			'> _authored - capture target_',
			'2-4 sentences: what just happened, what is in progress, and what is blocked.',
			'',
			'## Decisions',
			'- **Decision** - one-line rationale. _(YYYY-MM-DD)_',
			'',
			'## Vocabulary and mental model',
			'- **Term** - what it means in this project.',
			'',
			'## Open questions',
			'- Live question we have not resolved.'
		].join('\n');
		const excerpt = buildStartHerePromptExcerpt(body);
		expect(excerpt.content).toContain('A real seeded description.');
		expect(excerpt.content).not.toContain('deliberately not doing');
		expect(excerpt.content).not.toContain('2-4 sentences');
		expect(excerpt.content).not.toContain('one-line rationale');
		expect(excerpt.content).not.toContain('what it means in this project');
		expect(excerpt.content).not.toContain('Live question we have not resolved');
	});
});

describe('replaceStartHereAuthoredSections', () => {
	it('replaces only the named section and leaves managed fences byte-identical', () => {
		const next = replaceStartHereAuthoredSections(bookFixture, [
			{ section: 'Current state', markdown: 'Day 1 of 100 complete. Exclusions still open.' }
		]);
		const before = readStartHereAuthoredSections(bookFixture);
		const after = readStartHereAuthoredSections(next);

		expect(after['Current state']).toBe('Day 1 of 100 complete. Exclusions still open.');
		for (const section of [
			'What this is',
			'Decisions',
			'Vocabulary and mental model',
			'Open questions'
		] as const) {
			expect(after[section]).toBe(before[section]);
		}
		expect(managedBlocks(next)).toEqual(managedBlocks(bookFixture));
		expect(stripStartHereAuthoredSections(next)).toBe(
			stripStartHereAuthoredSections(bookFixture)
		);
	});

	it('ignores an empty rewrite instead of wiping the section', () => {
		const next = replaceStartHereAuthoredSections(bookFixture, [
			{ section: 'Decisions', markdown: '  \n<!-- managed:status v=1 -->  ' }
		]);
		expect(next).toBe(bookFixture);
	});

	it('collapses a duplicated section heading into the rewritten body', () => {
		const body = [
			'# START HERE - Demo',
			'',
			'## Decisions',
			'- **Old** - first copy.',
			'',
			'## Open questions',
			'- Is this live?',
			'',
			'## Decisions',
			'- **Older** - second copy.'
		].join('\n');
		expect(readStartHereAuthoredSections(body).Decisions).toContain('second copy');

		const next = replaceStartHereAuthoredSections(body, [
			{ section: 'Decisions', markdown: '- **Merged** - one bullet.' }
		]);
		expect(next.match(/^## Decisions$/gm)).toHaveLength(1);
		expect(next).not.toContain('copy.');
		expect(readStartHereAuthoredSections(next)['Open questions']).toBe('- Is this live?');
	});

	it('inserts a missing section in canonical order, outside the map fence', () => {
		const preCapture = readFileSync(
			new URL('./__fixtures__/start-here-100-day-book.pre-capture.md', import.meta.url),
			'utf8'
		);
		const next = replaceStartHereAuthoredSections(preCapture, [
			{ section: 'Open questions', markdown: '- What does the book exclude?' },
			{ section: 'What this is', markdown: 'A nonfiction book.' },
			{ section: 'Decisions', markdown: '- **Contract locked** - done.' }
		]);
		const order = [
			'## What this is',
			'## Decisions',
			'## Open questions',
			'<!-- managed:map'
		].map((marker) => next.indexOf(marker));
		expect(order.every((index) => index > -1)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(extractStartHereManagedRegions(next).map).not.toContain('exclude');
		expect(managedBlocks(next)).toEqual(managedBlocks(preCapture));
	});
});

describe('dedupeStartHereBulletList', () => {
	it("collapses the fixture's two Book Contract decisions, newest wording wins", () => {
		const decisions = readStartHereAuthoredSections(bookFixture).Decisions ?? '';
		expect(boldTitles(decisions)).toHaveLength(8);

		const deduped = dedupeStartHereBulletList(decisions);
		const titles = boldTitles(deduped);
		expect(titles.filter((title) => /book contract locked/i.test(title))).toEqual([
			'Book Contract locked'
		]);
		expect(titles.filter((title) => /100-day clock/i.test(title))).toHaveLength(1);
		expect(deduped).not.toMatch(/\n\n- /);
	});

	it('keeps one definition per vocabulary term across fragile/fragility wording', () => {
		const vocabulary =
			readStartHereAuthoredSections(bookFixture)['Vocabulary and mental model'] ?? '';
		const titles = boldTitles(dedupeStartHereBulletList(vocabulary));
		expect(titles).toEqual([
			'"Hacks in modern life"',
			'Anti-fragility',
			'Leverage',
			'Hacks',
			'Hidden knowledge'
		]);
	});

	it('never collapses struck-through history', () => {
		const markdown = [
			'- ~~**Ship in July**~~ - moved.',
			'- **Ship in July** - superseded above.',
			'- **Ship in July** - restated.'
		].join('\n');
		expect(dedupeStartHereBulletList(markdown)).toBe(
			['- ~~**Ship in July**~~ - moved.', '- **Ship in July** - restated.'].join('\n')
		);
	});
});

describe('normalizeStartHereDateStamps', () => {
	const policy = { today: '2026-09-22', earliest: '2026-08-20', allowed: ['2026-08-24'] };

	it('turns the placeholder into today and drops guessed or out-of-range stamps', () => {
		const markdown = [
			'- **A** - placeholder. _(YYYY-MM-DD)_',
			'- **B** - model guess. _(2025-04-14)_',
			'- **C** - from a message day. _(2026-08-24)_',
			'- **D** - in range but unsourced. _(2026-09-01)_',
			'- **E** - future. _(2026-10-01)_',
			'- **F** - launch is set for 2026-10-01 in prose.'
		].join('\n');
		expect(normalizeStartHereDateStamps(markdown, policy)).toBe(
			[
				'- **A** - placeholder. _(2026-09-22)_',
				'- **B** - model guess.',
				'- **C** - from a message day. _(2026-08-24)_',
				'- **D** - in range but unsourced.',
				'- **E** - future.',
				'- **F** - launch is set for 2026-10-01 in prose.'
			].join('\n')
		);
	});
});

describe('reconcileStartHereAuthoredSections', () => {
	const dates = { today: '2026-09-22', earliest: '2026-08-20', allowed: ['2026-08-24'] };

	it('turns a well-formed rewrite of the fixture into one clean page', () => {
		const result = reconcileStartHereAuthoredSections({
			currentBody: bookFixture,
			dates,
			rewrites: [
				{
					section: 'What this is',
					markdown:
						'A 100-day nonfiction book: a practical anti-fragile playbook for men earning under ~$100K/year who want to escape the permanent lower class, blending AI leverage, social dynamics, relationship strategy, and historical pattern-recognition. Done means a ~60,000-word manuscript released on the 100-day plan.'
				},
				{
					section: 'Current state',
					markdown:
						'**Day 1 of 100 complete.** The Book Contract is locked except **Exclusions**. Next: define Exclusions, then move to Phase 2.'
				},
				{
					section: 'Decisions',
					markdown: [
						'- **Book Contract locked** - reader, promise, premise, ending, voice, and ~60K scope cap set; Exclusions open. _(2025-04-14)_',
						'- **Anti-fragility as backbone** - Taleb-style anti-fragility is the core philosophy. _(YYYY-MM-DD)_',
						'- **100-day clock started** - the schedule runs from Day 1. _(2025-04-14)_',
						'- **Book Contract locked in** - restated by a lazy merge. _(2026-08-24)_'
					].join('\n')
				}
			]
		});
		const sections = readStartHereAuthoredSections(result.body);
		const whatThisIs = sections['What this is'] ?? '';
		const decisions = sections.Decisions ?? '';
		const titles = boldTitles(decisions);

		expect(whatThisIs.split(/\n{2,}/)).toHaveLength(1);
		expect(whatThisIs).toContain('nonfiction');
		expect(whatThisIs).not.toMatch(/fiction book project/);
		expect(titles.length).toBeLessThanOrEqual(5);
		expect(new Set(titles).size).toBe(titles.length);
		expect(titles.filter((title) => /book contract/i.test(title))).toHaveLength(1);
		expect(sections['Current state']?.split(/\n{2,}/)).toHaveLength(1);
		expect(sections['Current state']).not.toMatch(/No work .* done yet/);
		expect(result.body).not.toMatch(/YYYY-MM-DD|2025-\d{2}-\d{2}/);
		expect(decisions).toContain('_(2026-09-22)_');
		expect(managedBlocks(result.body)).toEqual(managedBlocks(bookFixture));
		expect(result.body.match(/^## \S.*$/gm)?.length).toBe(
			new Set(result.body.match(/^## \S.*$/gm)).size
		);
	});

	it('cleans a lazy merge: old placeholders dropped, only the new decision is stamped today', () => {
		const decisions = readStartHereAuthoredSections(bookFixture).Decisions ?? '';
		const result = reconcileStartHereAuthoredSections({
			currentBody: bookFixture,
			dates,
			rewrites: [
				{
					section: 'Decisions',
					markdown: `${decisions}\n- **Exclusions set** - no crypto, no politics. _(YYYY-MM-DD)_`
				}
			]
		});
		const next = readStartHereAuthoredSections(result.body).Decisions ?? '';
		const stamped = next.split('\n').filter((line) => line.includes('_(2026-09-22)_'));

		expect(stamped).toEqual(['- **Exclusions set** - no crypto, no politics. _(2026-09-22)_']);
		expect(next).not.toMatch(/YYYY-MM-DD|2025-\d{2}-\d{2}/);
		expect(
			boldTitles(next).filter((title) => /book contract locked/i.test(title))
		).toHaveLength(1);
	});

	it('keeps the current section when a rewrite is empty, too long, locked, or unchanged', () => {
		const current = readStartHereAuthoredSections(bookFixture);
		const result = reconcileStartHereAuthoredSections({
			currentBody: bookFixture,
			dates,
			lockedSections: ['Open questions'],
			rewrites: [
				{ section: 'Decisions', markdown: '<!-- only a comment -->' },
				{ section: 'Current state', markdown: 'x'.repeat(5000) },
				{ section: 'Open questions', markdown: '- New question?' },
				{ section: 'What this is', markdown: current['What this is'] ?? '' }
			]
		});
		expect(result.applied).toEqual([]);
		expect(result.skipped).toEqual([
			{ section: 'Decisions', reason: 'empty' },
			{ section: 'Current state', reason: 'too_long' },
			{ section: 'Open questions', reason: 'locked' },
			{ section: 'What this is', reason: 'unchanged' }
		]);
		expect(result.body).toBe(bookFixture);
	});
});

// QA copy of the book START HERE after the chat restructured it (tasker/95): custom
// headings ("What this book is", "Core philosophy", "Production roadmap") beside
// standard ones. Byte-exact from the isolated QA db, 2026-09-22.
const customFixture = readFileSync(
	new URL('./__fixtures__/start-here-book-loop-custom.md', import.meta.url),
	'utf8'
);

function sectionBody(content: string, heading: string): string {
	return (
		readStartHereDocumentSections(content).find((section) => section.heading === heading)
			?.body ?? ''
	);
}

describe('checkpoint capture over real sections (tasker/95)', () => {
	const today = '2026-09-22';

	it('reads the document under its real headings', () => {
		expect(
			readStartHereDocumentSections(customFixture).map((section) => section.heading)
		).toEqual([
			'What this book is',
			'Core philosophy',
			'Production roadmap',
			'Decisions',
			'Current state',
			'Vocabulary and mental model',
			'Open questions'
		]);
	});

	it('applies additions now, keeps existing lines byte-for-byte, and stamps new decisions with the capture date', () => {
		const current = sectionBody(customFixture, 'Decisions');
		// The model dropped the old stamps and invented a date for the new bullets.
		const rewrite = [
			current.replace(/ _\(\d{4}-\d{2}-\d{2}\)_/g, ''),
			'- **Exclusions dropped** — The Exclusions field is not needed. _(2025-01-01)_',
			'- **Dual thesis** — Anti-fragility is the method; stability is the felt result.'
		].join('\n');
		const { plans, skipped } = planStartHereCheckpointRewrites({
			content: customFixture,
			rewrites: [{ heading: 'Decisions', markdown: rewrite }],
			today
		});

		expect(skipped).toEqual([]);
		expect(plans).toHaveLength(1);
		const plan = plans[0]!;
		expect(plan.kind).toBe('additive');
		expect(plan.reviewMarkdown).toBeNull();
		expect(plan.autoMarkdown).toBe(
			[
				current,
				'- **Exclusions dropped** — The Exclusions field is not needed. _(2026-09-22)_',
				'- **Dual thesis** — Anti-fragility is the method; stability is the felt result. _(2026-09-22)_'
			].join('\n')
		);
	});

	it('sends a rewritten thesis paragraph to review and applies nothing from it', () => {
		const { plans } = planStartHereCheckpointRewrites({
			content: customFixture,
			rewrites: [
				{
					heading: 'What this book is',
					markdown:
						'A practical playbook for men earning under ~$100K/year. Anti-fragility is the method; stability is the result.'
				}
			],
			today
		});
		expect(plans[0]).toMatchObject({
			heading: 'What this book is',
			kind: 'replacement',
			autoMarkdown: null
		});
		expect(plans[0]!.reviewMarkdown).toContain('stability is the result');
		expect(plans[0]!.removedBlocks).toHaveLength(1);
	});

	it('adds a new bullet now and sends the removal of an answered question to review', () => {
		const current = sectionBody(customFixture, 'Open questions');
		const [exclusions, ...rest] = current.split('\n');
		const rewrite = [
			...rest,
			'- **Theme sharpening** — Which frameworks carry social anti-fragility?'
		].join('\n');
		const { plans } = planStartHereCheckpointRewrites({
			content: customFixture,
			rewrites: [{ heading: 'Open questions', markdown: rewrite }],
			today
		});
		const plan = plans[0]!;
		expect(plan.kind).toBe('mixed');
		expect(plan.autoMarkdown).toBe(
			`${current}\n- **Theme sharpening** — Which frameworks carry social anti-fragility?`
		);
		expect(plan.reviewMarkdown).not.toContain(exclusions);
		expect(plan.reviewMarkdown).toContain('Theme sharpening');
		expect(plan.removedBlocks).toEqual([exclusions]);
	});

	it('replaces the Current state snapshot automatically', () => {
		const { plans } = planStartHereCheckpointRewrites({
			content: customFixture,
			rewrites: [
				{
					heading: 'Current state',
					markdown: '- **Contract:** locked; Exclusions dropped.'
				}
			],
			today
		});
		expect(plans[0]).toMatchObject({
			kind: 'snapshot',
			autoMarkdown: '- **Contract:** locked; Exclusions dropped.',
			reviewMarkdown: null
		});
	});

	it('never invents sections: unknown headings are skipped and a standard twin waits for review', () => {
		const { plans, skipped } = planStartHereCheckpointRewrites({
			content: customFixture,
			rewrites: [
				{ heading: 'Working thesis', markdown: 'Anti-fragility is the method.' },
				{ heading: 'What this is', markdown: 'A practical playbook.' },
				{ heading: 'Decisions', markdown: sectionBody(customFixture, 'Decisions') }
			],
			today
		});
		expect(skipped).toEqual([
			{ heading: 'Working thesis', reason: 'unknown_heading' },
			{ heading: 'Decisions', reason: 'unchanged' }
		]);
		expect(plans).toEqual([
			expect.objectContaining({
				heading: 'What this is',
				kind: 'added_section',
				autoMarkdown: null,
				reviewMarkdown: 'A practical playbook.'
			})
		]);
	});

	it('drops a kept decision restated in new words instead of duplicating it', () => {
		const current = sectionBody(customFixture, 'Decisions');
		const { plans, skipped } = planStartHereCheckpointRewrites({
			content: customFixture,
			rewrites: [
				{
					heading: 'Decisions',
					markdown: `${current}\n- **Book contract locked in** — Reader, promise and voice are set.`
				}
			],
			today
		});
		expect(plans).toEqual([]);
		expect(skipped).toEqual([{ heading: 'Decisions', reason: 'unchanged' }]);
	});

	it('writes planned bodies without touching managed fences or duplicating headings', () => {
		const next = applyStartHereSectionBodies(customFixture, [
			{
				heading: 'Decisions',
				markdown: `${sectionBody(customFixture, 'Decisions')}\n- **New** — x. _(2026-09-22)_`
			},
			{
				heading: 'Open questions',
				markdown: '- **Q** — y?\n\n## Sneaky heading\n<!-- managed:map v=1 -->'
			}
		]);
		expect(checkStartHereCaptureInvariants(customFixture, next)).toEqual([]);
		expect(managedBlocks(next)).toEqual(managedBlocks(customFixture));
		expect(sectionBody(next, 'Open questions')).toBe('- **Q** — y?\n\n**Sneaky heading**');
		expect(sectionBody(next, 'Core philosophy')).toBe(
			sectionBody(customFixture, 'Core philosophy')
		);
	});

	it("keeps a section's own spacing so the diff is only the changed lines", () => {
		const added = '- **New** — x. _(2026-09-22)_';
		const next = applyStartHereSectionBodies(customFixture, [
			{
				heading: 'Decisions',
				markdown: `${sectionBody(customFixture, 'Decisions')}\n${added}`
			}
		]);
		const before = customFixture.split('\n');
		expect(next.split('\n').filter((line) => !before.includes(line))).toEqual([added]);
		expect(next.split('\n')).toHaveLength(before.length + 1);
	});

	it('flags managed-fence edits, new duplicate headings, and removed sections', () => {
		const changedFence = customFixture.replace(
			'**Now:** 7 open tasks',
			'**Now:** 8 open tasks'
		);
		const twin = customFixture.replace('## Core philosophy', '## Decisions');
		const removed = customFixture.replace('## Core philosophy', '**Core philosophy**');
		expect(checkStartHereCaptureInvariants(customFixture, changedFence)).toEqual([
			'managed_regions_changed'
		]);
		expect(checkStartHereCaptureInvariants(customFixture, twin)).toEqual([
			'duplicate_heading',
			'section_removed'
		]);
		expect(checkStartHereCaptureInvariants(customFixture, removed)).toEqual([
			'section_removed'
		]);
	});

	it('keeps ### subheadings in a section body but demotes # and ##', () => {
		expect(
			sanitizeStartHereSectionMarkdown('### Phase 1\n## Split\n# Title\n<!-- x -->text')
		).toBe('### Phase 1\n**Split**\n**Title**\ntext');
	});
});
