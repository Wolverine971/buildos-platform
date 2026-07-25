// packages/agent-orchestrator/src/agents/researcher/researcher.test.ts
import { describe, expect, it } from 'vitest';

import type { ResearchModelPort, WebResearchPort } from '../../ports';
import { runResearcher } from './researcher';

const emptyUsage = { usage: [] };

describe('bounded researcher', () => {
	it('visits and requires the supplied source without dispatching paid search', async () => {
		let searchCalls = 0;
		const sourceUrl = 'https://example.com/source';
		const web: WebResearchPort = {
			search: async () => {
				searchCalls += 1;
				return { results: [] };
			},
			visit: async () => ({
				url: sourceUrl,
				final_url: sourceUrl,
				title: 'Source',
				content: 'Source-backed facts about skills, missions, and team structure.'
			})
		};
		const model: ResearchModelPort = {
			generateText: async () => ({
				text: `The source addresses skill, mission, and team structure [Source](${sourceUrl}).`,
				...emptyUsage
			})
		};

		const execution = await runResearcher({
			objective: `Use ${sourceUrl} to research the topic.`,
			web,
			model
		});
		expect(searchCalls).toBe(0);
		expect(execution.result.status).toBe('completed');
		expect(execution.citedUrls).toEqual([sourceUrl]);
	});

	it('accepts a final redirected URL as the citation for a supplied source', async () => {
		const suppliedUrl = 'https://example.com/source';
		const finalUrl = 'https://example.com/final';
		const execution = await runResearcher({
			objective: `Use ${suppliedUrl} to research the topic.`,
			web: {
				visit: async () => ({
					url: suppliedUrl,
					final_url: finalUrl,
					title: 'Redirected Source',
					content: 'Final source-backed evidence.'
				})
			},
			model: {
				generateText: async () => ({
					text: `The redirected source has usable evidence [Source](${finalUrl}).`,
					...emptyUsage
				})
			}
		});

		expect(execution.result.status).toBe('completed');
		expect(execution.citedUrls).toEqual([finalUrl]);
	});

	it('derives its evidence bounds from the assignment, not from a scenario identity', async () => {
		// Supplied sources: visit exactly those and cite all of them.
		const supplied = ['https://example.com/a', 'https://example.com/b'];
		const visited: string[] = [];
		const suppliedRun = await runResearcher({
			objective: `Compare ${supplied[0]} and ${supplied[1]}.`,
			web: {
				search: async () => {
					throw new Error('search must not run when the request supplies its sources');
				},
				visit: async (args) => {
					const url = String((args as { url: string }).url);
					visited.push(url);
					return { url, final_url: url, title: url, content: 'Observed content.' };
				}
			},
			model: {
				generateText: async () => ({
					text: `Both sources agree [a](${supplied[0]}) and [b](${supplied[1]}).`,
					...emptyUsage
				})
			}
		});
		expect(visited).toEqual(supplied);
		expect(suppliedRun.result.status).toBe('completed');

		// Citing only one of two supplied sources is not complete evidence.
		const partialRun = await runResearcher({
			objective: `Compare ${supplied[0]} and ${supplied[1]}.`,
			web: {
				visit: async (args) => {
					const url = String((args as { url: string }).url);
					return { url, final_url: url, title: url, content: 'Observed content.' };
				}
			},
			model: {
				generateText: async () => ({
					text: `Only one source is cited [a](${supplied[0]}).`,
					...emptyUsage
				})
			}
		});
		expect(partialRun.result.status).toBe('partial');

		// Discovered sources require corroboration from at least two of them.
		const discovered = 'https://example.com/only';
		const discoveredRun = await runResearcher({
			objective: 'Research the current options and recommend one.',
			web: {
				search: async () => ({ results: [{ url: discovered }] }),
				visit: async () => ({
					url: discovered,
					final_url: discovered,
					title: 'Only',
					content: 'A single observed source.'
				})
			},
			model: {
				generateText: async () => ({
					text: `One option looks best [only](${discovered}).`,
					...emptyUsage
				})
			}
		});
		expect(discoveredRun.result.status).toBe('partial');
	});

	it('marks a memo partial when the model invents a citation', async () => {
		const observed = 'https://example.com/observed';
		const execution = await runResearcher({
			objective: 'Research the current practice.',
			web: {
				search: async () => ({
					results: [{ title: 'Observed', url: observed }],
					info: { billing: { cost_usd: 0.008 } }
				}),
				visit: async () => ({ url: observed, title: 'Observed', content: 'Evidence.' })
			},
			model: {
				generateText: async () => ({
					text: 'Claim [invented](https://example.com/invented).',
					...emptyUsage
				})
			}
		});
		expect(execution.result.status).toBe('partial');
		expect(execution.result.acceptance_results[0]?.status).toBe('failed');
		expect(execution.toolCostUsd).toBe(0.008);
	});

	it('uses context to make a short-reference search query concrete', async () => {
		let query = '';
		const source = 'https://example.com/pvt';
		const contextPacket = {
			schema_version: 1 as const,
			objective: 'Which app should I download for this?',
			project_scope: [],
			facts: [
				{
					fact_id: '77777777-7777-4777-8777-777777777777',
					statement:
						'Choose a PVT psychomotor vigilance task app for iPhone and log a baseline.',
					source: {
						source_type: 'buildos_entity' as const,
						source_id: 'task:test',
						source_uri: null,
						project_id: null,
						captured_at: '2026-07-24T16:00:00.000Z'
					},
					as_of: '2026-07-24T16:00:00.000Z',
					confidence: 1
				}
			],
			excerpts: [],
			artifact_refs: [],
			constraints: [],
			intentionally_excluded: [],
			retrieval_options: [],
			as_of: '2026-07-24T16:00:00.000Z'
		};
		const execution = await runResearcher({
			objective: 'I have an iPhone. Which app should I download for this?',
			contextPacket,
			minimumCitations: 1,
			web: {
				search: async (args) => {
					query = String(args.query);
					return { results: [{ title: 'PVT', url: source }] };
				},
				visit: async () => ({ url: source, title: 'PVT', content: 'iPhone PVT evidence.' })
			},
			model: {
				generateText: async () => ({
					text: `Use the evidence [PVT](${source}).`,
					...emptyUsage
				})
			}
		});

		expect(query).toContain('PVT psychomotor vigilance task app for iPhone');
		expect(execution.result.status).toBe('completed');
	});

	it('fails closed without visited evidence and does not call the model', async () => {
		let modelCalls = 0;
		const execution = await runResearcher({
			objective: 'Research this.',
			web: { search: async () => ({ results: [] }) },
			model: {
				generateText: async () => {
					modelCalls += 1;
					return { text: 'should not run', ...emptyUsage };
				}
			}
		});
		expect(modelCalls).toBe(0);
		expect(execution.result.status).toBe('failed');
	});
});
