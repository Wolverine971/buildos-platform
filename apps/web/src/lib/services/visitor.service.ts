// apps/web/src/lib/services/visitor.service.ts
import { browser } from '$app/environment';

export class VisitorService {
	private static readonly VISITOR_ID_KEY = 'visitor_id';
	private static readonly LAST_TRACKED_KEY = 'last_tracked_date';
	private static instance: VisitorService | null = null;

	private constructor() {}

	public static getInstance(): VisitorService {
		if (!VisitorService.instance) {
			VisitorService.instance = new VisitorService();
		}
		return VisitorService.instance;
	}

	/**
	 * Generate or retrieve a visitor ID
	 */
	private getVisitorId(): string {
		if (!browser) return this.generateFallbackId();

		try {
			// Try to get existing visitor ID from localStorage
			let visitorId = localStorage.getItem(VisitorService.VISITOR_ID_KEY);

			if (!visitorId) {
				// Generate new visitor ID using crypto.randomUUID if available
				if (typeof crypto !== 'undefined' && crypto.randomUUID) {
					visitorId = crypto.randomUUID();
				} else {
					// Fallback to timestamp + random
					visitorId = `visitor_${Date.now()}_${Math.random().toString(36).substring(2)}`;
				}

				localStorage.setItem(VisitorService.VISITOR_ID_KEY, visitorId);
			}

			return visitorId;
		} catch (error) {
			// localStorage not available, use fallback
			return this.generateFallbackId();
		}
	}

	/**
	 * Generate fallback visitor ID based on User Agent + timestamp
	 */
	private generateFallbackId(): string {
		const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
		const timestamp = Date.now();

		// Simple hash function
		let hash = 0;
		const str = userAgent + timestamp.toString();
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}

		return `fallback_${Math.abs(hash)}_${timestamp}`;
	}

	/**
	 * Check if we've already tracked this visitor today
	 */
	private hasTrackedToday(): boolean {
		if (!browser) return false;

		try {
			const lastTracked = localStorage.getItem(VisitorService.LAST_TRACKED_KEY);
			if (!lastTracked) return false;

			const today = new Date().toDateString();
			return lastTracked === today;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Mark that we've tracked this visitor today
	 */
	private markTrackedToday(): void {
		if (!browser) return;

		try {
			const today = new Date().toDateString();
			localStorage.setItem(VisitorService.LAST_TRACKED_KEY, today);
		} catch (error) {
			// Silent failure - localStorage not available
		}
	}

	/**
	 * Track visitor visit - fire and forget
	 */
	public async trackVisit(): Promise<void> {
		if (!browser) return;

		// Check if we've already tracked today
		if (this.hasTrackedToday()) {
			return;
		}

		try {
			const visitorId = this.getVisitorId();

			// Fire and forget - don't await or handle errors
			fetch('/api/visitors', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					visitor_id: visitorId
				})
			})
				.then((response) => {
					// Only mark as tracked if request was successful
					if (response.ok) {
						this.markTrackedToday();
					}
				})
				.catch(() => {
					// Silent failure - completely ignore errors
				});
		} catch (error) {
			// Silent failure - completely ignore errors
		}
	}

	/**
	 * Initialize visitor tracking
	 */
	public async initialize(): Promise<void> {
		if (!browser) return;

		// Add a small delay to ensure page has loaded
		setTimeout(() => {
			this.trackVisit();
		}, 100);
	}
}

// Export singleton instance
export const visitorService = VisitorService.getInstance();
