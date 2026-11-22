// apps/web/src/lib/components/knowledge/connections-client.test.ts
//
// The person card's chips and the one-line job (tasker 166).
//   failure                                           trigger
//   a chip for a company the person doesn't work at   a colleague's second job in the groups
//   "Instructor at UXM at UXM"                        a title that already names the employer
import { describe, expect, it } from 'vitest';
import {
	connectionChips,
	connectionLine,
	filterWords,
	type ConnectionsAnswer,
	type KnowledgeConnectionPerson
} from './connections-client';

const person = (
	jobs: KnowledgeConnectionPerson['jobs'],
	summary?: string
): KnowledgeConnectionPerson => ({
	id: 'p1',
	name: 'Sam Lee',
	known: true,
	jobs,
	places: [],
	industries: [],
	tasks: 0,
	documents: 0,
	projects: 0,
	...(summary ? { summary } : {})
});

describe('connectionLine', () => {
	it('reads title at employer, and marks a past job', () => {
		expect(
			connectionLine(person([{ org_id: 'o', org: 'Acme', title: 'Engineer', current: true }]))
		).toBe('Engineer at Acme');
		expect(
			connectionLine(
				person([{ org_id: 'o', org: 'Acme', title: 'Engineer', current: false }])
			)
		).toBe('Formerly Engineer at Acme');
		expect(connectionLine(person([{ org_id: 'o', org: 'Acme', current: true }]))).toBe('Acme');
	});

	it('does not repeat an employer the title already names', () => {
		expect(
			connectionLine(
				person([
					{ org_id: 'o', org: 'UXM', title: 'Training Instructor at UXM', current: true }
				])
			)
		).toBe('Training Instructor at UXM');
	});

	it("falls back to the entry's own line when no job is known", () => {
		expect(connectionLine(person([], 'Roofer'))).toBe('Roofer');
		expect(connectionLine(person([]))).toBe('');
	});
});

describe('filterWords', () => {
	it('splits on commas, trims, and drops blanks and repeats', () => {
		expect(filterWords(' Booz   Allen, ,AWS,AWS ')).toEqual(['Booz Allen', 'AWS']);
		expect(filterWords('')).toEqual([]);
	});
});

describe('connectionChips', () => {
	const answer = {
		people: [],
		total: 5,
		coverage: {} as ConnectionsAnswer['coverage'],
		gaps: { companies_without_place: [], companies_without_industry: [] },
		notes: [],
		facets: {
			company: {
				total: 2,
				groups: [
					{ key: 'acme', id: 'o1', name: 'Acme', people: 4, sample: ['Ann', 'Ben'] },
					// A colleague's second job: not this person's company.
					{ key: 'globex', id: 'o2', name: 'Globex', people: 1, sample: ['Ben'] }
				]
			},
			place: {
				total: 2,
				groups: [
					{
						key: 'annapolis, maryland',
						name: 'Annapolis, Maryland',
						people: 9,
						sample: ['Dee']
					},
					{ key: 'austin, texas', name: 'Austin, Texas', people: 1, sample: ['Cy'] }
				]
			}
		},
		anchor: {
			companies: [{ id: 'o1', name: 'Acme', key: 'acme' }],
			places: [{ key: 'annapolis, maryland', name: 'Annapolis, Maryland' }]
		}
	} satisfies ConnectionsAnswer;

	it("keeps only the person's own employers and places", () => {
		expect(
			connectionChips(answer).map((chip) => `${chip.facet}:${chip.name}:${chip.people}`)
		).toEqual(['company:Acme:4', 'place:Annapolis, Maryland:9']);
	});

	it('has no chips without an anchor', () => {
		expect(connectionChips({ ...answer, anchor: undefined })).toEqual([]);
	});
});
