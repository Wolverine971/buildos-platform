// apps/worker/src/workers/knowledge/knowledgeResearch.test.ts
// Know first, then search (tasker 164, part A): queries come from anchors, rejected pages are
// never read, pages about a same-name entity are dropped before extraction, and research with
// nothing known saves only suggestions. Search, decision model and extraction model are fakes.
import { describe, expect, it, vi } from 'vitest';
import type {
	IdentityDecider,
	KnowledgeAnchors,
	KnowledgeEntityDetail
} from '@buildos/shared-agent-ops/knowledge';
import { choosePages, enrichContextFrom, enrichQueries } from './knowledgeEnrichPlan';
import { researchEntity, researchSummary } from './knowledgeResearch';

const CODY = '44444444-4444-4444-8444-444444444444';

function detail(
	kind: 'org' | 'person' = 'org',
	name = 'Cody Shooting Complex'
): KnowledgeEntityDetail {
	return {
		entity: {
			id: CODY,
			kind,
			name,
			summary: null,
			scope: 'private',
			is_self: false,
			image_url: null,
			status: 'active',
			created_via: 'backfill',
			enriched_at: null,
			created_at: '',
			updated_at: ''
		},
		facts: [],
		incoming: [],
		incoming_truncated: false,
		links: [],
		enrichment: [],
		known_by_me: false
	};
}

function anchors(over: Partial<KnowledgeAnchors> = {}): KnowledgeAnchors {
	return {
		entityId: CODY,
		name: 'Cody Shooting Complex',
		kind: 'org',
		circle: 'inner',
		knownByMe: false,
		domains: ['codyshootingcomplex.org'],
		urls: [],
		facts: [],
		employer: null,
		employerDomain: null,
		people: [],
		places: [],
		mentions: [
			{ record_kind: 'task', title: null, text: 'Update codyshootingcomplex.org events page' }
		],
		not: [
			{
				label: 'not the Cody Shooting Complex in Long Grove, IA',
				domains: [],
				urls: ['https://www.iowadnr.gov/cody']
			}
		],
		...over
	};
}

describe('queries from anchors', () => {
	it("reads an org's own site first and excludes rejected domains", () => {
		const context = enrichContextFrom(detail());
		expect(
			enrichQueries(
				context,
				null,
				[],
				anchors({
					people: ['Louis Arnette'],
					not: [{ label: 'x', domains: ['laindustrial.co.uk'], urls: [] }]
				})
			)
		).toEqual([
			'site:codyshootingcomplex.org -site:laindustrial.co.uk',
			'"Cody Shooting Complex" "Louis Arnette" -site:laindustrial.co.uk'
		]);
	});

	it('searches an org with the people who work there when its site is unknown', () => {
		const la = enrichContextFrom(detail('org', 'LA Industrial'));
		expect(
			enrichQueries(
				la,
				null,
				[],
				anchors({
					name: 'LA Industrial',
					domains: [],
					people: ['Louis Arnette'],
					places: ['Baltimore, MD'],
					not: []
				})
			)
		).toEqual(['"LA Industrial" "Louis Arnette"', '"LA Industrial" Baltimore, MD']);
	});

	it("searches a person with their employer's site", () => {
		const louis = enrichContextFrom(detail('person', 'Louis Arnette'));
		expect(
			enrichQueries(
				louis,
				null,
				[],
				anchors({
					name: 'Louis Arnette',
					kind: 'person',
					domains: [],
					employer: 'LA Industrial Services',
					employerDomain: 'laindustrialservices.com',
					not: []
				})
			)
		).toEqual([
			'"Louis Arnette" LA Industrial Services',
			'"Louis Arnette" site:laindustrialservices.com'
		]);
	});

	it('never picks a rejected page and puts own-site pages first', () => {
		const picked = choosePages(
			[
				{ url: 'https://www.iowadnr.gov/cody' },
				{ url: 'https://news.example/cody' },
				{ url: 'https://www.codyshootingcomplex.org/about' }
			],
			null,
			3,
			{ ownDomains: ['codyshootingcomplex.org'], exclude: anchors().not }
		);
		expect(picked.map((p) => p.url)).toEqual([
			'https://www.codyshootingcomplex.org/about',
			'https://news.example/cody'
		]);
	});
});

const OWN = 'The Cody Shooting Complex in Cody, Wyoming offers trap, skeet and rifle ranges.';
const IOWA = 'Cody Shooting Complex, a public range near Long Grove, Iowa, run by the county.';

function harness(opts: { decider?: IdentityDecider | null; anchors?: KnowledgeAnchors | null }) {
	const prompts: string[] = [];
	const queries: string[] = [];
	let spent = 0;
	const llm = {
		getJSONResponse: vi.fn(async (options: any) => {
			prompts.push(options.userPrompt);
			options.onUsage?.({ totalCost: 0.0004 });
			// Cites whichever page (after the identity check) holds the quote.
			const quote = 'offers trap, skeet and rifle ranges';
			const blocks = String(options.userPrompt).split('<page number="').slice(1);
			const page = blocks.findIndex((b) => b.includes(quote)) + 1;
			return {
				pages: [{ page, about_entity: true }],
				facts: [
					{
						predicate: 'description',
						value: quote,
						page,
						quote: 'offers trap, skeet and rifle ranges',
						confidence: 0.9
					}
				]
			};
		})
	};
	const port = {
		search: async (args: Record<string, unknown>) => {
			queries.push(String(args.query));
			return {
				results: [
					{
						url: 'https://county.example/cody-range',
						title: 'Iowa range',
						page_content: IOWA
					},
					{
						url: 'https://wyoming-news.example/cody',
						title: 'News',
						page_content: `${OWN} Story.`
					}
				]
			};
		}
	};
	const run = () =>
		researchEntity(
			{
				detail: detail(),
				anchors: opts.anchors === undefined ? anchors() : opts.anchors,
				fields: ['description', 'located_in'],
				instructions: null,
				userId: '22222222-2222-4222-8222-222222222222'
			},
			{
				llm: llm as never,
				port,
				decider: opts.decider ?? null,
				charge: (usd) => (spent += usd),
				takeReserved: () => 0,
				budgetLeft: () => 0.03 - spent
			}
		);
	return { run, prompts, queries, llm, spent: () => spent };
}

describe('researchEntity: same one?', () => {
	it('drops a same-name page before extraction and keeps facts from the right one', async () => {
		const asked: any[] = [];
		const decider: IdentityDecider = {
			async decide(request) {
				asked.push(request);
				const pick = (n: number) => (n === 1 ? 'different' : 'same');
				const answers = Object.fromEntries(
					Object.keys(request.questions).map((q, i) => [
						q,
						{
							type: 'choice',
							choice: pick(i + 1),
							probabilities: {
								same: pick(i + 1) === 'same' ? 0.9 : 0.05,
								different: pick(i + 1) === 'different' ? 0.9 : 0.05,
								unclear: 0.05
							},
							confidence: 0.9
						}
					])
				);
				return { ok: true, answers, receipt: { costUsd: 0.0005 } };
			}
		};
		const h = harness({ decider });
		const outcome = await h.run();

		expect(h.queries[0]).toContain('site:codyshootingcomplex.org');
		expect(asked).toHaveLength(1);
		expect(outcome.differentPages).toBe(1);
		expect(outcome.verdicts.map((v) => v.verdict)).toEqual(['different', 'same']);
		expect(h.prompts[0]).not.toContain('run by the county');
		expect(h.prompts[0]).toContain('Not this one');
		expect(h.prompts[0]).toContain('Their own website: codyshootingcomplex.org');
		expect(outcome.batch.facts).toHaveLength(1);
		expect(outcome.batch.facts[0]).toMatchObject({ status: 'active' });
		expect(h.spent()).toBeCloseTo(0.0009, 6);
		expect(researchSummary(outcome, 1, 0, 0)).toBe(
			'2 pages read, 1 new detail, 1 page about a different one skipped'
		);
	});

	it("saves only suggestions from pages the check can't confirm", async () => {
		const h = harness({ decider: null }); // no model: pages fail closed to "ask"
		const outcome = await h.run();
		expect(outcome.verdicts.every((v) => v.verdict === 'ask')).toBe(true);
		expect(outcome.batch.facts[0]).toMatchObject({ status: 'suggested' });
	});

	it('with nothing known, skips the check and saves suggestions only', async () => {
		const decider = { decide: vi.fn() } as unknown as IdentityDecider;
		const h = harness({ decider, anchors: null });
		const outcome = await h.run();
		expect(decider.decide).not.toHaveBeenCalled();
		expect(outcome.unanchored).toBe(true);
		expect(h.queries[0]).toBe('"Cody Shooting Complex" company');
		expect(outcome.batch.facts.every((f) => f.status === 'suggested')).toBe(true);
	});
});

describe('researchEntity: pages that will not open', () => {
	it('reads the search preview of a page that cannot be opened, and names the ones with nothing to read', async () => {
		const prompts: string[] = [];
		const preview =
			'Executive Producer at Example Show. Los Angeles, California. Education: State University.';
		const outcome = await researchEntity(
			{
				detail: detail(),
				anchors: anchors(),
				fields: ['description'],
				instructions: 'The range in Wyoming.',
				userId: '22222222-2222-4222-8222-222222222222',
				queries: ['"Cody Shooting Complex" Wyoming']
			},
			{
				llm: {
					getJSONResponse: async (options: any) => {
						prompts.push(options.userPrompt);
						return { pages: [], facts: [] };
					}
				} as never,
				port: {
					search: async () => ({
						results: [
							{ url: 'https://www.linkedin.com/in/someone', title: 'Someone | LinkedIn', snippet: preview },
							{ url: 'https://walled.example/page', title: 'Walled' }
						]
					}),
					visit: async () => {
						throw new Error('blocked');
					}
				},
				decider: null,
				charge: () => {},
				takeReserved: () => 0,
				budgetLeft: () => 0.03
			}
		);
		expect(outcome.previews).toEqual(['https://www.linkedin.com/in/someone']);
		expect(outcome.unread).toEqual(['https://walled.example/page']);
		expect(outcome.pagesRead).toBe(1);
		expect(prompts[0]).toContain('[Search preview only: the page itself could not be opened.]');
		expect(prompts[0]).toContain(preview);
	});
});

