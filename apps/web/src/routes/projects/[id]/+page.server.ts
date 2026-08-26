// apps/web/src/routes/projects/[id]/+page.server.ts
/**
 * Project Detail - Skeleton-First Loading
 *
 * This page uses a skeleton-first loading strategy for instant perceived performance:
 *
 * 1. WARM NAVIGATION (from /projects or homepage):
 *    - Server returns a lightweight skeleton/access bundle
 *    - Server starts the full-data request and streams its promise to the client
 *
 * 2. COLD LOAD (direct URL, refresh, external link):
 *    - No navigation store data available
 *    - Server calls a skeleton/access RPC (single round-trip that ensures the
 *      actor row and resolves access flags). The classic /old route keeps the
 *      counted skeleton RPC for its count-bearing placeholders.
 *    - Server starts the full-data request while the skeleton renders
 *
 * Performance Targets:
 * - Time to first paint: <100ms (skeleton visible immediately)
 * - Time to interactive: <500ms (full data hydrated)
 * - Layout shift (CLS): 0 (skeleton matches final dimensions)
 *
 * Documentation:
 * - Performance Spec: /apps/web/docs/technical/performance/PROJECT_PAGE_INSTANT_LOAD.md
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 */

import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import type { Database } from '@buildos/shared-types';
import {
	decorateMilestonesWithGoals,
	type GoalMilestoneEdge
} from '$lib/server/milestone-decorators';
import { sanitizeProjectForClient } from '$lib/utils/project-props-sanitizer';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { attachAssigneesToTasks, type TaskAssignee } from '$lib/server/task-assignment.service';
import { attachLastChangedByActorToTasks } from '$lib/server/task-relevance.service';
import { pickStartHereDocument } from '$lib/services/ontology/start-here-selector';
import { requireApiData } from '$lib/utils/api-client-helpers';
import type {
	DeferredProjectFullData,
	ProjectFullData
} from '$lib/components/project/project-page-data-controller';

type GoalRow = Database['public']['Tables']['onto_goals']['Row'];
type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];

const CONTEXT_DOCUMENT_COLUMNS = [
	'archived_at',
	'children',
	'content',
	'created_at',
	'created_by',
	'deleted_at',
	'description',
	'id',
	'project_id',
	'props',
	'state_key',
	'title',
	'type_key',
	'updated_at'
].join(',');

interface ProjectAccessPayload {
	can_edit?: boolean;
	can_admin?: boolean;
	can_invite?: boolean;
	can_view_logs?: boolean;
	is_owner?: boolean;
	is_authenticated?: boolean;
	current_actor_id?: string | null;
}

interface ProjectSkeletonWithAccessResponse {
	id: string;
	name: string;
	description: string | null;
	icon_svg: string | null;
	icon_concept: string | null;
	icon_generated_at: string | null;
	icon_generation_source: 'auto' | 'manual' | null;
	icon_generation_prompt: string | null;
	state_key: string;
	type_key?: string;
	next_step_short: string | null;
	next_step_long: string | null;
	next_step_source: 'ai' | 'user' | null;
	next_step_updated_at: string | null;
	task_count?: number;
	document_count?: number;
	goal_count?: number;
	plan_count?: number;
	milestone_count?: number;
	risk_count?: number;
	image_count?: number;
	access?: ProjectAccessPayload;
	route_access_state?: 'allowed' | 'forbidden' | 'not_found' | 'unauthenticated';
}

/**
 * Skeleton data structure - minimal data for instant rendering
 */
export interface ProjectSkeletonData {
	skeleton: true;
	projectId: string;
	deferredFullData: Promise<DeferredProjectFullData>;
	access: {
		canEdit: boolean;
		canAdmin: boolean;
		canInvite: boolean;
		canViewLogs: boolean;
		isOwner: boolean;
		isAuthenticated: boolean;
		currentActorId: string | null;
	};
	project: {
		id: string;
		name: string;
		description: string | null;
		icon_svg: string | null;
		icon_concept: string | null;
		icon_generated_at: string | null;
		icon_generation_source: 'auto' | 'manual' | null;
		icon_generation_prompt: string | null;
		state_key: string;
		type_key?: string;
		next_step_short: string | null;
		next_step_long: string | null;
		next_step_source: 'ai' | 'user' | null;
		next_step_updated_at: string | null;
	};
	counts: {
		task_count: number;
		document_count: number;
		goal_count: number;
		plan_count: number;
		milestone_count: number;
		risk_count: number;
		image_count: number;
	};
}

function startDeferredFullDataLoad(
	fetch: typeof globalThis.fetch,
	projectId: string
): Promise<DeferredProjectFullData> {
	const request = fetch(`/api/onto/projects/${projectId}/full?profile=v2-initial`);

	return request
		.then(async (response) => {
			const fullData = await requireApiData<ProjectFullData>(
				response,
				'Failed to load project data'
			);
			if (!fullData.project || typeof fullData.project !== 'object') {
				throw new Error('Invalid project data response');
			}
			return { ok: true, data: fullData } as const;
		})
		.catch((cause: unknown) => ({
			ok: false as const,
			error: cause instanceof Error ? cause.message : 'Failed to load project data'
		}));
}

function normalizeAccess(
	access: ProjectAccessPayload | null | undefined,
	isAuthenticated: boolean
): ProjectSkeletonData['access'] {
	return {
		canEdit: Boolean(access?.can_edit),
		canAdmin: Boolean(access?.can_admin),
		canInvite: Boolean(access?.can_invite),
		canViewLogs: Boolean(access?.can_view_logs),
		isOwner: Boolean(access?.is_owner),
		isAuthenticated: Boolean(access?.is_authenticated ?? isAuthenticated),
		currentActorId:
			typeof access?.current_actor_id === 'string' ? access.current_actor_id : null
	};
}

export const load: PageServerLoad = async ({ params, locals, url, fetch }) => {
	const { id } = params;

	if (!id) {
		throw error(400, 'Project ID required');
	}
	if (!isValidUUID(id)) {
		throw error(400, 'Invalid project ID');
	}

	const supabase = locals.supabase;
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();
	const includeSkeletonCounts = url.pathname.endsWith('/old');
	const skeletonRpcName = includeSkeletonCounts
		? 'get_project_skeleton_with_access'
		: 'get_project_skeleton_with_access_v2';

	// Single round-trip: ensures actor, resolves read access, returns skeleton + access.
	const { data: bundleRaw, error: bundleError } = await measure(
		includeSkeletonCounts
			? 'db.project_skeleton_with_access'
			: 'db.project_skeleton_with_access_v2',
		() =>
			(supabase as any).rpc(skeletonRpcName, {
				p_project_id: id
			})
	);

	if (bundleError) {
		console.error('[Project Page] Skeleton+access RPC error:', bundleError);
		// Fall back to full fetch so the page still loads if the RPC misbehaves.
		const { user } = await locals.safeGetSession();
		const isAuthenticated = Boolean(user);
		let fallbackActorId: string | null = null;
		if (user) {
			try {
				fallbackActorId = await measure('db.ensure_actor', () =>
					ensureActorId(supabase, user.id)
				);
			} catch (err) {
				console.error('[Project Page] Failed to get actor ID for fallback:', err);
				throw error(500, 'Failed to resolve user');
			}
		}
		const fallbackData = await measure('db.project_full_fallback', () =>
			loadFullData(id, supabase, fallbackActorId)
		);
		return {
			...fallbackData,
			access: normalizeAccess(
				{
					current_actor_id: fallbackActorId,
					is_authenticated: isAuthenticated
				},
				isAuthenticated
			)
		};
	}

	const bundle = bundleRaw as ProjectSkeletonWithAccessResponse | null;

	if (!bundle) {
		throw error(404, 'Project not found');
	}
	if (bundle.route_access_state === 'forbidden') {
		throw error(403, 'You do not have access to this project.');
	}
	if (bundle.route_access_state === 'unauthenticated') {
		const destination = `${url.pathname}${url.search}`;
		throw redirect(303, `/auth/login?redirect=${encodeURIComponent(destination)}`);
	}
	if (bundle.route_access_state === 'not_found') {
		throw error(404, 'Project not found');
	}

	return {
		skeleton: true,
		projectId: id,
		deferredFullData: startDeferredFullDataLoad(fetch, id),
		project: {
			id: bundle.id,
			name: bundle.name,
			description: bundle.description,
			icon_svg: bundle.icon_svg ?? null,
			icon_concept: bundle.icon_concept ?? null,
			icon_generated_at: bundle.icon_generated_at ?? null,
			icon_generation_source:
				(bundle.icon_generation_source as 'auto' | 'manual' | null | undefined) ?? null,
			icon_generation_prompt: bundle.icon_generation_prompt ?? null,
			state_key: bundle.state_key,
			type_key: bundle.type_key,
			next_step_short: bundle.next_step_short,
			next_step_long: bundle.next_step_long,
			next_step_source: bundle.next_step_source,
			next_step_updated_at: bundle.next_step_updated_at
		},
		counts: {
			task_count: bundle.task_count ?? 0,
			document_count: bundle.document_count ?? 0,
			goal_count: bundle.goal_count ?? 0,
			plan_count: bundle.plan_count ?? 0,
			milestone_count: bundle.milestone_count ?? 0,
			risk_count: bundle.risk_count ?? 0,
			image_count: bundle.image_count ?? 0
		},
		access: normalizeAccess(bundle.access, Boolean(bundle.access?.is_authenticated))
	} satisfies ProjectSkeletonData;
};

/**
 * Fallback: Load full data if the skeleton+access RPC fails.
 * This maintains backward compatibility.
 */
async function loadFullData(
	id: string,
	supabase: App.Locals['supabase'],
	actorId: string | null
): Promise<any> {
	const { data: rawData, error: rpcError } = await supabase.rpc('get_project_full', {
		p_project_id: id,
		p_actor_id: actorId!
	});

	if (rpcError) {
		console.error('[Project Page] Full RPC error:', rpcError);
		throw error(500, 'Failed to load project');
	}

	if (!rawData) {
		throw error(404, 'Project not found');
	}

	const data = rawData as Record<string, any>;
	if (data.project && typeof data.project === 'object') {
		data.project = sanitizeProjectForClient(data.project as Record<string, unknown>);
	}
	if (!data.context_document) {
		const { data: contextDocument, error: contextDocumentError } = await supabase
			.from('onto_documents')
			.select(CONTEXT_DOCUMENT_COLUMNS)
			.eq('project_id', id)
			.eq('type_key', 'document.context.project')
			.is('deleted_at', null)
			.order('updated_at', { ascending: false })
			.limit(20);

		if (contextDocumentError) {
			console.warn(
				'[Project Page] Failed to load context document fallback:',
				contextDocumentError
			);
		} else {
			data.context_document =
				pickStartHereDocument(
					(contextDocument ?? []) as unknown as Array<Record<string, unknown>>
				) ?? null;
		}
	}
	const rawTasks = (data.tasks || []) as Array<{ id: string } & Record<string, unknown>>;
	const goals = (data.goals || []) as GoalRow[];
	const milestones = (data.milestones || []) as MilestoneRow[];

	// Task assignees and last-changed-by actor maps are baked into get_project_full
	// (migration 20260501000002) so the fallback no longer needs extra round-trips.
	const assigneeMap = new Map<string, TaskAssignee[]>();
	const rawAssignees = data.task_assignees as Record<string, TaskAssignee[]> | null | undefined;
	if (rawAssignees) {
		for (const [taskId, assignees] of Object.entries(rawAssignees)) {
			if (Array.isArray(assignees) && assignees.length > 0) {
				assigneeMap.set(taskId, assignees);
			}
		}
	}

	const lastChangedByActorMap = new Map<string, string>();
	const rawLastChanged = data.task_last_changed_by as Record<string, string> | null | undefined;
	if (rawLastChanged) {
		for (const [taskId, actorId] of Object.entries(rawLastChanged)) {
			if (typeof actorId === 'string' && actorId.length > 0) {
				lastChangedByActorMap.set(taskId, actorId);
			}
		}
	}

	const goalMilestoneEdges = (data.goal_milestone_edges ?? []) as GoalMilestoneEdge[];
	const milestoneDecorateResult = await decorateMilestonesWithGoals(
		supabase,
		goals,
		milestones,
		goalMilestoneEdges
	);

	let enrichedTasks: Array<{ id: string } & Record<string, unknown>> = attachAssigneesToTasks(
		rawTasks,
		assigneeMap
	);
	enrichedTasks = attachLastChangedByActorToTasks(enrichedTasks, lastChangedByActorMap);
	data.tasks = enrichedTasks;

	const { milestones: decoratedMilestones } = milestoneDecorateResult;

	// Return full data (legacy format for backward compatibility)
	return {
		skeleton: false,
		projectId: id,
		...data,
		current_actor_id: actorId,
		goals,
		milestones: decoratedMilestones
	};
}
