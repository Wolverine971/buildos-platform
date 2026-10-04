// apps/worker/tests/consolidationMerge.test.ts
// Merge steps on DJ's real Rod Chamberlin docs
// (docs/research/doc-task-consolidation-2026-10-03/rod-ledger.json).
import { describe, expect, it } from 'vitest';
import {
	type ConsolidationQuestion,
	type MergeLedger,
	applyEdits,
	checkLedger,
	parseConsolidationQuestion,
	questionEdits
} from '@buildos/shared-agent-ops/consolidation';
import {
	type MergeSource,
	addOwnerFacts,
	assembleDocument,
	chunkSource,
	mergeQuestionRows,
	mergeStart,
	numberFacts,
	ownerAnswers,
	parseExtraction,
	parseReconcile,
	requiredQuestions,
	staleSources,
	stripMarkers,
	uncitedFacts
} from '../src/workers/consolidation/merge';

const RUN = 'aaaaaaaa-0000-4000-8000-000000000001';
const S = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`;

const source = (
	n: number,
	title: string,
	content: string,
	updated = '2026-01-20'
): MergeSource => ({
	id: S(n),
	title,
	project: 'Wayne Strategies',
	created_at: '2026-01-11T00:00:00Z',
	updated_at: `${updated}T00:00:00Z`,
	description: null,
	content
});

const intake = source(
	1,
	'Rod Chamberlin - Magnum Wealth Management Client Intake',
	'# Client intake\nReferral source: Phil Velayo.\nIncludes team bios and a website audit.'
);
const deploy = source(
	2,
	'Rod Website - Deployment Plan',
	'# Phase 3: Deploy & Launch\n- Domains: Ionos (magnumwealthmanagement.com,\n  beyondexitplanning.com).\n- Demo Jan 20, launch post-approval.\nasdf asdf test'
);
const hold = source(
	3,
	'Rod website status',
	'All website work ON HOLD pending compliance review. Check-in Monday, February 2.',
	'2026-01-28'
);
const titleOf = (id: string) =>
	[intake, deploy, hold].find((item) => item.id === id)?.title ?? 'a source';

function extracted(): MergeLedger {
	return numberFacts([
		parseExtraction(
			{
				facts: [
					{
						text: 'Rod is a referral from Phil Velayo.',
						kind: 'durable',
						quote: 'Referral source: Phil Velayo.'
					},
					{ text: 'Rod has a $10M book.', kind: 'durable', quote: 'Rod has a $10M book' }
				],
				hollow: {
					is_hollow: true,
					note: 'Claims team bios and a website audit that are not here.'
				}
			},
			intake
		),
		parseExtraction(
			{
				facts: [
					{
						text: 'Domains on Ionos: magnumwealthmanagement.com and beyondexitplanning.com.',
						kind: 'reference',
						quote: 'Domains: Ionos (magnumwealthmanagement.com, beyondexitplanning.com)'
					},
					{
						text: 'Demo planned Jan 20; launch after approval.',
						kind: 'plan',
						as_of: '2026-01-14',
						quote: 'Demo Jan 20, launch post-approval.'
					}
				],
				junk: [{ quote: 'asdf asdf test', note: 'Typing test.' }]
			},
			deploy
		),
		parseExtraction(
			{
				facts: [
					{
						text: 'All website work is on hold pending compliance review.',
						kind: 'status',
						as_of: '2026-01-28',
						quote: 'All website work ON HOLD pending compliance review.'
					},
					{
						text: 'Check-in on Monday, February 2.',
						kind: 'plan',
						as_of: '2026-01-28',
						quote: 'Check-in Monday, February 2.'
					}
				]
			},
			hold
		)
	]);
}

describe('merge: extract', () => {
	it('keeps facts whose quote is in the source, sets aside the rest, flags junk', () => {
		const ledger = extracted();
		expect(ledger.facts.map((fact) => fact.text)).toEqual([
			'Rod is a referral from Phil Velayo.',
			'Domains on Ionos: magnumwealthmanagement.com and beyondexitplanning.com.',
			'Demo planned Jan 20; launch after approval.',
			'All website work is on hold pending compliance review.',
			'Check-in on Monday, February 2.'
		]);
		expect(ledger.facts.map((fact) => fact.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5']);
		// Invented by the reader: not in the intake, so not kept, but shown.
		expect(ledger.unverified).toEqual([{ source_id: S(1), text: 'Rod has a $10M book.' }]);
		expect(ledger.flags.map((flag) => flag.kind)).toEqual(['hollow', 'junk']);
	});

	it('splits a long source at headings', () => {
		const long = `# A\n${'a'.repeat(50)}\n# B\n${'b'.repeat(50)}\n## C\n${'c'.repeat(50)}`;
		const chunks = chunkSource(long, 60);
		expect(chunks).toHaveLength(3);
		expect(chunks.every((chunk) => chunk.startsWith('#'))).toBe(true);
		expect(chunks.join('\n')).toBe(long);
	});

	it('cuts a long section with no headings at paragraph ends, with overlap, never mid-word', () => {
		const sentences = Array.from(
			{ length: 30 },
			(_, n) => `Sentence ${n + 1} names client ${n + 1} and their date.`
		);
		const paragraphs = Array.from({ length: 6 }, (_, n) =>
			sentences.slice(n * 5, n * 5 + 5).join(' ')
		);
		const long = paragraphs.join('\n\n');
		const chunks = chunkSource(long, 400, 120);
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks.every((chunk) => chunk.length <= 400)).toBe(true);
		// Every sentence is read whole by at least one reader.
		for (const sentence of sentences)
			expect(chunks.some((chunk) => chunk.includes(sentence))).toBe(true);
		// Pieces start at a sentence or line, never inside a word.
		for (const chunk of chunks.slice(1)) expect(chunk).toMatch(/^(\n*)Sentence \d+/);
	});

	it('checks a long quote before shortening it', () => {
		const cell = `${'Long reference text about the compliance review. '.repeat(8)}End.`;
		const long = source(9, 'Long doc', `Intro.\n${cell}\nOutro.`);
		const parsed = parseExtraction(
			{ facts: [{ text: 'The compliance review notes.', quote: cell.trim() }] },
			long
		);
		expect(parsed.unverified).toEqual([]);
		expect(parsed.facts).toHaveLength(1);
		expect(Array.from(parsed.facts[0]!.quote).length).toBeLessThanOrEqual(300);
	});

	it('keeps a fact read from text flagged as junk for the editor to drop with a reason', () => {
		const ledger = numberFacts([
			parseExtraction(
				{
					facts: [
						{ text: 'Test note 2026-10-12.', quote: 'asdf asdf test' },
						{ text: 'Demo Jan 20.', quote: 'Demo Jan 20' }
					],
					junk: [{ quote: 'asdf asdf test', note: 'Typing test.' }]
				},
				deploy
			)
		]);
		expect(ledger.facts.map((fact) => fact.text)).toEqual([
			'Test note 2026-10-12.',
			'Demo Jan 20.'
		]);
		expect(ledger.flags).toMatchObject([{ kind: 'junk', quote: 'asdf asdf test' }]);
	});
});

describe('merge: reconcile', () => {
	// The compact answer: ids under section headings, linked fates as pairs.
	const raw = {
		sections: [
			{ heading: 'Where things stand', keep: ['F2'] },
			{ heading: 'Who Rod is', keep: ['F1', 'F9'] },
			{ heading: 'Website history', history: ['F3'] }
		],
		conflict: [['F4', 'F3']],
		questions: [
			{
				facts: ['F1'],
				header: 'One option',
				question: 'Only one way?',
				options: [
					{ label: 'Only', edits: [{ fact: 'F1', fate: 'keep', section: 'Who Rod is' }] }
				]
			}
		]
	};

	it('reads the older one-record-per-fact answer the same way', () => {
		const older = parseReconcile(
			{
				sections: ['Where things stand', 'Who Rod is', 'Website history'],
				fates: [
					{ fact: 'F1', fate: 'keep', section: 'Who Rod is' },
					{ fact: 'F2', fate: 'keep', section: 'Where things stand' },
					{ fact: 'F3', fate: 'history', section: 'Website history' },
					{ fact: 'F4', fate: 'conflict', with: 'F3' }
				]
			},
			extracted()
		);
		const compact = parseReconcile(raw, extracted());
		const key = (ledger: MergeLedger) =>
			ledger.fates
				.map(
					(fate) =>
						`${fate.fact_id}:${fate.fate}:${fate.with ?? ''}:${fate.section ?? ''}`
				)
				.sort();
		expect(key(older.ledger)).toEqual(key(compact.ledger));
		expect(older.ledger.sections).toEqual(compact.ledger.sections);
	});

	it('keeps reasons on missing and dropped pairs', () => {
		const parsed = parseReconcile(
			{
				sections: [{ heading: 'Notes', keep: ['F1'] }],
				missing: [['F2', 'claims an audit that is not there']],
				dropped: [['F9', 'unknown id']]
			},
			extracted()
		);
		expect(parsed.ledger.fates).toEqual([
			{ fact_id: 'F1', fate: 'keep', with: null, reason: null, section: 'Notes' },
			{
				fact_id: 'F2',
				fate: 'missing',
				with: null,
				reason: 'claims an audit that is not there',
				section: null
			}
		]);
	});

	it('keeps the recommended option pointing at the same option after empty ones are dropped', () => {
		const parsed = parseReconcile(
			{
				sections: [{ heading: 'Where things stand', keep: ['F4'] }],
				conflict: [['F3', 'F4']],
				questions: [
					{
						facts: ['F3', 'F4'],
						header: 'F3 vs F4',
						question: 'Which date holds?',
						options: [
							{ label: 'Keep both', edits: [] },
							{
								label: 'Use the newer one',
								edits: [{ fact: 'F3', fate: 'superseded', with: 'F4' }]
							},
							{
								label: 'Keep the demo as history',
								edits: [{ fact: 'F3', fate: 'history', section: 'Where things stand' }]
							}
						],
						recommended: 2
					}
				]
			},
			extracted()
		);
		const [question] = parsed.questions;
		expect(question!.options.map((option) => option.label)).toEqual([
			'Use the newer one',
			'Keep the demo as history'
		]);
		expect(question!.recommended).toBe(1);
		// Fact ids in the header are named, never shown.
		expect(question!.header).not.toMatch(/\bF\d/);
	});

	it('keeps only fates for real facts, repairs gaps by keeping, and drops a one-option question', () => {
		const parsed = parseReconcile(raw, extracted());
		expect(parsed.questions).toEqual([]);
		expect(checkLedger(parsed.ledger).map((problem) => problem.fact_id)).toEqual(['F5']);
	});

	it('asks about every unsettled conflict and never drops a fact on "decide later"', () => {
		const parsed = parseReconcile(raw, extracted());
		const ledger = applyEdits(parsed.ledger, []);
		const drafts = requiredQuestions(
			{
				...ledger,
				fates: ledger.fates.map((fate) =>
					fate.fact_id === 'F4' ? { ...fate, fate: 'conflict', with: 'F3' } : fate
				)
			},
			parsed.questions,
			titleOf
		);
		expect(drafts.map((draft) => draft.header)).toEqual(['Conflict']);
		const rows = mergeQuestionRows({
			clusterKey: 'c3',
			drafts,
			ledger,
			sourceIds: [S(1), S(2), S(3)],
			titleOf
		});
		const card = parseConsolidationQuestion({
			...rows[0],
			id: RUN,
			run_id: RUN,
			status: 'open'
		});
		expect(card).not.toBeNull();
		expect(card!.piece).toBe('merge:c3:1');
		expect(card!.options.map((option) => option.id)).toEqual(['o1', 'o2', 'later']);
		expect(card!.skip_option_id).toBe('later');
		// Unanswered, with nothing recommended: no fact changes.
		expect(questionEdits(card!)).toEqual([]);
		// The card names the on-hold note (F4) first and the Jan 20 demo plan (F3) second;
		// picking the second keeps it and marks the first replaced by it.
		expect(card!.question).toMatch(/“All website work.*“Demo planned Jan 20/);
		const picked = questionEdits({
			...card!,
			status: 'answered',
			answer: { via: 'option', option_id: 'o2' }
		});
		expect(picked.map((edit) => [edit.fact_id, edit.fate, edit.with])).toEqual([
			['F3', 'keep', null],
			['F4', 'superseded', 'F3']
		]);
	});
});

describe('merge: write', () => {
	const ledger: MergeLedger = {
		...extracted(),
		sections: ['Where things stand', 'Who Rod is'],
		fates: [
			{ fact_id: 'F1', fate: 'keep', with: null, reason: null, section: 'Who Rod is' },
			{ fact_id: 'F2', fate: 'keep', with: null, reason: null, section: 'Who Rod is' },
			{ fact_id: 'F3', fate: 'superseded', with: 'F4', reason: null, section: null },
			{
				fact_id: 'F4',
				fate: 'keep',
				with: null,
				reason: null,
				section: 'Where things stand'
			},
			{ fact_id: 'F5', fate: 'conflict', with: 'F4', reason: null, section: null }
		]
	};

	it('finds facts the writer never cited, and strips the markers', () => {
		const body =
			'## Where things stand\nWebsite work is on hold for compliance. [[F4]]\n## Who Rod is\nA referral from Phil Velayo. [[F1]]';
		expect(uncitedFacts(body, ledger)).toEqual(['F2']);
		expect(stripMarkers(body)).not.toContain('[[');
		// Looser citations count and go too.
		const loose = 'On hold. [F4]\nPhil Velayo referred him. [[ F1 , F2 ]]';
		expect(uncitedFacts(loose, ledger)).toEqual([]);
		expect(stripMarkers(loose)).toBe('On hold.\nPhil Velayo referred him.');
	});

	it('assembles the doc: prose, missed facts word for word, what needs an eye, sources', () => {
		const markdown = assembleDocument({
			body: '## Where things stand\nOn hold for compliance.',
			ledger,
			sources: [intake, deploy, hold],
			appended: ['F2'],
			mergedOn: '2026-10-03'
		});
		expect(markdown).toContain('## Also noted\n\n- Domains on Ionos');
		expect(markdown).toContain('## Needs your eye');
		expect(markdown).toContain('- Unsettled: “Check-in on Monday, February 2.”');
		expect(markdown).toContain(
			'- Missing: “Rod Chamberlin - Magnum Wealth Management Client Intake”'
		);
		expect(markdown).toContain('Merged on 2026-10-03');
		expect(markdown).toContain(
			'- Rod website status (Wayne Strategies, last edited 2026-01-28)'
		);
	});

	it('lists notes whose quotes were not found under their own heading, and each hollow doc once', () => {
		const markdown = assembleDocument({
			body: 'Body.',
			ledger: {
				...ledger,
				fates: [
					...ledger.fates,
					{ fact_id: 'F1', fate: 'missing', with: null, reason: 'gone', section: null }
				].filter((fate, index, all) => all.findIndex((x) => x.fact_id === fate.fact_id) === index)
			},
			sources: [intake, deploy, hold],
			appended: [],
			mergedOn: '2026-10-03'
		});
		expect(markdown).toContain('## Couldn’t find word for word');
		expect(markdown).toContain('- Rod has a $10M book. (Rod Chamberlin');
	});

	it("adds the owner's typed answer, in their words, as a fact once", () => {
		const answer = {
			question_id: 'q1',
			words: 'The site launched Feb 10.',
			instruction: 'Mark the demo plan as history.'
		};
		const once = addOwnerFacts(ledger, [answer], '2026-10-03');
		const twice = addOwnerFacts(once, [answer], '2026-10-03');
		expect(once.facts.at(-1)).toMatchObject({
			id: 'F6',
			source_id: 'owner',
			kind: 'decision',
			text: 'The site launched Feb 10.'
		});
		expect(once.instructions).toEqual(['Mark the demo plan as history.']);
		expect(twice.facts).toHaveLength(once.facts.length);
	});
});

describe('merge: owner answers and resuming', () => {
	const card = (overrides: Partial<ConsolidationQuestion>): ConsolidationQuestion => ({
		id: RUN,
		run_id: RUN,
		piece: 'merge:c3:1',
		header: 'Launch date',
		question: 'Which date holds?',
		evidence: [],
		options: [],
		recommended_option_id: null,
		skip_option_id: 'later',
		priority: 41,
		status: 'answered',
		answer: null,
		draft: null,
		answered_at: null,
		created_at: '',
		...overrides
	});
	const reading = (instruction: string | null, option_id: string | null = null) => ({
		option_id,
		instruction,
		readback: 'Will do.'
	});

	it("takes the owner's own words, not the reader's restatement", () => {
		const answers = ownerAnswers([
			card({
				answer: { via: 'text', text: 'It launched Feb 10.', reading: reading('Use Feb 10.') }
			}),
			card({
				id: 'q-chat',
				answer: { via: 'chat', reading: reading('Keep both dates.') },
				draft: {
					via: 'chat',
					text: null,
					reading: null,
					thread: [
						{ role: 'user', text: 'Both are real.', at: '' },
						{ role: 'assistant', text: 'Keep both?', at: '' },
						{ role: 'user', text: 'Yes, Ana confirmed.', at: '' }
					]
				}
			}),
			card({ id: 'q-option', answer: { via: 'text', text: 'the first', reading: reading(null, 'o1') } }),
			card({ id: 'q-open', status: 'open' })
		]);
		expect(answers).toEqual([
			{ question_id: RUN, words: 'It launched Feb 10.', instruction: 'Use Feb 10.' },
			{
				question_id: 'q-chat',
				words: 'Both are real.\nYes, Ana confirmed.',
				instruction: 'Keep both dates.'
			}
		]);
	});

	it('reads the sources only for a new merge, and resumes from a stored ledger', () => {
		const stored = { ...extracted(), questions_posted: true };
		expect(mergeStart('merge', { status: 'pending', ledger: null })).toEqual({ do: 'extract' });
		expect(mergeStart('merge', { status: 'writing', ledger: stored })).toEqual({ do: 'write' });
		expect(mergeStart('merge', { status: 'ready', ledger: stored }).do).toBe('skip');
		expect(
			mergeStart('merge', { status: 'reconciling', ledger: { ...stored, questions_posted: false } })
		).toEqual({ do: 'post_questions' });
		expect(mergeStart('merge_write', { status: 'pending', ledger: null }).do).toBe('skip');
		expect(mergeStart('merge_write', { status: 'pending', ledger: stored })).toEqual({
			do: 'write'
		});
	});

	it('names sources edited since they were read', () => {
		const versions = Object.fromEntries(
			[intake, deploy, hold].map((item) => [item.id, item.updated_at])
		);
		const ledger = { ...extracted(), source_versions: versions };
		expect(staleSources(ledger, [intake, deploy, hold])).toEqual([]);
		expect(
			staleSources(ledger, [intake, { ...deploy, updated_at: '2026-02-01T00:00:00Z' }, hold])
		).toEqual(['Rod Website - Deployment Plan']);
		// A ledger from before versions were kept can't vouch for any source.
		expect(staleSources(extracted(), [intake])).toEqual([intake.title]);
	});

	it('tells two notes from one doc apart on a conflict card', () => {
		const sameDoc = {
			...extracted(),
			sections: ['Where things stand'],
			fates: [
				{
					fact_id: 'F3',
					fate: 'keep' as const,
					with: null,
					reason: null,
					section: 'Where things stand'
				},
				{ fact_id: 'F2', fate: 'conflict' as const, with: 'F3', reason: null, section: null }
			]
		};
		const [draft] = requiredQuestions(sameDoc, [], titleOf);
		expect(draft!.options.map((option) => option.label)).toEqual([
			'Go with “Domains on Ionos: magnumwealthmanagement.com and beyondexitplann…”',
			'Go with “Demo planned Jan 20; launch after approval.”'
		]);
	});
});
