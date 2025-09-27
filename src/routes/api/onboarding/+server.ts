// src/routes/api/onboarding/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OnboardingServerService } from '$lib/server/onboarding.service';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { action, voiceInput, category, updates } = body;

		if (!action) {
			return json({ error: 'Missing action parameter' }, { status: 400 });
		}

		const onboardingService = new OnboardingServerService(supabase);

		switch (action) {
			case 'save_inputs': {
				if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
					return json({ error: 'Missing updates payload' }, { status: 400 });
				}

				const updatedContext = await onboardingService.saveUserInputs(updates, user.id);
				return json({ success: true, context: updatedContext });
			}

			case 'save_input_only': {
				// Save user input only - for auto-saves
				if (!voiceInput || !category) {
					return json({ error: 'Missing voiceInput or category' }, { status: 400 });
				}

				const updatedContext = await onboardingService.saveUserInputOnly(
					voiceInput,
					category,
					user.id
				);

				return json({ success: true, context: updatedContext });
			}

			case 'summary': {
				// Get user context summary
				const summary = await onboardingService.getUserContextSummary(user.id);
				return json({
					success: true,
					context: summary.context,
					inputs: summary.inputs,
					completionStatus: summary.completionStatus,
					overallProgress: summary.overallProgress
				});
			}

			case 'complete': {
				// Mark onboarding as complete and queue analysis
				await onboardingService.completeOnboarding(user);
				return json({ success: true });
			}

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (error) {
		console.error('Onboarding API error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
};
