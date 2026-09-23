// apps/web/src/lib/services/calendar-webhook-check.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { CalendarWebhookService } from './calendar-webhook-service';
import {
	buildEncryptedCalendarTokenPatch,
	decodeStoredCalendarTokens
} from '$lib/server/calendar-token-crypto';

// In-memory cache to prevent multiple checks for the same user within a session
const recentlyChecked = new Map<string, number>();
const CHECK_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown

/**
 * Check if a user has calendar tokens but no webhook, and register one if needed
 * This handles users who connected their calendar before webhooks were implemented
 *
 * Features:
 * - Prevents duplicate checks within a cooldown period
 * - Handles race conditions gracefully
 * - Returns early for non-calendar users
 * - Logs all operations for debugging
 */
export async function checkAndRegisterWebhookIfNeeded(
	supabase: SupabaseClient,
	userId: string,
	baseUrl: string
): Promise<{ checked: boolean; registered: boolean; error?: string }> {
	// Check cooldown to prevent repeated checks
	const lastChecked = recentlyChecked.get(userId);
	if (lastChecked && Date.now() - lastChecked < CHECK_COOLDOWN_MS) {
		// Already checked recently, skip
		return { checked: false, registered: false };
	}

	try {
		// Mark as checked to prevent concurrent checks
		recentlyChecked.set(userId, Date.now());

		// Clean up old entries to prevent memory leak
		if (recentlyChecked.size > 1000) {
			const cutoff = Date.now() - CHECK_COOLDOWN_MS;
			for (const [uid, time] of recentlyChecked.entries()) {
				if (time < cutoff) {
					recentlyChecked.delete(uid);
				}
			}
		}

		// Check if user has calendar tokens
		const { data: tokens, error: tokenError } = await supabase
			.from('user_calendar_tokens')
			.select('access_token, refresh_token, updated_at')
			.eq('user_id', userId)
			.single();

		if (tokenError || !tokens || !tokens.access_token || !tokens.refresh_token) {
			// User doesn't have calendar connected, nothing to do
			return { checked: true, registered: false };
		}

		const normalizedTokens = decodeStoredCalendarTokens(tokens);
		if (normalizedTokens.requiresEncryptionUpgrade) {
			void supabase
				.from('user_calendar_tokens')
				.update(
					buildEncryptedCalendarTokenPatch({
						access_token: normalizedTokens.access_token,
						refresh_token: normalizedTokens.refresh_token
					})
				)
				.eq('user_id', userId);
		}

		if (!normalizedTokens.access_token || !normalizedTokens.refresh_token) {
			return { checked: true, registered: false };
		}

		// Check if user already has a webhook channel
		const { data: existingChannel, error: channelError } = await supabase
			.from('calendar_webhook_channels')
			.select('id, expiration, sync_token, created_at')
			.eq('user_id', userId)
			.eq('calendar_id', 'primary')
			.single();

		if (!channelError && existingChannel) {
			// Check if webhook is still valid
			const expiration = parseInt(existingChannel.expiration);
			const now = Date.now();
			const daysUntilExpiry = (expiration - now) / (1000 * 60 * 60 * 24);

			// Check various health conditions
			const isExpired = expiration <= now;
			const isExpiringSoon = daysUntilExpiry < 1; // Less than 1 day
			const hasNoSyncToken = !existingChannel.sync_token;

			// Check if tokens were updated after webhook creation (possible re-auth)
			const tokenUpdateTime = normalizedTokens.updated_at
				? new Date(normalizedTokens.updated_at).getTime()
				: 0;
			const webhookCreateTime = existingChannel.created_at
				? new Date(existingChannel.created_at).getTime()
				: 0;
			const tokensUpdatedAfterWebhook = tokenUpdateTime > webhookCreateTime + 60 * 60 * 1000; // 1 hour buffer

			if (!isExpired && !isExpiringSoon && !hasNoSyncToken && !tokensUpdatedAfterWebhook) {
				// Webhook exists and is healthy
				return { checked: true, registered: false };
			}

			// Webhook needs attention
			const reason = isExpired
				? 'expired'
				: isExpiringSoon
					? 'expiring_soon'
					: hasNoSyncToken
						? 'no_sync_token'
						: tokensUpdatedAfterWebhook
							? 'tokens_updated'
							: 'unknown';

			console.log(`User ${userId} webhook needs renewal (${reason})`);

			// For expired or expiring webhooks, let the cron job handle it
			// unless it's been expired for more than a day (cron might have failed)
			if ((isExpired || isExpiringSoon) && !hasNoSyncToken && daysUntilExpiry > -1) {
				return { checked: true, registered: false };
			}
		}

		// User has calendar tokens but no valid webhook, register one
		console.log(`User ${userId} needs webhook registration`);

		// Use a lock mechanism to prevent concurrent registrations
		// Check one more time with a FOR UPDATE lock pattern (if supported)
		const { data: recheckChannel } = await supabase
			.from('calendar_webhook_channels')
			.select('id')
			.eq('user_id', userId)
			.eq('calendar_id', 'primary')
			.single();

		if (recheckChannel) {
			// Another process registered it while we were checking
			console.log(`Webhook was registered by another process for user ${userId}`);
			return { checked: true, registered: false };
		}

		const webhookService = new CalendarWebhookService(supabase);
		const webhookUrl = `${baseUrl}/webhooks/calendar-events`;

		const result = await webhookService.registerWebhook(userId, webhookUrl, 'primary');

		if (result.success) {
			console.log(`✅ Successfully registered webhook for user ${userId}`);
			return { checked: true, registered: true };
		} else {
			// Log the error but don't throw - this is a background operation
			console.error(`Failed to register webhook for user ${userId}:`, result.error);

			// Check if it's a transient error that might succeed later
			const isTransientError =
				result.error?.includes('rate') ||
				result.error?.includes('timeout') ||
				result.error?.includes('503');

			if (isTransientError) {
				// Clear the cooldown so we can retry sooner
				recentlyChecked.delete(userId);
			}

			return {
				checked: true,
				registered: false,
				error: result.error
			};
		}
	} catch (error) {
		// Log but don't throw - this is a background operation
		console.error('Error in webhook check for user', userId, ':', error);

		// Clear the cooldown on error so we can retry
		recentlyChecked.delete(userId);

		return {
			checked: false,
			registered: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Batch check multiple users for missing webhooks
 * Useful for periodic background checks
 */
export async function batchCheckAndRegisterWebhooks(
	supabase: SupabaseClient,
	baseUrl: string,
	limit = 10
): Promise<{ total: number; registered: number; failures: number }> {
	try {
		// Scan token holders in a stable order until we have `limit` users missing a
		// webhook. An unordered `.limit()` re-checked the same healthy first rows on
		// every run, so users further down were never repaired.
		const boundedLimit = Math.max(1, limit);
		const scanPageSize = 500;
		let offset = 0;
		let scanned = 0;
		const usersNeedingWebhooks: string[] = [];

		while (usersNeedingWebhooks.length < boundedLimit) {
			const { data: usersWithTokens, error: tokenError } = await supabase
				.from('user_calendar_tokens')
				.select('user_id')
				.not('access_token', 'is', null)
				.not('refresh_token', 'is', null)
				.order('user_id', { ascending: true })
				.range(offset, offset + scanPageSize - 1);
			if (tokenError) throw tokenError;

			const userIds = (usersWithTokens ?? []).map((u) => u.user_id as string);
			if (userIds.length === 0) break;

			const { data: existingWebhooks, error: channelError } = await supabase
				.from('calendar_webhook_channels')
				.select('user_id')
				.in('user_id', userIds);
			if (channelError) throw channelError;

			const usersWithWebhooks = new Set(existingWebhooks?.map((w) => w.user_id) || []);
			for (const id of userIds) {
				if (usersNeedingWebhooks.length >= boundedLimit) break;
				if (!usersWithWebhooks.has(id)) usersNeedingWebhooks.push(id);
			}

			scanned += userIds.length;
			offset += userIds.length;
			if (userIds.length < scanPageSize) break;
		}

		if (usersNeedingWebhooks.length === 0) {
			return { total: scanned, registered: 0, failures: 0 };
		}

		// Register webhooks for users who need them
		const webhookService = new CalendarWebhookService(supabase);
		const webhookUrl = `${baseUrl}/webhooks/calendar-events`;

		let registered = 0;
		let failures = 0;

		for (const userId of usersNeedingWebhooks) {
			try {
				const result = await webhookService.registerWebhook(userId, webhookUrl, 'primary');
				if (result.success) {
					registered++;
				} else {
					failures++;
				}
			} catch {
				failures++;
			}

			// Small delay to avoid rate limiting
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		return { total: scanned, registered, failures };
	} catch (error) {
		console.error('Batch webhook check failed:', error);
		// Report the failure so the cron summary is not logged as a clean success.
		return { total: 0, registered: 0, failures: 1 };
	}
}
