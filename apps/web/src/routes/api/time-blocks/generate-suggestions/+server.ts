// apps/web/src/routes/api/time-blocks/generate-suggestions/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { TimeBlockService } from '$lib/services/time-block.service';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let payload: any;
	try {
		payload = await request.json();
	} catch (error) {
		console.error('[TimeBlockSuggestions] Invalid JSON payload:', error);
		return json({ error: 'Invalid JSON payload' }, { status: 400 });
	}

	const timeBlockId = payload?.time_block_id;

	if (typeof timeBlockId !== 'string' || timeBlockId.trim().length === 0) {
		return json({ error: 'time_block_id is required' }, { status: 400 });
	}

	const calendarService = new CalendarService(supabase);
	const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

	try {
		const timeBlock = await timeBlockService.generateSuggestionsForTimeBlock(timeBlockId);

		return json({
			success: true,
			data: {
				time_block: timeBlock
			}
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to generate time-block suggestions';

		if (message === 'Time block not found') {
			return json({ error: message }, { status: 404 });
		}

		if (message === 'Cannot generate suggestions for deleted blocks') {
			return json({ error: message }, { status: 400 });
		}

		return json({ error: message }, { status: 500 });
	}
};
