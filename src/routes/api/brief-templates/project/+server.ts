// src/routes/api/brief-templates/project/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { data, error } = await supabase
			.from('project_brief_templates')
			.select('*')
			.order('created_at', { ascending: false });

		if (error) throw error;

		return json({ templates: data });
	} catch (error) {
		console.error('Error fetching project brief templates:', error);
		return json({ error: 'Failed to fetch templates' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const templateData = await request.json();

		const { data, error } = await supabase
			.from('project_brief_templates')
			.insert(templateData)
			.select()
			.single();

		if (error) throw error;

		return json({ template: data });
	} catch (error) {
		console.error('Error creating project brief template:', error);
		return json({ error: 'Failed to create template' }, { status: 500 });
	}
};
