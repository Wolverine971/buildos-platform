// apps/worker/tests/agenticChatWebSearchReview.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAgenticChatWebSearchReviewer } from '../src/workers/agentic-chat/tools/web-search-review';
import type {
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientRequestV1
} from '../src/workers/agentic-chat/provider/contracts';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	AgenticChatOpenRouterClient,
	createStableAgenticChatProviderUsageLogIdV1
} from '../src/workers/agentic-chat/provider/openrouter-client';

const executionInput = {
	claim: {
		userId: '10000000-0000-4000-8000-000000000001',
		sessionId: '20000000-0000-4000-8000-000000000002',
		turnRunId: '30000000-0000-4000-8000-000000000003',
		queueJobId: '40000000-0000-4000-8000-000000000004',
		executionGeneration: 1
	},
	streamRunId: 'stream-1',
	clientTurnId: 'client-1',
	requestPayload: { message: 'Yes, compare their current pricing.' },
	artifact: {
		history: [
			{ role: 'user', content: 'I am comparing Mailchimp and ConvertKit.' },
			{ role: 'assistant', content: 'PRIVATE_ASSISTANT_SENTINEL' },
			{ role: 'tool', content: 'PRIVATE_TOOL_SENTINEL' }
		],
		prepared: { systemPrompt: 'PRIVATE_SYSTEM_SENTINEL' }
	}
} as unknown as AgenticChatWorkerExecutionInputV1;
const request = () => ({
	arguments: { query: 'Mailchimp pricing' },
	executionInput,
	processingToken: '50000000-0000-4000-8000-000000000005',
	reviewIndex: 1,
	signal: new AbortController().signal
});
const call = (
	args = '{"allowed":true,"reason":"Public pricing comparison."}',
	name = 'review_web_search'
): AgenticChatTurnProviderClientEventV1 => ({
	type: 'tool_call',
	toolCall: [{ index: 0, id: 'review-1', type: 'function', function: { name, arguments: args } }]
});
const done: AgenticChatTurnProviderClientEventV1 = { type: 'done', finishedReason: 'tool_calls' };

describe('isolated web-search review', () => {
	it.each([
		[call(), done],
		[call('{"allowed":false,"reason":"Unrelated private identifier."}'), done]
	])(
		'accepts complete structured decisions and uses only user conversation',
		async (...events) => {
			let observed: AgenticChatTurnProviderClientRequestV1 | undefined;
			const reviewer = createAgenticChatWebSearchReviewer({
				async *stream(input) {
					observed = input;
					yield* events;
				}
			});
			const allowed = await reviewer.authorize(request());
			expect(typeof allowed).toBe('boolean');
			const prompt = JSON.stringify(observed!.messages);
			expect(prompt).toContain('Mailchimp and ConvertKit');
			expect(prompt).not.toContain('PRIVATE_');
			expect(observed!.tools.map((tool) => tool.function.name)).toEqual([
				'review_web_search'
			]);
		}
	);

	it.each([
		['no completion', [call()]],
		['truncated completion', [call(), { type: 'done', finishedReason: 'length' }]],
		['missing decision', [done]],
		['malformed JSON', [call('{"allowed":true'), done]],
		['truthy string', [call('{"allowed":"true","reason":"ok"}'), done]],
		['unexpected field', [call('{"allowed":true,"reason":"ok","query":"stolen"}'), done]],
		['wrong tool', [call(undefined, 'web_search'), done]],
		['provider error', [call(), { type: 'error', error: 'offline', retryable: true }]],
		[
			'extra decision',
			[
				call(),
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 1,
							id: 'review-2',
							function: {
								name: 'review_web_search',
								arguments: '{"allowed":true,"reason":"ok"}'
							}
						}
					]
				},
				done
			]
		]
	] as Array<[string, AgenticChatTurnProviderClientEventV1[]]>)(
		'does not authorize %s',
		async (_label, events) => {
			const reviewer = createAgenticChatWebSearchReviewer({
				async *stream() {
					yield* events;
				}
			});
			await expect(reviewer.authorize(request())).rejects.toMatchObject({
				code: 'read_tool_research_review_unavailable'
			});
		}
	);

	it('runs through the production provider client with a reviewer-only tool and distinct usage identity', async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					[
						`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: (call() as { toolCall: unknown }).toolCall }, finish_reason: null }] })}\n\n`,
						`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 } })}\n\n`,
						'data: [DONE]\n\n'
					].join(''),
					{ headers: { 'content-type': 'text/event-stream' } }
				)
		);
		const usage = { observe: vi.fn(async () => {}) };
		const client = new AgenticChatOpenRouterClient(
			{ usage },
			{
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS research test',
				routes: [
					{
						id: 'test',
						kind: 'openrouter',
						baseUrl: 'https://provider.example/api/v1',
						apiKey: 'test',
						model: 'test/reviewer'
					}
				],
				fetchImpl,
				requestTimeoutMs: 1000
			}
		);
		const reviewer = createAgenticChatWebSearchReviewer(client);
		await expect(reviewer.authorize(request())).resolves.toBe(true);
		await expect(reviewer.authorize({ ...request(), reviewIndex: 2 })).resolves.toBe(true);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(usage.observe).toHaveBeenCalledTimes(2);
		const identity = {
			turnRunId: executionInput.claim.turnRunId,
			executionGeneration: 1,
			routeId: 'test',
			passRole: 'research_review' as const
		};
		expect(
			createStableAgenticChatProviderUsageLogIdV1({ ...identity, logicalProviderRound: 1 })
		).not.toBe(
			createStableAgenticChatProviderUsageLogIdV1({ ...identity, logicalProviderRound: 2 })
		);
		const body = JSON.parse(
			(fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
		);
		expect(body.prompt_cache_key).toBe('buildos:research-review:v1');
		expect(body.messages[1].content).not.toContain('PRIVATE_');
	});
});
