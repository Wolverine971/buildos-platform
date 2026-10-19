// apps/worker/tests/smsWorkerNotificationDispatch.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	process.env.PRIVATE_TWILIO_ACCOUNT_SID = 'AC_test';
	process.env.PRIVATE_TWILIO_AUTH_TOKEN = 'test-token';
	process.env.PRIVATE_TWILIO_MESSAGING_SERVICE_SID = 'MG_test';
	const state = {
		rows: {} as Record<string, Record<string, any>>,
		enabled: true,
		readErrorTable: '',
		writeErrorTable: '',
		queueError: false
	};
	const writes: Array<{ table: string; values: Record<string, any> }> = [];
	const rpc = vi.fn(async () => ({
		data: state.queueError ? null : 'future-job-1',
		error: state.queueError ? { message: 'queue unavailable' } : null
	}));
	const from = vi.fn((table: string) => {
		let values: Record<string, any> | undefined;
		const filters: Array<[string, unknown]> = [];
		const result = () => {
			const row = state.rows[table];
			if (!values)
				return {
					data: state.readErrorTable === table ? null : row ? { ...row } : null,
					error: state.readErrorTable === table ? { message: 'read unavailable' } : null
				};
			if (state.writeErrorTable === table)
				return { data: null, count: null, error: { message: 'write unavailable' } };
			const matches = row && filters.every(([key, value]) => row[key] === value);
			writes.push({ table, values });
			if (matches) Object.assign(row, values);
			return { data: matches ? { ...row } : null, count: matches ? 1 : 0, error: null };
		};
		const query: any = {
			select: () => query,
			update: (value: Record<string, any>) => {
				values = value;
				return query;
			},
			eq: (key: string, value: unknown) => {
				filters.push([key, value]);
				return query;
			},
			is: (key: string, value: unknown) => {
				filters.push([key, value]);
				return query;
			},
			single: async () => result(),
			maybeSingle: async () => result(),
			then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve)
		};
		return query;
	});
	return { state, writes, from, rpc, sendSMS: vi.fn(), broadcast: vi.fn(async () => undefined) };
});

vi.mock('../src/config/sms', () => ({
	SMS_SENDING_ENABLED: true,
	SMS_SENDING_DISABLED_REASON: 'disabled',
	isNotificationSmsSendingEnabled: vi.fn(async () => mocks.state.enabled)
}));
vi.mock('@buildos/twilio-service', () => ({
	TwilioClient: class {
		sendSMS = mocks.sendSMS;
	},
	SMSService: class {}
}));
vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc })
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@buildos/shared-utils', () => ({
	smsMetricsService: {
		recordFailed: vi.fn(async () => undefined),
		recordSent: vi.fn(async () => undefined),
		recordCancelled: vi.fn(async () => undefined)
	}
}));
vi.mock('../src/workers/shared/queueUtils', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/workers/shared/queueUtils')>()),
	updateJobStatus: vi.fn(async () => undefined),
	broadcastUserEvent: mocks.broadcast
}));

import { processSMSJob } from '../src/workers/smsWorker';

function job() {
	return {
		id: 'job-1',
		processingToken: 'token-1',
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined),
		data: {
			userId: 'user-1',
			user_id: 'user-1',
			message_id: 'sms-1',
			phone_number: '+12125550139',
			message: 'Ready',
			priority: 'normal'
		}
	} as any;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-19T16:00:00Z'));
	mocks.state.enabled = true;
	mocks.state.readErrorTable = '';
	mocks.state.writeErrorTable = '';
	mocks.state.queueError = false;
	mocks.state.rows = {
		sms_messages: {
			id: 'sms-1',
			user_id: 'user-1',
			phone_number: '+12125550139',
			status: 'queued',
			attempt_count: 0,
			twilio_sid: null,
			notification_delivery_id: 'delivery-1',
			metadata: { event_type: 'user.signup' }
		},
		notification_deliveries: {
			id: 'delivery-1',
			event_id: 'event-1',
			channel: 'sms',
			recipient_user_id: 'user-1',
			status: 'pending',
			attempts: 1,
			external_id: 'sms-1',
			payload: {}
		},
		user_sms_preferences: {
			user_id: 'user-1',
			opted_out: false,
			phone_verified: true,
			phone_number: '+12125550139',
			quiet_hours_start: '21:00:00',
			quiet_hours_end: '08:00:00'
		},
		user_notification_preferences: {
			user_id: 'user-1',
			sms_enabled: true,
			should_sms_daily_brief: true
		},
		users: { id: 'user-1', timezone: 'America/New_York' }
	};
	mocks.writes.length = 0;
	mocks.from.mockClear();
	mocks.rpc.mockClear();
	mocks.broadcast.mockReset();
	mocks.sendSMS.mockReset().mockResolvedValue({ sid: 'SM_accepted', status: 'queued' });
});
afterEach(() => vi.useRealTimers());

describe('notification SMS final dispatch', () => {
	it.each([
		['low', 20],
		['high', 5]
	] as const)(
		"accepts the adapter's %s priority and preserves it when deferring",
		async (priority, queuePriority) => {
			vi.setSystemTime(new Date('2026-10-20T03:00:00Z'));
			const queued = job();
			queued.data.priority = priority;
			await processSMSJob(queued);
			expect(mocks.rpc).toHaveBeenCalledWith(
				'add_queue_job',
				expect.objectContaining({ p_priority: queuePriority })
			);
			expect(mocks.sendSMS).not.toHaveBeenCalled();
		}
	);
	it('sends an eligible notification and preserves the reserved delivery attempt', async () => {
		await processSMSJob(job());
		expect(mocks.sendSMS).toHaveBeenCalledOnce();
		expect(mocks.state.rows.sms_messages).toMatchObject({
			twilio_sid: 'SM_accepted',
			status: 'queued'
		});
		expect(mocks.state.rows.notification_deliveries?.attempts).toBe(1);
	});

	it('defers a backlog that reached quiet hours using the same message and no new attempt', async () => {
		vi.setSystemTime(new Date('2026-10-20T03:00:00Z'));
		await processSMSJob(job());
		expect(mocks.sendSMS).not.toHaveBeenCalled();
		expect(mocks.rpc).toHaveBeenCalledWith(
			'add_queue_job',
			expect.objectContaining({
				p_job_type: 'send_sms',
				p_scheduled_for: '2026-10-20T12:00:00.000Z',
				p_metadata: expect.objectContaining({ message_id: 'sms-1' }),
				p_dedup_key: 'notification-sms-deferred:sms-1:2026-10-20T12:00:00.000Z'
			})
		);
		expect(mocks.state.rows.sms_messages?.attempt_count).toBe(0);
		expect(mocks.state.rows.notification_deliveries?.attempts).toBe(1);
	});

	it.each(['disabled', 'expired', 'stale_brief', 'cancelled', 'opted_out', 'phone_changed'])(
		'cancels unsent notification SMS when %s changed after handoff',
		async (change) => {
			if (change === 'disabled') mocks.state.enabled = false;
			if (change === 'expired')
				mocks.state.rows.notification_deliveries!.payload = {
					expires_at: '2026-10-19T15:00:00Z'
				};
			if (change === 'stale_brief') {
				mocks.state.rows.sms_messages!.metadata = { event_type: 'brief.completed' };
				mocks.state.rows.notification_deliveries!.payload = {
					brief_date: '2026-10-18',
					timezone: 'America/New_York'
				};
			}
			if (change === 'cancelled')
				mocks.state.rows.notification_deliveries!.status = 'cancelled';
			if (change === 'opted_out') mocks.state.rows.user_sms_preferences!.opted_out = true;
			if (change === 'phone_changed')
				mocks.state.rows.user_sms_preferences!.phone_number = '+12125550999';
			await processSMSJob(job());
			expect(mocks.sendSMS).not.toHaveBeenCalled();
			expect(mocks.state.rows.sms_messages).toMatchObject({
				status: 'cancelled',
				attempt_count: 0
			});
			expect(mocks.state.rows.notification_deliveries).toMatchObject({
				status: 'cancelled',
				attempts: 1
			});
		}
	);

	it('cancels a brief that will be stale at the end of quiet hours', async () => {
		vi.setSystemTime(new Date('2026-10-20T03:00:00Z'));
		mocks.state.rows.sms_messages!.metadata = { event_type: 'brief.completed' };
		mocks.state.rows.notification_deliveries!.payload = {
			brief_date: '2026-10-19',
			timezone: 'America/New_York'
		};
		await processSMSJob(job());
		expect(mocks.sendSMS).not.toHaveBeenCalled();
		expect(mocks.rpc).not.toHaveBeenCalled();
		expect(mocks.state.rows.sms_messages?.status).toBe('cancelled');
	});

	it('does not send twice when a completed transport job is replayed', async () => {
		await processSMSJob(job());
		await processSMSJob(job());
		expect(mocks.sendSMS).toHaveBeenCalledOnce();
	});

	it('allows only one provider call when duplicate notification jobs overlap', async () => {
		await Promise.allSettled([processSMSJob(job()), processSMSJob(job())]);
		expect(mocks.sendSMS).toHaveBeenCalledOnce();
		expect(mocks.state.rows.sms_messages?.twilio_sid).toBe('SM_accepted');
	});

	it('does not resend an interrupted send whose provider outcome is unknown', async () => {
		mocks.state.rows.sms_messages!.status = 'sending';
		await expect(processSMSJob(job())).rejects.toMatchObject({
			code: 'sms_dispatch_outcome_unknown'
		});
		expect(mocks.sendSMS).not.toHaveBeenCalled();
		expect(mocks.state.rows.sms_messages?.status).toBe('sending');
	});

	it('does not overwrite provider acceptance when a later broadcast fails', async () => {
		mocks.broadcast.mockRejectedValueOnce(new Error('broadcast unavailable'));
		await expect(processSMSJob(job())).rejects.toMatchObject({
			code: 'sms_accepted_followup_failed'
		});
		expect(mocks.state.rows.sms_messages).toMatchObject({
			twilio_sid: 'SM_accepted',
			status: 'queued',
			attempt_count: 0
		});
		await processSMSJob(job());
		expect(mocks.sendSMS).toHaveBeenCalledOnce();
	});

	it('does not automatically retry a known accepted send whose receipt write fails', async () => {
		mocks.sendSMS.mockImplementationOnce(async () => {
			mocks.state.writeErrorTable = 'sms_messages';
			return { sid: 'SM_accepted', status: 'queued' };
		});
		await expect(processSMSJob(job())).rejects.toMatchObject({
			code: 'sms_accepted_followup_failed'
		});
		expect(mocks.state.rows.sms_messages?.attempt_count).toBe(0);
		expect(mocks.sendSMS).toHaveBeenCalledOnce();
	});

	it('preserves a provider receipt even when the switch is subsequently disabled', async () => {
		mocks.state.rows.sms_messages!.twilio_sid = 'SM_existing';
		mocks.state.enabled = false;
		await processSMSJob(job());
		expect(mocks.sendSMS).not.toHaveBeenCalled();
		expect(mocks.state.rows.sms_messages).toMatchObject({
			twilio_sid: 'SM_existing',
			status: 'queued'
		});
		expect(mocks.writes).toHaveLength(0);
	});

	it.each([
		'notification_deliveries',
		'user_sms_preferences',
		'user_notification_preferences',
		'users'
	])('retries a %s read failure without a provider attempt', async (table) => {
		mocks.state.readErrorTable = table;
		await expect(processSMSJob(job())).rejects.toThrow('read unavailable');
		expect(mocks.sendSMS).not.toHaveBeenCalled();
		expect(mocks.state.rows.sms_messages?.attempt_count).toBe(0);
	});

	it('retries a deferral write failure without marking the SMS failed', async () => {
		vi.setSystemTime(new Date('2026-10-20T03:00:00Z'));
		mocks.state.queueError = true;
		await expect(processSMSJob(job())).rejects.toThrow('queue unavailable');
		expect(mocks.sendSMS).not.toHaveBeenCalled();
		expect(mocks.state.rows.sms_messages).toMatchObject({ status: 'queued', attempt_count: 0 });
	});

	it('does not silently complete a cancellation that failed to persist', async () => {
		mocks.state.enabled = false;
		mocks.state.writeErrorTable = 'notification_deliveries';
		await expect(processSMSJob(job())).rejects.toThrow('write unavailable');
		expect(mocks.sendSMS).not.toHaveBeenCalled();
		expect(mocks.state.rows.sms_messages?.attempt_count).toBe(0);
	});

	it('keeps direct SMS independent of the notification database switch', async () => {
		mocks.state.rows.sms_messages!.notification_delivery_id = null;
		mocks.state.rows.sms_messages!.metadata = {};
		mocks.state.enabled = false;
		await processSMSJob(job());
		expect(mocks.sendSMS).toHaveBeenCalledOnce();
		expect(mocks.from).not.toHaveBeenCalledWith('notification_deliveries');
	});
});
