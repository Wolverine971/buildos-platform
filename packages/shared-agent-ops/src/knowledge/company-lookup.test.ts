// packages/shared-agent-ops/src/knowledge/company-lookup.test.ts
//
// What a user would see go wrong, and the input that causes it:
//   - a company filed in the wrong town because another company shares its name
//       → several same-name companies must become a question, never an answer
//   - a guess shown as fact → one source alone is "unconfirmed", two that agree are "placed"
//   - "Which Deloitte?" for a household name → its legal entities abroad are not rival answers
//   - a list of forty look-alikes → too common a name is not asked about at all
// Expected values below are written by hand from the fixtures, not computed from the code.

import { describe, expect, it } from 'vitest';
import {
	type CompanyCandidate,
	type CompanyFetch,
	clearbitCompanies,
	companyAddressFromHtml,
	companyFactsBatch,
	companyNameKey,
	decideCompany,
	directoryCandidates,
	gleifCompanies,
	mergeCompanyCandidates,
	usaspendingCompanies,
	websiteCandidate,
	wikidataCompanies
} from './company-lookup';
import { canonicalPlace } from './place-names';

const place = (city: string, region: string | null, country = 'US') =>
	canonicalPlace({ city, region, country })!;

const candidate = (
	over: Partial<CompanyCandidate> & Pick<CompanyCandidate, 'source'>
): CompanyCandidate => ({
	name: 'Summit Consulting',
	domain: null,
	place: null,
	url: null,
	...over
});

/** A fetch that answers from a table of URL fragments and records what was asked. */
function fakeFetch(routes: Array<[string, unknown]>): CompanyFetch & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		json: async (url, init) => {
			calls.push(init?.body ? `${url} ${JSON.stringify(init.body)}` : url);
			const hit = routes.find(([fragment]) => url.includes(fragment));
			return hit ? hit[1] : null;
		}
	};
}

describe('companyNameKey', () => {
	it('treats legal forms, case, punctuation and "The" as the same name', () => {
		const key = companyNameKey('Booz Allen Hamilton');
		expect(key).toBe('boozallenhamilton');
		for (const spelling of [
			'BOOZ ALLEN HAMILTON INC.',
			'Booz Allen Hamilton, Inc',
			'The Booz Allen Hamilton Company',
			'Booz-Allen Hamilton L.L.C.'
		]) {
			expect(companyNameKey(spelling)).toBe(key);
		}
	});

	it('reads "&" as "and" and drops accents', () => {
		expect(companyNameKey('Ernst & Young')).toBe(companyNameKey('Ernst and Young LLP'));
		expect(companyNameKey('Nestlé S.A.')).toBe('nestle');
	});

	it('keeps different names different', () => {
		expect(companyNameKey('Booz Allen')).not.toBe(companyNameKey('Booz Allen Hamilton'));
		expect(companyNameKey('Summit Consulting')).not.toBe(
			companyNameKey('Summit Consulting Group')
		);
	});

	it('never empties a name that is only a legal form', () => {
		expect(companyNameKey('Company')).toBe('company');
		expect(companyNameKey('The Co')).toBe('co');
		expect(companyNameKey('  ')).toBeNull();
	});
});

describe('decideCompany', () => {
	it('finds nothing when no source knows the name', () => {
		expect(decideCompany([])).toMatchObject({ outcome: 'none', chosen: null, total: 0 });
	});

	it('places a company when two independent sources agree on its website', () => {
		const verdict = decideCompany([
			candidate({
				source: 'directory',
				domain: 'boozallen.com',
				place: place('McLean', 'VA')
			}),
			candidate({ source: 'clearbit', domain: 'boozallen.com' })
		]);
		expect(verdict.outcome).toBe('placed');
		expect(verdict.chosen?.place?.name).toBe('McLean, VA');
		expect(verdict.chosen?.domain).toBe('boozallen.com');
	});

	it('places a company when two sources agree on its town', () => {
		const verdict = decideCompany([
			candidate({ source: 'gleif', place: place('McLean', 'VA') }),
			candidate({
				source: 'usaspending',
				place: place('MCLEAN', 'VA'),
				street: '8283 Greensboro Dr'
			})
		]);
		expect(verdict.outcome).toBe('placed');
		expect(verdict.chosen?.street).toBe('8283 Greensboro Dr');
		expect(verdict.chosen?.sources.map((s) => s.source)).toEqual(['gleif', 'usaspending']);
	});

	it('marks a single source as unconfirmed', () => {
		const verdict = decideCompany([
			candidate({
				source: 'directory',
				domain: 'summitllc.com',
				place: place('Washington', 'DC')
			})
		]);
		expect(verdict.outcome).toBe('unconfirmed');
		expect(verdict.chosen?.place?.name).toBe('Washington, DC');
	});

	it('does not count an address read from a website as confirming that website', () => {
		// Clearbit gave the domain; the address came from fetching that same domain.
		const verdict = decideCompany([
			candidate({ source: 'clearbit', domain: 'summitllc.com' }),
			candidate({
				source: 'website',
				domain: 'summitllc.com',
				place: place('Washington', 'DC')
			})
		]);
		expect(verdict.outcome).toBe('unconfirmed');
	});

	it('asks which one when a few different companies share the name', () => {
		const verdict = decideCompany([
			candidate({
				source: 'directory',
				domain: 'summitllc.com',
				place: place('Washington', 'DC'),
				size: '51-200'
			}),
			candidate({
				source: 'directory',
				domain: 'summitcg.com',
				place: place('Denver', 'CO'),
				size: '11-50'
			}),
			candidate({ source: 'clearbit', domain: 'summitcg.com' })
		]);
		expect(verdict.outcome).toBe('ask');
		expect(verdict.chosen).toBeNull();
		expect(verdict.total).toBe(2);
		expect(verdict.options.map((o) => o.place?.name)).toEqual(['Washington, DC', 'Denver, CO']);
		// Two sources agreeing on one of them does not settle which one the contact works at.
		expect(verdict.options[1]?.agreed).toBe(true);
	});

	it('does not ask about a name too many companies share', () => {
		const towns: Array<[string, string]> = [
			['Denver', 'CO'],
			['Austin', 'TX'],
			['Boston', 'MA'],
			['Miami', 'FL'],
			['Seattle', 'WA'],
			['Chicago', 'IL'],
			['Phoenix', 'AZ']
		];
		const verdict = decideCompany(
			towns.map(([city, state], i) =>
				candidate({
					source: 'directory',
					domain: `summit${i}.com`,
					place: place(city, state),
					size: '11-50'
				})
			)
		);
		expect(verdict).toMatchObject({ outcome: 'common', chosen: null, options: [], total: 7 });
	});

	it('places the household name over tiny namesakes when two sources agree on it', () => {
		const verdict = decideCompany([
			candidate({
				source: 'directory',
				name: 'deloitte',
				domain: 'deloitte.com',
				place: place('New York', 'NY'),
				size: '10001+'
			}),
			candidate({
				source: 'wikidata',
				name: 'Deloitte',
				domain: 'deloitte.com',
				place: canonicalPlace({ city: 'London', country: 'GB' })
			}),
			candidate({
				source: 'directory',
				name: 'deloitte',
				domain: 'deloitte-plumbing.example',
				place: place('Tulsa', 'OK'),
				size: '1-10'
			})
		]);
		expect(verdict.outcome).toBe('placed');
		expect(verdict.chosen?.domain).toBe('deloitte.com');
		expect(verdict.total).toBe(2);
	});

	it('keeps the household name unconfirmed when a single source is all there is', () => {
		const verdict = decideCompany([
			candidate({
				source: 'directory',
				name: 'deloitte',
				domain: 'deloitte.com',
				place: place('New York', 'NY'),
				size: '10001+'
			}),
			candidate({
				source: 'directory',
				name: 'deloitte',
				domain: 'deloitte-plumbing.example',
				place: place('Tulsa', 'OK'),
				size: '1-10'
			})
		]);
		expect(verdict.outcome).toBe('unconfirmed');
		expect(verdict.chosen?.domain).toBe('deloitte.com');
	});

	it('does not let two similar-sized namesakes pass as one household name', () => {
		const verdict = decideCompany([
			candidate({
				source: 'directory',
				domain: 'a.example',
				place: place('Boston', 'MA'),
				size: '1001-5000'
			}),
			candidate({ source: 'clearbit', domain: 'a.example' }),
			candidate({
				source: 'directory',
				domain: 'b.example',
				place: place('Austin', 'TX'),
				size: '501-1000'
			})
		]);
		expect(verdict.outcome).toBe('ask');
	});

	it('takes a register in the same state as confirming the one company known by the name', () => {
		// Wikidata gives the headquarters as Tysons; both registers give the address in McLean.
		const verdict = decideCompany([
			candidate({
				source: 'wikidata',
				domain: 'boozallen.com',
				place: place('Tysons', 'VA')
			}),
			candidate({ source: 'gleif', place: place('McLean', 'VA') }),
			candidate({
				source: 'usaspending',
				place: place('McLean', 'VA'),
				street: '8283 Greensboro Dr'
			})
		]);
		expect(verdict.outcome).toBe('placed');
		expect(verdict.total).toBe(1);
		expect(verdict.chosen?.place?.name).toBe('McLean, VA');
		expect(verdict.chosen?.street).toBe('8283 Greensboro Dr');
	});

	it('does not take a register in another state as confirming anything', () => {
		const verdict = decideCompany([
			candidate({
				source: 'wikidata',
				domain: 'boozallen.com',
				place: place('Tysons', 'VA')
			}),
			candidate({ source: 'gleif', place: place('Dover', 'DE') })
		]);
		expect(verdict.outcome).toBe('unconfirmed');
		expect(verdict.chosen?.place?.name).toBe('Tysons, VA');
	});

	it("does not turn a company's legal entities abroad into rival answers", () => {
		const verdict = decideCompany([
			candidate({
				source: 'directory',
				name: 'deloitte',
				domain: 'deloitte.com',
				place: place('New York', 'NY'),
				size: '10001+'
			}),
			candidate({ source: 'clearbit', name: 'Deloitte', domain: 'deloitte.com' }),
			candidate({
				source: 'gleif',
				name: 'Deloitte LLP',
				place: canonicalPlace({ city: 'London', country: 'GB' })
			}),
			candidate({
				source: 'gleif',
				name: 'Deloitte AG',
				place: canonicalPlace({ city: 'Zürich', country: 'CH' })
			})
		]);
		expect(verdict.outcome).toBe('placed');
		expect(verdict.total).toBe(1);
		expect(verdict.chosen?.place?.name).toBe('New York, NY');
	});

	it('asks between legal entities when no brand-level source knows the name', () => {
		const verdict = decideCompany([
			candidate({ source: 'gleif', place: canonicalPlace({ city: 'Gams', country: 'CH' }) }),
			candidate({
				source: 'gleif',
				place: canonicalPlace({ city: 'Horsholm', country: 'DK' })
			})
		]);
		expect(verdict.outcome).toBe('ask');
		expect(verdict.options).toHaveLength(2);
	});

	it('keeps a website with no town as a lead, not an answer', () => {
		const verdict = decideCompany([candidate({ source: 'clearbit', domain: 'summitllc.com' })]);
		expect(verdict.outcome).toBe('none');
		expect(verdict.chosen?.domain).toBe('summitllc.com');
	});

	it('reads a website-only source and a town-only source as one company, unconfirmed', () => {
		const verdict = decideCompany([
			candidate({ source: 'clearbit', domain: 'summitllc.com' }),
			candidate({ source: 'gleif', place: place('Washington', 'DC') })
		]);
		expect(verdict.outcome).toBe('unconfirmed');
		expect(verdict.chosen).toMatchObject({ domain: 'summitllc.com' });
		expect(verdict.chosen?.place?.name).toBe('Washington, DC');
	});
});

describe('mergeCompanyCandidates', () => {
	it('keeps two companies in one town apart when they name different websites', () => {
		const options = mergeCompanyCandidates([
			candidate({ source: 'directory', domain: 'a.example', place: place('Denver', 'CO') }),
			candidate({ source: 'directory', domain: 'b.example', place: place('Denver', 'CO') })
		]);
		expect(options).toHaveLength(2);
		expect(new Set(options.map((o) => o.key)).size).toBe(2);
	});

	it('joins a row with no website to the same-town row that has one', () => {
		const options = mergeCompanyCandidates([
			candidate({ source: 'directory', domain: 'a.example', place: place('Denver', 'CO') }),
			candidate({
				source: 'wikidata',
				place: place('Denver', 'CO'),
				description: 'consulting firm'
			})
		]);
		expect(options).toHaveLength(1);
		expect(options[0]).toMatchObject({
			domain: 'a.example',
			description: 'consulting firm',
			agreed: true
		});
	});
});

describe('sources', () => {
	it('directory rows become candidates with tidy names and canonical places', () => {
		const [row] = directoryCandidates([
			{
				name: 'summit consulting',
				website: 'summitllc.com',
				locality: 'washington',
				region: 'district of columbia',
				country: 'united states',
				industry: 'management consulting',
				size: '51-200',
				founded: 2003,
				linkedin_url: 'linkedin.com/company/summit-consulting-llc'
			}
		]);
		expect(row).toMatchObject({
			source: 'directory',
			name: 'Summit Consulting',
			domain: 'summitllc.com',
			industry: 'Management Consulting',
			size: '51-200',
			founded: 2003,
			linkedin: 'https://www.linkedin.com/company/summit-consulting-llc'
		});
		expect(row?.place?.name).toBe('Washington, DC');
	});

	it('Clearbit keeps exact-name matches only', async () => {
		const fetch = fakeFetch([
			[
				'autocomplete.clearbit.com',
				[
					{ name: 'Summit Consulting', domain: 'summitcl.com', logo: null },
					{ name: '1Summit Consulting', domain: '1summitconsulting.com', logo: null },
					{
						name: 'SUMMIT CONSULTING LIMITED',
						domain: 'summitconsultingltd.com',
						logo: null
					},
					{ name: 'Summit Consulting', domain: 'linkedin.com', logo: null }
				]
			]
		]);
		const found = await clearbitCompanies('Summit Consulting', 'summitconsulting', fetch);
		expect(found.map((c) => c.domain)).toEqual(['summitcl.com', 'summitconsultingltd.com']);
		expect(fetch.calls[0]).toContain('query=Summit%20Consulting');
	});

	it('GLEIF reads the headquarters and skips other names and dissolved entities', async () => {
		const record = (
			name: string,
			city: string,
			region: string,
			country: string,
			status = 'ACTIVE'
		) => ({
			attributes: {
				lei: `LEI-${city}`,
				entity: {
					legalName: { name },
					otherNames: [],
					status,
					headquartersAddress: {
						addressLines: ['8283 Greensboro Drive'],
						city,
						region,
						country
					}
				}
			}
		});
		const fetch = fakeFetch([
			[
				'api.gleif.org',
				{
					data: [
						record('BOOZ ALLEN HAMILTON INC.', 'McLean', 'US-VA', 'US'),
						record('BOOZ ALLEN HAMILTON HOLDING CORPORATION', 'McLean', 'US-VA', 'US'),
						record('Booz Allen Hamilton Inc', 'Dover', 'US-DE', 'US', 'INACTIVE')
					]
				}
			]
		]);
		const found = await gleifCompanies('Booz Allen Hamilton', 'boozallenhamilton', fetch);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			source: 'gleif',
			street: '8283 Greensboro Drive',
			url: 'https://search.gleif.org/#/record/LEI-McLean'
		});
		expect(found[0]?.place?.name).toBe('McLean, VA');
	});

	it('USAspending looks up the address of matching recipients, parents first', async () => {
		const fetch = fakeFetch([
			[
				'/recipient/child-1/',
				{
					name: 'BOOZ ALLEN HAMILTON INC',
					location: {
						address_line1: '8283 GREENSBORO DR',
						city_name: 'MCLEAN',
						state_code: 'VA',
						country_code: 'USA'
					}
				}
			],
			[
				'/recipient/parent-1/',
				{
					name: 'BOOZ ALLEN HAMILTON INC.',
					location: {
						address_line1: '8283 GREENSBORO DR',
						city_name: 'MCLEAN',
						state_code: 'VA',
						country_code: 'USA'
					}
				}
			],
			[
				'/api/v2/recipient/',
				{
					results: [
						{
							id: 'holding-1',
							name: 'BOOZ ALLEN HAMILTON HOLDING CORPORATION',
							recipient_level: 'P'
						},
						{ id: 'child-1', name: 'BOOZ ALLEN HAMILTON INC', recipient_level: 'C' },
						{ id: 'parent-1', name: 'BOOZ ALLEN HAMILTON INC.', recipient_level: 'P' }
					]
				}
			]
		]);
		const found = await usaspendingCompanies('Booz Allen Hamilton', 'boozallenhamilton', fetch);
		// Both rows are the same address: one candidate, read from the parent row.
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			source: 'usaspending',
			street: '8283 Greensboro Dr',
			url: 'https://www.usaspending.gov/recipient/parent-1/latest'
		});
		expect(found[0]?.place?.key).toBe('place:us:va:mclean');
		expect(fetch.calls.some((call) => call.includes('holding-1'))).toBe(false);
	});

	it('Wikidata finds the company, its town and state, and ignores same-name non-companies', async () => {
		const item = (id: string) => ({
			mainsnak: { datavalue: { value: { id } } },
			rank: 'normal'
		});
		const text = (value: string) => ({ mainsnak: { datavalue: { value } }, rank: 'normal' });
		const label = (value: string, claims: Record<string, unknown[]> = {}) => ({
			labels: { en: { value } },
			claims
		});
		const fetch = fakeFetch([
			[
				'wbsearchentities',
				{
					search: [
						{
							id: 'Q1',
							label: 'Booz Allen Hamilton',
							description: 'technology consulting firm',
							match: { text: 'Booz Allen Hamilton' }
						},
						{
							id: 'Q2',
							label: 'Booz Allen Hamilton',
							description: 'album',
							match: { text: 'Booz Allen Hamilton' }
						},
						{
							id: 'Q3',
							label: 'Booz Allen Foundation',
							description: 'organization',
							match: { text: 'Booz Allen Foundation' }
						}
					]
				}
			],
			[
				'ids=Q1%7CQ2',
				{
					entities: {
						Q1: label('Booz Allen Hamilton', {
							P159: [item('Q10')],
							P856: [text('http://www.boozallen.com')],
							P452: [item('Q20')],
							P571: [
								{
									mainsnak: {
										datavalue: { value: { time: '+1914-00-00T00:00:00Z' } }
									},
									rank: 'normal'
								}
							],
							P4264: [text('booz-allen-hamilton')]
						}),
						Q2: label('Booz Allen Hamilton')
					}
				}
			],
			[
				'ids=Q10%7CQ20',
				{
					entities: {
						Q10: label('Tysons', { P17: [item('Q30')], P131: [item('Q40')] }),
						Q20: label('consulting')
					}
				}
			],
			[
				'ids=Q30%7CQ40',
				{
					entities: {
						Q30: label('United States'),
						Q40: label('Fairfax County', { P131: [item('Q50')] })
					}
				}
			],
			['ids=Q50', { entities: { Q50: label('Virginia') } }]
		]);
		const found = await wikidataCompanies('Booz Allen Hamilton', 'boozallenhamilton', fetch);
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({
			source: 'wikidata',
			name: 'Booz Allen Hamilton',
			domain: 'boozallen.com',
			industry: 'consulting',
			founded: 1914,
			linkedin: 'https://www.linkedin.com/company/booz-allen-hamilton',
			description: 'technology consulting firm',
			url: 'https://www.wikidata.org/wiki/Q1'
		});
		expect(found[0]?.place?.name).toBe('Tysons, VA');
	});

	it('reads the address a website publishes in its structured data', () => {
		const html = `<html><head>
			<script type="application/ld+json">{ "broken": </script>
			<script type="application/ld+json">
			{"@context":"https://schema.org","@graph":[
				{"@type":"WebSite","name":"Summit"},
				{"@type":"Organization","name":"Summit Consulting","address":
					{"@type":"PostalAddress","streetAddress":"601 New Jersey Ave NW","addressLocality":"Washington","addressRegion":"DC","addressCountry":{"@type":"Country","name":"US"}}}
			]}
			</script></head><body>Offices in Denver and Austin.</body></html>`;
		expect(companyAddressFromHtml(html)).toEqual({
			city: 'Washington',
			region: 'DC',
			country: 'US',
			street: '601 New Jersey Ave NW'
		});
		expect(websiteCandidate('Summit Consulting', 'summitllc.com', html)?.place?.name).toBe(
			'Washington, DC'
		);
		// A town named only in the page's text is never read.
		expect(companyAddressFromHtml('<body>Based in Denver, CO</body>')).toBeNull();
	});
});

describe('companyFactsBatch', () => {
	const option = mergeCompanyCandidates([
		candidate({
			source: 'directory',
			domain: 'boozallen.com',
			place: place('McLean', 'VA'),
			industry: 'Management Consulting',
			founded: 1914,
			linkedin: 'https://www.linkedin.com/company/booz-allen-hamilton',
			url: 'https://www.peopledatalabs.com/company-dataset'
		}),
		candidate({
			source: 'usaspending',
			place: place('McLean', 'VA'),
			street: '8283 Greensboro Dr',
			url: 'https://www.usaspending.gov/recipient/x/latest'
		})
	])[0]!;

	it('saves a confirmed company as known details, each citing its sources', () => {
		const batch = companyFactsBatch({ entityId: 'org-1', option, confirmed: true });
		expect(batch.entities).toEqual([
			{
				ref: 'place',
				kind: 'place',
				name: 'McLean, VA',
				keys: [{ type: 'external', value: 'place:us:va:mclean' }]
			}
		]);
		expect(batch.facts.map((f) => f.predicate)).toEqual([
			'located_in',
			'homepage',
			'address',
			'industry',
			'founded',
			'profile_url'
		]);
		expect(batch.facts.every((f) => f.status === 'active' && f.subject === 'org-1')).toBe(true);
		expect(batch.facts.find((f) => f.predicate === 'address')?.value).toBe(
			'8283 Greensboro Dr, McLean, VA'
		);
		expect(batch.sources?.map((s) => s.url)).toEqual([
			'https://www.peopledatalabs.com/company-dataset',
			'https://www.usaspending.gov/recipient/x/latest'
		]);
		expect(batch.facts[0]?.sources).toEqual(['lookup0', 'lookup1']);
	});

	it('saves an unconfirmed company as suggestions: where it is and its website, nothing more', () => {
		const batch = companyFactsBatch({ entityId: 'org-1', option, confirmed: false });
		expect(batch.facts.map((f) => [f.predicate, f.status])).toEqual([
			['located_in', 'suggested'],
			['homepage', 'suggested']
		]);
	});

	it('reuses a place entry the user already has', () => {
		const batch = companyFactsBatch({
			entityId: 'org-1',
			option,
			confirmed: true,
			existingPlaces: new Map([['place:us:va:mclean', 'place-9']])
		});
		expect(batch.entities[0]).toMatchObject({ id: 'place-9', ref: 'place' });
	});
});
