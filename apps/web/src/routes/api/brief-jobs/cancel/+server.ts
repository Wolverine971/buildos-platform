// apps/web/src/routes/api/brief-jobs/cancel/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const cancelBriefJobsSchema = z
	.object({
		briefDate: z.string().min(1),
		jobType: z.string().optional().default('generate_daily_brief')
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const parsed = await parseJsonRequest(request, cancelBriefJobsSchema);
		if (!parsed.ok) return parsed.response;
		const { briefDate, jobType } = parsed.data;

		if (!briefDate) {
			return ApiResponse.error(
				'briefDate is required',
				HttpStatus.BAD_REQUEST,
				ErrorCode.MISSING_FIELD,
				{ field: 'briefDate' }
			);
		}

		// Parse the date and create proper date boundaries
		const date = new Date(briefDate);

		// Validate the date
		if (isNaN(date.getTime())) {
			return ApiResponse.error(
				'Invalid date format',
				HttpStatus.BAD_REQUEST,
				ErrorCode.INVALID_FIELD,
				{ field: 'briefDate' }
			);
		}

		// Create start of day and start of next day in UTC
		const startOfDay = new Date(date);
		startOfDay.setUTCHours(0, 0, 0, 0);

		const startOfNextDay = new Date(date);
		startOfNextDay.setUTCDate(startOfNextDay.getUTCDate() + 1);
		startOfNextDay.setUTCHours(0, 0, 0, 0);

		console.log(
			`Cancelling jobs for ${startOfDay.toISOString()} to ${startOfNextDay.toISOString()}`
		);

		// Update any pending/processing jobs for this date to cancelled
		const { data, error } = await supabase
			.from('queue_jobs')
			.update({
				status: 'cancelled',
				error_message: 'Cancelled by manual generation',
				processed_at: new Date().toISOString()
			})
			.eq('user_id', user.id)
			.eq('job_type', jobType as any)
			.in('status', ['pending', 'processing'])
			.gte('scheduled_for', startOfDay.toISOString())
			.lt('scheduled_for', startOfNextDay.toISOString())
			.select();

		if (error) {
			throw error;
		}

		console.log(`Cancelled ${data?.length || 0} jobs`);

		return ApiResponse.success(
			{
				cancelledCount: data?.length || 0
			},
			'Cancelled scheduled brief jobs'
		);
	} catch (error) {
		console.error('Error cancelling scheduled jobs:', error);
		return ApiResponse.internalError(error, 'Failed to cancel jobs');
	}
};
