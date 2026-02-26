// apps/web/src/lib/services/ontology/ontology-projects.service.ts
/**
 * Shared helpers for ontology project data used across API routes and page loads.
 */

import { Json } from '@buildos/shared-types';
import type { ServerTiming } from '$lib/server/server-timing';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { sanitizeProjectPropsForClient } from '$lib/utils/project-props-sanitizer';

export interface OntologyProjectSummary {
	id: string;
	name: string;
	description: string | null;
	icon_svg: string | null;
	icon_concept: string | null;
	icon_generated_at: string | null;
	icon_generation_source: 'auto' | 'manual' | null;
	icon_generation_prompt: string | null;
	type_key: string;
	state_key: string;
	props: Json;
	facet_context: string | null;
	facet_scale: string | null;
	facet_stage: string | null;
	created_at: string;
	updated_at: string;
	task_count: number;
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

type ProjectSummaryRpcRow = {
	id: string;
	name: string;
	description: string | null;
	icon_svg: string | null;
	icon_concept: string | null;
	icon_generated_at: string | null;
	icon_generation_source: string | null;
	icon_generation_prompt: string | null;
	type_key: string;
	state_key: string;
	props: Json;
	facet_context: string | null;
	facet_scale: string | null;
	facet_stage: string | null;
	created_at: string;
	updated_at: string;
	task_count: number | string | null;
	goal_count: number | string | null;
	plan_count: number | string | null;
	document_count: number | string | null;
	owner_actor_id: string;
	access_role: string | null;
	access_level: string | null;
	is_shared: boolean | null;
	next_step_short: string | null;
	next_step_long: string | null;
	next_step_source: 'ai' | 'user' | null;
	next_step_updated_at: string | null;
};

function toInteger(value: number | string | null | undefined): number {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return Math.max(0, Math.floor(value));
	}
	if (typeof value === 'string') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return Math.max(0, Math.floor(parsed));
		}
	}
	return 0;
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
 * Fetch ontology project summaries with aggregated task counts.
 * Uses relationship count aggregation to avoid N+1 queries.
 */
export async function fetchProjectSummaries(
	client: TypedSupabaseClient,
	actorId: string,
	timing?: ServerTiming
): Promise<OntologyProjectSummary[]> {
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		timing ? timing.measure(name, fn) : fn();

	// Preferred path: single RPC performs summary + latest-activity aggregation server-side.
	// If the migration is not present yet, fall back to the legacy multi-query path below.
	const { data: rpcRows, error: rpcError } = await measure('db.projects.summary_rpc', () =>
		client.rpc('get_onto_project_summaries_v1', {
			p_actor_id: actorId
		})
	);

	if (!rpcError && Array.isArray(rpcRows)) {
		return (rpcRows as ProjectSummaryRpcRow[]).map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description ?? null,
			icon_svg: row.icon_svg ?? null,
			icon_concept: row.icon_concept ?? null,
			icon_generated_at: row.icon_generated_at ?? null,
			icon_generation_source:
				row.icon_generation_source === 'auto' || row.icon_generation_source === 'manual'
					? row.icon_generation_source
					: null,
			icon_generation_prompt: row.icon_generation_prompt ?? null,
			type_key: row.type_key,
			state_key: row.state_key,
			props: sanitizeProjectPropsForClient(
				(row.props ?? {}) as Record<string, unknown>
			) as Json,
			facet_context: row.facet_context ?? null,
			facet_scale: row.facet_scale ?? null,
			facet_stage: row.facet_stage ?? null,
			created_at: row.created_at,
			updated_at: row.updated_at,
			task_count: toInteger(row.task_count),
			goal_count: toInteger(row.goal_count),
			plan_count: toInteger(row.plan_count),
			document_count: toInteger(row.document_count),
			owner_actor_id: row.owner_actor_id,
			access_role:
				row.access_role === 'owner' ||
				row.access_role === 'editor' ||
				row.access_role === 'viewer'
					? row.access_role
					: null,
			access_level:
				row.access_level === 'read' ||
				row.access_level === 'write' ||
				row.access_level === 'admin'
					? row.access_level
					: null,
			is_shared: Boolean(row.is_shared),
			next_step_short: row.next_step_short ?? null,
			next_step_long: row.next_step_long ?? null,
			next_step_source: row.next_step_source ?? null,
			next_step_updated_at: row.next_step_updated_at ?? null
		}));
	}

	if (rpcError) {
		console.warn('[Ontology Projects] Falling back to legacy summaries query path:', rpcError);
	}

	const pickLatestTimestamp = (
		...timestamps: Array<string | null | undefined>
	): string | null => {
		let latest: string | null = null;
		let latestMs = Number.NEGATIVE_INFINITY;

		for (const timestamp of timestamps) {
			if (!timestamp) continue;
			const parsed = Date.parse(timestamp);
			if (Number.isNaN(parsed)) continue;
			if (parsed > latestMs) {
				latestMs = parsed;
				latest = timestamp;
			}
		}

		return latest;
	};

	const { data: memberRows, error: memberError } = await measure('db.project_members.list', () =>
		client
			.from('onto_project_members')
			.select('project_id, role_key, access')
			.eq('actor_id', actorId)
			.is('removed_at', null)
	);

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

	const { data, error } = await measure('db.projects.summary', () =>
		client
			.from('onto_projects')
			.select(
				`
			id,
			name,
			description,
			icon_svg,
			icon_concept,
			icon_generated_at,
			icon_generation_source,
			icon_generation_prompt,
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
			.is('onto_goals.deleted_at', null)
			.is('onto_plans.deleted_at', null)
			.is('onto_documents.deleted_at', null)
			.order('created_at', { ascending: false })
	);

	if (error) {
		throw new Error(error.message);
	}

	const projectIds = (data ?? []).map((project: any) => project.id).filter(Boolean) as string[];

	type EntityTable = 'onto_tasks' | 'onto_goals' | 'onto_plans' | 'onto_documents';
	const fetchLatestEntityUpdates = async (table: EntityTable): Promise<Map<string, string>> => {
		if (projectIds.length === 0) return new Map();

		const { data: rows, error: rowsError } = await measure(`db.${table}.latest_updates`, () =>
			client
				.from(table)
				.select('project_id, updated_at, created_at')
				.in('project_id', projectIds)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false })
				.order('created_at', { ascending: false })
		);

		if (rowsError) {
			throw new Error(rowsError.message);
		}

		const latestByProject = new Map<string, string>();
		for (const row of rows ?? []) {
			const projectId = (row as any)?.project_id as string | undefined;
			const updatedAt = (row as any)?.updated_at as string | null | undefined;
			const createdAt = (row as any)?.created_at as string | null | undefined;
			const rowTimestamp = updatedAt ?? createdAt;
			if (!projectId || !rowTimestamp || latestByProject.has(projectId)) continue;
			latestByProject.set(projectId, rowTimestamp);
		}

		return latestByProject;
	};

	const [latestTaskUpdates, latestGoalUpdates, latestPlanUpdates, latestDocumentUpdates] =
		await Promise.all([
			fetchLatestEntityUpdates('onto_tasks').catch((queryError) => {
				console.error(
					'[Ontology Projects] Failed to compute latest task updates:',
					queryError
				);
				return new Map<string, string>();
			}),
			fetchLatestEntityUpdates('onto_goals').catch((queryError) => {
				console.error(
					'[Ontology Projects] Failed to compute latest goal updates:',
					queryError
				);
				return new Map<string, string>();
			}),
			fetchLatestEntityUpdates('onto_plans').catch((queryError) => {
				console.error(
					'[Ontology Projects] Failed to compute latest plan updates:',
					queryError
				);
				return new Map<string, string>();
			}),
			fetchLatestEntityUpdates('onto_documents').catch((queryError) => {
				console.error(
					'[Ontology Projects] Failed to compute latest document updates:',
					queryError
				);
				return new Map<string, string>();
			})
		]);

	return (data ?? []).map((project: any) => ({
		id: project.id,
		name: project.name,
		description: project.description ?? null,
		icon_svg: project.icon_svg ?? null,
		icon_concept: project.icon_concept ?? null,
		icon_generated_at: project.icon_generated_at ?? null,
		icon_generation_source:
			(project.icon_generation_source as 'auto' | 'manual' | undefined) ?? null,
		icon_generation_prompt: project.icon_generation_prompt ?? null,
		type_key: project.type_key,
		state_key: project.state_key,
		props: sanitizeProjectPropsForClient(project.props) as Json,
		facet_context: project.facet_context ?? null,
		facet_scale: project.facet_scale ?? null,
		facet_stage: project.facet_stage ?? null,
		created_at: project.created_at,
		// Dashboard "last updated" should reflect project work activity, not automation
		// side effects (e.g. daily brief / next-step updates on onto_projects itself).
		updated_at:
			pickLatestTimestamp(
				latestTaskUpdates.get(project.id),
				latestGoalUpdates.get(project.id),
				latestPlanUpdates.get(project.id),
				latestDocumentUpdates.get(project.id),
				project.created_at
			) ?? project.created_at,
		task_count: project.onto_tasks?.[0]?.count ?? 0,
		goal_count: project.onto_goals?.[0]?.count ?? 0,
		plan_count: project.onto_plans?.[0]?.count ?? 0,
		document_count: project.onto_documents?.[0]?.count ?? 0,
		owner_actor_id: project.created_by,
		access_role:
			(memberByProject.get(project.id)?.role_key as
				| 'owner'
				| 'editor'
				| 'viewer'
				| undefined) ?? (project.created_by === actorId ? 'owner' : null),
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
