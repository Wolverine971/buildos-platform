// apps/web/src/routes/api/onto/fsm/transition/+server.ts
/**
 * POST /api/onto/fsm/transition
 * Execute an FSM state transition with guards and actions
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { runTransition } from '$lib/server/fsm/engine';
import { FSMTransitionRequestSchema } from '$lib/types/onto';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Admin-only endpoint
		const { user } = await locals.safeGetSession();
		if (!user || !(user as any).is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		// Parse and validate request
		const body = await request.json();

		const validationResult = FSMTransitionRequestSchema.safeParse(body);
		if (!validationResult.success) {
			const errors = validationResult.error.errors.map(
				(e) => `${e.path.join('.')}: ${e.message}`
			);
			return ApiResponse.badRequest(`Invalid transition request: ${errors.join(', ')}`);
		}

		const transitionRequest = validationResult.data;

		const supabase = locals.supabase;

		// Ensure actor exists for user (call database function)
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[FSM Transition] Failed to ensure actor:', actorError);
			return ApiResponse.error(
				`Failed to ensure actor: ${actorError?.message || 'Unknown error'}`,
				500
			);
		}

		// Execute transition via FSM engine
		const result = await runTransition(
			transitionRequest,
			{
				actor_id: actorId,
				user_id: user.id
			},
			supabase
		);

		if (!result.ok) {
			console.error('[FSM Transition] Failed:', result);
			return ApiResponse.badRequest(result.error, {
				guard_failures: result.guard_failures
			});
		}

		return ApiResponse.success({
			state_after: result.state_after,
			actions_run: result.actions_run
		});
	} catch (err) {
		console.error('[FSM Transition] Unexpected error:', err);
		return ApiResponse.internalError('An unexpected error occurred');
	}
};
