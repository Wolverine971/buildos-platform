// apps/worker/tests/agenticChatStatedFutureCapture.test.ts
import { AGENTIC_CHAT_INPUT_ARTIFACT_VERSION } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseAgenticChatStatedFutureCaptureAdapter } from '../src/workers/agentic-chat/statedFutureCapture';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000006';
const PROJECT_ID = '70000000-0000-4000-8000-000000000007';
const TASK_ID = '80000000-0000-4000-8000-000000000008';
const ACTOR_ID = '90000000-0000-4000-8000-000000000009';
const EXECUTION_GENERATION = 2;
const STARTED_AT = '2026-08-13T15:00:00.000Z';
const FINISHED_AT = '2026-08-13T15:00:01.000Z';

const executionInput = {
	claim: {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		correlationId: '50000000-0000-4000-8000-000000000005',
		executionGeneration: EXECUTION_GENERATION,
		status: 'running',
		inputArtifactId: 'a0000000-0000-4000-8000-00000000000a',
		userMessageId: 'b0000000-0000-4000-8000-00000000000b'
	},
	streamRunId: 'stream-stated-future-1',
	clientTurnId: 'client-stated-future-1',
	requestPayload: {
		clientTurnId: 'client-stated-future-1',
		streamRunId: 'stream-stated-future-1',
		message: "I closed the old task. Now I'm waiting to hear back from legal.",
		context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
	},
	artifact: {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource: 'admission_window',
		history: [],
		prepared: {
			sourcePreparedPromptId: null,
			contextPayload: {},
			conversationSummary: null,
			surfaceProfile: 'fixture',
			systemPrompt: 'fixture',
			promptSections: [],
			toolSurface: {},
			sessionSnapshot: { summary: null, agent_metadata: {} },
			contextUsageSnapshot: {
				estimatedTokens: 1,
				tokenBudget: 10,
				usagePercent: 10,
				tokensRemaining: 9,
				status: 'ok',
				lastCompressedAt: null,
				lastCompression: null
			}
		},
		createdAt: '2026-08-13T14:00:00.000Z',
		retainUntil: '2026-08-20T14:00:00.000Z',
		contentHash: '0'.repeat(64)
	},
	timingBaseline: {
		admittedAt: '2026-08-13T13:59:55.000Z',
		startedAt: '2026-08-13T13:59:56.000Z',
		workerStartedAt: '2026-08-13T13:59:57.000Z',
		executionStartedAt: '2026-08-13T13:59:58.000Z',
		historyCutoffAt: '2026-08-13T13:59:56.000Z',
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
	}
} as const;

function evidenceReceipt(
	executions: unknown[] = [
		{ name: 'update_onto_task', success: true, error: null, args: {}, result: {} }
	],
	outcome = 'eligible'
) {
	return {
		outcome,
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: EXECUTION_GENERATION,
		stream_run_id: executionInput.streamRunId,
		executions
	};
}

function createControl(options: { replayReceipt?: Record<string, unknown> } = {}) {
	const effectReceipt = (
		input: { effectId: string },
		overrides: Record<string, unknown> = {}
	) => ({
		effectId: input.effectId,
		turnRunId: TURN_RUN_ID,
		executionGeneration: EXECUTION_GENERATION,
		sessionId: SESSION_ID,
		userId: USER_ID,
		state: 'reserved',
		downstreamIdempotencySupported: true,
		downstreamReceipt: null,
		startedAt: null,
		finishedAt: null,
		outcome: 'reserved',
		invokeAdapter: false,
		...overrides
	});
	return {
		reserve: vi.fn(async (input: { effectId: string }) =>
			options.replayReceipt
				? effectReceipt(input, {
						state: 'succeeded',
						startedAt: STARTED_AT,
						finishedAt: FINISHED_AT,
						downstreamReceipt: options.replayReceipt,
						outcome: 'existing'
					})
				: effectReceipt(input)
		),
		begin: vi.fn(async (input: { effectId: string }) =>
			effectReceipt(input, {
				state: 'started',
				startedAt: STARTED_AT,
				outcome: 'started',
				invokeAdapter: true
			})
		),
		reconcile: vi.fn(
			async (input: { effectId: string; targetState: string; downstreamReceipt: unknown }) =>
				effectReceipt(input, {
					state: input.targetState,
					startedAt: STARTED_AT,
					finishedAt: FINISHED_AT,
					downstreamReceipt: input.downstreamReceipt,
					outcome: 'reconciled'
				})
		)
	};
}

describe('SupabaseAgenticChatStatedFutureCaptureAdapter', () => {
	it('creates one effect-backed task from raw user text and durable write evidence', async () => {
		const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
			if (name === 'load_agentic_chat_stated_future_evidence') {
				return { data: evidenceReceipt(), error: null };
			}
			if (name === 'ensure_actor_for_user') return { data: ACTOR_ID, error: null };
			expect(name).toBe('onto_task_create_atomic');
			return { data: { task: { id: TASK_ID }, idempotent_replay: false }, error: null };
		});
		const control = createControl();
		const adapter = new SupabaseAgenticChatStatedFutureCaptureAdapter(
			{ rpc },
			control as never
		);

		await expect(
			adapter.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toEqual({
			status: 'created',
			effectId: expect.stringMatching(/^[0-9a-f-]{36}$/),
			taskId: TASK_ID,
			title: "Now I'm waiting to hear back from legal"
		});
		expect(rpc).toHaveBeenNthCalledWith(1, 'load_agentic_chat_stated_future_evidence', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: EXECUTION_GENERATION
		});
		expect(rpc).toHaveBeenNthCalledWith(
			3,
			'onto_task_create_atomic',
			expect.objectContaining({
				p_source: 'agent',
				p_idempotency_key: 'stated_future_capture:stream-stated-future-1',
				p_task: expect.objectContaining({
					project_id: PROJECT_ID,
					title: "Now I'm waiting to hear back from legal",
					type_key: 'task.default',
					state_key: 'todo',
					created_by: ACTOR_ID,
					props: {
						source: 'stated_future_capture',
						source_stream_run_id: 'stream-stated-future-1'
					}
				})
			})
		);
		expect(control.reserve).toHaveBeenCalledOnce();
		expect(control.begin).toHaveBeenCalledOnce();
		expect(control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				targetState: 'succeeded',
				downstreamReceipt: {
					status: 'created',
					task_id: TASK_ID,
					project_id: PROJECT_ID
				}
			})
		);
	});

	it('skips before effects for non-conservative text or evidence with a durable create', async () => {
		const rpc = vi.fn(async () => ({
			data: evidenceReceipt([
				{ name: 'update_onto_task', success: true, error: null, args: {}, result: {} },
				{ name: 'create_onto_task', success: true, error: null, args: {}, result: {} }
			]),
			error: null
		}));
		const control = createControl();
		const adapter = new SupabaseAgenticChatStatedFutureCaptureAdapter(
			{ rpc },
			control as never
		);

		await expect(
			adapter.capture({
				executionInput: {
					...executionInput,
					requestPayload: {
						...executionInput.requestPayload,
						message: "I'll send it tomorrow."
					}
				},
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toEqual({ status: 'skipped', reason: 'not_stated_future' });
		expect(rpc).not.toHaveBeenCalled();

		await expect(
			adapter.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toEqual({ status: 'skipped', reason: 'not_eligible' });
		expect(control.reserve).not.toHaveBeenCalled();
	});

	it('replays a committed effect without invoking the task RPC again', async () => {
		const rpc = vi.fn(async () => ({ data: evidenceReceipt(), error: null }));
		const control = createControl({
			replayReceipt: { status: 'created', task_id: TASK_ID, project_id: PROJECT_ID }
		});
		const adapter = new SupabaseAgenticChatStatedFutureCaptureAdapter(
			{ rpc },
			control as never
		);

		await expect(
			adapter.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toMatchObject({ status: 'duplicate', taskId: TASK_ID });
		expect(rpc).toHaveBeenCalledOnce();
		expect(control.begin).not.toHaveBeenCalled();
		expect(control.reconcile).not.toHaveBeenCalled();
	});

	it('retries an ambiguous task response with the exact legacy idempotency key', async () => {
		let taskAttempts = 0;
		const taskKeys: unknown[] = [];
		const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
			if (name === 'load_agentic_chat_stated_future_evidence') {
				return Promise.resolve({ data: evidenceReceipt(), error: null });
			}
			if (name === 'ensure_actor_for_user') {
				return Promise.resolve({ data: ACTOR_ID, error: null });
			}
			taskAttempts += 1;
			taskKeys.push(args.p_idempotency_key);
			if (taskAttempts === 1) throw new Error('response lost after commit');
			return Promise.resolve({
				data: { task: { id: TASK_ID }, idempotent_replay: true },
				error: null
			});
		});
		const adapter = new SupabaseAgenticChatStatedFutureCaptureAdapter(
			{ rpc },
			createControl() as never
		);

		await expect(
			adapter.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toMatchObject({ status: 'duplicate', taskId: TASK_ID });
		expect(taskKeys).toEqual([
			'stated_future_capture:stream-stated-future-1',
			'stated_future_capture:stream-stated-future-1'
		]);
	});

	it('honors a fenced cancellation outcome without reserving an effect', async () => {
		const rpc = vi.fn(async () => ({
			data: evidenceReceipt([], 'cancel_requested'),
			error: null
		}));
		const control = createControl();
		const adapter = new SupabaseAgenticChatStatedFutureCaptureAdapter(
			{ rpc },
			control as never
		);

		await expect(
			adapter.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toEqual({ status: 'skipped', reason: 'cancel_requested' });
		expect(control.reserve).not.toHaveBeenCalled();
	});

	it('terminally reconciles a coded task failure without an unsafe retry', async () => {
		const rpc = vi.fn(async (name: string) => {
			if (name === 'load_agentic_chat_stated_future_evidence') {
				return { data: evidenceReceipt(), error: null };
			}
			if (name === 'ensure_actor_for_user') return { data: ACTOR_ID, error: null };
			return {
				data: null,
				error: { code: '23503', message: 'project no longer exists' }
			};
		});
		const control = createControl();
		const adapter = new SupabaseAgenticChatStatedFutureCaptureAdapter(
			{ rpc },
			control as never
		);

		await expect(
			adapter.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).rejects.toMatchObject({ failureClass: 'permanent' });
		expect(rpc).toHaveBeenCalledTimes(3);
		expect(control.reconcile).toHaveBeenCalledWith(
			expect.objectContaining({
				targetState: 'failed',
				downstreamReceipt: null,
				failureCode: expect.stringContaining('23503')
			})
		);
	});

	it('rejects a cross-bound evidence receipt before reserving an effect', async () => {
		const rpc = vi.fn(async () => ({
			data: {
				...evidenceReceipt(),
				turn_run_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff'
			},
			error: null
		}));
		const control = createControl();
		const adapter = new SupabaseAgenticChatStatedFutureCaptureAdapter(
			{ rpc },
			control as never
		);

		await expect(
			adapter.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).rejects.toThrow('evidence receipt scope is inconsistent');
		expect(control.reserve).not.toHaveBeenCalled();
	});
});
