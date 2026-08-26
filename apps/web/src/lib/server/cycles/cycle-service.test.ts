// apps/web/src/lib/server/cycles/cycle-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CycleServiceError, admitManualCycleRun, createCycle, updateCycle } from './cycle-service';

const CYCLE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function cycleRow(overrides: Record<string, unknown> = {}) {
	return {
		id: CYCLE_ID,
		user_id: USER_ID,
		label: 'Daily Brief',
		kind: 'daily_brief',
		state: 'active',
		target_type: 'user',
		project_id: null,
		config: { generation_lead_minutes: 10 },
		policy: { overlap: 'skip', misfire: 'run_once', max_attempts: 3 },
		attention_policy: 'always',
		version: 1,
		next_run_at: '2026-08-26T13:00:00.000Z',
		last_run_at: null,
		last_run_id: null,
		last_error: null,
		created_at: '2026-08-25T12:00:00.000Z',
		updated_at: '2026-08-25T12:00:00.000Z',
		deleted_at: null,
		triggers: [],
		...overrides
	};
}

function createReadClient(row = cycleRow()) {
	const builder: Record<string, any> = {};
	for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
	return { from: vi.fn(() => builder), builder };
}

function validCreatePayload() {
	return {
		request_id: 'create-brief-1',
		label: 'Daily Brief',
		kind: 'daily_brief',
		target: { type: 'user', project_id: null },
		config: {},
		triggers: [
			{
				type: 'schedule',
				schedule: {
					type: 'daily',
					time_of_day: '09:00',
					timezone: 'America/New_York'
				}
			}
		]
	};
}

describe('Cycle service', () => {
	it('derives mutation ownership from the authenticated user and materializes due time', async () => {
		const readClient = createReadClient();
		const commandClient = { rpc: vi.fn(async () => ({ data: { id: CYCLE_ID }, error: null })) };

		const cycle = await createCycle({
			readClient,
			commandClient,
			userId: USER_ID,
			payload: {
				...validCreatePayload(),
				config: { generation_lead_minutes: 10 }
			},
			now: new Date('2026-08-25T14:00:00.000Z')
		});

		expect(cycle.id).toBe(CYCLE_ID);
		expect(commandClient.rpc).toHaveBeenCalledWith(
			'create_cycle',
			expect.objectContaining({
				p_user_id: USER_ID,
				p_config: { generation_lead_minutes: 10 },
				p_triggers: [expect.objectContaining({ next_run_at: '2026-08-26T13:00:00.000Z' })]
			})
		);
	});

	it('rejects an out-of-range Daily Brief generation lead', async () => {
		const commandClient = { rpc: vi.fn() };

		await expect(
			createCycle({
				readClient: createReadClient(),
				commandClient,
				userId: USER_ID,
				payload: {
					...validCreatePayload(),
					config: { generation_lead_minutes: 31 }
				}
			})
		).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
		expect(commandClient.rpc).not.toHaveBeenCalled();
	});

	it('rejects a caller-supplied user_id before reaching the service-role RPC', async () => {
		const commandClient = { rpc: vi.fn() };

		await expect(
			createCycle({
				readClient: createReadClient(),
				commandClient,
				userId: USER_ID,
				payload: { ...validCreatePayload(), user_id: 'attacker-user' }
			})
		).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
		expect(commandClient.rpc).not.toHaveBeenCalled();
	});

	it('routes a state-only patch through the compare-and-swap pause command', async () => {
		const commandClient = { rpc: vi.fn(async () => ({ data: cycleRow(), error: null })) };

		await updateCycle({
			readClient: createReadClient(cycleRow({ state: 'paused', version: 2 })),
			commandClient,
			userId: USER_ID,
			cycleId: CYCLE_ID,
			payload: { expected_version: 1, state: 'paused' }
		});

		expect(commandClient.rpc).toHaveBeenCalledWith('pause_cycle', {
			p_user_id: USER_ID,
			p_cycle_id: CYCLE_ID,
			p_expected_version: 1
		});
	});

	it('materializes and atomically replaces a Cycle trigger set', async () => {
		const commandClient = { rpc: vi.fn(async () => ({ data: cycleRow(), error: null })) };

		await updateCycle({
			readClient: createReadClient(cycleRow({ version: 2 })),
			commandClient,
			userId: USER_ID,
			cycleId: CYCLE_ID,
			payload: {
				expected_version: 1,
				triggers: [
					{
						type: 'schedule',
						schedule: {
							type: 'weekly',
							days_of_week: [1, 3],
							time_of_day: '09:30',
							timezone: 'America/New_York'
						}
					}
				]
			},
			now: new Date('2026-08-25T14:00:00.000Z')
		});

		expect(commandClient.rpc).toHaveBeenCalledWith('replace_cycle_triggers', {
			p_user_id: USER_ID,
			p_cycle_id: CYCLE_ID,
			p_expected_version: 1,
			p_triggers: [
				expect.objectContaining({
					type: 'schedule',
					next_run_at: '2026-08-26T13:30:00.000Z'
				})
			]
		});
	});

	it('rejects mixed definition and trigger patches instead of issuing two writes', async () => {
		const commandClient = { rpc: vi.fn() };

		await expect(
			updateCycle({
				readClient: createReadClient(),
				commandClient,
				userId: USER_ID,
				cycleId: CYCLE_ID,
				payload: {
					expected_version: 1,
					label: 'Morning Brief',
					triggers: validCreatePayload().triggers
				}
			})
		).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
		expect(commandClient.rpc).not.toHaveBeenCalled();
	});

	it('re-materializes stale schedule projections before atomically resuming', async () => {
		const triggerId = '33333333-3333-4333-8333-333333333333';
		const pausedCycle = cycleRow({
			state: 'paused',
			triggers: [
				{
					id: triggerId,
					cycle_id: CYCLE_ID,
					spec: {
						type: 'schedule',
						schedule: {
							type: 'daily',
							time_of_day: '09:00',
							timezone: 'America/New_York'
						}
					},
					state: 'active',
					version: 1,
					next_run_at: '2020-01-01T14:00:00.000Z',
					last_fired_at: null,
					created_at: '2026-08-25T12:00:00.000Z',
					updated_at: '2026-08-25T12:00:00.000Z',
					deleted_at: null
				}
			]
		});
		const commandClient = { rpc: vi.fn(async () => ({ data: pausedCycle, error: null })) };

		await updateCycle({
			readClient: createReadClient(pausedCycle),
			commandClient,
			userId: USER_ID,
			cycleId: CYCLE_ID,
			payload: { expected_version: 1, state: 'active' },
			now: new Date('2026-08-25T14:00:00.000Z')
		});

		expect(commandClient.rpc).toHaveBeenCalledWith('resume_cycle', {
			p_user_id: USER_ID,
			p_cycle_id: CYCLE_ID,
			p_expected_version: 1,
			p_trigger_projections: [
				{ trigger_id: triggerId, next_run_at: '2026-08-26T13:00:00.000Z' }
			]
		});
	});

	it('materializes a Daily Brief manual run from trusted profile timezone', async () => {
		const commandClient = {
			rpc: vi.fn(async () => ({
				data: {
					disposition: 'admitted',
					cycle_run_id: '33333333-3333-4333-8333-333333333333',
					queue_job_record_id: '44444444-4444-4444-8444-444444444444',
					queue_job_id: 'cycle-job-1'
				},
				error: null
			}))
		};

		await admitManualCycleRun({
			readClient: createReadClient(),
			commandClient,
			userId: USER_ID,
			userTimezone: 'America/Los_Angeles',
			cycleId: CYCLE_ID,
			idempotencyKey: 'manual-run-1',
			payload: { force_regenerate: true },
			now: new Date('2026-08-25T02:00:00.000Z')
		});

		expect(commandClient.rpc).toHaveBeenCalledWith(
			'admit_manual_cycle_run',
			expect.objectContaining({
				p_user_id: USER_ID,
				p_request_id: 'manual-run-1',
				p_execution_input: expect.objectContaining({
					mode: 'regenerate',
					brief_date: '2026-08-24',
					timezone: 'America/Los_Angeles',
					force_regenerate: true
				}),
				p_delivery_intent: { mode: 'suppress', reason: 'manual_run' }
			})
		);
	});

	it('maps optimistic concurrency failures to an API-safe conflict', async () => {
		const commandClient = {
			rpc: vi.fn(async () => ({
				data: null,
				error: { code: 'P0001', message: 'cycle_version_conflict' }
			}))
		};

		let caught: unknown;
		try {
			await updateCycle({
				readClient: createReadClient(),
				commandClient,
				userId: USER_ID,
				cycleId: CYCLE_ID,
				payload: { expected_version: 1, label: 'New label' }
			});
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(CycleServiceError);
		expect(caught).toMatchObject({ status: 409, code: 'CYCLE_CONFLICT' });
	});
});
