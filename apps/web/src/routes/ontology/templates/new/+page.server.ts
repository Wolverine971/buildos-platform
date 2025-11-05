// apps/web/src/routes/ontology/templates/new/+page.server.ts
/**
 * New Template Page - Server Load
 * Loads necessary data for template creation form
 */

import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const load: PageServerLoad = async ({ locals }) => {
	// Check authentication and admin status
	const { user } = await locals.safeGetSession();

	if (!user) {
		throw redirect(302, '/auth/login');
	}

	// Only admins can access template creation
	if (!user.is_admin) {
		throw redirect(302, '/ontology/templates');
	}

	// Use admin client to load all templates (for parent selection)
	const adminClient = createAdminSupabaseClient();

	const { data: templates, error } = await adminClient
		.from('onto_templates')
		.select('id, name, type_key, scope')
		.eq('status', 'active')
		.order('name');

	if (error) {
		console.error('[Template Creation] Error loading templates:', error);
	}

	return {
		user,
		availableParents: templates || []
	};
};
