// src/routes/admin/errors/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// Check if user is admin
	const { data: userData } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!userData || !userData.is_admin) {
		throw redirect(303, '/');
	}

	// Get error logger instance
	const errorLogger = ErrorLoggerService.getInstance(supabase);

	// Load recent unresolved errors and summary by default
	const [errors, summary] = await Promise.all([
		errorLogger.getRecentErrors(50, { resolved: false }), // Only unresolved errors
		errorLogger.getErrorSummary()
	]);

	return {
		errors,
		summary
	};
};
