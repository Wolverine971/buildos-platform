// apps/web/src/lib/services/ontology/ontology-projects.service.ts
/**
 * Shared helpers for ontology project data used across API routes and page loads.
 */

import { Json } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

export interface OntologyProjectSummary {
	id: string;
	name: string;
	description: string | null;
	type_key: string;
	state_key: string;
	props: Json;
	facet_context: string | null;
	facet_scale: string | null;
	facet_stage: string | null;
	created_at: string;
	updated_at: string;
	task_count: number;
	output_count: number;
}

/**
 * Resolve (or create) the actor id for the given user.
 */
export async function ensureActorId(client: TypedSupabaseClient, userId: string): Promise<string> {
	const { data, error } = await client.rpc('ensure_actor_for_user', {
		p_user_id: userId
	});

	if (error || !data) {
		throw new Error(error?.message || 'Failed to resolve ontology actor for user');
	}

	return data as string;
}

/**
 * Fetch ontology project summaries with aggregated task/output counts.
 * Uses relationship count aggregation to avoid N+1 queries.
 */
export async function fetchProjectSummaries(
	client: TypedSupabaseClient,
	actorId: string
): Promise<OntologyProjectSummary[]> {
	const { data, error } = await client
		.from('onto_projects')
		.select(
			`
			id,
			name,
			description,
			type_key,
			state_key,
			props,
			facet_context,
			facet_scale,
			facet_stage,
			created_at,
			updated_at,
			onto_tasks(count),
			onto_outputs(count)
		`
		)
		.eq('created_by', actorId)
		.order('updated_at', { ascending: false });

	if (error) {
		throw new Error(error.message);
	}

	return (data ?? []).map((project: any) => ({
		id: project.id,
		name: project.name,
		description: project.description ?? null,
		type_key: project.type_key,
		state_key: project.state_key,
		props: project.props as Json,
		facet_context: project.facet_context ?? null,
		facet_scale: project.facet_scale ?? null,
		facet_stage: project.facet_stage ?? null,
		created_at: project.created_at,
		updated_at: project.updated_at,
		task_count: project.onto_tasks?.[0]?.count ?? 0,
		output_count: project.onto_outputs?.[0]?.count ?? 0
	}));
}
