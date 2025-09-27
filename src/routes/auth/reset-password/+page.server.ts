// src/routes/auth/reset-password/+page.server.ts
import { redirect, fail } from '@sveltejs/kit';
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
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('confirmPassword') as string;

		if (!password || !confirmPassword) {
			return fail(400, {
				error: 'Password and confirm password are required'
			});
		}

		if (password !== confirmPassword) {
			return fail(400, {
				error: 'Passwords do not match'
			});
		}

		if (password.length < 6) {
			return fail(400, {
				error: 'Password must be at least 6 characters long'
			});
		}

		const { error } = await supabase.auth.updateUser({
			password
		});

		if (error) {
			return fail(400, {
				error: error.message
			});
		}

		throw redirect(303, '/auth/login?message=Password updated successfully');
	}
};
