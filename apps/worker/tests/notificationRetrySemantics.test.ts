// apps/worker/tests/notificationRetrySemantics.test.ts
// Proves the notification retry contract: a transient provider failure returns
// the delivery to 'pending' with ONE attempt counted, and the queue retry
// actually produces a second provider call. Regression tests for the
// never-retries bug (FINAL_STATES short-circuit + double attempt increment).
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	// This suite exercises provider retry semantics, so opt in explicitly. The
	// production default remains fail-closed when the variable is absent.
	const originalSmsSendingEnabled = process.env.PRIVATE_SMS_SENDING_ENABLED;
	process.env.PRIVATE_SMS_SENDING_ENABLED = 'true';

	const state = {
		delivery: {} as Record<string, any>,
		smsEnabled: true,
		updateError: null as { message: string } | null,
		queueError: null as { message: string } | null
	};
	const rpc = vi.fn(async (name: string, _args?: unknown) =>
		name === 'get_notification_sms_sending_enabled'
			? { data: state.smsEnabled, error: null }
			: { data: state.queueError ? null : 'queue-record-1', error: state.queueError }
	);
	const updates: Array<{
		table: string;
		payload: Record<string, any>;
		opts: Record<string, any> | undefined;
		filters: Array<[string, unknown]>;
	}> = [];

	function createFakeClient() {
		return {
			rpc,
			from(table: string) {
				const filters: Array<[string, unknown]> = [];
				const builder: any = {
					_op: 'select' as 'select' | 'update' | 'insert',
					_payload: null as Record<string, any> | null,
					_opts: undefined as Record<string, any> | undefined,
					select() {
						builder._op = 'select';
						return builder;
					},
					update(payload: Record<string, any>, opts?: Record<string, any>) {
						builder._op = 'update';
						builder._payload = payload;
						builder._opts = opts;
						return builder;
					},
					insert(payload: Record<string, any>) {
						builder._op = 'insert';
						builder._payload = payload;
						return builder;
					},
					eq(column: string, value: unknown) {
						filters.push([column, value]);
						return builder;
					},
					maybeSingle() {
						return builder.single();
					},
					async single() {
						if (table === 'notification_deliveries') {
							return { data: { ...state.delivery }, error: null };
						}
						return { data: null, error: { message: `no fixture for ${table}` } };
					},
					then(
						resolve: (value: unknown) => unknown,
						_reject?: (reason?: unknown) => unknown
					) {
						if (builder._op === 'update' && table === 'notification_deliveries') {
							const matches = filters.every(([column, value]) =>
								column === 'id'
									? state.delivery.id === value
									: state.delivery[column] === value
							);
							updates.push({
								table,
								payload: builder._payload!,
								opts: builder._opts,
								filters
							});
							if (state.updateError)
								return resolve({ error: state.updateError, count: null });
							if (matches) {
								Object.assign(state.delivery, builder._payload);
							}
							const exact = builder._opts?.count === 'exact';
							return resolve({
								error: null,
								count: exact ? (matches ? 1 : 0) : null
							});
						}
						return resolve({ error: null, count: null, data: null });
					}
				};
				return builder;
			}
		};
	}

	const sendEmailNotification = vi.fn();
	const sendSMSNotification = vi.fn();

	const noopLogger: any = {
		child: () => noopLogger,
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {}
	};

	return {
		originalSmsSendingEnabled,
		state,
		rpc,
		updates,
		createFakeClient,
		sendEmailNotification,
		sendSMSNotification,
		noopLogger
	};
});

vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: () => mocks.createFakeClient()
}));

vi.mock('@buildos/shared-utils', () => ({
	createLogger: () => mocks.noopLogger,
	extractCorrelationContext: () => ({}),
	generateCorrelationId: () => 'corr-test'
}));

vi.mock('../src/workers/notification/emailAdapter.js', () => ({
	sendEmailNotification: mocks.sendEmailNotification
}));

vi.mock('../src/workers/notification/smsAdapter.js', () => ({
	sendSMSNotification: mocks.sendSMSNotification
}));

vi.mock('../src/workers/notification/preferenceChecker.js', () => ({
	checkUserPreferences: vi.fn(async () => ({ allowed: true, preferences: null }))
}));

vi.mock('web-push', () => ({
	default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() }
}));

import { processNotification } from '../src/workers/notification/notificationWorker';
import { checkUserPreferences } from '../src/workers/notification/preferenceChecker.js';

afterAll(() => {
	if (mocks.originalSmsSendingEnabled === undefined) {
		delete process.env.PRIVATE_SMS_SENDING_ENABLED;
	} else {
		process.env.PRIVATE_SMS_SENDING_ENABLED = mocks.originalSmsSendingEnabled;
	}
});

const DELIVERY_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const USER_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0000-4000-8000-000000000001';

function resetDelivery(overrides: Record<string, any> = {}) {
	mocks.state.delivery = {
		id: DELIVERY_ID,
		event_id: EVENT_ID,
		recipient_user_id: USER_ID,
		channel: 'email',
		channel_identifier: 'dj@example.com',
		status: 'pending',
		attempts: 0,
		max_attempts: 3,
		payload: {
			title: 'Test notification',
			body: 'Body text',
			event_type: 'user.signup'
		},
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides
	};
	mocks.updates.length = 0;
}

function makeJob(): any {
	return {
		id: 'job-1',
		processingToken: 'token-1',
		userId: USER_ID,
		attempts: 0,
		data: { delivery_id: DELIVERY_ID, channel: 'email', event_type: 'user.signup' },
		updateProgress: vi.fn(),
		log: vi.fn()
	};
}

beforeEach(() => {
	resetDelivery();
	mocks.state.smsEnabled = true;
	mocks.state.updateError = null;
	mocks.state.queueError = null;
	mocks.rpc.mockClear();
	mocks.sendEmailNotification.mockReset();
	mocks.sendSMSNotification.mockReset();
});

describe('notification retry semantics', () => {
	function smsJob(payload: Record<string, unknown> = {}, attempts = 0) {
		resetDelivery({
			channel: 'sms',
			channel_identifier: '+12125550123',
			attempts,
			payload: { title: 'Test', body: 'Body', event_type: 'user.signup', ...payload }
		});
		const job = makeJob();
		job.data.channel = 'sms';
		return job;
	}

	it('defers quiet-hour SMS to the exact end without spending an attempt', async () => {
		const job = smsJob({}, 1);
		const until = new Date(Date.now() + 3_600_000).toISOString();
		mocks.sendSMSNotification.mockResolvedValueOnce({
			success: false,
			outcome: 'deferred',
			deferred_until: until
		});
		await expect(processNotification(job)).resolves.toBeUndefined();
		expect(mocks.state.delivery).toMatchObject({ status: 'pending', attempts: 1 });
		expect(mocks.rpc).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({
				p_job_type: 'send_notification',
				p_scheduled_for: until,
				p_metadata: expect.objectContaining({ delivery_id: DELIVERY_ID, channel: 'sms' }),
				p_dedup_key: `notification-deferred:${DELIVERY_ID}:${until}`
			})
		);
	});

	it('retries a failed deferral enqueue without consuming a delivery attempt', async () => {
		const job = smsJob({}, 1);
		mocks.state.queueError = { message: 'queue unavailable' };
		mocks.sendSMSNotification.mockResolvedValueOnce({
			success: false,
			outcome: 'deferred',
			deferred_until: new Date(Date.now() + 3_600_000).toISOString()
		});
		await expect(processNotification(job)).rejects.toThrow('queue unavailable');
		expect(mocks.state.delivery).toMatchObject({ status: 'pending', attempts: 1 });
	});

	it('reuses the same deferral key when the original job is replayed', async () => {
		const job = smsJob({}, 1);
		const until = new Date(Date.now() + 3_600_000).toISOString();
		mocks.sendSMSNotification.mockResolvedValue({
			success: false,
			outcome: 'deferred',
			deferred_until: until
		});
		await processNotification(job);
		await processNotification(job);
		const enqueues = mocks.rpc.mock.calls.filter(([name]) => name === 'add_queue_job');
		expect(enqueues).toHaveLength(2);
		expect(enqueues[0]?.[1]).toEqual(enqueues[1]?.[1]);
		expect(mocks.state.delivery).toMatchObject({ status: 'pending', attempts: 1 });
	});

	it('does not consume a delivery attempt when the database switch cannot be read', async () => {
		const job = smsJob({}, 1);
		mocks.rpc.mockRejectedValueOnce(new Error('settings unavailable'));
		await expect(processNotification(job)).rejects.toThrow('settings unavailable');
		expect(mocks.state.delivery).toMatchObject({ status: 'pending', attempts: 1 });
		expect(mocks.updates).toHaveLength(0);
		expect(mocks.sendSMSNotification).not.toHaveBeenCalled();
	});

	it.each([undefined, 'not-a-date', '2020-01-01T00:00:00Z'])(
		'rejects an invalid deferral time without consuming a delivery attempt: %s',
		async (deferred_until) => {
			const job = smsJob({}, 1);
			mocks.sendSMSNotification.mockResolvedValueOnce({
				success: false,
				outcome: 'deferred',
				deferred_until
			});
			await expect(processNotification(job)).rejects.toThrow('future quiet-hours end');
			expect(mocks.state.delivery).toMatchObject({ status: 'pending', attempts: 1 });
			expect(mocks.rpc).not.toHaveBeenCalledWith('add_queue_job', expect.anything());
		}
	);

	it('cancels a text that expires before quiet hours end, without a send attempt', async () => {
		const job = smsJob({ expires_at: new Date(Date.now() + 1_800_000).toISOString() }, 1);
		mocks.sendSMSNotification.mockResolvedValueOnce({
			success: false,
			outcome: 'deferred',
			deferred_until: new Date(Date.now() + 3_600_000).toISOString()
		});
		await expect(processNotification(job)).resolves.toBeUndefined();
		expect(mocks.state.delivery).toMatchObject({ status: 'cancelled', attempts: 1 });
		expect(mocks.rpc).not.toHaveBeenCalledWith('add_queue_job', expect.anything());
	});

	it('does not send an expired text when its deferred queue job wakes late', async () => {
		const job = smsJob({ expires_at: new Date(Date.now() - 60_000).toISOString() }, 1);
		mocks.sendSMSNotification.mockResolvedValueOnce({ success: true });
		await processNotification(job);
		expect(mocks.state.delivery).toMatchObject({ status: 'cancelled', attempts: 1 });
		expect(mocks.sendSMSNotification).not.toHaveBeenCalled();
	});

	it('preserves expiry when a raw notification needs fallback content after an event lookup failure', async () => {
		const job = smsJob({}, 1);
		mocks.state.delivery.payload = {
			expires_at: new Date(Date.now() - 60_000).toISOString()
		};
		mocks.sendSMSNotification.mockResolvedValueOnce({ success: true });
		await processNotification(job);
		expect(mocks.state.delivery).toMatchObject({ status: 'cancelled', attempts: 1 });
		expect(mocks.sendSMSNotification).not.toHaveBeenCalled();
	});

	it('preserves the raw brief date and timezone when deferring fallback content', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-20T03:00:00Z'));
		try {
			const job = smsJob({}, 1);
			job.data.event_type = 'brief.completed';
			mocks.state.delivery.payload = {
				brief_date: '2026-10-19',
				timezone: 'America/New_York'
			};
			mocks.sendSMSNotification.mockResolvedValueOnce({
				success: false,
				outcome: 'deferred',
				deferred_until: '2026-10-20T12:00:00Z'
			});
			await processNotification(job);
			expect(mocks.sendSMSNotification).toHaveBeenCalledOnce();
			expect(mocks.state.delivery).toMatchObject({
				status: 'cancelled',
				attempts: 1,
				last_error: 'cancelled: stale_after_quiet_hours'
			});
			expect(mocks.rpc).not.toHaveBeenCalledWith('add_queue_job', expect.anything());
		} finally {
			vi.useRealTimers();
		}
	});

	it('cancels a daily brief that would be stale after quiet hours in its timezone', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-19T23:00:00Z'));
		try {
			const job = smsJob(
				{ event_type: 'brief.completed', brief_date: '2026-10-19', timezone: 'UTC' },
				1
			);
			mocks.sendSMSNotification.mockResolvedValueOnce({
				success: false,
				outcome: 'deferred',
				deferred_until: '2026-10-20T08:00:00Z'
			});
			await expect(processNotification(job)).resolves.toBeUndefined();
			expect(mocks.state.delivery).toMatchObject({ status: 'cancelled', attempts: 1 });
			expect(mocks.rpc).not.toHaveBeenCalledWith('add_queue_job', expect.anything());
		} finally {
			vi.useRealTimers();
		}
	});

	it('cancels SMS when the database sending switch is off even if the environment permits it', async () => {
		const job = smsJob({}, 1);
		mocks.state.smsEnabled = false;
		mocks.sendSMSNotification.mockResolvedValueOnce({ success: true });
		await expect(processNotification(job)).resolves.toBeUndefined();
		expect(mocks.state.delivery).toMatchObject({ status: 'cancelled', attempts: 1 });
		expect(mocks.sendSMSNotification).not.toHaveBeenCalled();
	});

	it('does not revive a cancelled delivery when its deferred job wakes after re-enabling SMS', async () => {
		const job = smsJob({}, 1);
		mocks.state.delivery.status = 'cancelled';
		await processNotification(job);
		expect(mocks.state.delivery).toMatchObject({ status: 'cancelled', attempts: 1 });
		expect(mocks.rpc).not.toHaveBeenCalled();
		expect(mocks.sendSMSNotification).not.toHaveBeenCalled();
	});

	it('does not report success when persisting cancellation fails', async () => {
		vi.mocked(checkUserPreferences).mockResolvedValueOnce({
			allowed: false,
			reason: 'user disabled notifications'
		});
		mocks.state.updateError = {
			message: 'notification_deliveries_status_check rejects cancelled'
		};
		await expect(processNotification(makeJob())).rejects.toThrow('rejects cancelled');
		expect(mocks.state.delivery).toMatchObject({ status: 'pending', attempts: 0 });
		expect(mocks.sendEmailNotification).not.toHaveBeenCalled();
	});

	it('transient provider failure returns delivery to pending with ONE attempt and throws for queue retry', async () => {
		mocks.sendEmailNotification.mockResolvedValueOnce({
			success: false,
			error: 'provider 500'
		});

		await expect(processNotification(makeJob())).rejects.toThrow('provider 500');

		expect(mocks.state.delivery.status).toBe('pending');
		expect(mocks.state.delivery.attempts).toBe(1);
		expect(mocks.state.delivery.last_error).toBe('provider 500');
		expect(mocks.state.delivery.failed_at).toBeUndefined();
		// Exactly one delivery update — no catch-path double write
		const deliveryUpdates = mocks.updates.filter((u) => u.table === 'notification_deliveries');
		expect(deliveryUpdates).toHaveLength(1);
	});

	it('queue retry after a transient failure produces a REAL second provider call and succeeds', async () => {
		mocks.sendEmailNotification
			.mockResolvedValueOnce({ success: false, error: 'provider 500' })
			.mockResolvedValueOnce({ success: true, external_id: 'ext-1' });

		await expect(processNotification(makeJob())).rejects.toThrow();
		await processNotification(makeJob());

		expect(mocks.sendEmailNotification).toHaveBeenCalledTimes(2);
		expect(mocks.state.delivery.status).toBe('sent');
		expect(mocks.state.delivery.attempts).toBe(2);
		expect(mocks.state.delivery.external_id).toBe('ext-1');
	});

	it('keeps an accepted SMS pending until the provider callback confirms it was sent', async () => {
		resetDelivery({
			channel: 'sms',
			channel_identifier: '+12125550123'
		});
		mocks.sendSMSNotification.mockResolvedValueOnce({
			success: true,
			external_id: 'sms-message-1',
			outcome: 'queued'
		});
		const job = makeJob();
		job.data.channel = 'sms';

		await processNotification(job);

		expect(mocks.sendSMSNotification).toHaveBeenCalledTimes(1);
		expect(mocks.state.delivery.status).toBe('pending');
		expect(mocks.state.delivery.attempts).toBe(1);
		expect(mocks.state.delivery.external_id).toBe('sms-message-1');
		expect(mocks.state.delivery.sent_at).toBeNull();
		expect(mocks.state.delivery.last_error).toBeNull();
	});

	it('failure on the final attempt marks the delivery terminally failed', async () => {
		resetDelivery({ attempts: 2 });
		mocks.sendEmailNotification.mockResolvedValueOnce({
			success: false,
			error: 'provider 500'
		});

		await expect(processNotification(makeJob())).rejects.toThrow();

		expect(mocks.state.delivery.status).toBe('failed');
		expect(mocks.state.delivery.attempts).toBe(3);
		expect(mocks.state.delivery.failed_at).toBeTruthy();
	});

	it('terminally failed delivery short-circuits without another provider call', async () => {
		resetDelivery({ status: 'failed', attempts: 3, failed_at: new Date().toISOString() });

		await processNotification(makeJob());

		expect(mocks.sendEmailNotification).not.toHaveBeenCalled();
	});

	it('unexpected adapter throw counts the attempt exactly once via the cleanup path', async () => {
		mocks.sendEmailNotification.mockRejectedValueOnce(new Error('adapter exploded'));

		await expect(processNotification(makeJob())).rejects.toThrow('adapter exploded');

		expect(mocks.state.delivery.status).toBe('pending');
		expect(mocks.state.delivery.attempts).toBe(1);
		expect(mocks.state.delivery.last_error).toBe('adapter exploded');
	});

	it('a preference read failure leaves the delivery retryable instead of cancelling it', async () => {
		vi.mocked(checkUserPreferences).mockRejectedValueOnce(
			new Error('Failed to load notification preferences: statement timeout')
		);

		await expect(processNotification(makeJob())).rejects.toThrow('statement timeout');

		expect(mocks.state.delivery.status).toBe('pending');
		expect(mocks.state.delivery.attempts).toBe(1);
		expect(mocks.sendEmailNotification).not.toHaveBeenCalled();
	});

	it('retries exhausted through repeated transient failures land on failed exactly at max_attempts', async () => {
		mocks.sendEmailNotification.mockResolvedValue({ success: false, error: 'still down' });

		await expect(processNotification(makeJob())).rejects.toThrow();
		expect(mocks.state.delivery.status).toBe('pending');
		await expect(processNotification(makeJob())).rejects.toThrow();
		expect(mocks.state.delivery.status).toBe('pending');
		await expect(processNotification(makeJob())).rejects.toThrow();

		expect(mocks.state.delivery.status).toBe('failed');
		expect(mocks.state.delivery.attempts).toBe(3);
		expect(mocks.sendEmailNotification).toHaveBeenCalledTimes(3);
	});
});
