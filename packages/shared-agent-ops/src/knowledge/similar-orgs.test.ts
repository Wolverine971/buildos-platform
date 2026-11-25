// packages/shared-agent-ops/src/knowledge/similar-orgs.test.ts
import { describe, expect, it } from 'vitest';
import { buildOrgIndex, compareOrgNames, findSimilarOrgs } from './similar-orgs';

const org = (name: string) => ({ id: name, name });
const rule = (a: string, b: string) => compareOrgNames(org(a), org(b))?.rule ?? null;

describe('compareOrgNames', () => {
	it('matches the same name written differently', () => {
		expect(rule('Magnum-LPL', 'Magnum/LPL')).toBe('same_name');
		expect(rule('The Cadre', 'thecadre')).toBe('same_name');
	});

	it('matches a name with and without a company ending', () => {
		expect(rule('Murtech', 'Murtech, Inc')).toBe('ending');
		expect(rule('In My Defense', 'In My Defense, LLC')).toBe('ending');
		expect(rule('Ideal Aerosmith', 'Ideal Aerosmith Inc.')).toBe('ending');
	});

	it('matches a web address to the company it spells', () => {
		expect(rule('laindustrialservices.com', 'LA Industrial Services')).toBe('website');
		expect(rule('codyshootingcomplex.org', 'Cody Shooting Complex')).toBe('website');
		// A site that spells something else is not a match.
		expect(rule('sam.gov', 'Samos')).toBeNull();
	});

	it('matches a name to a longer one that starts with it', () => {
		expect(rule('Palantir', 'Palantir Technologies')).toBe('longer_name');
		expect(rule('True North Roofing', 'True North Roofing & Remodeling')).toBe('longer_name');
		// Whole words only: "Trase" does not start "Traseable Solutions".
		expect(rule('Trase', 'Traseable Solutions')).toBeNull();
	});

	it('ranks a short common first word below a distinct one', () => {
		const common = compareOrgNames(org('First'), org('First American'))!;
		const distinct = compareOrgNames(org('Palantir'), org('Palantir Technologies'))!;
		const twoWords = compareOrgNames(org('True North'), org('True North Roofing'))!;
		expect(common.score).toBeLessThan(distinct.score);
		expect(distinct.score).toBeLessThan(twoWords.score);
	});

	it('matches initials to the full name', () => {
		expect(rule('TRNN', 'The Real News Network')).toBe('initials');
		expect(rule('NFCU', 'Navy Federal Credit Union')).toBe('initials');
		// Two letters could be anything, and the initials must be the whole name.
		expect(rule('GC', 'Grace Church')).toBeNull();
		expect(rule('NRL', 'National Rifle League Hunter Series')).toBeNull();
	});

	it('matches a combined name to one it names', () => {
		expect(rule('Trase/Air/Genesis', 'Genesis')).toBe('named_inside');
		expect(rule('Fitzgerald & Murtech', 'Murtech')).toBe('named_inside');
	});

	it('leaves unrelated names alone', () => {
		expect(rule('Anduril', 'Palantir')).toBeNull();
		expect(rule('Navy', 'Air Force')).toBeNull();
		expect(rule('Blue Water', 'Water Blue')).toBeNull();
	});
});

describe('buildOrgIndex', () => {
	const names = [
		'Murtech',
		'Murtech, Inc',
		'Fitzgerald & Murtech',
		'LA Industrial',
		'LA Industrial Services',
		'laindustrialservices.com',
		'TRNN',
		'The Real News Network',
		'Real News Network',
		'First',
		'First American',
		'Anduril'
	];
	const index = buildOrgIndex(names.map(org));
	const similar = (name: string, limit = 5) =>
		index.similarTo(name, { limit }).map((match) => match.name);

	it('finds every way a name repeats, best first', () => {
		expect(similar('Murtech')).toEqual(['Murtech, Inc', 'Fitzgerald & Murtech']);
		expect(similar('LA Industrial Services')).toEqual([
			'laindustrialservices.com',
			'LA Industrial'
		]);
		expect(similar('The Real News Network')).toEqual(['Real News Network', 'TRNN']);
	});

	it('returns nothing for a name with no look-alike', () => {
		expect(similar('Anduril')).toEqual([]);
	});

	it('honors the limit and the pairs already answered "different"', () => {
		expect(similar('Murtech', 1)).toEqual(['Murtech, Inc']);
		expect(
			index
				.similarTo('Murtech', { exclude: new Set(['Murtech, Inc']) })
				.map((match) => match.name)
		).toEqual(['Fitzgerald & Murtech']);
	});

	it('agrees with a full pairwise comparison', () => {
		const orgs = names.map(org);
		for (const target of orgs) {
			const expected = orgs
				.filter((other) => compareOrgNames(target, other))
				.map((other) => other.name)
				.sort();
			expect(similar(target.name, 50).sort()).toEqual(expected);
		}
	});
});

describe('findSimilarOrgs', () => {
	it('works for an entry that is not in the list', () => {
		const found = findSimilarOrgs(org('Palantir'), [org('Palantir Technologies'), org('Uber')]);
		expect(found.map((match) => match.name)).toEqual(['Palantir Technologies']);
	});
});
