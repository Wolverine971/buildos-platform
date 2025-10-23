// apps/web/src/routes/time-blocks/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CalendarService } from '$lib/services/calendar-service';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const { data, error: projectsError } = await supabase
		.from('projects')
		.select('id, name, calendar_color_id')
		.eq('user_id', user.id)
		.eq('status', 'active')
		.order('name', { ascending: true });

	if (projectsError) {
		console.error('[TimeBlocks] Failed to load projects:', projectsError);
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
