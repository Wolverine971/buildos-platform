// apps/web/src/routes/onboarding/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// Check if onboarding is already complete (users.onboarding_completed_at).
	// Also load intent/stakes so we can restore state after OAuth redirects.
	const { data: userData } = await supabase
		.from('users')
		.select('onboarding_completed_at, onboarding_intent, onboarding_stakes')
		.eq('id', user.id)
		.single();

	if (userData?.onboarding_completed_at) {
		throw redirect(303, '/');
	}

	// Load user context (used by ProjectsCaptureStep).
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

	return {
		user,
		userContext,
		savedIntent: (userData?.onboarding_intent as string) ?? null,
		savedStakes: (userData?.onboarding_stakes as string) ?? null
	};
};
