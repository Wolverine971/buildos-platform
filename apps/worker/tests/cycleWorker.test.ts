import { describe, expect, it, vi } from 'vitest';
import type { CycleQueueJobMetadata, CycleRunFor, CycleRunOutcome } from '@buildos/shared-types';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import { CycleHandlerRegistry } from '../src/workers/cycle/cycleHandlerRegistry';
import { createCycleRunProcessor, type CycleRunStore } from '../src/workers/cycle/cycleWorker';

const cycleId = '11111111-1111-4111-8111-111111111111';
const cycleRunId = '22222222-2222-4222-8222-222222222222';
const queueRowId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const processingToken = '55555555-5555-4555-8555-555555555555';

function makeRun(status: CycleRunFor<'daily_brief'>['status'] = 'running') {
	return {
		id: cycleRunId,
		cycle_id: cycleId,
		cycle_version: 1,
		user_id: userId,
		project_id: null,
		kind: 'daily_brief',
		trigger: 'schedule',
		trigger_id: '66666666-6666-4666-8666-666666666666',
		status,
		triggered_at: '2026-08-25T12:58:00.000Z',
		scheduled_for: '2026-08-25T13:00:00.000Z',
		occurrence_key: 'schedule:2026-08-25T13:00:00.000Z',
		idempotency_key: `${cycleId}:schedule:2026-08-25T13:00:00.000Z`,
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
		delivery_intent: { mode: 'evaluate', not_before: '2026-08-25T13:00:00.000Z' },
		queue_job_record_id: queueRowId,
		queue_job_id: `run_cycle_${queueRowId}`,
		processing_token: processingToken,
		attempt_count: 1,
		outcome: null,
		result: null,
		error_code: null,
		error_message: null,
		created_at: '2026-08-25T12:58:00.000Z',
		queued_at: '2026-08-25T12:58:00.000Z',
		started_at: '2026-08-25T12:58:05.000Z',
		finished_at: null,
		updated_at: '2026-08-25T12:58:05.000Z'
	} satisfies CycleRunFor<'daily_brief'>;
}

function makeJob(): ProcessingJob<CycleQueueJobMetadata> {
	return {
		id: `run_cycle_${queueRowId}`,
		queueRowId,
		processingToken,
		correlationId: null,
		userId,
		data: { cycle_id: cycleId, cycle_run_id: cycleRunId, kind: 'daily_brief' },
		attempts: 0,
		signal: new AbortController().signal,
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined)
	};
}

function makeStore(run = makeRun()): CycleRunStore {
	return {
		claim: vi.fn(async () => ({ disposition: 'claimed' as const, run })),
		complete: vi.fn(async () => true),
		fail: vi.fn(async () => true)
	};
}

describe('Cycle worker', () => {
	it('routes one generic queue job through the kind registry and completes the admitted run', async () => {
		const outcome = {
			status: 'artifact_created',
			attention_level: 'minor',
			summary: 'Daily brief is ready.',
			artifact_refs: [{ type: 'daily_brief', id: 'brief-1' }]
		} satisfies CycleRunOutcome;
		const registry = new CycleHandlerRegistry();
		registry.register(
			'daily_brief',
			vi.fn(async () => ({ outcome, result: { brief_id: 'brief-1' } }))
		);
		const store = makeStore();
		const processor = createCycleRunProcessor({ registry, store });

		await expect(processor(makeJob())).resolves.toEqual({
			cycle_run_id: cycleRunId,
			outcome,
			already_terminal: false
		});
		expect(store.complete).toHaveBeenCalledWith(
			expect.objectContaining({ cycleRunId, processingToken, outcome })
		);
		expect(store.fail).not.toHaveBeenCalled();
	});

	it('acknowledges an already-terminal run without executing its handler again', async () => {
		const terminalRun = {
			...makeRun('completed'),
			outcome: {
				status: 'no_change',
				attention_level: 'none',
				summary: 'Already done.',
				artifact_refs: []
			} satisfies CycleRunOutcome
		};
		const store = makeStore(terminalRun);
		store.claim = vi.fn(async () => ({ disposition: 'already_terminal', run: terminalRun }));
		const registry = new CycleHandlerRegistry();
		const processor = createCycleRunProcessor({ registry, store });

		await expect(processor(makeJob())).resolves.toEqual(
			expect.objectContaining({ cycle_run_id: cycleRunId, already_terminal: true })
		);
		expect(store.complete).not.toHaveBeenCalled();
	});

	it('records an envelope mismatch as a terminal domain failure', async () => {
		const mismatchedRun = { ...makeRun(), cycle_id: '77777777-7777-4777-8777-777777777777' };
		const store = makeStore(mismatchedRun);
		const processor = createCycleRunProcessor({
			registry: new CycleHandlerRegistry(),
			store
		});

		await expect(processor(makeJob())).rejects.toThrow('does not match');
		expect(store.fail).toHaveBeenCalledWith(
			expect.objectContaining({
				cycleRunId,
				errorCode: 'cycle_envelope_mismatch',
				terminal: true
			})
		);
	});
});
