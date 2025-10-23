// apps/web/src/routes/api/time-blocks/blocks/[id]/suggestions/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { TimeBlockService } from '$lib/services/time-block.service';

export const POST: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const blockId = params.id;
	if (!blockId) {
		return json({ error: 'Missing time block id' }, { status: 400 });
	}

	try {
		const calendarService = new CalendarService(supabase);
		const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

		const updatedBlock = await timeBlockService.regenerateSuggestions(blockId);

		return json({
			success: true,
			data: {
				time_block: updatedBlock
			}
		});
	} catch (error) {
		console.error('[TimeBlocks] Failed to regenerate suggestions:', error);
		const message =
			error instanceof Error ? error.message : 'Failed to regenerate block suggestions';
		return json({ error: message }, { status: 500 });
	}
};
