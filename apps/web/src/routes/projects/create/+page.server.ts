// apps/web/src/routes/projects/create/+page.server.ts
/**
 * Create Project - Server Load
 *
 * This page uses the AgentChatModal for project creation.
 * No server-side data loading is required as the chat handles
 * all project setup through conversation.
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Authentication required');
	}

	// No data needed - AgentChatModal handles project creation
	return {};
};
