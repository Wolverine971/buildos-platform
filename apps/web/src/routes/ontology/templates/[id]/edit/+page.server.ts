// apps/web/src/routes/ontology/templates/[id]/edit/+page.server.ts
/**
 * Edit Template Page - Server Load
 * Loads existing template data for editing
 */

import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Check authentication and admin status
	const { user } = await locals.safeGetSession();

	if (!user) {
		throw redirect(302, '/auth/login');
	}

	// Only admins can access template editing
	if (!user.is_admin) {
		throw redirect(302, '/ontology/templates');
	}

	const templateId = params.id;

	// Use admin client to load template and available parents
	const adminClient = createAdminSupabaseClient();

	// Load the template to edit
	const { data: template, error: templateError } = await adminClient
		.from('onto_templates')
		.select('*')
		.eq('id', templateId)
		.single();

	if (templateError || !template) {
		console.error('[Template Edit] Error loading template:', templateError);
		throw error(404, {
			message: 'Template not found'
		});
	}

	// Load all active templates (for parent selection)
	// Exclude the current template and its children to prevent circular references
	const { data: allTemplates, error: templatesError } = await adminClient
		.from('onto_templates')
		.select('id, name, type_key, scope, parent_template_id')
		.eq('status', 'active')
		.order('name');

	if (templatesError) {
		console.error('[Template Edit] Error loading templates:', templatesError);
	}

	// Filter out current template and any templates that have this template as a parent
	// to prevent circular references
	const availableParents = (allTemplates || []).filter(
		(t) => t.id !== templateId && t.parent_template_id !== templateId
	);

	return {
		user,
		template,
		availableParents
	};
};
