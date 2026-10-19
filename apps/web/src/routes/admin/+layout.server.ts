// apps/web/src/routes/admin/+layout.server.ts
import { redirectToLogin } from '$lib/server/auth-redirects';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { safeGetSession, supabase }, url }) => {
	const { user } = await safeGetSession();
	// Check if user is authenticated
	if (!user) {
		redirectToLogin(url);
	}

	const { data: dbUser, error } = await supabase
		.from('users')
		.select('is_admin, email, name')
		.eq('id', user.id)
		.single();

	if (error || !dbUser?.is_admin) {
		throw redirect(303, '/today');
	}

	return {
		user: {
			id: user.id,
			email: dbUser.email,
			name: dbUser.name,
			is_admin: dbUser.is_admin
		}
	};
};
