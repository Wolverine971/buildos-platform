// apps/web/src/routes/api/auth/login/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAuthenticatedSupabaseClientMock, logErrorMock } = vi.hoisted(() => ({
	createAuthenticatedSupabaseClientMock: vi.fn(),
	logErrorMock: vi.fn()
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

import { POST } from './+server';

function createUsersClient({
	existingUser = null,
	insertedUser = null,
	insertError = null
}: {
	existingUser?: Record<string, any> | null;
	insertedUser?: Record<string, any> | null;
	insertError?: { code?: string; message?: string } | null;
}) {
	const maybeSingle = vi.fn().mockResolvedValue({
		data: existingUser,
		error: existingUser ? null : { code: 'PGRST116', message: 'Not found' }
	});
	const insertSingle = vi.fn().mockResolvedValue({
		data: insertError ? null : insertedUser,
		error: insertError
	});
	const insertSelectChain: any = {
		select: vi.fn(() => insertSelectChain),
		single: insertSingle
	};
	const queryBuilder: any = {
		select: vi.fn(() => queryBuilder),
		eq: vi.fn(() => queryBuilder),
		maybeSingle
	};

	return {
		from: vi.fn((table: string) => {
			if (table !== 'users') {
				throw new Error(`Unexpected table: ${table}`);
			}

			return {
				...queryBuilder,
				insert: vi.fn(() => insertSelectChain)
			};
		})
	};
}

function createLocals({
	sessionClient,
	signInUser
}: {
	sessionClient: ReturnType<typeof createUsersClient>;
	signInUser: Record<string, any>;
}) {
	return {
		supabase: {
			auth: {
				signInWithPassword: vi.fn().mockResolvedValue({
					data: {
						user: signInUser,
						session: {
							access_token: 'access-token-1',
							refresh_token: 'refresh-token-1'
						}
					},
					error: null
				}),
				setSession: vi.fn().mockResolvedValue({ error: null })
			},
			...sessionClient
		},
		safeGetSession: vi.fn().mockResolvedValue({ user: null }),
		session: null,
		user: null
	};
}

describe('POST /api/auth/login', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('repairs the public profile through an access-token scoped client', async () => {
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

		const response = await POST({
			request: new Request('http://localhost/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'USER@example.com',
					password: 'Password123'
				})
			}),
			locals: createLocals({
				sessionClient: createUsersClient({}),
				signInUser: authUser
			})
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.user.id).toBe('user-1');
		expect(createAuthenticatedSupabaseClientMock).toHaveBeenCalledWith('access-token-1');
	});

	it('falls back to the request-scoped session client when token-scoped insert fails', async () => {
		const profileUser = {
			id: 'user-1',
			email: 'user@example.com',
			name: 'Recovered User'
		};
		const authUser = {
			id: 'user-1',
			email: 'user@example.com',
			created_at: '2026-04-08T12:00:00.000Z',
			user_metadata: { name: 'Recovered User' }
		};

		createAuthenticatedSupabaseClientMock.mockReturnValueOnce(
			createUsersClient({
				insertError: {
					code: '42501',
					message: 'RLS denied'
				}
			})
		);

		const response = await POST({
			request: new Request('http://localhost/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'user@example.com',
					password: 'Password123'
				})
			}),
			locals: createLocals({
				sessionClient: createUsersClient({
					existingUser: profileUser
				}),
				signInUser: authUser
			})
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.user.name).toBe('Recovered User');
		expect(logErrorMock).toHaveBeenCalledWith(
			expect.objectContaining({ code: '42501' }),
			expect.objectContaining({
				operationType: 'auth_login_profile_insert'
			})
		);
	});
});
