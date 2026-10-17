// apps/worker/tests/agenticChatProposalCards.test.ts
//
// The worker half of the proposal-card rail (tasker 122): the card id is the
// call's own ledger row id, the duplicate check is bounded and never sinks the
// card, a card is "needs your choice" (requires_user_action) and never
// memo-replayed, Jev mounts the project lookups a proposal needs, the ops are
// reads that no MCP connector can reach, and a card ends the turn as a
// read-only answer: no "No changes were saved" notice, no completion
// continuation or fallback, no write tools on the closing pass.
import { describe, expect, it, vi } from 'vitest';
import {
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	extractTools
} from '@buildos/agentic-chat-runtime/catalog';
import {
	NO_CHANGES_SAVED_NOTICE,
	getAgenticChatLoopToolCatalog,
	isLikelyWriteToolName,
	isPureReadToolName
} from '@buildos/agentic-chat-runtime/loop';
import {
	AgenticChatToolAccessDeniedError,
	type AgenticChatToolAccessPortV1
} from '@buildos/agentic-chat-runtime/tools';
import { EXTERNAL_OP_HANDLERS } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	buildProposalCardEnvelopeV1,
	parseProposalCardEnvelope
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	type AgenticChatTurnClaimResultV1,
	type ChatToolDefinition,
	type JsonObject,
	type TurnInputArtifactV1
} from '@buildos/shared-types';
import { AgenticChatToolExecutionAdapter } from '../src/workers/agentic-chat/tools/execution-adapter';
import { AgenticChatProviderExecutionError } from '../src/workers/agentic-chat/provider/contracts';
import type {
	AgenticChatProviderReadSynthesisInputV1,
	AgenticChatProviderStepV1,
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderClientPortV1
} from '../src/workers/agentic-chat/provider/contracts';
import {
	READ_MEMO_ELIGIBLE_TOOL_NAMES,
	memoizeCompletedRead,
	resolveMemoServedExecution
} from '../src/workers/agentic-chat/provider/feedback';
import { selectJevToolDefinitions } from '../src/workers/agentic-chat/provider/jev-tool-selector';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/provider/provider-capacity';
import { AgenticChatTurnProviderAdapter } from '../src/workers/agentic-chat/provider/turn-provider';
// Installs the worker's loop catalog (reviewed reads + mutation identities).
import '../src/workers/agentic-chat/provider/tool-surface';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/turn/execution-input';
import type { AgenticChatReadToolExecutionV1 } from '../src/workers/agentic-chat/tools/tool-execution';
import type { CompletedProviderToolCall } from '../src/workers/agentic-chat/provider/stream-tool-calls';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const ACTOR_ID = '90000000-0000-4000-8000-000000000009';
const PROCESSING_TOKEN = '90000000-0000-4000-8000-000000000019';
const TOOL_EXECUTION_ID = 'a0000000-0000-4000-8000-00000000000a';
const CHILD = '40000000-0000-4000-8000-000000000004';
const PARENT = '41000000-0000-4000-8000-000000000041';
const RUN_ID = '99000000-0000-4000-8000-000000000099';

function executionInput(
	overrides: Partial<AgenticChatWorkerExecutionInputV1> = {}
): AgenticChatWorkerExecutionInputV1 {
	const claim = {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: '50000000-0000-4000-8000-000000000005',
		sessionId: SESSION_ID,
		userId: USER_ID,
		correlationId: '60000000-0000-4000-8000-000000000006',
		executionGeneration: 1,
		status: 'running',
		inputArtifactId: '70000000-0000-4000-8000-000000000007',
		userMessageId: '80000000-0000-4000-8000-000000000008'
	} satisfies Extract<
		AgenticChatTurnClaimResultV1,
		{ outcome: 'claimed' | 'matching_current_claim' }
	>;
	return {
		claim,
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		requestPayload: {
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			message: 'Put DJ Internal under Wayne Strategies',
			attachments: [],
			context: { type: 'global' }
		},
		timingBaseline: {} as never,
		artifact: {
			artifactVersion: 'agentic_chat_input_v2',
			historySource: 'admission_window',
			history: [],
			prepared: {
				sourcePreparedPromptId: null,
				contextPayload: {},
				conversationSummary: null,
				surfaceProfile: 'global',
				systemPrompt: 'System prompt\n',
				promptSections: [],
				toolSurface: {}
			},
			createdAt: '2026-10-17T12:00:00.000Z',
			retainUntil: '2026-10-24T12:00:00.000Z',
			contentHash: '0'.repeat(64)
		} satisfies TurnInputArtifactV1,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Execution adapter.

function fakeClient() {
	const tables: Record<string, JsonObject[]> = {
		onto_projects: [
			{
				id: CHILD,
				name: 'DJ Internal',
				parent_project_id: null,
				archived_at: null,
				deleted_at: null,
				merged_into_project_id: null,
				shared_folder_document_id: null,
				created_by: ACTOR_ID
			},
			{
				id: PARENT,
				name: 'Wayne Strategies',
				parent_project_id: null,
				archived_at: null,
				deleted_at: null,
				merged_into_project_id: null,
				shared_folder_document_id: '42000000-0000-4000-8000-000000000042',
				created_by: ACTOR_ID
			}
		]
	};
	const from = vi.fn((table: string) => {
		const filters: Array<(row: JsonObject) => boolean> = [];
		const query: Record<string, unknown> = {};
		for (const method of ['select', 'eq', 'order', 'limit']) query[method] = () => query;
		query.in = (key: string, values: unknown[]) => (
			filters.push((row) => values.includes(row[key])),
			query
		);
		query.is = (key: string, value: unknown) => (
			filters.push((row) => (row[key] ?? null) === value),
			query
		);
		query.maybeSingle = async () => ({ data: null, error: null });
		query.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
			Promise.resolve({
				data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
				error: null
			}).then(resolve, reject);
		return query;
	});
	const rpc = vi.fn(async (name: string, args: Record<string, unknown>) =>
		name === 'onto_project_family_v1'
			? {
					data: {
						project_id: args.p_project_id,
						parent: null,
						shelf: [],
						children: [],
						own_shared_folder_document_id: null,
						child_count: 0
					},
					error: null
				}
			: { data: null, error: { message: `unexpected ${name}` } }
	);
	return { from, rpc };
}

function access(levels: Record<string, 'read' | 'admin'>): AgenticChatToolAccessPortV1 {
	return {
		getActorId: vi.fn(async () => ACTOR_ID),
		resolveProjectSummaries: vi.fn(async () => []),
		assertProjectAccess: vi.fn(async (projectId: string, level) => {
			const have = levels[projectId];
			if (!have || (level === 'admin' && have !== 'admin'))
				throw new AgenticChatToolAccessDeniedError();
		}),
		assertEntityAccess: vi.fn(async () => {})
	};
}

function adapter(
	options: {
		levels?: Record<string, 'read' | 'admin'>;
		startConsolidationCheck?: ReturnType<typeof vi.fn>;
		duplicateCheckTimeoutMs?: number;
	} = {}
) {
	const client = fakeClient();
	const startConsolidationCheck =
		options.startConsolidationCheck ??
		vi.fn(async () => ({ ok: true as const, run_id: RUN_ID, existing: false }));
	const instance = new AgenticChatToolExecutionAdapter(client as never, {
		createAccessAdapter: () =>
			access(options.levels ?? { [CHILD]: 'admin', [PARENT]: 'admin' }),
		startConsolidationCheck: startConsolidationCheck as never,
		...(options.duplicateCheckTimeoutMs !== undefined
			? { duplicateCheckTimeoutMs: options.duplicateCheckTimeoutMs }
			: {}),
		embeddings: undefined
	});
	return { instance, client, startConsolidationCheck };
}

const NEST_ARGS = { project_id: CHILD, parent_project_id: PARENT };

describe('proposal tools on the worker read lane', () => {
	it('mints the card under its own ledger row id and marks it as needing the user', async () => {
		const { instance, client, startConsolidationCheck } = adapter();
		const execution = await instance.execute({
			toolName: 'propose_project_parent',
			arguments: NEST_ARGS,
			providerToolCallId: 'call-1',
			toolExecutionId: TOOL_EXECUTION_ID,
			executionInput: executionInput(),
			signal: new AbortController().signal
		});
		const card = parseProposalCardEnvelope(execution.result);
		expect(card?.card_id).toBe(TOOL_EXECUTION_ID);
		expect(card?.client_action.session_id).toBe(SESSION_ID);
		expect(card?.client_action.payload).toMatchObject({
			action: 'attach',
			duplicate_check: { run_id: RUN_ID, root_project_id: CHILD }
		});
		expect(execution.requiresUserAction).toBe(true);
		expect(execution.toolCategory).toBe('read');
		// One duplicate check, started with the worker's service client for this user.
		expect(startConsolidationCheck).toHaveBeenCalledWith({
			admin: client,
			userId: USER_ID,
			actorId: ACTOR_ID,
			projectIds: [CHILD, PARENT]
		});
	});

	it('shows the card without the strip when the duplicate check is slow or fails', async () => {
		for (const start of [
			vi.fn(() => new Promise(() => undefined)),
			vi.fn(async () => ({ ok: false, code: 'forbidden', message: 'no' })),
			vi.fn(async () => {
				throw new Error('down');
			})
		]) {
			const { instance } = adapter({
				startConsolidationCheck: start,
				duplicateCheckTimeoutMs: 5
			});
			const execution = await instance.execute({
				toolName: 'propose_project_parent',
				arguments: NEST_ARGS,
				providerToolCallId: 'call-1',
				toolExecutionId: TOOL_EXECUTION_ID,
				executionInput: executionInput(),
				signal: new AbortController().signal
			});
			const card = parseProposalCardEnvelope(execution.result);
			expect(card?.client_action.payload).toMatchObject({ duplicate_check: null });
			expect(execution.requiresUserAction).toBe(true);
		}
	});

	it('does not mark a blocked proposal as needing the user', async () => {
		const { instance, startConsolidationCheck } = adapter({
			levels: { [CHILD]: 'admin', [PARENT]: 'read' }
		});
		const execution = await instance.execute({
			toolName: 'propose_project_parent',
			arguments: NEST_ARGS,
			providerToolCallId: 'call-1',
			toolExecutionId: TOOL_EXECUTION_ID,
			executionInput: executionInput(),
			signal: new AbortController().signal
		});
		expect(execution.result).toMatchObject({
			card_rail: 'proposal_v1',
			status: 'blocked',
			reason_code: 'admin_required'
		});
		expect(execution.requiresUserAction).toBe(false);
		expect(startConsolidationCheck).not.toHaveBeenCalled();
	});

	it('fails the call, minting no card, without the ledger row id', async () => {
		const { instance } = adapter();
		const outcome = instance.execute({
			toolName: 'propose_project_parent',
			arguments: NEST_ARGS,
			providerToolCallId: 'call-1',
			executionInput: executionInput(),
			signal: new AbortController().signal
		});
		await expect(outcome).rejects.toBeInstanceOf(AgenticChatProviderExecutionError);
		await expect(outcome).rejects.toMatchObject({ code: 'read_tool_execution_failed' });
	});
});

// ---------------------------------------------------------------------------
// Memo, Jev, loop catalog, external exposure.

function cardExecution(): AgenticChatReadToolExecutionV1 {
	return {
		result: JSON.parse(
			JSON.stringify(
				buildProposalCardEnvelopeV1({
					kind: 'project_parent',
					cardId: TOOL_EXECUTION_ID,
					sessionId: SESSION_ID,
					proposedAt: '2026-10-17T12:00:00.000Z',
					payload: {
						version: 1,
						action: 'attach',
						project: { id: CHILD, name: 'DJ Internal' },
						from_parent: null,
						to_parent: { id: PARENT, name: 'Wayne Strategies' },
						child_only_members: { names: [], count: 0 },
						effects: ['nothing_moves', 'no_access_change'],
						undo_needs_admin_on_both: false,
						duplicate_check: null,
						note: null
					},
					message: 'Needs your choice: put DJ Internal inside Wayne Strategies.'
				})
			)
		),
		executionTimeMs: 3,
		tokensConsumed: null,
		affectedEntities: [],
		toolCategory: 'read',
		resultCount: null,
		zeroResult: null,
		requiresUserAction: true
	};
}

describe('proposal tools around the turn', () => {
	it('never serves a proposal from the read memo', () => {
		expect(READ_MEMO_ELIGIBLE_TOOL_NAMES.has('propose_project_parent')).toBe(false);
		expect(READ_MEMO_ELIGIBLE_TOOL_NAMES.has('propose_project_combine')).toBe(false);
		expect(READ_MEMO_ELIGIBLE_TOOL_NAMES.has('get_project_overview')).toBe(true);
		const memo = new Map<string, AgenticChatReadToolExecutionV1>();
		const call = {
			id: 'call-1',
			name: 'propose_project_parent',
			arguments: NEST_ARGS,
			canonicalArguments: JSON.stringify(NEST_ARGS)
		} as unknown as CompletedProviderToolCall;
		memoizeCompletedRead(memo, call, cardExecution());
		expect(memo.size).toBe(0);
		expect(resolveMemoServedExecution(memo, { ...call, id: 'call-2' })).toBeNull();
	});

	it('mounts the project lookups a proposal needs when Jev picks it', () => {
		const tools = extractTools([
			'propose_project_parent',
			'propose_project_combine',
			'list_onto_projects',
			'search_onto_projects',
			'search_all_projects',
			'get_project_overview',
			'create_onto_task'
		]);
		for (const picked of ['propose_project_parent', 'propose_project_combine']) {
			const names = selectJevToolDefinitions(tools as never, { [picked]: 0.9 }).map(
				(tool) => tool.function.name
			);
			expect(names).toEqual(
				expect.arrayContaining([
					picked,
					'list_onto_projects',
					'search_onto_projects',
					'search_all_projects',
					'get_project_overview'
				])
			);
			expect(names).not.toContain('create_onto_task');
		}
	});

	it('classifies the proposal ops as reads in the worker loop catalog', () => {
		const catalog = getAgenticChatLoopToolCatalog();
		expect(catalog.byToolName.propose_project_parent).toMatchObject({
			op: 'onto.project.parent.propose',
			kind: 'read'
		});
		expect(catalog.byToolName.propose_project_combine).toMatchObject({
			op: 'onto.project.combine.propose',
			kind: 'read'
		});
		for (const name of ['propose_project_parent', 'propose_project_combine']) {
			expect(isLikelyWriteToolName(name)).toBe(false);
			expect(isPureReadToolName(name)).toBe(true);
		}
	});

	it('keeps the proposal ops away from MCP connectors (no external op handler)', () => {
		const handlers = EXTERNAL_OP_HANDLERS as Record<string, unknown>;
		expect(handlers['onto.project.parent.propose']).toBeUndefined();
		expect(handlers['onto.project.combine.propose']).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Turn state: the card is the disposition.

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

async function collect(stream: AsyncIterable<AgenticChatProviderStepV1>) {
	const steps: AgenticChatProviderStepV1[] = [];
	for await (const step of stream) steps.push(step);
	return steps;
}

function globalSurfaceInput(): AgenticChatWorkerExecutionInputV1 {
	const definitions: ChatToolDefinition[] = [
		REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
		...extractTools(['get_project_overview', 'update_onto_task', 'propose_project_parent'])
	];
	const input = executionInput();
	const toolSurface = {
		version: 1 as const,
		surfaceProfile: 'global',
		toolNames: definitions.map((definition) => definition.function.name),
		definitions
	};
	const artifact = input.artifact;
	return {
		...input,
		artifact:
			artifact.artifactVersion === AGENTIC_CHAT_INPUT_ARTIFACT_VERSION
				? { ...artifact, prepared: { ...artifact.prepared, toolSurface } }
				: { ...artifact, prepared: { ...artifact.prepared, toolSurface } }
	};
}

function cardFeedback(providerToolCallId: string): AgenticChatProviderReadSynthesisInputV1 {
	return {
		providerToolCallId,
		toolName: 'propose_project_parent',
		arguments: NEST_ARGS,
		execution: cardExecution()
	};
}

describe('a proposal card ends the turn as a read-only answer', () => {
	it('adds no unsaved notice, runs no continuation or fallback, and drops write tools', async () => {
		const reply = 'I put a card below: click it to nest DJ Internal under Wayne Strategies.';
		const client = clientWithRounds([
			[
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'propose-1',
							type: 'function',
							function: {
								name: 'propose_project_parent',
								arguments: JSON.stringify(NEST_ARGS)
							}
						}
					]
				},
				{ type: 'done', finishedReason: 'tool_calls' }
			],
			[
				{ type: 'text', content: reply },
				{ type: 'done', finishedReason: 'stop' }
			]
		]);
		const invocation = await new AgenticChatTurnProviderAdapter(
			{
				client,
				capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 }),
				// Jev judged the user commissioned a write: without the card this
				// turn would end with "No changes were saved".
				toolSelector: {
					select: async (request) => ({
						...request,
						commissionedWriteToolNames: ['update_onto_task']
					})
				}
			},
			2_000,
			16,
			{ updateOntoTask: true }
		).prepare({
			executionInput: globalSurfaceInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		const opening = await collect(invocation.stream());
		const read = opening.find((step) => step.type === 'read_tool');
		expect(read).toMatchObject({ type: 'read_tool', toolName: 'propose_project_parent' });
		expect(opening.some((step) => step.type === 'mutating_tool')).toBe(false);

		const closing = await collect(
			invocation.continueWithToolResults!({ round: 2, results: [cardFeedback('propose-1')] })
		);
		const text = closing
			.filter((step) => step.type === 'text_delta')
			.map((step) => (step as { text: string }).text)
			.join('');
		expect(text).toBe(reply);
		expect(text).not.toContain(NO_CHANGES_SAVED_NOTICE);
		expect(closing.at(-1)).toMatchObject({ type: 'finish', finishedReason: 'stop' });
		// Exactly the opening pass and the reply: no completion continuation or repair.
		expect(client.stream).toHaveBeenCalledTimes(2);
		// The closing pass is a read-only surface: the card is the turn's disposition.
		const closingTools = client.stream.mock.calls[1]![0].tools.map(
			(tool) => tool.function.name
		);
		expect(closingTools).not.toContain('update_onto_task');
		expect(closingTools).toContain('get_project_overview');
	});
});
