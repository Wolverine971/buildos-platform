// apps/web/src/routes/ontology/+layout.server.ts
/**
 * Ontology Admin Layout Server
 * Ensures only admin users can access ontology routes
 */

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();

	// Check if user is authenticated
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// Check if user is admin
	if (!(user as any).is_admin) {
		throw redirect(303, '/');
	}

	return {
		user: {
			id: user.id,
			email: user.email,
			name: (user as any).name,
			is_admin: (user as any).is_admin
		}
	};
};
