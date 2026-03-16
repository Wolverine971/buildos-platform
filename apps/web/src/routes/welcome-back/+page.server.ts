// apps/web/src/routes/welcome-back/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

function normalizedStep(value: string | null): '1' | '2' | '3' {
	return value === '2' || value === '3' ? value : '1';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(
			303,
			`/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`
		);
	}

	const continueUrl = new URL('/projects', url.origin);
	for (const [key, value] of url.searchParams.entries()) {
		continueUrl.searchParams.set(key, value);
	}

	return {
		step: normalizedStep(url.searchParams.get('step')),
		continueUrl: `${continueUrl.pathname}${continueUrl.search}`,
		campaignId: url.searchParams.get('campaign_id'),
		cohortId: url.searchParams.get('cohort_id'),
		batchId: url.searchParams.get('batch_id')
	};
};
