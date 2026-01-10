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
	goal_count: number;
	plan_count: number;
	document_count: number;
	owner_actor_id: string;
	access_role: 'owner' | 'editor' | 'viewer' | null;
	access_level: 'read' | 'write' | 'admin' | null;
	is_shared: boolean;
	// Next step fields for "BuildOS surfaces next moves" feature
	next_step_short: string | null;
	next_step_long: string | null;
	next_step_source: 'ai' | 'user' | null;
	next_step_updated_at: string | null;
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
	const { data: memberRows, error: memberError } = await client
		.from('onto_project_members')
		.select('project_id, role_key, access')
		.eq('actor_id', actorId)
		.is('removed_at', null);

	if (memberError) {
		throw new Error(memberError.message);
	}

	const memberByProject = new Map<string, { role_key: string; access: string }>();
	const memberProjectIds = new Set<string>();

	(memberRows ?? []).forEach((row) => {
		if (!row?.project_id) return;
		memberProjectIds.add(row.project_id);
		if (row.role_key || row.access) {
			memberByProject.set(row.project_id, {
				role_key: row.role_key ?? null,
				access: row.access ?? null
			});
		}
	});

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
			created_by,
			next_step_short,
			next_step_long,
			next_step_source,
			next_step_updated_at,
			onto_tasks(count),
			onto_outputs(count),
			onto_goals(count),
			onto_plans(count),
			onto_documents(count)
		`
		)
		.or(
			memberProjectIds.size > 0
				? `created_by.eq.${actorId},id.in.(${Array.from(memberProjectIds).join(',')})`
				: `created_by.eq.${actorId}`
		)
		.is('deleted_at', null) // Exclude soft-deleted projects
		.is('onto_tasks.deleted_at', null)
		.is('onto_outputs.deleted_at', null)
		.is('onto_goals.deleted_at', null)
		.is('onto_plans.deleted_at', null)
		.is('onto_documents.deleted_at', null)
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
		output_count: project.onto_outputs?.[0]?.count ?? 0,
		goal_count: project.onto_goals?.[0]?.count ?? 0,
		plan_count: project.onto_plans?.[0]?.count ?? 0,
		document_count: project.onto_documents?.[0]?.count ?? 0,
		owner_actor_id: project.created_by,
		access_role:
			(memberByProject.get(project.id)?.role_key as 'owner' | 'editor' | 'viewer' | undefined) ??
			(project.created_by === actorId ? 'owner' : null),
		access_level:
			(memberByProject.get(project.id)?.access as 'read' | 'write' | 'admin' | undefined) ??
			(project.created_by === actorId ? 'admin' : null),
		is_shared: project.created_by !== actorId,
		next_step_short: project.next_step_short ?? null,
		next_step_long: project.next_step_long ?? null,
		next_step_source: project.next_step_source ?? null,
		next_step_updated_at: project.next_step_updated_at ?? null
	}));
}
