// apps/web/src/routes/api/time-blocks/delete/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TimeBlockService } from '$lib/services/time-block.service';
import { CalendarService } from '$lib/services/calendar-service';

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
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

		await timeBlockService.deleteTimeBlock(blockId);

		return json({
			success: true,
			message: 'Time block deleted successfully'
		});
	} catch (error) {
		console.error('[TimeBlocks] Failed to delete time block:', error);
		const message = error instanceof Error ? error.message : 'Failed to delete time block';
		return json({ error: message }, { status: 500 });
	}
};
