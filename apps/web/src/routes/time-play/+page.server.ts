// apps/web/src/routes/time-play/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CalendarService } from '$lib/services/calendar-service';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// const hasAccess = await isFeatureEnabled(supabase, user.id, 'time_play');
	const hasAccess = true;
	if (!hasAccess) {
		throw redirect(303, '/projects?message=time_play_not_enabled');
	}

	const { data, error: projectsError } = await supabase
		.from('projects')
		.select('id, name, calendar_color_id')
		.eq('user_id', user.id)
		.eq('status', 'active')
		.order('name', { ascending: true });

	if (projectsError) {
		console.error('[TimePlay] Failed to load projects:', projectsError);
		throw error(500, 'Failed to load projects');
	}

	// Check if user has Google Calendar connected
	const calendarService = new CalendarService(supabase);
	const isCalendarConnected = await calendarService.hasValidConnection(user.id);

	return {
		projects: data ?? [],
		isCalendarConnected
	};
};
