// apps/web/src/routes/api/cron/email-project-updates/+server.ts
// Tasker 154 (Gmail half): nightly read of the allowlisted owner's Gmail inboxes → AI Inbox
// "From your email" cards. Off unless EMAIL_PROJECT_UPDATES_USER_IDS names a user (each run is a
// small paid model call). `?dry_run=1` returns the proposals without saving them.
export const config = {
	maxDuration: 300
};

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { GmailReadGateway } from '$lib/server/gmail-read-gateway';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import {
	emailProjectUpdatesUserIds,
	runEmailProjectUpdates,
	type EmailUpdatesRunSummary
} from '$lib/server/email-project-updates.service';

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}
	const dryRun = url.searchParams.get('dry_run') === '1';
	const admin = createAdminSupabaseClient();
	const executedAt = new Date().toISOString();
	const userIds = emailProjectUpdatesUserIds(env.EMAIL_PROJECT_UPDATES_USER_IDS);
	if (!userIds.length) {
		return ApiResponse.success({
			users: 0,
			skipped: 'EMAIL_PROJECT_UPDATES_USER_IDS is empty'
		});
	}

	// Belt and braces: the allowlist must also be admins (Gmail stays invite-only).
	const { data: users } = await admin
		.from('users')
		.select('id, timezone, is_admin')
		.in('id', userIds);
	const allowed = (
		(users ?? []) as Array<{ id: string; timezone: string | null; is_admin: boolean | null }>
	).filter((user) => user.is_admin);

	const gateway = new GmailReadGateway(admin);
	const llm = new SmartLLMService({
		httpReferer: 'https://build-os.com',
		appName: 'BuildOS Email Project Updates',
		supabase: admin
	});
	const results: Array<EmailUpdatesRunSummary & { userId: string }> = [];
	for (const user of allowed) {
		try {
			const summary = await runEmailProjectUpdates({
				admin,
				userId: user.id,
				gateway,
				llm: llm as never,
				dryRun,
				timeZone: user.timezone
			});
			results.push({ ...summary, userId: user.id });
		} catch (error) {
			results.push({
				userId: user.id,
				runId: null,
				status: 'failed',
				windowStart: executedAt,
				windowEnd: executedAt,
				accountsRead: 0,
				accountsFailed: 0,
				emailsRead: 0,
				suggestions: [],
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	const failed = results.filter((result) => result.status === 'failed');
	await admin.from('cron_logs').insert({
		job_name: 'email_project_updates',
		status: failed.length ? 'warning' : 'success',
		message: results
			.map(
				(result) =>
					`${result.status}: ${result.emailsRead} email(s) from ${result.accountsRead} account(s) → ${result.suggestions.length} card(s)${dryRun ? ' (dry run)' : ''}`
			)
			.join('; '),
		error_message: failed.map((result) => result.error).join('; ') || null,
		executed_at: executedAt
	});

	return ApiResponse.success({ users: allowed.length, dry_run: dryRun, results });
};
