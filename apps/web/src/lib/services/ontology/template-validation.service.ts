// apps/web/src/lib/services/ontology/template-validation.service.ts
/**
 * Template Validation Service
 * Validates template data before create/update operations
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';

export interface ValidationError {
	field: string;
	message: string;
	code: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

export interface TemplateData {
	type_key: string;
	name: string;
	scope: string;
	parent_template_id?: string | null;
	is_abstract?: boolean;
	status: string;
	fsm?: any;
	schema?: any;
	metadata?: any;
	default_props?: any;
	default_views?: any;
	facet_defaults?: any;
}

export class TemplateValidationService {
	/**
	 * Validate complete template data
	 */
	static async validateTemplate(
		client: TypedSupabaseClient,
		data: TemplateData,
		existingTemplateId?: string
	): Promise<ValidationResult> {
		const errors: ValidationError[] = [];

		// Validate basic fields
		this.validateBasicFields(data, errors);

		// Validate type_key uniqueness
		await this.validateTypeKeyUnique(client, data.type_key, existingTemplateId, errors);

		// Validate parent template relationship
		if (data.parent_template_id) {
			await this.validateParentTemplate(
				client,
				data.parent_template_id,
				existingTemplateId,
				errors
			);
		}

		// Validate FSM structure
		if (data.fsm) {
			this.validateFSM(data.fsm, errors);
		}

		// Validate JSON Schema
		if (data.schema) {
			this.validateJsonSchema(data.schema, errors);
		}

		// Validate facet defaults
		if (data.facet_defaults) {
			await this.validateFacetDefaults(client, data.facet_defaults, errors);
		}

		return {
			valid: errors.length === 0,
			errors
		};
	}

	/**
	 * Validate basic required fields
	 */
	private static validateBasicFields(data: TemplateData, errors: ValidationError[]): void {
		// Name is required
		if (!data.name || data.name.trim().length === 0) {
			errors.push({
				field: 'name',
				message: 'Template name is required',
				code: 'REQUIRED_FIELD'
			});
		} else if (data.name.length > 200) {
			errors.push({
				field: 'name',
				message: 'Template name must be 200 characters or less',
				code: 'MAX_LENGTH'
			});
		}

		// Type key is required
		if (!data.type_key || data.type_key.trim().length === 0) {
			errors.push({
				field: 'type_key',
				message: 'Type key is required',
				code: 'REQUIRED_FIELD'
			});
		} else {
			// Type key format validation
			const typeKeyRegex = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
			if (!typeKeyRegex.test(data.type_key)) {
				errors.push({
					field: 'type_key',
					message:
						'Type key must be lowercase, dot-separated (e.g., creative.writing.novel)',
					code: 'INVALID_FORMAT'
				});
			}
		}

		// Scope is required and must be valid
		const validScopes = ['project', 'plan', 'task', 'output', 'document'];
		if (!data.scope) {
			errors.push({
				field: 'scope',
				message: 'Scope is required',
				code: 'REQUIRED_FIELD'
			});
		} else if (!validScopes.includes(data.scope)) {
			errors.push({
				field: 'scope',
				message: `Scope must be one of: ${validScopes.join(', ')}`,
				code: 'INVALID_VALUE'
			});
		}

		// Status is required and must be valid
		const validStatuses = ['draft', 'active', 'deprecated'];
		if (!data.status) {
			errors.push({
				field: 'status',
				message: 'Status is required',
				code: 'REQUIRED_FIELD'
			});
		} else if (!validStatuses.includes(data.status)) {
			errors.push({
				field: 'status',
				message: `Status must be one of: ${validStatuses.join(', ')}`,
				code: 'INVALID_VALUE'
			});
		}
	}

	/**
	 * Validate type_key is unique
	 */
	private static async validateTypeKeyUnique(
		client: TypedSupabaseClient,
		typeKey: string,
		existingTemplateId: string | undefined,
		errors: ValidationError[]
	): Promise<void> {
		const { data, error } = await client
			.from('onto_templates')
			.select('id')
			.eq('type_key', typeKey)
			.limit(1)
			.single();

		if (error && error.code !== 'PGRST116') {
			// PGRST116 = no rows returned, which is what we want
			console.error('[Template Validation] Error checking type_key uniqueness:', error);
			errors.push({
				field: 'type_key',
				message: 'Unable to validate type_key uniqueness',
				code: 'VALIDATION_ERROR'
			});
			return;
		}

		// If we found a template with this type_key
		if (data) {
			// If we're updating an existing template, make sure it's the same one
			if (!existingTemplateId || data.id !== existingTemplateId) {
				errors.push({
					field: 'type_key',
					message: 'A template with this type_key already exists',
					code: 'DUPLICATE_TYPE_KEY'
				});
			}
		}
	}

	/**
	 * Validate parent template exists and no circular relationships
	 */
	private static async validateParentTemplate(
		client: TypedSupabaseClient,
		parentId: string,
		currentTemplateId: string | undefined,
		errors: ValidationError[]
	): Promise<void> {
		// Check if parent exists
		const { data: parent, error } = await client
			.from('onto_templates')
			.select('id, parent_template_id, type_key')
			.eq('id', parentId)
			.single();

		if (error || !parent) {
			errors.push({
				field: 'parent_template_id',
				message: 'Parent template does not exist',
				code: 'INVALID_PARENT'
			});
			return;
		}

		// Check for circular relationships
		if (currentTemplateId) {
			const visited = new Set<string>();
			let currentParent: string | null = parentId;

			while (currentParent && !visited.has(currentParent)) {
				visited.add(currentParent);

				// If we encounter the current template in the parent chain, it's circular
				if (currentParent === currentTemplateId) {
					errors.push({
						field: 'parent_template_id',
						message: 'Circular parent relationship detected',
						code: 'CIRCULAR_PARENT'
					});
					return;
				}

				// Get next parent
				const { data: nextParent } = await client
					.from('onto_templates')
					.select('parent_template_id')
					.eq('id', currentParent)
					.single();

				currentParent = nextParent?.parent_template_id ?? null;
			}
		}
	}

	/**
	 * Validate FSM structure
	 */
	private static validateFSM(fsm: any, errors: ValidationError[]): void {
		if (typeof fsm !== 'object' || fsm === null) {
			errors.push({
				field: 'fsm',
				message: 'FSM must be an object',
				code: 'INVALID_TYPE'
			});
			return;
		}

		// Check for states
		if (!fsm.states || !Array.isArray(fsm.states)) {
			errors.push({
				field: 'fsm.states',
				message: 'FSM must have a states array',
				code: 'REQUIRED_FIELD'
			});
			return;
		}

		if (fsm.states.length === 0) {
			errors.push({
				field: 'fsm.states',
				message: 'FSM must have at least one state',
				code: 'MIN_LENGTH'
			});
			return;
		}

		// Check for initial state
		const hasInitialState = fsm.states.some((state: any) => state.initial === true);
		if (!hasInitialState) {
			errors.push({
				field: 'fsm.states',
				message: 'FSM must have one initial state',
				code: 'MISSING_INITIAL_STATE'
			});
		}

		// Validate state names are unique
		const stateNames = new Set<string>();
		for (const state of fsm.states) {
			if (!state.name) {
				errors.push({
					field: 'fsm.states',
					message: 'All states must have a name',
					code: 'REQUIRED_FIELD'
				});
				continue;
			}

			if (stateNames.has(state.name)) {
				errors.push({
					field: 'fsm.states',
					message: `Duplicate state name: ${state.name}`,
					code: 'DUPLICATE_STATE_NAME'
				});
			}
			stateNames.add(state.name);
		}

		// Validate transitions
		if (fsm.transitions && Array.isArray(fsm.transitions)) {
			for (const transition of fsm.transitions) {
				if (!transition.from || !transition.to || !transition.event) {
					errors.push({
						field: 'fsm.transitions',
						message: 'All transitions must have from, to, and event',
						code: 'INVALID_TRANSITION'
					});
					continue;
				}

				// Check that from and to states exist
				if (!stateNames.has(transition.from)) {
					errors.push({
						field: 'fsm.transitions',
						message: `Transition from state "${transition.from}" does not exist`,
						code: 'INVALID_STATE_REFERENCE'
					});
				}
				if (!stateNames.has(transition.to)) {
					errors.push({
						field: 'fsm.transitions',
						message: `Transition to state "${transition.to}" does not exist`,
						code: 'INVALID_STATE_REFERENCE'
					});
				}
			}
		}
	}

	/**
	 * Validate JSON Schema structure
	 */
	private static validateJsonSchema(schema: any, errors: ValidationError[]): void {
		if (typeof schema !== 'object' || schema === null) {
			errors.push({
				field: 'schema',
				message: 'Schema must be an object',
				code: 'INVALID_TYPE'
			});
			return;
		}

		// Check for required JSON Schema fields
		if (schema.type !== 'object') {
			errors.push({
				field: 'schema.type',
				message: 'Schema type must be "object"',
				code: 'INVALID_SCHEMA_TYPE'
			});
		}

		// If properties exist, validate them
		if (schema.properties) {
			if (typeof schema.properties !== 'object') {
				errors.push({
					field: 'schema.properties',
					message: 'Schema properties must be an object',
					code: 'INVALID_TYPE'
				});
			} else {
				// Validate each property has a type
				for (const [propName, propDef] of Object.entries(schema.properties)) {
					if (typeof propDef !== 'object' || propDef === null || !(propDef as any).type) {
						errors.push({
							field: `schema.properties.${propName}`,
							message: `Property "${propName}" must have a type`,
							code: 'MISSING_PROPERTY_TYPE'
						});
					}
				}
			}
		}

		// If required exists, validate it's an array
		if (schema.required && !Array.isArray(schema.required)) {
			errors.push({
				field: 'schema.required',
				message: 'Schema required must be an array',
				code: 'INVALID_TYPE'
			});
		}
	}

	/**
	 * Validate facet defaults against taxonomy
	 */
	private static async validateFacetDefaults(
		client: TypedSupabaseClient,
		facetDefaults: any,
		errors: ValidationError[]
	): Promise<void> {
		if (typeof facetDefaults !== 'object' || facetDefaults === null) {
			errors.push({
				field: 'facet_defaults',
				message: 'Facet defaults must be an object',
				code: 'INVALID_TYPE'
			});
			return;
		}

		// Get all facet values from taxonomy
		const { data: facetValues, error } = await client
			.from('onto_facet_values')
			.select('facet_key, value');

		if (error) {
			console.error('[Template Validation] Error fetching facet values:', error);
			return; // Skip validation if we can't fetch taxonomy
		}

		// Build lookup map
		const facetMap = new Map<string, Set<string>>();
		for (const fv of facetValues || []) {
			if (!facetMap.has(fv.facet_key)) {
				facetMap.set(fv.facet_key, new Set());
			}
			facetMap.get(fv.facet_key)!.add(fv.value);
		}

		// Validate each facet default
		for (const [facetKey, value] of Object.entries(facetDefaults)) {
			if (!facetMap.has(facetKey)) {
				errors.push({
					field: `facet_defaults.${facetKey}`,
					message: `Unknown facet key: ${facetKey}`,
					code: 'INVALID_FACET_KEY'
				});
				continue;
			}

			const validValues = facetMap.get(facetKey)!;
			if (!validValues.has(value as string)) {
				errors.push({
					field: `facet_defaults.${facetKey}`,
					message: `Invalid value "${value}" for facet ${facetKey}`,
					code: 'INVALID_FACET_VALUE'
				});
			}
		}
	}

	/**
	 * Check if template can be deleted (not in use)
	 */
	static async canDelete(
		client: TypedSupabaseClient,
		templateId: string
	): Promise<ValidationResult> {
		const errors: ValidationError[] = [];

		// Check if template has children
		const { data: children } = await client
			.from('onto_templates')
			.select('id')
			.eq('parent_template_id', templateId)
			.limit(1);

		if (children && children.length > 0) {
			errors.push({
				field: 'template',
				message: 'Cannot delete template with child templates',
				code: 'HAS_CHILDREN'
			});
		}

		// Check if template is used by projects
		const { data: projects } = await client
			.from('onto_projects')
			.select('id')
			.eq('type_key', templateId) // Assuming projects reference type_key
			.limit(1);

		if (projects && projects.length > 0) {
			errors.push({
				field: 'template',
				message: 'Cannot delete template in use by projects',
				code: 'IN_USE_BY_PROJECTS'
			});
		}

		return {
			valid: errors.length === 0,
			errors
		};
	}
}
