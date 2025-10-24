// apps/web/src/lib/services/calendar-webhook-service.ts
import { google, calendar_v3 } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GoogleOAuthService } from './google-oauth-service';
import { ScheduledSmsUpdateService } from './scheduledSmsUpdate.service';
import { ErrorLoggerService } from './errorLogger.service';
import * as crypto from 'crypto';

export interface WebhookChannel {
	id: string;
	user_id: string;
	channel_id: string;
	resource_id: string;
	calendar_id: string;
	expiration: number;
	sync_token: string | null;
	webhook_token: string;
}

interface BatchUpdates {
	taskEventUpdates: any[];
	taskUpdates: any[];
	deletions: string[];
	timeBlockUpdates: any[];
	timeBlockDeletions: string[];
}

interface RetryConfig {
	maxRetries: number;
	initialDelay: number;
	maxDelay: number;
	factor: number;
}

export class CalendarWebhookService {
	private supabase: SupabaseClient;
	private errorLogger: ErrorLoggerService;
	private oAuthService: GoogleOAuthService;
	private smsUpdateService: ScheduledSmsUpdateService;
	private readonly retryConfig: RetryConfig = {
		maxRetries: 5,
		initialDelay: 1000, // 1 second
		maxDelay: 60000, // 60 seconds
		factor: 2 // exponential factor
	};

	constructor(supabase: SupabaseClient) {
		this.supabase = supabase;
		this.errorLogger = ErrorLoggerService.getInstance(supabase);
		this.oAuthService = new GoogleOAuthService(supabase);
		this.smsUpdateService = new ScheduledSmsUpdateService(supabase);
	}

	/**
	 * Execute with exponential backoff for rate limiting
	 */
	private async executeWithBackoff<T>(fn: () => Promise<T>, retryCount = 0): Promise<T> {
		try {
			return await fn();
		} catch (error: any) {
			// Check if it's a rate limit error (429) or quota exceeded (403)
			const isRateLimited =
				error.code === 429 ||
				(error.code === 403 && error.message?.toLowerCase().includes('quota'));

			if (!isRateLimited || retryCount >= this.retryConfig.maxRetries) {
				throw error;
			}

			// Calculate delay with exponential backoff and jitter
			const baseDelay = Math.min(
				this.retryConfig.initialDelay * Math.pow(this.retryConfig.factor, retryCount),
				this.retryConfig.maxDelay
			);
			// Add jitter (random 0-25% additional delay)
			const jitter = baseDelay * Math.random() * 0.25;
			const delay = Math.floor(baseDelay + jitter);

			console.log(
				`[BACKOFF] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`
			);

			await new Promise((resolve) => setTimeout(resolve, delay));
			return this.executeWithBackoff(fn, retryCount + 1);
		}
	}

	/**
	 * Register a webhook for a user's calendar
	 */
	async registerWebhook(
		userId: string,
		webhookUrl: string,
		calendarId: string = 'primary'
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Get authenticated client
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// Generate unique channel ID and security token
			const channelId = `channel-${userId}-${Date.now()}`;
			const webhookToken = crypto.randomBytes(32).toString('hex');

			// Set expiration to 7 days from now (max allowed is 30 days)
			const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

			// Register the webhook with Google
			const response = await calendar.events.watch({
				calendarId: calendarId,
				requestBody: {
					id: channelId,
					type: 'web_hook',
					address: webhookUrl,
					token: webhookToken,
					expiration: expiration,
					params: {
						ttl: '604800' // 7 days in seconds
					}
				}
			});

			if (!response.data.resourceId) {
				throw new Error('No resource ID returned from Google');
			}

			// Store webhook channel info in database
			const { error: dbError } = await this.supabase.from('calendar_webhook_channels').upsert(
				{
					user_id: userId,
					channel_id: channelId,
					resource_id: response.data.resourceId,
					calendar_id: calendarId,
					expiration: response.data.expiration
						? parseInt(response.data.expiration)
						: expiration,
					webhook_token: webhookToken,
					sync_token: null,
					updated_at: new Date().toISOString()
				},
				{
					onConflict: 'user_id,calendar_id'
				}
			);

			if (dbError) {
				console.error('Failed to store webhook channel:', dbError);
				throw new Error('Failed to store webhook registration');
			}

			// Perform initial sync to get sync token
			await this.performInitialSync(userId, calendarId);

			console.log(`Webhook registered for user ${userId}:`, {
				channelId,
				resourceId: response.data.resourceId,
				expiration: new Date(expiration).toISOString()
			});

			return { success: true };
		} catch (error: any) {
			console.error('Failed to register webhook:', error);
			await this.errorLogger.logAPIError(
				error,
				'https://www.googleapis.com/calendar/v3/events/watch',
				'POST',
				userId,
				{
					operation: 'registerWebhook',
					errorType: 'calendar_webhook_registration_failure',
					calendarId,
					webhookUrl,
					hasAuth: !!error.message?.includes('authentication')
				}
			);
			return {
				success: false,
				error: error.message || 'Failed to register webhook'
			};
		}
	}

	/**
	 * Perform initial sync to get sync token
	 */
	private async performInitialSync(userId: string, calendarId: string): Promise<void> {
		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// List events to get initial sync token (with rate limiting)
			const response = await this.executeWithBackoff(() =>
				calendar.events.list({
					calendarId: calendarId,
					maxResults: 1,
					showDeleted: true
				})
			);

			if (response.data.nextSyncToken) {
				await this.supabase
					.from('calendar_webhook_channels')
					.update({
						sync_token: response.data.nextSyncToken,
						updated_at: new Date().toISOString()
					})
					.eq('user_id', userId)
					.eq('calendar_id', calendarId);
			}
		} catch (error) {
			console.error('Initial sync failed:', error);
			await this.errorLogger.logAPIError(
				error,
				'https://www.googleapis.com/calendar/v3/calendars/events',
				'GET',
				userId,
				{
					operation: 'performInitialSync',
					errorType: 'calendar_initial_sync_failure',
					calendarId
				}
			);
		}
	}

	/**
	 * Perform full resync when sync token expires
	 * This fetches recent changes and processes them
	 */
	private async performFullResync(userId: string, calendarId: string): Promise<number> {
		console.log('[RESYNC] Starting full resync for user:', {
			userId,
			calendarId,
			timestamp: new Date().toISOString()
		});

		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// Get user creation date to determine the earliest relevant event
			const { data: userData } = await this.supabase
				.from('users')
				.select('created_at')
				.eq('id', userId)
				.single();

			const userCreatedAt = userData?.created_at ? new Date(userData.created_at) : null;

			const timeMin = userCreatedAt;

			console.log('[RESYNC] Fetching events:', {
				timeMin: timeMin?.toISOString(),
				userCreatedAt: userCreatedAt?.toISOString() || 'unknown',
				currentTime: new Date().toISOString()
			});

			let allEvents: calendar_v3.Schema$Event[] = [];
			let pageToken: string | undefined;
			let newSyncToken: string | undefined;
			let pageCount = 0;

			// Fetch all events from the last 7 days
			do {
				pageCount++;
				console.log(`[RESYNC] Fetching page ${pageCount} of events...`);

				// Execute with rate limiting protection
				const response = await this.executeWithBackoff(() =>
					calendar.events.list({
						calendarId: calendarId,
						timeMin: timeMin?.toISOString(),
						maxResults: 100,
						showDeleted: true,
						singleEvents: true,
						orderBy: 'updated',
						pageToken: pageToken
					})
				);

				console.log(`[RESYNC] Page ${pageCount} response:`, {
					itemsCount: response.data.items?.length || 0,
					hasNextPage: !!response.data.nextPageToken
				});

				if (response.data.items && Array.isArray(response.data.items)) {
					allEvents = allEvents.concat(response.data.items);
					console.log(`[RESYNC] Total events so far: ${allEvents.length}`);
				}

				pageToken = response.data.nextPageToken || undefined;
			} while (pageToken);

			console.log(
				`[RESYNC] Finished fetching events: ${allEvents.length} total events found`
			);

			// Now get a fresh sync token for future incremental syncs
			console.log('[RESYNC] Getting fresh sync token...');
			const syncTokenResponse = await this.executeWithBackoff(() =>
				calendar.events.list({
					calendarId: calendarId,
					maxResults: 1,
					showDeleted: true
				})
			);

			newSyncToken = syncTokenResponse.data.nextSyncToken;
			console.log(
				'[RESYNC] New sync token obtained:',
				newSyncToken
					? `${newSyncToken.substring(0, Math.min(20, newSyncToken.length))}...`
					: 'NONE'
			);

			// Process batch of events that might be linked to our tasks
			console.log('[RESYNC] Processing events to find task-related changes...');

			// Use batch processing for better performance
			const processedCount = await this.processBatchEventChanges(
				userId,
				allEvents,
				calendarId
			);
			const skippedCount = allEvents.length - processedCount;

			console.log('[RESYNC] Processing complete:', {
				totalEvents: allEvents.length,
				processedCount,
				skippedCount
			});

			// Update with the new sync token
			if (newSyncToken) {
				console.log('[RESYNC] Updating database with new sync token...');
				const { error: updateError } = await this.supabase
					.from('calendar_webhook_channels')
					.update({
						sync_token: newSyncToken,
						updated_at: new Date().toISOString()
					})
					.eq('user_id', userId)
					.eq('calendar_id', calendarId);

				if (updateError) {
					console.error('[RESYNC] Failed to update sync token in database:', updateError);
				} else {
					console.log(`[RESYNC] SUCCESS - Full resync completed for user ${userId}:`, {
						processedEvents: processedCount,
						newSyncToken: `${newSyncToken.substring(0, Math.min(20, newSyncToken.length))}...`,
						timestamp: new Date().toISOString()
					});
				}
			} else {
				console.error('[RESYNC] ERROR - Failed to get new sync token during full resync');
			}

			return processedCount;
		} catch (error: any) {
			console.error('[RESYNC] CRITICAL ERROR - Full resync failed:', {
				userId,
				calendarId,
				errorCode: error.code,
				errorMessage: error.message,
				errorDetails: error
			});

			// Clear the sync token to force a fresh start next time
			console.log('[RESYNC] Clearing sync token due to error...');

			// Log to error tracking
			await this.errorLogger.logCalendarError(error, 'sync', calendarId, userId, {
				calendarId,
				operation: 'performFullResync',
				errorType: 'calendar_full_resync_failure',
				errorCode: error.code,
				reason: error.message
			});

			await this.supabase
				.from('calendar_webhook_channels')
				.update({
					sync_token: null,
					updated_at: new Date().toISOString()
				})
				.eq('user_id', userId)
				.eq('calendar_id', calendarId);

			throw error;
		}
	}

	/**
	 * Handle incoming webhook notification
	 */
	async handleWebhookNotification(
		channelId: string,
		resourceId: string,
		token: string,
		headers: Record<string, string>
	): Promise<{ success: boolean; processed: number; error?: string }> {
		console.log('[WEBHOOK] Received notification:', {
			channelId,
			resourceId,
			token: token ? `${token.substring(0, 10)}...` : 'null',
			headers: {
				'x-goog-resource-state': headers['x-goog-resource-state'],
				'x-goog-message-number': headers['x-goog-message-number'],
				'x-goog-resource-id': headers['x-goog-resource-id'],
				'x-goog-channel-id': headers['x-goog-channel-id']
			}
		});

		try {
			// Verify webhook channel exists and token matches
			console.log('[WEBHOOK] Looking up channel in database...');
			const { data: channel, error } = await this.supabase
				.from('calendar_webhook_channels')
				.select('*')
				.eq('channel_id', channelId)
				.eq('resource_id', resourceId)
				.single();

			if (error || !channel) {
				console.error('[WEBHOOK] Channel lookup failed:', {
					error,
					channelId,
					resourceId,
					channelFound: !!channel
				});
				return { success: false, processed: 0, error: 'Channel not found' };
			}

			console.log('[WEBHOOK] Channel found:', {
				userId: channel.user_id,
				calendarId: channel.calendar_id,
				expiration: new Date(channel.expiration).toISOString(),
				hasToken: !!channel.webhook_token,
				hasSyncToken: !!channel.sync_token,
				syncTokenPreview: channel.sync_token
					? `${channel.sync_token.substring(0, 20)}...`
					: 'null'
			});

			// Verify security token
			if (channel.webhook_token !== token) {
				console.error('[WEBHOOK] Token mismatch:', {
					expected: channel.webhook_token
						? `${channel.webhook_token.substring(0, 10)}...`
						: 'null',
					received: token ? `${token.substring(0, 10)}...` : 'null'
				});
				return { success: false, processed: 0, error: 'Invalid token' };
			}

			// Check if this is just a sync notification (Google sends these periodically)
			const resourceState = headers['x-goog-resource-state'];
			if (resourceState === 'sync') {
				console.log('[WEBHOOK] Sync notification received (no changes), ignoring');
				return { success: true, processed: 0 };
			}

			console.log('[WEBHOOK] Processing changes notification:', {
				resourceState,
				messageNumber: headers['x-goog-message-number']
			});

			// Log the notification details for debugging
			console.log(
				`[WEBHOOK] Starting sync for user ${channel.user_id}, calendar ${channel.calendar_id}`
			);

			// Process the changes with better error handling
			let processed = 0;
			try {
				processed = await this.syncCalendarChanges(
					channel.user_id,
					channel.calendar_id,
					channel.sync_token
				);
			} catch (syncError: any) {
				console.error(`[WEBHOOK] Sync error for user ${channel.user_id}:`, {
					errorCode: syncError.code,
					errorMessage: syncError.message,
					errorDetails: syncError
				});

				// Log the sync error
				await this.errorLogger.logCalendarError(
					syncError,
					'sync',
					channel.calendar_id,
					channel.user_id,
					{
						operation: 'handleWebhookNotification_syncCalendarChanges',
						errorType: 'calendar_webhook_sync_failure',
						calendarId: channel.calendar_id,
						channelId: channel.channel_id,
						resourceState,
						syncToken: channel.sync_token ? 'present' : 'null',
						processedCount: processed,
						isAuthError:
							syncError.code === 401 || syncError.message?.includes('unauthorized')
					}
				);

				// If it's an auth error, we might need to refresh tokens
				if (syncError.code === 401 || syncError.message?.includes('unauthorized')) {
					console.error('[WEBHOOK] Authentication failure detected');
					return {
						success: false,
						processed: 0,
						error: 'Authentication failed - user may need to reauthorize'
					};
				}

				// For other errors, still return partial success if we processed some events
				if (processed > 0) {
					console.log(
						`[WEBHOOK] Partial success: processed ${processed} events before error`
					);
					return {
						success: true,
						processed,
						error: `Partial sync - processed ${processed} events before error`
					};
				}

				throw syncError;
			}

			console.log(
				`[WEBHOOK] Successfully completed: processed ${processed} calendar changes`
			);
			return { success: true, processed };
		} catch (error: any) {
			console.error('[WEBHOOK] Unhandled error:', {
				errorMessage: error.message,
				errorStack: error.stack,
				errorDetails: error
			});

			// Log unhandled webhook error
			await this.errorLogger.logAPIError(error, '/api/webhooks/calendar', 'POST', undefined, {
				operation: 'handleWebhookNotification',
				errorType: 'calendar_webhook_unhandled_error',
				channelId,
				resourceId
			});

			return {
				success: false,
				processed: 0,
				error: error.message || 'Unknown error'
			};
		}
	}

	/**
	 * Sync calendar changes using sync token
	 */
	private async syncCalendarChanges(
		userId: string,
		calendarId: string,
		syncToken: string | null,
		isRetry: boolean = false
	): Promise<number> {
		// Validate inputs
		if (!userId || typeof userId !== 'string') {
			console.error('[SYNC] Invalid userId provided:', userId);
			throw new Error('Invalid userId for sync operation');
		}

		if (!calendarId || typeof calendarId !== 'string') {
			console.error('[SYNC] Invalid calendarId provided:', calendarId);
			throw new Error('Invalid calendarId for sync operation');
		}

		console.log(`[SYNC] Starting syncCalendarChanges for user ${userId}`, {
			calendarId,
			syncToken: syncToken
				? `${syncToken.substring(0, Math.min(20, syncToken.length))}...`
				: 'null',
			syncTokenLength: syncToken?.length || 0,
			isRetry
		});

		try {
			const auth = await this.oAuthService.getAuthenticatedClient(userId);
			if (!auth) {
				throw new Error('Failed to get authenticated client');
			}
			const calendar = google.calendar({ version: 'v3', auth });

			// Get user creation date to filter out old events
			const { data: userData } = await this.supabase
				.from('users')
				.select('created_at')
				.eq('id', userId)
				.single();

			const userCreatedAt = userData?.created_at ? new Date(userData.created_at) : null;
			console.log(`[SYNC] User created at: ${userCreatedAt?.toISOString() || 'unknown'}`);

			let pageToken: string | null | undefined = syncToken;
			let allChanges: calendar_v3.Schema$Event[] = [];
			let newSyncToken: string | undefined;
			let requestCount = 0;
			const maxRequests = 50; // Prevent infinite loops

			// Fetch all changes since last sync
			do {
				requestCount++;
				if (requestCount > maxRequests) {
					console.error('[SYNC] Maximum request limit reached, aborting sync');
					throw new Error('Too many pages in sync response');
				}

				console.log(`[SYNC] Making calendar.events.list request #${requestCount}`, {
					calendarId,
					syncToken: pageToken
						? `${pageToken.substring(0, Math.min(20, pageToken.length))}...`
						: 'undefined',
					showDeleted: true,
					maxResults: 100,
					timeMin: userCreatedAt?.toISOString() || undefined
				});

				let response;
				try {
					// Use syncToken for first request if available, pageToken for pagination
					const listParams: any = {
						calendarId: calendarId,
						showDeleted: true,
						maxResults: 100
					};

					// Add timeMin to filter events before user creation
					// NOTE: When using syncToken, timeMin cannot be used on the first request
					// but can be used on subsequent pagination requests
					if (requestCount === 1 && syncToken) {
						listParams.syncToken = syncToken;
						// Cannot use timeMin with syncToken
					} else if (pageToken && requestCount > 1) {
						listParams.pageToken = pageToken;
						if (userCreatedAt) {
							listParams.timeMin = userCreatedAt.toISOString();
						}
					} else if (!syncToken && userCreatedAt) {
						// First request without syncToken, can use timeMin
						listParams.timeMin = userCreatedAt.toISOString();
					}

					// Execute with rate limiting protection
					response = await this.executeWithBackoff(() =>
						calendar.events.list(listParams)
					);
				} catch (listError: any) {
					console.error(`[SYNC] Error in request #${requestCount}:`, {
						code: listError.code,
						message: listError.message,
						errors: listError.errors
					});

					// Log calendar events list error
					await this.errorLogger.logAPIError(
						listError,
						'https://www.googleapis.com/calendar/v3/calendars/events/list',
						'GET',
						userId,
						{
							operation: 'syncCalendarChanges_eventsList',
							errorType: 'calendar_events_list_failure',
							calendarId,
							requestNumber: requestCount,
							syncToken: syncToken ? 'present' : 'null',
							pageToken: pageToken ? 'present' : 'null'
						}
					);

					throw listError;
				}

				if (!response || !response.data) {
					console.error('[SYNC] Invalid response from calendar API');
					throw new Error('Invalid response from Google Calendar API');
				}

				console.log(`[SYNC] Response from request #${requestCount}:`, {
					itemsCount: response.data.items?.length || 0,
					nextPageToken: response.data.nextPageToken ? 'present' : 'none',
					nextSyncToken: response.data.nextSyncToken ? 'present' : 'none',
					responseKind: response.data.kind
				});

				if (response.data.items && Array.isArray(response.data.items)) {
					allChanges = allChanges.concat(response.data.items);
					console.log(`[SYNC] Found ${response.data.items.length} events in this page`);
				}

				pageToken = response.data.nextPageToken || null;
				if (!pageToken && response.data.nextSyncToken) {
					newSyncToken = response.data.nextSyncToken;
					console.log(
						`[SYNC] No more pages, got new sync token: ${newSyncToken ? `${newSyncToken.substring(0, Math.min(20, newSyncToken.length))}...` : 'none'}`
					);
				}
			} while (pageToken);

			console.log(`[SYNC] Total changes found: ${allChanges.length}`);

			// Additional client-side filtering for events fetched with syncToken
			// (syncToken requests don't support timeMin, so we filter client-side)
			const relevantChanges =
				userCreatedAt && syncToken
					? allChanges.filter((event) => {
							const eventDate = event.updated ? new Date(event.updated) : null;
							return !eventDate || eventDate >= userCreatedAt;
						})
					: allChanges;

			if (relevantChanges.length !== allChanges.length) {
				console.log(
					`[SYNC] Filtered ${allChanges.length - relevantChanges.length} events that occurred before user creation`
				);
			}

			// Process batch of events
			const processedCount = await this.processBatchEventChanges(
				userId,
				relevantChanges,
				calendarId
			);

			// Update sync token
			if (newSyncToken && typeof newSyncToken === 'string') {
				console.log(
					`[SYNC] Updating sync token in database: ${newSyncToken.substring(0, Math.min(20, newSyncToken.length))}...`
				);
				const { error: updateError } = await this.supabase
					.from('calendar_webhook_channels')
					.update({
						sync_token: newSyncToken,
						updated_at: new Date().toISOString()
					})
					.eq('user_id', userId)
					.eq('calendar_id', calendarId);

				if (updateError) {
					console.error('[SYNC] Failed to update sync token:', updateError);
					// Don't throw here, we've already processed events
				} else {
					console.log('[SYNC] Sync token updated successfully');
				}
			} else if (!newSyncToken) {
				console.warn(
					'[SYNC] No new sync token received - this may cause issues with next sync'
				);
			}

			console.log(
				`[SYNC] Completed: Processed ${processedCount} out of ${allChanges.length} calendar changes for user ${userId}`,
				{
					successRate:
						allChanges.length > 0
							? `${Math.round((processedCount / allChanges.length) * 100)}%`
							: 'N/A'
				}
			);

			return processedCount;
		} catch (error: any) {
			console.error('[SYNC] Error details:', {
				code: error.code,
				message: error.message,
				errors: error.errors,
				statusText: error.statusText,
				response: error.response?.data
			});

			// Handle sync token expiration with multiple checks
			const isTokenExpired =
				error.code === 410 ||
				error.message?.toLowerCase().includes('sync token is no longer valid') ||
				error.message?.toLowerCase().includes('sync token expired') ||
				error.errors?.some((e: any) => e.reason === 'syncTokenExpired');

			if (isTokenExpired) {
				console.log('[SYNC] *** SYNC TOKEN EXPIRED ***', {
					userId,
					calendarId,
					oldSyncToken: syncToken
						? `${syncToken.substring(0, Math.min(20, syncToken.length))}...`
						: 'null',
					isRetry,
					errorCode: error.code,
					errorMessage: error.message,
					errorReason: error.errors?.[0]?.reason
				});

				// Don't retry if this is already a retry attempt
				if (isRetry) {
					console.error(
						'[SYNC] Failed to sync after token refresh - aborting to prevent loop'
					);
					throw new Error(
						'Sync token refresh failed - manual intervention may be required'
					);
				}

				console.log('[SYNC] Initiating full resync to recover from expired token');
				try {
					const resyncCount = await this.performFullResync(userId, calendarId);
					console.log(
						`[SYNC] Full resync completed successfully with ${resyncCount} events processed`
					);
					return resyncCount;
				} catch (resyncError) {
					console.error('[SYNC] Full resync also failed:', resyncError);

					// Log resync failure
					await this.errorLogger.logCalendarError(
						resyncError,
						'sync',
						calendarId,
						userId,
						{
							operation: 'syncCalendarChanges_resyncAfterTokenExpired',
							errorType: 'calendar_resync_after_token_expired_failure',
							calendarId,
							wasRetry: true,
							originalErrorCode: error.code
						}
					);

					throw resyncError;
				}
			}

			// Log general sync error
			await this.errorLogger.logCalendarError(error, 'sync', calendarId, userId, {
				operation: 'syncCalendarChanges',
				errorType: 'calendar_sync_changes_failure',
				calendarId,
				syncToken: syncToken ? 'present' : 'null',
				isRetry,
				errorCode: error.code
			});

			console.error('[SYNC] Unhandled error in syncCalendarChanges:', error);
			throw error;
		}
	}

	/**
	 * Process a batch of event changes with optimized database operations
	 */
	private async processBatchEventChanges(
		userId: string,
		events: calendar_v3.Schema$Event[],
		calendarId: string
	): Promise<number> {
		try {
			if (!events || events.length === 0) {
				console.log('[BATCH_PROCESS] No events to process');
				return 0;
			}

			// Extract all event IDs for batch query
			const eventIds = events.filter((e) => e && e.id).map((e) => e.id as string);

			if (eventIds.length === 0) {
				console.log('[BATCH_PROCESS] No valid event IDs found');
				return 0;
			}

			console.log(
				`[BATCH_PROCESS] Batch querying ${eventIds.length} events for task and timeblock links`
			);

			// Batch query all task events at once
			const { data: taskEvents, error } = await this.supabase
				.from('task_calendar_events')
				.select('*, tasks(*)')
				.in('calendar_event_id', eventIds)
				.eq('user_id', userId);

			if (error) {
				console.error('[BATCH_PROCESS] Error fetching task events:', error);
				return 0;
			}

			// Also batch query time blocks
			const { data: timeBlocks, error: timeBlockError } = await this.supabase
				.from('time_blocks')
				.select('*, project:projects(id, name, calendar_color_id)')
				.in('calendar_event_id', eventIds)
				.eq('user_id', userId);

			if (timeBlockError) {
				console.error('[BATCH_PROCESS] Error fetching time blocks:', timeBlockError);
				// Don't return - continue with task events if we have them
			}

			const taskEventsFound = (taskEvents || []).length;
			const timeBlocksFound = (timeBlocks || []).length;
			const totalFound = taskEventsFound + timeBlocksFound;

			if (totalFound === 0) {
				console.log(
					'[BATCH_PROCESS] No task-related events or timeblocks found in this batch'
				);
				return 0;
			}

			console.log(
				`[BATCH_PROCESS] Found ${taskEventsFound} task-related events and ${timeBlocksFound} timeblocks`
			);

			// Create maps for quick lookup
			const taskEventMap = new Map(
				(taskEvents || []).map((te) => [te.calendar_event_id, te])
			);
			const timeBlockMap = new Map(
				(timeBlocks || []).map((tb) => [tb.calendar_event_id, tb])
			);

			// Prepare batch updates
			const batchUpdates: BatchUpdates = {
				taskEventUpdates: [],
				taskUpdates: [],
				deletions: [],
				timeBlockUpdates: [],
				timeBlockDeletions: []
			};

			// Process each event and collect updates
			for (const event of events) {
				if (!event || !event.id) {
					continue;
				}

				const taskEvent = taskEventMap.get(event.id);
				const timeBlock = timeBlockMap.get(event.id);

				// Check if this is a new recurring event (has recurrence but no task)
				if (!taskEvent && !timeBlock && event.recurrence && event.recurrence.length > 0) {
					// This is a new recurring event created in Google Calendar
					// We might want to create a corresponding task
					console.log('[BATCH_PROCESS] New recurring event detected:', {
						id: event.id,
						summary: event.summary,
						recurrence: event.recurrence
					});
					// For now, we'll skip auto-creating tasks from calendar events
					// This could be a future feature if needed
					continue;
				}

				// Process timeblock changes (if this is a timeblock event)
				if (timeBlock && !taskEvent) {
					// Check sync loop prevention for timeblocks
					const SYNC_LOOP_PREVENTION_WINDOW = 5 * 60 * 1000; // 5 minutes
					if (
						timeBlock.sync_source === 'app' &&
						timeBlock.updated_at &&
						new Date(timeBlock.updated_at).getTime() >
							Date.now() - SYNC_LOOP_PREVENTION_WINDOW
					) {
						console.log('[BATCH_PROCESS] Skipping app-initiated timeblock change', {
							eventId: event.id,
							timeBlockId: timeBlock.id,
							sync_source: timeBlock.sync_source,
							updated_at: timeBlock.updated_at,
							timeSinceUpdate: Date.now() - new Date(timeBlock.updated_at).getTime()
						});
						continue;
					}

					// Handle timeblock deletion
					if (event.status === 'cancelled') {
						console.log(
							'[BATCH_PROCESS] Timeblock deleted from calendar:',
							timeBlock.id
						);
						batchUpdates.timeBlockDeletions.push(timeBlock.id);
						continue;
					}

					// Handle timeblock date/time changes
					if (event.start && event.end) {
						const newStart = event.start?.dateTime || event.start?.date;
						const newEnd = event.end?.dateTime || event.end?.date;

						if (newStart && newEnd) {
							const startDate = new Date(newStart);
							const endDate = new Date(newEnd);
							const durationMinutes = Math.round(
								(endDate.getTime() - startDate.getTime()) / 60000
							);

							console.log('[BATCH_PROCESS] Timeblock updated from calendar:', {
								timeBlockId: timeBlock.id,
								oldStart: timeBlock.start_time,
								newStart: startDate.toISOString(),
								oldEnd: timeBlock.end_time,
								newEnd: endDate.toISOString()
							});

							batchUpdates.timeBlockUpdates.push({
								id: timeBlock.id,
								start_time: startDate.toISOString(),
								end_time: endDate.toISOString(),
								duration_minutes: durationMinutes,
								sync_source: 'google',
								sync_status: 'synced',
								last_synced_at: new Date().toISOString(),
								updated_at: new Date().toISOString()
							});
						}
					}
					continue;
				}

				if (!taskEvent) {
					// Not a task-related event or timeblock, skip
					continue;
				}

				// Check if this was a change made by our app (prevent sync loops)
				// Use a 5-minute window to account for webhook delivery delays
				const SYNC_LOOP_PREVENTION_WINDOW = 5 * 60 * 1000; // 5 minutes
				if (
					taskEvent.sync_source === 'app' &&
					taskEvent.updated_at &&
					new Date(taskEvent.updated_at).getTime() >
						Date.now() - SYNC_LOOP_PREVENTION_WINDOW
				) {
					console.log('[BATCH_PROCESS] Skipping app-initiated change', {
						eventId: event.id,
						taskEventId: taskEvent.id,
						sync_source: taskEvent.sync_source,
						updated_at: taskEvent.updated_at,
						timeSinceUpdate: Date.now() - new Date(taskEvent.updated_at).getTime()
					});
					continue;
				}

				// Handle deletion
				if (event.status === 'cancelled') {
					// Check if this is a recurring event
					if (event.recurringEventId && !taskEvent.is_master_event) {
						// This is a cancelled instance of a recurring event
						// Create or update recurring_task_instances record
						const instanceDate =
							event.originalStartTime?.dateTime || event.originalStartTime?.date;
						if (instanceDate) {
							await this.supabase.from('recurring_task_instances').upsert({
								task_id: taskEvent.task_id,
								instance_date: new Date(instanceDate).toISOString().split('T')[0],
								status: 'cancelled',
								user_id: userId,
								calendar_event_id: event.id,
								updated_at: new Date().toISOString()
							});
							console.log(
								'[BATCH_PROCESS] Marked recurring instance as cancelled:',
								instanceDate
							);
						}
					} else if (taskEvent.is_master_event && event.status === 'cancelled') {
						// The entire recurring series was deleted
						console.log(
							'[BATCH_PROCESS] Entire recurring series deleted:',
							taskEvent.id
						);

						// Mark all future instances as cancelled
						if (taskEvent.task_id) {
							const today = new Date().toISOString().split('T')[0];
							await this.supabase
								.from('recurring_task_instances')
								.update({
									status: 'cancelled',
									updated_at: new Date().toISOString()
								})
								.eq('task_id', taskEvent.task_id)
								.gte('instance_date', today);

							// Update the task to mark it as cancelled/inactive
							batchUpdates.taskUpdates.push({
								id: taskEvent.task_id,
								status: 'cancelled',
								updated_at: new Date().toISOString()
							});
						}

						// Delete the master calendar event record
						batchUpdates.deletions.push(taskEvent.id);
					} else {
						// Regular deletion
						batchUpdates.deletions.push(taskEvent.id);
						if (taskEvent.task_id) {
							batchUpdates.taskUpdates.push({
								id: taskEvent.task_id,
								updated_at: new Date().toISOString()
							});
						}
					}
				}
				// Handle RRULE changes for master recurring events
				else if (event.recurrence && taskEvent.is_master_event) {
					// The recurrence rule has been updated
					console.log(
						'[BATCH_PROCESS] Recurrence rule updated for master event:',
						event.id
					);

					// Parse the new RRULE to determine the pattern and end date
					const rrule = event.recurrence[0] || '';
					const pattern = this.parseRecurrencePattern(rrule);
					const endDate = this.parseRecurrenceEndDate(rrule);

					// Update the task with new recurrence pattern and end date
					if (taskEvent.task_id && pattern) {
						const taskUpdate: any = {
							id: taskEvent.task_id,
							recurrence_pattern: pattern,
							updated_at: new Date().toISOString()
						};

						// Update end date if it changed
						if (endDate !== undefined) {
							taskUpdate.recurrence_ends = endDate;
						}

						batchUpdates.taskUpdates.push(taskUpdate);

						// Update the calendar event record
						batchUpdates.taskEventUpdates.push({
							id: taskEvent.id,
							recurrence_rule: rrule,
							last_synced_at: new Date().toISOString(),
							sync_status: 'synced',
							sync_source: 'google'
						});
					}
				}
				// Handle date/time changes
				else if (event.start && event.end) {
					const newStart = event.start?.dateTime || event.start?.date;
					const newEnd = event.end?.dateTime || event.end?.date;

					if (newStart && newEnd) {
						const startDate = new Date(newStart);
						const endDate = new Date(newEnd);
						const durationMinutes = Math.round(
							(endDate.getTime() - startDate.getTime()) / 60000
						);

						// Check if this is a recurring event instance that was modified
						if (event.recurringEventId && taskEvent.is_master_event) {
							// This is a modified instance of a recurring event
							const instanceDate =
								event.originalStartTime?.dateTime ||
								event.originalStartTime?.date ||
								newStart;

							// Check if the event was marked as completed (common pattern: title starts with ✓ or DONE)
							const isCompleted =
								event.summary?.startsWith('✓') ||
								event.summary?.toLowerCase().startsWith('done:') ||
								(event.status === 'confirmed' &&
									event.transparency === 'transparent');

							// Create or update recurring_task_instances record for the exception
							await this.supabase.from('recurring_task_instances').upsert({
								task_id: taskEvent.task_id,
								instance_date: new Date(instanceDate).toISOString().split('T')[0],
								status: isCompleted ? 'completed' : 'scheduled',
								completed_at: isCompleted ? new Date().toISOString() : null,
								user_id: userId,
								calendar_event_id: event.id,
								notes: JSON.stringify({
									modified: true,
									newStart: startDate.toISOString(),
									newEnd: endDate.toISOString(),
									title: event.summary,
									completed: isCompleted
								})
							});

							// Create an exception event record
							batchUpdates.taskEventUpdates.push({
								id: crypto.randomBytes(16).toString('hex'),
								task_id: taskEvent.task_id,
								user_id: userId,
								calendar_event_id: event.id,
								calendar_id: calendarId,
								event_start: startDate.toISOString(),
								event_end: endDate.toISOString(),
								event_title: event.summary || taskEvent.event_title,
								is_exception: true,
								exception_type: 'modified',
								recurrence_instance_date: new Date(instanceDate)
									.toISOString()
									.split('T')[0],
								recurrence_master_id: taskEvent.id,
								last_synced_at: new Date().toISOString(),
								sync_status: 'synced',
								sync_source: 'google'
							});

							console.log(
								'[BATCH_PROCESS] Created exception for recurring instance:',
								instanceDate
							);
						} else {
							// Regular event update
							// Add task_calendar_event update
							batchUpdates.taskEventUpdates.push({
								id: taskEvent.id,
								event_start: startDate.toISOString(),
								event_end: endDate.toISOString(),
								event_title: event.summary || taskEvent.event_title,
								last_synced_at: new Date().toISOString(),
								sync_status: 'synced',
								sync_source: 'google',
								sync_version: (taskEvent.sync_version || 0) + 1
							});

							// Add task update if linked
							if (taskEvent.task_id) {
								batchUpdates.taskUpdates.push({
									id: taskEvent.task_id,
									title: event.summary || taskEvent.event_title,
									start_date: startDate.toISOString(),
									duration_minutes: durationMinutes,
									updated_at: new Date().toISOString()
								});
							}
						}
					}
				}
			}

			// Execute batch updates
			let processedCount = 0;

			// Batch delete task_calendar_events
			if (batchUpdates.deletions.length > 0) {
				console.log(
					`[BATCH_PROCESS] Deleting ${batchUpdates.deletions.length} cancelled events`
				);
				const { error: deleteError } = await this.supabase
					.from('task_calendar_events')
					.delete()
					.in('id', batchUpdates.deletions);

				if (deleteError) {
					console.error('[BATCH_PROCESS] Error deleting events:', deleteError);
				} else {
					processedCount += batchUpdates.deletions.length;
				}
			}

			// Batch update task_calendar_events
			if (batchUpdates.taskEventUpdates.length > 0) {
				console.log(
					`[BATCH_PROCESS] Updating ${batchUpdates.taskEventUpdates.length} task events`
				);
				const { error: updateError } = await this.supabase
					.from('task_calendar_events')
					.upsert(batchUpdates.taskEventUpdates, {
						onConflict: 'id'
					});

				if (updateError) {
					console.error('[BATCH_PROCESS] Error updating task events:', updateError);
				} else {
					processedCount += batchUpdates.taskEventUpdates.length;
				}
			}

			// Batch update tasks (de-duplicate by ID)
			if (batchUpdates.taskUpdates.length > 0) {
				// De-duplicate task updates by ID (keep latest)
				const uniqueTaskUpdates = Array.from(
					new Map(batchUpdates.taskUpdates.map((update) => [update.id, update])).values()
				);

				console.log(`[BATCH_PROCESS] Updating ${uniqueTaskUpdates.length} tasks`);
				const { error: taskUpdateError } = await this.supabase
					.from('tasks')
					.upsert(uniqueTaskUpdates, {
						onConflict: 'id'
					});

				if (taskUpdateError) {
					console.error('[BATCH_PROCESS] Error updating tasks:', taskUpdateError);
				}
			}

			// Batch update timeblocks
			if (batchUpdates.timeBlockUpdates.length > 0) {
				console.log(
					`[BATCH_PROCESS] Updating ${batchUpdates.timeBlockUpdates.length} timeblocks`
				);
				const { error: timeBlockUpdateError } = await this.supabase
					.from('time_blocks')
					.upsert(batchUpdates.timeBlockUpdates, {
						onConflict: 'id'
					});

				if (timeBlockUpdateError) {
					console.error(
						'[BATCH_PROCESS] Error updating timeblocks:',
						timeBlockUpdateError
					);
				} else {
					processedCount += batchUpdates.timeBlockUpdates.length;
				}
			}

			// Batch delete timeblocks (soft delete)
			if (batchUpdates.timeBlockDeletions.length > 0) {
				console.log(
					`[BATCH_PROCESS] Soft-deleting ${batchUpdates.timeBlockDeletions.length} timeblocks`
				);
				const { error: timeBlockDeleteError } = await this.supabase
					.from('time_blocks')
					.update({
						sync_status: 'deleted',
						sync_source: 'google',
						updated_at: new Date().toISOString(),
						last_synced_at: new Date().toISOString()
					})
					.in('id', batchUpdates.timeBlockDeletions);

				if (timeBlockDeleteError) {
					console.error(
						'[BATCH_PROCESS] Error deleting timeblocks:',
						timeBlockDeleteError
					);
				} else {
					processedCount += batchUpdates.timeBlockDeletions.length;
				}
			}

			console.log(
				`[BATCH_PROCESS] Completed: processed ${processedCount} out of ${totalFound} events (${taskEventsFound} tasks, ${timeBlocksFound} timeblocks)`
			);

			// Phase 3: Update scheduled SMS messages for affected events
			try {
				console.log('[BATCH_PROCESS] Checking for scheduled SMS updates...');

				// Extract event changes for SMS processing
				const eventChanges = ScheduledSmsUpdateService.extractEventChangesFromBatch(
					batchUpdates.taskEventUpdates,
					batchUpdates.deletions,
					taskEventMap
				);

				if (eventChanges.length > 0) {
					const smsResult = await this.smsUpdateService.processCalendarEventChanges(
						userId,
						eventChanges
					);

					console.log('[BATCH_PROCESS] SMS update results:', {
						cancelled: smsResult.cancelled,
						rescheduled: smsResult.updated,
						regenerated: smsResult.regenerated,
						errors: smsResult.errors
					});
				} else {
					console.log('[BATCH_PROCESS] No SMS updates needed');
				}
			} catch (smsError) {
				// Don't fail the entire batch if SMS updates fail
				console.error('[BATCH_PROCESS] Error updating scheduled SMS:', smsError);

				// Log SMS update error
				await this.errorLogger.logAPIError(
					smsError,
					'/api/sms/update-scheduled',
					'POST',
					userId,
					{
						operation: 'processBatchEventChanges_smsUpdate',
						errorType: 'sms_scheduled_update_failure',
						eventChangesCount:
							batchUpdates.taskEventUpdates.length + batchUpdates.deletions.length
					}
				);
			}

			return processedCount;
		} catch (error) {
			console.error('[BATCH_PROCESS] Error in batch processing:', error);

			// Log batch processing error
			await this.errorLogger.logDatabaseError(
				error,
				'UPSERT',
				'task_calendar_events',
				userId,
				{
					operation: 'processBatchEventChanges',
					errorType: 'calendar_batch_processing_failure',
					calendarId,
					eventsCount: events.length
				}
			);

			return 0;
		}
	}

	/**
	 * Process a single event change (kept for backward compatibility)
	 */
	private async processEventChange(
		userId: string,
		event: calendar_v3.Schema$Event,
		calendarId: string
	): Promise<boolean> {
		try {
			if (!event || !event.id) {
				console.log('[PROCESS] Invalid event or missing event ID');
				return false;
			}

			// Check if this event is linked to a task
			const { data: taskEvent, error } = await this.supabase
				.from('task_calendar_events')
				.select('*, tasks(*)')
				.eq('calendar_event_id', event.id)
				.eq('user_id', userId)
				.single();

			if (error || !taskEvent) {
				// Not a task-related event, ignore
				return false;
			}

			// Check if this was a change made by our app (prevent sync loops)
			// Use same window as batch processing for consistency
			const SYNC_LOOP_PREVENTION_WINDOW = 5 * 60 * 1000; // 5 minutes
			if (
				taskEvent.sync_source === 'app' &&
				taskEvent.updated_at &&
				new Date(taskEvent.updated_at).getTime() > Date.now() - SYNC_LOOP_PREVENTION_WINDOW
			) {
				console.log('[PROCESS] Skipping app-initiated change', {
					eventId: event.id,
					sync_source: taskEvent.sync_source,
					timeSinceUpdate: Date.now() - new Date(taskEvent.updated_at).getTime()
				});
				return false;
			}

			// Handle deletion
			if (event.status === 'cancelled') {
				return await this.handleEventDeletion(userId, taskEvent);
			}

			// Handle date/time changes
			if (event.start && event.end) {
				return await this.handleEventUpdate(userId, taskEvent, event);
			}

			return false;
		} catch (error) {
			console.error('Error processing event change:', error);

			// Log event processing error
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'task_calendar_events',
				userId,
				{
					operation: 'processEventChange',
					errorType: 'calendar_event_processing_failure',
					calendarId,
					eventId: event.id
				}
			);

			return false;
		}
	}

	/**
	 * Parse RRULE to extract recurrence pattern
	 */
	private parseRecurrencePattern(rrule: string): string | null {
		if (!rrule) return null;

		// Remove RRULE: prefix if present
		const rule = rrule.replace('RRULE:', '');

		// Parse frequency
		if (rule.includes('FREQ=DAILY')) {
			if (rule.includes('BYDAY=MO,TU,WE,TH,FR')) {
				return 'weekdays';
			}
			return 'daily';
		}

		if (rule.includes('FREQ=WEEKLY')) {
			if (rule.includes('INTERVAL=2')) {
				return 'biweekly';
			}
			if (rule.includes('BYDAY=MO,TU,WE,TH,FR')) {
				return 'weekdays';
			}
			return 'weekly';
		}

		if (rule.includes('FREQ=MONTHLY')) {
			if (rule.includes('INTERVAL=3')) {
				return 'quarterly';
			}
			return 'monthly';
		}

		if (rule.includes('FREQ=YEARLY')) {
			return 'yearly';
		}

		// Default to weekly if we can't determine
		return 'weekly';
	}

	/**
	 * Parse RRULE to extract end date
	 */
	private parseRecurrenceEndDate(rrule: string): string | null | undefined {
		if (!rrule) return undefined;

		// Remove RRULE: prefix if present
		const rule = rrule.replace('RRULE:', '');

		// Check for UNTIL parameter
		const untilMatch = rule.match(/UNTIL=(\d{8}T?\d{6}?Z?)/);
		if (untilMatch && untilMatch[1]) {
			const untilStr = untilMatch[1];
			// Parse YYYYMMDD or YYYYMMDDTHHMMSSZ format
			const year = untilStr.substring(0, 4);
			const month = untilStr.substring(4, 6);
			const day = untilStr.substring(6, 8);

			const date = new Date(`${year}-${month}-${day}`);
			if (!isNaN(date.getTime())) {
				return date.toISOString();
			}
		}

		// Check for COUNT parameter (we can't determine exact end date without calculating)
		if (rule.includes('COUNT=')) {
			// Return undefined to indicate we can't determine the end date
			return undefined;
		}

		// No end date specified (infinite recurrence)
		return null;
	}

	/**
	 * Handle event deletion
	 */
	private async handleEventDeletion(userId: string, taskEvent: any): Promise<boolean> {
		try {
			// Delete the task_calendar_event record
			await this.supabase.from('task_calendar_events').delete().eq('id', taskEvent.id);

			// Optionally update task status or add a note
			if (taskEvent.task_id) {
				await this.supabase
					.from('tasks')
					.update({
						updated_at: new Date().toISOString()
						// You might want to add a note or change status
					})
					.eq('id', taskEvent.task_id)
					.eq('user_id', userId);
			}

			console.log(`Deleted task_calendar_event ${taskEvent.id} due to calendar deletion`);
			return true;
		} catch (error) {
			console.error('Error handling event deletion:', error);

			// Log event deletion error
			await this.errorLogger.logCalendarError(
				error,
				'delete',
				taskEvent.calendar_id,
				userId,
				{
					operation: 'handleEventDeletion',
					errorType: 'calendar_event_deletion_failure',
					taskEventId: taskEvent.id,
					taskId: taskEvent.task_id
				}
			);

			return false;
		}
	}

	/**
	 * Handle event update (date/time changes)
	 */
	private async handleEventUpdate(
		userId: string,
		taskEvent: any,
		googleEvent: calendar_v3.Schema$Event
	): Promise<boolean> {
		try {
			// Parse the new start and end times
			const newStart = googleEvent.start?.dateTime || googleEvent.start?.date;
			const newEnd = googleEvent.end?.dateTime || googleEvent.end?.date;

			if (!newStart || !newEnd) return false;

			const startDate = new Date(newStart);
			const endDate = new Date(newEnd);

			// Calculate new duration in minutes
			const durationMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

			// Update task_calendar_event
			await this.supabase
				.from('task_calendar_events')
				.update({
					event_start: startDate.toISOString(),
					event_end: endDate.toISOString(),
					event_title: googleEvent.summary || taskEvent.event_title,
					last_synced_at: new Date().toISOString(),
					sync_status: 'synced',
					sync_source: 'google',
					sync_version: (taskEvent.sync_version || 0) + 1
				})
				.eq('id', taskEvent.id);

			// Update the task's start_date and duration
			if (taskEvent.task_id) {
				await this.supabase
					.from('tasks')
					.update({
						start_date: startDate.toISOString(),
						duration_minutes: durationMinutes,
						updated_at: new Date().toISOString()
					})
					.eq('id', taskEvent.task_id)
					.eq('user_id', userId);
			}

			console.log(`Updated task ${taskEvent.task_id} from Google Calendar change`);
			return true;
		} catch (error) {
			console.error('Error handling event update:', error);

			// Log event update error
			await this.errorLogger.logCalendarError(
				error,
				'update',
				taskEvent.calendar_id,
				userId,
				{
					operation: 'handleEventUpdate',
					errorType: 'calendar_event_update_failure',
					taskEventId: taskEvent.id,
					taskId: taskEvent.task_id,
					googleEventId: googleEvent.id
				}
			);

			return false;
		}
	}

	/**
	 * Unregister webhook
	 */
	async unregisterWebhook(userId: string, calendarId: string = 'primary'): Promise<void> {
		try {
			// Get channel info
			const { data: channel } = await this.supabase
				.from('calendar_webhook_channels')
				.select('*')
				.eq('user_id', userId)
				.eq('calendar_id', calendarId)
				.single();

			if (channel) {
				// Stop the channel with Google
				const auth = await this.oAuthService.getAuthenticatedClient(userId);
				const calendar = google.calendar({ version: 'v3', auth });

				try {
					await calendar.channels.stop({
						requestBody: {
							id: channel.channel_id,
							resourceId: channel.resource_id
						}
					});
				} catch (error) {
					console.error('Error stopping Google channel:', error);

					// Log channel stop error
					await this.errorLogger.logAPIError(
						error,
						'https://www.googleapis.com/calendar/v3/channels/stop',
						'POST',
						userId,
						{
							operation: 'unregisterWebhook_stopChannel',
							errorType: 'calendar_channel_stop_failure',
							channelId: channel.channel_id,
							calendarId
						}
					);
				}

				// Delete from database
				await this.supabase.from('calendar_webhook_channels').delete().eq('id', channel.id);
			}
		} catch (error) {
			console.error('Error unregistering webhook:', error);

			// Log webhook unregister error
			await this.errorLogger.logDatabaseError(
				error,
				'DELETE',
				'calendar_webhook_channels',
				userId,
				{
					operation: 'unregisterWebhook',
					errorType: 'calendar_webhook_unregister_failure',
					calendarId
				}
			);
		}
	}

	/**
	 * Renew expiring webhooks
	 */
	async renewExpiringWebhooks(webhookUrl: string): Promise<void> {
		try {
			// Find webhooks expiring in next 24 hours
			const expirationThreshold = Date.now() + 24 * 60 * 60 * 1000;

			const { data: expiringChannels } = await this.supabase
				.from('calendar_webhook_channels')
				.select('*')
				.lt('expiration', expirationThreshold);

			if (expiringChannels && expiringChannels.length > 0) {
				for (const channel of expiringChannels) {
					console.log(`Renewing webhook for user ${channel.user_id}`);

					try {
						// Perform a final sync before renewal to catch any pending changes
						await this.syncCalendarChanges(
							channel.user_id,
							channel.calendar_id,
							channel.sync_token
						);
					} catch (syncError) {
						console.error(
							`Failed to sync before renewal for user ${channel.user_id}:`,
							syncError
						);

						// Log sync error before renewal
						await this.errorLogger.logCalendarError(
							syncError,
							'sync',
							channel.calendar_id,
							channel.user_id,
							{
								operation: 'renewExpiringWebhooks_preRenewalSync',
								errorType: 'calendar_pre_renewal_sync_failure',
								calendarId: channel.calendar_id,
								channelId: channel.channel_id
							}
						);
					}

					// Unregister old webhook
					await this.unregisterWebhook(channel.user_id, channel.calendar_id);

					// Register new webhook
					await this.registerWebhook(channel.user_id, webhookUrl, channel.calendar_id);
				}
			}
		} catch (error) {
			console.error('Error renewing webhooks:', error);

			// Log webhook renewal error
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'calendar_webhook_channels',
				undefined,
				{
					operation: 'renewExpiringWebhooks',
					errorType: 'calendar_webhook_renewal_failure',
					webhookUrl
				}
			);
		}
	}

	/**
	 * Manually trigger a full resync for a user's calendar
	 * Useful for recovery or debugging
	 */
	async manualResync(
		userId: string,
		calendarId: string = 'primary'
	): Promise<{ success: boolean; processed: number; error?: string }> {
		try {
			console.log(`Manual resync triggered for user ${userId}, calendar ${calendarId}`);

			// Check if webhook channel exists
			const { data: channel } = await this.supabase
				.from('calendar_webhook_channels')
				.select('*')
				.eq('user_id', userId)
				.eq('calendar_id', calendarId)
				.single();

			if (!channel) {
				return {
					success: false,
					processed: 0,
					error: 'No webhook channel found for this user/calendar'
				};
			}

			// Perform full resync
			const processedCount = await this.performFullResync(userId, calendarId);

			return {
				success: true,
				processed: processedCount
			};
		} catch (error: any) {
			console.error('Manual resync failed:', error);

			// Log manual resync error
			await this.errorLogger.logCalendarError(error, 'sync', calendarId, userId, {
				operation: 'manualResync',
				errorType: 'calendar_manual_resync_failure',
				calendarId
			});

			return {
				success: false,
				processed: 0,
				error: error.message || 'Manual resync failed'
			};
		}
	}

	/**
	 * Check webhook health and attempt to repair if needed
	 */
	async checkAndRepairWebhook(
		userId: string,
		calendarId: string = 'primary',
		webhookUrl?: string
	): Promise<{ healthy: boolean; repaired: boolean; error?: string }> {
		try {
			const { data: channel } = await this.supabase
				.from('calendar_webhook_channels')
				.select('*')
				.eq('user_id', userId)
				.eq('calendar_id', calendarId)
				.single();

			if (!channel) {
				return { healthy: false, repaired: false, error: 'No webhook channel found' };
			}

			// Check if expired
			if (channel.expiration < Date.now()) {
				if (!webhookUrl) {
					return {
						healthy: false,
						repaired: false,
						error: 'Webhook expired and no URL provided for renewal'
					};
				}

				// Attempt to renew
				await this.unregisterWebhook(userId, calendarId);
				const result = await this.registerWebhook(userId, webhookUrl, calendarId);

				return {
					healthy: result.success,
					repaired: result.success,
					error: result.error
				};
			}

			// Check if sync token is valid by attempting a small sync
			try {
				const auth = await this.oAuthService.getAuthenticatedClient(userId);
				const calendar = google.calendar({ version: 'v3', auth });

				// Check with rate limiting protection
				await this.executeWithBackoff(() =>
					calendar.events.list({
						calendarId: calendarId,
						syncToken: channel.sync_token || undefined,
						maxResults: 1
					})
				);

				return { healthy: true, repaired: false };
			} catch (error: any) {
				if (error.code === 410) {
					// Sync token expired, perform full resync
					await this.performFullResync(userId, calendarId);
					return {
						healthy: true,
						repaired: true,
						error: 'Sync token was expired, performed full resync'
					};
				}

				// Log webhook health check sync error
				await this.errorLogger.logCalendarError(error, 'sync', calendarId, userId, {
					operation: 'checkAndRepairWebhook_syncTokenCheck',
					errorType: 'calendar_webhook_health_check_failure',
					calendarId,
					errorCode: error.code
				});

				throw error;
			}
		} catch (error: any) {
			console.error('Webhook health check failed:', error);

			// Log webhook health check error
			await this.errorLogger.logDatabaseError(
				error,
				'SELECT',
				'calendar_webhook_channels',
				userId,
				{
					operation: 'checkAndRepairWebhook',
					errorType: 'calendar_webhook_health_check_outer_failure',
					calendarId
				}
			);

			return {
				healthy: false,
				repaired: false,
				error: error.message || 'Health check failed'
			};
		}
	}
}
