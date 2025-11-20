// apps/web/src/lib/server/fsm/actions/create-output.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FSMAction, Facets } from '$lib/types/onto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { TransitionContext } from '../engine';
import type { Json, Database } from '@buildos/shared-types';

type EntityContext = {
	id: string;
	project_id: string;
	type_key: string;
	state_key: string;
};

type TemplateRow = {
	default_props: Record<string, unknown> | null;
	facet_defaults: Facets | null;
};
type OntoEdgeInsert = Database['public']['Tables']['onto_edges']['Insert'];

/**
 * Execute the create_output action by materialising an onto_outputs row and linking it to the source entity.
 */
export async function executeCreateOutputAction(
	action: FSMAction,
	entity: EntityContext,
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<string> {
	if (!action.name || !action.type_key) {
		throw new Error('create_output action requires name and type_key');
	}

	if (!ctx.actor_id) {
		throw new Error('create_output action requires an actor context');
	}

	const client = clientParam ?? createAdminSupabaseClient();

	const template = await loadOutputTemplate(client, action.type_key);

	const templateDefaults = (template?.default_props as Record<string, unknown> | null) ?? {};
	const templateFacets = template?.facet_defaults ?? {};

	const actionProps = (action.props as Record<string, unknown> | undefined) ?? {};
	const mergedProps = deepMerge(templateDefaults, actionProps);
	const stateKey = extractStateKey(mergedProps) ?? 'draft';

	const facetsFromProps = extractFacets(actionProps);
	const facetsFromAction = action.facets ?? facetsFromProps;
	const mergedFacets = mergeFacets(templateFacets, facetsFromAction);

	if (hasFacetValues(mergedFacets)) {
		mergedProps.facets = mergedFacets;
	} else if ('facets' in mergedProps) {
		delete mergedProps.facets;
	}

	// Idempotency: reuse an existing output with the same name/type in the project
	const { data: existingOutput, error: existingOutputError } = await client
		.from('onto_outputs')
		.select('id')
		.eq('project_id', entity.project_id)
		.eq('name', action.name)
		.eq('type_key', action.type_key)
		.limit(1)
		.maybeSingle();

	if (existingOutputError) {
		throw new Error(`Failed to check existing output: ${existingOutputError.message}`);
	}

	let outputId = existingOutput?.id as string | undefined;

	if (!outputId) {
		const { data: output, error: insertError } = await client
			.from('onto_outputs')
			.insert({
				project_id: entity.project_id,
				name: action.name,
				type_key: action.type_key,
				state_key: stateKey,
				props: mergedProps as Json,
				created_by: ctx.actor_id
			})
			.select('id')
			.single();

		if (insertError || !output) {
			throw new Error(`Failed to create output: ${insertError?.message ?? 'Unknown error'}`);
		}

		outputId = output.id;
	}

	await ensureEdge(client, {
		src_kind: 'project',
		src_id: entity.project_id,
		dst_kind: 'output',
		dst_id: outputId,
		rel: 'has_output',
		props: { origin: 'fsm_action' } as Json
	});

	await ensureEdge(client, {
		src_kind: inferEntityKind(entity),
		src_id: entity.id,
		dst_kind: 'output',
		dst_id: outputId,
		rel: 'produces'
	});

	return `create_output(${action.name})`;
}

async function loadOutputTemplate(client: TypedSupabaseClient, typeKey: string) {
	const { data, error } = await client
		.from('onto_templates')
		.select('default_props, facet_defaults')
		.eq('scope', 'output')
		.eq('type_key', typeKey)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to load output template: ${error.message}`);
	}

	return (data as TemplateRow | null) ?? null;
}

function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>
): Record<string, unknown> {
	const result = { ...target };

	for (const [key, value] of Object.entries(source)) {
		const existing = result[key];
		if (isPlainObject(existing) && isPlainObject(value)) {
			result[key] = deepMerge(
				existing as Record<string, unknown>,
				value as Record<string, unknown>
			);
		} else {
			result[key] = value;
		}
	}

	return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractStateKey(props: Record<string, unknown>): string | undefined {
	const state = props['state_key'];
	if (typeof state === 'string') {
		delete props['state_key'];
		return state;
	}
	return undefined;
}

function extractFacets(props: Record<string, unknown>): Facets | undefined {
	const facets = props?.facets;
	if (!facets || typeof facets !== 'object') return undefined;
	const { context, scale, stage } = facets as Facets;
	const candidate: Facets = {};
	if (context) candidate.context = context;
	if (scale) candidate.scale = scale;
	if (stage) candidate.stage = stage;
	return candidate;
}

function mergeFacets(templateFacets: Facets | null, actionFacets: Facets | undefined): Facets {
	const merged: Facets = {};
	if (templateFacets?.context) merged.context = templateFacets.context;
	if (templateFacets?.scale) merged.scale = templateFacets.scale;
	if (templateFacets?.stage) merged.stage = templateFacets.stage;
	if (actionFacets?.context) merged.context = actionFacets.context;
	if (actionFacets?.scale) merged.scale = actionFacets.scale;
	if (actionFacets?.stage) merged.stage = actionFacets.stage;
	return merged;
}

async function ensureEdge(client: TypedSupabaseClient, edge: OntoEdgeInsert): Promise<void> {
	const { data: existing, error: existingError } = await client
		.from('onto_edges')
		.select('id')
		.eq('src_kind', edge.src_kind)
		.eq('src_id', edge.src_id)
		.eq('dst_kind', edge.dst_kind)
		.eq('dst_id', edge.dst_id)
		.eq('rel', edge.rel)
		.limit(1)
		.maybeSingle();

	if (existingError) {
		throw new Error(`Failed to check existing edge (${edge.rel}): ${existingError.message}`);
	}

	if (existing) return;

	const { error: insertError } = await client.from('onto_edges').insert(edge);
	if (insertError) {
		throw new Error(`Failed to create edge (${edge.rel}): ${insertError.message}`);
	}
}

function hasFacetValues(facets: Facets): boolean {
	return Boolean(facets.context || facets.scale || facets.stage);
}

function inferEntityKind(
	entity: EntityContext
): 'project' | 'plan' | 'task' | 'output' | 'document' {
	if (entity.type_key?.startsWith('task.')) return 'task';
	if (entity.type_key?.startsWith('plan.')) return 'plan';
	if (entity.type_key?.startsWith('output.')) return 'output';
	if (entity.type_key?.startsWith('doc.')) return 'document';
	return 'project';
}
