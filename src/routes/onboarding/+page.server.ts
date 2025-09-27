// src/routes/onboarding/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	let userContext = null;

	try {
		// Load existing user context
		const { data, error: contextError } = await supabase
			.from('user_context')
			.select('*')
			.eq('user_id', user.id)
			.single();

		// Only log error if it's not "no rows found"
		if (contextError && contextError.code !== 'PGRST116') {
			console.error('Error fetching user context:', contextError);
		} else {
			userContext = data;
		}
	} catch (error) {
		console.error('Error in onboarding page load:', error);
		// Continue with null userContext - don't break the page
	}

	// Calculate progress based on input fields
	const calculateProgress = (context: any) => {
		if (!context) {
			return { progress: 0, completed: false };
		}

		const inputFields = [
			'input_projects',
			'input_work_style',
			'input_challenges',
			'input_help_focus'
		];

		const completedFields = inputFields.filter((field) => {
			const value = context[field];
			return value && typeof value === 'string' && value.trim().length > 0;
		});

		const progress = Math.round((completedFields.length / inputFields.length) * 100);
		const isCompleted = !!context.onboarding_completed_at;

		return { progress, completed: isCompleted };
	};

	const progressData = calculateProgress(userContext);

	// Check for completion redirect
	if (
		progressData.completed &&
		userContext?.onboarding_completed_at &&
		progressData.progress === 100
	) {
		throw redirect(303, '/');
	}

	// Find the first empty step as recommended starting point
	let recommendedStep = 0;
	if (userContext) {
		const inputFields = [
			'input_projects',
			'input_work_style',
			'input_challenges',
			'input_help_focus'
		];

		for (let i = 0; i < inputFields.length; i++) {
			const field = inputFields[i];
			const hasContent = !!(
				userContext[field] &&
				typeof userContext[field] === 'string' &&
				userContext[field].trim().length > 0
			);

			if (!hasContent) {
				recommendedStep = i;
				break;
			}
		}
	}

	return {
		user,
		userContext,
		progressData,
		recommendedStep
	};
};
