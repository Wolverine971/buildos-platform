// packages/shared-agent-ops/src/knowledge/import-near-matches.test.ts
import { describe, expect, it } from 'vitest';
import {
	findNearMatches,
	type NearMatchContact,
	type NearMatchPerson
} from './import-near-matches';

const person = (id: string, name: string, employerIds: string[] = []): NearMatchPerson => ({
	id,
	name,
	employerIds
});
const contact = (name: string, extra: Partial<NearMatchContact> = {}): NearMatchContact => {
	const parts = name.split(' ');
	return {
		key: `new-${name}`,
		name,
		...(parts.length > 1 ? { givenName: parts[0]!, familyName: parts[parts.length - 1]! } : {}),
		...extra
	};
};
/** "contact → existing (rule)" lines, the whole result. */
const pairs = (contacts: NearMatchContact[], people: NearMatchPerson[]) =>
	findNearMatches(contacts, people).map(
		(m) => `${m.contactName} → ${m.existingName} (${m.rule})`
	);

describe('findNearMatches', () => {
	it('asks about a nickname with the same last name', () => {
		expect(
			pairs(
				[contact('Mike Smith'), contact('Jon Alvarez'), contact('Bob Tran')],
				[
					person('1', 'Michael Smith'),
					person('2', 'Jonathan Alvarez'),
					person('3', 'Robert Tran')
				]
			)
		).toEqual([
			'Mike Smith → Michael Smith (nickname)',
			'Jon Alvarez → Jonathan Alvarez (nickname)',
			'Bob Tran → Robert Tran (nickname)'
		]);
	});

	it('asks about the same name written with accents, letters after it or a maiden name', () => {
		expect(
			pairs(
				[contact('Jose Garcia'), contact('Jane Doe'), contact('Priya Patel')],
				[
					person('1', 'José García'),
					person('2', 'Jane Doe, MBA'),
					person('3', 'Priya (Shah) Patel')
				]
			)
		).toEqual([
			'Jose Garcia → José García (spelling)',
			'Jane Doe → Jane Doe, MBA (spelling)',
			'Priya Patel → Priya (Shah) Patel (spelling)'
		]);
	});

	it('finds a nickname inside a decorated LinkedIn name', () => {
		expect(pairs([contact('Mike Smith')], [person('1', 'Michael Smith, PMP')])).toEqual([
			'Mike Smith → Michael Smith, PMP (nickname)'
		]);
	});

	it('leaves different people with the same last name alone', () => {
		expect(
			pairs(
				[contact('Mike Smith'), contact('Dana Wayne')],
				[person('1', 'Sarah Smith'), person('2', 'Mark Smith'), person('3', 'David Wayne')]
			)
		).toEqual([]);
	});

	it('uses a shared company only together with the last name and first initial', () => {
		const people = [
			person('1', 'Margaret Olsen', ['acme']),
			person('2', 'Martin Olsen', ['other'])
		];
		expect(pairs([contact('Mags Olsen', { employerId: 'acme' })], people)).toEqual([
			'Mags Olsen → Margaret Olsen (company)'
		]);
		expect(pairs([contact('Mags Olsen')], people)).toEqual([]);
	});

	it('never pairs the exact same name: the importer handles that itself', () => {
		expect(pairs([contact('Maya Chen')], [person('1', 'maya  chen')])).toEqual([]);
	});

	it('asks about a first-name-only contact when exactly one person here has that first name', () => {
		expect(
			pairs([contact('Louis')], [person('1', 'Louis Tran'), person('2', 'Ana Ruiz')])
		).toEqual(['Louis → Louis Tran (first_name)']);
		// Two people it could be, or the same single name twice in the file: no question.
		expect(
			pairs([contact('Louis')], [person('1', 'Louis Tran'), person('2', 'Louis Park')])
		).toEqual([]);
		expect(
			pairs(
				[contact('Louis', { key: 'a' }), contact('Louis', { key: 'b' })],
				[person('1', 'Louis Tran')]
			)
		).toEqual([]);
	});

	it('asks when a full name arrives for a one-word person already here', () => {
		expect(pairs([contact('Louis Tran')], [person('1', 'Louis')])).toEqual([
			'Louis Tran → Louis (first_name)'
		]);
	});

	it('keeps at most two questions per contact, strongest first', () => {
		const found = findNearMatches(
			[contact('Mike Smith')],
			[
				person('1', 'Michael Smith'),
				person('2', 'Mike J Smith'),
				person('3', 'Mikhail Smith')
			]
		);
		expect(found.map((m) => m.existingName)).toEqual(['Mike J Smith', 'Michael Smith']);
	});
});
