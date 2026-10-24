// packages/shared-agent-ops/src/ontology/about-you.test.ts
import { describe, expect, it } from 'vitest';
import {
	ABOUT_YOU_ANSWERS_HEADING,
	ABOUT_YOU_LIMITS,
	aboutYouLineKey,
	aboutYouNotedLabel,
	findAboutYouSection,
	findUserAddedAboutYouLines,
	findUserRemovedAboutYouLines,
	gatedAboutYouSections,
	mergeAboutYouProposal,
	parseAboutYouDocument,
	renderAboutYouDocument,
	renderAboutYouSectionsForPrompt,
	type AboutYouSection
} from './about-you';

const NOW = new Date('2026-10-23T20:00:00Z');

const written: AboutYouSection[] = [
	{
		heading: ABOUT_YOU_ANSWERS_HEADING,
		lines: [
			{ text: 'Outcome first, in product terms', noted: 'Sep 2026' },
			{ text: 'For status: where things stand, then the next step', noted: 'Oct 2026' }
		]
	},
	{
		heading: 'Schedule and constraints',
		lines: [
			{ text: 'Works later in the day, into the night', noted: 'Oct 2026' },
			{ text: 'New baby at home; keep plans realistic', noted: 'Oct 2026' }
		]
	}
];

describe('About you document format', () => {
	it('round-trips through render and parse', () => {
		const content = renderAboutYouDocument(written);
		expect(content.startsWith('# About you\n\n_BuildOS keeps this note')).toBe(true);
		expect(content).toContain('- Outcome first, in product terms _(Sep 2026)_');
		expect(parseAboutYouDocument(content)).toEqual(written);
	});

	it('reads a note the user edited by hand', () => {
		const sections = parseAboutYouDocument(
			[
				'# About you',
				'Some intro the user rewrote.',
				'## How you like answers',
				'* Short answers',
				'',
				'Plain paragraph line',
				'that wraps.',
				'## Empty heading',
				'### Where you are',
				'1. Glen Burnie, MD (Oct 2026)'
			].join('\n')
		);
		expect(sections).toEqual([
			{
				heading: 'How you like answers',
				lines: [
					{ text: 'Short answers', noted: null },
					{ text: 'Plain paragraph line that wraps.', noted: null }
				]
			}
		]);
	});

	it('keeps lines under h3 out and ends a section at a new h1', () => {
		const sections = parseAboutYouDocument(
			'## A\n- one\n# Other doc\n- not in A\n## B\n- two _(Oct 2026)_'
		);
		expect(sections).toEqual([
			{ heading: 'A', lines: [{ text: 'one', noted: null }] },
			{ heading: 'B', lines: [{ text: 'two', noted: 'Oct 2026' }] }
		]);
	});

	it('folds case, punctuation and the noted date into one key', () => {
		expect(aboutYouLineKey('Works LATER in the day! _(Oct 2026)_')).toBe(
			aboutYouLineKey('works later in the day')
		);
		expect(aboutYouNotedLabel(NOW)).toBe('Oct 2026');
	});
});

describe('user edits', () => {
	it('finds lines the user deleted and lines the user typed', () => {
		const current: AboutYouSection[] = [
			{ heading: ABOUT_YOU_ANSWERS_HEADING, lines: [written[0]!.lines[0]!] },
			{
				heading: 'Schedule and constraints',
				lines: [written[1]!.lines[0]!, { text: 'No calls before 10am', noted: null }]
			}
		];
		expect(findUserRemovedAboutYouLines(written, current)).toEqual([
			aboutYouLineKey('For status: where things stand, then the next step'),
			aboutYouLineKey('New baby at home; keep plans realistic')
		]);
		expect(findUserAddedAboutYouLines(written, current)).toEqual([
			{
				heading: 'Schedule and constraints',
				line: { text: 'No calls before 10am', noted: null }
			}
		]);
	});
});

describe('mergeAboutYouProposal', () => {
	it('never brings back a deleted line and always keeps a typed one', () => {
		const current: AboutYouSection[] = [
			{ heading: ABOUT_YOU_ANSWERS_HEADING, lines: [written[0]!.lines[0]!] },
			{
				heading: 'Schedule and constraints',
				lines: [{ text: 'No calls before 10am', noted: null }]
			}
		];
		const result = mergeAboutYouProposal({
			current,
			lastWritten: written,
			suppressedKeys: [],
			proposed: [
				{ heading: ABOUT_YOU_ANSWERS_HEADING, text: 'Outcome first, in product terms' },
				{
					heading: ABOUT_YOU_ANSWERS_HEADING,
					text: 'For status: where things stand, then the next step.'
				},
				{
					heading: 'Schedule and constraints',
					text: 'New baby at home; keep plans realistic'
				},
				{ heading: "What you're focused on", text: 'Interviewing for FDE roles' }
			],
			now: NOW
		});
		expect(result.sections).toEqual([
			{
				heading: ABOUT_YOU_ANSWERS_HEADING,
				lines: [{ text: 'Outcome first, in product terms', noted: 'Sep 2026' }]
			},
			{
				heading: 'Schedule and constraints',
				lines: [{ text: 'No calls before 10am', noted: null }]
			},
			{
				heading: "What you're focused on",
				lines: [{ text: 'Interviewing for FDE roles', noted: 'Oct 2026' }]
			}
		]);
		expect(result.suppressedKeys).toHaveLength(3);
		expect(result.dropped.map((entry) => entry.reason)).toEqual(['suppressed', 'suppressed']);
	});

	it('treats every line as the user’s own before BuildOS first writes', () => {
		const result = mergeAboutYouProposal({
			current: [
				{ heading: 'Where you are', lines: [{ text: 'Glen Burnie, MD', noted: null }] }
			],
			lastWritten: null,
			suppressedKeys: [],
			proposed: [],
			now: NOW
		});
		expect(result.sections).toEqual([
			{ heading: 'Where you are', lines: [{ text: 'Glen Burnie, MD', noted: null }] }
		]);
	});

	it('puts the answers section first and enforces the caps on BuildOS lines only', () => {
		const proposed = [
			...Array.from({ length: 8 }, (_, index) => ({
				heading: 'Schedule and constraints',
				text: `Constraint number ${index + 1}`
			})),
			{ heading: ABOUT_YOU_ANSWERS_HEADING, text: 'Short answers' },
			...Array.from({ length: 6 }, (_, index) => ({
				heading: `Extra section ${index + 1}`,
				text: `Extra line ${index + 1}`
			}))
		];
		const result = mergeAboutYouProposal({
			current: [],
			lastWritten: [],
			suppressedKeys: [],
			proposed,
			now: NOW
		});
		expect(result.sections[0]!.heading).toBe(ABOUT_YOU_ANSWERS_HEADING);
		expect(result.sections).toHaveLength(ABOUT_YOU_LIMITS.maxSections);
		expect(
			findAboutYouSection(result.sections, 'schedule and constraints')!.lines
		).toHaveLength(ABOUT_YOU_LIMITS.maxLinesPerSection);
		expect(result.dropped.filter((entry) => entry.reason === 'over_cap')).toHaveLength(5);
	});

	it('cleans markdown and long lines from the proposal', () => {
		const result = mergeAboutYouProposal({
			current: [],
			lastWritten: [],
			suppressedKeys: [],
			proposed: [
				{ heading: '## **Where** you are', text: '# Glen Burnie\nMD <b>area</b>' },
				{ heading: 'Where you are', text: 'x'.repeat(400) },
				{ heading: 'Where you are', text: '   ' }
			],
			now: NOW
		});
		const section = findAboutYouSection(result.sections, 'Where you are')!;
		expect(section.heading).toBe('Where you are');
		expect(section.lines[0]!.text).toBe('Glen Burnie MD area');
		expect(section.lines[1]!.text.length).toBe(ABOUT_YOU_LIMITS.maxLineChars);
		expect(result.dropped).toEqual([{ text: '', reason: 'empty' }]);
	});
});

describe('prompt helpers', () => {
	it('splits the always-on section from the gated ones and renders compactly', () => {
		expect(gatedAboutYouSections(written).map((section) => section.heading)).toEqual([
			'Schedule and constraints'
		]);
		expect(renderAboutYouSectionsForPrompt(written)).toBe(
			[
				'How you like answers: Outcome first, in product terms; For status: where things stand, then the next step.',
				'Schedule and constraints: Works later in the day, into the night; New baby at home; keep plans realistic.'
			].join('\n')
		);
	});
});
