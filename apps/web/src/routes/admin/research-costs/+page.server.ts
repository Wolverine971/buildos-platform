// apps/web/src/routes/admin/research-costs/+page.server.ts
//
// What "Find more" research costs: per lookup, per day, people against companies, searches
// against model calls, and what a month would cost at the current pace.
import { redirectToLogin } from '$lib/server/auth-redirects';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listResearchLookups } from '$lib/server/research-costs';
import {
	RESEARCH_COST_DAY_CHOICES,
	researchCostAnswer,
	researchCostDaysFromParam,
	summarizeResearchCosts
} from '$lib/services/admin/research-costs/research-costs';

export const load: PageServerLoad = async ({
	locals: { supabase, safeGetSession },
	url,
	setHeaders
}) => {
	const { user } = await safeGetSession();

	if (!user) {
		redirectToLogin(url);
	}

	const { data: userData } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!userData || !userData.is_admin) {
		throw redirect(303, '/today');
	}

	setHeaders({ 'cache-control': 'private, no-store' });

	const days = researchCostDaysFromParam(url.searchParams.get('days'));
	const { rows, emails, truncated } = await listResearchLookups(days, user.id);
	const summary = summarizeResearchCosts(rows, { days, now: new Date() });

	return {
		days,
		dayChoices: [...RESEARCH_COST_DAY_CHOICES],
		truncated,
		answer: researchCostAnswer(summary),
		summary,
		people: summary.byUser.map((row) => ({
			...row,
			email: emails[row.userId] ?? null,
			you: row.userId === user.id
		})),
		costliest: summary.costliest.map((row) => ({
			...row,
			email: row.userId ? (emails[row.userId] ?? null) : null
		}))
	};
};
