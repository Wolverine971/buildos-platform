// apps/web/src/lib/components/agent/knowledge-search-tray.test.ts
//
// Guided search in chat: tool results become one Entities tray per turn, and the next steps
// follow what is ticked.
import { describe, expect, it } from 'vitest';
import {
	buildKnowledgeTrail,
	buildKnowledgeTray,
	entityFit,
	extractGuidedSearch,
	knowledgeNextSteps,
	messageKnowledgeSelection,
	readKnowledgeTray,
	type KnowledgeSelectionRef
} from './knowledge-search-tray';

const ANN = 'a0000000-0000-4000-8000-000000000001';
const BO = 'a0000000-0000-4000-8000-000000000002';
const TENABLE = 'b0000000-0000-4000-8000-000000000001';
const ZEROFOX = 'b0000000-0000-4000-8000-000000000002';
const COLUMBIA = 'c0000000-0000-4000-8000-000000000001';

const findResult = {
	knowledge_find: {
		goal: 'Who do I know near Baltimore who works in software',
		hop: 0,
		checks: [
			{ key: 'near', question: 'Near Baltimore?' },
			{ key: 'software', question: 'Works in software?' }
		],
		need: ['phone'],
		entities: [
			{
				id: ANN,
				kind: 'person',
				name: 'Ann',
				origin: 'graph',
				hop: 0,
				known: true,
				fit: { near: 'yes', software: 'unknown' },
				missing: ['phone']
			},
			{ id: BO, kind: 'person', name: 'Bo', origin: 'graph', hop: 0, fit: { near: 'no' } }
		]
	},
	message: 'Looked at 2 people.'
};

const exploreResult = {
	knowledge_explore: {
		goal: 'Software companies near Baltimore',
		hop: 1,
		checks: [{ key: 'near', question: 'Near Baltimore?' }],
		queries: ['software companies Baltimore Maryland'],
		pages: [{ url: 'https://www.technical.ly/baltimore', title: 'Baltimore software' }],
		entities: [
			{
				id: TENABLE,
				kind: 'org',
				name: 'Tenable',
				origin: 'web',
				hop: 1,
				is_new: true,
				fit: { near: 'yes' },
				sources: ['https://www.technical.ly/baltimore']
			},
			{ id: ZEROFOX, kind: 'org', name: 'ZeroFox', origin: 'web', hop: 1, is_new: true }
		]
	},
	message: 'Hop 1 of 3.'
};

describe('reading a guided search out of a tool result', () => {
	it('finds it in a live result, a stored result, and the legacy data alias', () => {
		const live = extractGuidedSearch({ tool_call_id: 'c1', success: true, result: findResult });
		expect(live?.tool).toBe('find_in_knowledge');
		expect(live?.entities.map((entity) => entity.name)).toEqual(['Ann', 'Bo']);
		expect(extractGuidedSearch(exploreResult)?.tool).toBe('explore_knowledge');
		expect(extractGuidedSearch({ data: exploreResult })?.hop).toBe(1);
		expect(extractGuidedSearch({ result: { result: exploreResult } })?.hop).toBe(1);
	});

	it('ignores every other result', () => {
		expect(extractGuidedSearch({ result: { results: [{ id: ANN }] } })).toBeNull();
		expect(extractGuidedSearch({ result: { knowledge_find: { entities: [] } } })).toBeNull();
		expect(extractGuidedSearch('knowledge_find')).toBeNull();
		expect(extractGuidedSearch(null)).toBeNull();
	});
});

describe('one tray per turn', () => {
	it('merges an inside search and an outside hop of the same turn', () => {
		const tray = buildKnowledgeTray([
			extractGuidedSearch(findResult)!,
			extractGuidedSearch(exploreResult)!
		])!;
		expect(tray.source).toBe('both');
		expect(tray.hop).toBe(1);
		expect(tray.entities.map((entity) => entity.name)).toEqual([
			'Ann',
			'Bo',
			'Tenable',
			'ZeroFox'
		]);
		expect(tray.checks.map((check) => check.key)).toEqual(['near', 'software']);
		expect(tray.need).toEqual(['phone']);
		expect(tray.pages).toEqual([
			{ url: 'https://www.technical.ly/baltimore', title: 'Baltimore software' }
		]);
		expect(readKnowledgeTray(JSON.parse(JSON.stringify(tray)))?.id).toBe(tray.id);
	});

	it('keeps a site flagged for text aimed at AI tools, whichever search of the turn flagged it', () => {
		const url = 'https://www.technical.ly/baltimore';
		const flagged = {
			...exploreResult,
			knowledge_explore: {
				...exploreResult.knowledge_explore,
				run_id: 'run-2',
				pages: [{ url, title: 'Baltimore software', flagged: true }]
			}
		};
		// Only the worker's structured boolean counts.
		expect(extractGuidedSearch(exploreResult)!.pages[0]).not.toHaveProperty('flagged');
		expect(extractGuidedSearch(flagged)!.pages).toEqual([
			{ url, title: 'Baltimore software', flagged: true }
		]);
		for (const views of [
			[extractGuidedSearch(exploreResult)!, extractGuidedSearch(flagged)!],
			[extractGuidedSearch(flagged)!, extractGuidedSearch(exploreResult)!]
		])
			expect(buildKnowledgeTray(views)!.pages).toEqual([
				{ url, title: 'Baltimore software', flagged: true }
			]);
	});

	it('gives the same turn the same id however its results are ordered, and a new turn another', () => {
		const a = buildKnowledgeTray([
			extractGuidedSearch(findResult)!,
			extractGuidedSearch(exploreResult)!
		])!;
		const b = buildKnowledgeTray([
			extractGuidedSearch(exploreResult)!,
			extractGuidedSearch(findResult)!
		])!;
		expect(a.id).toBe(b.id);
		expect(buildKnowledgeTray([extractGuidedSearch(findResult)!])!.id).not.toBe(a.id);
	});

	it('gives two outside hops their own trays even when the same entries come back', () => {
		const hop = (runId: string) =>
			buildKnowledgeTray([
				extractGuidedSearch({
					knowledge_explore: { ...exploreResult.knowledge_explore, run_id: runId }
				})!
			])!;
		expect(hop('run-a').entities.map((entity) => entity.id)).toEqual(
			hop('run-b').entities.map((entity) => entity.id)
		);
		expect(hop('run-a').id).not.toBe(hop('run-b').id);
		expect(hop('run-a').id).toBe(hop('run-a').id);
	});

	it('keeps an entry the graph already held marked as such when a hop also returns it', () => {
		const again = {
			knowledge_explore: {
				hop: 2,
				entities: [
					{ id: ANN, kind: 'person', name: 'Ann', origin: 'web', hop: 2, title: 'CTO' }
				]
			}
		};
		const tray = buildKnowledgeTray([
			extractGuidedSearch(findResult)!,
			extractGuidedSearch(again)!
		])!;
		const ann = tray.entities.find((entity) => entity.id === ANN)!;
		expect(ann).toMatchObject({ origin: 'graph', hop: 0, known: true, title: 'CTO' });
		expect(ann.fit).toEqual({ near: 'yes', software: 'unknown' });
	});

	it('shows a search that stopped itself even with nothing found, and nothing for no searches', () => {
		const stopped = extractGuidedSearch({
			knowledge_explore: {
				hop: 4,
				entities: [],
				stopped: { reason: 'hop_limit', message: 'More than 3 hops out.' }
			}
		})!;
		const tray = buildKnowledgeTray([stopped])!;
		expect(tray.entities).toEqual([]);
		expect(tray.stopped).toBe('More than 3 hops out.');
		expect(buildKnowledgeTray([])).toBeNull();
	});

	it('reads how an entry stands against the checks', () => {
		const [ann, bo] = extractGuidedSearch(findResult)!.entities;
		expect(entityFit(ann!)).toBe('unknown');
		expect(entityFit(bo!)).toBe('out');
		expect(entityFit({ ...ann!, fit: { near: 'yes', software: 'yes' } })).toBe('pass');
		expect(entityFit({ ...ann!, fit: undefined })).toBeNull();
	});
});

describe('next steps from what is ticked', () => {
	const ref = (
		entity_id: string,
		name: string,
		kind: KnowledgeSelectionRef['kind']
	): KnowledgeSelectionRef => ({
		entity_id,
		name,
		kind
	});
	const inside = buildKnowledgeTray([extractGuidedSearch(findResult)!])!;
	const outside = buildKnowledgeTray([extractGuidedSearch(exploreResult)!])!;

	it('offers to look outside when an inside search has nothing ticked', () => {
		expect(knowledgeNextSteps(inside, [])).toEqual([
			{
				id: 'outside',
				label: 'Look outside BuildOS',
				message: 'Extend this search outside BuildOS.'
			}
		]);
		// After an outside hop the user picks; nothing is suggested until they do.
		expect(knowledgeNextSteps(outside, [])).toEqual([]);
	});

	it('goes from a company to the people who run it', () => {
		const one = knowledgeNextSteps(outside, [ref(TENABLE, 'Tenable', 'org')]);
		expect(one.map((step) => step.message)).toEqual([
			'Find the people who run Tenable.',
			'Who do I already know at Tenable?'
		]);
		const two = knowledgeNextSteps(outside, [
			ref(TENABLE, 'Tenable', 'org'),
			ref(ZEROFOX, 'ZeroFox', 'org')
		]);
		expect(two[0]!.label).toBe('Find the people who run these 2 companies');
	});

	it('goes from a person or a place to the fitting next question', () => {
		expect(
			knowledgeNextSteps(outside, [ref(ANN, 'Ann', 'person')]).map((step) => step.id)
		).toEqual(['about', 'path']);
		expect(
			knowledgeNextSteps(outside, [ref(COLUMBIA, 'Columbia, MD', 'place')])[0]!.message
		).toBe("Find companies in Columbia, MD that fit what I'm looking for.");
	});

	it('offers one general step for a mixed selection', () => {
		expect(
			knowledgeNextSteps(outside, [ref(TENABLE, 'Tenable', 'org'), ref(ANN, 'Ann', 'person')])
		).toEqual([
			{
				id: 'further',
				label: 'Search further on these 2',
				message: 'Search further on these 2.'
			}
		]);
	});

	it('says to keep going only when the trail is already at the hop limit', () => {
		const atLimit = { ...outside, hop: outside.hopLimit };
		expect(knowledgeNextSteps(atLimit, [ref(TENABLE, 'Tenable', 'org')])[0]!.message).toBe(
			'Find the people who run Tenable. Keep going past the hop limit.'
		);
		// An inside search is never "at the limit".
		expect(
			knowledgeNextSteps({ ...inside, hop: 3 }, [ref(ANN, 'Ann', 'person')])[0]!.message
		).toBe('Tell me more about Ann.');
	});
});

describe('the entries a message was sent about', () => {
	it('reads stored refs and drops malformed ones', () => {
		expect(
			messageKnowledgeSelection({
				knowledge_selection: [
					{ entity_id: TENABLE, name: 'Tenable', kind: 'org' },
					{ entity_id: 'nope', name: 'Bad', kind: 'org' },
					{ entity_id: ZEROFOX, name: '', kind: 'org' }
				]
			})
		).toEqual([{ entity_id: TENABLE, name: 'Tenable', kind: 'org' }]);
		expect(messageKnowledgeSelection(undefined)).toEqual([]);
		expect(messageKnowledgeSelection({ knowledge_selection: 'Tenable' })).toEqual([]);
	});
});

describe('the trail across hops', () => {
	const STEVE = 'd0000000-0000-4000-8000-000000000001';
	const hop2 = {
		knowledge_explore: {
			hop: 2,
			entities: [
				{
					id: STEVE,
					kind: 'person',
					name: 'Steve Vintz',
					origin: 'web',
					hop: 2,
					from_entity_id: TENABLE
				},
				// Found again one hop further out: it keeps its first place.
				{ id: ZEROFOX, kind: 'org', name: 'ZeroFox', origin: 'web', hop: 2 }
			]
		}
	};
	const trays = [findResult, exploreResult, hop2].map(
		(result) => buildKnowledgeTray([extractGuidedSearch(result)!])!
	);

	it('folds quiet graph entries into one line and nests each find under what it came from', () => {
		expect(
			buildKnowledgeTrail(trays).map((row) => [row.depth, row.hop, row.count ?? row.name])
		).toEqual([
			[0, 0, 2],
			[0, 1, 'Tenable'],
			[1, 2, 'Steve Vintz'],
			[0, 1, 'ZeroFox']
		]);
	});

	it('keeps a graph entry that a search started from as its own line', () => {
		const fromAnn = buildKnowledgeTray([
			extractGuidedSearch({
				knowledge_explore: {
					hop: 1,
					entities: [
						{
							id: TENABLE,
							kind: 'org',
							name: 'Tenable',
							origin: 'web',
							hop: 1,
							from_entity_id: ANN
						}
					]
				}
			})!
		])!;
		expect(
			buildKnowledgeTrail([trays[0]!, fromAnn]).map((row) => [row.depth, row.name])
		).toEqual([
			[0, 'Bo'],
			[0, 'Ann'],
			[1, 'Tenable']
		]);
	});

	it('calls a folded group "entries" when it is not only people', () => {
		const mixed = buildKnowledgeTray([
			extractGuidedSearch({
				knowledge_find: {
					hop: 0,
					entities: [
						{ id: ANN, kind: 'person', name: 'Ann', origin: 'graph', hop: 0 },
						{ id: TENABLE, kind: 'org', name: 'Tenable', origin: 'graph', hop: 0 }
					]
				}
			})!
		])!;
		expect(buildKnowledgeTrail([mixed]).map((row) => [row.name, row.count])).toEqual([
			['entries', 2]
		]);
	});

	it('does not loop when two entries were each found from the other', () => {
		const loop = buildKnowledgeTray([
			extractGuidedSearch({
				knowledge_explore: {
					hop: 1,
					entities: [
						{
							id: TENABLE,
							kind: 'org',
							name: 'A',
							origin: 'web',
							hop: 1,
							from_entity_id: ZEROFOX
						},
						{
							id: ZEROFOX,
							kind: 'org',
							name: 'B',
							origin: 'web',
							hop: 1,
							from_entity_id: TENABLE
						}
					]
				}
			})!
		])!;
		expect(buildKnowledgeTrail([loop])).toEqual([]);
		expect(buildKnowledgeTrail([])).toEqual([]);
	});
});
