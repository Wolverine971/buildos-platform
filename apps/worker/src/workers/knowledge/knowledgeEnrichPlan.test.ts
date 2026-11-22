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
			'"Sam Rivera" linkedin',
			'"Sam Rivera" Palantir contact email phone'
		]);
	});

	it('searches for schooling when Education was picked, not on every default run', () => {
		expect(enrichQueries(enrichContextFrom(SAM), null, ['educated_at'])).toEqual([
			'"Sam Rivera" Palantir',
			'"Sam Rivera" linkedin',
			'"Sam Rivera" Palantir university college alumni'
		]);
		// The default person research also extracts schooling, but adds no extra (paid) search.
		expect(enrichQueries(enrichContextFrom(SAM), null, DEFAULT_ENRICH_FIELDS.person)).toEqual([
			'"Sam Rivera" Palantir',
			'"Sam Rivera" linkedin'
		]);
	});
});

describe('enrichQueries with every choice ticked (the Find more dialog default)', () => {
	it('keeps the profile search and stops at three', () => {
		const everything = [
			'homepage',
			'headline',
			'works_at',
			'profile_url',
			'located_in',
			'educated_at',
			'description',
			'email',
			'phone'
		];
		expect(enrichQueries(enrichContextFrom(SAM), null, everything)).toEqual([
			'"Sam Rivera" Palantir',
			'"Sam Rivera" linkedin',
			'"Sam Rivera" Palantir contact email phone'
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

describe('planned research', () => {
	it('keeps short, distinct searches and never lets a contact detail through', async () => {
		const { validateResearchPlan } = await import('./knowledgeEnrichPlan');
		const plan = validateResearchPlan(
			{
				kind: 'person',
				queries: [
					'"Griffin Davis" "Breaking Points" producer',
					'  "Griffin Davis"   Breaking Points   linkedin ',
					'"Griffin Davis" "Breaking Points" producer', // repeated
					'"Griffin Davis" griffin@breakingpoints.com', // an email
					'"Griffin Davis" 410-555-0134 contact', // a phone number
					'x', // too short
					'a'.repeat(200), // a sentence, not a search
					42,
					'"Griffin Davis" Breaking Points staff',
					'"Griffin Davis" podcast credits'
				]
			},
			{ filedKind: 'org' }
		);
		expect(plan).toEqual({
			kind: 'person',
			queries: [
				'"Griffin Davis" "Breaking Points" producer',
				'"Griffin Davis" Breaking Points linkedin',
				'"Griffin Davis" Breaking Points staff'
			]
		});
	});

	it('falls back to the filed kind and skips searches already run', async () => {
		const { validateResearchPlan } = await import('./knowledgeEnrichPlan');
		expect(
			validateResearchPlan(
				{ kind: 'company', queries: ['"Acme" Baltimore', '"Acme" roofing Baltimore'] },
				{ filedKind: 'org', alreadyRun: ['"acme" baltimore'], limit: 2 }
			)
		).toEqual({ kind: 'org', queries: ['"Acme" roofing Baltimore'] });
		expect(validateResearchPlan('nonsense', { filedKind: 'person' })).toEqual({
			kind: 'person',
			queries: []
		});
	});

	it("gives the planner the user's words, the playbook for the kind, and round one on a second round", async () => {
		const { researchPlanUserPrompt } = await import('./knowledgeEnrichPlan');
		const prompt = researchPlanUserPrompt({
			name: 'Griffin Davis',
			filedKind: 'person',
			brief: 'Works at: Breaking Points',
			instructions: "He's the producer of Breaking Points.",
			lookingFor: ['Role', 'Profile'],
			previous: {
				queries: ['"Griffin Davis" Breaking Points'],
				pages: [{ url: 'https://example.com/team', title: 'Team', verdict: 'same' }],
				found: ['Role: Producer'],
				stillMissing: ['Profile']
			}
		});
		// The five parts, in the order the model is told to expect them.
		const order = [
			'## The entry to research',
			'## How to research a person',
			"## What the user's records already hold on it",
			'## What to find',
			'## What the user said to guide this research',
			'## Already tried (round 1)',
			'## Now'
		].map((heading) => prompt.indexOf(heading));
		expect(order.every((at) => at >= 0)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
		expect(prompt).toContain('"He\'s the producer of Breaking Points."');
		expect(prompt).toContain('Asked for specifically:\n- Role\n- Profile');
		expect(prompt).toContain('Works at: Breaking Points');
		expect(prompt).toContain('- Searches: ["Griffin Davis" Breaking Points]');
		expect(prompt).toContain('- Still missing: Profile');
	});

	it('tells a cold model where it is working, and saves more than was ticked but never contact details', async () => {
		const plan = await import('./knowledgeEnrichPlan');
		for (const system of [
			plan.KNOWLEDGE_PLAN_SYSTEM_PROMPT,
			plan.KNOWLEDGE_ENRICH_SYSTEM_PROMPT
		]) {
			expect(system).toContain('private knowledge graph');
			expect(system).toContain('research ONE entry on the public web');
		}
		// The user ticked only "Website": the rest of what a person's entry holds is still saved.
		const also = plan.alsoWorthSaving('person', ['homepage']);
		expect(also).toEqual(expect.arrayContaining(['headline', 'works_at', 'profile_url']));
		expect(also).not.toContain('homepage');
		for (const never of ['email', 'phone', 'address', 'birthday'])
			expect(also).not.toContain(never);
		expect(plan.alsoWorthSaving('org', [])).not.toContain('email');

		const prompt = plan.enrichUserPrompt(
			{
				name: 'Griffin Davis',
				kind: 'person',
				known: [],
				existing: [],
				homepage: null,
				youtubeUrl: null
			},
			['homepage'],
			[{ url: 'https://example.com', title: 'T', content: 'text' }],
			null,
			null,
			null,
			also
		);
		expect(prompt).toContain(
			'Asked for specifically (report every one a page states):\n- homepage'
		);
		expect(prompt).toContain('Also report when a page states it');
		expect(prompt).toContain('- works_at');
		expect(prompt).toContain('The user gave no note');
	});

	it("counts a profile page's own address as stated, and keeps search advice out of the page reader", async () => {
		const plan = await import('./knowledgeEnrichPlan');
		const page = {
			url: 'https://www.linkedin.com/in/griffin-davis',
			title: 'Griffin Davis',
			content: 'Griffin Davis. Producer at Breaking Points. Washington, DC.'
		};
		const result = plan.validateEnrichment(
			{
				pages: [{ page: 1, about_entity: true }],
				facts: [
					{
						predicate: 'profile_url',
						value: 'https://www.linkedin.com/in/griffin-davis',
						page: 1,
						quote: 'Producer at Breaking Points',
						confidence: 0.9
					}
				]
			},
			{ entityId: 'e1', kind: 'person', fields: ['profile_url'], pages: [page], existing: [] }
		);
		expect(result.batch.facts).toHaveLength(1);
		expect(result.batch.facts[0]).toMatchObject({ predicate: 'profile_url', status: 'active' });

		expect(plan.researchPlaybook('person', { searching: true })).toContain('Where it is found');
		expect(plan.researchPlaybook('person')).not.toContain('Where it is found');
		expect(plan.KNOWLEDGE_PLAN_SYSTEM_PROMPT).toContain('plan the searches for the real type');
	});

	it('treats the same search in another order, case or quoting as already run', async () => {
		const { validateResearchPlan } = await import('./knowledgeEnrichPlan');
		const plan = validateResearchPlan(
			{
				kind: 'person',
				queries: [
					'"Griffin Davis" "Breaking Points" LinkedIn',
					'"Griffin Davis" executive producer interview'
				]
			},
			{ filedKind: 'person', alreadyRun: ['"Griffin Davis" linkedin "Breaking Points"'] }
		);
		expect(plan.queries).toEqual(['"Griffin Davis" executive producer interview']);
	});

	it('never reads a people-finder site', async () => {
		const { choosePages } = await import('./knowledgeEnrichPlan');
		const picked = choosePages(
			[
				{ url: 'https://www.truepeoplesearch.com/find/person/abc' },
				{ url: 'https://example.com/team' }
			],
			null
		);
		expect(picked.map((p) => p.url)).toEqual(['https://example.com/team']);
	});

	it('saves an account link in standard form, and refuses posts and the wrong kind of account', async () => {
		const plan = await import('./knowledgeEnrichPlan');
		const page = {
			url: 'https://thecadretraining.com/press',
			title: 'Press',
			content:
				'Follow us. Instagram @thecadre.training. See our latest post. The Cadre on LinkedIn.'
		};
		const fact = (value: string) => ({
			predicate: 'profile_url',
			value,
			page: 1,
			quote: 'Instagram @thecadre.training',
			confidence: 0.9
		});
		const result = plan.validateEnrichment(
			{
				pages: [{ page: 1, about_entity: true }],
				facts: [
					fact('https://www.instagram.com/@thecadre.training'),
					fact('https://www.instagram.com/p/C8abc123/'),
					fact('https://www.linkedin.com/in/phil-someone')
				]
			},
			{ entityId: 'e1', kind: 'org', fields: ['profile_url'], pages: [page], existing: [] }
		);
		expect(result.batch.facts).toHaveLength(1);
		expect(result.batch.facts[0]).toMatchObject({
			value: 'https://www.instagram.com/thecadre.training',
			status: 'active',
			qualifiers: { platform: 'Instagram' }
		});
		expect(result.dropped.map((d) => d.reason)).toEqual([
			'not an account address',
			'wrong kind of account'
		]);
	});

	it("attaches the people a company's page names, each to their own entry", async () => {
		const plan = await import('./knowledgeEnrichPlan');
		const page = {
			url: 'https://thecadretraining.com/instructors',
			title: 'Instructors',
			content:
				'Phil Velayo, Lead Instructor, served as a Scout Sniper. Our team also thanks Steve.'
		};
		const result = plan.validateEnrichment(
			{
				pages: [{ page: 1, about_entity: true }],
				facts: [],
				people: [
					{
						name: 'Phil Velayo',
						title: 'Lead Instructor',
						page: 1,
						quote: 'Phil Velayo, Lead Instructor'
					},
					{
						name: 'Steve',
						title: 'Friend',
						page: 1,
						quote: 'Our team also thanks Steve.'
					},
					{
						name: 'Jane Madeup',
						title: 'CEO',
						page: 1,
						quote: 'Phil Velayo, Lead Instructor'
					}
				]
			},
			{ entityId: 'org1', kind: 'org', fields: ['description'], pages: [page], existing: [] }
		);
		expect(result.batch.entities).toEqual([
			{ ref: 'person1', kind: 'person', name: 'Phil Velayo' }
		]);
		expect(result.batch.facts[0]).toMatchObject({
			subject: 'person1',
			predicate: 'works_at',
			object: 'org1',
			status: 'active',
			qualifiers: { title: 'Lead Instructor', current: true }
		});
		// A person entry never gets "people".
		const asPerson = plan.validateEnrichment(
			{
				pages: [],
				facts: [],
				people: [{ name: 'Phil Velayo', page: 1, quote: 'Phil Velayo, Lead Instructor' }]
			},
			{ entityId: 'p1', kind: 'person', fields: ['headline'], pages: [page], existing: [] }
		);
		expect(asPerson.batch.facts).toHaveLength(0);
	});

	it('keeps one headline per round, and in a later round keeps the one already saved', async () => {
		const plan = await import('./knowledgeEnrichPlan');
		const page = {
			url: 'https://example.com/a',
			title: 'A',
			content: 'Executive Producer - Breaking Points. Also: ep at breaking points, sketches.'
		};
		const answer = {
			pages: [{ page: 1, about_entity: true }],
			facts: [
				{
					predicate: 'headline',
					value: 'Executive Producer - Breaking Points',
					page: 1,
					quote: 'Executive Producer - Breaking Points',
					confidence: 0.9
				},
				{
					predicate: 'headline',
					value: 'ep at breaking points',
					page: 1,
					quote: 'ep at breaking points',
					confidence: 0.9
				}
			]
		};
		const base = {
			entityId: 'e1',
			kind: 'person' as const,
			fields: ['headline'],
			pages: [page]
		};
		const first = plan.validateEnrichment(answer, { ...base, existing: [] });
		expect(first.batch.facts.map((f) => f.value)).toEqual([
			'Executive Producer - Breaking Points'
		]);
		const later = plan.validateEnrichment(answer, {
			...base,
			existing: [{ predicate: 'headline', value: 'Producer' }],
			keepExistingSingles: true
		});
		expect(later.batch.facts).toHaveLength(0);
	});
});
