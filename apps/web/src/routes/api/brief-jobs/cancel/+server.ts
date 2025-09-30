// apps/web/src/routes/api/brief-jobs/cancel/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { briefDate, jobType = 'generate_daily_brief' } = await request.json();

		if (!briefDate) {
			return json({ error: 'briefDate is required' }, { status: 400 });
		}

		// Parse the date and create proper date boundaries
		const date = new Date(briefDate);

		// Validate the date
		if (isNaN(date.getTime())) {
			return json({ error: 'Invalid date format' }, { status: 400 });
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
			.eq('job_type', jobType)
			.in('status', ['pending', 'processing'])
			.gte('scheduled_for', startOfDay.toISOString())
			.lt('scheduled_for', startOfNextDay.toISOString())
			.select();

		if (error) {
			throw error;
		}

		console.log(`Cancelled ${data?.length || 0} jobs`);

		return json({
			success: true,
			cancelledCount: data?.length || 0
		});
	} catch (error) {
		console.error('Error cancelling scheduled jobs:', error);
		return json({ error: 'Failed to cancel jobs' }, { status: 500 });
	}
};
