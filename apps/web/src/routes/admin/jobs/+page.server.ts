// apps/web/src/routes/admin/jobs/+page.server.ts
//
// Failed background jobs over a window, grouped by job type, with the
// "Run again" allow-list already applied to every row.
import { redirectToLogin } from '$lib/server/auth-redirects';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { failedJobUserEmails, listFailedJobs } from '$lib/server/failed-jobs';
import {
	FAILED_JOB_DAY_CHOICES,
	buildFailedJobGroups,
	failedJobDaysFromParam,
	failedJobsAnswer
} from '$lib/services/admin/failed-jobs/failed-jobs';

export const load: PageServerLoad = async ({
	locals: { supabase, safeGetSession },
	url,
	setHeaders
}) => {
	const { user } = await safeGetSession();

	if (!user) {
		redirectToLogin(url);
	}

	// Check if user is admin
	const { data: userData } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!userData || !userData.is_admin) {
		throw redirect(303, '/today');
	}

	setHeaders({ 'cache-control': 'private, no-store' });

	const days = failedJobDaysFromParam(url.searchParams.get('days'));
	const includeTestAccounts = url.searchParams.get('test') === '1';

	const { rows, truncated } = await listFailedJobs(days);
	const emails = await failedJobUserEmails(rows.map((row) => row.user_id));
	const summary = buildFailedJobGroups(rows, { emails, includeTestAccounts });

	return {
		days,
		dayChoices: [...FAILED_JOB_DAY_CHOICES],
		includeTestAccounts,
		truncated,
		answer: failedJobsAnswer(summary, days),
		total: summary.total,
		rerunnable: summary.rerunnable,
		hiddenTestJobs: summary.hiddenTestJobs,
		groups: summary.groups
	};
};
