// apps/worker/tests/agenticChatJevToolSelector.test.ts
import type {
	AgenticChatTurnClaimResultV1,
	ChatToolDefinition,
	JsonObject,
	TurnInputArtifactV1
} from '@buildos/shared-types';
import type { UsageLogger } from '@buildos/smart-llm';
import { describe, expect, it, vi } from 'vitest';
import { ONTOLOGY_WRITE_TOOLS } from '@buildos/agentic-chat-runtime/catalog';
import type { AgenticChatExecutionObservationPortV1 } from '../src/workers/agentic-chat/effects/execution-observation';
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
	HELD_WRITES_INSTRUCTION,
	JEV_TOOL_SELECTION_ENDPOINT,
	JEV_WRITE_COMMISSION_THRESHOLD,
	JevToolSelector,
	type JevToolSelectionReceipt,
	buildJevToolSelectionBody,
	commissionedWriteToolNamesFrom,
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
				Object.entries({ current_turn_write_commission: 0, ...probabilities }).map(
					([name, noul]) => [name, { type: 'noul', noul }]
				)
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

/**
 * A skipped or failed selection keeps the request exactly as it was, plus the
 * structured outcome the turn's write-commission log reads.
 */
function expectUnchangedSurface(
	selected: AgenticChatTurnProviderRequestV1,
	original: AgenticChatTurnProviderRequestV1,
	status: 'skipped' | 'fallback'
) {
	expect(selected).toEqual({
		...original,
		toolSelectionOutcome: { status, writeCommission: null, holdEnabled: false }
	});
	expect(selected.tools).toBe(original.tools);
	expect(selected.messages).toBe(original.messages);
}

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

	// The cancel control is admitted only on a turn carrying a pending
	// commission; once admitted, Jev never scores it away.
	it('keeps an admitted cancel control whatever Jev scored the writes', () => {
		const tools = ['cancel_turn_contract', 'update_onto_document', 'web_search'].map(tool);
		const selected = selectJevToolDefinitions(tools, {
			update_onto_document: 0.01,
			web_search: 0.01
		});
		expect(selected.map((t) => t.function.name)).toEqual(['cancel_turn_contract']);
		const body = buildJevToolSelectionBody({
			messages: [{ role: 'user', content: 'Never mind those edits' }],
			tools
		} as never);
		expect(body?.state.catalog.map((entry) => entry.name)).toEqual([
			'update_onto_document',
			'web_search'
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
		expect(Object.keys(body.questions)).toEqual(['current_turn_write_commission', ...SURFACE]);
		expect(body.provider).toEqual({
			allow_fallbacks: false,
			data_collection: 'deny',
			zdr: true
		});
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
				probabilities: { current_turn_write_commission: 0, ...OVERVIEW_ONLY },
				costUsd: 0.0003
			})
		]);
	});

	it('requires both a current write commission and a relevant mutation tool', async () => {
		const surface = [...SURFACE, 'update_onto_task'].map(tool);
		const scores = {
			current_turn_write_commission: JEV_WRITE_COMMISSION_THRESHOLD,
			get_project_overview: 0.2,
			list_onto_tasks: 0.9,
			web_search: 0.97,
			list_calendar_events: 0.02,
			update_onto_task: JEV_WRITE_COMMISSION_THRESHOLD
		};
		const { instance, receipts } = selector(
			vi.fn(async () => jevResponse(scores)) as unknown as typeof fetch
		);

		const selected = await instance.select(request({ tools: surface }));

		// A read scoring 0.97 is relevance, not a commission; only admitted
		// mutation tools count, and the message text is never consulted.
		expect(selected.commissionedWriteToolNames).toEqual(['update_onto_task']);
		expect(receipts[0]?.commissionedWriteToolNames).toEqual(['update_onto_task']);
		const readiness = selector(
			vi.fn(async () =>
				jevResponse({
					...scores,
					current_turn_write_commission: 0.1,
					update_onto_task: 0.99
				})
			) as unknown as typeof fetch
		);
		const readOnly = await readiness.instance.select(request({ tools: surface }));
		expect(readOnly.commissionedWriteToolNames).toBeUndefined();
		expect(readOnly.tools.some((tool) => tool.function.name === 'update_onto_task')).toBe(true);

		const below = selector(
			vi.fn(async () =>
				jevResponse({ ...scores, update_onto_task: JEV_WRITE_COMMISSION_THRESHOLD - 0.01 })
			) as unknown as typeof fetch
		);
		const unselected = await below.instance.select(request({ tools: surface }));
		expect(unselected.commissionedWriteToolNames).toBeUndefined();
		expect(
			commissionedWriteToolNamesFrom(surface, {
				current_turn_write_commission: 0.8,
				update_onto_task: 0.8,
				web_search: 0.99
			})
		).toEqual(['update_onto_task']);
	});

	it('skips gate passes without calling Jev', async () => {
		const fetchImpl = vi.fn();
		const { instance, receipts } = selector(fetchImpl as unknown as typeof fetch);
		const original = request({ toolChoice: 'required' });

		expectUnchangedSurface(await instance.select(original), original, 'skipped');
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

		expectUnchangedSurface(await instance.select(original), original, 'fallback');
		expect(receipts[0]).toMatchObject({ status: 'fallback', reason });
	});

	it('keeps the full surface when Jev is slower than its deadline', async () => {
		const fetchImpl = vi.fn(
			(_url: string, init: NonNullable<Parameters<typeof fetch>[1]>) =>
				new Promise<Response>((_, reject) =>
					init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
				)
		);
		const { instance, receipts } = selector(fetchImpl as unknown as typeof fetch, {
			timeoutMs: 120
		});
		const original = request();

		expectUnchangedSurface(await instance.select(original), original, 'fallback');
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
					probabilities: { current_turn_write_commission: 0, ...OVERVIEW_ONLY }
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

describe('AGENTIC_CHAT_HOLD_UNCOMMISSIONED_WRITES', () => {
	const env = {
		PRIVATE_OPENROUTER_API_KEY: 'provider-secret',
		AGENTIC_CHAT_OPENROUTER_MODEL: 'deepseek/deepseek-v4-flash'
	};

	it('defaults off and accepts exactly true or false', () => {
		expect(loadAgenticChatConfig(env).holdUncommissionedWrites).toBe(false);
		expect(
			loadAgenticChatConfig({ ...env, AGENTIC_CHAT_HOLD_UNCOMMISSIONED_WRITES: 'true' })
				.holdUncommissionedWrites
		).toBe(true);
		expect(
			loadAgenticChatConfig({ ...env, AGENTIC_CHAT_HOLD_UNCOMMISSIONED_WRITES: 'false' })
				.holdUncommissionedWrites
		).toBe(false);
		expect(() =>
			loadAgenticChatConfig({ ...env, AGENTIC_CHAT_HOLD_UNCOMMISSIONED_WRITES: 'on' })
		).toThrow('AGENTIC_CHAT_HOLD_UNCOMMISSIONED_WRITES must be exactly true or false');
	});
});

describe('Jev selection inside a turn', () => {
	function readDefinition(name: string): ChatToolDefinition {
		return tool(name) as unknown as ChatToolDefinition;
	}

	function executionInput(
		definitions: ChatToolDefinition[] = SURFACE.map(readDefinition),
		promptSections: JsonObject[] = []
	): AgenticChatWorkerExecutionInputV1 {
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
				promptSections,
				toolSurface: {
					surfaceProfile: 'project_default',
					toolNames: definitions.map((definition) => definition.function.name),
					definitions
				}
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
	// Pipeline audit 2026-10-17 (S5 cause a + Q1): the write hold, the
	// commission shadow log, and the Rules for This Turn playbook pick all read
	// Jev's structured answers. No message text is classified anywhere here.
	describe('write commission on the worker lane', () => {
		const TASK_ID = '41000000-0000-4000-8000-000000000041';
		const WRITE_NAMES = ['update_onto_task', 'create_onto_task'];

		function writeDefinition(name: string): ChatToolDefinition {
			return ONTOLOGY_WRITE_TOOLS.find(
				(definition) => definition.function.name === name
			)! as unknown as ChatToolDefinition;
		}

		function writeInput(promptSections: JsonObject[] = []) {
			return executionInput(
				[...SURFACE.map(readDefinition), ...WRITE_NAMES.map(writeDefinition)],
				promptSections
			);
		}

		const READ_TURN = {
			current_turn_write_commission: 0.1,
			...OVERVIEW_ONLY,
			// Relevance is not a commission: the task tools look relevant to a
			// status question, but nothing was asked to change.
			update_onto_task: 0.9,
			create_onto_task: 0.05
		};
		const CREATE_TURN = {
			...READ_TURN,
			current_turn_write_commission: 0.86,
			update_onto_task: 0.1,
			create_onto_task: 0.92
		};

		function observations() {
			return {
				observe: vi.fn<AgenticChatExecutionObservationPortV1['observe']>(
					async () => undefined
				)
			};
		}

		function commissionReceipt(port: ReturnType<typeof observations>) {
			const receipts = port.observe.mock.calls
				.map(([input]) => input)
				.filter((input) => input.eventType === 'provider_commission_observed');
			expect(receipts).toHaveLength(1);
			expect(receipts[0]!.phase).toBe('provider');
			return receipts[0]!.payload;
		}

		function writeAdapter(
			client: AgenticChatTurnProviderClientPortV1,
			scores: Record<string, number> | 'unavailable',
			options: {
				hold?: boolean;
				port?: ReturnType<typeof observations>;
			} = {}
		) {
			return new AgenticChatTurnProviderAdapter(
				{
					client,
					capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 }),
					toolSelector: new JevToolSelector({
						apiKey: 'provider-secret',
						mode: 'on',
						holdUncommissionedWrites: options.hold,
						fetchImpl: vi.fn(async () => {
							if (scores === 'unavailable') throw new TypeError('fetch failed');
							return jevResponse(scores);
						}) as unknown as typeof fetch
					}),
					executionObservations: options.port
				},
				2_000,
				16,
				{ updateOntoTask: true, createOntoTask: true }
			);
		}

		function answer(text: string): AgenticChatTurnProviderClientEventV1[] {
			return [
				{ type: 'text', content: text },
				{ type: 'done', finishedReason: 'stop' }
			];
		}

		async function run(
			scores: Record<string, number> | 'unavailable',
			rounds: AgenticChatTurnProviderClientEventV1[][],
			options: { hold?: boolean; promptSections?: JsonObject[] } = {}
		) {
			const client = clientWithRounds(rounds);
			const port = observations();
			const invocation = await writeAdapter(client, scores, {
				hold: options.hold,
				port
			}).prepare({
				executionInput: writeInput(options.promptSections),
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			});
			const steps = await collect(invocation.stream());
			return { client, port, steps };
		}

		it('with the hold on, offers no write schema on a turn Jev scores as uncommissioned, on any pass', async () => {
			const { client, port, steps } = await run(
				READ_TURN,
				[
					// The model reaches for the held write anyway.
					readRound('write-1', 'update_onto_task', {
						task_id: TASK_ID,
						state_key: 'done'
					}),
					answer('Nothing has changed yet. Want me to mark it done?')
				],
				{ hold: true }
			);

			expect(names(client.stream.mock.calls[0])).toEqual(['get_project_overview']);
			const opening = client.stream.mock.calls[0]![0];
			expect(opening.messages.at(-1)?.content).toContain(HELD_WRITES_INSTRUCTION);
			// The one surface repair restores the admitted surface minus the held writes.
			expect(names(client.stream.mock.calls[1])).toEqual(SURFACE);
			expect(steps.some((step) => step.type === 'mutating_tool')).toBe(false);
			expect(commissionReceipt(port)).toMatchObject({
				jev_status: 'selected',
				jev_write_commission: 0.1,
				jev_commissioned_write_tools: [],
				// The model reached for a held write: exactly the miss the log measures.
				proposed_write_tools: ['update_onto_task'],
				proposed_write_call_count: 1,
				writes_held: true,
				hold_enabled: true,
				awaiting_user_card: false,
				review_outcomes: [],
				turn_rules_playbook: null,
				finished_reason: 'stop'
			});
		});

		it('keeps the writes Jev commissions when the hold is on', async () => {
			const { client, port } = await run(
				CREATE_TURN,
				[answer('Which title?'), answer('Which title?'), answer('Which title?')],
				{ hold: true }
			);
			expect(names(client.stream.mock.calls[0])).toContain('create_onto_task');
			expect(
				client.stream.mock.calls[0]![0].messages.map((message) => message.content).join(
					'\n'
				)
			).not.toContain(HELD_WRITES_INSTRUCTION);
			expect(commissionReceipt(port)).toMatchObject({
				jev_write_commission: 0.86,
				jev_commissioned_write_tools: ['create_onto_task'],
				writes_held: false,
				hold_enabled: true
			});
		});

		it('is off by default and still writes the shadow receipt', async () => {
			const { client, port } = await run(READ_TURN, [answer('Two tasks are open.')]);
			// Today's behavior: a relevant write schema rides along unheld.
			expect(names(client.stream.mock.calls[0])).toEqual([
				'get_project_overview',
				'list_onto_tasks',
				'update_onto_task'
			]);
			expect(commissionReceipt(port)).toMatchObject({
				jev_status: 'selected',
				jev_write_commission: 0.1,
				proposed_write_tools: [],
				proposed_write_call_count: 0,
				writes_held: false,
				hold_enabled: false
			});
		});

		it('fails open when Jev is unavailable: the full surface, nothing held', async () => {
			const { client, port } = await run('unavailable', [answer('Answer.')], { hold: true });
			expect(names(client.stream.mock.calls[0])).toEqual([...SURFACE, ...WRITE_NAMES]);
			expect(commissionReceipt(port)).toMatchObject({
				jev_status: 'fallback',
				jev_write_commission: null,
				writes_held: false,
				hold_enabled: true
			});
		});

		it('writes the receipt once, when the turn finishes, never mid-turn', async () => {
			const { port } = await run(READ_TURN, [
				readRound('write-1', 'update_onto_task', { task_id: TASK_ID, state_key: 'done' })
			]);
			// The stream stops at the proposed write, which the executor runs (or
			// review holds) before the next pass; no receipt exists yet.
			expect(
				port.observe.mock.calls.filter(
					([input]) => input.eventType === 'provider_commission_observed'
				)
			).toHaveLength(0);
		});

		const RULES_SECTION: JsonObject = {
			id: 'situational_rules',
			title: 'Rules for This Turn',
			content: 'Playbook the user chose for this chat (Cold email):\n- Keep it short.',
			slots: { placement: 'after_user_message', preloadedSkillId: 'cold_email' }
		};
		const TASK_CANDIDATE: JsonObject = {
			id: 'operational_playbook_candidate',
			title: 'Rules for This Turn',
			content: 'Playbook for task writes this turn:\n\nWorkflow:\n- Read before you write.',
			slots: {
				skillId: 'task_management',
				entityKind: 'task',
				examples: {
					update: '- Update an existing task by its exact id',
					create: '- Create a task for a real follow-up'
				}
			}
		};

		it("appends the admission rules and the playbook Jev's commission picks after the user message", async () => {
			const { client, port } = await run(
				CREATE_TURN,
				[answer('Which title?'), answer('Which title?'), answer('Which title?')],
				{ promptSections: [RULES_SECTION, TASK_CANDIDATE] }
			);
			const { messages } = client.stream.mock.calls[0]![0];
			expect(messages[0]).toEqual({ role: 'system', content: 'System prompt\n' });
			const userIndex = messages.findIndex((message) => message.role === 'user');
			const rulesIndex = messages.findIndex(
				(message) =>
					typeof message.content === 'string' &&
					message.content.startsWith('## Rules for This Turn')
			);
			expect(rulesIndex).toBeGreaterThan(userIndex);
			const rules = String(messages[rulesIndex]!.content);
			expect(rules.indexOf('Playbook the user chose for this chat')).toBeLessThan(
				rules.indexOf('Playbook for task writes this turn:')
			);
			expect(rules).toContain('Worked example:\n- Create a task for a real follow-up');
			expect(rules).not.toContain('- Update an existing task by its exact id');
			expect(commissionReceipt(port)).toMatchObject({
				turn_rules_playbook: 'task_management'
			});
		});

		it('appends no write playbook when Jev scores no commission', async () => {
			const { client, port } = await run(READ_TURN, [answer('Two tasks are open.')], {
				promptSections: [RULES_SECTION, TASK_CANDIDATE]
			});
			const rules = client.stream.mock.calls[0]![0].messages.map((message) =>
				String(message.content)
			).find((content) => content.startsWith('## Rules for This Turn'));
			expect(rules).toContain('Playbook the user chose for this chat');
			expect(rules).not.toContain('Playbook for task writes this turn:');
			expect(commissionReceipt(port)).toMatchObject({ turn_rules_playbook: null });
		});
	});
});
