// apps/web/scripts/lib/calendar-webhook-migration-service.ts
// Standalone version of CalendarWebhookService for migration scripts
// This avoids SvelteKit-specific imports like $env

import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

export class CalendarWebhookMigrationService {
	private supabase: SupabaseClient;
	private googleClientId: string;
	private googleClientSecret: string;

	constructor(supabase: SupabaseClient, googleClientId: string, googleClientSecret: string) {
		this.supabase = supabase;
		this.googleClientId = googleClientId;
		this.googleClientSecret = googleClientSecret;
	}

	/**
	 * Get authenticated OAuth2 client for a user
	 */
	private async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
		// Get user's tokens from database
		const { data: tokens, error } = await this.supabase
			.from('user_calendar_tokens')
			.select('access_token, refresh_token, expiry_date')
			.eq('user_id', userId)
			.single();

		if (error || !tokens) {
			throw new Error(`No calendar tokens found for user ${userId}`);
		}

		// Create OAuth2 client
		const oauth2Client = new OAuth2Client(
			this.googleClientId,
			this.googleClientSecret,
			'postmessage' // Redirect URI not needed for existing tokens
		);

		// Set credentials
		oauth2Client.setCredentials({
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token,
			expiry_date: tokens.expiry_date
		});

		// Handle token refresh if needed
		oauth2Client.on('tokens', async (newTokens) => {
			console.log(`Refreshing tokens for user ${userId}`);

			const updates: any = {
				access_token: newTokens.access_token,
				updated_at: new Date().toISOString()
			};

			if (newTokens.refresh_token) {
				updates.refresh_token = newTokens.refresh_token;
			}

			if (newTokens.expiry_date) {
				updates.expiry_date = newTokens.expiry_date;
			}

			await this.supabase.from('user_calendar_tokens').update(updates).eq('user_id', userId);
		});

		return oauth2Client;
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
			const auth = await this.getAuthenticatedClient(userId);
			const calendar = google.calendar({ version: 'v3', auth });

			// Generate unique channel ID and security token
			const channelId = `channel-${userId}-${Date.now()}`;
			const webhookToken = crypto.randomBytes(32).toString('hex');

			// Set expiration to 7 days from now (max allowed is 30 days)
			const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

			console.log(`  Registering webhook for calendar: ${calendarId}`);

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

			console.log(`  Google webhook registered, storing in database...`);

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
			await this.performInitialSync(userId, calendarId, auth);

			console.log(`  Webhook registered successfully:`, {
				channelId,
				resourceId: response.data.resourceId,
				expiration: new Date(expiration).toISOString()
			});

			return { success: true };
		} catch (error: any) {
			console.error('  Failed to register webhook:', error.message || error);

			// Check for specific error types
			if (error.code === 401 || error.message?.includes('unauthorized')) {
				return {
					success: false,
					error: 'Authentication failed - user may need to reconnect calendar'
				};
			}

			if (error.code === 403) {
				return {
					success: false,
					error: 'Permission denied - check Google Calendar API permissions'
				};
			}

			if (error.code === 429 || error.message?.includes('quota')) {
				return {
					success: false,
					error: 'Rate limited - too many requests'
				};
			}

			return {
				success: false,
				error: error.message || 'Failed to register webhook'
			};
		}
	}

	/**
	 * Perform initial sync to get sync token
	 */
	private async performInitialSync(
		userId: string,
		calendarId: string,
		auth: OAuth2Client
	): Promise<void> {
		try {
			const calendar = google.calendar({ version: 'v3', auth });

			// List events to get initial sync token
			const response = await calendar.events.list({
				calendarId: calendarId,
				maxResults: 1,
				showDeleted: true
			});

			if (response.data.nextSyncToken) {
				await this.supabase
					.from('calendar_webhook_channels')
					.update({
						sync_token: response.data.nextSyncToken,
						updated_at: new Date().toISOString()
					})
					.eq('user_id', userId)
					.eq('calendar_id', calendarId);

				console.log(`  Initial sync completed, sync token stored`);
			}
		} catch (error) {
			console.error('  Initial sync failed (non-critical):', error);
			// Don't throw - this is not critical for webhook registration
		}
	}

	/**
	 * Unregister webhook (cleanup if needed)
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
				const auth = await this.getAuthenticatedClient(userId);
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
				}

				// Delete from database
				await this.supabase.from('calendar_webhook_channels').delete().eq('id', channel.id);
			}
		} catch (error) {
			console.error('Error unregistering webhook:', error);
		}
	}
}
