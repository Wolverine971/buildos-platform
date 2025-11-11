// apps/web/src/routes/api/onto/goals/[id]/reverse/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { GoalReverseEngineeringService } from '$lib/services/ontology/goal-reverse-engineering.service';
import { GoalReverseContextError, loadGoalReverseContext } from './context';

export const POST: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const goalId = params.id;
	if (!goalId) {
		return ApiResponse.badRequest('Goal ID is required');
	}

	const supabase = locals.supabase;

	try {
		const context = await loadGoalReverseContext(supabase, user.id, goalId);

		const smartLLM = new SmartLLMService({
			supabase,
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Goal Reverse Engineering'
		});
		const reverseEngineeringService = new GoalReverseEngineeringService(smartLLM);

		const generation = await reverseEngineeringService.reverseEngineerGoal({
			userId: user.id,
			project: {
				id: context.project.id,
				name: context.project.name,
				description: context.project.description,
				state_key: context.project.state_key,
				type_key: context.project.type_key,
				props: (context.project.props as Record<string, unknown> | null) ?? null
			},
			goal: {
				id: context.goal.id,
				name: context.goal.name,
				type_key: context.goal.type_key,
				props: (context.goal.props as Record<string, unknown> | null) ?? null
			},
			contextDocument: context.contextDocument,
			existingMilestones: context.existingMilestones,
			existingTasks: context.existingTasks
		});

		return ApiResponse.success({
			goal: {
				id: context.goal.id,
				name: context.goal.name
			},
			preview: generation
		});
	} catch (error) {
		console.error('[Goal Reverse] Preview error:', error);
		if (error instanceof GoalReverseContextError) {
			switch (error.code) {
				case 'GOAL_NOT_FOUND':
					return ApiResponse.notFound('Goal');
				case 'PROJECT_NOT_FOUND':
					return ApiResponse.notFound('Project');
				case 'FORBIDDEN':
					return ApiResponse.forbidden('You do not have access to this goal');
				default:
					return ApiResponse.internalError(
						error,
						'Failed to load reverse engineering context'
					);
			}
		}
		return ApiResponse.internalError(error, 'Failed to generate goal preview');
	}
};
