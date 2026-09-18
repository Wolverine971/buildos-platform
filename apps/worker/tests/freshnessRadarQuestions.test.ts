// apps/worker/tests/freshnessRadarQuestions.test.ts
// Tasker 88 Lane B: the three Jev requests (plan section 1, "Exact question text").
import { validateJevQuestions } from '@buildos/smart-llm';
import { describe, expect, it } from 'vitest';
import type { FreshnessDateMention } from '../src/workers/freshness-radar/dates';
import {
	FRESHNESS_QUESTION_SET_SHA256,
	RULE_DATA,
	buildR1Request,
	buildR2Request,
	buildR3Request,
	escapedTitle,
	freshnessRequestSha256,
	type R1Subject
} from '../src/workers/freshness-radar/questions';

const MODEL = 'typesafe/jev-1.13';
const base = {
	model: MODEL,
	maxBytes: 96_000,
	today: '2026-09-18',
	project: { name: 'Store launch', summary: 'Open the pop-up store' },
	newInformation: [
		{ said: '2026-09-18 (today)', text: 'The investor deck is done. Launch is Oct 3.' }
	],
	titleChars: 80
};

const mention: FreshnessDateMention = {
	id: 'd1',
	date: '2026-10-03',
	as_written: 'Oct 3',
	sentence: 'Launch is Oct 3.',
	messageId: 'm1',
	sessionId: 's1'
};

function subject(kind: R1Subject['kind'], title: string): R1Subject {
	return {
		kind,
		view: {
			kind,
			title,
			state: kind === 'task' ? 'todo' : 'active',
			last_changed: '3 days ago'
		}
	};
}

describe('R1 staleness request', () => {
	it('names every subject by index and title and appends RULE_DATA', () => {
		const built = buildR1Request({
			...base,
			dateMentions: [mention],
			dateSentenceChars: 200,
			subjects: [subject('task', 'Investor "deck"'), subject('document', 'Launch plan')]
		});
		const questions = built.request!.questions;
		expect(Object.keys(questions)).toEqual([
			'status_news',
			'stale_0',
			'change_0',
			'date_0',
			'stale_1',
			'change_1'
		]);
		const stale = questions.stale_0 as unknown as {
			instructions: { question: string; rules: string[] };
		};
		expect(stale.instructions.question).toContain('`entities[0]` (task "Investor \\"deck\\"")');
		expect(stale.instructions.rules.at(-1)).toBe(RULE_DATA);
		for (const question of Object.values(questions)) {
			const instructions = question.instructions as { question: string; rules?: string[] };
			expect(instructions.rules).toContain(RULE_DATA);
			expect(instructions.question).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // no ids
		}
		const date = questions.date_0 as { criteria: Record<string, string | null> };
		expect(date.criteria).toEqual({
			d1: '"Oct 3" in: "Launch is Oct 3."',
			none: "No date in date_mentions was given as this record's new date."
		});
		const change = questions.change_1 as { criteria: Record<string, string | null> };
		expect(Object.keys(change.criteria)).toEqual([
			'content_outdated',
			'superseded',
			'no_change_needed',
			'unclear'
		]);
		expect(validateJevQuestions(questions)).toBe(true);
		expect(built.request!.state).toMatchObject({
			today: '2026-09-18',
			date_mentions: [{ id: 'd1', date: '2026-10-03', as_written: 'Oct 3' }]
		});
	});

	it('asks date questions only when there are mentions, and caps at 73 questions', () => {
		const subjects = Array.from({ length: 24 }, (_, index) =>
			subject('task', `Task number ${index}`)
		);
		const withDates = buildR1Request({
			...base,
			dateMentions: [mention],
			dateSentenceChars: 200,
			subjects
		});
		expect(Object.keys(withDates.request!.questions)).toHaveLength(73);
		const withoutDates = buildR1Request({
			...base,
			dateMentions: [],
			dateSentenceChars: 200,
			subjects
		});
		expect(Object.keys(withoutDates.request!.questions)).toHaveLength(49);
		expect(
			Object.keys(withoutDates.request!.questions).some((key) => key.startsWith('date_'))
		).toBe(false);
	});

	it('drops the lowest-ranked subjects until the request fits', () => {
		const subjects = Array.from({ length: 10 }, (_, index) =>
			subject('task', `Long task ${index} ${'x'.repeat(60)}`)
		);
		const full = buildR1Request({
			...base,
			dateMentions: [],
			dateSentenceChars: 200,
			subjects
		});
		const fullBytes = Buffer.byteLength(JSON.stringify(full.request));
		const trimmed = buildR1Request({
			...base,
			maxBytes: Math.floor(fullBytes * 0.6),
			dateMentions: [],
			dateSentenceChars: 200,
			subjects
		});
		expect(trimmed.droppedForSize).toBeGreaterThan(0);
		expect(trimmed.subjects).toEqual(subjects.slice(0, 10 - trimmed.droppedForSize));
		const entities = trimmed.request!.state.entities as Array<{ title: string }>;
		expect(entities.at(-1)!.title).toBe(subjects[9 - trimmed.droppedForSize]!.view.title);
		expect(
			buildR1Request({
				...base,
				maxBytes: 100,
				dateMentions: [],
				dateSentenceChars: 200,
				subjects
			}).request
		).toBeNull();
	});

	it('is byte-stable for the same inputs (stable ordering)', () => {
		const make = () =>
			buildR1Request({
				...base,
				dateMentions: [mention],
				dateSentenceChars: 200,
				subjects: [subject('task', 'A'), subject('milestone', 'B'), subject('goal', 'C')]
			}).request!;
		expect(freshnessRequestSha256(MODEL, make())).toBe(freshnessRequestSha256(MODEL, make()));
		const goalDate = make().questions.date_2 as { instructions: { question: string } };
		expect(goalDate.instructions.question).toContain('new target date');
		const milestoneDate = make().questions.date_1 as { instructions: { question: string } };
		expect(milestoneDate.instructions.question).toContain('new due date');
	});
});

describe('R2 and R3 requests', () => {
	it('builds 2 questions per track subject with a 4-level score', () => {
		const built = buildR2Request({
			...base,
			subjects: [
				{
					view: {
						kind: 'goal',
						title: 'Open store',
						state: 'active',
						target: '2026-10-03',
						facts: ['8 linked tasks: 3 done']
					}
				}
			]
		});
		expect(Object.keys(built.request!.questions)).toEqual(['track_0', 'evidence_0']);
		const track = built.request!.questions.track_0 as unknown as {
			type: string;
			criteria: string[];
		};
		expect(track.type).toBe('score');
		expect(track.criteria).toHaveLength(4);
		expect(validateJevQuestions(built.request!.questions)).toBe(true);
	});

	it('builds one obsolete question per inbox item', () => {
		const built = buildR3Request({
			...base,
			subjects: [
				{
					view: {
						title: 'Move the brief',
						summary: null,
						source: 'project review suggestion',
						created: '4 days ago',
						current_facts: []
					}
				},
				{
					view: {
						title: 'Mark deck done',
						summary: 'x',
						source: 'project review suggestion',
						created: 'today',
						current_facts: ['Target task "Deck" is now done']
					}
				}
			]
		});
		expect(Object.keys(built.request!.questions)).toEqual(['obsolete_0', 'obsolete_1']);
		expect(buildR3Request({ ...base, subjects: [] }).request).toBeNull();
	});
});

describe('frozen wording', () => {
	it('escapes and truncates titles to 80 characters', () => {
		expect(escapedTitle('a'.repeat(100))).toHaveLength(80);
		expect(escapedTitle('Say "hi"\nnow')).toBe('Say \\"hi\\" now');
	});

	it('pins the question-set hash (change the version when this changes)', () => {
		expect(FRESHNESS_QUESTION_SET_SHA256).toMatch(/^[0-9a-f]{64}$/);
		expect(FRESHNESS_QUESTION_SET_SHA256).toMatchInlineSnapshot(
			`"2d43e98de84c2d81cf32ba985740b60dae742c071ef2765417812f29f8d7198b"`
		);
	});
});
