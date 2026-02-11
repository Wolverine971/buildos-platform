// apps/web/src/routes/api/onboarding/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { OnboardingServerService } from '$lib/server/onboarding.service';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const body = await request.json();
		const { action, voiceInput, category, updates } = body;

		if (!action) {
			return ApiResponse.badRequest('Missing action parameter');
		}

		const onboardingService = new OnboardingServerService(supabase);

		switch (action) {
			case 'save_inputs': {
				if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
					return ApiResponse.badRequest('Missing updates payload');
				}

				const updatedContext = await onboardingService.saveUserInputs(updates, user.id);
				return ApiResponse.success({ context: updatedContext });
			}

			case 'save_input_only': {
				// Save user input only - for auto-saves
				if (!voiceInput || !category) {
					return ApiResponse.badRequest('Missing voiceInput or category');
				}

				const updatedContext = await onboardingService.saveUserInputOnly(
					voiceInput,
					category,
					user.id
				);

				return ApiResponse.success({ context: updatedContext });
			}

			case 'summary': {
				// Get user context summary
				const summary = await onboardingService.getUserContextSummary(user.id);
				return ApiResponse.success({
					context: summary.context,
					inputs: summary.inputs,
					completionStatus: summary.completionStatus,
					overallProgress: summary.overallProgress
				});
			}

			case 'complete': {
				// Mark onboarding as complete and queue analysis
				await onboardingService.completeOnboarding(user as any);
				return ApiResponse.success({ success: true }, 'Onboarding complete');
			}

			default:
				return ApiResponse.badRequest('Invalid action');
		}
	} catch (error) {
		console.error('Onboarding API error:', error);
		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Internal server error'
		);
	}
};
