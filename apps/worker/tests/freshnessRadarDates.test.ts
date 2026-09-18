// apps/worker/tests/freshnessRadarDates.test.ts
// Tasker 88 Lane B: deterministic civil dates for the freshness radar.
import { describe, expect, it } from 'vitest';
import {
	civilDateInZone,
	collectDateMentions,
	countNonAbsoluteDateMentions,
	inferNextOccurrence,
	parseAbsoluteDates,
	relativeAgePhrase,
	relativeDuePhrase,
	splitSentences,
	storedCivilDate,
	zonedMidnightIso
} from '../src/workers/freshness-radar/dates';

const TODAY = '2026-09-18';

describe('parseAbsoluteDates', () => {
	it('parses ISO, month-day, day-month and explicit years', () => {
		const text =
			'Launch moved to Oct 3. Review on 2026-11-20, retro 5 December 2026 and demo October 12th, 2027.';
		expect(parseAbsoluteDates(text, TODAY).map((match) => [match.literal, match.iso])).toEqual([
			['Oct 3', '2026-10-03'],
			['2026-11-20', '2026-11-20'],
			['5 December 2026', '2026-12-05'],
			['October 12th, 2027', '2027-10-12']
		]);
	});

	it('infers a missing year to the next occurrence on or after today', () => {
		expect(parseAbsoluteDates('due Sep 18', TODAY)[0]?.iso).toBe('2026-09-18');
		expect(parseAbsoluteDates('due Sep 17', TODAY)[0]?.iso).toBe('2027-09-17');
		expect(parseAbsoluteDates('due Jan 5', '2026-12-20')[0]?.iso).toBe('2027-01-05');
		expect(parseAbsoluteDates('due Jan 5', '2026-12-20')[0]?.explicitYear).toBe(false);
		expect(inferNextOccurrence(2, 29, '2026-03-01')).toBe('2028-02-29');
	});

	it('rejects relative and numeric dates, invalid days and verb-like month words', () => {
		expect(parseAbsoluteDates('ship it next Friday or tomorrow', TODAY)).toEqual([]);
		expect(parseAbsoluteDates('moved to 10/3', TODAY)).toEqual([]);
		expect(parseAbsoluteDates('Feb 30 and 2026-02-30', TODAY)).toEqual([]);
		expect(parseAbsoluteDates('this may 3 people help', TODAY)).toEqual([]);
		expect(parseAbsoluteDates('It ships May 3', TODAY)[0]?.iso).toBe('2027-05-03');
		expect(parseAbsoluteDates('the market 3 times', TODAY)).toEqual([]);
		expect(parseAbsoluteDates('Oct 300 units', TODAY)).toEqual([]);
	});

	it('counts non-absolute date phrases so grounding can refuse them', () => {
		expect(countNonAbsoluteDateMentions('move it to 10/3')).toBe(1);
		expect(countNonAbsoluteDateMentions('next Friday, or by end of the month')).toBe(2);
		expect(countNonAbsoluteDateMentions('due Oct 3')).toBe(0);
	});
});

describe('civil dates and phrases', () => {
	it('reads instants in the user timezone at the day boundary', () => {
		// 02:00Z on the 19th is still the 18th in New York.
		expect(civilDateInZone('2026-09-19T02:00:00.000Z', 'America/New_York')).toBe('2026-09-18');
		expect(civilDateInZone('2026-09-19T02:00:00.000Z', 'UTC')).toBe('2026-09-19');
		expect(civilDateInZone('2026-09-19T02:00:00.000Z', 'Not/AZone')).toBe('2026-09-19');
		// Task due_at is stored as the end of the civil day in the user's zone.
		expect(storedCivilDate('2026-10-04T03:59:59.000Z', 'America/New_York')).toBe('2026-10-03');
		expect(storedCivilDate('2026-10-03', 'America/New_York')).toBe('2026-10-03');
		expect(storedCivilDate(null, 'UTC')).toBeNull();
	});

	it('precomputes age and due phrases (Jev never does arithmetic)', () => {
		const now = new Date('2026-09-18T15:00:00.000Z');
		expect(relativeAgePhrase('2026-09-18T01:00:00.000Z', now, 'UTC')).toBe('today');
		expect(relativeAgePhrase('2026-09-17T12:00:00.000Z', now, 'UTC')).toBe('yesterday');
		expect(relativeAgePhrase('2026-09-06T12:00:00.000Z', now, 'UTC')).toBe('12 days ago');
		expect(relativeAgePhrase('2026-08-01T12:00:00.000Z', now, 'UTC')).toBe('6 weeks ago');
		expect(relativeDuePhrase('2026-10-03', TODAY)).toBe('in 15 days');
		expect(relativeDuePhrase('2026-09-15', TODAY)).toBe('3 days ago');
	});
});

describe('sentences and mentions', () => {
	it('splits on punctuation and lines but not inside "Oct. 3"', () => {
		expect(
			splitSentences(
				'Deck is done. Launch moved to Oct. 3!\n- Venue is blocked on the contract'
			)
		).toEqual(['Deck is done.', 'Launch moved to Oct. 3!', 'Venue is blocked on the contract']);
	});

	it('collects mentions newest-first, deduplicated and capped', () => {
		const sentences = [
			{ messageId: 'm2', sessionId: 's', text: 'Launch is now Oct 3.' },
			{ messageId: 'm1', sessionId: 's', text: 'Launch is now Oct 3.' },
			{ messageId: 'm1', sessionId: 's', text: 'Retro on Nov 4 and demo on Nov 5.' }
		];
		const mentions = collectDateMentions(sentences, TODAY, 2);
		expect(mentions.map((mention) => [mention.id, mention.date, mention.messageId])).toEqual([
			['d1', '2026-10-03', 'm2'],
			['d2', '2026-11-04', 'm1']
		]);
	});
});

describe('zonedMidnightIso', () => {
	it('returns local midnight so a date-only milestone keeps its calendar day', () => {
		expect(zonedMidnightIso('2026-10-03', 'America/New_York')).toBe('2026-10-03T04:00:00.000Z');
		expect(zonedMidnightIso('2026-12-03', 'America/New_York')).toBe('2026-12-03T05:00:00.000Z');
		expect(zonedMidnightIso('2026-10-03', 'Asia/Tokyo')).toBe('2026-10-02T15:00:00.000Z');
		expect(
			civilDateInZone(
				zonedMidnightIso('2026-10-03', 'America/Los_Angeles'),
				'America/Los_Angeles'
			)
		).toBe('2026-10-03');
	});

	it('honors a DST change on the day and falls back to UTC for a bad zone', () => {
		// US clocks fall back on 2026-11-01 at 02:00; midnight is still EDT.
		expect(zonedMidnightIso('2026-11-01', 'America/New_York')).toBe('2026-11-01T04:00:00.000Z');
		expect(zonedMidnightIso('2026-03-08', 'America/New_York')).toBe('2026-03-08T05:00:00.000Z');
		expect(zonedMidnightIso('2026-10-03', 'Not/AZone')).toBe('2026-10-03T00:00:00.000Z');
		expect(zonedMidnightIso('2026-10-03', null)).toBe('2026-10-03T00:00:00.000Z');
	});
});
