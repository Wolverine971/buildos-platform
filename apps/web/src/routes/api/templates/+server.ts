// apps/web/src/routes/api/templates/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	const templateType = url.searchParams.get('type'); // 'project'

	if (!templateType || !['project'].includes(templateType)) {
		return ApiResponse.badRequest('Invalid template type. Must be "project"');
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
			console.error('Error fetching templates:', templateError);
			return ApiResponse.internalError(templateError, 'Failed to fetch templates');
		}

		return ApiResponse.success({ templates: templates || [] });
	} catch (err) {
		console.error('Error fetching templates:', err);
		return ApiResponse.internalError(err, 'Failed to fetch templates');
	}
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const body = await request.json();
		const { action, type, templateId, name, description, template_content } = body;

		if (!action || !type || !['project'].includes(type)) {
			return ApiResponse.badRequest('Missing or invalid required fields: action, type');
		}

		const tableName = 'project_brief_templates';

		switch (action) {
			case 'set_in_use': {
				if (!templateId) {
					return ApiResponse.badRequest('Missing templateId for set_in_use action');
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
					console.error('Failed to set template active:', updateError);
					return ApiResponse.internalError(updateError, 'Failed to set template active');
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

				return ApiResponse.success({ template });
			}

			case 'copy': {
				if (!templateId) {
					return ApiResponse.badRequest('Missing templateId for copy action');
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
					console.error('Error copying template:', copyError);
					return ApiResponse.internalError(copyError, 'Failed to copy template');
				}

				// Get the newly created template
				const { data: newTemplate, error: fetchError } = await supabase
					.from(tableName as any)
					.select('*')
					.eq('id', newTemplateId)
					.single();

				if (fetchError) {
					console.error('Error fetching copied template:', fetchError);
					return ApiResponse.internalError(fetchError, 'Failed to fetch copied template');
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

				return ApiResponse.success({ template: newTemplate });
			}

			case 'create': {
				if (!name || !template_content) {
					return ApiResponse.badRequest(
						'Missing required fields for create: name, template_content'
					);
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
					console.error('Error creating template:', createError);
					return ApiResponse.internalError(createError, 'Failed to create template');
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

				return ApiResponse.success({ template });
			}

			default:
				return ApiResponse.badRequest(
					'Invalid action. Must be "set_in_use", "copy", or "create"'
				);
		}
	} catch (err) {
		console.error('Error managing template:', err);
		return ApiResponse.internalError(err, 'Failed to manage template');
	}
};

export const PUT: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const body = await request.json();
		const { id, type, name, description, template_content } = body;

		if (!id || !type || !['project'].includes(type)) {
			return ApiResponse.badRequest('Missing or invalid required fields: id, type');
		}

		if (!name || !template_content) {
			return ApiResponse.badRequest('Missing required fields: name, template_content');
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
			console.error('Error updating template:', updateError);
			return ApiResponse.internalError(updateError, 'Failed to update template');
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

		return ApiResponse.success({ template });
	} catch (err) {
		console.error('Error updating template:', err);
		return ApiResponse.internalError(err, 'Failed to update template');
	}
};

export const DELETE: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	const templateId = url.searchParams.get('id');
	const type = url.searchParams.get('type');

	if (!templateId || !type || !['project'].includes(type)) {
		return ApiResponse.badRequest('Missing or invalid required parameters: id, type');
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
			console.error('Error deleting template:', deleteError);
			return ApiResponse.internalError(deleteError, 'Failed to delete template');
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

		return ApiResponse.success({ success: true });
	} catch (err) {
		console.error('Error deleting template:', err);
		return ApiResponse.internalError(err, 'Failed to delete template');
	}
};
