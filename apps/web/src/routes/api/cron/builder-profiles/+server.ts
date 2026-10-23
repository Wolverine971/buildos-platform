// apps/web/src/routes/api/cron/builder-profiles/+server.ts
//
// Daily (vercel.json): keep published builder pages current.
// * Rebuild the build-log rollup for published pages older than ~20 hours.
// * On Fridays, draft the weekly update for published pages that have live projects and
//   weekly drafts turned on (one small model call per page; skipped when nothing moved
//   or drafts from this week are already waiting).

export const config = { maxDuration: 300 };

import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { isAuthorizedCronRequest } from '$lib/utils/security';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import {
	activityIsStale,
	refreshActivity
} from '$lib/server/builder-profile/builder-profile.service';
import { draftWeeklyUpdates } from '$lib/server/builder-profile/builder-profile-drafts';

const MAX_REFRESH = 400;
const MAX_DRAFTS = 60;

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuthorizedCronRequest(request, [env.CRON_SECRET, PRIVATE_CRON_SECRET])) {
		return ApiResponse.unauthorized();
	}
	const admin = createAdminSupabaseClient() as any;
	const now = new Date();
	const forceDrafts = url.searchParams.get('drafts') === '1';

	const { data: profiles, error } = await admin
		.from('builder_profiles')
		.select('user_id, activity_refreshed_at, weekly_drafts')
		.eq('status', 'published')
		.limit(2000);
	if (error) return ApiResponse.databaseError(error);
	const rows = (profiles ?? []) as {
		user_id: string;
		activity_refreshed_at: string | null;
		weekly_drafts: boolean;
	}[];

	let refreshed = 0;
	for (const row of rows.filter((r) => activityIsStale(r.activity_refreshed_at, now.getTime()))) {
		if (refreshed >= MAX_REFRESH) break;
		try {
			await refreshActivity(admin, row.user_id);
			refreshed++;
		} catch (err) {
			console.error('[BuilderProfileCron] refresh failed', row.user_id, err);
		}
	}

	let drafted = 0;
	let draftChecks = 0;
	const isFriday = now.getUTCDay() === 5;
	if (isFriday || forceDrafts) {
		const candidates = rows.filter((r) => r.weekly_drafts).map((r) => r.user_id);
		const { data: live } = candidates.length
			? await admin
					.from('builder_profile_projects')
					.select('user_id')
					.eq('level', 'live')
					.in('user_id', candidates)
			: { data: [] };
		const withLive = [...new Set(((live ?? []) as { user_id: string }[]).map((r) => r.user_id))];
		const weekAgo = new Date(now.getTime() - 6 * 86_400_000).toISOString();
		const { data: recent } = withLive.length
			? await admin
					.from('builder_profile_updates')
					.select('user_id')
					.eq('status', 'drafted')
					.gte('created_at', weekAgo)
					.in('user_id', withLive)
			: { data: [] };
		const alreadyDrafted = new Set(((recent ?? []) as { user_id: string }[]).map((r) => r.user_id));
		const llm = new SmartLLMService({ supabase: admin, appName: 'BuildOS Builder Profile' });
		for (const userId of withLive.filter((id) => !alreadyDrafted.has(id))) {
			if (draftChecks >= MAX_DRAFTS) break;
			draftChecks++;
			try {
				const result = await draftWeeklyUpdates({ llm: llm as any, admin, userId, now });
				if (result.created > 0) drafted++;
			} catch (err) {
				console.error('[BuilderProfileCron] weekly draft failed', userId, err);
			}
		}
	}

	return ApiResponse.success({
		published: rows.length,
		refreshed,
		draft_checks: draftChecks,
		drafted,
		executed_at: now.toISOString()
	});
};
