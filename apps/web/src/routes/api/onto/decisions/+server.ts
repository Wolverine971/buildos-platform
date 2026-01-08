// apps/web/src/routes/api/onto/decisions/+server.ts
/**
 * Decision API Endpoints (GET list, POST create)
 *
 * Handles listing and creating decisions in the ontology system.
 *
 * GET /api/onto/decisions?project_id=X:
 * - Returns all non-deleted decisions for a project
 * - Requires project_id query parameter
 *
 * POST /api/onto/decisions:
 * - Creates a new decision
 * - Required: project_id, title
 * - Optional: description, outcome, rationale, state_key, decision_at, props
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { dev } from '$app/environment';
import { classifyOntologyEntity } from '$lib/server/ontology-classification.service';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';

// GET /api/onto/decisions?project_id=X - List decisions for a project
export const GET: RequestHandler = async ({ url, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const projectId = url.searchParams.get('project_id');
	if (!projectId) {
		return ApiResponse.badRequest('project_id query parameter is required');
	}

	const supabase = locals.supabase;

	try {
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Decisions GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Verify project access
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have access to this project');
		}

		// Fetch decisions
		const { data: decisions, error } = await supabase
			.from('onto_decisions')
			.select('*')
			.eq('project_id', projectId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('[Decisions GET] Error fetching decisions:', error);
			return ApiResponse.error('Failed to fetch decisions', 500);
		}

		return ApiResponse.success({ decisions: decisions || [] });
	} catch (error) {
		console.error('[Decisions GET] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};

// POST /api/onto/decisions - Create a new decision
export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const body = await request.json();
		const {
			project_id,
			title,
			description,
			outcome,
			rationale,
			state_key,
			decision_at,
			parent,
			parents,
			connections
		} = body;
		const classificationSource = body?.classification_source ?? body?.classificationSource;

		// Validate required fields
		if (!project_id) {
			return ApiResponse.badRequest('project_id is required');
		}

		if (!title || typeof title !== 'string' || !title.trim()) {
			return ApiResponse.badRequest('title is required and cannot be empty');
		}

		if (state_key !== undefined && state_key !== null && typeof state_key !== 'string') {
			return ApiResponse.badRequest('state_key must be a string');
		}

		if (description !== undefined && description !== null && typeof description !== 'string') {
			return ApiResponse.badRequest('description must be a string');
		}

		if (outcome !== undefined && outcome !== null && typeof outcome !== 'string') {
			return ApiResponse.badRequest('outcome must be a string');
		}

		if (rationale !== undefined && rationale !== null && typeof rationale !== 'string') {
			return ApiResponse.badRequest('rationale must be a string');
		}

		// Validate state_key if provided
		const validStates = ['pending', 'made', 'deferred', 'reversed'];
		const finalStateKey = state_key || 'pending';
		if (!validStates.includes(finalStateKey)) {
			return ApiResponse.badRequest(
				`Invalid state_key. Must be one of: ${validStates.join(', ')}`
			);
		}

		// Validate decision_at if provided
		let parsedDecisionAt: string | null = null;
		if (decision_at !== undefined && decision_at !== null) {
			if (typeof decision_at !== 'string') {
				return ApiResponse.badRequest('decision_at must be a valid ISO 8601 date');
			}
			const decisionDate = new Date(decision_at);
			if (isNaN(decisionDate.getTime())) {
				return ApiResponse.badRequest('decision_at must be a valid ISO 8601 date');
			}
			parsedDecisionAt = decisionDate.toISOString();
		}

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Decisions POST] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		// Verify project access
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', project_id)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden(
				'You do not have permission to add decisions to this project'
			);
		}

		const explicitParents = toParentRefs({ parent, parents });
		const connectionList: ConnectionRef[] =
			Array.isArray(connections) && connections.length > 0 ? connections : explicitParents;

		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId: project_id,
				refs: connectionList,
				allowProject: true
			});
		}

		// Create the decision
		const insertData: Record<string, unknown> = {
			project_id,
			title: title.trim(),
			state_key: finalStateKey,
			created_by: actorId,
			type_key: 'decision.default',
			props: {}
		};

		if (description !== undefined) {
			insertData.description = description?.trim() || null;
		}

		if (outcome !== undefined) {
			insertData.outcome = outcome?.trim() || null;
		}

		if (rationale !== undefined) {
			insertData.rationale = rationale?.trim() || null;
		}

		if (parsedDecisionAt) {
			insertData.decision_at = parsedDecisionAt;
		}

		const { data: decision, error: insertError } = await supabase
			.from('onto_decisions')
			.insert(insertData)
			.select('*')
			.single();

		if (insertError) {
			console.error('[Decisions POST] Error creating decision:', insertError);
			return ApiResponse.error('Failed to create decision', 500);
		}

		await autoOrganizeConnections({
			supabase,
			projectId: project_id,
			entity: { kind: 'decision', id: decision.id },
			connections: connectionList,
			options: { mode: 'replace' }
		});

		// Log the creation
		logCreateAsync(
			supabase,
			project_id,
			'decision',
			decision.id,
			{ title: decision.title, state_key: decision.state_key },
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		if (classificationSource === 'create_modal') {
			void classifyOntologyEntity({
				entityType: 'decision',
				entityId: decision.id,
				userId: session.user.id,
				classificationSource: 'create_modal'
			}).catch((err) => {
				if (dev) console.warn('[Decision Create] Classification failed:', err);
			});
		}

		return ApiResponse.created({ decision });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('[Decisions POST] Unexpected error:', error);
		return ApiResponse.internalError(error);
	}
};
