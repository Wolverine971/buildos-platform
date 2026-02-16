// apps/web/src/routes/api/onboarding/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { OnboardingServerService } from '$lib/server/onboarding.service';

const VALID_INTENTS = new Set(['organize', 'plan', 'unstuck', 'explore']);
const VALID_STAKES = new Set(['high', 'medium', 'low']);

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
			case 'save_intent_stakes': {
				const { intent, stakes } = body;
				if (!intent || !stakes) {
					return ApiResponse.badRequest('Missing intent or stakes');
				}
				if (!VALID_INTENTS.has(intent) || !VALID_STAKES.has(stakes)) {
					return ApiResponse.badRequest('Invalid intent or stakes value');
				}
				await onboardingService.saveIntentAndStakes(intent, stakes, user.id);
				return ApiResponse.success({ intent, stakes });
			}

			case 'complete_v3': {
				const { onboardingData } = body;
				if (!onboardingData || typeof onboardingData !== 'object') {
					return ApiResponse.badRequest('Invalid onboardingData payload');
				}

				const payload = onboardingData as Record<string, unknown>;
				const intent = payload.intent;
				const stakes = payload.stakes;
				const projectsCreated = payload.projectsCreated;
				const tasksCreated = payload.tasksCreated;
				const goalsCreated = payload.goalsCreated ?? 0;
				const smsEnabled = payload.smsEnabled;
				const emailEnabled = payload.emailEnabled;
				const timeSpentSeconds = payload.timeSpentSeconds;

				if (typeof intent !== 'string' || !VALID_INTENTS.has(intent)) {
					return ApiResponse.badRequest('Invalid intent value');
				}
				if (typeof stakes !== 'string' || !VALID_STAKES.has(stakes)) {
					return ApiResponse.badRequest('Invalid stakes value');
				}
				if (
					typeof projectsCreated !== 'number' ||
					!Number.isFinite(projectsCreated) ||
					projectsCreated < 0
				) {
					return ApiResponse.badRequest('projectsCreated must be a non-negative number');
				}
				if (
					typeof tasksCreated !== 'number' ||
					!Number.isFinite(tasksCreated) ||
					tasksCreated < 0
				) {
					return ApiResponse.badRequest('tasksCreated must be a non-negative number');
				}
				if (
					typeof goalsCreated !== 'number' ||
					!Number.isFinite(goalsCreated) ||
					goalsCreated < 0
				) {
					return ApiResponse.badRequest('goalsCreated must be a non-negative number');
				}
				if (typeof smsEnabled !== 'boolean' || typeof emailEnabled !== 'boolean') {
					return ApiResponse.badRequest('smsEnabled and emailEnabled must be booleans');
				}
				if (
					timeSpentSeconds !== undefined &&
					(typeof timeSpentSeconds !== 'number' ||
						!Number.isFinite(timeSpentSeconds) ||
						timeSpentSeconds < 0)
				) {
					return ApiResponse.badRequest(
						'timeSpentSeconds must be a non-negative number when provided'
					);
				}

				await onboardingService.completeOnboardingV3(user.id, {
					intent,
					stakes,
					projectsCreated,
					tasksCreated,
					goalsCreated,
					smsEnabled,
					emailEnabled,
					timeSpentSeconds
				});
				return ApiResponse.success({ success: true }, 'Onboarding V3 complete');
			}

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
