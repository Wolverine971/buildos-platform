// apps/web/src/lib/services/email-service.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailMock, logAPIErrorMock, logDatabaseErrorMock, privateEnv } = vi.hoisted(() => ({
	sendMailMock: vi.fn(),
	logAPIErrorMock: vi.fn(),
	logDatabaseErrorMock: vi.fn(),
	privateEnv: {} as Record<string, string | undefined>
}));

vi.mock('$app/environment', () => ({
	dev: false
}));

vi.mock('$env/static/public', () => ({
	PUBLIC_APP_URL: 'https://build-os.com'
}));

vi.mock('$env/dynamic/private', () => ({
	env: privateEnv
}));

vi.mock('$lib/utils/email-config', () => ({
	createGmailTransporter: vi.fn(() => ({
		sendMail: sendMailMock
	})),
	getSenderByType: vi.fn(() => ({
		email: 'dj@build-os.com',
		password: 'gmail-password',
		name: 'DJ from BuildOS'
	}))
}));

vi.mock('./errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({
			logAPIError: logAPIErrorMock,
			logDatabaseError: logDatabaseErrorMock,
			logError: vi.fn()
		}))
	}
}));

import { EmailService } from './email-service';

class QueryMock implements PromiseLike<any> {
	private action: 'insert' | 'select' | 'update' | null = null;
	private table: string;

	constructor(table: string) {
		this.table = table;
	}

	insert() {
		this.action = 'insert';
		return this;
	}

	update() {
		this.action = 'update';
		return this;
	}

	select() {
		this.action ??= 'select';
		return this;
	}

	eq() {
		return this;
	}

	single() {
		return this;
	}

	maybeSingle() {
		return this;
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null | undefined,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined
	): PromiseLike<TResult1 | TResult2> {
		return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
	}

	private execute() {
		if (this.table === 'emails' && this.action === 'insert') {
			return {
				data: { id: 'email-1' },
				error: null
			};
		}

		if (this.table === 'email_recipients' && this.action === 'select') {
			return {
				data: null,
				error: null
			};
		}

		return {
			data: null,
			error: null
		};
	}
}

function createSupabaseMock() {
	return {
		from: vi.fn((table: string) => new QueryMock(table))
	};
}

describe('EmailService lifecycle compliance', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const key of Object.keys(privateEnv)) {
			delete privateEnv[key];
		}
		sendMailMock.mockResolvedValue({ messageId: 'message-1' });
	});

	it('adds one-click unsubscribe headers and visible opt-out links to lifecycle emails', async () => {
		const service = new EmailService(createSupabaseMock() as any);

		const result = await service.sendEmail({
			to: 'user@example.com',
			subject: 'Welcome to BuildOS',
			body: 'Hi there,\n\nWelcome.',
			html: '<p>Hi there,</p><p>Welcome.</p><a href="https://build-os.com/projects">Open BuildOS</a>',
			metadata: {
				category: 'welcome_sequence',
				campaign: 'welcome-sequence',
				campaign_type: 'lifecycle'
			}
		});

		expect(result.success).toBe(true);
		const mailOptions = sendMailMock.mock.calls[0]?.[0];
		expect(mailOptions.replyTo).toBe('dj@build-os.com');
		expect(mailOptions.headers).toMatchObject({
			'List-ID': 'BuildOS <emails.build-os.com>',
			'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
		});
		expect(mailOptions.headers['List-Unsubscribe']).toContain(
			'https://build-os.com/api/email-tracking/'
		);
		expect(mailOptions.headers['List-Unsubscribe']).toContain('/unsubscribe');
		expect(mailOptions.headers['List-Unsubscribe']).toContain(
			'mailto:dj@build-os.com?subject=unsubscribe'
		);
		expect(mailOptions.text).toContain('You can opt out of these BuildOS emails here:');
		expect(mailOptions.text).toContain('/unsubscribe');
		expect(mailOptions.html).toContain('You can opt out of these BuildOS emails');
		expect(mailOptions.html).toContain('/unsubscribe');
		expect(mailOptions.html).toContain('/click?url=');
	});

	it('does not add lifecycle unsubscribe headers to non-lifecycle emails', async () => {
		const service = new EmailService(createSupabaseMock() as any);

		await service.sendEmail({
			to: 'user@example.com',
			subject: 'Operational notice',
			body: 'A transactional update.',
			html: '<p>A transactional update.</p>',
			metadata: {
				category: 'transactional'
			}
		});

		const mailOptions = sendMailMock.mock.calls[0]?.[0];
		expect(mailOptions.headers).toBeUndefined();
		expect(mailOptions.text).not.toContain('opt out');
		expect(mailOptions.html).not.toContain('opt out');
	});

	it('routes lifecycle emails to the local log sink without calling Gmail', async () => {
		privateEnv.PRIVATE_LIFECYCLE_EMAIL_SINK = 'log';
		const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
		const service = new EmailService(createSupabaseMock() as any);

		const result = await service.sendEmail({
			to: 'user@example.com',
			subject: 'Welcome to BuildOS',
			body: 'Hi there,\n\nWelcome.',
			html: '<p>Hi there,</p><p>Welcome.</p>',
			metadata: {
				category: 'welcome_sequence',
				campaign: 'welcome-sequence',
				campaign_type: 'lifecycle',
				sequence_step: 'email_1'
			}
		});

		expect(result).toMatchObject({
			success: true,
			emailId: 'email-1'
		});
		expect(result.messageId).toContain('lifecycle-log-sink/');
		expect(sendMailMock).not.toHaveBeenCalled();
		expect(consoleInfo).toHaveBeenCalledWith(
			'Lifecycle email log sink',
			expect.objectContaining({
				to: 'user@example.com',
				subject: 'Welcome to BuildOS',
				text: expect.stringContaining('Welcome.'),
				html: expect.stringContaining('<p>Welcome.</p>'),
				tokens: expect.objectContaining({
					sequence_step: 'email_1'
				})
			})
		);

		consoleInfo.mockRestore();
	});
});
