// apps/web/src/routes/(public)/integrations/+page.ts

export const load = async () => {
	// This is a public page - no authentication required
	// In the future, you could load dynamic content here like:
	// - Featured integrations
	// - Success stories
	// - Latest API updates
	// - Partner showcases

	return {
		// Static page data - can be enhanced with dynamic content later
		meta: {
			title: 'BuildOS Integrations - OpenClaw Agent Bridge',
			description:
				'Connect OpenClaw to BuildOS with user-scoped agent keys, accepted call sessions, and scoped direct tools.',
			keywords: [
				'BuildOS integrations',
				'OpenClaw',
				'agent key',
				'AI agents',
				'BuildOS API',
				'external agent auth',
				'agent call gateway',
				'project management API',
				'scoped agent tools'
			]
		}
	};
};

// This page should be prerendered for better performance
export const prerender = true;
