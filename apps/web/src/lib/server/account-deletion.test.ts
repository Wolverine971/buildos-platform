// apps/web/src/lib/server/account-deletion.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	createAdminSupabaseClient: vi.fn(),
	deletePostHogPerson: vi.fn(),
	logSecurityEventBlocking: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: mocks.createAdminSupabaseClient
}));
vi.mock('$lib/server/posthog-person-deletion', () => ({
	deletePostHogPerson: mocks.deletePostHogPerson
}));
vi.mock('$lib/server/security-event-logger', () => ({
	logSecurityEventBlocking: mocks.logSecurityEventBlocking
}));
vi.mock('$lib/services/stripe-service', () => ({ StripeService: vi.fn() }));
vi.mock('$lib/server/gmail-read-oauth.service', () => ({
	GmailOAuthError: class extends Error {},
	GmailReadOAuthService: vi.fn()
}));
vi.mock('$lib/server/google-calendar-connection.service', () => ({
	GoogleCalendarConnectionError: class extends Error {},
	GoogleCalendarConnectionService: vi.fn()
}));
vi.mock('$lib/services/calendar-webhook-service', () => ({ CalendarWebhookService: vi.fn() }));

import {
	alertOverdueAccountDeletions,
	listAccountDeletionStorageObjects,
	processDueAccountDeletions
} from './account-deletion';

function createPagedRpc(total: number, serverCap: number) {
	const rows = Array.from({ length: total }, (_, index) => ({
		bucket_id: 'voice-notes',
		object_name: `user-1/${String(index).padStart(5, '0')}.webm`
	}));
	const ranges: Array<[number, number]> = [];
	const rpc = vi.fn(() => {
		const builder: any = {
			order: () => builder,
			range: (from: number, to: number) => {
				ranges.push([from, to]);
				const end = Math.min(to + 1, from + serverCap);
				return Promise.resolve({ data: rows.slice(from, end), error: null });
			}
		};
		return builder;
	});
	return { admin: { rpc }, ranges };
}

describe('listAccountDeletionStorageObjects', () => {
	it('pages past the PostgREST row cap so no stored file is left behind', async () => {
		const { admin, ranges } = createPagedRpc(2500, 1000);

		const objects = await listAccountDeletionStorageObjects(admin, 'user-1');

		expect(objects).toHaveLength(2500);
		expect(new Set(objects.map((object) => object.object_name)).size).toBe(2500);
		expect(ranges[0]).toEqual([0, 999]);
		expect(ranges[1]).toEqual([1000, 1999]);
	});

	it('stays complete when the server cap is lower than the requested page', async () => {
		const { admin } = createPagedRpc(1200, 500);

		const objects = await listAccountDeletionStorageObjects(admin, 'user-1');

		expect(objects).toHaveLength(1200);
	});

	it('surfaces RPC errors instead of treating them as an empty listing', async () => {
		const failure = new Error('rpc failed');
		const builder: any = {
			order: () => builder,
			range: () => Promise.resolve({ data: null, error: failure })
		};
		const admin = { rpc: vi.fn(() => builder) };

		await expect(listAccountDeletionStorageObjects(admin, 'user-1')).rejects.toBe(failure);
	});
});

const USER_ID = 'user-1';
const REQUEST = {
	id: 'request-1',
	user_id: USER_ID,
	status: 'processing',
	requested_at: '2026-08-25T00:00:00.000Z',
	scheduled_for: '2026-09-24T00:00:00.000Z',
	attempt_count: 1,
	billing_cancellation_status: 'not_applicable',
	billing_subscription_ids: []
};

type FakeAdminOptions = {
	libriPurgeError?: Error;
	tableRows?: Record<string, unknown[]>;
};

function createFakeAdmin(options: FakeAdminOptions = {}) {
	const steps: string[] = [];
	const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
	const filters: Array<{ table: string; method: string; args: unknown[] }> = [];
	const removed: Record<string, string[]> = {};
	const rpcArgs: Record<string, unknown> = {};

	const from = (table: string) => {
		const builder: any = {
			update: (values: Record<string, unknown>) => {
				updates.push({ table, values });
				return builder;
			},
			then: (resolve: (value: unknown) => unknown) =>
				resolve({ data: options.tableRows?.[table] ?? [], error: null })
		};
		for (const method of ['select', 'eq', 'in', 'neq', 'lt', 'order', 'limit']) {
			builder[method] = (...args: unknown[]) => {
				filters.push({ table, method, args });
				return builder;
			};
		}
		return builder;
	};

	const listed = [
		{ bucket_id: 'voice_notes', object_name: `${USER_ID}/note.webm` },
		{ bucket_id: 'libri-assets', object_name: 'library-1/cover.png' }
	];
	const admin = {
		from,
		rpc: vi.fn((name: string, args: unknown) => {
			rpcArgs[name] = args;
			if (name === 'claim_due_account_deletions') {
				return Promise.resolve({ data: [REQUEST], error: null });
			}
			if (name === 'list_account_deletion_storage_objects') {
				const builder: any = {
					order: () => builder,
					range: (start: number) =>
						Promise.resolve({ data: start === 0 ? listed : [], error: null })
				};
				return builder;
			}
			steps.push(name);
			return Promise.resolve({ data: {}, error: null });
		}),
		schema: vi.fn(() => ({
			rpc: vi.fn((name: string, args: unknown) => {
				rpcArgs[`libri.${name}`] = args;
				steps.push(`libri.${name}`);
				if (name === 'account_deletion_storage_scope') {
					return Promise.resolve({
						data: {
							library_ids: ['library-1'],
							object_paths: ['library-2/uploads/upload-1/original.png']
						},
						error: null
					});
				}
				return Promise.resolve({ data: {}, error: options.libriPurgeError ?? null });
			})
		})),
		storage: {
			from: (bucket: string) => ({
				remove: vi.fn(async (paths: string[]) => {
					steps.push(`storage.${bucket}`);
					removed[bucket] = [...(removed[bucket] ?? []), ...paths];
					return { error: null };
				})
			})
		},
		auth: {
			admin: {
				deleteUser: vi.fn(async () => {
					steps.push('auth.deleteUser');
					return { error: null };
				})
			}
		}
	};

	return { admin, steps, updates, filters, removed, rpcArgs };
}

describe('processDueAccountDeletions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Gmail, Calendar and Stripe are unconfigured mocks here; their failures are logged.
		vi.spyOn(console, 'error').mockImplementation(() => {});
		mocks.deletePostHogPerson.mockImplementation(async () => {
			return 'deleted';
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('removes Libri files and rows before the public purge, then deletes the PostHog person', async () => {
		const fake = createFakeAdmin();
		mocks.createAdminSupabaseClient.mockReturnValue(fake.admin);
		mocks.deletePostHogPerson.mockImplementation(async () => {
			fake.steps.push('posthog');
			return 'deleted';
		});

		const result = await processDueAccountDeletions();

		expect(result).toMatchObject({
			claimed: 1,
			completed: 1,
			failed: 0,
			posthogPersonsDeleted: 1
		});
		expect(fake.rpcArgs.list_account_deletion_storage_objects).toEqual({
			p_user_id: USER_ID,
			p_libri_library_ids: ['library-1']
		});
		expect(fake.removed['libri-assets']).toEqual([
			'library-1/cover.png',
			'library-2/uploads/upload-1/original.png'
		]);
		expect(fake.steps).toEqual([
			'libri.account_deletion_storage_scope',
			'storage.voice_notes',
			'storage.libri-assets',
			'libri.purge_account_deletion',
			'finalize_account_deletion_database',
			'auth.deleteUser',
			'posthog'
		]);
		expect(mocks.deletePostHogPerson).toHaveBeenCalledWith(USER_ID);
		expect(fake.updates).toContainEqual({
			table: 'account_deletion_requests',
			values: expect.objectContaining({
				status: 'completed',
				posthog_deletion_status: 'deleted'
			})
		});
	});

	it('completes the purge and records skipped when PostHog is not configured', async () => {
		const fake = createFakeAdmin();
		mocks.createAdminSupabaseClient.mockReturnValue(fake.admin);
		mocks.deletePostHogPerson.mockResolvedValue('skipped');

		const result = await processDueAccountDeletions();

		expect(result).toMatchObject({ completed: 1, failed: 0, posthogDeletionsSkipped: 1 });
		expect(fake.updates).toContainEqual({
			table: 'account_deletion_requests',
			values: expect.objectContaining({
				status: 'completed',
				posthog_deletion_status: 'skipped'
			})
		});
	});

	it('fails the request, without the public purge, when the Libri purge fails', async () => {
		const fake = createFakeAdmin({ libriPurgeError: new Error('libri blocked') });
		mocks.createAdminSupabaseClient.mockReturnValue(fake.admin);

		const result = await processDueAccountDeletions();

		expect(result).toMatchObject({ completed: 0, failed: 1 });
		expect(fake.steps).not.toContain('finalize_account_deletion_database');
		expect(fake.steps).not.toContain('auth.deleteUser');
		expect(mocks.deletePostHogPerson).not.toHaveBeenCalled();
		expect(fake.updates).toContainEqual({
			table: 'account_deletion_requests',
			values: expect.objectContaining({ status: 'failed', last_error: 'libri blocked' })
		});
	});
});

describe('alertOverdueAccountDeletions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('writes a critical security event per request a day past its deadline, naming only the request', async () => {
		const fake = createFakeAdmin({
			tableRows: {
				account_deletion_requests: [
					{
						id: 'request-9',
						status: 'failed',
						scheduled_for: '2026-09-20T00:00:00.000Z',
						attempt_count: 7
					}
				]
			}
		});
		mocks.createAdminSupabaseClient.mockReturnValue(fake.admin);

		const count = await alertOverdueAccountDeletions(new Date('2026-09-24T12:00:00.000Z'));

		expect(count).toBe(1);
		expect(fake.filters).toContainEqual({
			table: 'account_deletion_requests',
			method: 'neq',
			args: ['status', 'completed']
		});
		expect(fake.filters).toContainEqual({
			table: 'account_deletion_requests',
			method: 'lt',
			args: ['scheduled_for', '2026-09-23T12:00:00.000Z']
		});
		expect(mocks.logSecurityEventBlocking).toHaveBeenCalledTimes(1);
		const [event] = mocks.logSecurityEventBlocking.mock.calls[0]!;
		expect(event).toMatchObject({
			eventType: 'account_deletion.deadline_missed',
			category: 'system',
			outcome: 'failure',
			severity: 'critical',
			actorType: 'system',
			targetType: 'account_deletion_request',
			targetId: 'request-9'
		});
		expect(event.actorUserId).toBeUndefined();
		expect(JSON.stringify(event)).not.toContain(USER_ID);
	});

	it('stays quiet when nothing is overdue', async () => {
		const fake = createFakeAdmin();
		mocks.createAdminSupabaseClient.mockReturnValue(fake.admin);

		await expect(alertOverdueAccountDeletions()).resolves.toBe(0);
		expect(mocks.logSecurityEventBlocking).not.toHaveBeenCalled();
	});
});
