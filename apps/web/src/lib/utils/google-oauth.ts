// apps/web/src/lib/utils/google-oauth.ts
import { redirect } from '@sveltejs/kit';
import { PRIVATE_GOOGLE_CLIENT_ID, PRIVATE_GOOGLE_CLIENT_SECRET } from '$env/static/private';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { normalizeRedirectPath } from '$lib/utils/auth-redirect';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export interface GoogleOAuthConfig {
	redirectUri: string;
	scope?: string;
	prompt?: string;
}

export interface GoogleProfile {
	id: string;
	email: string;
	name?: string;
	verified_email?: boolean;
}

export interface GoogleTokens {
	access_token: string;
	refresh_token?: string;
	id_token?: string;
	expires_in?: number;
	scope?: string;
	token_type?: string;
}

export class GoogleOAuthError extends Error {
	constructor(
		message: string,
		public code: string,
		public redirectPath: string
	) {
		super(message);
		this.name = 'GoogleOAuthError';
	}
}

const ERROR_DESCRIPTIONS: Record<string, string> = {
	access_denied: 'You denied access to your Google account',
	invalid_request: 'Invalid OAuth request',
	unauthorized_client: 'Unauthorized OAuth client',
	unsupported_response_type: 'Unsupported response type',
	invalid_scope: 'Invalid OAuth scope requested',
	server_error: 'Google OAuth server error',
	temporarily_unavailable: 'Google OAuth temporarily unavailable'
};

function decodeOAuthRedirect(state: string | null): string | null {
	if (!state) return null;

	try {
		const decoded = Buffer.from(state, 'base64url').toString('utf-8');
		const parsed = JSON.parse(decoded);
		if (parsed && typeof parsed.redirect === 'string') {
			return normalizeRedirectPath(parsed.redirect);
		}
	} catch {
		return null;
	}

	return null;
}

export class GoogleOAuthHandler {
	constructor(
		private supabase: SupabaseClient<Database>,
		private locals?: App.Locals
	) {}

	private async ensurePublicUserProfile(
		authUser: any,
		tokens: GoogleTokens
	): Promise<{ dbUser: any; isNewUser: boolean }> {
		const errorLogger = ErrorLoggerService.getInstance(this.supabase);

		const fetchWithClient = async (
			client: SupabaseClient<Database>,
			source: 'session' | 'admin'
		) => {
			const { data, error } = await client
				.from('users')
				.select('*')
				.eq('id', authUser.id)
				.maybeSingle();

			if (!error) {
				return { user: data ?? null, missing: !data };
			}

			if (error.code === 'PGRST116') {
				return { user: null, missing: true };
			}

			await errorLogger.logError(error, {
				endpoint: '/auth/google/callback',
				httpMethod: 'GET',
				operationType: 'auth_google_profile_fetch',
				metadata: {
					source,
					userId: authUser.id
				}
			});
			return { user: null, missing: false };
		};

		const profile = await this.getUserProfile(tokens.access_token).catch(async (error) => {
			await errorLogger.logError(error, {
				endpoint: '/auth/google/callback',
				httpMethod: 'GET',
				operationType: 'auth_google_profile_fetch_google',
				metadata: {
					userId: authUser.id
				}
			});
			return null;
		});

		const profilePayload = {
			id: authUser.id,
			email: authUser.email as string,
			name: profile?.name || authUser.user_metadata?.name || 'User',
			is_admin: false,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		};

		const insertWithClient = async (
			client: SupabaseClient<Database>,
			source: 'session' | 'admin'
		) => {
			const { data, error } = await client
				.from('users')
				.insert(profilePayload)
				.select()
				.single();
			if (!error) {
				return { user: data, created: true };
			}

			if (error.code === '23505') {
				const { user } = await fetchWithClient(client, source);
				if (user) {
					return { user, created: false };
				}
			}

			await errorLogger.logError(error, {
				endpoint: '/auth/google/callback',
				httpMethod: 'GET',
				operationType: 'auth_google_profile_insert',
				metadata: {
					source,
					userId: authUser.id
				}
			});
			return { user: null, created: false };
		};

		const existingSessionUser = await fetchWithClient(this.supabase, 'session');
		if (existingSessionUser.user) {
			return { dbUser: existingSessionUser.user, isNewUser: false };
		}

		if (existingSessionUser.missing) {
			const insertedSessionUser = await insertWithClient(this.supabase, 'session');
			if (insertedSessionUser.user) {
				return { dbUser: insertedSessionUser.user, isNewUser: insertedSessionUser.created };
			}
		}

		try {
			const adminClient = createAdminSupabaseClient();
			const existingAdminUser = await fetchWithClient(adminClient, 'admin');
			if (existingAdminUser.user) {
				return { dbUser: existingAdminUser.user, isNewUser: false };
			}

			const insertedAdminUser = await insertWithClient(adminClient, 'admin');
			if (insertedAdminUser.user) {
				return { dbUser: insertedAdminUser.user, isNewUser: insertedAdminUser.created };
			}
		} catch (error) {
			await errorLogger.logError(error, {
				endpoint: '/auth/google/callback',
				httpMethod: 'GET',
				operationType: 'auth_google_profile_admin_fallback',
				metadata: {
					userId: authUser.id
				}
			});
		}

		throw new GoogleOAuthError(
			'Account setup failed. Please try signing in again.',
			'profile_setup_failed',
			'/auth/login'
		);
	}

	/**
	 * Handle OAuth callback errors
	 */
	handleOAuthError(error: string, redirectPath: string): never {
		const errorMsg = ERROR_DESCRIPTIONS[error] || `Authentication failed: ${error}`;
		throw redirect(303, `${redirectPath}?error=${encodeURIComponent(errorMsg)}`);
	}

	/**
	 * Exchange authorization code for tokens
	 */
	async exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens> {
		const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json'
			},
			body: new URLSearchParams({
				client_id: PRIVATE_GOOGLE_CLIENT_ID,
				client_secret: PRIVATE_GOOGLE_CLIENT_SECRET,
				code,
				grant_type: 'authorization_code',
				redirect_uri: redirectUri
			})
		});

		if (!tokenResponse.ok) {
			const errorData = await tokenResponse.text();
			console.error('Token exchange failed:', errorData);
			throw new GoogleOAuthError(
				'Token exchange failed',
				'token_exchange_failed',
				'/auth/login'
			);
		}

		return await tokenResponse.json();
	}

	/**
	 * Get user profile from Google
	 */
	async getUserProfile(accessToken: string): Promise<GoogleProfile> {
		// Try userinfo v1 endpoint first (most reliable)
		let profileResponse = await fetch(
			'https://www.googleapis.com/oauth2/v1/userinfo?alt=json',
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: 'application/json'
				}
			}
		);

		if (profileResponse.ok) {
			return await profileResponse.json();
		}

		// Fallback to userinfo v2 endpoint
		profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/json'
			}
		});

		if (!profileResponse.ok) {
			throw new GoogleOAuthError(
				'Profile fetch failed',
				'profile_fetch_failed',
				'/auth/login'
			);
		}

		return await profileResponse.json();
	}

	/**
	 * Sign in or create user with Supabase
	 */
	async authenticateWithSupabase(tokens: GoogleTokens): Promise<{
		session: any;
		user: any;
		isNewUser: boolean;
	}> {
		const { data, error: authError } = await this.supabase.auth.signInWithIdToken({
			provider: 'google',
			token: tokens.id_token!,
			access_token: tokens.access_token
		});

		if (authError) {
			console.error('Supabase auth error:', authError);
			throw new GoogleOAuthError(
				'Authentication failed',
				'supabase_auth_failed',
				'/auth/login'
			);
		}

		if (!data.session || !data.user) {
			throw new GoogleOAuthError('No session created', 'no_session_created', '/auth/login');
		}

		// IMPORTANT: Verify the session is properly stored
		const { data: sessionData } = await this.supabase.auth.getSession();
		if (!sessionData.session) {
			console.error('Session not properly stored after authentication');
			// Try to set the session manually
			await this.supabase.auth.setSession({
				access_token: data.session.access_token,
				refresh_token: data.session.refresh_token
			});

			// Verify again
			const { data: verifyData } = await this.supabase.auth.getSession();
			if (!verifyData.session) {
				throw new GoogleOAuthError(
					'Failed to establish session',
					'session_creation_failed',
					'/auth/login'
				);
			}
		}

		const { dbUser, isNewUser } = await this.ensurePublicUserProfile(data.user, tokens);

		// CRITICAL: Update server-side locals if available
		// This ensures immediate recognition of the authenticated state
		if (this.locals) {
			this.locals.session = data.session;
			this.locals.user = dbUser;
			if (this.locals.user) {
				console.log('Updated server locals with authenticated user:', this.locals.user.id);
			}
		}

		return {
			session: data.session,
			user: data.user,
			isNewUser
		};
	}

	/**
	 * Handle common OAuth callback flow
	 */
	async handleCallback(
		url: URL,
		config: {
			redirectPath: string;
			successPath: string;
			isRegistration?: boolean;
		}
	): Promise<never> {
		const code = url.searchParams.get('code');
		const error = url.searchParams.get('error');
		const state = url.searchParams.get('state');
		const stateRedirect = decodeOAuthRedirect(state);

		console.log(
			`Google ${config.isRegistration ? 'registration' : 'login'} callback received:`,
			{
				hasCode: !!code,
				hasError: !!error,
				state
			}
		);

		// Handle OAuth errors
		if (error) {
			console.error('Google OAuth error:', error);
			const errorMsg = ERROR_DESCRIPTIONS[error] || `Authentication failed: ${error}`;
			throw redirect(303, `${config.redirectPath}?error=${encodeURIComponent(errorMsg)}`);
		}

		if (!code) {
			console.error('No authorization code received');
			throw redirect(
				303,
				`${config.redirectPath}?error=${encodeURIComponent('No authorization code received')}`
			);
		}

		// Process authentication
		let tokens: GoogleTokens;
		let authResult: { session: any; user: any; isNewUser: boolean };

		// Step 1: Exchange code for tokens
		try {
			const redirectUri = `${url.origin}${url.pathname}`;
			tokens = await this.exchangeCodeForTokens(code, redirectUri);
		} catch (error: any) {
			console.error('Token exchange failed:', error);
			const errorMessage =
				error instanceof GoogleOAuthError
					? error.message
					: 'Failed to exchange authorization code';
			throw redirect(303, `${config.redirectPath}?error=${encodeURIComponent(errorMessage)}`);
		}

		// Step 2: Authenticate with Supabase
		try {
			authResult = await this.authenticateWithSupabase(tokens);
			console.log(
				`Google ${config.isRegistration ? 'registration' : 'login'} successful for user:`,
				authResult.user.id
			);
		} catch (error: any) {
			console.error('Supabase authentication failed:', error);
			const errorMessage =
				error instanceof GoogleOAuthError
					? error.message
					: 'Authentication failed. Please try again.';
			throw redirect(303, `${config.redirectPath}?error=${encodeURIComponent(errorMessage)}`);
		}

		// Step 3: Handle registration-specific logic
		if (config.isRegistration && !authResult.isNewUser) {
			throw redirect(
				303,
				`/auth/login?message=${encodeURIComponent('Account already exists. Please sign in instead.')}`
			);
		}

		// Step 4: Add delay to ensure everything propagates
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Optional: route to pending invites when no explicit redirect is provided
		let pendingInviteRedirect: string | null = null;
		if (!stateRedirect) {
			try {
				const { data: pendingInvites, error: pendingError } = await this.supabase.rpc(
					'list_pending_project_invites'
				);
				if (pendingError) {
					const errorLogger = ErrorLoggerService.getInstance(this.supabase);
					await errorLogger.logError(pendingError, {
						userId: authResult?.user?.id,
						endpoint: '/api/onto/invites/pending',
						httpMethod: 'GET',
						operationType: 'project_invites_pending_list',
						metadata: {
							source: 'google_oauth',
							flow: config.isRegistration ? 'register' : 'login'
						}
					});
				}
				if (!pendingError && Array.isArray(pendingInvites) && pendingInvites.length > 0) {
					pendingInviteRedirect = `/invites?message=${encodeURIComponent(
						'You have pending invites'
					)}`;
				}
			} catch (err) {
				console.warn('[Auth] Failed to check pending invites after OAuth:', err);
				const errorLogger = ErrorLoggerService.getInstance(this.supabase);
				await errorLogger.logError(err, {
					userId: authResult?.user?.id,
					endpoint: '/api/onto/invites/pending',
					httpMethod: 'GET',
					operationType: 'project_invites_pending_list',
					metadata: {
						source: 'google_oauth',
						flow: config.isRegistration ? 'register' : 'login'
					}
				});
			}
		}

		// Step 5: Build and execute redirect
		const redirectUrl = new URL(
			stateRedirect ?? pendingInviteRedirect ?? config.successPath,
			url.origin
		);

		// Add parameters to trigger client-side refresh
		redirectUrl.searchParams.set('auth_success', 'true');
		redirectUrl.searchParams.set('auth_time', Date.now().toString());

		// Add a unique key to force invalidation
		const authKey = Math.random().toString(36).substring(2) + Date.now().toString(36);
		redirectUrl.searchParams.set('auth_key', authKey);

		if (authResult.isNewUser || config.isRegistration) {
			redirectUrl.searchParams.set('new_user', 'true');
			if (config.isRegistration) {
				redirectUrl.searchParams.set('onboarding', 'true');
				redirectUrl.searchParams.set(
					'message',
					'Welcome to BuildOS! Your account has been created successfully.'
				);
			}
		}

		console.log('Redirecting to:', redirectUrl.pathname + redirectUrl.search);
		throw redirect(303, redirectUrl.pathname + redirectUrl.search);
	}
}
