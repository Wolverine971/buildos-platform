// apps/worker/tests/smsWorkerOptOut.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	process.env.PRIVATE_TWILIO_ACCOUNT_SID = 'AC_test';
	process.env.PRIVATE_TWILIO_AUTH_TOKEN = 'test-token';
	process.env.PRIVATE_TWILIO_MESSAGING_SERVICE_SID = 'MG_test';

	type Write = { table: string; values: Record<string, unknown>; filters: [string, unknown][] };
	const writes: Write[] = [];
	const from = (table: string) => {
		const write: Write = { table, values: {}, filters: [] };
		const query: any = {
			select: () => query,
			update: (values: Record<string, unknown>) => {
				write.values = values;
				writes.push(write);
				return query;
			},
			eq: (column: string, value: unknown) => {
				write.filters.push([column, value]);
				return query;
			},
			single: async () => ({
				data: table === 'sms_messages' ? { id: 'msg-1', attempt_count: 0 } : null,
				error: null
			}),
			then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
				Promise.resolve({ data: null, error: null }).then(resolve, reject)
		};
		return query;
	};

	return {
		writes,
		supabase: { from, rpc: vi.fn() },
		sendSMS: vi.fn(),
		recordFailed: vi.fn(async () => undefined)
	};
});

vi.mock('../src/config/sms', () => ({
	SMS_SENDING_ENABLED: true,
	SMS_SENDING_DISABLED_REASON: 'disabled'
}));
vi.mock('@buildos/twilio-service', () => ({
	TwilioClient: class {
		sendSMS = mocks.sendSMS;
	},
	SMSService: class {}
}));
vi.mock('@buildos/supabase-client', () => ({ createServiceClient: () => mocks.supabase }));
vi.mock('@buildos/shared-utils', () => ({
	smsMetricsService: {
		recordFailed: mocks.recordFailed,
		recordSent: vi.fn(async () => undefined),
		recordCancelled: vi.fn(async () => undefined)
	}
}));
vi.mock('../src/lib/utils/smsPreferenceChecks', () => ({ checkQuietHours: vi.fn() }));
vi.mock('../src/workers/shared/queueUtils', () => ({
	validateSMSJobData: (data: Record<string, unknown>, userId: string) => ({
		...data,
		user_id: userId
	}),
	updateJobStatus: vi.fn(async () => undefined),
	broadcastUserEvent: vi.fn(async () => undefined)
}));

import { PermanentQueueError } from '../src/lib/queueErrors';
import { processSMSJob } from '../src/workers/smsWorker';

function smsJob() {
	return {
		id: 'job-1',
		processingToken: 'token-1',
		updateProgress: vi.fn(async () => undefined),
		log: vi.fn(async () => undefined),
		data: {
			userId: 'user-1',
			message_id: 'msg-1',
			phone_number: '+15551234567',
			message: 'Standup in 15 mins',
			priority: 'normal'
		}
	} as any;
}

function twilioError(code: number, message: string) {
	return Object.assign(new Error(message), { code, status: 400 });
}

describe('SMS worker Twilio STOP handling', () => {
	beforeEach(() => {
		mocks.writes.length = 0;
		mocks.sendSMS.mockReset();
		mocks.recordFailed.mockClear();
	});

	it('marks the user opted out on 21610 and fails the job without retry', async () => {
		mocks.sendSMS.mockRejectedValueOnce(
			twilioError(21610, 'Attempt to send to unsubscribed recipient +15551234567')
		);

		const failure = await processSMSJob(smsJob()).catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(PermanentQueueError);
		expect(failure).toMatchObject({ code: 'sms_recipient_opted_out' });

		const optOut = mocks.writes.find((write) => write.table === 'user_sms_preferences');
		expect(optOut?.values).toMatchObject({ opted_out: true });
		expect(optOut?.values.opted_out_at).toEqual(expect.any(String));
		expect(optOut?.filters).toEqual([['user_id', 'user-1']]);

		const failedMessage = mocks.writes.find(
			(write) => write.table === 'sms_messages' && write.values.status === 'failed'
		);
		expect(failedMessage?.values.twilio_error_message).toBe(
			'Attempt to send to unsubscribed recipient ***67'
		);
		expect(JSON.stringify(mocks.recordFailed.mock.calls)).not.toContain('5551234567');
	});

	it('leaves preferences alone and keeps retry semantics for other Twilio errors', async () => {
		const outage = twilioError(20500, 'Twilio internal error');
		mocks.sendSMS.mockRejectedValueOnce(outage);

		await expect(processSMSJob(smsJob())).rejects.toBe(outage);
		expect(mocks.writes.some((write) => write.table === 'user_sms_preferences')).toBe(false);
	});

	it('re-throws provider errors that quote the recipient without the number', async () => {
		mocks.sendSMS.mockRejectedValueOnce(
			twilioError(21408, "Permission to send an SMS has not been enabled for '+15551234567'")
		);

		const failure = (await processSMSJob(smsJob()).catch((error: unknown) => error)) as Error;

		expect(failure.message).toBe("Permission to send an SMS has not been enabled for '***67'");
		expect(failure.stack).not.toContain('5551234567');
		expect(failure).toMatchObject({ code: 21408 });
	});
});
