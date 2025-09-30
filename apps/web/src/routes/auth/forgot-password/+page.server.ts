// apps/web/src/routes/auth/forgot-password/+page.server.ts
import { redirect, fail } from '@sveltejs/kit';
import { getRedirectURL } from '$lib/supabase';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session } = await safeGetSession();

	if (session) {
		throw redirect(303, '/');
	}
};

export const actions: Actions = {
	default: async ({ request, locals: { supabase } }) => {
		const formData = await request.formData();
		const email = formData.get('email') as string;

		if (!email) {
			return fail(400, {
				error: 'Email is required',
				email
			});
		}

		const { error } = await supabase.auth.resetPasswordForEmail(email, {
			redirectTo: getRedirectURL('/auth/reset-password')
		});

		if (error) {
			return fail(400, {
				error: error.message,
				email
			});
		}

		return {
			success: true,
			message: 'Check your email for a password reset link.'
		};
	}
};
