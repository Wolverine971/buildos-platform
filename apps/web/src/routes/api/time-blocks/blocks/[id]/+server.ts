// apps/web/src/routes/api/time-blocks/blocks/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { TimeBlockService } from '$lib/services/time-block.service';
import type { UpdateTimeBlockParams } from '@buildos/shared-types';

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const blockId = params.id;
	if (!blockId) {
		return json({ error: 'Missing time block id' }, { status: 400 });
	}

	let body: UpdateTimeBlockParams;
	try {
		body = await request.json();
	} catch (error) {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	// Parse dates if provided
	const updateParams: UpdateTimeBlockParams = {
		...body,
		start_time: body.start_time ? new Date(body.start_time) : undefined,
		end_time: body.end_time ? new Date(body.end_time) : undefined
	};

	try {
		const calendarService = new CalendarService(supabase);
		const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

		const updatedBlock = await timeBlockService.updateTimeBlock(blockId, updateParams);

		return json({
			success: true,
			data: {
				time_block: updatedBlock
			}
		});
	} catch (error) {
		console.error('[TimeBlocks] Failed to update time block:', error);
		const message = error instanceof Error ? error.message : 'Failed to update time block';
		return json({ error: message }, { status: 500 });
	}
};

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
