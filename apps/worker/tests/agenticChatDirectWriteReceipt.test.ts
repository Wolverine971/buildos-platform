// apps/worker/tests/agenticChatDirectWriteReceipt.test.ts
//
// AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT: after a simple direct write fully
// lands, the turn closes on ledger receipt text instead of a tool-free model
// pass. Also covers starting a provider pass before its status step is
// persisted (context finder and reviewer lanes).
import { ONTOLOGY_WRITE_TOOLS } from '@buildos/agentic-chat-runtime/catalog';
import type { FastToolExecution, WriteLedgerEntry } from '@buildos/agentic-chat-runtime/loop';
import type {
	AgenticChatTurnClaimResultV1,
	ChatToolDefinition,
	JsonObject,
	TurnInputArtifactV1
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { createAgenticChatCompositionRoot } from '../src/workers/agentic-chat/host/composition-root';
import type {
	AgenticChatPreparedProviderInvocationV1,
	AgenticChatProviderFailedToolSynthesisInputV1,
	AgenticChatProviderMutationSynthesisInputV1,
	AgenticChatProviderPortV1,
	AgenticChatProviderReadSynthesisInputV1,
	AgenticChatProviderStepV1,
	AgenticChatProviderUsageV1,
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1
} from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/provider/provider-capacity';
import { renderDirectWriteReceipt } from '../src/workers/agentic-chat/provider/repair-policy';
import { AgenticChatTurnProviderAdapter } from '../src/workers/agentic-chat/provider/turn-provider';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/turn/execution-input';
import { enforceAgenticChatTerminalTextIntegrityV1 } from '../src/workers/agentic-chat/turn/terminal-text-integrity';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const PROCESSING_TOKEN = '90000000-0000-4000-8000-000000000009';
const PROJECT_ID = 'project-1';
const ROUND_USAGE: AgenticChatProviderUsageV1 = {
	promptTokens: 100,
	completionTokens: 20,
	totalTokens: 120
};
const SYNTHESIS_USAGE = { promptTokens: 50, completionTokens: 10, totalTokens: 60 };

type MutatingStep = Extract<AgenticChatProviderStepV1, { type: 'mutating_tool' }>;
type ReadStep = Extract<AgenticChatProviderStepV1, { type: 'read_tool' }>;
type ClientPort = {
	stream: ReturnType<typeof vi.fn<AgenticChatTurnProviderClientPortV1['stream']>>;
};

function controlDefinition(name: string, required: string[]): ChatToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description: `Control ${name}.`,
			parameters: {
				type: 'object',
				required,
				properties: Object.fromEntries(required.map((field) => [field, { type: 'string' }]))
			}
		}
	};
}

function readDefinition(name: string): ChatToolDefinition {
	return {
		type: 'function',
		function: {
			name,
			description: `Read with ${name}.`,
			parameters: { type: 'object', properties: { marker: { type: 'string' } } }
		}
	};
}

function writeDefinition(name: string): ChatToolDefinition {
	const definition = ONTOLOGY_WRITE_TOOLS.find((tool) => tool.function.name === name);
	if (!definition) throw new Error(`Missing write tool ${name}`);
	return definition as ChatToolDefinition;
}

const SURFACE: ChatToolDefinition[] = [
	controlDefinition('declare_read_only_turn', ['reason']),
	controlDefinition('request_turn_clarification', ['reason', 'question']),
	readDefinition('get_project_overview'),
	writeDefinition('create_onto_task'),
	writeDefinition('create_onto_goal'),
	writeDefinition('link_onto_entities')
];

function executionInput(): AgenticChatWorkerExecutionInputV1 {
	const claim = {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: '40000000-0000-4000-8000-000000000004',
		sessionId: '20000000-0000-4000-8000-000000000002',
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
			promptSections: [],
			toolSurface: {
				surfaceProfile: 'project_default',
				toolNames: SURFACE.map((definition) => definition.function.name),
				definitions: SURFACE
			}
		},
		createdAt: '2026-09-23T12:00:00.000Z',
		retainUntil: '2026-09-30T12:00:00.000Z',
		contentHash: '0'.repeat(64)
	} satisfies TurnInputArtifactV1;
	return {
		claim,
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		requestPayload: {
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			message: 'Add the tasks.',
			attachments: [],
			context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
		},
		timingBaseline: {
			admittedAt: '2026-09-23T11:59:57.000Z',
			startedAt: '2026-09-23T11:59:58.000Z',
			workerStartedAt: '2026-09-23T11:59:59.000Z',
			executionStartedAt: null,
			historyCutoffAt: '2026-09-23T11:59:58.000Z',
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

function clientWithRounds(rounds: AgenticChatTurnProviderClientEventV1[][]): ClientPort {
	return {
		stream: vi.fn<AgenticChatTurnProviderClientPortV1['stream']>(() => {
			const events = rounds.shift() ?? [];
			return (async function* () {
				for (const event of events) yield event;
			})();
		})
	};
}

function toolRound(
	calls: Array<{ id: string; name: string; args: JsonObject }>,
	usage: AgenticChatProviderUsageV1 = ROUND_USAGE
): AgenticChatTurnProviderClientEventV1[] {
	return [
		{
			type: 'tool_call',
			toolCall: calls.map((call, index) => ({
				index,
				id: call.id,
				type: 'function',
				function: { name: call.name, arguments: JSON.stringify(call.args) }
			}))
		},
		{ type: 'done', finishedReason: 'tool_calls', usage }
	];
}

function synthesisRound(text: string): AgenticChatTurnProviderClientEventV1[] {
	return [
		{ type: 'text', content: text },
		{ type: 'done', finishedReason: 'stop', usage: SYNTHESIS_USAGE }
	];
}

function createTask(id: string, title: string) {
	return { id, name: 'create_onto_task', args: { project_id: PROJECT_ID, title } };
}

function succeeded(step: MutatingStep, result: JsonObject, requiresUserAction = false) {
	return {
		providerToolCallId: step.providerToolCallId,
		toolName: step.toolName,
		arguments: step.arguments,
		execution: {
			result,
			executionTimeMs: null,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'ontology_action',
			resultCount: null,
			zeroResult: null,
			requiresUserAction
		},
		mutation: {
			effectId: 'a3000000-0000-4000-8000-00000000003a',
			logicalOperationId: step.logicalOperationId,
			operationName: step.operationName,
			replayed: false
		}
	} satisfies AgenticChatProviderMutationSynthesisInputV1;
}

function failed(step: MutatingStep, error: string): AgenticChatProviderFailedToolSynthesisInputV1 {
	return {
		providerToolCallId: step.providerToolCallId,
		toolName: step.toolName,
		arguments: step.arguments,
		failure: {
			kind: 'known_execution_failure',
			error,
			toolCategory: 'ontology_action',
			modelPayload: { tool_call_id: step.providerToolCallId, success: false, error }
		}
	};
}

function readResult(step: ReadStep, result: JsonObject): AgenticChatProviderReadSynthesisInputV1 {
	return {
		providerToolCallId: step.providerToolCallId,
		toolName: step.toolName,
		arguments: step.arguments,
		execution: {
			result,
			executionTimeMs: 1,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'utility',
			resultCount: 1,
			zeroResult: false,
			requiresUserAction: false
		}
	};
}

/** Task results named by the step's own title, as the gateway receipt returns them. */
function taskResults(steps: AgenticChatProviderStepV1[]) {
	return mutatingSteps(steps).map((step, index) =>
		succeeded(step, {
			task: {
				id: `a0000000-0000-4000-8000-00000000000${index + 1}`,
				title: step.arguments.title!
			}
		})
	);
}

function mutatingSteps(steps: AgenticChatProviderStepV1[]): MutatingStep[] {
	return steps.filter((step): step is MutatingStep => step.type === 'mutating_tool');
}

/** A request as sent, minus its per-run abort signal. */
function withoutSignal(request: object) {
	return { ...request, signal: null };
}

async function collect(stream: AsyncIterable<AgenticChatProviderStepV1>) {
	const result: AgenticChatProviderStepV1[] = [];
	for await (const step of stream) result.push(step);
	return result;
}

function prepare(
	port: AgenticChatProviderPortV1,
	input = executionInput()
): Promise<AgenticChatPreparedProviderInvocationV1> {
	return port.prepare!({
		executionInput: input,
		processingToken: PROCESSING_TOKEN,
		signal: new AbortController().signal
	});
}

/** Production shape: reviewer present, SHA-bound batch lane on. */
function batchLaneProvider(
	client: ClientPort,
	receiptText: boolean,
	options: {
		reviewer?: ClientPort;
		capacity?: AgenticChatProviderCapacity;
		contextFinder?: ConstructorParameters<
			typeof AgenticChatTurnProviderAdapter
		>[0]['contextFinder'];
	} = {}
) {
	return new AgenticChatTurnProviderAdapter(
		{
			client,
			semanticReviewer: options.reviewer ?? clientWithRounds([]),
			capacity:
				options.capacity ??
				new AgenticChatProviderCapacity({ configured: true, concurrency: 1 }),
			...(options.contextFinder ? { contextFinder: options.contextFinder } : {})
		},
		2_000,
		16,
		{ createOntoTask: true, createOntoGoal: true, linkOntoEntities: true },
		true,
		receiptText
	);
}

/** Run one direct write round through its closing answer. */
async function runDirectWrite(
	receiptText: boolean,
	calls: Array<{ id: string; name: string; args: JsonObject }>,
	results: (
		steps: AgenticChatProviderStepV1[]
	) => Parameters<
		NonNullable<AgenticChatPreparedProviderInvocationV1['continueWithToolResults']>
	>[0]['results'],
	synthesisText = 'Added it to the project.'
) {
	const client = clientWithRounds([toolRound(calls), synthesisRound(synthesisText)]);
	const reviewer = clientWithRounds([]);
	const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
	const invocation = await prepare(
		batchLaneProvider(client, receiptText, { reviewer, capacity })
	);
	const opening = await collect(invocation.stream());
	const closing = await collect(
		invocation.continueWithToolResults!({ round: 2, results: results(opening) })
	);
	return { client, reviewer, capacity, opening, closing };
}

describe('direct write receipt text (AGENTIC_CHAT_DIRECT_WRITE_RECEIPT_TEXT)', () => {
	it('keeps the tool-free synthesis pass when the flag is off', async () => {
		const { client, closing } = await runDirectWrite(
			false,
			[createTask('create-1', 'Draft Q3 plan')],
			taskResults
		);

		expect(client.stream).toHaveBeenCalledTimes(2);
		expect(client.stream.mock.calls[1]![0]).toMatchObject({ tools: [], toolChoice: 'none' });
		expect(closing).toEqual([
			{ type: 'text_delta', text: 'Added it to the project.' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 150, completionTokens: 30, totalTokens: 180 }
			}
		]);
	});

	it('closes one successful simple write on its ledger receipt with no provider call', async () => {
		const { client, reviewer, capacity, closing } = await runDirectWrite(
			true,
			[createTask('create-1', 'Draft Q3 plan')],
			taskResults
		);

		expect(client.stream).toHaveBeenCalledTimes(1);
		expect(reviewer.stream).not.toHaveBeenCalled();
		// Same event shapes a synthesis pass ends with: one text delta, then
		// `finish` carrying the usage already spent (no extra pass to add).
		expect(closing).toEqual([
			{ type: 'text_delta', text: 'Done — created task “Draft Q3 plan”.' },
			{ type: 'finish', finishedReason: 'stop', usage: ROUND_USAGE }
		]);
		expect(capacity.getSnapshot(TURN_RUN_ID)).toMatchObject({
			available: true,
			activeRequests: 0
		});
	});

	it('leaves the receipt untouched by the executor terminal text floors', () => {
		const args = { project_id: PROJECT_ID, title: 'Draft Q3 plan' };
		const toolExecutions: FastToolExecution[] = [
			{
				toolCall: {
					id: 'create-1',
					type: 'function',
					function: { name: 'create_onto_task', arguments: JSON.stringify(args) }
				},
				result: {
					tool_call_id: 'create-1',
					success: true,
					result: { task: { id: 'a0000000-0000-4000-8000-000000000001', ...args } }
				}
			}
		];
		const text = 'Done — created task “Draft Q3 plan”.';

		expect(
			enforceAgenticChatTerminalTextIntegrityV1({
				assistantText: text,
				finishedReason: 'stop',
				contextType: 'project',
				toolExecutions
			})
		).toEqual({
			assistantText: text,
			finishedReason: 'stop',
			correctionDelta: null,
			finalizationGuard: null
		});
	});

	it('lists two or three writes, one per line', async () => {
		const { client, closing } = await runDirectWrite(
			true,
			[
				createTask('create-1', 'Permit'),
				createTask('create-2', 'Inspection'),
				{
					id: 'create-3',
					name: 'create_onto_goal',
					args: { project_id: PROJECT_ID, name: 'Pass final inspection' }
				}
			],
			(steps) =>
				mutatingSteps(steps).map((step, index) =>
					succeeded(
						step,
						step.toolName === 'create_onto_goal'
							? {
									goal: {
										id: 'b0000000-0000-4000-8000-000000000001',
										name: step.arguments.name!
									}
								}
							: {
									task: {
										id: `a0000000-0000-4000-8000-00000000000${index + 1}`,
										title: step.arguments.title!
									}
								}
					)
				)
		);

		expect(client.stream).toHaveBeenCalledTimes(1);
		expect(closing[0]).toEqual({
			type: 'text_delta',
			text: 'Done:\n- Created task “Permit”\n- Created task “Inspection”\n- Created goal “Pass final inspection”'
		});
	});

	it('keeps the receipt-grounded synthesis pass for a partial batch', async () => {
		const { client, closing } = await runDirectWrite(
			true,
			[createTask('create-1', 'Permit'), createTask('create-2', 'Inspection')],
			(steps) => {
				const [first, second] = mutatingSteps(steps);
				return [
					succeeded(first!, {
						task: { id: 'a0000000-0000-4000-8000-000000000001', title: 'Permit' }
					}),
					failed(second!, 'Task create failed.')
				];
			},
			'Created Permit; Inspection was not created.'
		);

		expect(client.stream).toHaveBeenCalledTimes(2);
		const closingRequest = client.stream.mock.calls[1]![0];
		expect(closingRequest).toMatchObject({ tools: [], toolChoice: 'none' });
		expect(JSON.stringify(closingRequest.messages)).toContain(
			'A durable call in this batch failed'
		);
		expect(closing[0]).toEqual({
			type: 'text_delta',
			text: 'Created Permit; Inspection was not created.'
		});
	});

	it('keeps the pass when a write result asks the user for something', async () => {
		const { client } = await runDirectWrite(
			true,
			[createTask('create-1', 'Draft Q3 plan')],
			(steps) =>
				mutatingSteps(steps).map((step) =>
					succeeded(
						step,
						{
							task: {
								id: 'a0000000-0000-4000-8000-000000000001',
								title: 'Draft Q3 plan'
							}
						},
						true
					)
				)
		);

		expect(client.stream).toHaveBeenCalledTimes(2);
	});

	it('keeps the pass when the turn read before it wrote', async () => {
		const client = clientWithRounds([
			toolRound([
				{ id: 'read-1', name: 'get_project_overview', args: { project_id: PROJECT_ID } }
			]),
			toolRound([createTask('create-1', 'Draft Q3 plan')]),
			synthesisRound('Added it. The project has two open risks.')
		]);
		const invocation = await prepare(batchLaneProvider(client, true));
		const readRound = await collect(invocation.stream());
		const read = readRound.find((step): step is ReadStep => step.type === 'read_tool')!;
		const writeRound = await collect(
			invocation.continueWithToolResults!({
				round: 2,
				results: [readResult(read, { risks: 2 })]
			})
		);
		const closing = await collect(
			invocation.continueWithToolResults!({ round: 3, results: taskResults(writeRound) })
		);

		// The read result is evidence the model may still owe the user; only
		// prose could say whether it does, so the pass stays.
		expect(client.stream).toHaveBeenCalledTimes(3);
		expect(client.stream.mock.calls[2]![0]).toMatchObject({ toolChoice: 'none' });
		expect(closing[0]).toEqual({
			type: 'text_delta',
			text: 'Added it. The project has two open risks.'
		});
	});

	it('leaves a clarification turn unchanged', async () => {
		const clarification = {
			reason: 'Two plans match.',
			question: 'Which plan should the task go under: Launch or Hiring?'
		};
		const runClarification = async (receiptText: boolean) => {
			const client = clientWithRounds([
				toolRound([
					{ id: 'clarify-1', name: 'request_turn_clarification', args: clarification }
				]),
				synthesisRound(clarification.question)
			]);
			const invocation = await prepare(batchLaneProvider(client, receiptText));
			const opening = await collect(invocation.stream());
			const step = opening.find(
				(candidate): candidate is ReadStep => candidate.type === 'read_tool'
			)!;
			const feedback = readResult(step, {
				status: 'clarification_required',
				requires_user_action: true
			});
			feedback.execution.requiresUserAction = true;
			const closing = await collect(
				invocation.continueWithToolResults!({ round: 2, results: [feedback] })
			);
			return { client, closing };
		};

		const off = await runClarification(false);
		const on = await runClarification(true);
		expect(on.client.stream).toHaveBeenCalledTimes(2);
		expect(on.closing).toEqual(off.closing);
		expect(on.closing[0]).toEqual({ type: 'text_delta', text: clarification.question });
		expect(withoutSignal(on.client.stream.mock.calls[1]![0])).toEqual(
			withoutSignal(off.client.stream.mock.calls[1]![0])
		);
	});

	it('sends byte-identical requests before the closing answer whichever way the flag is set', async () => {
		const off = await runDirectWrite(
			false,
			[createTask('create-1', 'Draft Q3 plan')],
			taskResults
		);
		const on = await runDirectWrite(
			true,
			[createTask('create-1', 'Draft Q3 plan')],
			taskResults
		);
		expect(JSON.stringify(withoutSignal(on.client.stream.mock.calls[0]![0]))).toBe(
			JSON.stringify(withoutSignal(off.client.stream.mock.calls[0]![0]))
		);
		expect(on.opening).toEqual(off.opening);
	});

	it('is plumbed from the composition root into the provider', async () => {
		const run = async (directWriteReceiptTextEnabled?: boolean) => {
			const client = clientWithRounds([
				toolRound([createTask('create-1', 'Draft Q3 plan')]),
				synthesisRound('Added it.')
			]);
			const assembly = createAgenticChatCompositionRoot({
				client: {
					rpc: vi.fn(),
					from: vi.fn(),
					channel: vi.fn(),
					removeChannel: vi.fn()
				} as never,
				providerClient: client,
				semanticReviewerClient: clientWithRounds([]),
				providerConfigured: true,
				mutationCapabilities: { createOntoTask: true },
				...(directWriteReceiptTextEnabled === undefined
					? {}
					: { directWriteReceiptTextEnabled })
			});
			const invocation = await prepare(assembly.provider);
			const opening = await collect(invocation.stream());
			const closing = await collect(
				invocation.continueWithToolResults!({ round: 2, results: taskResults(opening) })
			);
			return { client, closing };
		};

		const byDefault = await run();
		expect(byDefault.client.stream).toHaveBeenCalledTimes(2);
		const enabled = await run(true);
		expect(enabled.client.stream).toHaveBeenCalledTimes(1);
		expect(enabled.closing[0]).toEqual({
			type: 'text_delta',
			text: 'Done — created task “Draft Q3 plan”.'
		});
	});
});

describe('renderDirectWriteReceipt', () => {
	const entry = (patch: Partial<WriteLedgerEntry>): WriteLedgerEntry => ({
		toolName: 'create_onto_task',
		status: 'success',
		action: 'create',
		entityKind: 'task',
		...patch
	});

	it('renders one receipt as a sentence', () => {
		expect(renderDirectWriteReceipt([entry({ title: 'Draft Q3 plan' })])).toBe(
			'Done — created task “Draft Q3 plan”.'
		);
	});

	it('falls back to the entity kind when the ledger has no title', () => {
		expect(renderDirectWriteReceipt([entry({ action: 'update' })])).toBe(
			'Done — updated the task.'
		);
		expect(renderDirectWriteReceipt([entry({ entityKind: 'goal' })])).toBe(
			'Done — created a new goal.'
		);
		expect(
			renderDirectWriteReceipt([
				entry({
					toolName: 'link_onto_entities',
					action: 'link',
					entityKind: 'relationship'
				})
			])
		).toBe('Done — linked the items.');
		expect(
			renderDirectWriteReceipt([
				entry({ toolName: 'create_calendar_event', entityKind: 'event', title: 'Standup' })
			])
		).toBe('Done — created calendar event “Standup”.');
	});

	it('names the destination of a move', () => {
		expect(
			renderDirectWriteReceipt([
				entry({
					toolName: 'move_document_in_tree',
					action: 'move',
					entityKind: 'document',
					title: 'Notes',
					parentTitle: 'Archive'
				})
			])
		).toBe('Done — moved document “Notes” into “Archive”.');
	});

	it('sanitizes titles the same way as the last-resort receipt', () => {
		expect(renderDirectWriteReceipt([entry({ title: 'Fix `bug`\n*now* <b>' })])).toBe(
			'Done — created task “Fix bug now b”.'
		);
		expect(renderDirectWriteReceipt([entry({ title: '**' })])).toBe(
			'Done — created a new task.'
		);
	});

	it('renders nothing unless every entry succeeded', () => {
		expect(renderDirectWriteReceipt([])).toBeNull();
		expect(
			renderDirectWriteReceipt([
				entry({ title: 'Permit' }),
				entry({ title: 'Inspection', status: 'failure' })
			])
		).toBeNull();
	});
});

describe('provider pass started before its status step', () => {
	it('sends the opening request before the context-finder status is consumed', async () => {
		const client = clientWithRounds([synthesisRound('About $5 million.')]);
		const step = {
			type: 'semantic' as const,
			transitionId: 'c0000000-0000-4000-8000-000000000001',
			phase: 'stream' as const,
			eventType: 'context_selection',
			currentActivity: 'Finding relevant project context...',
			eventPayload: { type: 'context_selection', items: [] }
		};
		const invocation = await prepare(
			batchLaneProvider(client, false, {
				contextFinder: {
					find: vi.fn(() => Promise.resolve({ step, injection: 'WORKING CONTEXT' }))
				}
			})
		);
		const iterator = invocation.stream()[Symbol.asyncIterator]();

		const first = await iterator.next();
		expect(first.value).toEqual(step);
		// The request is already out while the executor persists the status.
		expect(client.stream).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(client.stream.mock.calls[0]![0].messages.at(-1))).toContain(
			'WORKING CONTEXT'
		);
		const rest: AgenticChatProviderStepV1[] = [];
		for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
			rest.push(next.value);
		}
		expect(rest).toEqual([
			{ type: 'text_delta', text: 'About $5 million.' },
			{ type: 'finish', finishedReason: 'stop', usage: SYNTHESIS_USAGE }
		]);
	});

	it('sends the batch review request before the review status is consumed', async () => {
		// Four creates exceed the direct-write floor, so the batch is held for review.
		const client = clientWithRounds([
			toolRound(
				['Permit', 'Cabinets', 'Rough-in', 'Inspection'].map((title, index) =>
					createTask(`create-${index + 1}`, title)
				)
			)
		]);
		const reviewer = clientWithRounds([[{ type: 'done', finishedReason: 'stop' }]]);
		const invocation = await prepare(batchLaneProvider(client, false, { reviewer }));
		const iterator = invocation.stream()[Symbol.asyncIterator]();

		let status: AgenticChatProviderStepV1 | undefined;
		for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
			if (
				next.value.type === 'semantic' &&
				next.value.currentActivity.startsWith('Checking')
			) {
				status = next.value;
				break;
			}
		}
		expect(status).toBeDefined();
		expect(reviewer.stream).toHaveBeenCalledTimes(1);
		const rest: AgenticChatProviderStepV1[] = [];
		for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
			rest.push(next.value);
		}
		// The review outcome still follows its status.
		expect(rest.length).toBeGreaterThan(0);
		expect(rest.some((step) => step.type === 'mutating_tool')).toBe(false);
	});
});
