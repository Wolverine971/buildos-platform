// apps/worker/tests/notificationPreferenceChecker.test.ts
// A missing preferences row is a real "don't send"; a failed read is not. The
// notification worker permanently cancels on allowed:false, so read failures
// must throw and reach the queue's retry path instead.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const results: Record<string, { data: unknown; error: unknown }> = {};
	const client = {
		from(table: string) {
			const builder: any = {
				select: () => builder,
				eq: () => builder,
				single: async () => results[table] ?? { data: null, error: null }
			};
			return builder;
		}
	};
	const logger: any = {
		child: () => logger,
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {}
	};
	return { results, client, logger };
});

vi.mock('@buildos/supabase-client', () => ({
	createServiceClient: () => mocks.client
}));

import { checkUserPreferences } from '../src/workers/notification/preferenceChecker';

const enabledPrefs = {
	push_enabled: true,
	in_app_enabled: true,
	email_enabled: true,
	sms_enabled: true,
	quiet_hours_enabled: false,
	quiet_hours_start: null,
	quiet_hours_end: null,
	should_email_daily_brief: true,
	should_sms_daily_brief: true
};

beforeEach(() => {
	for (const key of Object.keys(mocks.results)) delete mocks.results[key];
});

describe('checkUserPreferences', () => {
	it('disallows sending when the user has no preferences row', async () => {
		mocks.results.user_notification_preferences = {
			data: null,
			error: { code: 'PGRST116', message: 'No rows returned' }
		};

		const result = await checkUserPreferences('user-1', 'user.signup', 'email', mocks.logger);

		expect(result.allowed).toBe(false);
	});

	it('throws on a transient preferences read failure so the delivery is retried', async () => {
		mocks.results.user_notification_preferences = {
			data: null,
			error: { code: '57014', message: 'canceling statement due to statement timeout' }
		};

		await expect(
			checkUserPreferences('user-1', 'user.signup', 'email', mocks.logger)
		).rejects.toThrow('statement timeout');
	});

	it('throws on a transient SMS preferences read failure but not on a missing row', async () => {
		mocks.results.user_notification_preferences = { data: enabledPrefs, error: null };
		mocks.results.user_sms_preferences = {
			data: null,
			error: { code: '08006', message: 'connection failure' }
		};

		await expect(
			checkUserPreferences('user-1', 'user.signup', 'sms', mocks.logger)
		).rejects.toThrow('connection failure');

		mocks.results.user_sms_preferences = {
			data: null,
			error: { code: 'PGRST116', message: 'No rows returned' }
		};
		const result = await checkUserPreferences('user-1', 'user.signup', 'sms', mocks.logger);
		expect(result).toMatchObject({ allowed: false, reason: 'SMS preferences not configured' });
	});

	it('allows sending when the channel is enabled', async () => {
		mocks.results.user_notification_preferences = { data: enabledPrefs, error: null };

		const result = await checkUserPreferences('user-1', 'user.signup', 'email', mocks.logger);

		expect(result.allowed).toBe(true);
	});
});
