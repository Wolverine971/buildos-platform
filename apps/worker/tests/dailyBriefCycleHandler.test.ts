// apps/worker/tests/dailyBriefCycleHandler.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CycleQueueJobMetadata, CycleRunFor } from '@buildos/shared-types';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import { processBriefJob } from '../src/workers/brief/briefWorker';
import { processDailyBriefCycle } from '../src/workers/cycle/dailyBriefCycleHandler';

vi.mock('../src/workers/brief/briefWorker', () => ({
	processBriefJob: vi.fn()
}));

const cycleId = '11111111-1111-4111-8111-111111111111';
const cycleRunId = '22222222-2222-4222-8222-222222222222';
const queueRowId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';
const processingToken = '55555555-5555-4555-8555-555555555555';

function makeRun(overrides: Partial<CycleRunFor<'daily_brief'>> = {}): CycleRunFor<'daily_brief'> {
	return {
		id: cycleRunId,
		cycle_id: cycleId,
		cycle_version: 3,
		user_id: userId,
		project_id: null,
		kind: 'daily_brief',
		trigger: 'schedule',
		trigger_id: '66666666-6666-4666-8666-666666666666',
		status: 'running',
		triggered_at: '2026-08-25T12:58:00.000Z',
		scheduled_for: '2026-08-25T13:00:00.000Z',
		occurrence_key: 'schedule:2026-08-25T13:00:00.000Z',
		idempotency_key: `${cycleId}:schedule:2026-08-25T13:00:00.000Z`,
		definition_snapshot: {
			kind: 'daily_brief',
			version: 3,
			target: { type: 'user', project_id: null },
			config: { generation_lead_minutes: 2 },
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
			force_regenerate: false,
			include_projects: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
			exclude_projects: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
			custom_template: 'Focus on decisions.',
			use_ontology: false
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
		updated_at: '2026-08-25T12:58:05.000Z',
		...overrides
	};
}

function makeJob(): ProcessingJob<CycleQueueJobMetadata> {
	return {
		id: `run_cycle_${queueRowId}`,
		queueRowId,
		processingToken,
		correlationId: 'cycle-test-correlation',
		userId,
		data: { cycle_id: cycleId, cycle_run_id: cycleRunId, kind: 'daily_brief' },
		attempts: 0,
		signal: new AbortController().signal,
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined)
	};
}

describe('Daily Brief Cycle handler', () => {
	beforeEach(() => {
		vi.mocked(processBriefJob).mockReset();
	});

	it('forwards the immutable scheduled input while leaving queue ownership to the Cycle worker', async () => {
		vi.mocked(processBriefJob).mockResolvedValue({
			status: 'generated',
			briefId: 'brief-1',
			briefDate: '2026-08-25',
			notificationOutcome: 'emitted'
		});

		const job = makeJob();
		const result = await processDailyBriefCycle({ run: makeRun(), job });

		expect(processBriefJob).toHaveBeenCalledWith(
			expect.objectContaining({
				id: `run_cycle_${queueRowId}`,
				processingToken,
				correlationId: 'cycle-test-correlation',
				signal: job.signal,
				data: {
					userId,
					briefDate: '2026-08-25',
					timezone: 'America/New_York',
					notificationScheduledFor: '2026-08-25T13:00:00.000Z',
					options: {
						forceRegenerate: false,
						includeProjects: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
						excludeProjects: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
						customTemplate: 'Focus on decisions.',
						requestedBriefDate: undefined,
						useOntology: false,
						suppressNotification: false,
						notificationSuppressionReason: undefined
					}
				}
			}),
			{
				manageQueueRecord: false,
				cycleRunId,
				emitFailureEffects: false
			}
		);
		expect(result).toEqual({
			outcome: {
				status: 'artifact_created',
				attention_level: 'minor',
				summary: 'Daily brief for 2026-08-25 is ready.',
				artifact_refs: [{ type: 'daily_brief', id: 'brief-1', label: '2026-08-25' }]
			},
			result: {
				status: 'generated',
				brief_id: 'brief-1',
				brief_date: '2026-08-25',
				notification_outcome: 'emitted'
			}
		});
	});

	it('suppresses delivery and preserves the requested date for a catch-up occurrence', async () => {
		vi.mocked(processBriefJob).mockResolvedValue({
			status: 'existing',
			briefId: 'brief-existing',
			briefDate: '2026-08-24'
		});
		const run = makeRun({
			execution_input: {
				mode: 'catch_up',
				brief_date: '2026-08-24',
				timezone: 'America/New_York',
				force_regenerate: false
			},
			delivery_intent: { mode: 'suppress', reason: 'operator_requested' }
		});

		const result = await processDailyBriefCycle({ run, job: makeJob() });

		expect(processBriefJob).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					notificationScheduledFor: undefined,
					options: expect.objectContaining({
						requestedBriefDate: '2026-08-24',
						useOntology: true,
						suppressNotification: true,
						notificationSuppressionReason: 'cycle_delivery_suppressed'
					})
				})
			}),
			expect.objectContaining({ manageQueueRecord: false, emitFailureEffects: false })
		);
		expect(result.outcome).toMatchObject({
			status: 'artifact_created',
			summary: 'Daily brief for 2026-08-24 was already ready.'
		});
	});

	it.each([
		['already_processing' as const, 'Daily brief for 2026-08-25 is already processing.'],
		['stale' as const, 'Skipped stale Daily Brief occurrence for 2026-08-25.']
	])('normalizes %s as a no-change outcome', async (status, summary) => {
		vi.mocked(processBriefJob).mockResolvedValue({
			status,
			briefId: null,
			briefDate: '2026-08-25'
		});

		const result = await processDailyBriefCycle({ run: makeRun(), job: makeJob() });

		expect(result.outcome).toEqual({
			status: 'no_change',
			attention_level: 'none',
			summary,
			artifact_refs: []
		});
	});

	it('propagates domain failures so the generic Cycle processor owns retry state', async () => {
		vi.mocked(processBriefJob).mockRejectedValue(new Error('provider unavailable'));

		await expect(processDailyBriefCycle({ run: makeRun(), job: makeJob() })).rejects.toThrow(
			'provider unavailable'
		);
		expect(processBriefJob).toHaveBeenCalledWith(
			expect.any(Object),
			expect.objectContaining({
				manageQueueRecord: false,
				cycleRunId,
				emitFailureEffects: false
			})
		);
	});
});
