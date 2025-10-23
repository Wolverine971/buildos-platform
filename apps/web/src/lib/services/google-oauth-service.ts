// apps/web/src/lib/services/google-oauth-service.ts
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarTokens } from '../../app';
import { PRIVATE_GOOGLE_CLIENT_ID, PRIVATE_GOOGLE_CLIENT_SECRET } from '$env/static/private';
import { randomBytes } from 'node:crypto';
import { ErrorLoggerService } from './errorLogger.service';

export interface CalendarStatus {
	isConnected: boolean;
	lastSync?: string | null;
	scope?: string | null;
	google_email?: string | null;
}

export interface CalendarAuthState {
	userId: string;
	redirectPath?: string;
	nonce: string | null;
}

export interface TokenRefreshResult {
	success: boolean;
	error?: string;
	requiresReconnect?: boolean;
}

export interface AutoRefreshResult {
	refreshed: boolean;
	error?: string;
	requiresReconnect?: boolean;
}

export class GoogleOAuthConnectionError extends Error {
	public readonly requiresReconnection: boolean;

	constructor(message: string, requiresReconnection = false) {
		super(message);
		this.name = 'GoogleOAuthConnectionError';
		this.requiresReconnection = requiresReconnection;
	}
}

export class GoogleOAuthService {
	private supabase: SupabaseClient;
	private errorLogger: ErrorLoggerService;
	private clientCache = new Map<string, { client: OAuth2Client; expires: number }>();
	private readonly MAX_RETRIES = 3;
	private readonly RETRY_DELAY_MS = 1000;

	constructor(supabase: SupabaseClient) {
		this.supabase = supabase;
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
	}

	/**
	 * Retry API calls with exponential backoff
	 */
	private async retryWithBackoff<T>(
		fn: () => Promise<T>,
		retries = this.MAX_RETRIES
	): Promise<T> {
		try {
			return await fn();
		} catch (error: any) {
			// Check if error is retryable (network issues, rate limits)
			const isRetryable =
				error.code === 'ENOTFOUND' ||
				error.code === 'ETIMEDOUT' ||
				error.code === 'ECONNRESET' ||
				(error.response?.status >= 500 && error.response?.status < 600) ||
				error.response?.status === 429;

			if (retries > 0 && isRetryable) {
				const delay = this.RETRY_DELAY_MS * Math.pow(2, this.MAX_RETRIES - retries);
				await new Promise((resolve) => setTimeout(resolve, delay));
				return this.retryWithBackoff(fn, retries - 1);
			}
			throw error;
		}
	}

	/**
	 * Generate Google Calendar OAuth URL with comprehensive scopes
	 */
	static encodeCalendarState(state: CalendarAuthState): string {
		return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64url');
	}

	static decodeCalendarState(state: string | null): CalendarAuthState | null {
		if (!state) return null;

		try {
			const decoded = Buffer.from(state, 'base64url').toString('utf-8');
			const parsed = JSON.parse(decoded);
			if (parsed && typeof parsed.userId === 'string') {
				return {
					userId: parsed.userId,
					redirectPath:
						typeof parsed.redirectPath === 'string' ? parsed.redirectPath : undefined,
					nonce: typeof parsed.nonce === 'string' ? parsed.nonce : null
				};
			}
		} catch (error) {
			// Fall back to legacy plain userId state format
			if (typeof state === 'string' && state.length > 0) {
				return { userId: state, nonce: null };
			}
		}

		return null;
	}

	generateCalendarAuthUrl(
		redirectUri: string,
		userId: string,
		options?: { redirectPath?: string }
	): string {
		const scopes = [
			'https://www.googleapis.com/auth/calendar', // Full calendar access
			'https://www.googleapis.com/auth/userinfo.email',
			'openid'
		].join(' ');

		const state: CalendarAuthState = {
			userId,
			redirectPath: options?.redirectPath,
			nonce: randomBytes(16).toString('hex')
		};

		const params = new URLSearchParams({
			client_id: PRIVATE_GOOGLE_CLIENT_ID,
			response_type: 'code',
			scope: scopes,
			redirect_uri: redirectUri,
			state: GoogleOAuthService.encodeCalendarState(state),
			access_type: 'offline',
			prompt: 'consent',
			include_granted_scopes: 'true'
		});

		return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
	}

	/**
	 * Get calendar connection status
	 */
	async getCalendarStatus(userId: string): Promise<CalendarStatus> {
		try {
			const { data: tokens, error } = await this.supabase
				.from('user_calendar_tokens')
				.select('access_token, refresh_token, updated_at, scope, google_email')
				.eq('user_id', userId)
				.single();

			if (error || !tokens) {
				return { isConnected: false };
			}

			const isConnected = !!(tokens.access_token && tokens.refresh_token);

			return {
				isConnected,
				lastSync: tokens.updated_at,
				scope: tokens.scope,
				google_email: tokens.google_email
			};
		} catch (error) {
			console.error('Error checking calendar status:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'user_calendar_tokens',
				userId,
				{ operation: 'getCalendarStatus' }
			);
			return { isConnected: false };
		}
	}

	/**
	 * Safely get connection status without throwing errors
	 */
	async safeGetCalendarStatus(userId: string): Promise<CalendarStatus> {
		try {
			return await this.getCalendarStatus(userId);
		} catch (error) {
			console.error('Safe calendar status check failed:', error);
			return { isConnected: false };
		}
	}

	/**
	 * Get authenticated OAuth2 client with automatic token refresh
	 */
	async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
		// Check cache first (cache for 10 minutes)
		const cached = this.clientCache.get(userId);
		if (cached && cached.expires > Date.now()) {
			return cached.client;
		}

		const tokens = await this.getTokens(userId);
		if (!tokens?.hasValidTokens) {
			throw new GoogleOAuthConnectionError(
				'No calendar connection found. Please connect your Google Calendar.',
				true
			);
		}

		// Create OAuth2 client
		const oauth2Client = new google.auth.OAuth2(
			PRIVATE_GOOGLE_CLIENT_ID,
			PRIVATE_GOOGLE_CLIENT_SECRET
		);

		// Set credentials
		oauth2Client.setCredentials({
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token,
			expiry_date: tokens.expiry_date,
			token_type: tokens.token_type || 'Bearer',
			scope: tokens.scope || 'https://www.googleapis.com/auth/calendar'
		});

		// Set up automatic token refresh event listener
		oauth2Client.on('tokens', (newTokens) => {
			// Store the new tokens when they are refreshed
			if (newTokens.refresh_token || newTokens.access_token) {
				this.updateTokens(userId, newTokens).catch((error) => {
					console.error('Failed to update tokens after refresh:', error);
				});
			}
		});

		// Handle token refresh automatically
		if (tokens.needsRefresh) {
			try {
				const { credentials } = await oauth2Client.refreshAccessToken();
				await this.updateTokens(userId, credentials);
				oauth2Client.setCredentials(credentials);
			} catch (refreshError: any) {
				console.error('Token refresh failed:', refreshError);
				await this.errorLogger.logAPIError(
					refreshError,
					'https://oauth2.googleapis.com/token',
					'POST',
					userId,
					{
						operation: 'refreshAccessToken',
						errorType: 'oauth_token_refresh_failure',
						requiresReconnection: true
					}
				);
				throw new GoogleOAuthConnectionError(
					'Calendar authentication expired. Connection has been reset.',
					true
				);
			}
		}

		// Set up automatic token refresh for future requests
		oauth2Client.on('tokens', async (newTokens) => {
			try {
				await this.updateTokens(userId, newTokens);
			} catch (updateError) {
				console.error('Failed to update tokens in database:', updateError);
				await this.errorLogger.logDatabaseError(
					updateError,
					'UPDATE',
					'user_calendar_tokens',
					userId,
					{
						operation: 'updateTokensAfterRefresh',
						hasRefreshToken: !!newTokens.refresh_token,
						hasAccessToken: !!newTokens.access_token
					}
				);
			}
		});

		// Cache the client for 10 minutes
		this.clientCache.set(userId, {
			client: oauth2Client,
			expires: Date.now() + 10 * 60 * 1000
		});

		return oauth2Client;
	}

	/**
	 * Get tokens from database with validation
	 */
	private async getTokens(userId: string): Promise<CalendarTokens | null> {
		try {
			const { data: tokens, error } = await this.supabase
				.from('user_calendar_tokens')
				.select('access_token, refresh_token, expiry_date, scope, updated_at, token_type')
				.eq('user_id', userId)
				.single();

			if (error || !tokens) {
				return null;
			}

			const hasValidTokens = !!(tokens.access_token && tokens.refresh_token);
			const needsRefresh = tokens.expiry_date
				? tokens.expiry_date < Date.now() + 5 * 60 * 1000
				: false;

			return {
				...tokens,
				hasValidTokens,
				needsRefresh
			};
		} catch (error) {
			console.error('Error fetching calendar tokens:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'user_calendar_tokens',
				userId,
				{ operation: 'getTokens' }
			);
			return null;
		}
	}

	/**
	 * Update tokens in database
	 */
	private async updateTokens(userId: string, credentials: any): Promise<void> {
		const { error } = await this.supabase
			.from('user_calendar_tokens')
			.update({
				access_token: credentials.access_token,
				refresh_token: credentials.refresh_token || undefined,
				expiry_date: credentials.expiry_date || null,
				token_type: credentials.token_type || 'Bearer',
				scope: credentials.scope || undefined,
				updated_at: new Date().toISOString()
			})
			.eq('user_id', userId);

		if (error) {
			throw new Error('Failed to update tokens in database');
		}

		// Clear cache to force reload
		this.clientCache.delete(userId);
	}

	/**
	 * Refresh calendar tokens
	 */
	async refreshCalendarToken(
		userId: string,
		options: { autoRefresh?: boolean } = {}
	): Promise<TokenRefreshResult> {
		try {
			// Get current tokens
			const { data: tokens, error: fetchError } = await this.supabase
				.from('user_calendar_tokens')
				.select('*')
				.eq('user_id', userId)
				.single();

			if (fetchError || !tokens) {
				return {
					success: false,
					error: 'No calendar tokens found',
					requiresReconnect: true
				};
			}

			if (!tokens.refresh_token) {
				return {
					success: false,
					error: 'No refresh token available',
					requiresReconnect: true
				};
			}

			// Create OAuth2 client
			const oauth2Client = new google.auth.OAuth2(
				PRIVATE_GOOGLE_CLIENT_ID,
				PRIVATE_GOOGLE_CLIENT_SECRET
			);

			// Set the refresh token
			oauth2Client.setCredentials({
				refresh_token: tokens.refresh_token
			});

			try {
				// Force refresh
				const { credentials } = await oauth2Client.refreshAccessToken();

				// Update database with new tokens
				const { error: updateError } = await this.supabase
					.from('user_calendar_tokens')
					.update({
						access_token: credentials.access_token!,
						refresh_token: credentials.refresh_token || tokens.refresh_token,
						expiry_date: credentials.expiry_date || null,
						token_type: credentials.token_type || 'Bearer',
						scope: credentials.scope || tokens.scope,
						updated_at: new Date().toISOString()
					})
					.eq('user_id', userId);

				if (updateError) {
					console.error('Database update error:', updateError);
					return {
						success: false,
						error: 'Failed to update tokens in database'
					};
				}

				// Log successful refresh if it's an auto-refresh
				if (options.autoRefresh) {
					console.log('Calendar tokens auto-refreshed successfully for user:', userId);
				}

				return { success: true };
			} catch (refreshError: any) {
				console.error('OAuth refresh error:', refreshError);

				// Handle specific OAuth errors
				const requiresReconnect =
					refreshError.message?.includes('invalid_grant') ||
					refreshError.message?.includes('Token has been expired or revoked') ||
					refreshError.message?.includes('invalid_client') ||
					refreshError.status === 400 ||
					refreshError.code === 400;

				await this.errorLogger.logAPIError(
					refreshError,
					'https://oauth2.googleapis.com/token',
					'POST',
					userId,
					{
						operation: 'refreshCalendarToken',
						errorType: 'oauth_refresh_failure',
						requiresReconnection: requiresReconnect,
						isAutoRefresh: options.autoRefresh || false
					}
				);

				if (requiresReconnect) {
					return {
						success: false,
						error: 'Calendar authorization has expired. Please reconnect your calendar.',
						requiresReconnect: true
					};
				}

				return {
					success: false,
					error: refreshError.message || 'Failed to refresh calendar tokens'
				};
			}
		} catch (error: any) {
			console.error('Token refresh failed:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'user_calendar_tokens',
				userId,
				{
					operation: 'refreshCalendarToken_outer',
					errorType: 'token_fetch_failure'
				}
			);
			return {
				success: false,
				error: error.message || 'Failed to refresh token'
			};
		}
	}

	/**
	 * Check if token needs refresh
	 */
	tokenNeedsRefresh(expiryDate: number | null): boolean {
		if (!expiryDate) return false;
		// Refresh if token expires in less than 5 minutes
		const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;
		return expiryDate < fiveMinutesFromNow;
	}

	/**
	 * Check if token is completely expired
	 */
	tokenIsExpired(expiryDate: number | null): boolean {
		if (!expiryDate) return false;
		return expiryDate < Date.now();
	}

	/**
	 * Auto-refresh calendar tokens for a user if needed
	 */
	async autoRefreshIfNeeded(userId: string): Promise<AutoRefreshResult> {
		try {
			// Get current tokens
			const { data: tokens, error: fetchError } = await this.supabase
				.from('user_calendar_tokens')
				.select('expiry_date, refresh_token')
				.eq('user_id', userId)
				.single();

			if (fetchError || !tokens) {
				return {
					refreshed: false,
					error: 'No calendar tokens found',
					requiresReconnect: true
				};
			}

			// Check if refresh is needed
			if (!this.tokenNeedsRefresh(tokens.expiry_date)) {
				return { refreshed: false }; // No refresh needed
			}

			// Perform refresh
			const result = await this.refreshCalendarToken(userId, { autoRefresh: true });

			return {
				refreshed: result.success,
				error: result.error,
				requiresReconnect: result.requiresReconnect
			};
		} catch (error: any) {
			console.error('Auto-refresh check failed:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'user_calendar_tokens',
				userId,
				{
					operation: 'autoRefreshIfNeeded',
					errorType: 'auto_refresh_check_failure'
				}
			);
			return {
				refreshed: false,
				error: error.message || 'Auto-refresh check failed'
			};
		}
	}

	/**
	 * Simple connection check - used by UI
	 */
	async hasValidConnection(userId: string): Promise<boolean> {
		try {
			const tokens = await this.getTokens(userId);
			if (!tokens?.hasValidTokens) {
				return false;
			}

			// If tokens are very expired, try a quick verification
			if (tokens.needsRefresh) {
				try {
					const oauth2Client = new google.auth.OAuth2(
						PRIVATE_GOOGLE_CLIENT_ID,
						PRIVATE_GOOGLE_CLIENT_SECRET
					);

					oauth2Client.setCredentials({
						access_token: tokens.access_token,
						refresh_token: tokens.refresh_token,
						expiry_date: tokens.expiry_date
					});

					// Try to refresh
					await oauth2Client.refreshAccessToken();
					return true;
				} catch (error) {
					console.error('Quick token verification failed:', error);
					await this.errorLogger.logAPIError(
						error,
						'https://oauth2.googleapis.com/token',
						'POST',
						userId,
						{
							operation: 'hasValidConnection_quickVerification',
							errorType: 'token_verification_failure'
						}
					);
					// Tokens are invalid - connection is not valid
					return false;
				}
			}

			return true;
		} catch (error) {
			console.error('Error checking calendar connection:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'user_calendar_tokens',
				userId,
				{ operation: 'hasValidConnection' }
			);
			return false;
		}
	}

	/**
	 * Disconnect calendar and clear tokens
	 */
	async disconnectCalendar(userId: string): Promise<void> {
		try {
			await this.supabase.from('user_calendar_tokens').delete().eq('user_id', userId);
			this.clientCache.delete(userId);
		} catch (error) {
			console.error('Error disconnecting calendar:', error);
			await this.errorLogger.logDatabaseError(
				error,
				'DELETE',
				'user_calendar_tokens',
				userId,
				{
					operation: 'disconnectCalendar',
					errorType: 'token_deletion_failure'
				}
			);
			throw error;
		}
	}

	/**
	 * Exchange authorization code for tokens and save to database
	 */
	async exchangeCodeForTokens(
		code: string,
		redirectUri: string,
		userId: string,
		userEmail?: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Exchange code for tokens
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
				console.error('Token exchange failed:', {
					status: tokenResponse.status,
					statusText: tokenResponse.statusText,
					error: errorData
				});
				return { success: false, error: 'Token exchange failed' };
			}

			const tokens = await tokenResponse.json();

			if (!tokens.access_token) {
				return { success: false, error: 'No access token received' };
			}

			// Get user profile info
			const profile = await this.getUserProfile(
				tokens.access_token,
				tokens.id_token,
				userEmail
			);
			if (!profile) {
				return { success: false, error: 'Failed to get user profile' };
			}

			// Calculate expiry timestamp
			const expiryDate = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;

			// Save tokens to database
			const tokenData = {
				user_id: userId,
				access_token: tokens.access_token,
				refresh_token: tokens.refresh_token || null,
				expiry_date: expiryDate,
				google_user_id: profile.id,
				google_email: profile.email,
				scope: tokens.scope || 'https://www.googleapis.com/auth/calendar',
				token_type: tokens.token_type || 'Bearer',
				updated_at: new Date().toISOString()
			};

			// Check if record exists and update or insert
			const { data: existingToken } = await this.supabase
				.from('user_calendar_tokens')
				.select('id')
				.eq('user_id', userId)
				.single();

			if (existingToken) {
				const { error: dbError } = await this.supabase
					.from('user_calendar_tokens')
					.update(tokenData)
					.eq('user_id', userId);

				if (dbError) {
					console.error('Database update error:', dbError);
					return { success: false, error: 'Database error' };
				}
			} else {
				const { error: dbError } = await this.supabase
					.from('user_calendar_tokens')
					.insert(tokenData);

				if (dbError) {
					console.error('Database insert error:', dbError);
					return { success: false, error: 'Database error' };
				}
			}

			return { success: true };
		} catch (error: any) {
			console.error('Error exchanging code for tokens:', error);
			await this.errorLogger.logAPIError(
				error,
				'https://oauth2.googleapis.com/token',
				'POST',
				userId,
				{
					operation: 'exchangeCodeForTokens',
					errorType: 'oauth_code_exchange_failure',
					redirectUri,
					hasCode: !!code
				}
			);
			return { success: false, error: error.message || 'Unexpected error' };
		}
	}

	/**
	 * Get user profile from Google APIs with fallbacks
	 */
	private async getUserProfile(
		accessToken: string,
		idToken?: string,
		fallbackEmail?: string
	): Promise<{ id: string; email: string; name?: string } | null> {
		// Method 1: Try userinfo v1 endpoint
		try {
			const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: 'application/json'
				}
			});

			if (response.ok) {
				const profile = await response.json();
				if (profile.id && profile.email) {
					return {
						id: profile.id,
						email: profile.email,
						name: profile.name
					};
				}
			}
		} catch (error) {
			console.warn('userinfo v1 failed:', error);
		}

		// Method 2: Try userinfo v2 endpoint
		try {
			const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: 'application/json'
				}
			});

			if (response.ok) {
				const profile = await response.json();
				if (profile.id && profile.email) {
					return {
						id: profile.id,
						email: profile.email,
						name: profile.name
					};
				}
			}
		} catch (error) {
			console.warn('userinfo v2 failed:', error);
		}

		// Method 3: Try to decode ID token
		if (idToken) {
			try {
				const idTokenPayload = JSON.parse(atob(idToken.split('.')[1]));
				if (idTokenPayload.sub && idTokenPayload.email) {
					return {
						id: idTokenPayload.sub,
						email: idTokenPayload.email,
						name:
							idTokenPayload.name ||
							`${idTokenPayload.given_name || ''} ${idTokenPayload.family_name || ''}`.trim()
					};
				}
			} catch (error) {
				console.warn('ID token decode failed:', error);
			}
		}

		// Method 4: Calendar API fallback
		try {
			const response = await fetch(
				'https://www.googleapis.com/calendar/v3/calendars/primary',
				{
					headers: {
						Authorization: `Bearer ${accessToken}`,
						Accept: 'application/json'
					}
				}
			);

			if (response.ok) {
				const calendarInfo = await response.json();
				if (calendarInfo.id) {
					return {
						id: calendarInfo.id,
						email: calendarInfo.id,
						name: calendarInfo.summary || 'Google Calendar User'
					};
				}
			}
		} catch (error) {
			console.warn('Calendar fallback failed:', error);
		}

		// Last resort: Use fallback email
		if (fallbackEmail) {
			return {
				id: fallbackEmail,
				email: fallbackEmail,
				name: 'Google Calendar User'
			};
		}

		// All methods failed - log error
		await this.errorLogger.logAPIError(
			new Error('Failed to fetch user profile from all Google API methods'),
			'https://www.googleapis.com/oauth2/v1/userinfo',
			'GET',
			undefined,
			{
				operation: 'getUserProfile',
				errorType: 'profile_fetch_complete_failure',
				attemptedMethods: ['userinfo_v1', 'userinfo_v2', 'id_token_decode', 'calendar_api'],
				hasFallbackEmail: !!fallbackEmail,
				hasIdToken: !!idToken
			}
		);

		return null;
	}
}
