// apps/web/src/routes/api/time-blocks/blocks/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TimeBlockService } from '$lib/services/time-block.service';
import { CalendarService } from '$lib/services/calendar-service';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const startDateParam = url.searchParams.get('start_date');
	const endDateParam = url.searchParams.get('end_date');

	if (!startDateParam || !endDateParam) {
		return json(
			{ error: 'Missing required query parameters: start_date, end_date' },
			{ status: 400 }
		);
	}

	const startDate = new Date(startDateParam);
	const endDate = new Date(endDateParam);

	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		return json({ error: 'Invalid date range supplied' }, { status: 400 });
	}

	try {
		const calendarService = new CalendarService(supabase);
		const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

		const blocks = await timeBlockService.getTimeBlocks(startDate, endDate);

		return json({
			success: true,
			data: {
				blocks
			}
		});
	} catch (error) {
		console.error('[TimeBlocks] Failed to fetch time blocks:', error);
		return json({ error: 'Failed to fetch time blocks' }, { status: 500 });
	}
};
