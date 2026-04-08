// apps/web/src/routes/api/auth/register/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	createAuthenticatedSupabaseClientMock,
	createAdminSupabaseClientMock,
	logErrorMock,
	startSequenceForUserMock
} = vi.hoisted(() => ({
	createAuthenticatedSupabaseClientMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn(),
	logErrorMock: vi.fn(),
	startSequenceForUserMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/services/errorLogger.service', () => ({
	ErrorLoggerService: {
		getInstance: vi.fn(() => ({
			logError: logErrorMock
		}))
	}
}));

vi.mock('$lib/supabase/authenticated', () => ({
	createAuthenticatedSupabaseClient: createAuthenticatedSupabaseClientMock
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/welcome-sequence.service', () => ({
	WelcomeSequenceService: class MockWelcomeSequenceService {
		startSequenceForUser = startSequenceForUserMock;
	}
}));

import { POST } from './+server';

function createUsersClient({
	existingUser = null,
	insertedUser = null
}: {
	existingUser?: Record<string, any> | null;
	insertedUser?: Record<string, any> | null;
}) {
	const maybeSingle = vi.fn().mockResolvedValue({
		data: existingUser,
		error: existingUser ? null : { code: 'PGRST116', message: 'Not found' }
	});
	const insertSingle = vi.fn().mockResolvedValue({
		data: insertedUser,
		error: null
	});
	const insertSelectChain: any = {
		select: vi.fn(() => insertSelectChain),
		single: insertSingle
	};
	const queryBuilder: any = {
		select: vi.fn(() => queryBuilder),
		eq: vi.fn(() => queryBuilder),
		maybeSingle,
		insert: vi.fn(() => insertSelectChain)
	};

	return {
		from: vi.fn((table: string) => {
			if (table !== 'users') {
				throw new Error(`Unexpected table: ${table}`);
			}

			return queryBuilder;
		})
	};
}

function createLocals({
	signUpResult,
	sessionClient,
	sessionUser
}: {
	signUpResult: {
		user: Record<string, any> | null;
		session: { access_token: string; refresh_token: string } | null;
	};
	sessionClient: ReturnType<typeof createUsersClient>;
	sessionUser: Record<string, any> | null;
}) {
	return {
		supabase: {
			auth: {
				signUp: vi.fn().mockResolvedValue({
					data: signUpResult,
					error: null
				}),
				signOut: vi.fn().mockResolvedValue({ error: null })
			},
			...sessionClient
		},
		safeGetSession: vi.fn().mockResolvedValue({
			user: sessionUser
		}),
		session: null,
		user: null
	};
}

describe('POST /api/auth/register', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses an access-token scoped client when signup returns a session', async () => {
		const profileUser = {
			id: 'user-1',
			email: 'user@example.com',
			name: 'User'
		};
		const authUser = {
			id: 'user-1',
			email: 'user@example.com',
			created_at: '2026-04-08T12:00:00.000Z',
			user_metadata: { name: 'User' }
		};
		createAuthenticatedSupabaseClientMock.mockReturnValueOnce(
			createUsersClient({
				insertedUser: profileUser
			})
		);
		createAdminSupabaseClientMock.mockReturnValue({});

		const response = await POST({
			request: new Request('http://localhost/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'user@example.com',
					password: 'Password123',
					name: 'User'
				})
			}),
			locals: createLocals({
				signUpResult: {
					user: authUser,
					session: {
						access_token: 'signup-token-1',
						refresh_token: 'refresh-token-1'
					}
				},
				sessionClient: createUsersClient({}),
				sessionUser: profileUser
			})
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.user.id).toBe('user-1');
		expect(createAuthenticatedSupabaseClientMock).toHaveBeenCalledWith('signup-token-1');
		expect(startSequenceForUserMock).toHaveBeenCalledWith({
			userId: 'user-1',
			signupMethod: 'email'
		});
	});

	it('keeps the admin profile path only for email-confirmation signups without a session', async () => {
		const profileUser = {
			id: 'user-2',
			email: 'pending@example.com',
			name: 'Pending User'
		};
		const authUser = {
			id: 'user-2',
			email: 'pending@example.com',
			created_at: '2026-04-08T12:00:00.000Z',
			user_metadata: { name: 'Pending User' }
		};
		createAdminSupabaseClientMock.mockReturnValue(
			createUsersClient({ insertedUser: profileUser })
		);

		const response = await POST({
			request: new Request('http://localhost/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'pending@example.com',
					password: 'Password123',
					name: 'Pending User'
				})
			}),
			locals: createLocals({
				signUpResult: {
					user: authUser,
					session: null
				},
				sessionClient: createUsersClient({}),
				sessionUser: null
			})
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.requiresEmailConfirmation).toBe(true);
		expect(createAuthenticatedSupabaseClientMock).not.toHaveBeenCalled();
		expect(createAdminSupabaseClientMock).toHaveBeenCalled();
	});
});
