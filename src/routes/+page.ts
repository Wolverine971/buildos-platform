// src/routes/+page.ts
import type { PageLoad } from './$types';
import { browser } from '$app/environment';

export const load: PageLoad = async ({ data, url, fetch, depends }) => {
	// Add dependency for dashboard data
	depends('dashboard:data');

	// Initialize dashboard data
	let dashboardData = null;
	let dashboardError = null;
	let dashboardLoading = false;

	// Only fetch dashboard data if user is authenticated and in browser
	if (data.user && browser) {
		dashboardLoading = true;

		try {
			// Get the user's timezone
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

			// Fetch dashboard data with timezone
			const response = await fetch(`/api/dashboard?timezone=${encodeURIComponent(timezone)}`);

			if (response.ok) {
				const result = await response.json();
				if (result.success) {
					dashboardData = result.data;
				} else {
					dashboardError = result.error || 'Failed to load dashboard data';
				}
			} else {
				dashboardError = `Failed to load dashboard data: ${response.statusText}`;
			}
		} catch (error) {
			// Error loading dashboard data
			dashboardError =
				error instanceof Error ? error.message : 'Failed to load dashboard data';
		} finally {
			dashboardLoading = false;
		}
	}

	// Pass through the server data with dashboard data and client-side enhancements
	return {
		...data,
		dashboardData,
		dashboardError,
		dashboardLoading,
		// Add client-side timestamp for cache busting if needed
		clientLoadTime: new Date().toISOString(),
		// Add any URL parameters that might be useful for client-side routing
		searchParams: url.searchParams.toString()
	};
};
