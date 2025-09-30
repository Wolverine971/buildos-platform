// apps/web/src/lib/config/features.ts
/**
 * Feature flags for progressive feature rollout
 */

export interface FeatureFlags {
	projectCalendars: boolean;
	// Add more feature flags here as needed
}

/**
 * Check if a feature is enabled for a user
 * This can be extended to check user segments, A/B tests, etc.
 */
export function isFeatureEnabled(feature: keyof FeatureFlags, userId?: string): boolean {
	// For now, we'll use environment variables and user ID checks
	// You can extend this to check user segments, subscription tiers, etc.

	switch (feature) {
		case 'projectCalendars':
			// Option 1: Enable for all users (uncomment to enable globally)
			return true;

		// Option 2: Enable via environment variable

		// Option 3: Enable for specific users (add your user IDs here)
		// const enabledUsers = [
		// 	// 'user-id-1',
		// 	// 'user-id-2',
		// ];
		// if (userId && enabledUsers.includes(userId)) {
		// 	return true;
		// }

		// Option 4: Enable for users with email domain (example)
		// This would need the user's email, not just ID
		// if (userEmail?.endsWith('@company.com')) {
		//   return true;
		// }

		// return false;

		default:
			return false;
	}
}

/**
 * Get all feature flags for a user
 */
export function getFeatureFlags(userId?: string): FeatureFlags {
	return {
		projectCalendars: isFeatureEnabled('projectCalendars', userId)
	};
}
