// apps/web/src/routes/projects/templates/new/+page.server.ts
/**
 * New Template Page - Server Load
 * Loads necessary data for template creation form
 */

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

const TEMPLATE_SCOPES = [
	'project',
	'plan',
	'task',
	'output',
	'document',
	'goal',
	'requirement',
	'risk',
	'milestone',
	'metric'
] as const;

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	// Check authentication and admin status
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(302, '/auth/login');
	}

	// Only admins can access template creation
	if (!user.is_admin) {
		throw redirect(302, '/ontology/templates');
	}

	return {
		user,
		availableParents: [],
		builderScopes: TEMPLATE_SCOPES
	};
};
