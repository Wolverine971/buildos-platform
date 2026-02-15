// apps/web/src/routes/time-blocks/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const actorId = await ensureActorId(supabase, user.id);
	const { data, error: projectsError } = await supabase
		.from('onto_projects')
		.select('id, name, props, state_key')
		.eq('created_by', actorId)
		.eq('state_key', 'active')
		.is('deleted_at', null)
		.order('name', { ascending: true });

	if (projectsError) {
		console.error('[TimeBlocks] Failed to load projects:', projectsError);
		throw error(500, 'Failed to load projects');
	}

	// Check if user has Google Calendar connected
	const calendarService = new CalendarService(supabase);
	const isCalendarConnected = await calendarService.hasValidConnection(user.id);

	const projects = (data ?? []).map((project) => ({
		id: project.id,
		name: project.name,
		calendar_color_id:
			project.props &&
			typeof project.props === 'object' &&
			!Array.isArray(project.props) &&
			typeof (project.props as Record<string, unknown>).calendar_color_id === 'string'
				? ((project.props as Record<string, unknown>).calendar_color_id as string)
				: null
	}));

	return {
		projects,
		isCalendarConnected
	};
};
