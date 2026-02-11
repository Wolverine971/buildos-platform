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
			title: 'BuildOS Integrations - Connect Your Tools',
			description:
				'Integrate with BuildOS to access AI-powered project insights, automate workflows, and sync with your favorite tools.',
			keywords: [
				'BuildOS integrations',
				'API',
				'webhooks',
				'project management API',
				'AI agents',
				'productivity API',
				'real-time updates',
				'OAuth integration'
			]
		}
	};
};

// This page should be prerendered for better performance
export const prerender = true;
