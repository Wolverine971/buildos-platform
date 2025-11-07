// apps/web/src/lib/services/link-shortener.service.ts
/**
 * Link Shortener Service
 *
 * Creates shortened tracking links for SMS notifications.
 * Shortened links redirect through /l/[short_code] which tracks clicks.
 *
 * Example:
 *   Original: https://build-os.com/app/briefs/today
 *   Shortened: https://build-os.com/l/abc123
 */

import { createSupabaseBrowser } from '@buildos/supabase-client';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

// Base URL for shortened links (should match deployed domain)
const BASE_URL =
	typeof window !== 'undefined'
		? window.location.origin
		: process.env.PUBLIC_BASE_URL || 'https://build-os.com';

class LinkShortenerService {
	private supabase = createSupabaseBrowser(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

	/**
	 * Create a shortened tracking link
	 *
	 * @param deliveryId - Notification delivery ID to track
	 * @param destinationUrl - URL to redirect to after tracking
	 * @returns Shortened URL (e.g., https://build-os.com/l/abc123)
	 */
	async createTrackingLink(deliveryId: string, destinationUrl: string): Promise<string> {
		try {
			// Call database function to create link with unique short code
			const { data: shortCode, error } = await this.supabase.rpc('create_tracking_link', {
				p_delivery_id: deliveryId,
				p_destination_url: destinationUrl
			});

			if (error) {
				console.error('[LinkShortener] Failed to create tracking link:', error);
				throw new Error(`Failed to create tracking link: ${error.message}`);
			}

			if (!shortCode) {
				throw new Error('Failed to generate short code');
			}

			const shortUrl = `${BASE_URL}/l/${shortCode}`;
			console.log(`[LinkShortener] Created: ${shortUrl} → ${destinationUrl}`);

			return shortUrl;
		} catch (error) {
			console.error('[LinkShortener] Error creating tracking link:', error);
			throw error;
		}
	}

	/**
	 * Extract and shorten all URLs in text
	 *
	 * Finds all HTTP(S) URLs in the text and replaces them with shortened versions.
	 * Useful for SMS messages with multiple links.
	 *
	 * @param text - Text containing URLs to shorten
	 * @param deliveryId - Notification delivery ID for tracking
	 * @returns Text with shortened URLs
	 */
	async shortenUrlsInText(text: string, deliveryId: string): Promise<string> {
		try {
			// Regex to find URLs (supports http and https)
			const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
			const urls = text.match(urlRegex) || [];

			if (urls.length === 0) {
				// No URLs found, return original text
				return text;
			}

			let result = text;

			// Process each URL
			for (const url of urls) {
				try {
					const shortUrl = await this.createTrackingLink(deliveryId, url);
					result = result.replace(url, shortUrl);

					console.log(
						`[LinkShortener] Replaced in text: ${url.substring(0, 50)}... → ${shortUrl}`
					);
				} catch (error) {
					console.error(
						`[LinkShortener] Failed to shorten URL ${url}, keeping original:`,
						error
					);
					// Keep original URL if shortening fails
				}
			}

			return result;
		} catch (error) {
			console.error('[LinkShortener] Error shortening URLs in text:', error);
			// Return original text if something goes wrong
			return text;
		}
	}

	/**
	 * Get shortened URL from short code
	 *
	 * @param shortCode - The short code (e.g., "abc123")
	 * @returns Full shortened URL
	 */
	getShortUrl(shortCode: string): string {
		return `${BASE_URL}/l/${shortCode}`;
	}

	/**
	 * Get tracking link statistics
	 *
	 * @param deliveryId - Optional delivery ID to filter by
	 * @param daysBack - Number of days to look back (default 7)
	 * @returns Link click statistics
	 */
	async getLinkStats(
		deliveryId?: string,
		daysBack: number = 7
	): Promise<{
		totalLinks: number;
		totalClicks: number;
		uniqueClickedLinks: number;
		clickThroughRate: number;
	}> {
		try {
			const { data, error } = await this.supabase.rpc('get_link_click_stats', {
				p_delivery_id: deliveryId ?? undefined,
				p_days_back: daysBack
			});

			if (error) {
				console.error('[LinkShortener] Failed to get link stats:', error);
				throw error;
			}

			const stats = data?.[0];
			if (!stats) {
				return {
					totalLinks: 0,
					totalClicks: 0,
					uniqueClickedLinks: 0,
					clickThroughRate: 0
				};
			}

			return {
				totalLinks: Number(stats.total_links || 0),
				totalClicks: Number(stats.total_clicks || 0),
				uniqueClickedLinks: Number(stats.unique_clicked_links || 0),
				clickThroughRate: Number(stats.click_through_rate || 0)
			};
		} catch (error) {
			console.error('[LinkShortener] Error getting link stats:', error);
			throw error;
		}
	}
}

// Export singleton instance
export const linkShortenerService = new LinkShortenerService();
