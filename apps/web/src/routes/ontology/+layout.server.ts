// apps/web/src/routes/ontology/+layout.server.ts
/**
 * Ontology Layout Server
 * Ensures user is authenticated to access ontology routes
 */

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

interface OntologyUser {
	id: string;
	email?: string;
	name?: string;
	is_admin?: boolean;
}

export const load: LayoutServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();

	// Check if user is authenticated
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const ontologyUser = user as OntologyUser;

	return {
		user: {
			id: ontologyUser.id,
			email: ontologyUser.email || '',
			name: ontologyUser.name || '',
			is_admin: ontologyUser.is_admin ?? false
		}
	};
};
