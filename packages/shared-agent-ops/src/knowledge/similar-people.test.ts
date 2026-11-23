// packages/shared-agent-ops/src/knowledge/similar-people.test.ts
import { describe, expect, it } from 'vitest';
import {
	compareSimilarPeople,
	findSimilarPairs,
	findSimilarPeople,
	nameDistance,
	type SimilarPersonInput
} from './similar-people';

// The real "Matt" neighbourhood of one user's graph (2026-11-23): the phone contact "Matt Solo"
// is the LinkedIn/tasks "Matt Solowynsky"; the rest share a first name or a "Solo" prefix.
const CADRE = 'org-cadre';
const ALLIANCE = 'org-alliance';
const people: SimilarPersonInput[] = [
	{ id: 'solo', name: 'Matt Solo' },
	{ id: 'solowynsky', name: 'Matt Solowynsky', employerIds: [CADRE] },
	{ id: 'matt', name: 'Matt', employerIds: [ALLIANCE] },
	{ id: 'solomon', name: 'Matthew Solomon' },
	{ id: 'pat', name: 'Pat Soloman' },
	{ id: 'dmitry', name: 'Dmitry Solominsky' },
	{ id: 'zimmerman', name: 'Matthew Zimmerman' },
	{ id: 'wolek', name: 'Matt Wolek' },
	{ id: 'wolek2', name: 'Matthew Wolek' },
	{ id: 'heckel', name: 'Matt Heckel' }
];
const byId = (id: string) => people.find((p) => p.id === id)!;

describe('findSimilarPeople', () => {
	it('puts Matt Solowynsky first for Matt Solo, then the weaker look-alikes', () => {
		const found = findSimilarPeople(byId('solo'), people);
		expect(found.map((m) => [m.id, m.rule])).toEqual([
			['solowynsky', 'cut_short'],
			['solomon', 'cut_short'],
			['matt', 'first_name']
		]);
		expect(found[0]!.reason).toBe('“Solo” could be short for “Solowynsky”');
		expect(found[0]!.score).toBeGreaterThan(found[1]!.score);
	});

	it('never suggests a different first name or an unrelated last name', () => {
		const ids = findSimilarPeople(byId('solo'), people).map((m) => m.id);
		expect(ids).not.toContain('pat');
		expect(ids).not.toContain('dmitry');
		expect(ids).not.toContain('zimmerman');
		expect(ids).not.toContain('heckel');
	});

	it('leaves out pairs already answered "Not them"', () => {
		const ids = findSimilarPeople(byId('solo'), people, {
			exclude: new Set(['solowynsky'])
		}).map((m) => m.id);
		expect(ids).not.toContain('solowynsky');
		expect(ids).toContain('solomon');
	});

	it('drops first-name-only guesses when there are several ("Matt" alone vs every Matt X)', () => {
		const found = findSimilarPeople({ id: 'x', name: 'Matt' }, people);
		expect(found.filter((m) => m.rule === 'first_name')).toEqual([]);
	});

	it('keeps a first-name-only guess that shares the company', () => {
		const found = findSimilarPeople({ id: 'x', name: 'Matt', employerIds: [CADRE] }, people);
		expect(found[0]).toMatchObject({ id: 'solowynsky', rule: 'first_name_company' });
	});

	it('shows exact same-name entries on the card', () => {
		const found = findSimilarPeople({ id: 'x', name: 'matt  heckel' }, people);
		expect(found[0]).toMatchObject({ id: 'heckel', rule: 'same_name' });
	});
});

describe('compareSimilarPeople', () => {
	const cmp = (a: string, b: string, ea?: string[], eb?: string[]) =>
		compareSimilarPeople(
			{ id: 'a', name: a, employerIds: ea },
			{ id: 'b', name: b, employerIds: eb }
		)?.rule ?? null;

	it('matches nicknames with the same last name', () => {
		expect(cmp('Matt Wolek', 'Matthew Wolek')).toBe('nickname');
		expect(cmp('Bill Jones', 'William Jones')).toBe('nickname');
	});

	it('matches a middle word or reordered name', () => {
		expect(cmp('Zach Work Saucier', 'Zach Saucier')).toBe('spelling');
		expect(cmp('Sewalt, Lance', 'Lance Sewalt')).toBe('spelling');
	});

	it('matches a one-letter misspelling of a last name', () => {
		expect(cmp('Matt Solowinsky', 'Matt Solowynsky')).toBe('typo');
		expect(cmp('Matt Rau', 'Matt Rao')).toBeNull(); // too short to tell
	});

	it('drops a first-name-only guess when both work at different known places', () => {
		expect(cmp('Matt', 'Matt Solowynsky', [ALLIANCE], [CADRE])).toBeNull();
		expect(cmp('Matt', 'Matt Solowynsky')).toBe('first_name');
	});

	it('needs a three-letter stem for a cut-short last name', () => {
		expect(cmp('Matt So', 'Matt Solowynsky')).toBeNull();
	});
});

describe('findSimilarPairs', () => {
	it('finds the Solo / Solowynsky pair across the graph and skips weak guesses', () => {
		const pairs = findSimilarPairs(people);
		const keys = pairs.map((p) => `${p.a}|${p.b}`);
		expect(keys).toContain('solo|solowynsky');
		expect(keys).toContain('wolek|wolek2');
		expect(pairs.every((p) => p.score >= 0.6)).toBe(true);
		expect(pairs.every((p) => p.a < p.b)).toBe(true);
		expect(pairs.some((p) => p.rule === 'first_name')).toBe(false);
	});

	it('leaves exact same names to the same-name review', () => {
		const pairs = findSimilarPairs([
			{ id: 'a', name: 'Craig' },
			{ id: 'b', name: 'craig' }
		]);
		expect(pairs).toEqual([]);
	});

	it('pairs short and long first names that start differently (Bill / William)', () => {
		const pairs = findSimilarPairs([
			{ id: 'a', name: 'Bill Smithson' },
			{ id: 'b', name: 'William Smithsonian' }
		]);
		expect(pairs).toMatchObject([{ a: 'a', b: 'b', rule: 'cut_short' }]);
	});
});

describe('nameDistance', () => {
	it('counts edits and adjacent swaps', () => {
		expect(nameDistance('solowinsky', 'solowynsky')).toBe(1);
		expect(nameDistance('smtih', 'smith')).toBe(1);
		expect(nameDistance('abc', 'xyz', 1)).toBe(2);
	});
});
