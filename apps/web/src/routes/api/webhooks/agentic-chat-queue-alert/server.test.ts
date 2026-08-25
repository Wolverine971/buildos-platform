import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	rows: new Map<string, Record<string, any>>(),
	createAdminSupabaseClient: vi.fn(),
	sendEmail: vi.fn()
}));

vi.mock('$env/static/private', () => ({
	PRIVATE_BUILDOS_WEBHOOK_SECRET: 'test-webhook-secret'
}));
vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/services/email-service', () => ({
	EmailService: class {
		async sendEmail(input: { emailId: string }) {
			const result = await mocks.sendEmail(input);
			if (result.success) {
				const row = mocks.rows.get(input.emailId);
				if (row) mocks.rows.set(input.emailId, { ...row, status: 'sent' });
			}
			return result;
		}
	}
}));

import { POST } from './+server';

function fakeSupabase() {
	class Builder {
		private filters: Array<(row: Record<string, any>) => boolean> = [];
		private updateValue: Record<string, any> | null = null;

		constructor(private readonly table: string) {}

		select() {
			return this;
		}

		insert(value: Record<string, any>) {
			if (mocks.rows.has(value.id)) {
				return Promise.resolve({
					data: null,
					error: { code: '23505', message: 'duplicate' }
				});
			}
			mocks.rows.set(value.id, { ...value });
			return Promise.resolve({ data: null, error: null });
		}

		update(value: Record<string, any>) {
			this.updateValue = value;
			return this;
		}

		eq(column: string, value: unknown) {
			this.filters.push((row) => row[column] === value);
			return this;
		}

		in(column: string, values: unknown[]) {
			this.filters.push((row) => values.includes(row[column]));
			return this;
		}

		lt(column: string, value: string) {
			this.filters.push((row) => typeof row[column] === 'string' && row[column] < value);
			return this;
		}

		async maybeSingle() {
			if (this.table === 'users') {
				return { data: { id: 'd1000000-0000-4000-8000-000000000001' }, error: null };
			}
			const match = [...mocks.rows.entries()].find(([, row]) =>
				this.filters.every((filter) => filter(row))
			);
			if (!match) return { data: null, error: null };
			const [id, row] = match;
			if (this.updateValue) {
				const updated = { ...row, ...this.updateValue };
				mocks.rows.set(id, updated);
				return { data: { id: updated.id }, error: null };
			}
			return { data: { id: row.id, status: row.status }, error: null };
		}
	}

	return { from: vi.fn((table: string) => new Builder(table)) };
}

function request(options: { authorized?: boolean } = {}) {
	return new Request('https://build-os.com/api/webhooks/agentic-chat-queue-alert', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...(options.authorized === false ? {} : { Authorization: 'Bearer test-webhook-secret' })
		},
		body: JSON.stringify({
			incidentId: 'agentic_chat_scale_threshold:123',
			observedAt: '2026-08-25T16:00:00.000Z',
			alert: {
				code: 'agentic_chat_scale_threshold',
				severity: 'warning',
				message: 'Scale attention required',
				details: {
					pendingCount: 8,
					runningCount: 8,
					oldestPendingAgeSeconds: 30,
					oldestScheduledFor: '2026-08-25T15:59:30.000Z',
					activeCapacity: 8,
					pendingThreshold: 8,
					oldestPendingThresholdSeconds: 120
				}
			}
		})
	});
}

describe('/api/webhooks/agentic-chat-queue-alert', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.rows.clear();
		mocks.createAdminSupabaseClient.mockReturnValue(fakeSupabase());
		mocks.sendEmail.mockResolvedValue({ success: true, messageId: 'gmail-1' });
	});

	it('requires the private worker webhook secret', async () => {
		const response = await POST({ request: request({ authorized: false }) } as never);
		expect(response.status).toBe(401);
		expect(mocks.createAdminSupabaseClient).not.toHaveBeenCalled();
	});

	it('claims and sends one idempotent operator email per incident bucket', async () => {
		let response = await POST({ request: request() } as never);
		expect(response.status).toBe(200);
		expect(mocks.sendEmail).toHaveBeenCalledOnce();
		expect(mocks.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'dj@build-os.com',
				subject: expect.stringContaining('8 waiting'),
				trackingEnabled: false
			})
		);

		response = await POST({ request: request() } as never);
		expect(response.status).toBe(200);
		expect((await response.json()).data.skipped).toBe('already_sent');
		expect(mocks.sendEmail).toHaveBeenCalledOnce();
	});
});
