// apps/web/src/lib/services/ontology/template-props-merger.service.ts
/**
 * Template Props Merger Service
 *
 * Handles template resolution and merging of default props with provided props
 * for all ontology entities (tasks, documents, outputs, plans, goals, etc.)
 *
 * This ensures that when entities are created, they properly inherit
 * default_props from their templates before applying user-provided props.
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { resolveTemplateWithClient } from './template-resolver.service';

export interface TemplatePropsMergeResult {
	mergedProps: Record<string, unknown>;
	templateId?: string;
	templateDefaults?: Record<string, unknown>;
}

/**
 * Resolve template and merge its default_props with provided props
 *
 * @param client - Supabase client for database access
 * @param typeKey - The type_key of the template to resolve
 * @param scope - The scope of the template (task, document, output, etc.)
 * @param providedProps - Props provided by the user/AI
 * @param skipIfNoTemplate - If true, returns providedProps if template not found (default: false)
 * @returns Merged props with template defaults applied first, then overridden by provided props
 */
export async function resolveAndMergeTemplateProps(
	client: TypedSupabaseClient,
	typeKey: string | null | undefined,
	scope: 'project' | 'plan' | 'task' | 'output' | 'document' | 'goal' | 'requirement',
	providedProps: Record<string, unknown> = {},
	skipIfNoTemplate: boolean = false
): Promise<TemplatePropsMergeResult> {
	// If no type_key provided, just return the provided props
	if (!typeKey) {
		return {
			mergedProps: providedProps,
			templateDefaults: {}
		};
	}

	try {
		// Resolve the template with full inheritance chain
		const resolvedTemplate = await resolveTemplateWithClient(client, typeKey, scope);

		// Merge props: template defaults first, then provided props override
		const mergedProps = deepMergeProps(resolvedTemplate.default_props || {}, providedProps);

		return {
			mergedProps,
			templateId: resolvedTemplate.id,
			templateDefaults: resolvedTemplate.default_props || {}
		};
	} catch (error) {
		// If template not found and we should skip, return provided props
		if (
			skipIfNoTemplate &&
			error instanceof Error &&
			error.message.includes('Template not found')
		) {
			console.warn(
				`[TemplatePropsMerger] Template not found for ${typeKey} in scope ${scope}, using provided props only`
			);
			return {
				mergedProps: providedProps,
				templateDefaults: {}
			};
		}

		// Otherwise, propagate the error
		throw error;
	}
}

/**
 * Deep merge props objects, with later sources overriding earlier ones
 * Handles nested objects properly
 */
export function deepMergeProps(
	...sources: Array<Record<string, unknown>>
): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const source of sources) {
		if (!source || typeof source !== 'object') continue;

		for (const [key, value] of Object.entries(source)) {
			const existing = result[key];

			// If both are plain objects, merge recursively
			if (isPlainObject(existing) && isPlainObject(value)) {
				result[key] = deepMergeProps(
					existing as Record<string, unknown>,
					value as Record<string, unknown>
				);
			} else {
				// Otherwise, later value overrides
				result[key] = value;
			}
		}
	}

	return result;
}

/**
 * Check if a value is a plain object (not array, null, Date, etc.)
 */
function isPlainObject(value: unknown): boolean {
	return (
		value !== null &&
		typeof value === 'object' &&
		value.constructor === Object &&
		!Array.isArray(value)
	);
}

/**
 * Batch resolve templates and merge props for multiple entities
 * Useful for bulk creation during project instantiation
 */
export async function batchResolveAndMergeProps<
	T extends { type_key?: string; props?: Record<string, unknown> }
>(
	client: TypedSupabaseClient,
	entities: T[],
	scope: 'project' | 'plan' | 'task' | 'output' | 'document' | 'goal' | 'requirement',
	skipIfNoTemplate: boolean = false
): Promise<Array<T & { mergedProps: Record<string, unknown> }>> {
	const results: Array<T & { mergedProps: Record<string, unknown> }> = [];

	// Process each entity
	for (const entity of entities) {
		const { mergedProps } = await resolveAndMergeTemplateProps(
			client,
			entity.type_key,
			scope,
			entity.props || {},
			skipIfNoTemplate
		);

		results.push({
			...entity,
			mergedProps
		});
	}

	return results;
}

/**
 * Helper to extract facets from props if they exist
 * Used to maintain facet handling consistency
 */
export function extractFacetsFromProps(props: Record<string, unknown>): {
	facets?: Record<string, unknown>;
	propsWithoutFacets: Record<string, unknown>;
} {
	const { facets, ...propsWithoutFacets } = props;

	if (facets && typeof facets === 'object' && !Array.isArray(facets)) {
		return {
			facets: facets as Record<string, unknown>,
			propsWithoutFacets
		};
	}

	return { propsWithoutFacets };
}
