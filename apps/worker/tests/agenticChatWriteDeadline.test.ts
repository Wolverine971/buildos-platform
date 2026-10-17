// apps/worker/tests/agenticChatWriteDeadline.test.ts
//
// Write deadlines (AGENTIC_CHAT_PIPELINE_AUDIT_2026-10-17 B3). In turn a5d3e7a2
// one update_onto_document hung 125 s and the user watched "Thinking..." for
// 3 m 20 s. Every adapter attempt now has a deadline; its signal cancels the
// write's HTTP requests; and a timed-out write is uncertain unless the attempt
// provably sent nothing.
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_WRITE_DEADLINE_MS,
	AgenticChatEffectExecutionError,
	AgenticChatMutationAdapterError,
	AgenticChatMutationExecutor
} from '../src/workers/agentic-chat/mutations/mutation-executor';
import { AgenticChatTableMutationAdapter } from '../src/workers/agentic-chat/mutations/table-adapter';
import { gatewayMemoForTurn } from '../src/workers/agentic-chat/mutations/gateway-turn-memo';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '50000000-0000-4000-8000-000000000005';
const PROJECT_ID = '70000000-0000-4000-8000-000000000007';
const DOCUMENT_ID = '80000000-0000-4000-8000-000000000008';
const ACTOR_ID = '90000000-0000-4000-8000-000000000009';
const NOW = '2026-10-17T12:00:00.000Z';

let turnCounter = 0;

/** A fresh turn per test, so the per-turn gateway memo never leaks between tests. */
function executionInput(toolName = 'update_onto_document') {
	turnCounter += 1;
	const turnRunId = `30000000-0000-4000-8000-${String(turnCounter).padStart(12, '0')}`;
	return {
		claim: {
			turnRunId,
			queueJobId: QUEUE_JOB_ID,
			sessionId: SESSION_ID,
			userId: USER_ID,
			executionGeneration: 1
		},
		requestPayload: {
			context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
		},
		artifact: {
			prepared: {
				toolSurface: {
					version: 1,
					surfaceProfile: 'test_write_deadline',
					toolNames: [toolName],
					definitions: [
						{
							type: 'function',
							function: {
								name: toolName,
								description: 'Write fixture',
								parameters: { type: 'object', properties: {} }
							}
						}
					]
				}
			}
		}
	} as never;
}

function step(overrides: Record<string, unknown> = {}) {
	return {
		logicalOperationId: '60000000-0000-4000-8000-000000000006',
		providerToolCallId: 'provider-write-1',
		toolName: 'update_onto_document',
		operationName: 'onto.document.update',
		arguments: { document_id: DOCUMENT_ID, content: 'Next section', update_strategy: 'append' },
		downstreamIdempotencySupported: false,
		...overrides
	} as never;
}

/** The effect ledger: every reservation begins with adapter authority. */
function effectControl() {
	const receipt = (input: { effectId: string }, overrides: Record<string, unknown>) => ({
		effectId: input.effectId,
		turnRunId: 'turn',
		executionGeneration: 1,
		sessionId: SESSION_ID,
		userId: USER_ID,
		downstreamIdempotencySupported: false,
		downstreamReceipt: null,
		startedAt: null,
		finishedAt: null,
		invokeAdapter: false,
		...overrides
	});
	return {
		reserve: vi.fn(async (input: { effectId: string }) =>
			receipt(input, { state: 'reserved', outcome: 'reserved' })
		),
		begin: vi.fn(async (input: { effectId: string }) =>
			receipt(input, {
				state: 'started',
				outcome: 'started',
				startedAt: NOW,
				invokeAdapter: true
			})
		),
		reconcile: vi.fn(
			async (input: { effectId: string; targetState: string; downstreamReceipt: unknown }) =>
				receipt(input, {
					state: input.targetState,
					outcome: 'reconciled',
					startedAt: NOW,
					finishedAt: NOW,
					downstreamReceipt: input.downstreamReceipt
				})
		)
	};
}

type MutatingToolInput = Parameters<
	ConstructorParameters<typeof AgenticChatMutationExecutor>[0]['mutatingTool']['execute']
>[0];

function executorHarness(
	execute: (input: MutatingToolInput) => Promise<Record<string, unknown>>,
	options: { writeDeadlineMs?: number; writeDeadlineSettleMs?: number } = {}
) {
	const control = effectControl();
	const mutatingTool = { execute: vi.fn(execute) };
	const executor = new AgenticChatMutationExecutor(
		{ control: control as never, mutatingTool: mutatingTool as never },
		{
			rolledBackRetryDelayMs: () => 0,
			writeDeadlineMs: options.writeDeadlineMs ?? 40,
			writeDeadlineSettleMs: options.writeDeadlineSettleMs ?? 200
		}
	);
	return { executor, control, mutatingTool };
}

function never<T>(): Promise<T> {
	return new Promise<T>(() => undefined);
}

function untilAborted(signal: AbortSignal | undefined): Promise<void> {
	return new Promise((resolve) => {
		if (!signal) return;
		if (signal.aborted) return resolve();
		signal.addEventListener('abort', () => resolve(), { once: true });
	});
}

async function rejection(promise: Promise<unknown>): Promise<AgenticChatEffectExecutionError> {
	try {
		await promise;
	} catch (error) {
		expect(error).toBeInstanceOf(AgenticChatEffectExecutionError);
		return error as AgenticChatEffectExecutionError;
	}
	throw new Error('Expected the write to fail');
}

describe('write deadline in the mutation executor', () => {
	it('defaults to 20 s, ten times the slowest production write', () => {
		expect(AGENTIC_CHAT_WRITE_DEADLINE_MS).toBe(20_000);
	});

	it('times out a write that never resolves at its deadline and records it uncertain', async () => {
		let writeSignal: AbortSignal | undefined;
		const harness = executorHarness((input) => {
			writeSignal = input.writeSignal;
			return never();
		});
		const startedAt = Date.now();

		const error = await rejection(
			harness.executor.execute({
				executionInput: executionInput(),
				processingToken: PROCESSING_TOKEN,
				step: step(),
				signal: new AbortController().signal
			})
		);

		const elapsedMs = Date.now() - startedAt;
		expect(elapsedMs).toBeGreaterThanOrEqual(35);
		// Deadline plus settle window, far from the 125 s hang it replaces.
		expect(elapsedMs).toBeLessThan(2_000);
		expect(error).toMatchObject({
			failureClass: 'uncertain_external_commit',
			failureCode: 'mutation_write_timeout'
		});
		expect(writeSignal?.aborted).toBe(true);
		expect(harness.mutatingTool.execute).toHaveBeenCalledOnce();
		expect(harness.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				targetState: 'uncertain',
				failureCode: 'mutation_write_timeout'
			})
		);
	});

	it('records a known failure when the adapter proves the timed-out write sent nothing', async () => {
		const harness = executorHarness(async (input) => {
			await untilAborted(input.writeSignal);
			throw new AgenticChatMutationAdapterError(
				'known_failed',
				'update_onto_document_write_timeout_not_sent',
				'update_onto_document timed out before it sent any change, so nothing was saved.',
				{ provenNotDispatched: true }
			);
		});

		const error = await rejection(
			harness.executor.execute({
				executionInput: executionInput(),
				processingToken: PROCESSING_TOKEN,
				step: step(),
				signal: new AbortController().signal
			})
		);

		expect(error).toMatchObject({
			failureClass: 'permanent',
			failureCode: 'update_onto_document_write_timeout_not_sent',
			retryable: false
		});
		expect(harness.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				targetState: 'failed',
				failureCode: 'update_onto_document_write_timeout_not_sent'
			})
		);
	});

	it('keeps an unproven known failure after the deadline uncertain', async () => {
		// A cancelled read inside the gateway can surface as NOT_FOUND after a
		// write was already sent; only a proof of "nothing sent" may downgrade.
		const harness = executorHarness(async (input) => {
			await untilAborted(input.writeSignal);
			throw new AgenticChatMutationAdapterError(
				'known_failed',
				'update_onto_document_not_found',
				'Document not found'
			);
		});

		const error = await rejection(
			harness.executor.execute({
				executionInput: executionInput(),
				processingToken: PROCESSING_TOKEN,
				step: step(),
				signal: new AbortController().signal
			})
		);

		expect(error).toMatchObject({
			failureClass: 'uncertain_external_commit',
			failureCode: 'mutation_write_timeout'
		});
	});

	it('keeps a receipt that lands inside the settle window', async () => {
		const harness = executorHarness(async (input) => {
			await untilAborted(input.writeSignal);
			return { document: { id: DOCUMENT_ID } };
		});

		await expect(
			harness.executor.execute({
				executionInput: executionInput(),
				processingToken: PROCESSING_TOKEN,
				step: step(),
				signal: new AbortController().signal
			})
		).resolves.toMatchObject({ downstreamReceipt: { document: { id: DOCUMENT_ID } } });
		expect(harness.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({ targetState: 'succeeded' })
		);
	});

	it('never cancels a sent write because the user pressed Stop', async () => {
		const turn = new AbortController();
		let writeSignal: AbortSignal | undefined;
		const harness = executorHarness(
			async (input) => {
				writeSignal = input.writeSignal;
				turn.abort(new Error('user pressed Stop'));
				await new Promise((resolve) => setTimeout(resolve, 10));
				return { document: { id: DOCUMENT_ID } };
			},
			{ writeDeadlineMs: 1_000 }
		);

		await expect(
			harness.executor.execute({
				executionInput: executionInput(),
				processingToken: PROCESSING_TOKEN,
				step: step(),
				signal: turn.signal
			})
		).resolves.toMatchObject({ downstreamReceipt: { document: { id: DOCUMENT_ID } } });
		expect(writeSignal?.aborted).toBe(false);
	});

	it('gives an idempotent recovery attempt its own deadline', async () => {
		const writeSignals: Array<AbortSignal | undefined> = [];
		const harness = executorHarness(async (input) => {
			writeSignals.push(input.writeSignal);
			if (writeSignals.length === 1) return never();
			// The replay with the same key finds the committed row.
			return { task: { id: 'task-1' } };
		});

		await expect(
			harness.executor.execute({
				executionInput: executionInput('create_onto_task'),
				processingToken: PROCESSING_TOKEN,
				step: step({
					toolName: 'create_onto_task',
					operationName: 'onto.task.create',
					downstreamIdempotencySupported: true
				}),
				signal: new AbortController().signal
			})
		).resolves.toMatchObject({ downstreamReceipt: { task: { id: 'task-1' } } });
		expect(writeSignals).toHaveLength(2);
		expect(writeSignals[0]?.aborted).toBe(true);
		expect(writeSignals[1]).not.toBe(writeSignals[0]);
		expect(writeSignals[1]?.aborted).toBe(false);
	});
});

/** A fake database client that records each builder and the signal bound to it. */
function recordingClient() {
	const builders: Array<{ table: string; method: string; signal: AbortSignal | null }> = [];
	const builder = (table: string, method: string) => {
		const entry = { table, method, signal: null as AbortSignal | null };
		builders.push(entry);
		const chain: Record<string, unknown> = {
			abortSignal: vi.fn((signal: AbortSignal) => {
				entry.signal = signal;
				return chain;
			})
		};
		return chain;
	};
	const client = {
		from: (table: string) => ({
			select: () => builder(table, 'select'),
			update: () => builder(table, 'update')
		})
	};
	return { client, builders };
}

function tableInput(writeSignal: AbortSignal | undefined) {
	const claimInput = executionInput();
	return {
		effectId: 'e0000000-0000-4000-8000-00000000000e',
		downstreamIdempotencyKey: 'chat-effect:e0000000-0000-4000-8000-00000000000e',
		toolName: 'update_onto_document',
		operationName: 'onto.document.update',
		downstreamIdempotencySupported: false,
		arguments: { document_id: DOCUMENT_ID, content: 'Next section', update_strategy: 'append' },
		providerToolCallId: 'provider-write-1',
		executionInput: claimInput,
		signal: new AbortController().signal,
		...(writeSignal ? { writeSignal } : {})
	} as never;
}

describe('write deadline in the table adapter', () => {
	it('passes the write deadline to the gateway and binds its database client', async () => {
		const { client, builders } = recordingClient();
		const deadline = new AbortController();
		const runGateway = vi.fn(async (params: { admin: typeof client; signal?: AbortSignal }) => {
			params.admin.from('onto_documents').select();
			deadline.abort(new Error('write deadline passed'));
			// The cancelled read comes back as the gateway's load failure.
			return {
				ok: false,
				error: { code: 'INTERNAL' as const, message: 'Failed to load document' }
			};
		});
		const adapter = new AgenticChatTableMutationAdapter(client as never, {
			runGateway: runGateway as never
		});

		const error = await adapter.execute(tableInput(deadline.signal)).catch((e) => e);

		expect(runGateway.mock.calls[0]?.[0].signal).toBe(deadline.signal);
		expect(builders).toEqual([
			{ table: 'onto_documents', method: 'select', signal: deadline.signal }
		]);
		// Nothing that can change data was built, so nothing was saved.
		expect(error).toBeInstanceOf(AgenticChatMutationAdapterError);
		expect(error).toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_onto_document_write_timeout_not_sent',
			provenNotDispatched: true,
			retryable: false
		});
	});

	it('keeps a timed-out write uncertain once it built a change', async () => {
		const { client } = recordingClient();
		const deadline = new AbortController();
		const runGateway = vi.fn(async (params: { admin: typeof client }) => {
			params.admin.from('onto_documents').update();
			deadline.abort(new Error('write deadline passed'));
			return {
				ok: false,
				error: { code: 'INTERNAL' as const, message: 'AbortError: write deadline passed' }
			};
		});
		const adapter = new AgenticChatTableMutationAdapter(client as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(tableInput(deadline.signal))).rejects.toMatchObject({
			disposition: 'outcome_uncertain',
			failureCode: 'update_onto_document_write_timeout'
		});
	});

	it('does not report an empty success after the deadline as saved', async () => {
		const { client } = recordingClient();
		const deadline = new AbortController();
		const runGateway = vi.fn(async (params: { admin: typeof client }) => {
			params.admin.from('onto_documents').select();
			deadline.abort(new Error('write deadline passed'));
			return {
				ok: true,
				data: { document: { id: DOCUMENT_ID, project_id: PROJECT_ID, title: 'Log' } }
			};
		});
		const adapter = new AgenticChatTableMutationAdapter(client as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(tableInput(deadline.signal))).rejects.toMatchObject({
			disposition: 'known_failed',
			failureCode: 'update_onto_document_write_timeout_not_sent'
		});
	});

	it('leaves a call without a write deadline unchanged', async () => {
		const { client } = recordingClient();
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: { document: { id: DOCUMENT_ID, project_id: PROJECT_ID, title: 'Log' } }
		}));
		const adapter = new AgenticChatTableMutationAdapter(client as never, {
			runGateway: runGateway as never
		});

		await expect(adapter.execute(tableInput(undefined))).resolves.toMatchObject({
			document: { id: DOCUMENT_ID }
		});
		const params = (runGateway.mock.calls[0] as unknown as [Record<string, unknown>])[0];
		expect(params.admin).toBe(client);
		expect(params).not.toHaveProperty('signal');
	});
});

/**
 * The real gateway over a real supabase-js client whose fetch answers only
 * what `answer` returns; everything else hangs until its signal aborts.
 */
function hangingSupabase(answer: (method: string, url: string) => unknown | undefined) {
	const sent: Array<{ method: string; url: string; signal: AbortSignal | null }> = [];
	const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
		const method = init?.method ?? 'GET';
		const url = String(input);
		const signal = init?.signal ?? null;
		sent.push({ method, url, signal });
		const body = answer(method, url);
		if (body !== undefined) {
			return Promise.resolve(
				new Response(JSON.stringify(body), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})
			);
		}
		return new Promise<Response>((_resolve, reject) => {
			signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
		});
	});
	const client = createClient('http://localhost:54321', 'service-role-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch: fetch as unknown as typeof globalThis.fetch }
	});
	return { client, sent };
}

/** Pre-resolve the turn's actor and project lookups, as an earlier write would. */
function seedTurnMemo(input: ReturnType<typeof executionInput>) {
	const memo = gatewayMemoForTurn(
		(input as unknown as { claim: { turnRunId: string; executionGeneration: number } }).claim
	);
	memo.actorId = Promise.resolve(ACTOR_ID);
	memo.projectSummaries = Promise.resolve([
		{
			id: PROJECT_ID,
			name: 'Fixture project',
			state_key: 'active',
			access_level: 'write',
			access_role: 'owner',
			owner_actor_id: ACTOR_ID
		}
	] as never);
}

const STORED_DOCUMENT = {
	id: DOCUMENT_ID,
	project_id: PROJECT_ID,
	title: 'Decision log',
	description: null,
	type_key: 'document.default',
	state_key: 'draft',
	content: 'Old body',
	props: {},
	children: null,
	created_by: ACTOR_ID,
	created_at: NOW,
	updated_at: NOW,
	archived_at: null,
	deleted_at: null
};

describe('write deadline end to end through the real gateway', () => {
	function fullStack(answer: (method: string, url: string) => unknown | undefined) {
		const supabase = hangingSupabase(answer);
		const control = effectControl();
		const executor = new AgenticChatMutationExecutor(
			{
				control: control as never,
				mutatingTool: new AgenticChatTableMutationAdapter(supabase.client as never)
			},
			{ writeDeadlineMs: 60, writeDeadlineSettleMs: 1_000 }
		);
		return { ...supabase, control, executor };
	}

	it('cancels a stuck document save and ends the write uncertain within the deadline', async () => {
		const stack = fullStack((method, url) =>
			method === 'GET' && url.includes('/onto_documents') ? STORED_DOCUMENT : undefined
		);
		const input = executionInput();
		seedTurnMemo(input);
		const startedAt = Date.now();

		const error = await rejection(
			stack.executor.execute({
				executionInput: input,
				processingToken: PROCESSING_TOKEN,
				step: step(),
				signal: new AbortController().signal
			})
		);

		expect(Date.now() - startedAt).toBeLessThan(2_000);
		const save = stack.sent.find((request) => request.method === 'PATCH');
		expect(save?.url).toContain('/rest/v1/onto_documents');
		// The HTTP request itself was cancelled, not just abandoned.
		expect(save?.signal?.aborted).toBe(true);
		expect(error).toMatchObject({
			failureClass: 'uncertain_external_commit',
			failureCode: 'update_onto_document_write_timeout'
		});
		expect(stack.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				targetState: 'uncertain',
				failureCode: 'update_onto_document_write_timeout'
			})
		);
	});

	it('records a known failure when the save timed out before anything was sent', async () => {
		const stack = fullStack(() => undefined);
		const input = executionInput();
		seedTurnMemo(input);

		const error = await rejection(
			stack.executor.execute({
				executionInput: input,
				processingToken: PROCESSING_TOKEN,
				step: step(),
				signal: new AbortController().signal
			})
		);

		expect(stack.sent.map((request) => request.method)).toEqual(['GET']);
		expect(stack.sent[0]?.signal?.aborted).toBe(true);
		expect(error).toMatchObject({
			failureClass: 'permanent',
			failureCode: 'update_onto_document_write_timeout_not_sent'
		});
		expect(stack.control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({ targetState: 'failed' })
		);
	});
});
