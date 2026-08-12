// apps/web/src/routes/api/time-blocks/create/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { createTimeBlockRuntimeService } from '$lib/server/time-block-runtime.service';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const createTimeBlockSchema = z
	.object({
		block_type: z.enum(['project', 'build']),
		project_id: z.string().nullable().optional(),
		calendar_source_id: z.string().uuid().optional(),
		start_time: z.string().min(1),
		end_time: z.string().min(1),
		timezone: z.string().optional()
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const parsed = await parseJsonRequest(request, createTimeBlockSchema);
	if (!parsed.ok) return parsed.response;
	const payload = parsed.data;

	const { block_type, project_id, calendar_source_id, start_time, end_time, timezone } =
		payload ?? {};

	if (block_type !== 'project' && block_type !== 'build') {
		return ApiResponse.badRequest('Invalid block_type. Expected "project" or "build".');
	}

	if (block_type === 'project' && !project_id) {
		return ApiResponse.badRequest('project_id is required for project blocks.');
	}

	if (!start_time || !end_time) {
		return ApiResponse.badRequest('Missing required fields: start_time, end_time');
	}
	if (calendar_source_id && !isMultiCalendarUserAllowed(user.id, privateEnv)) {
		return ApiResponse.badRequest('Calendar source selection is not enabled for this account.');
	}

	const startDate = new Date(start_time);
	const endDate = new Date(end_time);

	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		return ApiResponse.badRequest('Invalid start_time or end_time.');
	}

	try {
		const timeBlockService = createTimeBlockRuntimeService(supabase, user.id);

		const timeBlock = await timeBlockService.createTimeBlock({
			block_type,
			project_id: project_id ?? null,
			calendar_source_id,
			start_time: startDate,
			end_time: endDate,
			timezone
		});

		return ApiResponse.created({ time_block: timeBlock });
	} catch (error) {
		console.error('[TimeBlocks] Failed to create time block:', error);
		return ApiResponse.internalError(error, 'Failed to create time block');
	}
};
