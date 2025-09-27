// src/routes/api/templates/+server.ts
import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const templateType = url.searchParams.get('type'); // 'project'

	if (!templateType || !['project'].includes(templateType)) {
		throw error(400, 'Invalid template type. Must be "project"');
	}

	try {
		const tableName = 'project_brief_templates';

		// Get all templates (system templates + user's own templates)
		const { data: templates, error: templateError } = await supabase
			.from(tableName as any)
			.select('*')
			.or(`user_id.is.null,user_id.eq.${user.id}`)
			.order('is_default', { ascending: false })
			.order('name', { ascending: true });

		if (templateError) {
			throw templateError;
		}

		return json({ templates: templates || [] });
	} catch (err) {
		console.error('Error fetching templates:', err);
		throw error(500, 'Failed to fetch templates');
	}
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();
		const { action, type, templateId, name, description, template_content } = body;

		if (!action || !type || !['project'].includes(type)) {
			throw error(400, 'Missing or invalid required fields: action, type');
		}

		const tableName = 'project_brief_templates';

		switch (action) {
			case 'set_in_use': {
				if (!templateId) {
					throw error(400, 'Missing templateId for set_in_use action');
				}

				// Set the specified template as in_use (trigger will handle setting others to false)
				const { data: template, error: updateError } = await supabase
					.from(tableName as any)
					.update({ in_use: true })
					.or(
						`and(id.eq.${templateId},user_id.eq.${user.id}),and(id.eq.${templateId},user_id.is.null)`
					)
					.select()
					.single();

				if (updateError) {
					throw updateError;
				}

				// Log activity
				try {
					await supabase.from('user_activity_logs').insert({
						user_id: user.id,
						activity_type: 'template_set_active',
						metadata: {
							template_id: templateId,
							template_type: type,
							template_name: template?.name
						},
						created_at: new Date().toISOString()
					});
				} catch (logError) {
					console.warn('Failed to log template activation:', logError);
				}

				return json({ template });
			}

			case 'copy': {
				if (!templateId) {
					throw error(400, 'Missing templateId for copy action');
				}

				// Use the database function to copy the template
				const { data: newTemplateId, error: copyError } = await supabase.rpc(
					'copy_template_for_user',
					{
						template_table: tableName,
						template_id: templateId,
						target_user_id: user.id,
						new_name: name
					}
				);

				if (copyError) {
					throw copyError;
				}

				// Get the newly created template
				const { data: newTemplate, error: fetchError } = await supabase
					.from(tableName as any)
					.select('*')
					.eq('id', newTemplateId)
					.single();

				if (fetchError) {
					throw fetchError;
				}

				// Log activity
				try {
					await supabase.from('user_activity_logs').insert({
						user_id: user.id,
						activity_type: 'template_copied',
						metadata: {
							original_template_id: templateId,
							new_template_id: newTemplateId,
							template_type: type,
							template_name: newTemplate?.name
						},
						created_at: new Date().toISOString()
					});
				} catch (logError) {
					console.warn('Failed to log template copy:', logError);
				}

				return json({ template: newTemplate });
			}

			case 'create': {
				if (!name || !template_content) {
					throw error(400, 'Missing required fields for create: name, template_content');
				}

				// Create new template for user
				const { data: template, error: createError } = await supabase
					.from(tableName as any)
					.insert({
						user_id: user.id,
						name: name.trim(),
						description: description?.trim() || '',
						template_content: template_content.trim(),
						in_use: true, // Set as active by default
						is_default: false,
						created_at: new Date().toISOString(),
						updated_at: new Date().toISOString()
					})
					.select()
					.single();

				if (createError) {
					throw createError;
				}

				// Log activity
				try {
					await supabase.from('user_activity_logs').insert({
						user_id: user.id,
						activity_type: 'template_created',
						metadata: {
							template_id: template.id,
							template_type: type,
							template_name: template.name
						},
						created_at: new Date().toISOString()
					});
				} catch (logError) {
					console.warn('Failed to log template creation:', logError);
				}

				return json({ template });
			}

			default:
				throw error(400, 'Invalid action. Must be "set_in_use", "copy", or "create"');
		}
	} catch (err) {
		console.error('Error managing template:', err);
		if (err instanceof Response) {
			throw err;
		}
		throw error(500, 'Failed to manage template');
	}
};

export const PUT: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();
		const { id, type, name, description, template_content } = body;

		if (!id || !type || !['project'].includes(type)) {
			throw error(400, 'Missing or invalid required fields: id, type');
		}

		if (!name || !template_content) {
			throw error(400, 'Missing required fields: name, template_content');
		}

		const tableName = 'project_brief_templates';
		// Update template (only user's own templates)
		const { data: template, error: updateError } = await supabase
			.from(tableName as any)
			.update({
				name: name.trim(),
				description: description?.trim() || '',
				template_content: template_content.trim(),
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.eq('user_id', user.id) // Security: only update user's own templates
			.select()
			.single();

		if (updateError) {
			throw updateError;
		}

		// Log activity
		try {
			await supabase.from('user_activity_logs').insert({
				user_id: user.id,
				activity_type: 'template_updated',
				metadata: {
					template_id: id,
					template_type: type,
					template_name: template.name
				},
				created_at: new Date().toISOString()
			});
		} catch (logError) {
			console.warn('Failed to log template update:', logError);
		}

		return json({ template });
	} catch (err) {
		console.error('Error updating template:', err);
		if (err instanceof Response) {
			throw err;
		}
		throw error(500, 'Failed to update template');
	}
};

export const DELETE: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const templateId = url.searchParams.get('id');
	const type = url.searchParams.get('type');

	if (!templateId || !type || !['project'].includes(type)) {
		throw error(400, 'Missing or invalid required parameters: id, type');
	}

	try {
		const tableName = 'project_brief_templates';

		// Delete template (only user's own templates)
		const { error: deleteError } = await supabase
			.from(tableName as any)
			.delete()
			.eq('id', templateId)
			.eq('user_id', user.id); // Security: only delete user's own templates

		if (deleteError) {
			throw deleteError;
		}

		// Log activity
		try {
			await supabase.from('user_activity_logs').insert({
				user_id: user.id,
				activity_type: 'template_deleted',
				metadata: {
					template_id: templateId,
					template_type: type
				},
				created_at: new Date().toISOString()
			});
		} catch (logError) {
			console.warn('Failed to log template deletion:', logError);
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting template:', err);
		if (err instanceof Response) {
			throw err;
		}
		throw error(500, 'Failed to delete template');
	}
};
