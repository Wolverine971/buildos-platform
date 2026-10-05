// apps/web/src/routes/api/auth/register/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	createAuthenticatedSupabaseClientMock,
	createAdminSupabaseClientMock,
	logErrorMock,
	startSequenceForUserMock,
	consumeLegalAcceptanceIntentMock,
	captureServerEventMock
} = vi.hoisted(() => ({
	createAuthenticatedSupabaseClientMock: vi.fn(),
	createAdminSupabaseClientMock: vi.fn(),
	logErrorMock: vi.fn(),
	startSequenceForUserMock: vi.fn().mockResolvedValue(undefined),
	consumeLegalAcceptanceIntentMock: vi.fn().mockResolvedValue(true),
	captureServerEventMock: vi.fn().mockResolvedValue(undefined)
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

vi.mock('$lib/server/legal-acceptance', () => ({
	consumeLegalAcceptanceIntent: consumeLegalAcceptanceIntentMock
}));

vi.mock('$lib/server/posthog', () => ({
	captureServerEvent: captureServerEventMock
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
		consumeLegalAcceptanceIntentMock.mockResolvedValue(true);
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
					name: 'User',
					legalAcceptanceToken: 'legal-token-1'
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
		expect(consumeLegalAcceptanceIntentMock).toHaveBeenCalledWith({
			token: 'legal-token-1',
			userId: 'user-1',
			surface: 'email_signup'
		});
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
					name: 'Pending User',
					legalAcceptanceToken: 'legal-token-2'
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

	it('keeps only the origin and path of the sign-up referrer and landing page', async () => {
		const profileUser = { id: 'user-3', email: 'new@example.com', name: 'New' };
		createAuthenticatedSupabaseClientMock.mockReturnValueOnce(
			createUsersClient({ insertedUser: profileUser })
		);
		const attributionUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
		createAdminSupabaseClientMock.mockReturnValue({
			from: vi.fn(() => ({ update: attributionUpdate }))
		});

		const response = await POST({
			request: new Request('http://localhost/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'new@example.com',
					password: 'Password123',
					name: 'New',
					legalAcceptanceToken: 'legal-token-3',
					attribution: {
						referrer:
							'https://news.example.com/post/7?email=new%40example.com#comments',
						landing_page: 'https://build-os.com/pricing?coupon=SECRET#plans'
					}
				})
			}),
			locals: createLocals({
				signUpResult: {
					user: {
						id: 'user-3',
						email: 'new@example.com',
						created_at: '2026-09-24T12:00:00.000Z',
						user_metadata: { name: 'New' }
					},
					session: { access_token: 'signup-token-3', refresh_token: 'refresh-token-3' }
				},
				sessionClient: createUsersClient({}),
				sessionUser: profileUser
			})
		} as any);

		expect(response.status).toBe(200);
		expect(captureServerEventMock).toHaveBeenCalledWith(
			'user-3',
			'signup',
			expect.objectContaining({
				signup_source: 'news.example.com',
				landing_page: 'https://build-os.com/pricing',
				$set_once: expect.objectContaining({
					referrer: 'https://news.example.com/post/7'
				})
			})
		);
		expect(attributionUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ referrer: 'https://news.example.com/post/7' })
		);
		expect(
			JSON.stringify([captureServerEventMock.mock.calls, attributionUpdate.mock.calls])
		).not.toMatch(/SECRET|new%40example|#comments|#plans/);
	});

	describe('Try in BuildOS signups', () => {
		const tryRedirect = `/?${new URLSearchParams({
			open: 'agent-chat',
			skill: 'going_viral',
			prompt: 'Use the Going Viral skill.\n\nStarting ask: help me post'
		})}`;

		async function registerWith(body: Record<string, unknown>, session = true) {
			const profileUser = { id: 'user-9', email: 'try@example.com', name: 'Try' };
			if (session) {
				createAuthenticatedSupabaseClientMock.mockReturnValueOnce(
					createUsersClient({ insertedUser: profileUser })
				);
			}
			const usersClient = createUsersClient({ insertedUser: profileUser });
			const attributionUpdate = vi.fn(() => ({
				eq: vi.fn().mockResolvedValue({ error: null })
			}));
			createAdminSupabaseClientMock.mockReturnValue({
				from: vi.fn((table: string) => ({
					...usersClient.from(table),
					update: attributionUpdate
				}))
			});
			const locals = createLocals({
				signUpResult: {
					user: {
						id: 'user-9',
						email: 'try@example.com',
						created_at: '2026-10-04T12:00:00.000Z',
						user_metadata: { name: 'Try' }
					},
					session: session
						? { access_token: 'signup-token-9', refresh_token: 'refresh-token-9' }
						: null
				},
				sessionClient: createUsersClient({}),
				sessionUser: session ? profileUser : null
			});

			const response = await POST({
				request: new Request('https://build-os.com/api/auth/register', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: 'try@example.com',
						password: 'Password123',
						name: 'Try',
						legalAcceptanceToken: 'legal-token-9',
						...body
					})
				}),
				locals
			} as any);

			return { response, attributionUpdate, signUp: locals.supabase.auth.signUp };
		}

		it('tags the signup with the skill from the redirect it carried', async () => {
			const { response, attributionUpdate } = await registerWith({ redirect: tryRedirect });

			expect(response.status).toBe(200);
			expect(attributionUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ signup_source: 'skill:going_viral', utm_source: null })
			);
			expect(captureServerEventMock).toHaveBeenCalledWith(
				'user-9',
				'signup',
				expect.objectContaining({
					signup_source: 'skill:going_viral',
					launch_skill: 'going_viral'
				})
			);
		});

		it('keeps an explicit UTM source and its columns ahead of the skill tag', async () => {
			const { attributionUpdate } = await registerWith({
				redirect: tryRedirect,
				attribution: { utm_source: 'newsletter', utm_campaign: 'oct' }
			});

			expect(attributionUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					signup_source: 'newsletter',
					utm_source: 'newsletter',
					utm_campaign: 'oct'
				})
			);
			expect(captureServerEventMock).toHaveBeenCalledWith(
				'user-9',
				'signup',
				expect.objectContaining({ launch_skill: 'going_viral' })
			);
		});

		it.each([
			['no redirect', {}],
			['a free-text skill', { redirect: '/?open=agent-chat&skill=Ignore%20this&prompt=x' }],
			[
				'an off-site redirect',
				{ redirect: 'https://evil.example/?open=agent-chat&skill=going_viral' }
			],
			['a redirect that is not a chat launch', { redirect: '/projects?skill=going_viral' }]
		])('falls back to the normal source for %s', async (_label, body) => {
			const { attributionUpdate } = await registerWith(body);

			expect(attributionUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ signup_source: 'direct' })
			);
			expect(captureServerEventMock).toHaveBeenCalledWith(
				'user-9',
				'signup',
				expect.objectContaining({ launch_skill: null })
			);
		});

		it('routes the confirmation email back through /auth/confirm to the same launch', async () => {
			const { response, signUp } = await registerWith({ redirect: tryRedirect }, false);
			const payload = await response.json();

			expect(payload.data.requiresEmailConfirmation).toBe(true);
			expect(signUp).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({
					options: expect.objectContaining({
						emailRedirectTo: `https://build-os.com/auth/confirm?${new URLSearchParams({
							next: tryRedirect
						})}`
					})
				})
			);
		});

		it.each([
			['no redirect', {}],
			['an off-site redirect', { redirect: '//evil.example/' }]
		])(
			'still routes the confirmation through /auth/confirm (home) with %s',
			async (_label, body) => {
				const { signUp } = await registerWith(body, false);

				// No `next`: /auth/confirm signs them in and lands them on /today.
				expect(signUp).toHaveBeenCalledExactlyOnceWith({
					email: 'try@example.com',
					password: 'Password123',
					options: {
						data: { name: 'Try' },
						emailRedirectTo: 'https://build-os.com/auth/confirm'
					}
				});
			}
		);
	});
});
