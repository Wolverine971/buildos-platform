// apps/web/src/routes/onboarding/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// Check if onboarding is already complete (V3 uses users.completed_onboarding, V2 used user_context.onboarding_completed_at)
	const { data: userData } = await supabase
		.from('users')
		.select('completed_onboarding')
		.eq('id', user.id)
		.single();

	if (userData?.completed_onboarding) {
		throw redirect(303, '/');
	}

	// Load user context (used by ProjectsCaptureStep) and check legacy V2 completion
	let userContext = null;
	try {
		const { data, error } = await supabase
			.from('user_context')
			.select('*')
			.eq('user_id', user.id)
			.single();

		if (error && error.code !== 'PGRST116') {
			console.error('Error fetching user context:', error);
		} else {
			userContext = data;
		}
	} catch (error) {
		console.error('Error in onboarding page load:', error);
	}

	// Legacy V2 completion check
	if (userContext?.onboarding_completed_at) {
		throw redirect(303, '/');
	}

	return {
		user,
		userContext
	};
};
