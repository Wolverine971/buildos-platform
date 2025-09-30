// apps/web/src/routes/api/brief-templates/project/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { data, error } = await supabase
			.from('project_brief_templates')
			.select('*')
			.eq('id', params.id)
			.single();

		if (error) throw error;

		return json({ template: data });
	} catch (error) {
		console.error('Error fetching project brief template:', error);
		return json({ error: 'Template not found' }, { status: 404 });
	}
};

export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const updates = await request.json();

		const { data, error } = await supabase
			.from('project_brief_templates')
			.update({ ...updates, updated_at: new Date().toISOString() })
			.eq('id', params.id)
			.select()
			.single();

		if (error) throw error;

		return json({ template: data });
	} catch (error) {
		console.error('Error updating project brief template:', error);
		return json({ error: 'Failed to update template' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { error } = await supabase
			.from('project_brief_templates')
			.delete()
			.eq('id', params.id);

		if (error) throw error;

		return json({ success: true });
	} catch (error) {
		console.error('Error deleting project brief template:', error);
		return json({ error: 'Failed to delete template' }, { status: 500 });
	}
};
