// apps/worker/tests/cycleWorkerAdversarial.test.ts
import type { CycleQueueJobMetadata, CycleRunFor, CycleRunOutcome } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import { PermanentQueueError, TransientQueueError } from '../src/lib/queueErrors';
import { CycleHandlerRegistry } from '../src/workers/cycle/cycleHandlerRegistry';
import { createCycleRunProcessor, type CycleRunStore } from '../src/workers/cycle/cycleWorker';

const CYCLE_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const QUEUE_ROW_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const FIRST_TOKEN = '55555555-5555-4555-8555-555555555555';
const SECOND_TOKEN = '77777777-7777-4777-8777-777777777777';

const SUCCESS_OUTCOME = {
	status: 'artifact_created',
	attention_level: 'minor',
	summary: 'Daily brief is ready.',
	artifact_refs: [{ type: 'daily_brief', id: 'brief-1' }]
} satisfies CycleRunOutcome;

function makeRun(overrides: Partial<CycleRunFor<'daily_brief'>> = {}): CycleRunFor<'daily_brief'> {
	return {
		id: RUN_ID,
		cycle_id: CYCLE_ID,
		cycle_version: 1,
		user_id: USER_ID,
		project_id: null,
		kind: 'daily_brief',
		trigger: 'schedule',
		trigger_id: '66666666-6666-4666-8666-666666666666',
		status: 'running',
		triggered_at: '2026-08-25T12:58:00.000Z',
		scheduled_for: '2026-08-25T13:00:00.000Z',
		occurrence_key: 'schedule:2026-08-25T13:00:00.000Z',
		idempotency_key: `${CYCLE_ID}:schedule:2026-08-25T13:00:00.000Z`,
		definition_snapshot: {
			kind: 'daily_brief',
			version: 1,
			target: { type: 'user', project_id: null },
			config: {},
			policy: { overlap: 'skip', misfire: 'run_once', max_attempts: 3 },
			attention_policy: 'always'
		},
		trigger_snapshot: {
			type: 'schedule',
			schedule: {
				type: 'daily',
				time_of_day: '09:00',
				timezone: 'America/New_York'
			}
		},
		execution_input: {
			mode: 'scheduled',
			brief_date: '2026-08-25',
			timezone: 'America/New_York',
			force_regenerate: false
		},
		delivery_intent: {
			mode: 'evaluate',
			not_before: '2026-08-25T13:00:00.000Z'
		},
		queue_job_record_id: QUEUE_ROW_ID,
		queue_job_id: `run_cycle_${QUEUE_ROW_ID}`,
		processing_token: FIRST_TOKEN,
		attempt_count: 1,
		outcome: null,
		result: null,
		error_code: null,
		error_message: null,
		created_at: '2026-08-25T12:58:00.000Z',
		queued_at: '2026-08-25T12:58:00.000Z',
		started_at: '2026-08-25T12:58:05.000Z',
		finished_at: null,
		updated_at: '2026-08-25T12:58:05.000Z',
		...overrides
	};
}

function makeJob(
	overrides: Partial<ProcessingJob<CycleQueueJobMetadata>> = {}
): ProcessingJob<CycleQueueJobMetadata> {
	return {
		id: `run_cycle_${QUEUE_ROW_ID}`,
		queueRowId: QUEUE_ROW_ID,
		processingToken: FIRST_TOKEN,
		correlationId: null,
		userId: USER_ID,
		data: { cycle_id: CYCLE_ID, cycle_run_id: RUN_ID, kind: 'daily_brief' },
		attempts: 0,
		signal: new AbortController().signal,
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined),
		...overrides
	};
}

function makeStore(run = makeRun()): CycleRunStore {
	return {
		claim: vi.fn(async () => ({ disposition: 'claimed' as const, run })),
		complete: vi.fn(async () => true),
		fail: vi.fn(async () => true)
	};
}

function registryWith(
	handler: Parameters<CycleHandlerRegistry['register']>[1]
): CycleHandlerRegistry {
	const registry = new CycleHandlerRegistry();
	registry.register('daily_brief', handler);
	return registry;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
		throw new Error('Expected promise to reject.');
	} catch (error) {
		return error;
	}
}

describe('Cycle worker adversarial boundaries', () => {
	it('rejects malformed queue metadata before claiming any domain Run', async () => {
		const store = makeStore();
		const handler = vi.fn(async () => ({ outcome: SUCCESS_OUTCOME, result: null }));
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });
		const job = makeJob({
			data: {
				cycle_id: 'not-a-uuid',
				cycle_run_id: RUN_ID,
				kind: 'daily_brief'
			} as CycleQueueJobMetadata
		});

		const error = await caught(processor(job));

		expect(error).toMatchObject({
			code: 'cycle_metadata_invalid',
			kind: 'permanent'
		});
		expect(store.claim).not.toHaveBeenCalled();
		expect(handler).not.toHaveBeenCalled();
	});

	it.each([
		['queue row ID', { queueRowId: undefined }],
		['processing token', { processingToken: null }]
	] as const)('refuses to execute without the %s fence', async (_label, override) => {
		const store = makeStore();
		const handler = vi.fn(async () => ({ outcome: SUCCESS_OUTCOME, result: null }));
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		const error = await caught(processor(makeJob(override)));

		expect(error).toMatchObject({
			code: 'cycle_queue_fence_missing',
			kind: 'permanent'
		});
		expect(store.claim).not.toHaveBeenCalled();
		expect(handler).not.toHaveBeenCalled();
	});

	it.each([
		['Run ID', { id: '88888888-8888-4888-8888-888888888888' }],
		['Cycle ID', { cycle_id: '88888888-8888-4888-8888-888888888888' }],
		['user ID', { user_id: '88888888-8888-4888-8888-888888888888' }]
	] as const)('terminally rejects a claimed Run with a mismatched %s', async (_label, patch) => {
		const store = makeStore(makeRun(patch));
		const handler = vi.fn(async () => ({ outcome: SUCCESS_OUTCOME, result: null }));
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		const error = await caught(processor(makeJob()));

		expect(error).toMatchObject({
			code: 'cycle_envelope_mismatch',
			kind: 'permanent'
		});
		expect(store.fail).toHaveBeenCalledWith(
			expect.objectContaining({
				cycleRunId: patch.id ?? RUN_ID,
				processingToken: FIRST_TOKEN,
				terminal: true
			})
		);
		expect(handler).not.toHaveBeenCalled();
	});

	it('treats a missing kind handler as a terminal configuration failure', async () => {
		const store = makeStore();
		const processor = createCycleRunProcessor({
			registry: new CycleHandlerRegistry(),
			store
		});

		const error = await caught(processor(makeJob()));

		expect(error).toMatchObject({ code: 'cycle_handler_missing', kind: 'permanent' });
		expect(store.fail).toHaveBeenCalledWith(
			expect.objectContaining({ terminal: true, errorCode: 'cycle_handler_missing' })
		);
	});

	it('records an ordinary transient handler failure as retryable before the attempt limit', async () => {
		const store = makeStore();
		const handlerError = new TransientQueueError(
			'provider_unavailable',
			'Provider unavailable.'
		);
		const handler = vi.fn(async () => {
			throw handlerError;
		});
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		await expect(processor(makeJob({ attempts: 0 }))).rejects.toBe(handlerError);
		expect(store.fail).toHaveBeenCalledWith({
			cycleRunId: RUN_ID,
			processingToken: FIRST_TOKEN,
			errorCode: 'provider_unavailable',
			errorMessage: 'Provider unavailable.',
			terminal: false
		});
	});

	it('terminalizes even a transient failure when the final attempt is consumed', async () => {
		const store = makeStore();
		const handlerError = new TransientQueueError('provider_timeout', 'Provider timed out.');
		const handler = vi.fn(async () => {
			throw handlerError;
		});
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		await expect(processor(makeJob({ attempts: 2 }))).rejects.toBe(handlerError);
		expect(store.fail).toHaveBeenCalledWith(
			expect.objectContaining({ errorCode: 'provider_timeout', terminal: true })
		);
	});

	it('terminalizes a permanent handler failure without spending the remaining retries', async () => {
		const store = makeStore();
		const handlerError = new PermanentQueueError('invalid_definition', 'Invalid definition.');
		const handler = vi.fn(async () => {
			throw handlerError;
		});
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		await expect(processor(makeJob({ attempts: 0 }))).rejects.toBe(handlerError);
		expect(store.fail).toHaveBeenCalledWith(
			expect.objectContaining({ errorCode: 'invalid_definition', terminal: true })
		);
	});

	it('does not replace the domain error when failure recording is temporarily unavailable', async () => {
		const store = makeStore();
		vi.mocked(store.fail).mockRejectedValueOnce(new Error('database unavailable'));
		const handlerError = new TransientQueueError('provider_timeout', 'Provider timed out.');
		const handler = vi.fn(async () => {
			throw handlerError;
		});
		const job = makeJob();
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		await expect(processor(job)).rejects.toBe(handlerError);
		expect(job.log).toHaveBeenCalledWith(
			'Could not record Cycle Run failure: database unavailable'
		);
	});

	it('turns a lost completion fence into a transient retry instead of reporting success', async () => {
		const store = makeStore();
		vi.mocked(store.complete).mockResolvedValueOnce(false);
		vi.mocked(store.fail).mockResolvedValueOnce(false);
		const handler = vi.fn(async () => ({ outcome: SUCCESS_OUTCOME, result: null }));
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		const error = await caught(processor(makeJob()));

		expect(error).toMatchObject({
			code: 'cycle_completion_fence_lost',
			kind: 'transient'
		});
		expect(store.fail).toHaveBeenCalledWith(
			expect.objectContaining({ processingToken: FIRST_TOKEN, terminal: false })
		);
	});

	it.each(['completed', 'failed', 'cancelled', 'skipped'] as const)(
		'acknowledges a %s Run without executing domain work again',
		async (status) => {
			const run = makeRun({
				status,
				outcome: status === 'completed' ? SUCCESS_OUTCOME : null
			});
			const store = makeStore(run);
			vi.mocked(store.claim).mockResolvedValueOnce({
				disposition: 'already_terminal',
				run
			});
			const handler = vi.fn(async () => ({ outcome: SUCCESS_OUTCOME, result: null }));
			const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

			await expect(processor(makeJob())).resolves.toEqual({
				cycle_run_id: RUN_ID,
				outcome: run.outcome,
				already_terminal: true
			});
			expect(handler).not.toHaveBeenCalled();
			expect(store.complete).not.toHaveBeenCalled();
			expect(store.fail).not.toHaveBeenCalled();
		}
	);

	it('recovers the same admitted Run on a later token after a retryable failure', async () => {
		const store = makeStore();
		const handler = vi
			.fn()
			.mockRejectedValueOnce(
				new TransientQueueError('provider_unavailable', 'Provider unavailable.')
			)
			.mockResolvedValueOnce({ outcome: SUCCESS_OUTCOME, result: { brief_id: 'brief-1' } });
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		await expect(processor(makeJob())).rejects.toThrow('Provider unavailable.');
		await expect(
			processor(makeJob({ processingToken: SECOND_TOKEN, attempts: 1 }))
		).resolves.toEqual({
			cycle_run_id: RUN_ID,
			outcome: SUCCESS_OUTCOME,
			already_terminal: false
		});

		expect(store.claim).toHaveBeenNthCalledWith(1, {
			cycleRunId: RUN_ID,
			queueJobRecordId: QUEUE_ROW_ID,
			processingToken: FIRST_TOKEN
		});
		expect(store.claim).toHaveBeenNthCalledWith(2, {
			cycleRunId: RUN_ID,
			queueJobRecordId: QUEUE_ROW_ID,
			processingToken: SECOND_TOKEN
		});
		expect(handler).toHaveBeenCalledTimes(2);
		expect(store.complete).toHaveBeenCalledWith(
			expect.objectContaining({ processingToken: SECOND_TOKEN })
		);
	});

	it('fences stale terminal writes when two retry attempts overlap', async () => {
		let currentOwner: string | null = null;
		let terminalOutcome: CycleRunOutcome | null = null;
		let releaseFirst!: () => void;
		let markFirstEntered!: () => void;
		const firstEntered = new Promise<void>((resolve) => {
			markFirstEntered = resolve;
		});
		const firstMayFinish = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});

		const store: CycleRunStore = {
			claim: vi.fn(async ({ processingToken }) => {
				currentOwner = processingToken;
				return {
					disposition: 'claimed' as const,
					run: makeRun({ processing_token: processingToken })
				};
			}),
			complete: vi.fn(async ({ processingToken, outcome }) => {
				if (currentOwner !== processingToken) return false;
				terminalOutcome = outcome;
				return true;
			}),
			fail: vi.fn(async ({ processingToken }) => currentOwner === processingToken)
		};
		const firstOutcome = {
			...SUCCESS_OUTCOME,
			summary: 'Stale attempt outcome.'
		} satisfies CycleRunOutcome;
		const secondOutcome = {
			...SUCCESS_OUTCOME,
			summary: 'Current attempt outcome.'
		} satisfies CycleRunOutcome;
		const handler = vi.fn(async ({ job }: { job: ProcessingJob<CycleQueueJobMetadata> }) => {
			if (job.processingToken === FIRST_TOKEN) {
				markFirstEntered();
				await firstMayFinish;
				return { outcome: firstOutcome, result: null };
			}
			return { outcome: secondOutcome, result: null };
		});
		const processor = createCycleRunProcessor({ registry: registryWith(handler), store });

		const firstResult = processor(makeJob()).then(
			(value) => ({ ok: true as const, value }),
			(error: unknown) => ({ ok: false as const, error })
		);
		await firstEntered;

		await expect(
			processor(makeJob({ processingToken: SECOND_TOKEN, attempts: 1 }))
		).resolves.toEqual(
			expect.objectContaining({ outcome: secondOutcome, already_terminal: false })
		);

		releaseFirst();
		const staleResult = await firstResult;

		expect(staleResult.ok).toBe(false);
		if (staleResult.ok) throw new Error('The stale executor unexpectedly completed.');
		expect(staleResult.error).toMatchObject({
			code: 'cycle_completion_fence_lost',
			kind: 'transient'
		});
		expect(terminalOutcome).toEqual(secondOutcome);
		expect(handler).toHaveBeenCalledTimes(2);
		expect(store.complete).toHaveBeenCalledTimes(2);
		expect(store.fail).toHaveBeenCalledWith(
			expect.objectContaining({ processingToken: FIRST_TOKEN })
		);
	});
});
