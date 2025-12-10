// apps/web/src/lib/services/ontology/template-crud.service.ts
/**
 * Template CRUD Service
 * Business logic for creating, reading, updating, and deleting templates
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { TemplateValidationService, type TemplateData } from './template-validation.service';
import { getGlobalFamilyCache, type EntityScope } from './template-family-cache.service';

export interface CreateTemplateInput extends TemplateData {
	created_by: string;
}

export interface UpdateTemplateInput extends Partial<TemplateData> {
	id: string;
}

export interface TemplateServiceResult<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	validationErrors?: Array<{ field: string; message: string; code: string }>;
}

export class TemplateCrudService {
	/**
	 * Create a new template
	 */
	static async createTemplate(
		client: TypedSupabaseClient,
		input: CreateTemplateInput
	): Promise<TemplateServiceResult> {
		// Validate input
		const validation = await TemplateValidationService.validateTemplate(client, input);
		if (!validation.valid) {
			return {
				success: false,
				error: 'Validation failed',
				validationErrors: validation.errors
			};
		}

		// Prepare template data with defaults
		const templateData = {
			type_key: input.type_key,
			name: input.name,
			scope: input.scope,
			status: input.status || 'draft',
			parent_template_id: input.parent_template_id || null,
			is_abstract: input.is_abstract || false,
			fsm: input.fsm || this.getDefaultFSM(input.type_key),
			schema: input.schema || this.getDefaultSchema(),
			metadata: input.metadata || {},
			default_props: input.default_props || {},
			default_views: Array.isArray(input.default_views) ? input.default_views : [],
			facet_defaults: input.facet_defaults || {},
			created_by: input.created_by
		};

		// Insert into database
		const { data, error } = await client
			.from('onto_templates')
			.insert(templateData)
			.select()
			.single();

		if (error) {
			console.error('[Template CRUD] Error creating template:', error);
			return {
				success: false,
				error: `Failed to create template: ${error.message}`
			};
		}

		// Invalidate family cache so new families/variants are visible immediately
		this.invalidateFamilyCache(client, input.scope as EntityScope);

		return {
			success: true,
			data
		};
	}

	/**
	 * Update an existing template
	 */
	static async updateTemplate(
		client: TypedSupabaseClient,
		input: UpdateTemplateInput
	): Promise<TemplateServiceResult> {
		const { id, ...updates } = input;

		// Get existing template
		const { data: existing, error: fetchError } = await client
			.from('onto_templates')
			.select('*')
			.eq('id', id)
			.single();

		if (fetchError || !existing) {
			return {
				success: false,
				error: 'Template not found'
			};
		}

		// Merge updates with existing data for validation
		const mergedData: TemplateData = {
			type_key: updates.type_key ?? existing.type_key,
			name: updates.name ?? existing.name,
			scope: updates.scope ?? existing.scope,
			status: updates.status ?? existing.status,
			parent_template_id:
				updates.parent_template_id !== undefined
					? updates.parent_template_id
					: existing.parent_template_id,
			is_abstract:
				updates.is_abstract !== undefined ? updates.is_abstract : existing.is_abstract,
			fsm: updates.fsm ?? existing.fsm,
			schema: updates.schema ?? existing.schema,
			metadata: updates.metadata ?? existing.metadata,
			default_props: updates.default_props ?? existing.default_props,
			default_views: Array.isArray(updates.default_views)
				? updates.default_views
				: Array.isArray(existing.default_views)
					? existing.default_views
					: [],
			facet_defaults: updates.facet_defaults ?? existing.facet_defaults
		};

		// Validate merged data
		const validation = await TemplateValidationService.validateTemplate(client, mergedData, id);

		if (!validation.valid) {
			return {
				success: false,
				error: 'Validation failed',
				validationErrors: validation.errors
			};
		}

		// Prepare update data (only include fields that were provided)
		const updateData: any = {
			updated_at: new Date().toISOString()
		};

		if (updates.type_key !== undefined) updateData.type_key = updates.type_key;
		if (updates.name !== undefined) updateData.name = updates.name;
		if (updates.scope !== undefined) updateData.scope = updates.scope;
		if (updates.status !== undefined) updateData.status = updates.status;
		if (updates.parent_template_id !== undefined)
			updateData.parent_template_id = updates.parent_template_id;
		if (updates.is_abstract !== undefined) updateData.is_abstract = updates.is_abstract;
		if (updates.fsm !== undefined) updateData.fsm = updates.fsm;
		if (updates.schema !== undefined) updateData.schema = updates.schema;
		if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
		if (updates.default_props !== undefined) updateData.default_props = updates.default_props;
		if (updates.default_views !== undefined) {
			updateData.default_views = Array.isArray(updates.default_views)
				? updates.default_views
				: [];
		}
		if (updates.facet_defaults !== undefined)
			updateData.facet_defaults = updates.facet_defaults;

		// Update database
		const { data, error } = await client
			.from('onto_templates')
			.update(updateData)
			.eq('id', id)
			.select()
			.single();

		if (error) {
			console.error('[Template CRUD] Error updating template:', error);
			return {
				success: false,
				error: `Failed to update template: ${error.message}`
			};
		}

		// Invalidate family caches for both old and new scopes (if changed)
		const scopesToInvalidate = new Set<EntityScope>();
		if (existing.scope) scopesToInvalidate.add(existing.scope as EntityScope);
		if (mergedData.scope) scopesToInvalidate.add(mergedData.scope as EntityScope);
		for (const scope of scopesToInvalidate) {
			this.invalidateFamilyCache(client, scope);
		}

		return {
			success: true,
			data
		};
	}

	/**
	 * Clone an existing template
	 */
	static async cloneTemplate(
		client: TypedSupabaseClient,
		templateId: string,
		newTypeKey: string,
		newName: string,
		userId: string
	): Promise<TemplateServiceResult> {
		// Get source template
		const { data: source, error: fetchError } = await client
			.from('onto_templates')
			.select('*')
			.eq('id', templateId)
			.single();

		if (fetchError || !source) {
			return {
				success: false,
				error: 'Source template not found'
			};
		}

		// Create new template based on source
		const cloneData: CreateTemplateInput = {
			type_key: newTypeKey,
			name: newName,
			scope: source.scope,
			status: 'draft', // Clones always start as draft
			parent_template_id: source.parent_template_id,
			is_abstract: source.is_abstract ?? false,
			fsm: source.fsm,
			schema: source.schema,
			metadata: {
				...(source.metadata as object),
				cloned_from: source.id,
				cloned_at: new Date().toISOString()
			},
			default_props: source.default_props,
			default_views: Array.isArray(source.default_views) ? source.default_views : [],
			facet_defaults: source.facet_defaults,
			created_by: userId
		};

		return this.createTemplate(client, cloneData);
	}

	/**
	 * Promote template status (draft → active)
	 */
	static async promoteTemplate(
		client: TypedSupabaseClient,
		templateId: string
	): Promise<TemplateServiceResult> {
		// Get current template
		const { data: template, error: fetchError } = await client
			.from('onto_templates')
			.select('*')
			.eq('id', templateId)
			.single();

		if (fetchError || !template) {
			return {
				success: false,
				error: 'Template not found'
			};
		}

		if (template.status === 'active') {
			return {
				success: false,
				error: 'Template is already active'
			};
		}

		if (template.status === 'deprecated') {
			return {
				success: false,
				error: 'Cannot promote deprecated template'
			};
		}

		// Validate template is complete before promoting
		const validation = await TemplateValidationService.validateTemplate(
			client,
			{
				type_key: template.type_key,
				name: template.name,
				scope: template.scope,
				status: 'active',
				parent_template_id: template.parent_template_id,
				is_abstract: template.is_abstract ?? false,
				fsm: template.fsm,
				schema: template.schema,
				metadata: template.metadata,
				default_props: template.default_props,
				default_views: template.default_views,
				facet_defaults: template.facet_defaults
			},
			templateId
		);

		if (!validation.valid) {
			return {
				success: false,
				error: 'Template cannot be promoted due to validation errors',
				validationErrors: validation.errors
			};
		}

		// Update status
		const { data, error } = await client
			.from('onto_templates')
			.update({ status: 'active', updated_at: new Date().toISOString() })
			.eq('id', templateId)
			.select()
			.single();

		if (error) {
			console.error('[Template CRUD] Error promoting template:', error);
			return {
				success: false,
				error: `Failed to promote template: ${error.message}`
			};
		}

		this.invalidateFamilyCache(client, template.scope as EntityScope);

		return {
			success: true,
			data
		};
	}

	/**
	 * Deprecate template (active → deprecated)
	 */
	static async deprecateTemplate(
		client: TypedSupabaseClient,
		templateId: string
	): Promise<TemplateServiceResult> {
		// Check if template can be deprecated
		const canDelete = await TemplateValidationService.canDelete(client, templateId);
		if (!canDelete.valid) {
			return {
				success: false,
				error: 'Template cannot be deprecated',
				validationErrors: canDelete.errors
			};
		}

		// Update status to deprecated
		const { data, error } = await client
			.from('onto_templates')
			.update({
				status: 'deprecated',
				updated_at: new Date().toISOString()
			})
			.eq('id', templateId)
			.select()
			.single();

		if (error) {
			console.error('[Template CRUD] Error deprecating template:', error);
			return {
				success: false,
				error: `Failed to deprecate template: ${error.message}`
			};
		}

		this.invalidateFamilyCache(client, (data as { scope?: string } | null)?.scope as EntityScope);

		return {
			success: true,
			data
		};
	}

	/**
	 * Get count of projects using a template
	 */
	static async getTemplateProjectCount(
		client: TypedSupabaseClient,
		templateId: string
	): Promise<TemplateServiceResult<{ count: number; projectIds: string[] }>> {
		// Get template metadata
		const { data: template, error: templateFetchError } = await client
			.from('onto_templates')
			.select('id, type_key, scope')
			.eq('id', templateId)
			.maybeSingle();

		if (templateFetchError) {
			console.error('[Template CRUD] Failed to load template:', templateFetchError);
			return {
				success: false,
				error: 'Unable to load template'
			};
		}

		if (!template) {
			return {
				success: false,
				error: 'Template not found'
			};
		}

		// Get all projects using this template
		const { data: projects, error: projectsFetchError } = await client
			.from('onto_projects')
			.select('id')
			.eq('type_key', template.type_key);

		if (projectsFetchError) {
			console.error('[Template CRUD] Failed to fetch projects:', projectsFetchError);
			return {
				success: false,
				error: 'Failed to check projects using this template'
			};
		}

		return {
			success: true,
			data: {
				count: projects?.length || 0,
				projectIds: projects?.map((p) => p.id) || []
			}
		};
	}

	/**
	 * Delete template and cascade delete all projects using it
	 */
	static async deleteTemplate(
		client: TypedSupabaseClient,
		templateId: string
	): Promise<TemplateServiceResult> {
		// Get template metadata
		const { data: template, error: templateFetchError } = await client
			.from('onto_templates')
			.select('id, type_key')
			.eq('id', templateId)
			.maybeSingle();

		if (templateFetchError) {
			console.error('[Template CRUD] Failed to load template:', templateFetchError);
			return {
				success: false,
				error: 'Unable to load template'
			};
		}

		if (!template) {
			return {
				success: false,
				error: 'Template not found'
			};
		}

		// Check if template has child templates (cannot delete parent templates)
		const { data: children } = await client
			.from('onto_templates')
			.select('id')
			.eq('parent_template_id', templateId)
			.limit(1);

		if (children && children.length > 0) {
			return {
				success: false,
				error: 'Cannot delete template with child templates',
				validationErrors: [
					{
						field: 'template',
						message: 'Cannot delete template with child templates',
						code: 'HAS_CHILDREN'
					}
				]
			};
		}

		// Get all projects using this template
		const { data: projects, error: projectsFetchError } = await client
			.from('onto_projects')
			.select('id')
			.eq('type_key', template.type_key);

		if (projectsFetchError) {
			console.error('[Template CRUD] Failed to fetch projects:', projectsFetchError);
			return {
				success: false,
				error: 'Failed to check projects using this template'
			};
		}

		// CASCADE DELETE: Delete all projects using this template
		if (projects && projects.length > 0) {
			console.log(
				`[Template CRUD] Cascade deleting ${projects.length} project(s) for template ${templateId}`
			);

			for (const project of projects) {
				const { error: projectDeleteError } = await client.rpc('delete_onto_project', {
					p_project_id: project.id
				});

				if (projectDeleteError) {
					console.error(
						`[Template CRUD] Failed to delete project ${project.id}:`,
						projectDeleteError
					);
					return {
						success: false,
						error: `Failed to delete associated project: ${projectDeleteError.message}`
					};
				}
			}

			console.log(
				`[Template CRUD] Successfully deleted ${projects.length} project(s) for template ${templateId}`
			);
		}

		// Delete template
		const { error } = await client.from('onto_templates').delete().eq('id', templateId);

		if (error) {
			console.error('[Template CRUD] Error deleting template:', error);
			return {
				success: false,
				error: `Failed to delete template: ${error.message}`
			};
		}

		this.invalidateFamilyCache(client, template.scope as EntityScope);

		return {
			success: true,
			data: {
				deletedProjects: projects?.length || 0
			}
		};
	}

	/**
	 * Clear the family cache for a scope so hierarchical selection reflects changes.
	 */
	private static invalidateFamilyCache(client: TypedSupabaseClient, scope?: EntityScope): void {
		if (!scope) return;
		const familyCache = getGlobalFamilyCache(client);
		familyCache.invalidate(scope);
	}

	/**
	 * Get default FSM structure for new templates
	 */
	private static getDefaultFSM(typeKey: string): any {
		return {
			type_key: typeKey,
			states: ['draft', 'active', 'complete'],
			transitions: [
				{
					from: 'draft',
					to: 'active',
					event: 'start',
					guards: [],
					actions: []
				},
				{
					from: 'active',
					to: 'complete',
					event: 'finish',
					guards: [],
					actions: []
				}
			]
		};
	}

	/**
	 * Get default JSON Schema for new templates
	 */
	private static getDefaultSchema(): any {
		return {
			type: 'object',
			properties: {
				title: {
					type: 'string',
					description: 'Title or name'
				},
				description: {
					type: 'string',
					description: 'Detailed description'
				}
			},
			required: ['title']
		};
	}
}
