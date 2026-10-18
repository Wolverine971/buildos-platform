// apps/worker/tests/agenticChatContinuationReasoning.test.ts
// AGENTIC_CHAT_CONTINUATION_REASONING (audit 2026-10-17 S3): default stays
// byte-identical; `replay` sends a turn's earlier reasoning back on its own
// tool-call messages; `off_after_reads` turns reasoning off after read rounds.
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
	type AgenticChatContinuationReasoningMode,
	type AgenticChatOpenAiCompatibleRouteV1,
	AgenticChatOpenRouterClient
} from '../src/workers/agentic-chat/provider/openrouter-client';
import type {
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientRequestV1,
	AgenticChatTurnProviderMessageV1
} from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatPendingEffectsRegistry } from '../src/workers/agentic-chat/effects/pending-effects';
import type { AgenticChatExecutionObservationInputV1 } from '../src/workers/agentic-chat/effects/execution-observation';
import {
	TurnReasoningReplayStore,
	captureReasoningDelta,
	completedReasoning,
	createReasoningCapture,
	reasoningOffAfterReads
} from '../src/workers/agentic-chat/provider/openrouter/reasoning-replay';
import { AGENTIC_CHAT_CONTROL_TOOL_NAMES_V1 } from '../src/workers/agentic-chat/tools/execution-adapter';
import { loadAgenticChatConfig } from '../src/workers/agentic-chat/host/config';

const V41 = 'deepseek/deepseek-v4.1-flash';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const OTHER_TURN_RUN_ID = '30000000-0000-4000-8000-000000000099';

function tool(name: string) {
	return {
		type: 'function' as const,
		function: {
			name,
			description: `Call ${name}.`,
			parameters: { type: 'object', properties: { query: { type: 'string' } } }
		}
	};
}
const TOOLS = [tool('search_project'), tool('get_project_overview'), tool('update_onto_task')];

function route(model = V41): AgenticChatOpenAiCompatibleRouteV1 {
	return {
		id: 'openrouter',
		kind: 'openrouter',
		baseUrl: 'https://openrouter.example/api/v1',
		apiKey: 'provider-secret',
		model,
		fallbackModels: []
	};
}

function request(
	messages: readonly AgenticChatTurnProviderMessageV1[],
	overrides: Partial<AgenticChatTurnProviderClientRequestV1> = {}
): AgenticChatTurnProviderClientRequestV1 {
	return {
		messages,
		tools: TOOLS,
		toolChoice: 'auto',
		userId: '10000000-0000-4000-8000-000000000001',
		sessionId: '20000000-0000-4000-8000-000000000002',
		turnRunId: TURN_RUN_ID,
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		contextType: 'project',
		entityId: 'project-1',
		projectId: 'project-1',
		queueJobId: '40000000-0000-4000-8000-000000000004',
		processingToken: '50000000-0000-4000-8000-000000000005',
		executionGeneration: 1,
		providerRound: 'synthesis',
		logicalProviderRound: 2,
		passRole: 'acting',
		allowSlowStreamRecovery: true,
		signal: new AbortController().signal,
		...overrides
	};
}

function sse(frames: unknown[]): Response {
	const text =
		[...frames.map((frame) => JSON.stringify(frame)), '[DONE]']
			.map((frame) => `data: ${frame}`)
			.join('\n\n') + '\n\n';
	return new Response(text, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const USAGE = {
	usage: {
		prompt_tokens: 100,
		completion_tokens: 20,
		total_tokens: 120,
		completion_tokens_details: { reasoning_tokens: 10 }
	},
	choices: []
};

/** A pass that thinks (in two frames), then calls one tool. */
function toolCallPass(
	reasoning: string,
	id: string,
	name: string,
	options: { model?: string } = {}
): Response {
	const model = options.model ? { model: options.model } : {};
	return sse([
		{
			...model,
			choices: [
				{
					delta: {
						reasoning: reasoning.slice(0, 5),
						reasoning_details: [
							{
								type: 'reasoning.text',
								text: reasoning.slice(0, 5),
								format: 'unknown',
								index: 0
							}
						]
					}
				}
			]
		},
		{
			choices: [
				{
					delta: {
						reasoning: reasoning.slice(5),
						reasoning_details: [
							{
								type: 'reasoning.text',
								text: reasoning.slice(5),
								format: 'unknown',
								index: 0
							}
						]
					}
				}
			]
		},
		{
			choices: [
				{
					delta: {
						tool_calls: [
							{
								index: 0,
								id,
								type: 'function',
								function: { name, arguments: '{"query":"cedar"}' }
							}
						]
					}
				}
			]
		},
		USAGE,
		{ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
	]);
}

function answerPass(text: string): Response {
	return sse([
		{ choices: [{ delta: { reasoning: 'brief thought' } }] },
		{ choices: [{ delta: { content: text } }] },
		USAGE,
		{ choices: [{ delta: {}, finish_reason: 'stop' }] }
	]);
}

function harness(
	responses: Response[],
	options: { continuationReasoning?: AgenticChatContinuationReasoningMode } = {},
	model = V41
) {
	const bodies: string[] = [];
	const observations: AgenticChatExecutionObservationInputV1[] = [];
	const fetchImpl = vi.fn((_url: string, init?: { body?: unknown }) => {
		bodies.push(String(init?.body));
		const next = responses.shift();
		return next
			? Promise.resolve(next)
			: Promise.reject(new Error('no scripted response left'));
	}) as unknown as typeof fetch;
	const client = new AgenticChatOpenRouterClient(
		{
			usage: { observe: vi.fn(() => Promise.resolve()) },
			executionObservations: {
				observe: vi.fn((observation: AgenticChatExecutionObservationInputV1) => {
					observations.push(observation);
					return Promise.resolve();
				})
			},
			pendingEffects: new AgenticChatPendingEffectsRegistry()
		},
		{
			routes: [route(model)],
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Agentic Chat Worker',
			fetchImpl,
			requestTimeoutMs: 10_000,
			...options
		}
	);
	return { client, bodies, observations };
}

async function drain(stream: AsyncIterable<AgenticChatTurnProviderClientEventV1>) {
	const events: AgenticChatTurnProviderClientEventV1[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

const HISTORY: AgenticChatTurnProviderMessageV1[] = [
	{ role: 'system', content: 'System prompt' },
	{ role: 'user', content: 'Earlier request' },
	{
		role: 'assistant',
		content: '',
		tool_calls: [
			{
				id: 'call_prior_turn',
				type: 'function',
				function: { name: 'search_project', arguments: '{"query":"old"}' }
			}
		]
	},
	{ role: 'tool', content: '{"ok":true}', tool_call_id: 'call_prior_turn' },
	{ role: 'assistant', content: 'Earlier answer' },
	{ role: 'user', content: 'Plan the cedar tasks' }
];

function assistantCalls(id: string, name: string): AgenticChatTurnProviderMessageV1 {
	return {
		role: 'assistant',
		content: '',
		tool_calls: [{ id, type: 'function', function: { name, arguments: '{"query":"cedar"}' } }]
	};
}

const AFTER_READ: AgenticChatTurnProviderMessageV1[] = [
	...HISTORY,
	assistantCalls('call_read_1', 'search_project'),
	{ role: 'tool', content: '{"tasks":[]}', tool_call_id: 'call_read_1' },
	{ role: 'system', content: 'Evidence note' }
];
const AFTER_WRITE: AgenticChatTurnProviderMessageV1[] = [
	...AFTER_READ,
	assistantCalls('call_write_1', 'update_onto_task'),
	{ role: 'tool', content: '{"updated":true}', tool_call_id: 'call_write_1' }
];

/**
 * One turn: opening read pass, continuation after the read round (a write),
 * continuation after the write round (unwatched retry attempt), then a
 * reviewer pass over the same history. Returns every request body sent.
 */
async function runTurn(
	options: { continuationReasoning?: AgenticChatContinuationReasoningMode } = {},
	model = V41
) {
	const test = harness(
		[
			toolCallPass('Look up the cedar tasks first.', 'call_read_1', 'search_project'),
			toolCallPass('Found them; update the first task.', 'call_write_1', 'update_onto_task'),
			answerPass('Done.'),
			answerPass('Reviewed.')
		],
		options,
		model
	);
	await drain(
		test.client.stream(request(HISTORY, { providerRound: 'initial', logicalProviderRound: 1 }))
	);
	await drain(test.client.stream(request(AFTER_READ)));
	await drain(
		test.client.stream(
			request(AFTER_WRITE, {
				logicalProviderRound: 3,
				providerAttempt: 2,
				allowSlowStreamRecovery: false
			})
		)
	);
	await drain(
		test.client.stream(
			request(AFTER_WRITE, {
				logicalProviderRound: 3,
				passRole: 'mutation_review',
				toolChoice: 'none',
				tools: []
			})
		)
	);
	return { bodies: test.bodies, observations: test.observations };
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const parse = (body: string) =>
	JSON.parse(body) as { reasoning: unknown; messages: Array<Record<string, unknown>> };

/**
 * Request-body SHA-256s recorded from the unmodified code (main at ce324d348,
 * before this flag existed) for the `runTurn` scenario on DeepSeek V4.1.
 */
const GOLDEN_BODY_SHA256 = [
	'5052003ecc49de88e5486b346caae4a8627e67ad416c67616b5088aada4f7f14',
	'a5450bab95da28db13eea71aeeeb8d3b989ec115a2eacb35c5af8529e58de638',
	'e78b314d09a7368f2ff71224b58fddfe999dc02e4c4ced8a8f9f021810506739',
	'b2c47f8ff37e1ab91947ea6d0edb199739ff64dbe08eb43c299d21b32920491d'
];

describe('AGENTIC_CHAT_CONTINUATION_REASONING=default', () => {
	it('sends byte-identical requests to the pre-flag code, unset or explicit', async () => {
		const unset = await runTurn();
		const explicit = await runTurn({ continuationReasoning: 'default' });
		expect(unset.bodies.map(sha256)).toEqual(GOLDEN_BODY_SHA256);
		expect(explicit.bodies).toEqual(unset.bodies);
		for (const body of unset.bodies) {
			expect(body).not.toContain('reasoning_details');
			expect(body).not.toContain('Look up the cedar');
		}
		// Today's reasoning request: streamed on watched first attempts only.
		expect(unset.bodies.map((body) => parse(body).reasoning)).toEqual([
			{ exclude: false },
			{ exclude: false },
			{ exclude: true },
			{ effort: 'low', exclude: true }
		]);
		expect(explicit.observations.map((row) => row.payload.reasoning_effort)).toEqual(
			unset.observations.map((row) => row.payload.reasoning_effort)
		);
	});
});

describe('AGENTIC_CHAT_CONTINUATION_REASONING=replay', () => {
	it('sends each pass its turn’s earlier reasoning on the matching tool-call message', async () => {
		const { bodies } = await runTurn({ continuationReasoning: 'replay' });
		const [opening, afterRead, afterWrite, review] = bodies.map(parse);

		// The opening pass has nothing of this turn to replay.
		expect(JSON.stringify(opening)).not.toContain('reasoning_details');
		expect(opening!.reasoning).toEqual({ exclude: false });

		const readCall = afterRead!.messages.find(
			(message) =>
				(message.tool_calls as Array<{ id: string }> | undefined)?.[0]?.id === 'call_read_1'
		)!;
		expect(readCall.reasoning).toBe('Look up the cedar tasks first.');
		expect(readCall.reasoning_details).toEqual([
			{
				type: 'reasoning.text',
				text: 'Look up the cedar tasks first.',
				format: 'unknown',
				index: 0
			}
		]);

		// Never across user turns: the prior turn's tool-call message stays bare.
		for (const body of [afterRead!, afterWrite!]) {
			const prior = body.messages.find(
				(message) =>
					(message.tool_calls as Array<{ id: string }> | undefined)?.[0]?.id ===
					'call_prior_turn'
			)!;
			expect(prior).not.toHaveProperty('reasoning');
			expect(prior).not.toHaveProperty('reasoning_details');
		}

		// An unwatched retry attempt still streams reasoning so it can be replayed.
		expect(afterWrite!.reasoning).toEqual({ exclude: false });
		const writeCall = afterWrite!.messages.find(
			(message) =>
				(message.tool_calls as Array<{ id: string }> | undefined)?.[0]?.id ===
				'call_write_1'
		)!;
		expect(writeCall.reasoning).toBe('Found them; update the first task.');
		// The earlier block is re-sent byte-identically, so the prefix cache holds.
		const readCallAgain = afterWrite!.messages.find(
			(message) =>
				(message.tool_calls as Array<{ id: string }> | undefined)?.[0]?.id === 'call_read_1'
		)!;
		expect(JSON.stringify(readCallAgain)).toBe(JSON.stringify(readCall));

		// Reviewers never see the actor's reasoning and keep their own request.
		expect(JSON.stringify(review)).not.toContain('reasoning_details');
		expect(JSON.stringify(review)).not.toContain('Look up the cedar');
		expect(review!.reasoning).toEqual({ effort: 'low', exclude: true });
	});

	it('keeps message content and order unchanged apart from the added reasoning', async () => {
		const replay = await runTurn({ continuationReasoning: 'replay' });
		const baseline = await runTurn();
		const strip = (body: string) =>
			parse(body).messages.map(({ reasoning: _r, reasoning_details: _d, ...rest }) => rest);
		replay.bodies.forEach((body, index) => {
			expect(strip(body)).toEqual(strip(baseline.bodies[index]!));
		});
	});

	it('never attaches reasoning to a different turn', async () => {
		const test = harness(
			[
				toolCallPass('Look up the cedar tasks first.', 'call_read_1', 'search_project'),
				answerPass('ok')
			],
			{ continuationReasoning: 'replay' }
		);
		await drain(
			test.client.stream(
				request(HISTORY, { providerRound: 'initial', logicalProviderRound: 1 })
			)
		);
		await drain(test.client.stream(request(AFTER_READ, { turnRunId: OTHER_TURN_RUN_ID })));
		expect(test.bodies[1]).not.toContain('Look up the cedar');
	});

	it('does not replay into a reasoning-off pass or a pass served by a fallback model', async () => {
		const test = harness(
			[
				toolCallPass('Fallback thinking.', 'call_read_1', 'search_project', {
					model: 'other/fallback-model'
				}),
				answerPass('ok'),
				toolCallPass('Real thinking.', 'call_read_2', 'search_project'),
				answerPass('ok')
			],
			{ continuationReasoning: 'replay' }
		);
		await drain(
			test.client.stream(
				request(HISTORY, { providerRound: 'initial', logicalProviderRound: 1 })
			)
		);
		await drain(test.client.stream(request(AFTER_READ)));
		expect(test.bodies[1]).not.toContain('Fallback thinking');

		const turn2 = [...HISTORY.slice(0, -1), { role: 'user' as const, content: 'Next' }];
		await drain(
			test.client.stream(
				request(turn2, {
					providerRound: 'initial',
					logicalProviderRound: 1,
					turnRunId: OTHER_TURN_RUN_ID
				})
			)
		);
		await drain(
			test.client.stream(
				request(
					[
						...turn2,
						assistantCalls('call_read_2', 'search_project'),
						{ role: 'tool', content: '{}', tool_call_id: 'call_read_2' }
					],
					{ turnRunId: OTHER_TURN_RUN_ID, reasoningEffort: 'none' }
				)
			)
		);
		expect(test.bodies[3]).not.toContain('Real thinking');
		expect(parse(test.bodies[3]!).reasoning).toEqual({ enabled: false });
	});

	it('leaves other models’ requests exactly as default', async () => {
		const replay = await runTurn({ continuationReasoning: 'replay' }, 'provider/other');
		const baseline = await runTurn({}, 'provider/other');
		expect(replay.bodies).toEqual(baseline.bodies);
	});
});

describe('TurnReasoningReplayStore', () => {
	it('drops a provider id reused across passes instead of guessing', () => {
		const store = new TurnReasoningReplayStore();
		store.record(TURN_RUN_ID, ['call_0'], { reasoning: 'first', bytes: 5 });
		expect(store.lookup(TURN_RUN_ID, ['call_0'])?.reasoning).toBe('first');
		store.record(TURN_RUN_ID, ['call_0'], { reasoning: 'second', bytes: 6 });
		expect(store.lookup(TURN_RUN_ID, ['call_0'])).toBeNull();
	});

	it('expires a turn and requires every id to come from one pass', () => {
		const store = new TurnReasoningReplayStore();
		store.record(TURN_RUN_ID, ['a', 'b'], { reasoning: 'ab', bytes: 2 }, 0);
		store.record(TURN_RUN_ID, ['c'], { reasoning: 'c', bytes: 1 }, 0);
		expect(store.lookup(TURN_RUN_ID, ['a', 'b'], 1)?.reasoning).toBe('ab');
		expect(store.lookup(TURN_RUN_ID, ['b'], 1)?.reasoning).toBe('ab');
		expect(store.lookup(TURN_RUN_ID, ['a', 'c'], 1)).toBeNull();
		expect(store.lookup(TURN_RUN_ID, ['a', 'b'], 11 * 60_000)).toBeNull();
	});

	it('never replays a truncated capture', () => {
		const capture = createReasoningCapture();
		capture.toolCallIds.set(0, 'call_x');
		captureReasoningDelta(capture, { reasoning: 'x'.repeat(200 * 1024) });
		expect(capture.overflow).toBe(true);
		expect(completedReasoning(capture, [0])).toBeNull();
	});
});

describe('AGENTIC_CHAT_CONTINUATION_REASONING=off_after_reads', () => {
	it('turns reasoning off only on the continuation after a read-only round', async () => {
		const { bodies, observations } = await runTurn({
			continuationReasoning: 'off_after_reads'
		});
		const baseline = await runTurn();
		expect(bodies.map((body) => parse(body).reasoning)).toEqual([
			{ exclude: false }, // opening pass: unchanged
			{ enabled: false }, // after the read round
			{ exclude: true }, // after the write round: unchanged
			{ effort: 'low', exclude: true } // reviewer: unchanged
		]);
		// Only the reasoning parameter of that one pass differs.
		expect(bodies[0]).toBe(baseline.bodies[0]);
		expect({ ...parse(bodies[1]!), reasoning: null }).toEqual({
			...parse(baseline.bodies[1]!),
			reasoning: null
		});
		expect(bodies[2]).toBe(baseline.bodies[2]);
		expect(bodies[3]).toBe(baseline.bodies[3]);
		// The attempt receipt records what was asked for.
		const efforts = observations
			.filter((row) => row.eventType === 'provider_attempt_started')
			.map((row) => row.payload.reasoning_effort);
		expect(efforts).toEqual(['default', 'none', 'default', 'default']);
	});

	const off = (
		messages: readonly AgenticChatTurnProviderMessageV1[],
		overrides: Partial<AgenticChatTurnProviderClientRequestV1> = {},
		model = V41
	) => reasoningOffAfterReads('off_after_reads', request(messages, overrides), model);

	it('keeps today’s reasoning for control rounds, repairs, explicit efforts, and other models', () => {
		const control = AGENTIC_CHAT_CONTROL_TOOL_NAMES_V1[0]!;
		expect(off(AFTER_READ)).toBe(true);
		expect(
			off([
				...HISTORY,
				assistantCalls('call_c', control),
				{ role: 'tool', content: '{}', tool_call_id: 'call_c' }
			])
		).toBe(false);
		expect(off(AFTER_READ, { passRole: 'repair' })).toBe(false);
		expect(off(AFTER_READ, { reasoningEffort: 'low' })).toBe(false);
		expect(off(AFTER_READ, { providerRound: 'initial' })).toBe(false);
		expect(off(AFTER_READ, {}, 'provider/other')).toBe(false);
		// A read round from an earlier user turn does not count.
		expect(off(HISTORY)).toBe(false);
		// Mixed read + write round counts as a write round.
		expect(
			off([
				...HISTORY,
				{
					role: 'assistant',
					content: '',
					tool_calls: [
						...(assistantCalls('r', 'search_project').tool_calls ?? []),
						...(assistantCalls('w', 'update_onto_task').tool_calls ?? [])
					]
				},
				{ role: 'tool', content: '{}', tool_call_id: 'r' },
				{ role: 'tool', content: '{}', tool_call_id: 'w' }
			])
		).toBe(false);
		expect(reasoningOffAfterReads('default', request(AFTER_READ), V41)).toBe(false);
		expect(reasoningOffAfterReads('replay', request(AFTER_READ), V41)).toBe(false);
	});
});

describe('AGENTIC_CHAT_CONTINUATION_REASONING config', () => {
	const ENV: NodeJS.ProcessEnv = {
		PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
		AGENTIC_CHAT_OPENROUTER_MODEL: V41
	};
	const load = (value?: string) =>
		loadAgenticChatConfig({
			...ENV,
			...(value === undefined ? {} : { AGENTIC_CHAT_CONTINUATION_REASONING: value })
		}).continuationReasoning;

	it('defaults to default and accepts only the three modes', () => {
		expect(load()).toBe('default');
		expect(load('')).toBe('default');
		expect(load('default')).toBe('default');
		expect(load('replay')).toBe('replay');
		expect(load('off_after_reads')).toBe('off_after_reads');
		for (const invalid of ['on', 'true', 'REPLAY', 'off']) {
			expect(() => load(invalid)).toThrow(
				'AGENTIC_CHAT_CONTINUATION_REASONING must be exactly default, replay, or off_after_reads'
			);
		}
	});

	it('rejects an invalid mode at the client too', () => {
		expect(
			() =>
				new AgenticChatOpenRouterClient(
					{ usage: { observe: vi.fn() } },
					{
						routes: [route()],
						httpReferer: 'https://build-os.com',
						appName: 'BuildOS',
						fetchImpl: vi.fn() as unknown as typeof fetch,
						continuationReasoning: 'on' as AgenticChatContinuationReasoningMode
					}
				)
		).toThrow('continuation reasoning mode is invalid');
	});
});
