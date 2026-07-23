// apps/worker/tests/notificationRetrySemantics.test.ts
// Proves the notification retry contract: a transient provider failure returns
// the delivery to 'pending' with ONE attempt counted, and the queue retry
// actually produces a second provider call. Regression tests for the
// never-retries bug (FINAL_STATES short-circuit + double attempt increment).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const state = {
		delivery: {} as Record<string, any>
	};
	const updates: Array<{
		table: string;
		payload: Record<string, any>;
		opts: Record<string, any> | undefined;
		filters: Array<[string, unknown]>;
	}> = [];

	function createFakeClient() {
		return {
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

	const noopLogger: any = {
		child: () => noopLogger,
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		fatal: () => {}
	};

	return { state, updates, createFakeClient, sendEmailNotification, noopLogger };
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
	sendSMSNotification: vi.fn()
}));

vi.mock('../src/workers/notification/preferenceChecker.js', () => ({
	checkUserPreferences: vi.fn(async () => ({ allowed: true, preferences: null }))
}));

vi.mock('web-push', () => ({
	default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() }
}));

import { processNotification } from '../src/workers/notification/notificationWorker';

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
	mocks.sendEmailNotification.mockReset();
});

describe('notification retry semantics', () => {
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
