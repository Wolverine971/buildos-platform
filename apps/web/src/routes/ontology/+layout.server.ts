// apps/web/src/routes/ontology/+layout.server.ts
/**
 * Ontology Admin Layout Server
 * Ensures only admin users can access ontology routes
 */

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

interface AdminUser {
	id: string;
	email?: string;
	name?: string;
	is_admin: boolean;
}

export const load: LayoutServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();

	// Check if user is authenticated
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// Type-safe admin check
	const adminUser = user as AdminUser;

	// Check if user is admin
	if (!adminUser.is_admin) {
		throw redirect(303, '/');
	}

	return {
		user: {
			id: adminUser.id,
			email: adminUser.email || '',
			name: adminUser.name || '',
			is_admin: adminUser.is_admin
		}
	};
};
