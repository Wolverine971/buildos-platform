// apps/worker/tests/freshnessRadarGrounding.test.ts
// Tasker 88 Lane B: deterministic grounding (plan section 4, rule 3).
import { describe, expect, it } from 'vitest';
import {
	evidenceExcerpt,
	findUnnegatedStateTerm,
	looseGround,
	sentenceNamesEntity,
	strictGroundDueDate,
	strictGroundStateChange
} from '../src/workers/freshness-radar/grounding';

const TODAY = '2026-09-18';
const sentence = (text: string, messageId = 'm1') => ({ messageId, sessionId: 's1', text });

describe('entity anchor', () => {
	it('matches the full title or token coverage, not a bare fragment', () => {
		expect(sentenceNamesEntity('I sent the investor deck to Jen', 'Investor deck')).toBe(true);
		expect(
			sentenceNamesEntity('the investor deck update went out', 'Investor update deck')
		).toBe(true);
		expect(sentenceNamesEntity('the deck for investors went out', 'Investor update deck')).toBe(
			false
		);
		expect(sentenceNamesEntity('Launch', 'Launch plan for the store')).toBe(false);
		expect(sentenceNamesEntity('the weather is nice', 'Investor deck')).toBe(false);
	});
});

describe('state lexicon and negation', () => {
	it('finds the state term and refuses nearby negation or hedges', () => {
		expect(findUnnegatedStateTerm('The investor deck is done', 'done', 3)?.term).toBe('done');
		expect(findUnnegatedStateTerm("The investor deck isn't done", 'done', 3)).toBeNull();
		expect(findUnnegatedStateTerm('The deck is not yet finished', 'done', 3)).toBeNull();
		expect(findUnnegatedStateTerm('The deck will be done Friday', 'done', 3)).toBeNull();
		expect(
			findUnnegatedStateTerm("I haven't started the venue search", 'in_progress', 3)
		).toBeNull();
		expect(
			findUnnegatedStateTerm('We are waiting on legal for the lease', 'blocked', 3)?.term
		).toBe('waiting on');
		// Negation outside the 3-token window does not block.
		expect(
			findUnnegatedStateTerm('No worries at all, the whole deck is done', 'done', 3)?.term
		).toBe('done');
	});

	it('strict state grounding needs one sentence naming the entity with the term', () => {
		const ok = strictGroundStateChange({
			title: 'Investor deck',
			targetState: 'done',
			sentences: [
				sentence('Busy week.'),
				sentence('The investor deck is finished and sent.', 'm2')
			],
			negationWindowTokens: 3
		});
		expect(ok).toMatchObject({ ok: true, term: 'finished' });
		expect(ok.ok && ok.sentence.messageId).toBe('m2');

		// Term in a different sentence than the anchor does not count.
		expect(
			strictGroundStateChange({
				title: 'Investor deck',
				targetState: 'done',
				sentences: [
					sentence('Worked on the investor deck.'),
					sentence('Everything else is done.')
				],
				negationWindowTokens: 3
			})
		).toEqual({ ok: false, reason: 'no_state_term' });
		expect(
			strictGroundStateChange({
				title: 'Investor deck',
				targetState: 'done',
				sentences: [sentence('Is the investor deck done?')],
				negationWindowTokens: 3
			})
		).toEqual({ ok: false, reason: 'question_sentence' });
		expect(
			strictGroundStateChange({
				title: 'Investor deck',
				targetState: 'done',
				sentences: [sentence('The pitch is done.')],
				negationWindowTokens: 3
			})
		).toEqual({ ok: false, reason: 'no_anchor_sentence' });
	});
});

describe('date grounding', () => {
	const base = {
		title: 'Venue contract',
		currentDueCivil: '2026-09-30',
		today: TODAY,
		horizonDays: 365
	};

	it('accepts one absolute date in the anchor sentence', () => {
		const result = strictGroundDueDate({
			...base,
			dateIso: '2026-10-03',
			sentences: [sentence('The venue contract is now due Oct 3.')]
		});
		expect(result).toMatchObject({ ok: true, dateLiteral: 'Oct 3' });
	});

	it('rejects a date in the wrong entity sentence', () => {
		expect(
			strictGroundDueDate({
				...base,
				dateIso: '2026-10-03',
				sentences: [
					sentence('The venue contract slipped.'),
					sentence('The catering tasting is Oct 3.')
				]
			})
		).toEqual({ ok: false, reason: 'date_not_in_anchor' });
	});

	it('rejects multiple dates, relative or numeric companions', () => {
		for (const text of [
			'The venue contract moved from Sep 30 to Oct 3.',
			'The venue contract is due Oct 3, maybe next week.',
			'The venue contract is due Oct 3 (10/3).'
		]) {
			expect(
				strictGroundDueDate({ ...base, dateIso: '2026-10-03', sentences: [sentence(text)] })
			).toEqual({ ok: false, reason: 'multiple_dates' });
		}
	});

	it('rejects out-of-range and unchanged dates', () => {
		expect(
			strictGroundDueDate({
				...base,
				dateIso: '2027-10-03',
				sentences: [sentence('The venue contract is due 2027-10-03.')]
			})
		).toEqual({ ok: false, reason: 'date_out_of_range' });
		expect(
			strictGroundDueDate({
				...base,
				dateIso: '2026-09-30',
				sentences: [sentence('The venue contract is due Sep 30.')]
			})
		).toEqual({ ok: false, reason: 'date_unchanged' });
	});
});

describe('loose grounding and excerpts', () => {
	it('returns the newest naming sentence and bounded excerpts', () => {
		const sentences = [
			sentence('Venue contract signed!', 'm3'),
			sentence('venue contract pending', 'm1')
		];
		expect(looseGround('Venue contract', sentences)?.messageId).toBe('m3');
		expect(looseGround('Catering', sentences)).toBeNull();
		expect(evidenceExcerpt('x'.repeat(200), 160)).toHaveLength(160);
	});
});
