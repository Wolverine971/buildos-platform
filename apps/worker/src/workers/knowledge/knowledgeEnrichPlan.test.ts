// apps/worker/src/workers/knowledge/knowledgeEnrichPlan.test.ts
import { describe, expect, it } from 'vitest';
import type { KnowledgeEntityDetail } from '@buildos/shared-agent-ops/knowledge';
import {
	choosePages,
	enrichContextFrom,
	enrichQueries,
	enrichUserPrompt,
	knowledgePanelPage,
	validateEnrichment,
	type EnrichPage
} from './knowledgeEnrichPlan';
import { DEFAULT_ENRICH_FIELDS, oembedBatch } from '@buildos/shared-agent-ops/knowledge';

const ENTITY_ID = '11111111-1111-4111-8111-111111111111';

function fact(
	predicate: string,
	label: string,
	value: string | null,
	entity?: { name: string; kind: 'org' | 'person' }
) {
	return {
		id: `${predicate}-${value ?? entity?.name}`,
		predicate,
		label,
		value,
		entity: entity
			? {
					id: 'e',
					kind: entity.kind,
					name: entity.name,
					summary: null,
					scope: 'private' as const,
					is_self: false,
					image_url: null
				}
			: null,
		qualifiers: {},
		scope: 'private' as const,
		status: 'active' as const,
		confidence: 0.8,
		valid_from: null,
		valid_to: null,
		observed_at: '2026-11-16T00:00:00Z',
		created_via: 'import' as const,
		run_id: null,
		sources: []
	};
}

const SAM: KnowledgeEntityDetail = {
	entity: {
		id: ENTITY_ID,
		kind: 'person',
		name: 'Sam Rivera',
		summary: 'Engineer at Palantir',
		scope: 'private',
		is_self: false,
		image_url: null,
		status: 'active',
		created_via: 'import',
		enriched_at: null,
		created_at: '',
		updated_at: ''
	},
	facts: [
		fact('works_at', 'Works at', null, { name: 'Palantir', kind: 'org' }),
		fact('email', 'Email', 'sam@palantir.example'),
		fact('phone', 'Phone', '+14105550101'),
		fact('profile_url', 'Profile', 'https://linkedin.com/in/sam-rivera')
	],
	incoming: [],
	incoming_truncated: false,
	links: [],
	enrichment: [],
	known_by_me: true
};

const PAGES: EnrichPage[] = [
	{
		url: 'https://palantir.example/team/sam',
		title: 'Sam Rivera – Palantir',
		content:
			'Sam Rivera is a Forward Deployed Engineer at Palantir, based in Denver, Colorado. Reach the press team at press@palantir.example.'
	},
	{
		url: 'https://other.example/sam-rivera-chef',
		title: 'Chef Sam Rivera',
		content: 'Sam Rivera runs a taco truck in Austin.'
	}
];

describe('enrichContextFrom', () => {
	it('never carries private contact details into searches or prompts', () => {
		const context = enrichContextFrom(SAM);
		const text = JSON.stringify(context);
		expect(text).not.toContain('sam@palantir.example');
		expect(text).not.toContain('+14105550101');
		expect(context.known).toContain('Works at: Palantir');
	});
});

describe('enrichQueries', () => {
	it('builds searches from structured facts', () => {
		expect(enrichQueries(enrichContextFrom(SAM))).toEqual([
			'"Sam Rivera" Palantir',
			'"Sam Rivera" linkedin'
		]);
		const org = enrichContextFrom({
			...SAM,
			entity: { ...SAM.entity, kind: 'org', name: 'Acme' },
			facts: [fact('homepage', 'Website', 'https://acme.example/about')]
		});
		expect(enrichQueries(org, 'revenue')).toEqual(['"Acme" acme.example company revenue']);
	});

	it('looks for a contact page only when phone or email was asked for', () => {
		expect(enrichQueries(enrichContextFrom(SAM), null, ['phone'])).toEqual([
			'"Sam Rivera" Palantir',
			'"Sam Rivera" Palantir contact email phone'
		]);
	});

	it('searches for schooling when Education was picked, not on every default run', () => {
		expect(enrichQueries(enrichContextFrom(SAM), null, ['educated_at'])).toEqual([
			'"Sam Rivera" Palantir',
			'"Sam Rivera" Palantir university college alumni'
		]);
		// The default person research also extracts schooling, but adds no extra (paid) search.
		expect(enrichQueries(enrichContextFrom(SAM), null, DEFAULT_ENRICH_FIELDS.person)).toEqual([
			'"Sam Rivera" Palantir',
			'"Sam Rivera" linkedin'
		]);
	});
});

describe('validateEnrichment', () => {
	const fields = ['headline', 'works_at', 'located_in', 'email', 'address', 'homepage'];

	it('keeps quoted, requested facts and drops everything unsupported', () => {
		const raw = {
			pages: [
				{ page: 1, about_entity: true },
				{ page: 2, about_entity: false }
			],
			facts: [
				{
					predicate: 'headline',
					value: 'Forward Deployed Engineer at Palantir',
					page: 1,
					quote: 'Forward  Deployed Engineer at Palantir',
					confidence: 0.9
				},
				{
					predicate: 'located_in',
					object: { kind: 'place', name: 'Denver, Colorado' },
					page: 1,
					quote: 'based in Denver, Colorado',
					confidence: 0.85
				},
				{
					predicate: 'works_at',
					object: { kind: 'org', name: 'Palantir' },
					page: 1,
					quote: 'Engineer at Palantir'
				},
				{
					predicate: 'homepage',
					value: 'https://made-up.example',
					page: 1,
					quote: 'his site is made-up.example'
				},
				{
					predicate: 'located_in',
					object: { kind: 'place', name: 'Austin' },
					page: 2,
					quote: 'taco truck in Austin'
				},
				{
					predicate: 'address',
					value: '12 Elm St',
					page: 1,
					quote: 'Sam Rivera is a Forward'
				},
				{
					predicate: 'industry',
					value: 'Software',
					page: 1,
					quote: 'Sam Rivera is a Forward'
				},
				{ predicate: 'headline', value: 'x', page: 7, quote: 'nowhere' }
			]
		};
		const result = validateEnrichment(raw, {
			entityId: ENTITY_ID,
			kind: 'person',
			fields,
			pages: PAGES,
			existing: enrichContextFrom(SAM).existing
		});
		expect(result.kept).toBe(2);
		expect(result.dropped.map((d) => `${d.predicate}: ${d.reason}`)).toEqual([
			'works_at: already known',
			'homepage: quote not on the page',
			'located_in: page is about someone else',
			'address: never researched for people',
			'industry: not requested',
			'headline: cites no page'
		]);
		expect(result.batch.sources).toEqual([
			{
				ref: 'page1',
				type: 'web',
				url: 'https://palantir.example/team/sam',
				title: 'Sam Rivera – Palantir'
			}
		]);
		expect(result.batch.entities).toEqual([
			{ ref: 'obj0', kind: 'place', name: 'Denver, Colorado' }
		]);
		expect(result.batch.facts[0]).toMatchObject({
			subject: ENTITY_ID,
			predicate: 'headline',
			status: 'active',
			sources: ['page1']
		});
	});

	it('matches a straight-quoted model quote against curly quotes and dashes on the page', () => {
		const page = {
			...PAGES[0]!,
			content: 'Sam Rivera — he’s the Forward Deployed lead at Palantir.'
		};
		const result = validateEnrichment(
			{
				pages: [{ page: 1, about_entity: true }],
				facts: [
					{
						predicate: 'headline',
						value: 'Forward Deployed lead at Palantir',
						page: 1,
						quote: "Sam Rivera - he's the Forward Deployed lead at Palantir"
					}
				]
			},
			{ entityId: ENTITY_ID, kind: 'person', fields, pages: [page], existing: [] }
		);
		expect(result.dropped).toEqual([]);
		expect(result.kept).toBe(1);
		expect(result.batch.facts[0]).toMatchObject({ predicate: 'headline', status: 'active' });
	});

	it("keeps a person's phone only when the run asked for it", () => {
		const page: EnrichPage = {
			url: 'https://example.org/team/sam',
			title: 'Team',
			content: 'Sam Rivera, Field Lead. Direct line: 410-555-0101.'
		};
		const raw = {
			pages: [{ page: 1, about_entity: true }],
			facts: [
				{
					predicate: 'phone',
					value: '410-555-0101',
					page: 1,
					quote: 'Direct line: 410-555-0101'
				}
			]
		};
		const base = { entityId: ENTITY_ID, kind: 'person' as const, pages: [page], existing: [] };
		const asked = validateEnrichment(raw, { ...base, fields: ['phone'] });
		expect(asked.kept).toBe(1);
		expect(asked.batch.facts[0]).toMatchObject({ predicate: 'phone', value: '410-555-0101' });
		const notAsked = validateEnrichment(raw, { ...base, fields: ['headline'] });
		expect(notAsked.kept).toBe(0);
		expect(notAsked.dropped).toEqual([{ predicate: 'phone', reason: 'not requested' }]);
	});

	it('keeps a value the page never states only as a suggestion, and refuses tiny quotes', () => {
		const result = validateEnrichment(
			{
				facts: [
					{
						predicate: 'headline',
						value: 'Chief Executive Officer of Palantir',
						page: 1,
						quote: 'Forward Deployed Engineer',
						confidence: 0.95
					},
					{
						predicate: 'homepage',
						value: 'https://x.example',
						page: 1,
						quote: 'Palantir'
					}
				]
			},
			{ entityId: ENTITY_ID, kind: 'person', fields, pages: PAGES, existing: [] }
		);
		expect(result.batch.facts).toHaveLength(1);
		expect(result.batch.facts[0]!.status).toBe('suggested');
		expect(result.dropped).toEqual([
			{ predicate: 'homepage', reason: 'quote not on the page' }
		]);
	});

	it('marks low-confidence findings as suggestions and survives junk answers', () => {
		const low = validateEnrichment(
			{
				facts: [
					{
						predicate: 'headline',
						value: 'Engineer',
						page: 1,
						quote: 'Forward Deployed Engineer',
						confidence: 0.4
					}
				]
			},
			{ entityId: ENTITY_ID, kind: 'person', fields, pages: PAGES, existing: [] }
		);
		expect(low.batch.facts[0]!.status).toBe('suggested');
		expect(
			validateEnrichment('not json', {
				entityId: ENTITY_ID,
				kind: 'person',
				fields,
				pages: PAGES,
				existing: []
			}).kept
		).toBe(0);
	});
});

describe('prompting and page choice', () => {
	it('lists only the requested predicates and numbers the pages', () => {
		const prompt = enrichUserPrompt(enrichContextFrom(SAM), ['headline', 'located_in'], PAGES);
		expect(prompt).toContain('- headline (text)');
		expect(prompt).toContain('- located_in → object kinds: place');
		expect(prompt).not.toContain('- email');
		expect(prompt).toContain('<page number="2" url="https://other.example/sam-rivera-chef"');
	});

	it("reads the entity's own site first and skips duplicate results", () => {
		const picked = choosePages(
			[
				{ url: 'https://news.example/a' },
				{ url: 'https://www.acme.example/about' },
				{ url: 'https://news.example/a/' },
				{ url: 'https://b.example' },
				{ url: 'https://c.example' }
			],
			'https://acme.example'
		);
		expect(picked.map((p) => p.url)).toEqual([
			'https://www.acme.example/about',
			'https://news.example/a',
			'https://b.example'
		]);
	});

	it('turns YouTube oEmbed into a channel and thumbnail for a video', () => {
		const batch = oembedBatch(ENTITY_ID, 'video', 'https://youtu.be/FeAysJe6FGA', {
			title: 'Omnigraph demo',
			author_name: 'Roman Pronskiy',
			author_url: 'https://www.youtube.com/@pronskiy',
			thumbnail_url: 'https://i.ytimg.com/vi/FeAysJe6FGA/hqdefault.jpg'
		});
		expect(batch.entities).toEqual([
			{
				ref: 'channel',
				kind: 'channel',
				name: 'Roman Pronskiy',
				keys: [{ type: 'youtube_channel', value: 'https://www.youtube.com/@pronskiy' }]
			}
		]);
		expect(batch.facts.map((f) => f.predicate)).toEqual([
			'thumbnail_url',
			'published_by',
			'url'
		]);
	});
});

describe('knowledgePanelPage', () => {
	const panel = {
		title: 'Tim Ferriss',
		type: 'American author',
		website: 'https://tim.blog/',
		description: 'Timothy Ferriss is an American entrepreneur and podcaster.',
		descriptionSource: 'Wikipedia',
		attributes: { Born: 'July 20, 1977', Spouse: 'Someone' }
	};

	it("is the provider's own text, quotable verbatim, with attributes only for non-people", () => {
		const org = knowledgePanelPage({ ...panel, title: 'Acme' }, 'org')!;
		expect(org.content.split('\n')).toEqual([
			'Acme',
			'American author',
			'Timothy Ferriss is an American entrepreneur and podcaster. (Wikipedia)',
			'Website: https://tim.blog/',
			'Born: July 20, 1977',
			'Spouse: Someone'
		]);
		const person = knowledgePanelPage(panel, 'person')!;
		expect(person.content).not.toContain('Born');
		expect(person.content).not.toContain('Spouse');
		expect(person).toMatchObject({
			url: 'https://www.google.com/search?q=Tim%20Ferriss',
			title: 'Google knowledge panel: Tim Ferriss'
		});
	});

	it('is nothing without a panel or with only a title', () => {
		expect(knowledgePanelPage(null, 'org')).toBeNull();
		expect(knowledgePanelPage({ title: 'Acme' }, 'org')).toBeNull();
	});

	it('goes through the same quote rule as any page', () => {
		const page = knowledgePanelPage(panel, 'person')!;
		const result = validateEnrichment(
			{
				facts: [
					{
						predicate: 'headline',
						value: 'American entrepreneur and podcaster',
						page: 1,
						quote: 'an American entrepreneur and podcaster',
						confidence: 0.9
					},
					{
						predicate: 'headline',
						value: 'Bestselling author',
						page: 1,
						quote: 'is a bestselling author of five books',
						confidence: 0.9
					},
					{
						predicate: 'birthday',
						value: '1977-07-20',
						page: 1,
						quote: 'Timothy Ferriss is an American',
						confidence: 0.9
					}
				]
			},
			{
				entityId: ENTITY_ID,
				kind: 'person',
				fields: ['headline', 'birthday'],
				pages: [page],
				existing: []
			}
		);
		expect(result.kept).toBe(1);
		expect(result.dropped.map((d) => d.reason).sort()).toEqual([
			'never researched for people',
			'quote not on the page'
		]);
	});
});
