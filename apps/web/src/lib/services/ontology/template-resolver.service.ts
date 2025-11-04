// apps/web/src/lib/services/ontology/template-resolver.service.ts
/**
 * Template Resolver Service
 *
 * Handles template inheritance resolution for the ontology system.
 * Merges properties from parent templates down to child templates.
 */

import type { Template, FSMDef } from '$lib/types/onto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

export type ResolvedTemplate = {
	id: string;
	scope: string;
	type_key: string;
	name: string;
	status: string;
	parent_template_id: string | null;
	schema: {
		type: string;
		properties: Record<string, unknown>;
		required: string[];
	};
	fsm: FSMDef | null;
	metadata: Record<string, unknown>;
	facet_defaults: Record<string, unknown>;
	default_props: Record<string, unknown>;
	default_views: Array<Record<string, unknown>>;
	is_abstract: boolean;
	inheritance_chain: string[]; // List of type_keys from root to leaf
};

export class TemplateResolverError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TemplateResolverError';
	}
}

/**
 * Resolve a template with full inheritance chain
 * @deprecated Use resolveTemplateWithClient and pass a client explicitly
 */
export async function resolveTemplate(
	clientOrTypeKey: TypedSupabaseClient | string,
	scopeOrTypeKey?: string,
	scopeParam?: string
): Promise<ResolvedTemplate> {
	// Support both old and new signatures for backwards compatibility during migration
	if (typeof clientOrTypeKey === 'string') {
		// Old signature: resolveTemplate(typeKey, scope?)
		throw new Error(
			'resolveTemplate without client parameter is deprecated. Use resolveTemplateWithClient instead.'
		);
	} else {
		// New signature: resolveTemplate(client, typeKey, scope?)
		return resolveTemplateWithClient(clientOrTypeKey, scopeOrTypeKey!, scopeParam);
	}
}

/**
 * Resolve template using provided client (for transaction support)
 */
export async function resolveTemplateWithClient(
	client: TypedSupabaseClient,
	typeKey: string,
	scope?: string
): Promise<ResolvedTemplate> {
	// Get the inheritance chain
	const chain = await getInheritanceChain(client, typeKey, scope);

	if (chain.length === 0) {
		throw new TemplateResolverError(
			`Template not found: ${typeKey}${scope ? ` (scope: ${scope})` : ''}`
		);
	}

	// Start with empty resolved template
	const resolved: ResolvedTemplate = {
		id: '',
		scope: '',
		type_key: '',
		name: '',
		status: 'active',
		parent_template_id: null,
		schema: {
			type: 'object',
			properties: {},
			required: []
		},
		fsm: null,
		metadata: {},
		facet_defaults: {},
		default_props: {},
		default_views: [],
		is_abstract: false,
		inheritance_chain: []
	};

	// Merge from root to leaf (parent properties first, child overrides)
	for (const template of chain.reverse()) {
		// Basic properties (leaf wins)
		resolved.id = template.id;
		resolved.scope = template.scope;
		resolved.type_key = template.type_key;
		resolved.name = template.name;
		resolved.status = template.status;
		resolved.is_abstract = template.is_abstract ?? false;
		resolved.parent_template_id =
			template.parent_template_id !== undefined
				? (template.parent_template_id as string | null)
				: resolved.parent_template_id;

		// Track inheritance chain
		resolved.inheritance_chain.push(template.type_key);

		// Merge schema properties (accumulate from all parents)
		if (template.schema?.properties) {
			resolved.schema.properties = {
				...resolved.schema.properties,
				...template.schema.properties
			};
		}

		// Concatenate required fields (no duplicates)
		if (template.schema?.required && Array.isArray(template.schema.required)) {
			const existingRequired = new Set(resolved.schema.required);
			for (const field of template.schema.required) {
				if (!existingRequired.has(field)) {
					resolved.schema.required.push(field);
					existingRequired.add(field);
				}
			}
		}

		// FSM: Child completely overrides parent (no merging)
		if (template.fsm) {
			resolved.fsm = template.fsm as FSMDef;
		}

		// Metadata: Merge (child wins on conflicts)
		if (template.metadata) {
			resolved.metadata = {
				...resolved.metadata,
				...template.metadata
			};
		}

		// Facet defaults: Merge (child wins on conflicts)
		if (template.facet_defaults) {
			resolved.facet_defaults = {
				...resolved.facet_defaults,
				...template.facet_defaults
			};
		}

		// Default props: Merge (child wins on conflicts)
		if (template.default_props) {
			resolved.default_props = {
				...resolved.default_props,
				...template.default_props
			};
		}

		// Default views: Last template wins (no merging)
		if (template.default_views && Array.isArray(template.default_views)) {
			resolved.default_views = template.default_views;
		}
	}

	return resolved;
}

/**
 * Get the inheritance chain for a template (leaf to root order)
 */
async function getInheritanceChain(
	client: TypedSupabaseClient,
	typeKey: string,
	scope?: string
): Promise<Array<any>> {
	const chain: Array<any> = [];
	const seenIds = new Set<string>();

	// Track what we need to fetch next
	let nextTypeKey: string | null = typeKey;
	let nextScope: string | undefined = scope;
	let nextTemplateId: string | null = null;

	const MAX_DEPTH = 10;
	let depth = 0;

	while (depth < MAX_DEPTH) {
		let query = client.from('onto_templates').select('*');

		if (nextTemplateId) {
			query = query.eq('id', nextTemplateId);
		} else if (nextTypeKey) {
			query = query.eq('type_key', nextTypeKey);
			if (nextScope) {
				query = query.eq('scope', nextScope);
			}
		} else {
			// Nothing else to resolve
			break;
		}

		const { data: template, error } = await query.maybeSingle();

		if (error) {
			const identifier = nextTemplateId ?? nextTypeKey ?? 'unknown';
			throw new TemplateResolverError(
				`Failed to fetch template "${identifier}": ${error.message}`
			);
		}

		if (!template) {
			if (chain.length === 0) {
				const identifier = nextTemplateId ?? nextTypeKey ?? 'unknown';
				throw new TemplateResolverError(`Template not found: ${identifier}`);
			}
			break;
		}

		if (seenIds.has(template.id)) {
			throw new TemplateResolverError(
				`Circular template inheritance detected for ${typeKey}`
			);
		}

		seenIds.add(template.id);
		chain.push(template);

		if (!template.parent_template_id) {
			break;
		}

		nextTemplateId = template.parent_template_id as string;
		nextTypeKey = null; // subsequent lookups by id
		nextScope = undefined;
		depth++;
	}

	if (depth >= MAX_DEPTH) {
		throw new TemplateResolverError(
			`Maximum inheritance depth exceeded for ${typeKey} (possible circular reference)`
		);
	}

	return chain;
}

/**
 * Get all available templates for a given scope with inheritance resolved
 */
export async function getAvailableTemplates(
	client: TypedSupabaseClient,
	scope: string,
	includeAbstract = false
): Promise<ResolvedTemplate[]> {
	// Get all templates for this scope
	const { data: templates, error } = await client
		.from('onto_templates')
		.select('type_key, scope, is_abstract')
		.eq('scope', scope)
		.eq('status', 'active')
		.order('name');

	if (error) {
		throw new TemplateResolverError(`Failed to fetch templates: ${error.message}`);
	}

	const resolved: ResolvedTemplate[] = [];

	for (const template of templates || []) {
		// Skip abstract templates unless requested
		if (template.is_abstract && !includeAbstract) {
			continue;
		}

		try {
			const resolvedTemplate = await resolveTemplateWithClient(
				client,
				template.type_key,
				template.scope
			);
			resolved.push(resolvedTemplate);
		} catch (err) {
			console.error(`Failed to resolve template ${template.type_key}:`, err);
			// Continue with other templates
		}
	}

	return resolved;
}

/**
 * Get text document templates (output.document children)
 */
export async function getTextDocumentTemplates(
	client: TypedSupabaseClient
): Promise<ResolvedTemplate[]> {
	// Get all templates that inherit from output.document
	const { data: baseTemplate } = await client
		.from('onto_templates')
		.select('id')
		.eq('type_key', 'output.document')
		.eq('scope', 'output')
		.maybeSingle();

	if (!baseTemplate) {
		return [];
	}

	// Find all children of output.document
	const { data: templates, error } = await client
		.from('onto_templates')
		.select('type_key, scope')
		.eq('parent_template_id', baseTemplate.id)
		.eq('status', 'active')
		.eq('is_abstract', false) // Only concrete templates
		.order('name');

	if (error || !templates) {
		return [];
	}

	const resolved: ResolvedTemplate[] = [];

	for (const template of templates) {
		try {
			const resolvedTemplate = await resolveTemplateWithClient(
				client,
				template.type_key,
				template.scope
			);
			resolved.push(resolvedTemplate);
		} catch (err) {
			console.error(`Failed to resolve template ${template.type_key}:`, err);
		}
	}

	return resolved;
}

/**
 * Validate that a template exists and can be instantiated
 */
export async function validateTemplateForInstantiation(
	client: TypedSupabaseClient,
	typeKey: string,
	scope: string
): Promise<{ valid: boolean; error?: string }> {
	try {
		const resolved = await resolveTemplateWithClient(client, typeKey, scope);

		if (resolved.is_abstract) {
			return {
				valid: false,
				error: `Template "${typeKey}" is abstract and cannot be instantiated directly. Use a concrete variant instead.`
			};
		}

		return { valid: true };
	} catch (err) {
		return {
			valid: false,
			error: err instanceof Error ? err.message : 'Unknown error'
		};
	}
}
