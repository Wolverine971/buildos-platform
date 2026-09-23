// apps/worker/tests/agenticChatJevToolSelector.test.ts
import type {
	AgenticChatTurnClaimResultV1,
	ChatToolDefinition,
	JsonObject,
	TurnInputArtifactV1
} from '@buildos/shared-types';
import type { UsageLogger } from '@buildos/smart-llm';
import { describe, expect, it, vi } from 'vitest';
import { loadAgenticChatConfig } from '../src/workers/agentic-chat/host/config';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/turn/execution-input';
import type {
	AgenticChatProviderStepV1,
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1,
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../src/workers/agentic-chat/provider/contracts';
import {
	JEV_TOOL_SELECTION_ENDPOINT,
	JevToolSelector,
	type JevToolSelectionReceipt,
	buildJevToolSelectionBody,
	selectJevToolDefinitions
} from '../src/workers/agentic-chat/provider/jev-tool-selector';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/provider/provider-capacity';
import { AgenticChatTurnProviderAdapter } from '../src/workers/agentic-chat/provider/turn-provider';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const PROCESSING_TOKEN = '90000000-0000-4000-8000-000000000009';
const SURFACE = ['get_project_overview', 'list_onto_tasks', 'web_search', 'list_calendar_events'];

function tool(name: string): AgenticChatTurnProviderToolV1 {
	return {
		type: 'function',
		function: {
			name,
			description: `Read with ${name}.`,
			parameters: { type: 'object', properties: { marker: { type: 'string' } } }
		}
	};
}

function request(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [
			{ role: 'system', content: 'Private system prompt' },
			{ role: 'assistant', content: 'Earlier reply' },
			{ role: 'user', content: 'Where are we on this project?' }
		],
		tools: SURFACE.map(tool),
		toolChoice: 'auto',
		userId: USER_ID,
		sessionId: SESSION_ID,
		turnRunId: TURN_RUN_ID,
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		contextType: 'project',
		entityId: 'project-1',
		projectId: 'project-1',
		queueJobId: 'queue-job-1',
		processingToken: PROCESSING_TOKEN,
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		signal: new AbortController().signal,
		...overrides
	};
}

function jevResponse(probabilities: Record<string, number>, status = 200) {
	return new Response(
		JSON.stringify({
			id: 'gen-dec-1',
			model: 'typesafe/jev-1.13-20260917',
			answers: Object.fromEntries(
				Object.entries(probabilities).map(([name, noul]) => [name, { type: 'noul', noul }])
			),
			usage: { input_tokens: 1_200, output_tokens: 40, cost: 0.0003 }
		}),
		{ status, headers: { 'Content-Type': 'application/json' } }
	);
}

const OVERVIEW_ONLY = {
	get_project_overview: 0.93,
	list_onto_tasks: 0.12,
	web_search: 0.04,
	list_calendar_events: 0.02
};

function selector(
	fetchImpl: typeof fetch,
	options: Partial<ConstructorParameters<typeof JevToolSelector>[0]> = {}
) {
	const receipts: JevToolSelectionReceipt[] = [];
	const instance = new JevToolSelector({
		apiKey: 'provider-secret',
		mode: 'on',
		fetchImpl,
		onReceipt: (receipt) => receipts.push(structuredClone(receipt)),
		...options
	});
	return { instance, receipts };
}

describe('selectJevToolDefinitions', () => {
	it('keeps controls, adds deterministic supporting reads, and preserves canonical order', () => {
		const tools = [
			'request_turn_clarification',
			'list_onto_tasks',
			'get_onto_task_details',
			'update_onto_task',
			'web_search',
			'web_visit',
			'create_calendar_event'
		].map(tool);
		const selected = selectJevToolDefinitions(tools, {
			list_onto_tasks: 0.1,
			get_onto_task_details: 0.1,
			update_onto_task: 0.8,
			web_search: 0.29,
			web_visit: 0.3,
			create_calendar_event: 0.01
		});
		expect(selected.map((t) => t.function.name)).toEqual([
			'request_turn_clarification',
			'list_onto_tasks',
			'get_onto_task_details',
			'update_onto_task',
			'web_visit'
		]);
	});

	// A project image attached to this message may need naming or filing. The
	// pin is a structured turn fact (attachment kind), never message text.
	it('keeps a pinned image tool and its document reads whatever Jev scored them', () => {
		const tools = [
			'request_turn_clarification',
			'list_onto_documents',
			'search_onto_documents',
			'search_onto_assets',
			'update_onto_asset',
			'web_search'
		].map(tool);
		const probabilities = {
			list_onto_documents: 0.01,
			search_onto_documents: 0.01,
			search_onto_assets: 0.01,
			update_onto_asset: 0.02,
			web_search: 0.01
		};
		expect(selectJevToolDefinitions(tools, probabilities).map((t) => t.function.name)).toEqual([
			'request_turn_clarification'
		]);
		expect(
			selectJevToolDefinitions(tools, probabilities, 0.3, [
				'update_onto_asset',
				'not_mounted_tool'
			]).map((t) => t.function.name)
		).toEqual([
			'request_turn_clarification',
			'list_onto_documents',
			'search_onto_documents',
			'search_onto_assets',
			'update_onto_asset'
		]);
	});
});

describe('buildJevToolSelectionBody', () => {
	it('sends the user turn and recent conversation, never the system prompt', () => {
		const body = buildJevToolSelectionBody(request())!;
		expect(body.state.current_request).toBe('Where are we on this project?');
		expect(body.state.recent_conversation).toEqual([
			{ role: 'assistant', content: 'Earlier reply' }
		]);
		expect(JSON.stringify(body)).not.toContain('Private system prompt');
		expect(Object.keys(body.questions)).toEqual(SURFACE);
		expect(body.provider).toEqual({ allow_fallbacks: false, data_collection: 'deny' });
	});
});

describe('JevToolSelector', () => {
	it('keeps a request-pinned schema through classification', async () => {
		const fetchImpl = vi.fn(async () => jevResponse(OVERVIEW_ONLY));
		const { instance } = selector(fetchImpl as unknown as typeof fetch);

		const selected = await instance.select(
			request({ toolSelectionPins: ['list_calendar_events'] })
		);

		expect(selected.tools.map((t) => t.function.name)).toEqual([
			'get_project_overview',
			'list_calendar_events'
		]);
	});

	it('narrows the schemas and names the callable set for the model', async () => {
		const fetchImpl = vi.fn(async () => jevResponse(OVERVIEW_ONLY));
		const { instance, receipts } = selector(fetchImpl as unknown as typeof fetch);

		const selected = await instance.select(request());

		expect(fetchImpl).toHaveBeenCalledWith(
			JEV_TOOL_SELECTION_ENDPOINT,
			expect.objectContaining({ method: 'POST', redirect: 'error' })
		);
		expect(selected.tools.map((t) => t.function.name)).toEqual(['get_project_overview']);
		expect(selected.toolChoice).toBe('auto');
		expect(selected.messages.at(-1)).toEqual({
			role: 'system',
			content: expect.stringContaining(
				'callable schemas for this pass are get_project_overview.'
			)
		});
		expect(receipts).toEqual([
			expect.objectContaining({
				mode: 'on',
				status: 'selected',
				reason: 'classified',
				threshold: 0.3,
				selectedToolNames: ['get_project_overview'],
				probabilities: OVERVIEW_ONLY,
				costUsd: 0.0003
			})
		]);
	});

	it('skips gate passes without calling Jev', async () => {
		const fetchImpl = vi.fn();
		const { instance, receipts } = selector(fetchImpl as unknown as typeof fetch);
		const original = request({ toolChoice: 'required' });

		await expect(instance.select(original)).resolves.toBe(original);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(receipts[0]).toMatchObject({ status: 'skipped', reason: 'ineligible_surface' });
	});

	it.each([
		['an HTTP error', async () => jevResponse(OVERVIEW_ONLY, 503), 'jev_http_503'],
		[
			'a partial answer set',
			async () => jevResponse({ get_project_overview: 0.9 }),
			'jev_answer_set'
		],
		[
			'an out-of-range answer',
			async () => jevResponse({ ...OVERVIEW_ONLY, web_search: 1.2 }),
			'jev_invalid_answer'
		]
	])('keeps the full surface on %s', async (_label, respond, reason) => {
		const { instance, receipts } = selector(vi.fn(respond) as unknown as typeof fetch);
		const original = request();

		await expect(instance.select(original)).resolves.toBe(original);
		expect(receipts[0]).toMatchObject({ status: 'fallback', reason });
	});

	it('keeps the full surface when Jev is slower than its deadline', async () => {
		const fetchImpl = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_, reject) =>
					init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
				)
		);
		const { instance, receipts } = selector(fetchImpl as unknown as typeof fetch, {
			timeoutMs: 120
		});
		const original = request();

		await expect(instance.select(original)).resolves.toBe(original);
		expect(receipts[0]).toMatchObject({ status: 'fallback', reason: 'jev_selection_timeout' });
	});

	it('never waits on the usage-log write', async () => {
		const logUsageToDatabase = vi.fn(() => new Promise<void>(() => undefined));
		const { instance } = selector(
			vi.fn(async () => jevResponse(OVERVIEW_ONLY)) as unknown as typeof fetch,
			{ usage: { logUsageToDatabase } satisfies UsageLogger }
		);

		const selected = await instance.select(request());

		expect(selected.tools).toHaveLength(1);
		expect(logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				operationType: 'agentic_chat_tool_selection',
				modelUsed: 'typesafe/jev-1.13-20260917',
				totalCost: 0.0003,
				turnRunId: TURN_RUN_ID,
				metadata: expect.objectContaining({
					passRole: 'tool_selection',
					probabilities: OVERVIEW_ONLY
				})
			}),
			expect.any(AbortSignal)
		);
	});

	it('shadow mode returns the untouched request and classifies in the background', async () => {
		let respond!: (response: Response) => void;
		const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => (respond = resolve)));
		const { instance, receipts } = selector(fetchImpl as unknown as typeof fetch, {
			mode: 'shadow'
		});
		const original = request();

		await expect(instance.select(original)).resolves.toBe(original);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(receipts).toEqual([]);

		respond(jevResponse(OVERVIEW_ONLY));
		await vi.waitFor(() => expect(receipts).toHaveLength(1));
		expect(receipts[0]).toMatchObject({
			mode: 'shadow',
			status: 'selected',
			selectedToolNames: ['get_project_overview']
		});
	});
});

describe('AGENTIC_CHAT_JEV_TOOL_SELECTION', () => {
	const env = {
		PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
		AGENTIC_CHAT_OPENROUTER_MODEL: 'deepseek/deepseek-v4-flash'
	};

	it('defaults on and accepts shadow and the off kill switch', () => {
		expect(loadAgenticChatConfig(env).jevToolSelection).toBe('on');
		for (const mode of ['off', 'shadow', 'on'] as const) {
			expect(
				loadAgenticChatConfig({ ...env, AGENTIC_CHAT_JEV_TOOL_SELECTION: mode })
					.jevToolSelection
			).toBe(mode);
		}
	});

	it('rejects anything else at startup', () => {
		expect(() =>
			loadAgenticChatConfig({ ...env, AGENTIC_CHAT_JEV_TOOL_SELECTION: 'true' })
		).toThrow('AGENTIC_CHAT_JEV_TOOL_SELECTION must be exactly off, shadow, or on');
	});
});

describe('Jev selection inside a turn', () => {
	function readDefinition(name: string): ChatToolDefinition {
		return tool(name) as unknown as ChatToolDefinition;
	}

	function executionInput(): AgenticChatWorkerExecutionInputV1 {
		const claim = {
			outcome: 'claimed',
			executionMayStart: true,
			turnRunId: TURN_RUN_ID,
			queueJobId: '40000000-0000-4000-8000-000000000004',
			sessionId: SESSION_ID,
			userId: USER_ID,
			correlationId: '50000000-0000-4000-8000-000000000005',
			executionGeneration: 1,
			status: 'running',
			inputArtifactId: '60000000-0000-4000-8000-000000000006',
			userMessageId: '70000000-0000-4000-8000-000000000007'
		} satisfies Extract<
			AgenticChatTurnClaimResultV1,
			{ outcome: 'claimed' | 'matching_current_claim' }
		>;
		const definitions = SURFACE.map(readDefinition);
		const artifact = {
			artifactVersion: 'agentic_chat_input_v2',
			historySource: 'admission_window',
			history: [],
			prepared: {
				sourcePreparedPromptId: null,
				contextPayload: {},
				conversationSummary: null,
				surfaceProfile: 'project_default',
				systemPrompt: 'System prompt\n',
				promptSections: [],
				toolSurface: { surfaceProfile: 'project_default', toolNames: SURFACE, definitions }
			},
			createdAt: '2026-08-03T12:00:00.000Z',
			retainUntil: '2026-08-10T12:00:00.000Z',
			contentHash: '0'.repeat(64)
		} satisfies TurnInputArtifactV1;
		return {
			claim,
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			requestPayload: {
				clientTurnId: 'client-turn-1',
				streamRunId: 'stream-run-1',
				message: 'Where are we on this project?',
				attachments: [],
				context: { type: 'project', entityId: 'project-1', projectId: 'project-1' }
			},
			timingBaseline: {
				admittedAt: '2026-08-03T11:59:57.000Z',
				startedAt: '2026-08-03T11:59:58.000Z',
				workerStartedAt: '2026-08-03T11:59:59.000Z',
				executionStartedAt: null,
				historyCutoffAt: '2026-08-03T11:59:58.000Z',
				requestPrewarmedContext: false,
				cacheSource: 'not_requested',
				cacheAgeSeconds: null,
				historyStrategy: 'raw_history',
				historyCompressed: false,
				rawHistoryCount: 0,
				historyForModelCount: 0,
				preparedPromptId: null,
				preparedPromptHit: false,
				preparedPromptMissReason: null,
				preparedSurfaceProfile: null
			},
			artifact
		};
	}

	function clientWithRounds(rounds: AgenticChatTurnProviderClientEventV1[][]) {
		return {
			stream: vi.fn<AgenticChatTurnProviderClientPortV1['stream']>(() => {
				const events = rounds.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
	}

	function readRound(id: string, name: string, args: JsonObject = {}) {
		return [
			{
				type: 'tool_call',
				toolCall: [
					{
						index: 0,
						id,
						type: 'function',
						function: { name, arguments: JSON.stringify(args) }
					}
				]
			},
			{ type: 'done', finishedReason: 'tool_calls' }
		] satisfies AgenticChatTurnProviderClientEventV1[];
	}

	async function collect(stream: AsyncIterable<AgenticChatProviderStepV1>) {
		const steps: AgenticChatProviderStepV1[] = [];
		for await (const step of stream) steps.push(step);
		return steps;
	}

	function adapter(
		client: AgenticChatTurnProviderClientPortV1,
		fetchImpl: typeof fetch
	): AgenticChatTurnProviderAdapter {
		return new AgenticChatTurnProviderAdapter({
			client,
			capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 }),
			toolSelector: new JevToolSelector({ apiKey: 'provider-secret', mode: 'on', fetchImpl })
		});
	}

	const names = (call: [{ tools: readonly AgenticChatTurnProviderToolV1[] }] | undefined) =>
		call?.[0].tools.map((t) => t.function.name);

	it('sends the narrowed surface on the opening pass and keeps it for the continuation', async () => {
		const client = clientWithRounds([
			readRound('read-1', 'get_project_overview', { project_id: 'project-1' }),
			[
				{ type: 'text', content: 'Two tasks are blocked.' },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);
		const invocation = await adapter(
			client,
			vi.fn(async () => jevResponse(OVERVIEW_ONLY)) as unknown as typeof fetch
		).prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await collect(invocation.stream());
		await collect(
			invocation.continueWithToolResults!({
				round: 2,
				results: [
					{
						providerToolCallId: 'read-1',
						toolName: 'get_project_overview',
						arguments: { project_id: 'project-1' },
						execution: {
							result: { ok: true },
							executionTimeMs: 1,
							tokensConsumed: null,
							affectedEntities: [],
							toolCategory: 'utility',
							resultCount: 1,
							zeroResult: false,
							requiresUserAction: false
						}
					}
				]
			})
		);

		expect(client.stream).toHaveBeenCalledTimes(2);
		expect(names(client.stream.mock.calls[0])).toEqual(['get_project_overview']);
		expect(names(client.stream.mock.calls[1])).toEqual(['get_project_overview']);
	});

	it('restores the admitted surface once when the model reaches for an omitted tool', async () => {
		const client = clientWithRounds([
			readRound('read-1', 'list_onto_tasks'),
			[
				{ type: 'text', content: 'Here is where things stand.' },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);
		const invocation = await adapter(
			client,
			vi.fn(async () => jevResponse(OVERVIEW_ONLY)) as unknown as typeof fetch
		).prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await collect(invocation.stream());

		expect(names(client.stream.mock.calls[0])).toEqual(['get_project_overview']);
		expect(names(client.stream.mock.calls[1])).toEqual(SURFACE);
	});

	it('keeps the full surface when Jev is unavailable', async () => {
		const client = clientWithRounds([
			[
				{ type: 'text', content: 'Answer.' },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);
		const invocation = await adapter(
			client,
			vi.fn(async () => {
				throw new TypeError('fetch failed');
			}) as unknown as typeof fetch
		).prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await collect(invocation.stream());

		expect(names(client.stream.mock.calls[0])).toEqual(SURFACE);
	});
});
