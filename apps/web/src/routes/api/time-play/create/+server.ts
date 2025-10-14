// apps/web/src/routes/api/time-play/create/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TimeBlockService } from '$lib/services/time-block.service';
import { CalendarService } from '$lib/services/calendar-service';
import { isFeatureEnabled } from '$lib/utils/feature-flags';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const hasAccess = await isFeatureEnabled(supabase, user.id, 'time_play');
	if (!hasAccess) {
		return json({ error: 'Time Play feature not enabled for this user' }, { status: 403 });
	}

	let payload: any;
	try {
		payload = await request.json();
	} catch (err) {
		console.error('[TimePlay] Invalid JSON payload:', err);
		return json({ error: 'Invalid JSON payload' }, { status: 400 });
	}

	const { block_type, project_id, start_time, end_time, timezone } = payload ?? {};

	if (block_type !== 'project' && block_type !== 'build') {
		return json(
			{ error: 'Invalid block_type. Expected "project" or "build".' },
			{ status: 400 }
		);
	}

	if (block_type === 'project' && !project_id) {
		return json({ error: 'project_id is required for project blocks.' }, { status: 400 });
	}

	if (!start_time || !end_time) {
		return json({ error: 'Missing required fields: start_time, end_time' }, { status: 400 });
	}

	const startDate = new Date(start_time);
	const endDate = new Date(end_time);

	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		return json({ error: 'Invalid start_time or end_time.' }, { status: 400 });
	}

	try {
		const calendarService = new CalendarService(supabase);
		const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

		const timeBlock = await timeBlockService.createTimeBlock({
			block_type,
			project_id: project_id ?? null,
			start_time: startDate,
			end_time: endDate,
			timezone
		});

		return json({
			success: true,
			data: {
				time_block: timeBlock
			}
		});
	} catch (error) {
		console.error('[TimePlay] Failed to create time block:', error);
		const message = error instanceof Error ? error.message : 'Failed to create time block';
		return json({ error: message }, { status: 500 });
	}
};
