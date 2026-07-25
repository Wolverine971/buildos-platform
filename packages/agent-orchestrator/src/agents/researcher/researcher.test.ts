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
					statement: 'Choose a PVT psychomotor vigilance task app for iPhone and log a baseline.',
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
				generateText: async () => ({ text: `Use the evidence [PVT](${source}).`, ...emptyUsage })
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
